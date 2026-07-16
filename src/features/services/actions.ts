"use server";

import { z } from "zod";
import type { PublicApplicationValues, SubmitApplicationResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

const applicationSchema = z.object({
  firstName: z.string().trim().min(2, "Enter your first name."),
  lastName: z.string().trim().min(2, "Enter your last name."),
  address: z.string().trim().min(4, "Enter your purok or street address."),
  contactNumber: z.string().trim().min(7, "Enter a contact number we can reach you on."),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address.")]),
  purpose: z.string().trim().min(4, "Tell us what the document is for."),
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
  if (serviceError) return { error: "Something went wrong. Please try again.", ticketNo: null };
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
