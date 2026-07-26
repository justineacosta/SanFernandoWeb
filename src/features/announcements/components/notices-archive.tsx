import { NOTICES_ARCHIVE_BATCH, listAllAnnouncements } from "@/features/announcements/queries";
import { NoticesArchiveGrid } from "@/features/announcements/components/notices-archive-grid";

/** Full Notices archive: every published announcement, newest first, growing via Load More. */
export async function NoticesArchive() {
  const { items, total } = await listAllAnnouncements(0, NOTICES_ARCHIVE_BATCH);

  if (items.length === 0) {
    return <p className="py-12 text-center text-ink-500">No notices yet. Please check back soon.</p>;
  }

  return (
    <NoticesArchiveGrid
      initialItems={items}
      initialOffset={items.length}
      initialHasMore={items.length < total}
    />
  );
}
