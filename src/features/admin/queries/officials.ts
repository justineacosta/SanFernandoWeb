import "server-only";
import type { AdminOfficialRow, ContentStatus, OfficialGroup, OfficialValues } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";

/** Every official, all statuses, in directory order. */
export async function listAdminOfficials(): Promise<AdminOfficialRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    // `group` is a SQL reserved word — keep it quoted.
    .select('id, slug, name, role, "group", photo_path, sort_order, status')
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    role: row.role as string,
    group: row.group as OfficialGroup,
    photoUrl: row.photo_path ? photoUrl(row.photo_path as string) : null,
    sortOrder: row.sort_order as number,
    status: row.status as ContentStatus,
  }));
}

export async function getOfficialForEdit(
  id: string,
): Promise<{ values: OfficialValues; status: ContentStatus; photoUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select('name, role, "group", badge, photo_path, photo_alt, term, email, phone, bio, status')
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
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
    status: data.status as ContentStatus,
    photoUrl: data.photo_path ? photoUrl(data.photo_path as string) : null,
  };
}
