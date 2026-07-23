import { describe, expect, it } from "vitest";
import {
  EASE_OUT_SOFT,
  FADE_QUICK,
  POP,
  RISE,
  SPRING_INDICATOR,
  SPRING_PANEL,
  riseVariants,
  staggerContainer,
} from "@/lib/motion";

/**
 * The motion budget: nothing in the preset module may drift slow or bouncy.
 * These are the same ceilings the 2026-07-23 UI/UX spec set for CSS motion.
 */
describe("motion presets", () => {
  it("matches --ease-out-soft in globals.css", () => {
    expect(EASE_OUT_SOFT).toEqual([0.16, 1, 0.3, 1]);
  });

  it("keeps every duration-based preset at 300ms or under", () => {
    for (const preset of [FADE_QUICK, POP, RISE]) {
      expect(preset.duration).toBeDefined();
      expect(preset.duration!).toBeLessThanOrEqual(0.3);
    }
  });

  it("keeps springs firmly damped so panels never visibly bounce", () => {
    for (const spring of [SPRING_PANEL, SPRING_INDICATOR]) {
      expect(spring.type).toBe("spring");
      expect(spring.damping).toBeGreaterThanOrEqual(30);
    }
  });

  it("staggers gently and rises from a short distance", () => {
    const container = staggerContainer();
    expect(container.visible).toMatchObject({
      transition: { staggerChildren: 0.08 },
    });
    expect(riseVariants.hidden).toMatchObject({ opacity: 0, y: 16 });
    expect(riseVariants.visible).toMatchObject({ opacity: 1, y: 0 });
  });
});
