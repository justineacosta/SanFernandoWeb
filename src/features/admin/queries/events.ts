import "server-only";
import type { AdminEventRow, ContentStatus, EventCategory, EventValues } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";

interface Row {
  id: string;
  title: string;
  category: EventCategory;
  event_date: string;
  start_time: string;
  end_time: string | null;
  venue: string;
  capacity: number | null;
  description: string;
  cover_src: string | null;
  cover_alt: string;
  status: ContentStatus;
}

const COLUMNS =
  "id, title, category, event_date, start_time, end_time, venue, capacity, description, cover_src, cover_alt, status";

/** All events for the admin manager list, soonest event date first. */
export async function listEvents(): Promise<AdminEventRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("events").select(COLUMNS).order("event_date", { ascending: true });
  if (error || !data) return [];
  return (data as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    // `event_date` is a bare Postgres `date` column, not a timestamptz — pass
    // it straight through (no toManilaDate). Callers format it with formatDate().
    eventDate: r.event_date,
    startTime: r.start_time,
    endTime: r.end_time ?? "",
    venue: r.venue,
    capacity: r.capacity,
    description: r.description,
    status: r.status,
    coverSrc: r.cover_src ? photoUrl(r.cover_src) : null,
    coverAlt: r.cover_alt,
  }));
}

/** One event's editable values + status, for the drawer editor. */
export async function getEventForEdit(
  id: string,
): Promise<{ values: EventValues; status: ContentStatus } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("events").select(COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  return {
    values: {
      title: row.title,
      category: row.category,
      eventDate: row.event_date,
      startTime: row.start_time,
      endTime: row.end_time ?? "",
      venue: row.venue,
      capacity: row.capacity,
      description: row.description,
      // Raw storage path (or remote seed URL) — never resolved here. The form
      // round-trips this value back through saveEvent unchanged unless the
      // uploader replaces it.
      coverSrc: row.cover_src,
      coverAlt: row.cover_alt,
    },
    status: row.status,
  };
}
