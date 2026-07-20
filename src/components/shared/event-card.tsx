import Image from "next/image";
import { formatDate, toCalendarParts } from "@/lib/format";
import type { CommunityEvent } from "@/types";

interface EventCardProps {
  event: CommunityEvent;
}

/**
 * Upcoming-event list item. Events without a cover keep the calendar date tile;
 * events with one swap it for a thumbnail matching AnnouncementCard's footprint,
 * and the date moves into the text block so no information is lost either way.
 */
export function EventCard({ event }: EventCardProps) {
  const { month, day } = toCalendarParts(event.date);

  return (
    <article className="group flex gap-4">
      {event.image ? (
        <Image
          src={event.image}
          alt={event.imageAlt ?? ""}
          width={96}
          height={80}
          className="h-20 w-24 shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 min-w-16 flex-col items-center justify-center rounded-2xl border border-brand-200 bg-brand-100">
          <span className="text-xs font-bold uppercase text-brand-700">{month}</span>
          <span className="text-2xl font-bold leading-none text-ink-900">{day}</span>
        </div>
      )}
      <div>
        <h4 className="text-sm font-semibold tracking-tight text-ink-900 transition-colors group-hover:text-brand-700">
          {event.title}
        </h4>
        {event.image ? (
          <p className="mt-1 text-xs font-semibold text-brand-700">{formatDate(event.date)}</p>
        ) : null}
        <p className="mt-1 text-xs text-ink-600">{event.time}</p>
        <p className="text-xs text-ink-600">{event.venue}</p>
      </div>
    </article>
  );
}
