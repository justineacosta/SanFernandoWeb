import "server-only";
import type { CommunityEvent } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Upcoming published events, soonest first; past events drop off automatically. */
export async function listUpcomingEvents(limit = 4): Promise<CommunityEvent[]> {
  const admin = createSupabaseAdminClient();
  const todayManila = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const { data, error } = await admin
    .from("events")
    .select("title, event_date, start_time, end_time, venue")
    .eq("status", "published")
    .gte("event_date", todayManila)
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
