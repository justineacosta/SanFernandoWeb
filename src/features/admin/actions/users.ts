"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSIONS, type Permission, type StaffStatusLabel } from "@/types";
import { requireSuperAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

export interface TeamUserInput {
  fullName: string;
  email: string;
  password: string;
  statusLabel: StaffStatusLabel;
  permissions: Permission[];
  isSuperAdmin: boolean;
}

const teamUserSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short."),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(10, "Password needs at least 10 characters."),
  statusLabel: z.enum(["staff", "editor"]),
  permissions: z.array(z.enum(PERMISSIONS)),
  isSuperAdmin: z.boolean(),
});

const updateSchema = teamUserSchema.omit({ email: true, password: true });

/** Active, non-archived SuperAdmins. The system must never drop below one. */
async function activeSuperAdminCount(): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_superadmin", true)
    .eq("is_active", true)
    .eq("is_archived", false);
  return count ?? 0;
}

/** True when removing this user's power would leave zero SuperAdmins. */
async function wouldOrphanSuperAdmin(id: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_superadmin, is_active, is_archived")
    .eq("id", id)
    .single();
  const isActiveSuperAdmin =
    data?.is_superadmin && data.is_active && !data.is_archived;
  if (!isActiveSuperAdmin) return false;
  return (await activeSuperAdminCount()) <= 1;
}

export async function createTeamUser(input: TeamUserInput): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const parsed = teamUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { error: error?.message ?? "Could not create the account." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    email: parsed.data.email,
    full_name: parsed.data.fullName,
    status_label: parsed.data.statusLabel,
    permissions: parsed.data.permissions,
    is_superadmin: parsed.data.isSuperAdmin,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Could not save the profile. The account was not created." };
  }

  await recordActivity(actor, "created user", "team-user", data.user.id, parsed.data.fullName);
  revalidatePath("/admin/settings");
  return { error: null };
}

export async function updateTeamUser(
  id: string,
  input: Omit<TeamUserInput, "email" | "password">,
): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }
  if (!parsed.data.isSuperAdmin && (await wouldOrphanSuperAdmin(id))) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      status_label: parsed.data.statusLabel,
      permissions: parsed.data.permissions,
      is_superadmin: parsed.data.isSuperAdmin,
    })
    .eq("id", id);
  if (error) return { error: "Could not save the changes." };

  await recordActivity(actor, "updated user", "team-user", id, parsed.data.fullName);
  revalidatePath("/admin/settings");
  return { error: null };
}

export async function setTeamUserActive(id: string, isActive: boolean): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  if (!isActive && (await wouldOrphanSuperAdmin(id))) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Could not update the account." };

  await recordActivity(actor, isActive ? "enabled user" : "disabled user", "team-user", id);
  revalidatePath("/admin/settings");
  return { error: null };
}

export async function archiveTeamUser(id: string): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  if (await wouldOrphanSuperAdmin(id)) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_archived: true, is_active: false })
    .eq("id", id);
  if (error) return { error: "Could not archive the account." };

  await recordActivity(actor, "archived user", "team-user", id);
  revalidatePath("/admin/settings");
  return { error: null };
}

/** Hard delete — only for users with no recorded actions (spec §4). */
export async function deleteTeamUser(id: string): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  if (await wouldOrphanSuperAdmin(id)) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", id);
  if ((count ?? 0) > 0) {
    return { error: "This user has recorded actions. Disable or archive instead of deleting." };
  }

  const { error } = await admin.auth.admin.deleteUser(id); // profile row cascades
  if (error) return { error: "Could not delete the account." };

  await recordActivity(actor, "deleted user", "team-user", id);
  revalidatePath("/admin/settings");
  return { error: null };
}
