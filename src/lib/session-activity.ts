/**
 * The inactivity-timeout contract, in one place.
 *
 * One rule governs everything: the `sf-activity` cookie exists IF AND ONLY IF
 * the user interacted within the last 30 minutes.
 *
 * The cookie is presence-only — its value is a constant and carries no
 * timestamp. That is deliberate. A timestamp would have to be written by
 * either the client clock or the server clock and then compared against the
 * other, and the two disagree; presence collapses the question to "did the
 * browser still have it?".
 *
 * It also buys the second half of the requirement for free. A closed tab runs
 * no timer, so "signed out after 30 minutes with the window closed" can only
 * be enforced on the next request — and cookie Max-Age is absolute wall-clock
 * time that survives a browser restart. Close at 14:00, reopen at 14:31, the
 * cookie is gone, the gate fires. No code.
 *
 * Pure module: no I/O, no `document`, no `cookies()`. The two gates
 * (src/middleware.ts, src/lib/auth.ts) and the client hook
 * (src/hooks/use-idle-timer.ts) supply their own.
 */

export const ACTIVITY_COOKIE = "sf-activity";
export const ACTIVITY_COOKIE_VALUE = "1";
export const ACTIVITY_COOKIE_PATH = "/admin";

/** Cross-tab freshness for the countdown only — never read by the server. */
export const ACTIVITY_STORAGE_KEY = "sf-admin-activity-at";

/** Total idle allowance. The warning lives inside this, not after it. */
export const IDLE_MS = 30 * 60 * 1000;

/**
 * The warning occupies the FINAL minute (29:00 → 30:00) rather than following
 * the 30 minutes. This keeps the client deadline and the cookie's Max-Age the
 * same number. If the dialog ran from 30:00 to 31:00 the cookie would already
 * be dead for its whole duration: "Stay signed in" would be reviving a session
 * the server had given up on, and any background navigation inside that minute
 * would redirect to login underneath the open dialog.
 */
export const WARN_MS = 60 * 1000;

/** At most one cookie write per minute, however much the user moves. */
export const HEARTBEAT_THROTTLE_MS = 60 * 1000;

/** Derived, never written twice — see the module note above. */
export const ACTIVITY_MAX_AGE_SECONDS = IDLE_MS / 1000;

export interface ActivityCookieOptions {
  name: string;
  value: string;
  path: string;
  maxAge: number;
  sameSite: "lax";
  secure: boolean;
  /**
   * Always false: the client heartbeat writes this cookie, so it cannot be
   * httpOnly. A signed-in user could therefore hand-craft it and never time
   * out — accepted. This protects an unattended desk in a shared barangay
   * office; it was never a defense against the session's own owner, who is
   * already authenticated. Making it httpOnly would force a Server Action
   * round trip per minute per user to buy nothing.
   */
  httpOnly: false;
}

/** Shape for `NextResponse.cookies.set()` and `cookies().set()`. */
export function activityCookieOptions(secure: boolean): ActivityCookieOptions {
  return {
    name: ACTIVITY_COOKIE,
    value: ACTIVITY_COOKIE_VALUE,
    path: ACTIVITY_COOKIE_PATH,
    maxAge: ACTIVITY_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure,
    httpOnly: false,
  };
}

/** The same cookie as a `document.cookie` assignment, for the client heartbeat. */
export function activityCookieString(secure: boolean): string {
  const parts = [
    `${ACTIVITY_COOKIE}=${ACTIVITY_COOKIE_VALUE}`,
    `path=${ACTIVITY_COOKIE_PATH}`,
    `max-age=${ACTIVITY_MAX_AGE_SECONDS}`,
    "samesite=lax",
  ];
  if (secure) parts.push("secure");
  return parts.join("; ");
}

/** Presence check. Absence means idle ≥ 30 min, or the window was closed that long. */
export function hasActivityCookie(value: string | undefined): boolean {
  return value === ACTIVITY_COOKIE_VALUE;
}

/**
 * True from the start of the final minute onward — including past the
 * deadline. Callers check `isIdleExpired` first; keeping this monotonic means
 * a tab that was throttled while backgrounded cannot skip the warning state.
 */
export function shouldWarn(lastActivityAt: number, now: number): boolean {
  return now >= lastActivityAt + IDLE_MS - WARN_MS;
}

export function isIdleExpired(lastActivityAt: number, now: number): boolean {
  return now >= lastActivityAt + IDLE_MS;
}

/** Whole seconds left on the countdown, floored at zero. */
export function secondsUntilSignOut(lastActivityAt: number, now: number): number {
  const remaining = lastActivityAt + IDLE_MS - now;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 1000);
}

/** Read a `localStorage` epoch, rejecting anything that is not a positive finite number. */
export function parseActivityAt(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}
