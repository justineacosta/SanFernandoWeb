import { ARCHIVE_BATCH, listPublishedArticles } from "@/features/announcements/queries";
import { NewsArchiveGrid } from "@/features/announcements/components/news-archive-grid";

/** Full News archive: newest as a featured card, the rest in a load-more grid. */
export async function NewsArchive() {
  const { items, total } = await listPublishedArticles(0, ARCHIVE_BATCH);

  if (items.length === 0) {
    return <p className="py-12 text-center text-ink-500">No news yet. Please check back soon.</p>;
  }

  const [featured, ...grid] = items;
  return (
    <NewsArchiveGrid
      featured={featured}
      initialItems={grid}
      initialOffset={items.length}
      initialHasMore={items.length < total}
    />
  );
}
