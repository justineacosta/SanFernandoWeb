import { describe, expect, it } from "vitest";
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

  it("reads the calendar day, not the viewer's local day", () => {
    // "2026-08-16" parses as UTC midnight. In Manila (UTC+8) that is still
    // Sunday, but getDay() in a UTC-5 test runner would report Saturday for
    // 2026-08-17 and shift every answer by one. This asserts the UTC reading
    // that makes the function timezone-independent.
    expect(new Date("2026-08-16").getUTCDay()).toBe(0);
    expect(isClosedDay("2026-08-17")).toBe(false); // Monday, everywhere
  });
});
