import Link from "next/link";
import { FeaturedNewsCard, NewsCard } from "@/features/announcements/components/news-card";
import { listPublishedArticles } from "@/features/announcements/queries";

/** Main column: featured article, news grid, and link-based pager. */
export async function NewsFeed({ page }: { page: number }) {
  const { items, total, pageSize } = await listPublishedArticles(page);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showFeatured = page === 1 && items.length > 0;
  const featured = showFeatured ? items[0] : null;
  const grid = showFeatured ? items.slice(1) : items;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between border-b border-ink-200 pb-4">
        <h2 className="text-2xl font-semibold text-ink-900">Community News Feed</h2>
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-ink-500">No news yet. Please check back soon.</p>
      ) : (
        <>
          {featured ? <FeaturedNewsCard article={featured} /> : null}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {grid.map((article) => (
              <NewsCard key={article.id} article={article} />
            ))}
          </div>
          {totalPages > 1 ? (
            <nav className="flex items-center justify-center gap-2 py-4" aria-label="News pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={n === 1 ? "/announcements" : `/announcements?page=${n}`}
                  aria-current={n === page ? "page" : undefined}
                  className={
                    n === page
                      ? "rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-900"
                      : "rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:border-ink-900"
                  }
                >
                  {n}
                </Link>
              ))}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
