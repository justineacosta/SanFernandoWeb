"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FeaturedNewsCard, NewsCard } from "@/features/announcements/components/news-card";
import { loadMoreNews } from "@/features/announcements/actions";
import type { NewsArticleListItem } from "@/types";

interface NewsArchiveGridProps {
  featured: NewsArticleListItem;
  initialItems: NewsArticleListItem[];
  initialOffset: number;
  initialHasMore: boolean;
}

/** Featured card (fixed on first load) + a 3-column grid that grows via "Load More". */
export function NewsArchiveGrid({
  featured,
  initialItems,
  initialOffset,
  initialHasMore,
}: NewsArchiveGridProps) {
  const [items, setItems] = useState(initialItems);
  const [offset, setOffset] = useState(initialOffset);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await loadMoreNews(offset);
        setItems((prev) => [...prev, ...result.items]);
        setOffset((prev) => prev + result.items.length);
        setHasMore(result.hasMore);
      } catch (err) {
        setError("Failed to load more articles. Please try again.");
        console.error("loadMoreNews error:", err);
      }
    });
  }

  return (
    <div className="space-y-8">
      <FeaturedNewsCard article={featured} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {hasMore ? (
        <div className="flex justify-center pt-4">
          <Button variant="outline" size="lg" onClick={handleLoadMore} disabled={isPending}>
            {isPending ? "Loading…" : "Load More"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
