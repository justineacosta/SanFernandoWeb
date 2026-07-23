"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  /** 1–5, or 0 for "not rated". */
  value: number;
  onChange: (next: number) => void;
  /** Ids the group's own label, so the radiogroup is named. */
  labelledBy: string;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * The optional "overall experience" control.
 *
 * A real `radiogroup`, not five buttons: arrow keys have to work, and a screen
 * reader should hear one control with five options rather than five unrelated
 * toggles. Clicking the current value clears it back to unrated — the field is
 * optional, so a mis-click must be undoable without reloading the form.
 *
 * Hover state is local because it is presentation, not data: the filled count
 * follows the pointer, but `value` only changes on a click.
 */
export function StarRating({ value, onChange, labelledBy }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(Math.min(5, value + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(Math.max(0, value - 1));
    }
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setHovered(0)}
      className="flex items-center gap-1"
    >
      {STARS.map((star) => {
        const filled = star <= shown;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={star === 1 ? "1 star" : `${star} stars`}
            // Only the selected star — or the first, when nothing is selected —
            // is in the tab order, so Tab crosses the group once.
            tabIndex={value === star || (value === 0 && star === 1) ? 0 : -1}
            onClick={() => onChange(value === star ? 0 : star)}
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(0)}
            className="rounded-full p-1 transition-colors duration-(--duration-quick) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <Star
              className={cn(
                "h-6 w-6 transition-colors duration-(--duration-quick)",
                filled ? "fill-brand-500 text-brand-500" : "text-ink-300",
              )}
              aria-hidden="true"
            />
          </button>
        );
      })}
      {value > 0 ? <span className="ml-2 text-sm text-ink-500">{value} of 5</span> : null}
    </div>
  );
}
