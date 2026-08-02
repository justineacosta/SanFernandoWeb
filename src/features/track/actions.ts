"use server";

import type { TicketKind, TicketLookupResult, TicketStatus, TicketUpdateEntry } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDate, toManilaDate } from "@/lib/format";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { canReply } from "@/lib/ticket-updates";

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
    .select("ticket_no, kind, first_name, last_name, status, remarks, created_at, reviewed_at, closed_at")
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

  const kind = data.kind as TicketKind;
  const base = {
    kind,
    ticketNo: data.ticket_no,
    applicantName: `${data.first_name} ${data.last_name}`,
    status: data.status as TicketStatus,
    submittedAt: toManilaDate(data.created_at),
    reviewedAt: data.reviewed_at ? toManilaDate(data.reviewed_at) : null,
    closedAt: data.closed_at ? toManilaDate(data.closed_at) : null,
    remarks: data.remarks,
    requirements: [] as string[],
    scheduleNote: null as string | null,
  };

  const [extras, timeline] = await Promise.all([
    loadExtras(admin, kind, ticket),
    loadTimeline(admin, ticket),
  ]);
  return {
    error: null,
    ticket: { ...base, ...extras, timeline, repliable: canReply(base.status) },
  };
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

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
    .order("created_at", { ascending: true });
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
