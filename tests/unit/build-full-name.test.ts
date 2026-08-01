import { describe, expect, it } from "vitest";
import { buildFullName } from "@/features/admin/lib/build-full-name";

describe("buildFullName", () => {
  it("joins all three parts with single spaces", () => {
    expect(buildFullName("Juan", "Santos", "Dela Cruz")).toBe("Juan Santos Dela Cruz");
  });

  it("skips an empty middle name", () => {
    expect(buildFullName("Juan", "", "Dela Cruz")).toBe("Juan Dela Cruz");
  });

  it("trims whitespace from each part", () => {
    expect(buildFullName("  Juan  ", "  ", "  Dela Cruz  ")).toBe("Juan Dela Cruz");
  });
});
