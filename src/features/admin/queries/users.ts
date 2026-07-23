import type { Permission, StaffStatusLabel, TeamUser } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const COLUMNS =
  "id, email, full_name, status_label, is_superadmin, permissions, is_active, is_archived, created_at, phone";

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  status_label: string;
  is_superadmin: boolean;
  permissions: unknown;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  phone: string | null;
}

function toTeamUser(row: ProfileRow): TeamUser {
  return {
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
  };
}

/**
 * Both readers use the service-role client behind the caller's own
 * `isSuperAdmin` check, matching every other admin query in this folder.
 * `listTeamUsers` previously went through the anon client and leaned on an RLS
 * policy for its filtering — the one read in the portal that did.
 */

/** Non-archived team members for the settings panel, oldest first. */
export async function listTeamUsers(): Promise<TeamUser[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(COLUMNS)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });
  if (error || !data) {
    if (error) console.error("listTeamUsers failed:", error.message);
    return [];
  }
  return data.map(toTeamUser);
}

/**
 * Archived team members, most recently created first. Kept out of
 * `listTeamUsers` so the main roster stays the list of people who work here;
 * the settings panel shows these behind a disclosure.
 */
export async function listArchivedTeamUsers(): Promise<TeamUser[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(COLUMNS)
    .eq("is_archived", true)
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listArchivedTeamUsers failed:", error.message);
    return [];
  }
  return data.map(toTeamUser);
}
