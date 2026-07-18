import "server-only";
import type { CommunityEvent } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { manilaToday } from "@/lib/format";

/** Upcoming published events, soonest first; past events drop off automatically. */
export async function listUpcomingEvents(limit = 4): Promise<CommunityEvent[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("events")
    .select("title, event_date, start_time, end_time, venue")
    .eq("status", "published")
    .gte("event_date", manilaToday())
    .order("event_date", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data.map((r) => ({
    title: r.title,
    date: r.event_date,
    time: r.end_time ? `${r.start_time} - ${r.end_time}` : r.start_time,
    venue: r.venue,
  }));
}
