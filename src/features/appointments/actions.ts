"use server";

import type { PublicAppointmentValues, SubmitTicketResult } from "@/types";
import { AppointmentSubmittedEmail } from "@/emails/AppointmentSubmittedEmail";
import { sendEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TICKET_INTAKE_STATUS, recordTicketUpdate } from "@/lib/ticket-updates";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { appointmentSchema } from "./schema";

/** Appointments are more routine than complaints but less than certificate applications. */
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A resident's public appointment request. No auth — the service-role client is
 * used because `appointments` has no RLS policies at all; this action IS the
 * gate, so everything it touches is validated first and nothing is read back
 * out beyond the new ticket number.
 */
export async function submitAppointment(
  values: PublicAppointmentValues,
  turnstileToken: string | null,
): Promise<SubmitTicketResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticketNo: null };
  }
  if (!(await checkRateLimit(`appointment:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error:
        "Too many appointment requests from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
    };
  }

  const parsed = appointmentSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
      ticketNo: null,
    };
  }

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("appointments")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      purpose: parsed.data.purpose,
      preferred_date: parsed.data.preferredDate,
      preferred_period: parsed.data.preferredPeriod,
      source: "online",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("submitAppointment failed:", error?.message);
    return { error: "We could not file your request. Please try again.", ticketNo: null };
  }

  await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "appointment",
    entryType: "status",
    status: TICKET_INTAKE_STATUS.appointment,
    visibility: "public",
    authorKind: "system",
  });
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Appointment request received — ${data.ticket_no}`,
      template: AppointmentSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        purpose: parsed.data.purpose,
        preferredDate: parsed.data.preferredDate,
        preferredPeriod: parsed.data.preferredPeriod,
      }),
    });
  }

  return { error: null, ticketNo: data.ticket_no };
}
