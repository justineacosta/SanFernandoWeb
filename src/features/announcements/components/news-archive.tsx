import { ARCHIVE_BATCH, listPublishedArticles } from "@/features/announcements/queries";
import { NewsArchiveGrid } from "@/features/announcements/components/news-archive-grid";

/** Full News archive: plain cards in a 3-column grid with Load More. */
export async function NewsArchive() {
  const { items, total } = await listPublishedArticles(0, ARCHIVE_BATCH);

  if (items.length === 0) {
    return <p className="py-12 text-center text-ink-500">No news yet. Please check back soon.</p>;
  }

  return (
    <NewsArchiveGrid
      initialItems={items}
      initialOffset={items.length}
      initialHasMore={items.length < total}
    />
  );
}
