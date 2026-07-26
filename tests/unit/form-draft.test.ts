import { describe, expect, it } from "vitest";
import {
  DRAFT_MAX_BYTES,
  DRAFT_TTL_MS,
  decodeSnapshot,
  draftKey,
  encodeSnapshot,
  isDraftKey,
  relativeTime,
  sameValues,
} from "@/lib/form-draft";

/**
 * The recovery-copy contract from `src/lib/form-draft.ts`, pinned (sub-project 8).
 *
 * These are the rules that decide whether someone is offered their unsaved
 * work back, and they fail quietly when broken — a snapshot that silently
 * stops decoding looks exactly like "there was nothing to recover". Hence
 * tests rather than trust.
 */

const NOW = 1_800_000_000_000;

describe("draftKey", () => {
  it("scopes a key to the user, the form and the record", () => {
    expect(draftKey("user-1", "announcement", "abc")).toBe(
      "sf-draft:v2:user-1:announcement:abc",
    );
  });

  it("keys an unsaved record as 'new'", () => {
    expect(draftKey("user-1", "news", null)).toBe("sf-draft:v2:user-1:news:new");
  });

  /**
   * The reason the user id is in the key at all: a shared barangay
   * workstation must not offer one person's unsaved text to the next.
   */
  it("gives two users different keys for the same record", () => {
    expect(draftKey("user-1", "official", "x")).not.toBe(draftKey("user-2", "official", "x"));
  });

  it("recognises its own keys and nothing else", () => {
    expect(isDraftKey(draftKey("u", "event", null))).toBe(true);
    expect(isDraftKey("sb-access-token")).toBe(false);
  });
});

describe("encodeSnapshot", () => {
  it("round-trips through decodeSnapshot", () => {
    const values = { title: "Fiesta", urgent: true, capacity: null };
    const raw = encodeSnapshot(values, NOW);
    expect(raw).not.toBeNull();
    expect(decodeSnapshot(raw, NOW)).toEqual({ savedAt: NOW, values });
  });

  /**
   * Over the cap the answer is "do not write", never a truncated string:
   * half a snapshot restores as corrupted text, which is worse than none.
   */
  it("refuses to encode past the size cap", () => {
    const huge = { body: "x".repeat(DRAFT_MAX_BYTES + 1) };
    expect(encodeSnapshot(huge, NOW)).toBeNull();
  });

  it("encodes right up to the cap", () => {
    const body = "x".repeat(DRAFT_MAX_BYTES - 100);
    expect(encodeSnapshot({ body }, NOW)).not.toBeNull();
  });
});

describe("decodeSnapshot", () => {
  it("rejects a missing, malformed or wrongly shaped snapshot", () => {
    expect(decodeSnapshot(null, NOW)).toBeNull();
    expect(decodeSnapshot("", NOW)).toBeNull();
    expect(decodeSnapshot("{not json", NOW)).toBeNull();
    expect(decodeSnapshot('"a string"', NOW)).toBeNull();
    expect(decodeSnapshot('{"values":{"a":1}}', NOW)).toBeNull();
    expect(decodeSnapshot('{"savedAt":123}', NOW)).toBeNull();
    expect(decodeSnapshot('{"savedAt":"soon","values":{}}', NOW)).toBeNull();
  });

  it("accepts a snapshot inside the expiry window", () => {
    const raw = encodeSnapshot({ title: "a" }, NOW - DRAFT_TTL_MS + 1000);
    expect(decodeSnapshot(raw, NOW)).not.toBeNull();
  });

  /** A draft resurfacing after a fortnight is an artefact, not a rescue. */
  it("rejects a snapshot past the expiry window", () => {
    const raw = encodeSnapshot({ title: "a" }, NOW - DRAFT_TTL_MS - 1);
    expect(decodeSnapshot(raw, NOW)).toBeNull();
  });

  /** A future timestamp means the clock moved, not that the copy is fresh. */
  it("rejects a snapshot saved in the future", () => {
    const raw = encodeSnapshot({ title: "a" }, NOW + 60_000);
    expect(decodeSnapshot(raw, NOW)).toBeNull();
  });
});

describe("sameValues", () => {
  /**
   * This decides whether a recovery bar appears at all. Key order must not
   * matter: the stored snapshot and the live form object are built by
   * different code paths and need not agree on ordering.
   */
  it("ignores key order", () => {
    expect(sameValues({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("separates values that differ", () => {
    expect(sameValues({ title: "a" }, { title: "b" })).toBe(false);
    expect(sameValues({ title: "a" }, { title: "a", extra: 1 })).toBe(false);
  });

  it("does not confuse null with an empty string", () => {
    expect(sameValues({ date: null }, { date: "" })).toBe(false);
  });

  it("respects array order", () => {
    expect(sameValues({ ids: ["a", "b"] }, { ids: ["b", "a"] })).toBe(false);
  });
});

describe("relativeTime", () => {
  it("reads as prose across the ranges", () => {
    expect(relativeTime(NOW, NOW)).toBe("just now");
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now");
    expect(relativeTime(NOW - 60_000, NOW)).toBe("1 minute ago");
    expect(relativeTime(NOW - 12 * 60_000, NOW)).toBe("12 minutes ago");
    expect(relativeTime(NOW - 60 * 60_000, NOW)).toBe("1 hour ago");
    expect(relativeTime(NOW - 5 * 60 * 60_000, NOW)).toBe("5 hours ago");
    expect(relativeTime(NOW - 48 * 60 * 60_000, NOW)).toBe("2 days ago");
  });

  it("never reads as negative when the clock drifts", () => {
    expect(relativeTime(NOW + 5000, NOW)).toBe("just now");
  });
});
