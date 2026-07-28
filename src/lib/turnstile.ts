const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Same copy for every rejection reason (missing key handled separately,
 * missing token, wrong token, Cloudflare-reported failure, network error) —
 * a distinct message per case would tell a script which part to retry.
 */
export const TURNSTILE_FAILURE_MESSAGE =
  "We could not verify you're human. Please complete the challenge and try again.";

let warnedMissingSecret = false;

/**
 * Verifies a Turnstile token against Cloudflare's siteverify endpoint.
 * Called first in every one of the 8 public Server Actions — before
 * rate-limiting or Zod validation — so a failed challenge is the cheapest
 * possible rejection (security-hardening spec §5).
 *
 * Missing-key behaviour is asymmetric: in development, an unset
 * TURNSTILE_SECRET_KEY skips verification (returns true) with a one-time
 * console warning, so a contributor without a Cloudflare account isn't
 * blocked. In production it throws instead of silently passing, so a
 * misconfigured deploy fails loudly rather than shipping with no CAPTCHA.
 *
 * Fails closed on a missing token or a Cloudflare-reported failure, and also
 * fails closed if the verification request itself errors — unlike the rate
 * limiter (which fails open because Zod is its real correctness gate),
 * Turnstile IS the anti-bot layer this plan adds; failing open here would
 * silently disable the very feature being shipped.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "TURNSTILE_SECRET_KEY is not set — refusing to accept public form submissions with no CAPTCHA in production.",
      );
    }
    if (!warnedMissingSecret) {
      console.warn("TURNSTILE_SECRET_KEY is not set — skipping Turnstile verification in development.");
      warnedMissingSecret = true;
    }
    return true;
  }

  if (!token) return false;

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const result = (await response.json()) as { success: boolean };
    return result.success === true;
  } catch (error) {
    console.error("verifyTurnstileToken request failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
