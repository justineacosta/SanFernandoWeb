import { describe, expect, it, vi } from "vitest";
import { isClosedDay, nextOpenDay } from "@/lib/office-days";

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

describe("nextOpenDay", () => {
  it("returns a weekday unchanged", () => {
    // Mon 2026-08-10 through Fri 2026-08-14.
    for (const iso of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]) {
      expect(nextOpenDay(iso)).toBe(iso);
    }
  });

  it("moves a Saturday to the following Monday", () => {
    expect(nextOpenDay("2026-08-15")).toBe("2026-08-17");
  });

  it("moves a Sunday to the following Monday", () => {
    expect(nextOpenDay("2026-08-16")).toBe("2026-08-17");
  });

  it("crosses a month boundary", () => {
    // Sat 2026-10-31 → Mon 2026-11-02.
    expect(nextOpenDay("2026-10-31")).toBe("2026-11-02");
  });

  it("crosses a year boundary", () => {
    // Sat 2028-12-30 and Sun 2028-12-31 both land on Mon 2029-01-01.
    expect(nextOpenDay("2028-12-30")).toBe("2029-01-01");
    expect(nextOpenDay("2028-12-31")).toBe("2029-01-01");
  });

  it("never consults the runner's local weekday", () => {
    // Same reasoning as isClosedDay's own mechanism test: getUTCDay() vs
    // getDay() is invisible to a behavioural assertion at UTC+0 or east of it,
    // which is this project's entire audience.
    const localDay = vi.spyOn(Date.prototype, "getDay");
    for (const iso of ["2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17"]) {
      nextOpenDay(iso);
    }
    expect(localDay).not.toHaveBeenCalled();
    localDay.mockRestore();
  });
});
