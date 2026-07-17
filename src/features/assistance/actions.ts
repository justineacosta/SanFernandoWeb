"use server";

import { z } from "zod";
import type { PublicAssistanceValues, SubmitTicketResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

// Upper bounds matter here in a way they don't on the admin forms: this is an
// unauthenticated endpoint writing to unconstrained `text` columns, so every
// free-text field is capped at a length a real resident would never exceed. The
// narrative is the one field allowed to be long — it is the point of the record
// — but it is still capped.
const assistanceSchema = z.object({
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
  categoryId: z.string().trim().min(1, "Pick the kind of assistance you need."),
  details: z
    .string()
    .trim()
    .min(20, "Please tell us a little more about what you need.")
    .max(2000, "Please keep the details under 2000 characters."),
  consent: z.boolean().refine((value) => value === true, "Please agree to the data privacy notice."),
});

/** Tighter than /apply: an assistance request is a heavier record and far rarer per household. */
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A resident's public assistance request. No auth — the service-role client is
 * used because `assistance_requests` has no RLS policies at all; this action IS
 * the gate, so everything it touches is validated first and nothing is read
 * back out beyond the new ticket number.
 */
export async function submitAssistance(values: PublicAssistanceValues): Promise<SubmitTicketResult> {
  const ip = await requestIp();
  if (!checkRateLimit(`assistance:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
    return {
      error:
        "Too many requests from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
    };
  }

  const parsed = assistanceSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
      ticketNo: null,
    };
  }

  const admin = createSupabaseAdminClient();

  // Never trust the client's categoryId: it must exist and still be active.
  const { data: category, error: categoryError } = await admin
    .from("assistance_categories")
    .select("id, is_active")
    .eq("id", parsed.data.categoryId)
    .maybeSingle();
  if (categoryError) {
    console.error("submitAssistance category lookup failed:", categoryError.message);
    return { error: "Something went wrong. Please try again.", ticketNo: null };
  }
  // A retired category is withdrawn for good, unlike a service's temporary
  // availability toggle — so unlike walk-in encoding elsewhere, nothing may
  // write one, online or at the counter.
  if (!category?.is_active) {
    return { error: "Pick the kind of assistance you need.", ticketNo: null };
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
    return { error: "We could not file your request. Please try again.", ticketNo: null };
  }

  return { error: null, ticketNo: data.ticket_no };
}
