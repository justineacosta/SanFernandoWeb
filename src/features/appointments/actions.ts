"use server";

import type { PublicAppointmentValues, SubmitTicketResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
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
export async function submitAppointment(values: PublicAppointmentValues): Promise<SubmitTicketResult> {
  const ip = await requestIp();
  if (!checkRateLimit(`appointment:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
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

  return { error: null, ticketNo: data.ticket_no };
}
