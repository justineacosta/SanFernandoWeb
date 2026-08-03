import { describe, expect, it } from "vitest";
import {
  LOGIN_LIMIT,
  isOverLoginLimit,
  needsChallenge,
} from "@/features/admin/lib/login-challenge";

describe("isOverLoginLimit", () => {
  it("is false for a clean pair of keys", () => {
    expect(isOverLoginLimit(0, 0)).toBe(false);
  });

  it("is false below the limit on both keys", () => {
    expect(isOverLoginLimit(LOGIN_LIMIT - 1, LOGIN_LIMIT - 1)).toBe(false);
  });

  it("is true when either key reaches the limit", () => {
    expect(isOverLoginLimit(LOGIN_LIMIT, 0)).toBe(true);
    expect(isOverLoginLimit(0, LOGIN_LIMIT)).toBe(true);
  });

  // Fails OPEN: a limiter outage must never lock out real staff. This is the
  // pre-existing behaviour of isRateLimited, preserved exactly.
  it("is false when a count could not be read", () => {
    expect(isOverLoginLimit(null, null)).toBe(false);
    expect(isOverLoginLimit(null, LOGIN_LIMIT - 1)).toBe(false);
  });
});

describe("needsChallenge", () => {
  it("is false on a first attempt with no recorded failures", () => {
    expect(needsChallenge(0, 0)).toBe(false);
  });

  it("is true after a single failure on either key", () => {
    expect(needsChallenge(1, 0)).toBe(true);
    expect(needsChallenge(0, 1)).toBe(true);
  });

  // Fails CLOSED, the opposite of isOverLoginLimit above. A null count means
  // the limiter is providing no protection at all right now, which is exactly
  // when every attempt should be challenged.
  it("is true when a count could not be read", () => {
    expect(needsChallenge(null, 0)).toBe(true);
    expect(needsChallenge(0, null)).toBe(true);
    expect(needsChallenge(null, null)).toBe(true);
  });
});
