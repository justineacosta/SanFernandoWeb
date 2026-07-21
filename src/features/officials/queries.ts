import "server-only";
import type { OfficialDetail, OfficialGroup, OfficialListItem, PublicAchievement } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";

// `group` is a SQL reserved word — it must stay quoted in PostgREST selects.
const LIST_COLUMNS =
  'id, slug, name, role, "group", badge, photo_path, photo_alt, email, phone';

interface OfficialRow {
  id: string;
  slug: string;
  name: string;
  role: string;
  group: OfficialGroup;
  badge: string | null;
  photo_path: string | null;
  photo_alt: string;
  email: string | null;
  phone: string | null;
  term?: string;
  bio?: string;
}

function toListItem(row: OfficialRow): OfficialListItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    group: row.group,
    badge: row.badge,
    // Non-null by construction: the queries below exclude rows without a
    // portrait, and publishing requires one.
    photoUrl: photoUrl(row.photo_path as string),
    photoAlt: row.photo_alt,
    email: row.email,
    phone: row.phone,
  };
}

/** Published officials in directory order. Grouping is the caller's job. */
export async function listPublishedOfficials(): Promise<OfficialListItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select(LIST_COLUMNS)
    .eq("status", "published")
    // Belt-and-braces against a portrait-less row reaching a card and
    // rendering a broken image; setOfficialStatus already blocks it.
    .not("photo_path", "is", null)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as OfficialRow[]).map(toListItem);
}

/**
 * The current published executive official (the Punong Barangay) — the About
 * page's captain block reads name/role/photo from here so an election only
 * has to be recorded once, in the officials table.
 */
export async function getPublishedExecutiveOfficial(): Promise<OfficialListItem | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select(LIST_COLUMNS)
    .eq("status", "published")
    .eq('"group"', "executive")
    .not("photo_path", "is", null)
    .order("sort_order", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return toListItem((data as unknown as OfficialRow[])[0]);
}

interface AchievementPhotoRow {
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
  official_achievement_photos: AchievementPhotoRow[] | null;
}

const ACHIEVEMENT_EMBED =
  "official_achievements(id, title, description, date_label, is_visible, sort_order, official_achievement_photos(id, src, alt, sort_order))";

export async function getPublishedOfficialBySlug(slug: string): Promise<OfficialDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select(`${LIST_COLUMNS}, term, bio, ${ACHIEVEMENT_EMBED}`)
    .eq("status", "published")
    .not("photo_path", "is", null)
    .eq("slug", slug)
    // Filter the embedded rows at the database rather than shipping hidden or
    // unfinished achievements over the wire.
    .eq("official_achievements.is_visible", true)
    .neq("official_achievements.title", "")
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as OfficialRow & {
    official_achievements: AchievementRow[] | null;
  };

  // Belt-and-braces. The embedded filters above are the wire-level saving; the
  // repeat here is the guarantee, because a silently ignored embedded filter
  // would publish an achievement the barangay deliberately hid. Ordering is
  // done here too — two-level embedded ordering is the fragile part of a
  // nested embed, and a profile page is a handful of rows.
  const achievements: PublicAchievement[] = [...(row.official_achievements ?? [])]
    .filter((achievement) => achievement.is_visible && achievement.title.trim() !== "")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((achievement) => ({
      id: achievement.id,
      title: achievement.title,
      description: achievement.description,
      dateLabel: achievement.date_label,
      photos: [...(achievement.official_achievement_photos ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((photo) => ({ id: photo.id, src: photoUrl(photo.src), alt: photo.alt })),
    }));

  return {
    ...toListItem(row),
    term: row.term ?? "",
    bio: row.bio ?? "",
    achievements,
  };
}
