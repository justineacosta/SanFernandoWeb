"use server";

import { SITE } from "@/constants/site";
import { discardFeedbackScreenshot, uploadFeedbackScreenshot } from "@/lib/media";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { ALLOWED_IMAGE_TYPES, MAX_SCREENSHOT_BYTES } from "@/lib/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { feedbackSchema } from "./schema";

export interface SubmitFeedbackResult {
  error: string | null;
}

/**
 * Tighter than the inquiry form's five per hour. A note about the website is
 * rarer than a question about a certificate, and this endpoint accepts a file
 * upload from nobody in particular — the budget is the only thing standing
 * between the bucket and a script.
 */
const SUBMIT_LIMIT = 3;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Anonymous feedback about this website.
 *
 * `FormData` rather than a values object because a `File` has to travel. No
 * auth: `feedback` has no RLS policies at all, so this action IS the gate —
 * everything is validated here and nothing is read back out.
 *
 * There is no ticket number in the result, for the same reason `submitInquiry`
 * has none: handing back a reference that nothing can look up is a lie in a new
 * shape. Nothing is revalidated either — no page renders feedback.
 */
export async function submitFeedback(form: FormData): Promise<SubmitFeedbackResult> {
  // Before parsing, so a flood is rejected before doing any real work — no
  // Zod validation, no file read, no Storage upload.
  const ip = await requestIp();
  const rawToken = form.get("turnstileToken");
  if (!(await verifyTurnstileToken(typeof rawToken === "string" ? rawToken : null, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE };
  }
  if (!(await checkRateLimit(`feedback:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error: `Too much feedback from this connection. Please try again later, or call ${SITE.phone}.`,
    };
  }

  const parsed = feedbackSchema.safeParse({
    category: form.get("category"),
    subject: form.get("subject"),
    message: form.get("message"),
    rating: Number(form.get("rating") ?? 0),
    pagePath: form.get("pagePath") ?? "/",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  // The client already refused an oversized or wrong-typed file. It is a client:
  // this is the check that counts.
  const picked = form.get("screenshot");
  const file = picked instanceof File && picked.size > 0 ? picked : null;
  if (file) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { error: "Screenshots must be JPG, PNG, or WebP." };
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return { error: "The screenshot must be 2 MB or smaller." };
    }
  }

  let screenshotPath: string | null = null;
  if (file) {
    const upload = await uploadFeedbackScreenshot(file);
    if (upload.error) return { error: upload.error };
    screenshotPath = upload.src;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("feedback")
    .insert({
      category: parsed.data.category,
      subject: parsed.data.subject,
      message: parsed.data.message,
      // 0 crosses the boundary as "not rated"; the column stores null so it stays
      // out of every average.
      rating: parsed.data.rating === 0 ? null : parsed.data.rating,
      page_path: parsed.data.pagePath,
      screenshot_path: screenshotPath,
    })
    .select("id")
    .single();
  if (error || !data) {
    // Compensating delete: without this the object outlives the row that was
    // supposed to reference it, which is exactly the orphan the deferred-upload
    // rule exists to prevent.
    await discardFeedbackScreenshot(screenshotPath, "submitFeedback insert failed");
    console.error("submitFeedback failed:", error?.message);
    return { error: "We could not send your feedback. Please try again." };
  }

  return { error: null };
}
