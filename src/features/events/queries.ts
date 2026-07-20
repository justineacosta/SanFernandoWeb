import "server-only";
import type { CommunityEvent } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { manilaToday } from "@/lib/format";
import { photoUrl } from "@/lib/storage";

/** Upcoming published events, soonest first; past events drop off automatically. */
export async function listUpcomingEvents(limit = 4): Promise<CommunityEvent[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("events")
    .select("title, event_date, start_time, end_time, venue, cover_src, cover_alt")
    .eq("status", "published")
    .gte("event_date", manilaToday())
    .order("event_date", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data.map((r) => ({
    title: r.title,
    // event_date is a bare `date` column — pass it through untouched.
    date: r.event_date,
    time: r.end_time ? `${r.start_time} - ${r.end_time}` : r.start_time,
    venue: r.venue,
    image: r.cover_src ? photoUrl(r.cover_src) : undefined,
    imageAlt: r.cover_alt ?? undefined,
  }));
}
