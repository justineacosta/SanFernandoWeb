import { EVENTS_ARCHIVE_BATCH, listPastEvents } from "@/features/events/queries";
import { SectionHeading } from "@/components/ui/section-heading";
import { PastEventsArchiveGrid } from "./past-events-archive-grid";

/** Past published events, most recent first, growing via "Load More". */
export async function PastEventsArchive() {
  const { items, total } = await listPastEvents(0, EVENTS_ARCHIVE_BATCH);

  if (items.length === 0) return null;

  return (
    <div>
      <SectionHeading title="Past Events" />
      <PastEventsArchiveGrid
        initialItems={items}
        initialOffset={items.length}
        initialHasMore={items.length < total}
      />
    </div>
  );
}
