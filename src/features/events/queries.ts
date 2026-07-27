import "server-only";
import type { CommunityEvent, EventCategory } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { manilaToday } from "@/lib/format";
import { mediaUrl, publicBucketFor } from "@/lib/storage";
import { EVENT_CATEGORY_LABELS } from "@/features/events/data";

export const EVENTS_ARCHIVE_BATCH = 6;

const EVENT_COLUMNS =
  "id, title, category, event_date, start_time, end_time, venue, description, cover_src, cover_alt";

interface EventRow {
  id: string;
  title: string;
  category: EventCategory;
  event_date: string;
  start_time: string;
  end_time: string | null;
  venue: string;
  description: string;
  cover_src: string | null;
  cover_alt: string | null;
}

function toCommunityEvent(r: EventRow): CommunityEvent {
  return {
    id: r.id,
    title: r.title,
    categoryLabel: EVENT_CATEGORY_LABELS[r.category],
    // event_date is a bare `date` column — pass it through untouched.
    date: r.event_date,
    time: r.end_time ? `${r.start_time} - ${r.end_time}` : r.start_time,
    venue: r.venue,
    description: r.description,
    image: r.cover_src ? mediaUrl(publicBucketFor("events"), r.cover_src) : undefined,
    imageAlt: r.cover_alt ?? undefined,
  };
}

/** Upcoming published events, soonest first, capped at `limit` — the homepage widget. */
export async function listUpcomingEvents(limit = 4): Promise<CommunityEvent[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "published")
    .gte("event_date", manilaToday())
    .order("event_date", { ascending: true })
    .limit(limit);

  if (error || !data) {
    console.error("listUpcomingEvents failed:", error?.message);
    return [];
  }
  return (data as unknown as EventRow[]).map(toCommunityEvent);
}

/** Every upcoming published event, soonest first — no cap, for the archive page. */
export async function listAllUpcomingEvents(): Promise<CommunityEvent[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "published")
    .gte("event_date", manilaToday())
    .order("event_date", { ascending: true });

  if (error || !data) {
    console.error("listAllUpcomingEvents failed:", error?.message);
    return [];
  }
  return (data as unknown as EventRow[]).map(toCommunityEvent);
}

/** Past published events, most recent first, paginated. */
export async function listPastEvents(
  offset: number,
  limit: number,
): Promise<{ items: CommunityEvent[]; total: number }> {
  const admin = createSupabaseAdminClient();
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1;

  const { data, count, error } = await admin
    .from("events")
    .select(EVENT_COLUMNS, { count: "exact" })
    .eq("status", "published")
    .lt("event_date", manilaToday())
    .order("event_date", { ascending: false })
    .order("id", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error || !data) {
    console.error("listPastEvents failed:", error?.message);
    return { items: [], total: 0 };
  }
  return {
    items: (data as unknown as EventRow[]).map(toCommunityEvent),
    total: count ?? 0,
  };
}
