import { describe, expect, it } from "vitest";
import { excerpt, periodLabel } from "@/emails/shared/text";

describe("periodLabel", () => {
  it("labels a morning slot", () => {
    expect(periodLabel("am")).toBe("Morning (8:00 AM – 12:00 NN)");
  });

  it("labels an afternoon slot", () => {
    expect(periodLabel("pm")).toBe("Afternoon (1:00 PM – 5:00 PM)");
  });
});

describe("excerpt", () => {
  it("returns short text unchanged", () => {
    expect(excerpt("Short text")).toBe("Short text");
  });

  it("truncates long text and appends an ellipsis", () => {
    const long = "a".repeat(250);
    const result = excerpt(long, 200);
    expect(result).toBe(`${"a".repeat(200)}…`);
    expect(result.length).toBe(201);
  });

  it("trims surrounding whitespace before measuring length", () => {
    expect(excerpt("  padded  ", 20)).toBe("padded");
  });
});
