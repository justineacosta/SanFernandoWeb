"use server";

import type { PublicAssistanceValues, SubmitTicketWithFilesResult } from "@/types";
import { AssistanceSubmittedEmail } from "@/emails/AssistanceSubmittedEmail";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { markTicketUpdateNotified } from "@/lib/ticket-updates";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { recordIntakeWithAttachments, validateTicketFiles } from "@/lib/ticket-attachments";
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

/** Shared verbatim by both the IP and contact-number rate-limit rejections
 *  below, so a prober cannot learn which budget they hit by comparing text. */
const RATE_LIMITED_MESSAGE =
  "Too many requests from this connection. Please try again later or visit the barangay hall.";

/** Digits only, so "(077) 600-1082" and "0776001082" are one bucket. NOT
 *  normaliseMobile(): that returns null for landlines, which would reintroduce
 *  the empty-bucket problem for exactly the residents who call from one. */
function contactKey(contactNumber: string): string {
  return `assistance:contact:${contactNumber.replace(/\D/g, "")}`;
}

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
): Promise<SubmitTicketWithFilesResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticketNo: null, attachmentWarning: null };
  }
  if (!(await checkRateLimit(`assistance:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error: RATE_LIMITED_MESSAGE,
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
      error: RATE_LIMITED_MESSAGE,
      ticketNo: null,
      attachmentWarning: null,
    };
  }

  // Everything the resident can fix is rejected here, before any row exists —
  // so the attachmentWarning path below is reserved for genuine storage
  // failures they had no part in.
  const fileError = await validateTicketFiles(files);
  if (fileError) {
    return { error: fileError, ticketNo: null, attachmentWarning: null };
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
  const { entryId, attachmentWarning } = await recordIntakeWithAttachments({
    ticketNo: data.ticket_no,
    kind: "assistance",
    files,
    authorKind: "resident",
    context: "submitAssistance",
  });
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
