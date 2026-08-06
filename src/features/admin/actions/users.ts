"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSIONS, type Permission, type StaffStatusLabel } from "@/types";
import { NOT_FOUND, checkSuperAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildFullName } from "@/features/admin/lib/build-full-name";

export interface ActionResult {
  error: string | null;
}

export interface TeamUserInput {
  firstName: string;
  middleName: string; // "" means none
  lastName: string;
  phone: string;
  email: string;
  /** Chosen by the SuperAdmin and handed over out of band — no invite email. */
  password: string;
  statusLabel: StaffStatusLabel;
  permissions: Permission[];
  isSuperAdmin: boolean;
}

const teamUserSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  middleName: z.string().trim(),
  lastName: z.string().trim().min(1, "Last name is required."),
  phone: z.string().trim().min(1, "Enter a mobile number.").max(30, "Phone number is too long."),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(10, "Password needs at least 10 characters."),
  statusLabel: z.enum(["staff", "editor"]),
  permissions: z.array(z.enum(PERMISSIONS)),
  isSuperAdmin: z.boolean(),
});

export interface UpdateTeamUserInput {
  firstName: string;
  middleName: string; // "" means none
  lastName: string;
  statusLabel: StaffStatusLabel;
  permissions: Permission[];
  isSuperAdmin: boolean;
  /** Only honored when editing another user; ignored on the actor's own row. */
  email?: string;
  /** Only honored when editing another user; ignored on the actor's own row. */
  phone?: string;
}

const updateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  middleName: z.string().trim(),
  lastName: z.string().trim().min(1, "Last name is required."),
  statusLabel: z.enum(["staff", "editor"]),
  permissions: z.array(z.enum(PERMISSIONS)),
  isSuperAdmin: z.boolean(),
  email: z.string().email("Enter a valid email.").optional(),
  phone: z.string().trim().max(30, "Phone number is too long.").optional(),
});

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
  const { data, error } = await admin
    .from("profiles")
    .select("is_superadmin, is_active, is_archived")
    .eq("id", id)
    .single();
  // Fail closed: if we cannot verify the target's role, block the mutation.
  if (error || !data) return true;
  const isActiveSuperAdmin =
    data.is_superadmin && data.is_active && !data.is_archived;
  if (!isActiveSuperAdmin) return false;
  return (await activeSuperAdminCount()) <= 1;
}

export async function createTeamUser(input: TeamUserInput): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  const parsed = teamUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const admin = createSupabaseAdminClient();
  const fullName = buildFullName(parsed.data.firstName, parsed.data.middleName, parsed.data.lastName);

  // The SuperAdmin's chosen password, handed to the new staff member out of
  // band. `email_confirm: true` skips Supabase's own address-verification
  // email, so account creation sends nothing at all; someone who loses this
  // password recovers through /admin/forgot-password like anyone else.
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
    first_name: parsed.data.firstName,
    middle_name: parsed.data.middleName || null,
    last_name: parsed.data.lastName,
    full_name: fullName,
    phone: parsed.data.phone,
    status_label: parsed.data.statusLabel,
    permissions: parsed.data.permissions,
    is_superadmin: parsed.data.isSuperAdmin,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Could not save the profile. The account was not created." };
  }

  await recordActivity(actor, {
    type: "create",
    action: "created user",
    entityType: "team-user",
    entityId: data.user.id,
    entityLabel: fullName,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

export async function updateTeamUser(
  id: string,
  input: UpdateTeamUserInput,
): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const isSelf = id === actor.id;
  // A SuperAdmin cannot strip their own SuperAdmin status — another must do it.
  if (isSelf && !parsed.data.isSuperAdmin) {
    return {
      error: "You cannot remove your own SuperAdmin status — another SuperAdmin must do it.",
    };
  }
  if (!parsed.data.isSuperAdmin && (await wouldOrphanSuperAdmin(id))) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const fullName = buildFullName(parsed.data.firstName, parsed.data.middleName, parsed.data.lastName);

  // Email is editable only for OTHER users, and only when it actually changes.
  // Look up the current email so we can skip a no-op auth write and roll back
  // the auth change if the profile write below fails (keeping the two in sync).
  // Read the prior grant so the audit entry can distinguish a permission or
  // SuperAdmin change (role_change) from an ordinary profile edit (update).
  // Who can do what is the highest-stakes thing this action can alter, and
  // burying it under a generic "updated user" would make it unfindable.
  const { data: prior } = await admin
    .from("profiles")
    .select("permissions, is_superadmin")
    .eq("id", id)
    .maybeSingle();
  const priorPermissions = [...((prior?.permissions as string[]) ?? [])].sort();
  const nextPermissions = [...parsed.data.permissions].sort();
  const roleChanged =
    prior !== null &&
    (prior.is_superadmin !== parsed.data.isSuperAdmin ||
      priorPermissions.join(",") !== nextPermissions.join(","));

  let changingEmail = false;
  let previousEmail: string | null = null;
  if (!isSelf && parsed.data.email !== undefined) {
    const { data: current } = await admin
      .from("profiles")
      .select("email")
      .eq("id", id)
      .single();
    if (current && parsed.data.email !== current.email) {
      changingEmail = true;
      previousEmail = current.email;
      const { error: authError } = await admin.auth.admin.updateUserById(id, {
        email: parsed.data.email,
      });
      if (authError) {
        return { error: "That email is already in use." };
      }
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      middle_name: parsed.data.middleName || null,
      last_name: parsed.data.lastName,
      full_name: fullName,
      status_label: parsed.data.statusLabel,
      permissions: parsed.data.permissions,
      is_superadmin: parsed.data.isSuperAdmin,
      ...(changingEmail ? { email: parsed.data.email } : {}),
      ...(!isSelf && parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
    })
    .eq("id", id);
  if (error) {
    // Roll back the auth email so it can't drift from profiles.email.
    if (changingEmail && previousEmail) {
      await admin.auth.admin.updateUserById(id, { email: previousEmail });
    }
    return { error: "Could not save the changes." };
  }

  await recordActivity(actor, {
    type: roleChanged ? "role_change" : "update",
    action: roleChanged ? "changed user permissions" : "updated user",
    entityType: "team-user",
    entityId: id,
    entityLabel: fullName,
    detail: roleChanged
      ? `${parsed.data.isSuperAdmin ? "SuperAdmin" : "Staff"} · ${
          nextPermissions.length > 0 ? nextPermissions.join(", ") : "no permissions"
        }`
      : undefined,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

export async function setTeamUserActive(id: string, isActive: boolean): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  if (id === actor.id) {
    return { error: "You cannot change your own account's active state." };
  }
  if (!isActive && (await wouldOrphanSuperAdmin(id))) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Could not update the account." };

  await recordActivity(actor, {
    type: "update",
    action: isActive ? "enabled user" : "disabled user",
    entityType: "team-user",
    entityId: id,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

export async function archiveTeamUser(id: string): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  if (id === actor.id) {
    return { error: "You cannot archive your own account." };
  }
  if (await wouldOrphanSuperAdmin(id)) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_archived: true, is_active: false })
    .eq("id", id);
  if (error) return { error: "Could not archive the account." };

  await recordActivity(actor, {
    type: "archive",
    action: "archived user",
    entityType: "team-user",
    entityId: id,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

/**
 * Undo of archiveTeamUser. Sign-in is deliberately NOT restored with it:
 * archiving sets `is_active: false`, and bringing someone back onto the roster
 * is a smaller decision than handing them a working login. The account returns
 * to the list marked disabled, and enabling it is a separate, deliberate act.
 */
export async function restoreTeamUser(id: string): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("full_name, is_archived")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };
  if (!target.is_archived) return { error: "That account is not archived." };

  const { error } = await admin
    .from("profiles")
    .update({ is_archived: false })
    .eq("id", id);
  if (error) return { error: "Could not restore the account." };

  await recordActivity(actor, {
    type: "restore",
    action: "restored user",
    entityType: "team-user",
    entityId: id,
    entityLabel: target.full_name,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

/** Hard delete — only for users with no recorded actions (spec §4). */
export async function deleteTeamUser(id: string): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  if (id === actor.id) {
    return { error: "You cannot delete your own account." };
  }
  if (await wouldOrphanSuperAdmin(id)) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();

  // Umbrella §3.2: permanent deletion is reachable only from a record that is
  // already archived. The UI hides Delete outside the Archived view, but the
  // UI is never the gate — this action is a public HTTP endpoint.
  const { data: target } = await admin
    .from("profiles")
    .select("is_archived")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };
  if (!target.is_archived) {
    return { error: "Archive this account before deleting it." };
  }

  const { count, error: countError } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", id);
  if (countError) {
    return { error: "Could not verify this user's activity history. Try again." };
  }
  if ((count ?? 0) > 0) {
    return { error: "This user has recorded actions. Disable or archive instead of deleting." };
  }

  const { error } = await admin.auth.admin.deleteUser(id); // profile row cascades
  if (error) return { error: "Could not delete the account." };

  await recordActivity(actor, {
    type: "delete",
    action: "deleted user",
    entityType: "team-user",
    entityId: id,
  });
  revalidatePath("/admin/users");
  return { error: null };
}
