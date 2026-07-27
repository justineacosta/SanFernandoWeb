import "server-only";
import type {
  AdminAchievement,
  AdminOfficialRow,
  ContentStatus,
  OfficialGroup,
  OfficialValues,
} from "@/types";
import { ARCHIVE_SELECT, toArchiveMeta, type ArchiveMetaRow } from "@/lib/archive";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveMediaUrl, resolveMediaUrlsForList } from "@/lib/media-lifecycle";
import { listAchievementsForOfficial } from "./achievements";

/** Every official, all statuses, in directory order. */
export async function listAdminOfficials(): Promise<AdminOfficialRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    // `group` is a SQL reserved word — keep it quoted.
    .select(`id, slug, name, role, "group", photo_path, sort_order, status, ${ARCHIVE_SELECT}`)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  const photoUrls = await resolveMediaUrlsForList(
    "officials",
    data.map((row) => ({
      path: row.photo_path as string | null,
      status: row.status as ContentStatus,
    })),
  );

  return data.map((row, i) => ({
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    role: row.role as string,
    group: row.group as OfficialGroup,
    photoUrl: photoUrls[i],
    sortOrder: row.sort_order as number,
    status: row.status as ContentStatus,
    ...toArchiveMeta(row as unknown as ArchiveMetaRow),
  }));
}

export async function getOfficialForEdit(
  id: string,
): Promise<{
  values: OfficialValues;
  status: ContentStatus;
  photoUrl: string | null;
  achievements: AdminAchievement[];
} | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select('name, role, "group", badge, photo_path, photo_alt, term, email, phone, bio, status')
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const status = data.status as ContentStatus;
  const photoPath = (data.photo_path as string) || null;
  const [achievements, photoUrl] = await Promise.all([
    listAchievementsForOfficial(id, status),
    photoPath ? resolveMediaUrl("officials", status, photoPath) : Promise.resolve(null),
  ]);

  return {
    values: {
      name: data.name as string,
      role: data.role as string,
      group: data.group as OfficialGroup,
      badge: (data.badge as string) ?? null,
      photoPath: (data.photo_path as string) ?? null,
      photoAlt: (data.photo_alt as string) ?? "",
      term: (data.term as string) ?? "",
      email: (data.email as string) ?? null,
      phone: (data.phone as string) ?? null,
      bio: (data.bio as string) ?? "",
    },
    status,
    photoUrl,
    achievements,
  };
}
