import type { Permission, StaffStatusLabel, TeamUser } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Non-archived team members for the settings panel, oldest first. */
export async function listTeamUsers(): Promise<TeamUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, status_label, is_superadmin, permissions, is_active, is_archived, created_at, phone")
    .eq("is_archived", false)
    .order("created_at", { ascending: true });
  if (error || !data) {
    if (error) console.error("listTeamUsers failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    statusLabel: row.status_label as StaffStatusLabel,
    isSuperAdmin: row.is_superadmin,
    permissions: row.permissions as Permission[],
    isActive: row.is_active,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    phone: row.phone,
  }));
}
