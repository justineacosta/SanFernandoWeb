import "server-only";
import type { AdminAchievement, ContentStatus } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveMediaUrls } from "@/lib/media-lifecycle";

interface PhotoRow {
  id: string;
  src: string;
  alt: string;
  sort_order: number;
}

interface AchievementRow {
  id: string;
  title: string;
  description: string;
  date_label: string;
  is_visible: boolean;
  sort_order: number;
  official_achievement_photos: PhotoRow[] | null;
}

/**
 * Every achievement for one official, visible or not, in editor order.
 * Admin-side: no is_visible or title filtering — the drawer must show
 * unfinished and deliberately hidden entries. `status` is the *official's*
 * status — achievement photos have no lifecycle of their own and ride on
 * their parent's, so it decides whether photos resolve as public or signed.
 */
export async function listAchievementsForOfficial(
  officialId: string,
  status: ContentStatus,
): Promise<AdminAchievement[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("official_achievements")
    .select(
      "id, title, description, date_label, is_visible, sort_order, official_achievement_photos(id, src, alt, sort_order)",
    )
    .eq("official_id", officialId)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  const rows = (data as unknown as AchievementRow[]).map((row) => ({
    ...row,
    // Embedded rows come back in no guaranteed order — sort here rather than
    // relying on a nested order parameter.
    sortedPhotos: [...(row.official_achievement_photos ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  }));

  const urlByPath = await resolveMediaUrls(
    "officials",
    status,
    rows.flatMap((row) => row.sortedPhotos.map((p) => p.src)),
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    dateLabel: row.date_label,
    isVisible: row.is_visible,
    photos: row.sortedPhotos.map((photo) => ({
      id: photo.id,
      // Fall back to the raw path (matches pre-fix behavior) on the rare
      // signing failure, rather than inventing a nullable GalleryPhoto.src.
      src: urlByPath.get(photo.src) ?? photo.src,
      alt: photo.alt,
    })),
  }));
}
