import { Button } from "@/components/ui/button";
import { FeaturedNewsCard, NewsCard } from "@/features/announcements/components/news-card";
import { FEATURED_ARTICLE, NEWS_ARTICLES } from "@/features/announcements/data";

/** Main column: featured article, news grid, and load-more control. */
export function NewsFeed() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between border-b border-ink-200 pb-4">
        <h2 className="text-2xl font-semibold text-ink-900">Community News Feed</h2>
      </div>
      <FeaturedNewsCard article={FEATURED_ARTICLE} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {NEWS_ARTICLES.map((article) => (
          <NewsCard key={article.title} article={article} />
        ))}
      </div>
      <div className="flex justify-center py-4">
        <Button variant="outline" size="lg" className="px-12">
          Load More News
        </Button>
      </div>
    </div>
  );
}
