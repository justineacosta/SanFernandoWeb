import { Resend } from "resend";
import type { ReactElement } from "react";

export interface SendEmailInput {
  to: string | string[];
  replyTo?: string | string[];
  subject: string;
  template: ReactElement;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
}

let warnedDevSkip = false;

/** A hung Resend call must still resolve within a bounded time, not hang the caller. */
const SEND_TIMEOUT_MS = 5000;

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("sendEmail: timed out")), ms);
  });
}

/**
 * Sends one transactional email through Resend. Never throws — a missing
 * API key, a Resend-reported error, or the send call itself throwing all
 * fail open and return `{ ok: false }`, because every caller in this app
 * fires this after its own DB write already committed. An email failure
 * must never turn into a failed resident submission.
 *
 * Missing RESEND_API_KEY/RESEND_FROM_EMAIL: development skips with a
 * one-time console.warn (no Resend account required for `npm run dev`).
 * Production also skips (never throws) but logs via console.error on every
 * call, so a misconfigured deploy is loud in the logs without blocking
 * anything it's layered on top of.
 *
 * A stalled Resend connection is raced against a SEND_TIMEOUT_MS ceiling so
 * this still resolves (never hangs) within a few seconds — a timeout is
 * just another rejection the same catch below turns into `{ ok: false }`.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      console.error("sendEmail: RESEND_API_KEY or RESEND_FROM_EMAIL is not set; email not sent.");
    } else if (!warnedDevSkip) {
      console.warn(
        "sendEmail: RESEND_API_KEY or RESEND_FROM_EMAIL is not set; skipping email send in development.",
      );
      warnedDevSkip = true;
    }
    return { ok: false };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await Promise.race([
      resend.emails.send({
        from,
        // to: input.to,
        to: 'justine.psalm0923@gmail.com' as string,
        replyTo: input.replyTo,
        subject: input.subject,
        react: input.template,
      }),
      timeout(SEND_TIMEOUT_MS),
    ]);
    if (error) {
      console.error("sendEmail: Resend API returned an error:", error.message);
      return { ok: false };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("sendEmail: unexpected failure:", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}
