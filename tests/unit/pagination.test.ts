import { describe, expect, it } from "vitest";
import { PAGE_SLOTS, pageWindow } from "@/lib/pagination";

/**
 * The page window (transparency table pass, 2026-07-23).
 *
 * The admin managers previously rendered one circle per page, which is fine at
 * four pages and absurd at forty. This helper is the only pure logic in the
 * pagination control, so it is the only part with unit tests — the component
 * around it is verified in the browser.
 *
 * The invariant that matters is constant width: the control must not grow and
 * shrink as the reader pages through it, or the layout jitters under the
 * cursor.
 */

describe("pageWindow", () => {
  it("lists every page when they all fit", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns nothing when there are no pages", () => {
    expect(pageWindow(1, 0)).toEqual([]);
  });

  it("keeps a constant width once windowing kicks in", () => {
    for (let page = 1; page <= 40; page += 1) {
      expect(pageWindow(page, 40)).toHaveLength(PAGE_SLOTS);
    }
  });

  it("always keeps the first page, the last page and the current page reachable", () => {
    for (let page = 1; page <= 40; page += 1) {
      const slots = pageWindow(page, 40);
      expect(slots).toContain(1);
      expect(slots).toContain(40);
      expect(slots).toContain(page);
    }
  });

  it("elides only on the far side near the start", () => {
    expect(pageWindow(1, 40)).toEqual([1, 2, 3, 4, 5, "gap", 40]);
    expect(pageWindow(4, 40)).toEqual([1, 2, 3, 4, 5, "gap", 40]);
  });

  it("elides only on the near side at the end", () => {
    expect(pageWindow(40, 40)).toEqual([1, "gap", 36, 37, 38, 39, 40]);
    expect(pageWindow(37, 40)).toEqual([1, "gap", 36, 37, 38, 39, 40]);
  });

  it("elides both sides in the middle", () => {
    expect(pageWindow(20, 40)).toEqual([1, "gap", 19, 20, 21, "gap", 40]);
  });

  it("clamps a page outside the range instead of producing a hole", () => {
    expect(pageWindow(0, 40)).toEqual(pageWindow(1, 40));
    expect(pageWindow(99, 40)).toEqual(pageWindow(40, 40));
  });
});
