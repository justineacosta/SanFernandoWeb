"use server";

import { z } from "zod";
import type { PublicComplaintValues, SubmitTicketResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { manilaToday } from "@/lib/format";
import { COMPLAINT_SERVICE_ID } from "./queries";

// Upper bounds matter here in a way they don't on the admin forms: this is an
// unauthenticated endpoint writing to unconstrained `text` columns, so every
// free-text field is capped at a length a real resident would never exceed. The
// narrative is the one field allowed to be long — it is the point of the record
// — but it is still capped.
const complaintSchema = z.object({
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
  // Optional: a resident may report an incident without naming anyone.
  respondent: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([z.literal(""), z.string().max(120, "That name is too long.")]),
  ),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date the incident happened.")
    .refine((value) => value <= manilaToday(), "The incident date cannot be in the future.")
    .refine((value) => value >= "1900-01-01", "Enter the date the incident happened."),
  location: z
    .string()
    .trim()
    .min(4, "Where did this happen?")
    .max(200, "Please keep the location short."),
  narrative: z
    .string()
    .trim()
    .min(20, "Please describe what happened in a little more detail.")
    .max(4000, "Please keep the account under 4000 characters."),
  consent: z.boolean().refine((value) => value === true, "Please agree to the data privacy notice."),
});

/** Tighter than /apply: a complaint is a heavier record and far rarer per household. */
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A resident's public complaint. No auth — the service-role client is used
 * because `complaints` has no RLS policies at all; this action IS the gate, so
 * everything it touches is validated first and nothing is read back out beyond
 * the new ticket number.
 */
export async function submitComplaint(values: PublicComplaintValues): Promise<SubmitTicketResult> {
  const ip = await requestIp();
  if (!checkRateLimit(`complaint:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
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

  return { error: null, ticketNo: data.ticket_no };
}
