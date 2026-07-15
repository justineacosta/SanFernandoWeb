"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ChangePasswordValues, UpdateMyProfileValues } from "@/types";
import { requireSessionUser } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short."),
  phone: z.string().trim().max(30, "Phone number is too long."),
});

/** Update the caller's own name + phone. Never accepts an id or email. */
export async function updateMyProfile(input: UpdateMyProfileValues): Promise<ActionResult> {
  const user = await requireSessionUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ? parsed.data.phone : null,
    })
    .eq("id", user.id);
  if (error) return { error: "Could not save your profile." };

  await recordActivity(user, "updated own profile", "profile", user.id);
  revalidatePath("/admin/settings");
  return { error: null };
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(10, "New password needs at least 10 characters."),
});

/** Change the caller's own password after verifying the current one. */
export async function changeMyPassword(input: ChangePasswordValues): Promise<ActionResult> {
  const user = await requireSessionUser();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const supabase = await createSupabaseServerClient();
  // Re-authenticate with the current password to confirm identity before changing it.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    return { error: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    return { error: "Could not update your password." };
  }

  await recordActivity(user, "changed own password", "account", user.id);
  return { error: null };
}
