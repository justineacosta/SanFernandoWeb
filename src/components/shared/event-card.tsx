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
      <div className="flex h-16 w-16 min-w-16 flex-col items-center justify-center rounded border border-blue-100 bg-blue-50">
        <span className="text-xs font-bold uppercase text-secondary">{month}</span>
        <span className="text-2xl font-bold leading-none text-primary">{day}</span>
      </div>
      <div>
        <h4 className="text-sm font-bold text-ink transition-colors group-hover:text-secondary">
          {event.title}
        </h4>
        <p className="mt-1 text-xs text-ink-muted">{event.time}</p>
        <p className="text-xs text-ink-muted">{event.venue}</p>
      </div>
    </article>
  );
}
