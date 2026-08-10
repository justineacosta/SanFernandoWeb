"use server";

import type { PublicApplicationValues, SubmitApplicationResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  TICKET_INTAKE_STATUS,
  markTicketUpdateNotified,
  recordTicketUpdate,
} from "@/lib/ticket-updates";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { sendEmail } from "@/lib/email";
import { ApplicationSubmittedEmail } from "@/emails/ApplicationSubmittedEmail";
import { applicationSchema } from "./schema";

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
  turnstileToken: string | null,
): Promise<SubmitApplicationResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticketNo: null };
  }
  if (!(await checkRateLimit(`apply:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
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
  // belong to the applications flow. Gated on `flow`, not `tone` — the
  // assistance/appointment rows are tone 'primary' too and would otherwise clear
  // this check, letting a crafted request insert an `applications` row for a
  // service with no application form behind it and hand back a real ticket_no.
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, is_available, flow, title")
    .eq("id", serviceId)
    .maybeSingle();
  if (serviceError) {
    console.error("submitApplication service lookup failed:", serviceError.message);
    return { error: "Something went wrong. Please try again.", ticketNo: null };
  }
  if (!service || service.flow !== "apply") {
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
      // Optional fields store null, never "" — the same convention `email` set.
      middle_name: parsed.data.middleName || null,
      last_name: parsed.data.lastName,
      birth_date: parsed.data.birthDate,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      service_id: service.id,
      purpose: parsed.data.purpose || null,
      source: "online",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("submitApplication failed:", error?.message);
    return { error: "We could not file your application. Please try again.", ticketNo: null };
  }

  const entryId = await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "application",
    entryType: "status",
    status: TICKET_INTAKE_STATUS.application,
    visibility: "public",
    authorKind: "system",
  });
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Application received — ${data.ticket_no}`,
      template: ApplicationSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        serviceTitle: service.title,
        purpose: parsed.data.purpose || null,
      }),
    });
    if (entryId) await markTicketUpdateNotified(entryId);
  }

  return { error: null, ticketNo: data.ticket_no };
}
