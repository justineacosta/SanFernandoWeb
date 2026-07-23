/** A rendered slot in the page control: a page number, or an elided run. */
export type PageSlot = number | "gap";

/**
 * How many slots the control renders once it starts eliding. Seven is the
 * smallest odd count that fits the first page, the last page, the current page
 * with a neighbour either side, and a gap marker on both sides.
 */
export const PAGE_SLOTS = 7;

/**
 * The page numbers to render, with "gap" marking an elided run.
 *
 * Once windowing kicks in the result is always exactly `PAGE_SLOTS` long, so
 * the control keeps a constant width instead of jittering under the cursor as
 * the reader pages through. `page` is clamped rather than trusted: it arrives
 * from a URL on the public archives.
 */
export function pageWindow(page: number, totalPages: number): PageSlot[] {
  if (totalPages <= 0) return [];
  if (totalPages <= PAGE_SLOTS) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const current = Math.min(Math.max(Math.floor(page), 1), totalPages);
  // The first and last page always occupy a slot; `interior` is what is left
  // for the run around the current page, gap markers included.
  const interior = PAGE_SLOTS - 2;

  // Near the front: one gap, on the far side only.
  if (current <= interior - 1) {
    const head = Array.from({ length: interior - 1 }, (_, index) => index + 2);
    return [1, ...head, "gap", totalPages];
  }

  // Near the end: one gap, on the near side only.
  if (current >= totalPages - (interior - 2)) {
    const tail = Array.from(
      { length: interior - 1 },
      (_, index) => totalPages - interior + 1 + index,
    );
    return [1, "gap", ...tail, totalPages];
  }

  return [1, "gap", current - 1, current, current + 1, "gap", totalPages];
}
