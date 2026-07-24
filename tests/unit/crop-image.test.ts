import { describe, expect, it } from "vitest";
import { outputSizeFor, rotatedBoundingBox } from "@/lib/crop-image";

describe("rotatedBoundingBox", () => {
  it("leaves the box alone at 0 and 180 degrees", () => {
    for (const degrees of [0, 180]) {
      const box = rotatedBoundingBox(400, 300, degrees);
      expect(box.width).toBeCloseTo(400);
      expect(box.height).toBeCloseTo(300);
    }
  });

  it("swaps the sides at 90 and 270 degrees", () => {
    for (const degrees of [90, 270]) {
      const box = rotatedBoundingBox(400, 300, degrees);
      expect(box.width).toBeCloseTo(300);
      expect(box.height).toBeCloseTo(400);
    }
  });

  it("grows the box on a diagonal", () => {
    // A 45-degree turn needs more room than either side alone.
    const box = rotatedBoundingBox(400, 300, 45);
    expect(box.width).toBeGreaterThan(400);
    expect(box.height).toBeGreaterThan(400);
  });
});

describe("outputSizeFor", () => {
  it("clamps a large crop to the 512px output", () => {
    expect(outputSizeFor(3000)).toBe(512);
  });

  it("never enlarges a crop smaller than the output", () => {
    // Drawing a 300px region into a 512px canvas would upscale and blur it.
    expect(outputSizeFor(300)).toBe(300);
  });

  it("floors a fractional crop and never returns zero", () => {
    expect(outputSizeFor(300.9)).toBe(300);
    expect(outputSizeFor(0)).toBe(1);
  });
});
