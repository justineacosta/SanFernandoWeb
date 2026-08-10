"use server";

import { z } from "zod";
import type {
  TicketAttachment,
  TicketKind,
  TicketLookupResult,
  TicketStatus,
  TicketUpdateEntry,
} from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDate, toManilaDate } from "@/lib/format";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { canReply, recordTicketUpdate, REPLY_RETURN_STATUS } from "@/lib/ticket-updates";
import { discardTicketAttachment, uploadTicketAttachment } from "@/lib/media";
import { MAX_TICKET_FILES } from "@/lib/storage";

export interface LookupResult {
  error: string | null;
  ticket: TicketLookupResult | null;
}

/** Ticket numbers are sequential and guessable; the last name is the privacy gate. */
const LOOKUP_LIMIT = 10;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;

/** One message for "wrong number" and "wrong name" alike — never confirm a ticket exists. */
const NOT_FOUND = "We could not find that ticket. Check the number and the last name you used.";

/**
 * Compare surnames the way a resident expects: case- and whitespace-insensitive,
 * and NFC-normalised. That last part is not academic here — "Peña" and "Nuñez"
 * are ordinary Ilocano surnames, and an ñ typed on one keyboard can arrive
 * decomposed (n + combining tilde) while the stored one is composed. The two are
 * the same name and must match; without normalising, the real owner is locked out.
 */
function sameSurname(a: string, b: string): boolean {
  const normalize = (value: string) => value.trim().normalize("NFC").toLocaleLowerCase("en-US");
  return normalize(a) === normalize(b);
}

/**
 * Public ticket lookup. Requires the ticket number AND a matching last name
 * (spec §3) — the number alone is guessable. Rate-limited against enumeration.
 * Plan 2C: resolves all four ticket kinds through the `tickets_view` union;
 * each kind's extras are loaded separately by `loadExtras` so a complaint's
 * narrative, respondent and location can never leak into the public result.
 */
export async function lookupTicket(
  ticketNo: string,
  lastName: string,
  turnstileToken: string | null,
): Promise<LookupResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticket: null };
  }
  if (!(await checkRateLimit(`track:${ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW_MS))) {
    return { error: "Too many lookups. Please wait a few minutes and try again.", ticket: null };
  }

  const ticket = ticketNo.trim().toUpperCase();
  const surname = lastName.trim();
  if (!ticket || !surname) {
    return { error: "Enter both your ticket number and last name.", ticket: null };
  }

  const admin = createSupabaseAdminClient();
  // Resolve the ticket through the union view: the prefix already tells the kinds
  // apart, and this keeps one round-trip for the privacy gate regardless of type.
  // Fetch by ticket number alone (it is unique), then match the last name here —
  // see the note above sameSurname for why the name never goes into the query.
  const { data, error } = await admin
    .from("tickets_view")
    .select(TICKET_VIEW_COLUMNS)
    .eq("ticket_no", ticket)
    .maybeSingle();

  if (error) {
    console.error("lookupTicket failed:", error.message);
    return { error: "Something went wrong. Please try again.", ticket: null };
  }
  // One message for "no such ticket" and "wrong name" alike.
  if (!data || !sameSurname(data.last_name, surname)) {
    return { error: NOT_FOUND, ticket: null };
  }

  return { error: null, ticket: await buildTicketResult(admin, data) };
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Row shape shared by lookupTicket's initial fetch and submitTicketReply's post-reply refresh. */
interface TicketViewRow {
  ticket_no: string;
  kind: string;
  first_name: string;
  last_name: string;
  status: string;
  remarks: string | null;
  created_at: string;
  reviewed_at: string | null;
  closed_at: string | null;
}

const TICKET_VIEW_COLUMNS =
  "ticket_no, kind, first_name, last_name, status, remarks, created_at, reviewed_at, closed_at";

/**
 * Builds the public `TicketLookupResult` from one `tickets_view` row. Shared by
 * `lookupTicket` and `submitTicketReply` (the latter calls it again after the
 * status update, so the returned ticket reflects the new status) — extracted
 * so the two never drift into building the shape differently.
 */
async function buildTicketResult(admin: AdminClient, row: TicketViewRow): Promise<TicketLookupResult> {
  const kind = row.kind as TicketKind;
  const base = {
    kind,
    ticketNo: row.ticket_no,
    applicantName: `${row.first_name} ${row.last_name}`,
    status: row.status as TicketStatus,
    submittedAt: toManilaDate(row.created_at),
    reviewedAt: row.reviewed_at ? toManilaDate(row.reviewed_at) : null,
    closedAt: row.closed_at ? toManilaDate(row.closed_at) : null,
    remarks: row.remarks,
    requirements: [] as string[],
    scheduleNote: null as string | null,
  };

  const [extras, timeline] = await Promise.all([
    loadExtras(admin, kind, row.ticket_no),
    loadTimeline(admin, row.ticket_no),
  ]);
  return { ...base, ...extras, timeline, repliable: canReply(base.status) };
}

/**
 * Resident-visible log entries for a ticket that has already passed the surname
 * gate. The `.eq("visibility","public")` filter is the ENTIRE guarantee that a
 * complaint's internal staff coordination never reaches the reporter — it lives
 * here, in the query, not in the component that renders the result.
 *
 * `author_name` is deliberately NOT selected. This is an anonymous endpoint, so
 * every column named here ships in the response body whether or not anything
 * renders it; the timeline speaks as the barangay, not as a named staff member.
 * Do not add it back to satisfy a type — the public type has no field for it.
 */
async function loadTimeline(admin: AdminClient, ticketNo: string): Promise<TicketUpdateEntry[]> {
  const { data, error } = await admin
    .from("ticket_updates")
    .select("id, entry_type, status, body, author_kind, attachments, created_at")
    .eq("ticket_no", ticketNo)
    .eq("visibility", "public")
    .order("created_at", { ascending: true })
    // Tiebreaker, same reason /news, /notices and /events carry one:
    // postTicketUpdate writes two rows back to back, and on a timestamp
    // collision their order would otherwise be unstable.
    .order("id", { ascending: true });
  if (error || !data) {
    if (error) console.error("loadTimeline failed:", error.message);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    entryType: row.entry_type as TicketUpdateEntry["entryType"],
    status: (row.status as TicketStatus | null) ?? null,
    body: row.body,
    authorKind: row.author_kind as TicketUpdateEntry["authorKind"],
    attachmentCount: Array.isArray(row.attachments) ? row.attachments.length : 0,
    createdAt: toManilaDate(row.created_at),
  }));
}

/**
 * Per-kind extras for a ticket that has already passed the surname gate.
 * Complaints get NOTHING beyond their label: the narrative, respondent and
 * location must never reach a public page (spec §3 — complaints show status
 * only). That is enforced by this function not asking for them.
 */
async function loadExtras(
  admin: AdminClient,
  kind: TicketKind,
  ticketNo: string,
): Promise<Pick<TicketLookupResult, "type" | "serviceTitle" | "requirements" | "scheduleNote">> {
  if (kind === "complaint") {
    return {
      type: "Incident Report",
      serviceTitle: "Incident report",
      requirements: [],
      scheduleNote: null,
    };
  }

  if (kind === "appointment") {
    const { data } = await admin
      .from("appointments")
      .select("purpose, confirmed_date, confirmed_period")
      .eq("ticket_no", ticketNo)
      .maybeSingle();
    return {
      type: "Appointment",
      serviceTitle: data?.purpose ?? "Appointment",
      requirements: [],
      scheduleNote:
        data?.confirmed_date && data.confirmed_period
          ? `${formatDate(data.confirmed_date)} · ${data.confirmed_period === "am" ? "Morning (8:00 AM – 12:00 NN)" : "Afternoon (1:00 PM – 5:00 PM)"}`
          : null,
    };
  }

  if (kind === "assistance") {
    const { data } = await admin
      .from("assistance_requests")
      .select("assistance_categories (label)")
      .eq("ticket_no", ticketNo)
      .maybeSingle();
    const category = data?.assistance_categories as unknown as { label: string } | null;
    return {
      type: "Assistance Request",
      serviceTitle: category?.label ?? "Assistance request",
      requirements: [],
      scheduleNote: null,
    };
  }

  const { data } = await admin
    .from("applications")
    .select("services (title, requirements)")
    .eq("ticket_no", ticketNo)
    .maybeSingle();
  const service = data?.services as unknown as { title: string; requirements: string[] } | null;
  return {
    type: "Certificate Application",
    serviceTitle: service?.title ?? "Barangay document",
    requirements: service?.requirements ?? [],
    scheduleNote: null,
  };
}

export interface ReplyResult {
  error: string | null;
  ticket: TicketLookupResult | null;
}

/** Tighter than the lookup budget: this endpoint accepts files from nobody in particular. */
const REPLY_LIMIT = 5;
const REPLY_WINDOW_MS = 60 * 60 * 1000;

/**
 * Which table each ticket kind's reply updates. `permission`, `label` and
 * `path` used to live here too; all three existed only to address and link the
 * staff notification email, removed 2026-08-06.
 */
const REPLY_KINDS: Record<TicketKind, { table: string }> = {
  application: { table: "applications" },
  appointment: { table: "appointments" },
  complaint: { table: "complaints" },
  assistance: { table: "assistance_requests" },
};

const replySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write your reply.")
    .max(2000, "Please keep your reply under 2000 characters."),
});

/**
 * A resident's answer to an information request.
 *
 * `FormData` rather than a values object because Files have to travel. No auth:
 * the ticket number + surname pair IS the gate, and it is re-checked here —
 * a Server Action is a public HTTP endpoint, and having been on the results
 * page proves nothing about the next POST.
 *
 * Every rejection past validation returns the same NOT_FOUND string the lookup
 * uses, so this endpoint cannot confirm that a ticket exists or leak its status.
 *
 * Returns the refreshed ticket (built AFTER the status update) rather than
 * making the caller re-run `lookupTicket`: the lookup form nulls its Turnstile
 * token the instant a lookup succeeds (see `track-lookup.tsx`), so a second
 * round trip right after a successful reply would fail Turnstile verification
 * and show the resident a CAPTCHA error immediately after their reply worked.
 * This way there is exactly one round trip, one Turnstile token, and one
 * rate-limit hit for the whole "read the reply back" experience.
 */
export async function submitTicketReply(form: FormData): Promise<ReplyResult> {
  const ip = await requestIp();
  const token = form.get("turnstileToken");
  if (!(await verifyTurnstileToken(typeof token === "string" ? token : null, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticket: null };
  }

  // Cheap and before any DB work, same reasoning as lookupTicket's IP check.
  // The ticket-keyed budget below is NOT checked here: ticket numbers are
  // sequential and guessable (that's the whole reason the surname gate
  // exists), so checking it before the surname is confirmed would let anyone
  // enumerate ticket numbers and burn every resident's reply budget without
  // knowing a single surname.
  if (!(await checkRateLimit(`reply:ip:${ip}`, REPLY_LIMIT, REPLY_WINDOW_MS))) {
    return { error: "Too many replies. Please wait a few minutes and try again.", ticket: null };
  }

  const ticketNo = String(form.get("ticketNo") ?? "").trim().toUpperCase();
  const surname = String(form.get("lastName") ?? "").trim();

  const parsed = replySchema.safeParse({ body: form.get("body") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid reply.", ticket: null };
  }

  const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length > MAX_TICKET_FILES) {
    return { error: `You can attach up to ${MAX_TICKET_FILES} files.`, ticket: null };
  }

  const admin = createSupabaseAdminClient();
  const { data: view, error: viewError } = await admin
    .from("tickets_view")
    .select(TICKET_VIEW_COLUMNS)
    .eq("ticket_no", ticketNo)
    .maybeSingle();
  if (viewError) {
    console.error("submitTicketReply lookup failed:", viewError.message);
    return { error: "Something went wrong. Please try again.", ticket: null };
  }
  // One message for "no such ticket", "wrong name" and "not repliable" alike.
  if (!view || !sameSurname(view.last_name, surname) || !canReply(view.status as TicketStatus)) {
    return { error: NOT_FOUND, ticket: null };
  }

  // Only a caller who has just PROVEN they hold this ticket (surname matched,
  // status is awaiting-info) may spend its reply budget. Checking this any
  // earlier is the denial-of-service vector described above.
  if (!(await checkRateLimit(`reply:ticket:${view.ticket_no}`, REPLY_LIMIT, REPLY_WINDOW_MS))) {
    return { error: "Too many replies. Please wait a few minutes and try again.", ticket: null };
  }

  const kind = view.kind as TicketKind;
  const def = REPLY_KINDS[kind];

  // view.ticket_no, not the client-submitted ticketNo, from here on — it is a
  // storage path prefix (uploadTicketAttachment) and a DB filter value, and
  // the client string is an accident of this query's .eq() match, not a
  // guarantee that survives the rest of this function.
  const uploaded: TicketAttachment[] = [];
  for (const file of files) {
    const result = await uploadTicketAttachment(file, view.ticket_no);
    if (result.error || !result.src) {
      // Compensating delete: nothing references these yet.
      for (const done of uploaded) {
        await discardTicketAttachment(done.path, "submitTicketReply upload failed");
      }
      return { error: result.error ?? "Upload failed. Try again.", ticket: null };
    }
    uploaded.push({ path: result.src, name: file.name, mime: file.type, sizeBytes: file.size });
  }

  const entryId = await recordTicketUpdate({
    ticketNo: view.ticket_no,
    kind,
    entryType: "resident-reply",
    body: parsed.data.body,
    visibility: "public",
    authorKind: "resident",
    attachments: uploaded,
  });
  if (!entryId) {
    for (const done of uploaded) {
      await discardTicketAttachment(done.path, "submitTicketReply insert failed");
    }
    return { error: "We could not send your reply. Please try again.", ticket: null };
  }

  // Past this point nothing rolls the reply back: the row is the resident's
  // evidence that they answered, and losing it is worse than a status left at
  // awaiting-info that staff can move by hand.
  const { error: statusError } = await admin
    .from(def.table)
    .update({ status: REPLY_RETURN_STATUS, replied_at: new Date().toISOString() })
    .eq("ticket_no", view.ticket_no)
    .eq("status", "awaiting-info");
  if (statusError) console.error("submitTicketReply status update failed:", statusError.message);

  // Rebuild the result AFTER the status update, so the resident sees the new
  // status (and the composer disappears, since it is no longer awaiting-info)
  // without a second lookup, a second Turnstile token, or a second rate-limit
  // hit.
  const { data: refreshed, error: refreshError } = await admin
    .from("tickets_view")
    .select(TICKET_VIEW_COLUMNS)
    .eq("ticket_no", view.ticket_no)
    .maybeSingle();

  let ticket: TicketLookupResult | null = null;
  if (refreshError || !refreshed) {
    if (refreshError) console.error("submitTicketReply refresh failed:", refreshError.message);
  } else {
    ticket = await buildTicketResult(admin, refreshed);
  }

  return { error: null, ticket };
}
