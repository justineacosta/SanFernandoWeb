import { describe, expect, it } from "vitest";
import { initialsOf } from "@/lib/initials";

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Justine Acosta")).toBe("JA");
  });

  it("stops at two, however many names there are", () => {
    expect(initialsOf("Maria Clara Dela Cruz")).toBe("MC");
  });

  it("handles a single name", () => {
    expect(initialsOf("Ferdinand")).toBe("F");
  });

  it("ignores extra whitespace", () => {
    expect(initialsOf("  Juan   Dela Cruz  ")).toBe("JD");
  });

  it("uppercases", () => {
    expect(initialsOf("juan dela cruz")).toBe("JD");
  });

  it("returns an empty string for an empty name, leaving the fallback to the caller", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf("   ")).toBe("");
  });
});
