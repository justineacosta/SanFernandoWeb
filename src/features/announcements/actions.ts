"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { normaliseMobile } from "@/lib/public-forms";
import { ARCHIVE_BATCH, NOTICES_ARCHIVE_BATCH, listAllAnnouncements, listPublishedArticles } from "@/features/announcements/queries";
import type { Announcement, NewsArticleListItem } from "@/types";

export interface SubscribeResult {
  error: string | null;
}

const SUBSCRIBE_LIMIT = 5;
const SUBSCRIBE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Add a mobile number to the barangay alert list.
 *
 * No auth — the service-role client is used because `alert_subscribers` has no
 * RLS policies; this action IS the gate. The number is normalised to one shape
 * before it is stored, so the unique index does the de-duplicating rather than
 * the resident having to remember which format they used last time.
 *
 * Re-subscribing an opted-out number reactivates it: someone typing their own
 * number into the form is asking to be on the list, which is different from a
 * bulk import silently re-adding them.
 */
export async function subscribeToAlerts(input: string): Promise<SubscribeResult> {
  const ip = await requestIp();
  if (!checkRateLimit(`subscribe:${ip}`, SUBSCRIBE_LIMIT, SUBSCRIBE_WINDOW_MS)) {
    return { error: "Too many attempts from this connection. Please try again later." };
  }

  const mobile = normaliseMobile(input);
  if (!mobile) {
    return { error: "Enter a mobile number like 0917 555 0101." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("alert_subscribers")
    .upsert({ mobile, is_active: true, unsubscribed_at: null }, { onConflict: "mobile" });
  if (error) {
    console.error("subscribeToAlerts failed:", error.message);
    return { error: "We could not add your number. Please try again." };
  }

  // Deliberately the same answer whether the row was new or already there —
  // the form must not become a way to test which numbers are on the list.
  return { error: null };
}

export async function loadMoreNews(
  offset: number,
): Promise<{ items: NewsArticleListItem[]; hasMore: boolean }> {
  const { items, total } = await listPublishedArticles(offset, ARCHIVE_BATCH);
  // If we're fetching more (offset > 0) but the query returns zero total, it's a failure
  // (not "archive is empty"). Throw so the client error handler catches it.
  if (offset > 0 && total === 0) {
    throw new Error("Failed to load more articles.");
  }
  return { items, hasMore: offset + items.length < total };
}

export async function loadMoreNotices(
  offset: number,
): Promise<{ items: Announcement[]; hasMore: boolean }> {
  const { items, total } = await listAllAnnouncements(offset, NOTICES_ARCHIVE_BATCH);
  // If we're fetching more (offset > 0) but the query returns zero total, it's
  // a failure (not "no more notices"). Throw so the client error handler catches it.
  if (offset > 0 && total === 0) {
    throw new Error("Failed to load more notices.");
  }
  return { items, hasMore: offset + items.length < total };
}
