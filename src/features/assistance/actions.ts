"use server";

import type { PublicAssistanceValues, SubmitTicketResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { assistanceSchema } from "./schema";

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
