"use client";

import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchorRect } from "@/hooks/use-anchor-rect";

interface TooltipProps {
  /** The text to show. Also becomes the trigger's accessible description. */
  label: string;
  children: React.ReactElement;
}

/**
 * Hover/focus label for icon-only controls.
 *
 * The admin portal already gives every icon button an `aria-label`, so screen
 * readers were served and sighted mouse users were not — they had to guess what
 * an arrow or an eye meant. This adds the visible half.
 *
 * `aria-describedby`, not `aria-labelledby`: the button keeps its own
 * `aria-label` as its name, and the tooltip is supplementary. Doubling them up
 * as the name would make assistive tech read the same words twice.
 *
 * It portals for the same reason RowActions does — tables scroll horizontally
 * and would clip it.
 */
export function Tooltip({ label, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const { rect, measure } = useAnchorRect(wrapperRef, open, () => setOpen(false));

  const show = () => {
    measure();
    setOpen(true);
  };

  return (
    <>
      <span
        ref={wrapperRef}
        className="inline-flex"
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocusCapture={show}
        onBlurCapture={() => setOpen(false)}
        // Escape must dismiss a tooltip that covers what the user is reading.
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        aria-describedby={open ? id : undefined}
      >
        {children}
      </span>
      {open && rect
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              style={{
                top: rect.bottom + 6,
                left: rect.left + rect.width / 2,
              }}
              className="pointer-events-none fixed z-70 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
