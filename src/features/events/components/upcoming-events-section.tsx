import { listAllUpcomingEvents } from "@/features/events/queries";
import { SectionHeading } from "@/components/ui/section-heading";
import { EventArchiveCard } from "@/components/shared/event-archive-card";

/** All upcoming published events, soonest first. No pagination — the realistic count is small. */
export async function UpcomingEventsSection() {
  const events = await listAllUpcomingEvents();

  if (events.length === 0) return null;

  return (
    <div>
      <SectionHeading title="Upcoming Events" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {events.map((event) => (
          <EventArchiveCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
