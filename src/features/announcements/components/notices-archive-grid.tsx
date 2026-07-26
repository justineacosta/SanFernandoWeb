"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AnnouncementCard } from "@/components/shared/announcement-card";
import { loadMoreNotices } from "@/features/announcements/actions";
import type { Announcement } from "@/types";

interface NoticesArchiveGridProps {
  initialItems: Announcement[];
  initialOffset: number;
  initialHasMore: boolean;
}

/** A single-column stack of announcement cards that grows via "Load More" button. */
export function NoticesArchiveGrid({
  initialItems,
  initialOffset,
  initialHasMore,
}: NoticesArchiveGridProps) {
  const [items, setItems] = useState(initialItems);
  const [offset, setOffset] = useState(initialOffset);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await loadMoreNotices(offset);
        setItems((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...result.items.filter((a) => !seen.has(a.id))];
        });
        setOffset((prev) => prev + result.items.length);
        setHasMore(result.hasMore);
      } catch (err) {
        setError("Failed to load more notices. Please try again.");
        console.error("loadMoreNotices error:", err);
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        {items.map((announcement) => (
          <div key={announcement.id} className="rounded-3xl border border-ink-200 bg-white p-5">
            <AnnouncementCard announcement={announcement} />
          </div>
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
