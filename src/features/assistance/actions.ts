"use server";

import type { PublicAssistanceValues, SubmitAssistanceResult, TicketAttachment } from "@/types";
import { AssistanceSubmittedEmail } from "@/emails/AssistanceSubmittedEmail";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import {
  TICKET_INTAKE_STATUS,
  markTicketUpdateNotified,
  recordTicketUpdate,
} from "@/lib/ticket-updates";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { discardTicketAttachment, uploadTicketAttachment } from "@/lib/media";
import {
  ALLOWED_DOC_FILE_TYPES,
  MAX_TICKET_FILES,
  MAX_TICKET_FILE_BYTES,
} from "@/lib/storage";
import { assistanceSchema } from "./schema";

/** Tighter than /apply: an assistance request is a heavier record and far rarer per household. */
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Second rate-limit dimension, so distributed abuse is bounded per person and
 * not only per connection — the shape `login:email:*` and `reply:ticket:*`
 * already use.
 *
 * Keyed on contactNumber, NOT email: `residentFields.email` is
 * `optionalEmailField`, so blank is valid and common. Keying on it would drop
 * every resident without an email into one shared `assistance:email:` bucket
 * and let the first five per hour lock out all the rest — the same shared-bucket
 * flaw as requestIp()'s "unknown" fallback, aimed squarely at the residents
 * least likely to have email and most likely to be filing for assistance.
 * contactNumber is required (>= 7 digits), so it has no empty case.
 *
 * Accepted trade-off: someone who knows a resident's number can deliberately
 * burn that number's hourly budget. Identical to what `login:email:*` already
 * allows for a known account, it costs a Turnstile solve per attempt, it
 * expires in an hour, and the barangay hall counter is unaffected.
 */
const CONTACT_LIMIT = 5;
const CONTACT_WINDOW_MS = 60 * 60 * 1000;

/** Digits only, so "(077) 600-1082" and "0776001082" are one bucket. NOT
 *  normaliseMobile(): that returns null for landlines, which would reintroduce
 *  the empty-bucket problem for exactly the residents who call from one. */
function contactKey(contactNumber: string): string {
  return `assistance:contact:${contactNumber.replace(/\D/g, "")}`;
}

// A freshly-filed request is `pending`, and `canReply` (src/lib/ticket-updates.ts)
// only allows a reply once staff move it to `awaiting-info` — so "reply on the
// Track page" would be false the moment this shows. Point the resident at
// something they can actually do right now instead.
const ATTACHMENT_WARNING =
  "We could not attach your files. Your request is filed — bring them to the barangay hall, or send them through /track once staff ask for more information.";

/**
 * A resident's public assistance request. No auth — the service-role client is
 * used because `assistance_requests` has no RLS policies at all; this action IS
 * the gate, so everything it touches is validated first and nothing is read
 * back out beyond the new ticket number.
 *
 * Files are accepted as a plain Server Action argument (precedent:
 * `saveNewsArticle`); `submitTicketReply` uses `FormData` only because it also
 * carries a ticket number and surname as form fields, which this action does not.
 */
export async function submitAssistance(
  values: PublicAssistanceValues,
  files: File[],
  turnstileToken: string | null,
): Promise<SubmitAssistanceResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticketNo: null, attachmentWarning: null };
  }
  if (!(await checkRateLimit(`assistance:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error:
        "Too many requests from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
      attachmentWarning: null,
    };
  }

  const parsed = assistanceSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
      ticketNo: null,
      attachmentWarning: null,
    };
  }

  // AFTER Zod, deliberately: a malformed or absent number must not be able to
  // spend anyone's budget. The IP key above stays FIRST as the cheapest
  // rejection — same ordering rule `reply:ticket:*` follows for the same class
  // of reason (see .claude/security.md).
  if (!(await checkRateLimit(contactKey(parsed.data.contactNumber), CONTACT_LIMIT, CONTACT_WINDOW_MS))) {
    return {
      error:
        "Too many requests from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
      attachmentWarning: null,
    };
  }

  // Everything the resident can fix is rejected here, before any row exists —
  // so the attachmentWarning path below is reserved for genuine storage
  // failures they had no part in.
  if (files.length > MAX_TICKET_FILES) {
    return {
      error: `You can attach up to ${MAX_TICKET_FILES} files.`,
      ticketNo: null,
      attachmentWarning: null,
    };
  }
  for (const file of files) {
    if (!ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number])) {
      return {
        error: "Attachments must be JPG, PNG, WebP, or PDF.",
        ticketNo: null,
        attachmentWarning: null,
      };
    }
    if (file.size > MAX_TICKET_FILE_BYTES) {
      return {
        error: "Each attachment must be 2 MB or smaller.",
        ticketNo: null,
        attachmentWarning: null,
      };
    }
  }

  const admin = createSupabaseAdminClient();

  // Never trust the client's categoryId: it must exist and still be active.
  const { data: category, error: categoryError } = await admin
    .from("assistance_categories")
    .select("id, is_active, label")
    .eq("id", parsed.data.categoryId)
    .maybeSingle();
  if (categoryError) {
    console.error("submitAssistance category lookup failed:", categoryError.message);
    return { error: "Something went wrong. Please try again.", ticketNo: null, attachmentWarning: null };
  }
  // A retired category is withdrawn for good, unlike a service's temporary
  // availability toggle — so unlike walk-in encoding elsewhere, nothing may
  // write one, online or at the counter.
  if (!category?.is_active) {
    return { error: "Pick the kind of assistance you need.", ticketNo: null, attachmentWarning: null };
  }

  const { data, error } = await admin
    .from("assistance_requests")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      category_id: category.id,
      details: parsed.data.details,
      source: "online",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("submitAssistance failed:", error?.message);
    return {
      error: "We could not file your request. Please try again.",
      ticketNo: null,
      attachmentWarning: null,
    };
  }

  // data.ticket_no, never a client string — it becomes a storage path prefix,
  // the same reason submitTicketReply uses its DB-resolved view.ticket_no.
  const uploaded: TicketAttachment[] = [];
  let attachmentWarning: string | null = null;
  for (const file of files) {
    const result = await uploadTicketAttachment(file, data.ticket_no);
    if (result.error || !result.src) {
      // The ticket is already filed and is the resident's. Failing the whole
      // submission here would have them refile and collect a second number, so
      // drop the attachments instead and say so.
      for (const done of uploaded) {
        await discardTicketAttachment(done.path, "submitAssistance upload failed");
      }
      uploaded.length = 0;
      attachmentWarning = ATTACHMENT_WARNING;
      break;
    }
    uploaded.push({ path: result.src, name: file.name, mime: file.type, sizeBytes: file.size });
  }

  const entryId = await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "assistance",
    entryType: "status",
    status: TICKET_INTAKE_STATUS.assistance,
    visibility: "public",
    authorKind: "system",
    attachments: uploaded,
  });
  // `recordTicketUpdate` is fire-and-forget and returns null on failure, which
  // would leave those objects referenced by no row at all — the one invariant
  // every upload path here keeps. Same compensating delete `submitTicketReply`
  // does on its own insert failure; the ticket itself still stands, so this
  // only downgrades the result to the warning path, never to an error.
  if (!entryId && uploaded.length > 0) {
    for (const done of uploaded) {
      await discardTicketAttachment(done.path, "submitAssistance timeline insert failed");
    }
    attachmentWarning = ATTACHMENT_WARNING;
  }
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Assistance request received — ${data.ticket_no}`,
      template: AssistanceSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        categoryLabel: category.label,
        details: parsed.data.details,
      }),
    });
    if (entryId) await markTicketUpdateNotified(entryId);
  }

  return { error: null, ticketNo: data.ticket_no, attachmentWarning };
}
