"use server";

import type { PublicComplaintValues, SubmitTicketResult } from "@/types";
import { ComplaintSubmittedEmail } from "@/emails/ComplaintSubmittedEmail";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { COMPLAINT_SERVICE_ID } from "./queries";
import { complaintSchema } from "./schema";

/** Tighter than /apply: a complaint is a heavier record and far rarer per household. */
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A resident's public complaint. No auth — the service-role client is used
 * because `complaints` has no RLS policies at all; this action IS the gate, so
 * everything it touches is validated first and nothing is read back out beyond
 * the new ticket number.
 */
export async function submitComplaint(
  values: PublicComplaintValues,
  turnstileToken: string | null,
): Promise<SubmitTicketResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticketNo: null };
  }
  if (!(await checkRateLimit(`complaint:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error:
        "Too many reports from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
    };
  }

  const parsed = complaintSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
      ticketNo: null,
    };
  }

  const admin = createSupabaseAdminClient();

  // Re-check the toggle server-side: the page render is not a gate, and a stale
  // tab must not file a report after the barangay closed online intake.
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("is_available")
    .eq("id", COMPLAINT_SERVICE_ID)
    .maybeSingle();
  if (serviceError) {
    console.error("submitComplaint service lookup failed:", serviceError.message);
    return { error: "Something went wrong. Please try again.", ticketNo: null };
  }
  if (!service?.is_available) {
    return {
      error: "Online incident reports are temporarily unavailable. Please visit the barangay hall.",
      ticketNo: null,
    };
  }

  const { data, error } = await admin
    .from("complaints")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      respondent: parsed.data.respondent || null,
      incident_date: parsed.data.incidentDate,
      location: parsed.data.location,
      narrative: parsed.data.narrative,
      source: "online",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("submitComplaint failed:", error?.message);
    return { error: "We could not file your report. Please try again.", ticketNo: null };
  }

  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Report filed — ${data.ticket_no}`,
      template: ComplaintSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        incidentDate: parsed.data.incidentDate,
        location: parsed.data.location,
      }),
    });
  }

  return { error: null, ticketNo: data.ticket_no };
}
