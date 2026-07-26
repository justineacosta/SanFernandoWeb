import Image from "next/image";
import { formatDate, toCalendarParts } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { CommunityEvent } from "@/types";

interface EventArchiveCardProps {
  event: CommunityEvent;
}

/**
 * Full-detail event row for the /events archive: cover image or calendar-date
 * tile, category badge, schedule line, and a description excerpt — omitted
 * entirely when empty, since the column defaults to '' and older events may
 * have none.
 */
export function EventArchiveCard({ event }: EventArchiveCardProps) {
  const { month, day } = toCalendarParts(event.date);

  return (
    <article className="flex gap-4 rounded-3xl border border-ink-200 bg-white p-5">
      {event.image ? (
        <Image
          src={event.image}
          alt={event.imageAlt ?? ""}
          width={112}
          height={96}
          className="h-24 w-28 shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <div className="flex h-24 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border border-brand-200 bg-brand-100">
          <span className="text-xs font-bold uppercase text-brand-700">{month}</span>
          <span className="text-2xl font-bold leading-none text-ink-900">{day}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <Badge variant="soft">{event.categoryLabel}</Badge>
          {event.image ? (
            <span className="text-xs font-semibold text-brand-700">{formatDate(event.date)}</span>
          ) : null}
        </div>
        <h3 className="text-base font-semibold tracking-tight text-ink-900">{event.title}</h3>
        <p className="mt-1 text-sm text-ink-600">
          {event.time} · {event.venue}
        </p>
        {event.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-ink-600">{event.description}</p>
        ) : null}
      </div>
    </article>
  );
}
