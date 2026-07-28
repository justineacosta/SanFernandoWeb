"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { NewsCard } from "@/features/announcements/components/news-card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { loadMoreNews } from "@/features/announcements/actions";
import type { NewsArticleListItem } from "@/types";

interface NewsArchiveGridProps {
  initialItems: NewsArticleListItem[];
  initialOffset: number;
  initialHasMore: boolean;
}

/** A 3-column grid of plain news cards that grows via "Load More" button. */
export function NewsArchiveGrid({
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
        setItems((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...result.items.filter((a) => !seen.has(a.id))];
        });
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </div>
      {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}
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
