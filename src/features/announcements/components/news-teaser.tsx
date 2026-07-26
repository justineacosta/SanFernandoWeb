import { Button } from "@/components/ui/button";
import { FeaturedNewsCard, NewsCard } from "@/features/announcements/components/news-card";
import { listPublishedArticles } from "@/features/announcements/queries";

const TEASER_LIMIT = 3;

/** Home-adjacent teaser: the 3 newest articles, with a link to the full archive. */
export async function NewsTeaser() {
  const { items, total } = await listPublishedArticles(0, TEASER_LIMIT);
  const [featured, ...grid] = items;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between border-b border-ink-200 pb-4">
        <h2 className="text-2xl font-semibold text-ink-900">Community News Feed</h2>
      </div>

      {!featured ? (
        <p className="py-12 text-center text-ink-500">No news yet. Please check back soon.</p>
      ) : (
        <>
          <FeaturedNewsCard article={featured} />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {grid.map((article) => (
              <NewsCard key={article.id} article={article} />
            ))}
          </div>
          {total > items.length ? (
            <div className="flex justify-center pt-2">
              <Button href="/news" variant="outline" size="lg">
                See More
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
