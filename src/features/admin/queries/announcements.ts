import "server-only";
import type { AdminAnnouncementRow, AnnouncementValues, ContentStatus } from "@/types";
import { ARCHIVE_SELECT, toArchiveMeta, type ArchiveMetaRow } from "@/lib/archive";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveMediaUrl, resolveMediaUrlsForList } from "@/lib/media-lifecycle";
import { formatDate, toManilaDate } from "@/lib/format";

interface Row extends ArchiveMetaRow {
  id: string;
  title: string;
  date: string;
  excerpt: string;
  image_src: string | null;
  image_alt: string;
  urgent: boolean;
  status: ContentStatus;
  updated_at: string;
}

/** All announcements for the admin manager grid, most recently updated first. */
export async function listAnnouncements(): Promise<AdminAnnouncementRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select(
      `id, title, date, excerpt, image_src, image_alt, urgent, status, updated_at, ${ARCHIVE_SELECT}`,
    )
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const rows = data as unknown as Row[];
  const imageUrls = await resolveMediaUrlsForList(
    "announcements",
    rows.map((r) => ({ path: r.image_src, status: r.status })),
  );
  return rows.map((r, i) => ({
    id: r.id,
    title: r.title,
    // `date` is a bare Postgres `date` column, not a timestamptz — pass it
    // straight through (no toManilaDate). Callers format it with formatDate().
    date: r.date,
    excerpt: r.excerpt,
    urgent: r.urgent,
    status: r.status,
    imageSrc: imageUrls[i],
    imageAlt: r.image_alt,
    updatedLabel: formatDate(toManilaDate(r.updated_at)),
    ...toArchiveMeta(r),
  }));
}

/** One announcement's editable values + status, for the drawer editor. */
export async function getAnnouncementForEdit(
  id: string,
): Promise<{ values: AnnouncementValues; status: ContentStatus; imagePreviewUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("id, slug, title, date, excerpt, body, image_src, image_alt, urgent, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const status = data.status as ContentStatus;
  const imagePreviewUrl = data.image_src
    ? await resolveMediaUrl("announcements", status, data.image_src)
    : null;
  return {
    values: {
      title: data.title,
      slug: data.slug,
      date: data.date,
      excerpt: data.excerpt,
      body: data.body ?? "",
      urgent: data.urgent,
      // Raw storage path (or remote seed URL) — never resolved here. The form
      // round-trips this value back through saveAnnouncement unchanged unless
      // the uploader replaces it.
      imageSrc: data.image_src,
      imageAlt: data.image_alt,
    },
    status,
    imagePreviewUrl,
  };
}
