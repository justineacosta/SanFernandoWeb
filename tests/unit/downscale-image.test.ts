import { describe, expect, it } from "vitest";
import { DOWNSCALE_EDGE_LADDER, scaleToFit } from "@/lib/downscale-image";

describe("scaleToFit", () => {
  it("leaves an image already inside the bound alone", () => {
    expect(scaleToFit(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });

  it("scales the longest edge down to the bound, landscape", () => {
    expect(scaleToFit(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
  });

  it("scales the longest edge down to the bound, portrait", () => {
    // The bound applies to whichever side is longer, not to width.
    expect(scaleToFit(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it("never returns a zero side for an extreme aspect ratio", () => {
    // 6000x10 scaled to 900 would round the height to 1.5 -> 1, not 0: a
    // zero-sided canvas throws in every browser.
    const out = scaleToFit(6000, 10, 900);
    expect(out.width).toBe(900);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });

  it("returns whole pixels", () => {
    const out = scaleToFit(1333, 999, 1000);
    expect(Number.isInteger(out.width)).toBe(true);
    expect(Number.isInteger(out.height)).toBe(true);
  });
});

describe("DOWNSCALE_EDGE_LADDER", () => {
  it("descends and is bounded", () => {
    expect(DOWNSCALE_EDGE_LADDER.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < DOWNSCALE_EDGE_LADDER.length; i += 1) {
      expect(DOWNSCALE_EDGE_LADDER[i]).toBeLessThan(DOWNSCALE_EDGE_LADDER[i - 1]);
    }
  });
});
