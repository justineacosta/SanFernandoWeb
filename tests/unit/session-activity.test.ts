import { describe, expect, it } from "vitest";
import {
  ACTIVITY_COOKIE,
  ACTIVITY_MAX_AGE_SECONDS,
  IDLE_MS,
  WARN_MS,
  activityCookieOptions,
  activityCookieString,
  hasActivityCookie,
  isIdleExpired,
  parseActivityAt,
  secondsUntilSignOut,
  shouldWarn,
} from "@/lib/session-activity";

const START = 1_700_000_000_000;

describe("the cookie contract", () => {
  it("expires exactly when the client deadline does", () => {
    // The whole design rests on these being one number, not two.
    expect(ACTIVITY_MAX_AGE_SECONDS * 1000).toBe(IDLE_MS);
  });

  it("is readable by client JS and scoped to the portal", () => {
    const options = activityCookieOptions(true);
    expect(options.httpOnly).toBe(false);
    expect(options.path).toBe("/admin");
    expect(options.sameSite).toBe("lax");
    expect(options.maxAge).toBe(ACTIVITY_MAX_AGE_SECONDS);
    expect(options.name).toBe(ACTIVITY_COOKIE);
  });

  it("marks the cookie Secure only when asked", () => {
    expect(activityCookieOptions(true).secure).toBe(true);
    expect(activityCookieOptions(false).secure).toBe(false);
    expect(activityCookieString(true)).toContain("; secure");
    expect(activityCookieString(false)).not.toContain("secure");
  });

  it("serialises a document.cookie assignment", () => {
    expect(activityCookieString(false)).toBe(
      "sf-activity=1; path=/admin; max-age=1800; samesite=lax",
    );
  });

  it("treats only the exact value as present", () => {
    expect(hasActivityCookie("1")).toBe(true);
    expect(hasActivityCookie(undefined)).toBe(false);
    expect(hasActivityCookie("")).toBe(false);
    expect(hasActivityCookie("0")).toBe(false);
  });
});

describe("the idle predicates", () => {
  it("does not warn before the final minute", () => {
    expect(shouldWarn(START, START + IDLE_MS - WARN_MS - 1)).toBe(false);
  });

  it("warns from the start of the final minute", () => {
    expect(shouldWarn(START, START + IDLE_MS - WARN_MS)).toBe(true);
  });

  it("keeps warning past the deadline (the caller checks expiry first)", () => {
    expect(shouldWarn(START, START + IDLE_MS + 5_000)).toBe(true);
  });

  it("does not expire one millisecond early", () => {
    expect(isIdleExpired(START, START + IDLE_MS - 1)).toBe(false);
  });

  it("expires exactly on the deadline", () => {
    expect(isIdleExpired(START, START + IDLE_MS)).toBe(true);
  });

  it("counts whole seconds down, never below zero", () => {
    expect(secondsUntilSignOut(START, START + IDLE_MS - 60_000)).toBe(60);
    expect(secondsUntilSignOut(START, START + IDLE_MS - 59_400)).toBe(60);
    expect(secondsUntilSignOut(START, START + IDLE_MS - 1)).toBe(1);
    expect(secondsUntilSignOut(START, START + IDLE_MS)).toBe(0);
    expect(secondsUntilSignOut(START, START + IDLE_MS + 10_000)).toBe(0);
  });
});

describe("parseActivityAt", () => {
  it("reads a stored epoch", () => {
    expect(parseActivityAt(String(START))).toBe(START);
  });

  it("rejects anything that is not a positive number", () => {
    // localStorage is shared with other origins' junk and survives releases —
    // a bad value must fall back to "unknown", never to NaN arithmetic that
    // would make every comparison false and disable the timeout silently.
    expect(parseActivityAt(null)).toBe(null);
    expect(parseActivityAt("")).toBe(null);
    expect(parseActivityAt("not-a-number")).toBe(null);
    expect(parseActivityAt("0")).toBe(null);
    expect(parseActivityAt("-5")).toBe(null);
    expect(parseActivityAt("Infinity")).toBe(null);
  });
});
