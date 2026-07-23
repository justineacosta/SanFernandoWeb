import type { FeedbackRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";
import { FEEDBACK_MEDIA_BUCKET } from "@/lib/storage";
import { feedbackCategoryLabel } from "@/features/feedback/data";

/** Ten minutes: long enough to open a thumbnail, short enough to be worthless if leaked. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * The row shape as selected below.
 *
 * `handler` needs the cast for the same reason `listInquiries` does:
 * supabase-js types every embedded table as an array, but `handled_by` is a
 * many-to-one foreign key, so PostgREST returns one object — or null once the
 * account is gone.
 */
interface FeedbackQueryRow {
  id: string;
  category: FeedbackRow["category"];
  subject: string;
  message: string;
  rating: number | null;
  page_path: string;
  screenshot_path: string | null;
  status: FeedbackRow["status"];
  staff_note: string;
  handled_at: string | null;
  created_at: string;
  handler: { full_name: string } | null;
}

/**
 * The whole feedback queue, newest first. Uses the service-role client because
 * `feedback` has no RLS policies — callers MUST have checked
 * `requirePermission("handle-inquiries")` first (the page does).
 *
 * Screenshots live in a private bucket, so each one needs a signed URL. They are
 * signed in **one batch** for the page rather than per row: a queue of fifty
 * reports must not become fifty round trips.
 */
export async function listFeedback(): Promise<FeedbackRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("feedback")
    .select(
      "id, category, subject, message, rating, page_path, screenshot_path, status, staff_note, handled_at, created_at, handler:handled_by (full_name)",
    )
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listFeedback failed:", error.message);
    return [];
  }

  const rows = data as unknown as FeedbackQueryRow[];

  const paths = rows
    .map((row) => row.screenshot_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);

  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls, error: signError } = await admin.storage
      .from(FEEDBACK_MEDIA_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    // A signing failure must not empty the queue — the report still matters
    // without its thumbnail, so the row renders with screenshotUrl null.
    if (signError) console.error("listFeedback could not sign screenshots:", signError.message);
    for (const entry of urls ?? []) {
      if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    categoryLabel: feedbackCategoryLabel(row.category),
    subject: row.subject,
    message: row.message,
    rating: row.rating,
    pagePath: row.page_path,
    screenshotUrl: row.screenshot_path ? (signed.get(row.screenshot_path) ?? null) : null,
    status: row.status,
    staffNote: row.staff_note,
    handledByName: row.handler?.full_name ?? null,
    handledAt: row.handled_at ? toManilaDate(row.handled_at) : null,
    submittedAt: toManilaDate(row.created_at),
  }));
}
