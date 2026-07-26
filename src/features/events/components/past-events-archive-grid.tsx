"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EventArchiveCard } from "@/components/shared/event-archive-card";
import { loadMorePastEvents } from "@/features/events/actions";
import type { CommunityEvent } from "@/types";

interface PastEventsArchiveGridProps {
  initialItems: CommunityEvent[];
  initialOffset: number;
  initialHasMore: boolean;
}

/** A stack of past-event cards that grows via "Load More" button. */
export function PastEventsArchiveGrid({
  initialItems,
  initialOffset,
  initialHasMore,
}: PastEventsArchiveGridProps) {
  const [items, setItems] = useState(initialItems);
  const [offset, setOffset] = useState(initialOffset);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await loadMorePastEvents(offset);
        setItems((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...result.items.filter((e) => !seen.has(e.id))];
        });
        setOffset((prev) => prev + result.items.length);
        setHasMore(result.hasMore);
      } catch (err) {
        setError("Failed to load more events. Please try again.");
        console.error("loadMorePastEvents error:", err);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((event) => (
          <EventArchiveCard key={event.id} event={event} />
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
