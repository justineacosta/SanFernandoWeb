import { describe, expect, it } from "vitest";
import { demandLabel } from "@/features/appointments/demand";

describe("demandLabel", () => {
  it("calls a quiet slot Light", () => {
    expect(demandLabel(0)).toBe("Light");
    expect(demandLabel(2)).toBe("Light");
  });

  it("calls the moderate threshold Moderate", () => {
    expect(demandLabel(3)).toBe("Moderate");
    expect(demandLabel(5)).toBe("Moderate");
  });

  it("calls the busy threshold Busy", () => {
    expect(demandLabel(6)).toBe("Busy");
    expect(demandLabel(40)).toBe("Busy");
  });
});
