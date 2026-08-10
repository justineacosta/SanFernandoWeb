import { describe, expect, it, vi } from "vitest";
import { isClosedDay } from "@/lib/office-days";

describe("isClosedDay", () => {
  it("is true for a Saturday", () => {
    expect(isClosedDay("2026-08-15")).toBe(true);
  });

  it("is true for a Sunday", () => {
    expect(isClosedDay("2026-08-16")).toBe(true);
  });

  it("is false for every weekday", () => {
    // Mon 2026-08-10 through Fri 2026-08-14.
    for (const iso of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]) {
      expect(isClosedDay(iso)).toBe(false);
    }
  });

  it("never consults the runner's local weekday", () => {
    // The whole correctness of this function is getUTCDay() over getDay(), and
    // that difference is INVISIBLE to a behavioural assertion on any runner at
    // UTC+0 or east of it — which is both this project's CI and its entire
    // audience (Manila, UTC+8). Asserting `isClosedDay("2026-08-17") === false`
    // therefore passes just as happily with the bug present.
    //
    // So assert the mechanism instead of the output: getDay() must never be
    // called. This holds in every timezone, which a date-based assertion cannot.
    const localDay = vi.spyOn(Date.prototype, "getDay");
    for (const iso of ["2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17"]) {
      isClosedDay(iso);
    }
    expect(localDay).not.toHaveBeenCalled();
    localDay.mockRestore();
  });
});
