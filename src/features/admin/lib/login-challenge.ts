/**
 * Pure decision logic for the admin login gate. Lives here rather than in
 * `actions/auth.ts` because that module is `"use server"` and cannot be
 * imported by a Vitest unit test — the same reason `build-full-name.ts` sits
 * beside it instead of inside the users action file.
 */

/** Tighter than the public forms' hour-long windows — credential-stuffing arrives fast. */
export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * True when this attempt should be refused outright.
 *
 * A `null` count means the Supabase read failed, and is treated as "not
 * limited" — fail OPEN. An outage in the limiter must not lock out staff who
 * are typing the right password. This preserves `isRateLimited`'s original
 * behaviour exactly; `needsChallenge` below is what covers the gap it leaves.
 */
export function isOverLoginLimit(ipHits: number | null, emailHits: number | null): boolean {
  return (ipHits ?? 0) >= LOGIN_LIMIT || (emailHits ?? 0) >= LOGIN_LIMIT;
}

/**
 * True when this attempt must carry a valid Turnstile token.
 *
 * One recorded failure on either key is enough: a human who typoed sees a
 * challenge on their second try, while a credential-stuffing script — which
 * fails by definition — is challenged on every attempt after its first.
 *
 * A `null` count fails CLOSED here, deliberately inverting the rule above.
 * When the limiter cannot be read it is providing no protection whatsoever,
 * so the login falls back to challenging everyone: the always-on behaviour,
 * but only for as long as the cheaper adaptive signal is unavailable. The
 * degraded mode is strictly safer than the healthy one.
 */
export function needsChallenge(ipHits: number | null, emailHits: number | null): boolean {
  if (ipHits === null || emailHits === null) return true;
  return ipHits >= 1 || emailHits >= 1;
}
