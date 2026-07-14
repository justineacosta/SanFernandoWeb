"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface MiniCalendarProps {
  /** ISO dates ("YYYY-MM-DD") to highlight. The first entry seeds the initial month. */
  eventDates: string[];
}

/** Month grid with event-day highlights and prev/next month navigation. */
export function MiniCalendar({ eventDates }: MiniCalendarProps) {
  const [month, setMonth] = useState(() => {
    const seed = eventDates.length > 0 ? new Date(`${eventDates[0]}T00:00:00`) : new Date();
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });

  const marked = new Set(eventDates);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingBlanks = month.getDay();
  const label = month.toLocaleDateString("en-PH", { month: "long", year: "numeric" });

  const toIso = (day: number) =>
    `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const shiftMonth = (delta: number) =>
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-ink-900">{label}</h3>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
            className="rounded-full p-1.5 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
            className="rounded-full p-1.5 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {WEEKDAYS.map((day) => (
          <span key={day} className="pb-1 text-xs font-semibold uppercase text-ink-400">
            {day}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
          <span
            key={day}
            className={cn(
              "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-ink-700",
              marked.has(toIso(day)) && "bg-brand-500 font-bold text-ink-900",
            )}
          >
            {day}
          </span>
        ))}
      </div>
    </Card>
  );
}
