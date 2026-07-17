"use server";

import { z } from "zod";
import type { PublicAppointmentValues, SubmitTicketResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { manilaToday, manilaTodayNextYear } from "@/lib/format";

// Upper bounds matter here in a way they don't on the admin forms: this is an
// unauthenticated endpoint writing to unconstrained `text` columns, so every
// free-text field is capped at a length a real resident would never exceed. The
// narrative is the one field allowed to be long — it is the point of the record
// — but it is still capped.
const appointmentSchema = z.object({
  firstName: z.string().trim().min(2, "Enter your first name.").max(80, "First name is too long."),
  lastName: z.string().trim().min(2, "Enter your last name.").max(80, "Last name is too long."),
  address: z
    .string()
    .trim()
    .min(4, "Enter your purok or street address.")
    .max(200, "Address is too long."),
  contactNumber: z
    .string()
    .trim()
    .min(7, "Enter a contact number we can reach you on.")
    .max(30, "Contact number is too long.")
    // Digits anywhere, not consecutively: "(077) 600-0000" is the local shape.
    .refine(
      (value) => (value.match(/\d/g) ?? []).length >= 7,
      "Enter a contact number we can reach you on.",
    ),
  // Optional. Whitespace-only means "not given", same as empty.
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([
      z.literal(""),
      z.string().email("Enter a valid email address.").max(254, "Email address is too long."),
    ]),
  ),
  purpose: z
    .string()
    .trim()
    .min(4, "Tell us what the appointment is about.")
    .max(500, "Please keep the purpose short."),
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date for your appointment.")
    .refine((value) => value >= manilaToday(), "Pick a date that has not passed.")
    // A year out is already generous for a barangay hall visit; beyond that is
    // almost certainly a typo or a script.
    .refine((value) => value <= manilaTodayNextYear(), "Please pick a date within the next year."),
  preferredPeriod: z.enum(["am", "pm"], { error: "Pick morning or afternoon." }),
  consent: z.boolean().refine((value) => value === true, "Please agree to the data privacy notice."),
});

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
