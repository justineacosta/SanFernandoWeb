import { cache } from "react";
import { notFound, redirect } from "next/navigation";
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
    .select("email, full_name, status_label, is_superadmin, permissions, is_active, is_archived, phone")
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
    phone: profile.phone,
  };
});

/**
 * Signed-out users are redirected to the login page, NOT 404'd. They may well
 * hold the permission once authenticated — telling them the page does not exist
 * would be both unhelpful and untrue.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  return user;
}

/* ── Page gates: throw, rendering app/admin/(portal)/not-found.tsx ─────────
 *
 * A staff member without a permission must not learn the module exists, so an
 * unauthorized page load is a genuine 404 rather than a bounce to /admin.
 *
 * These are for PAGE LOADS ONLY. Server Actions are POSTs — a thrown
 * notFound() there does not render a 404, it surfaces as an unhandled digest
 * error in the client transition. Actions use the check* variants below.
 */

/** SuperAdmin-only pages (user management, service toggles). */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (!user.isSuperAdmin) notFound();
  return user;
}

/** Permission-gated pages. SuperAdmin always passes (spec §4). */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (!user.isSuperAdmin && !user.permissions.includes(permission)) notFound();
  return user;
}

/* ── Server Action gates: never throw ─────────────────────────────────────── */

/** The single denial message handed back to the client by every gated action. */
export const NOT_FOUND = "Not found.";

/**
 * Server Action counterpart of requireSuperAdmin. Returns null instead of
 * throwing so the caller can `return { error: NOT_FOUND }` in its own shape.
 */
export async function checkSuperAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || !user.isSuperAdmin) return null;
  return user;
}

/**
 * Server Action counterpart of requirePermission.
 *
 * Returns null both when the permission is missing and when the session has
 * expired, so an expired session surfaces "Not found." rather than "sign in
 * again". Accepted: distinguishing the two would thread a reason through every
 * gated action to improve a rare case, and the user's next navigation hits
 * requireSessionUser and lands on the login page anyway.
 */
export async function checkPermission(permission: Permission): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (!user.isSuperAdmin && !user.permissions.includes(permission)) return null;
  return user;
}
