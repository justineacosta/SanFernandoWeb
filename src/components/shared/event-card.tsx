import { toCalendarParts } from "@/lib/format";
import type { CommunityEvent } from "@/types";

interface EventCardProps {
  event: CommunityEvent;
}

/** Upcoming-event list item with a calendar date tile. */
export function EventCard({ event }: EventCardProps) {
  const { month, day } = toCalendarParts(event.date);

  return (
    <article className="group flex gap-4">
      <div className="flex h-16 w-16 min-w-16 flex-col items-center justify-center rounded-2xl border border-brand-200 bg-brand-100">
        <span className="text-xs font-bold uppercase text-brand-700">{month}</span>
        <span className="text-2xl font-bold leading-none text-ink-900">{day}</span>
      </div>
      <div>
        <h4 className="text-sm font-semibold tracking-tight text-ink-900 transition-colors group-hover:text-brand-700">
          {event.title}
        </h4>
        <p className="mt-1 text-xs text-ink-600">{event.time}</p>
        <p className="text-xs text-ink-600">{event.venue}</p>
      </div>
    </article>
  );
}
