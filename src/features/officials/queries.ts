import "server-only";
import type { OfficialDetail, OfficialGroup, OfficialListItem } from "@/types";
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

export async function getPublishedOfficialBySlug(slug: string): Promise<OfficialDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select(`${LIST_COLUMNS}, term, bio`)
    .eq("status", "published")
    .not("photo_path", "is", null)
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as OfficialRow;
  return {
    ...toListItem(row),
    term: row.term ?? "",
    bio: row.bio ?? "",
    // Populated in Task 5, when the nested embed lands.
    achievements: [],
  };
}
