"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

/**
 * Viewport coordinates of a trigger element, for overlays rendered through a
 * portal at `position: fixed`.
 *
 * Portalling is not a stylistic choice here. Every admin table sits inside
 * `overflow-x-auto`, which clips an absolutely-positioned child — a row menu
 * or tooltip would be cut off at the table edge. Rendering into `document.body`
 * sidesteps that without setting `overflow: visible`, which would break
 * horizontal scrolling on narrow screens.
 *
 * `measure()` is called by whatever opens the overlay rather than from an
 * effect: the element is already on screen, so there is nothing to wait for,
 * and measuring in an effect would mean an extra render pass on every open.
 *
 * Scrolling or resizing dismisses the overlay rather than re-anchoring it.
 * Re-anchoring would mean tracking every scrollable ancestor; dismissing is
 * simpler and is what people expect of a transient overlay anyway.
 */
export function useAnchorRect(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
): { rect: AnchorRect | null; measure: () => void } {
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    setRect({
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      right: box.right,
      width: box.width,
    });
  }, [ref]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => onDismissRef.current();
    // `true` captures scrolls on inner containers, not just the window.
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  return { rect, measure };
}
