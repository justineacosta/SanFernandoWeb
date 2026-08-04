import { describe, expect, it } from "vitest";
import { residentDisplayName } from "@/lib/resident-name";

describe("residentDisplayName", () => {
  it("renders the middle name as a single initial", () => {
    expect(residentDisplayName("Juan", "Dizon", "Cruz")).toBe("Juan D. Cruz");
  });

  it("takes one initial from a multi-word middle name", () => {
    // "Dela Cruz" — the common Philippine maternal surname — is one middle
    // name, not two, and conventionally shows as a single initial.
    expect(residentDisplayName("Juan", "Dela Cruz", "Santos")).toBe("Juan D. Santos");
  });

  it("uppercases a lowercased middle name", () => {
    expect(residentDisplayName("Juan", "dizon", "Cruz")).toBe("Juan D. Cruz");
  });

  it("falls back to First Last when the middle name is null", () => {
    // Every application row predating migration 0033 is this case.
    expect(residentDisplayName("Juan", null, "Cruz")).toBe("Juan Cruz");
  });

  it("falls back to First Last when the middle name is an empty string", () => {
    expect(residentDisplayName("Juan", "", "Cruz")).toBe("Juan Cruz");
  });

  it("falls back to First Last when the middle name is only whitespace", () => {
    // Guards the "Juan . Cruz" rendering a naive charAt(0) would produce.
    expect(residentDisplayName("Juan", "   ", "Cruz")).toBe("Juan Cruz");
  });

  it("falls back to First Last when the middle name is undefined", () => {
    expect(residentDisplayName("Juan", undefined, "Cruz")).toBe("Juan Cruz");
  });
});
