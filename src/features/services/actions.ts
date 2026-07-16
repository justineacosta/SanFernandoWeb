"use server";

import { z } from "zod";
import type { PublicApplicationValues, SubmitApplicationResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

// Upper bounds matter here in a way they don't on the admin forms: this is an
// unauthenticated endpoint writing to unconstrained `text` columns, so every
// free-text field is capped at a length a real resident would never exceed.
const applicationSchema = z.object({
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
    .min(4, "Tell us what the document is for.")
    .max(500, "Please keep the purpose short."),
  consent: z.boolean().refine((value) => value === true, "Please agree to the data privacy notice."),
});

/** Generous enough for a household on one connection; tight enough to stop a script. */
const SUBMIT_LIMIT = 10;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A resident's public application. No auth — the service-role client is used
 * because `applications` has no RLS policies at all; this action IS the gate,
 * so everything it touches is validated first and nothing is read back out.
 */
export async function submitApplication(
  serviceId: string,
  values: PublicApplicationValues,
): Promise<SubmitApplicationResult> {
  const ip = await requestIp();
  if (!checkRateLimit(`apply:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
    return {
      error: "Too many applications from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
    };
  }

  const parsed = applicationSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again.", ticketNo: null };
  }

  const admin = createSupabaseAdminClient();

  // Never trust the serviceId from the client: it must exist, be available, and
  // belong to the applications flow (primary tone — danger is the 2C complaint flow).
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, is_available, tone")
    .eq("id", serviceId)
    .maybeSingle();
  if (serviceError) {
    console.error("submitApplication service lookup failed:", serviceError.message);
    return { error: "Something went wrong. Please try again.", ticketNo: null };
  }
  if (!service || service.tone !== "primary") {
    return { error: "That service is not accepting online applications.", ticketNo: null };
  }
  if (!service.is_available) {
    return {
      error: "This service is temporarily unavailable. Please visit the barangay hall.",
      ticketNo: null,
    };
  }

  const { data, error } = await admin
    .from("applications")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      service_id: service.id,
      purpose: parsed.data.purpose,
      source: "online",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("submitApplication failed:", error?.message);
    return { error: "We could not file your application. Please try again.", ticketNo: null };
  }

  return { error: null, ticketNo: data.ticket_no };
}
