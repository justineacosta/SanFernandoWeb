import "server-only";
import type { AdminAchievement } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";

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
 * unfinished and deliberately hidden entries.
 */
export async function listAchievementsForOfficial(
  officialId: string,
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

  return (data as unknown as AchievementRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    dateLabel: row.date_label,
    isVisible: row.is_visible,
    // Embedded rows come back in no guaranteed order — sort here rather than
    // relying on a nested order parameter.
    photos: [...(row.official_achievement_photos ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((photo) => ({ id: photo.id, src: photoUrl(photo.src), alt: photo.alt })),
  }));
}
