import { cache } from "react";
import { redirect } from "next/navigation";
import type { Permission, SessionUser, StaffStatusLabel } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Resolve the signed-in admin user (null if signed out, disabled, or archived). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, status_label, is_superadmin, permissions, is_active, is_archived")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active || profile.is_archived) return null;

  return {
    id: user.id,
    email: profile.email,
    fullName: profile.full_name,
    statusLabel: profile.status_label as StaffStatusLabel,
    isSuperAdmin: profile.is_superadmin,
    permissions: profile.permissions as Permission[],
  };
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  return user;
}

/** SuperAdmin-only actions (user management, service toggles). */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (!user.isSuperAdmin) redirect("/admin");
  return user;
}

/** Permission-gated actions. SuperAdmin always passes (spec §4). */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (!user.isSuperAdmin && !user.permissions.includes(permission)) {
    redirect("/admin");
  }
  return user;
}
