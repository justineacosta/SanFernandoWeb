"use server";

import type { PublicInquiryValues } from "@/types";
import { SITE } from "@/constants/site";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { inquirySchema } from "./schema";
import { sendEmail } from "@/lib/email";
import { staffEmailsFor } from "@/lib/notifications";
import { InquiryAcknowledgedEmail } from "@/emails/InquiryAcknowledgedEmail";
import { InquiryStaffNotifyEmail } from "@/emails/InquiryStaffNotifyEmail";

export interface SubmitInquiryResult {
  error: string | null;
}

/** Same budget as a complaint: a heavier record than a form fill, and rare per household. */
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A resident's message from /contact.
 *
 * No auth — the service-role client is used because `inquiries` has no RLS
 * policies at all; this action IS the gate, so everything it touches is
 * validated first and nothing is read back out.
 *
 * Until this existed the form ran a 1200 ms timer and claimed "Message Sent!"
 * against nothing at all. There is no ticket number in the result on purpose:
 * an inquiry is not trackable at /track, and handing back a number that /track
 * cannot find would be the same lie in a new shape.
 */
export async function submitInquiry(
  values: PublicInquiryValues,
  turnstileToken: string | null,
): Promise<SubmitInquiryResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE };
  }
  if (!(await checkRateLimit(`inquiry:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error: `Too many messages from this connection. Please try again later, or call ${SITE.phone}.`,
    };
  }

  const parsed = inquirySchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("inquiries")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      subject: parsed.data.subject,
      message: parsed.data.message,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("submitInquiry failed:", error?.message);
    return { error: "We could not send your message. Please try again." };
  }

  // Best-effort notifications: the inquiry row is already saved above, so
  // sendEmail()/staffEmailsFor() failing must never surface as an error to
  // the resident — both fail open by construction (see src/lib/email.ts).
  await sendEmail({
    to: parsed.data.email,
    subject: "We received your message — Barangay San Fernando",
    template: InquiryAcknowledgedEmail({
      firstName: parsed.data.firstName,
      subject: parsed.data.subject,
    }),
  });

  const staffEmails = await staffEmailsFor("handle-inquiries");
  if (staffEmails.length > 0) {
    await sendEmail({
      to: staffEmails,
      subject: `New inquiry: ${parsed.data.subject}`,
      template: InquiryStaffNotifyEmail({
        fullName: `${parsed.data.firstName} ${parsed.data.lastName}`,
        subject: parsed.data.subject,
        message: parsed.data.message,
        inquiryId: data.id,
      }),
    });
  }

  return { error: null };
}
