"use server";

import { EVENTS_ARCHIVE_BATCH, listPastEvents } from "@/features/events/queries";
import type { CommunityEvent } from "@/types";

export async function loadMorePastEvents(
  offset: number,
): Promise<{ items: CommunityEvent[]; hasMore: boolean }> {
  const { items, total } = await listPastEvents(offset, EVENTS_ARCHIVE_BATCH);
  // If we're fetching more (offset > 0) but the query returns zero total, it's
  // a failure (not "no more past events"). Throw so the client error handler catches it.
  if (offset > 0 && total === 0) {
    throw new Error("Failed to load more events.");
  }
  return { items, hasMore: offset + items.length < total };
}
