"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ChangePasswordValues, UpdateMyProfileValues } from "@/types";
import { requireSessionUser } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { discardImage, removeStoredImage, uploadSingleImage } from "@/lib/media";

export interface ActionResult {
  error: string | null;
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short."),
  phone: z.string().trim().max(30, "Phone number is too long."),
});

/**
 * Update the caller's own name, phone and photo. Never accepts an id or email.
 *
 * The avatar arrives as its own FormData rather than inside `input`, mirroring
 * `saveOfficial`: a File does not belong in a zod-validated plain object, and
 * keeping it separate is what lets the uploader stay a pure file picker that
 * makes no network calls of its own.
 */
export async function updateMyProfile(
  input: UpdateMyProfileValues,
  avatarForm: FormData,
): Promise<ActionResult> {
  const user = await requireSessionUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  // Upload first, then compensate on any later failure — the invariant is that
  // a storage object exists only if a row references it.
  const incoming = avatarForm.get("image");
  const removeAvatar = avatarForm.get("removeImage") === "1";
  let uploadedPath: string | null = null;
  if (incoming instanceof File && incoming.size > 0) {
    const uploaded = await uploadSingleImage("avatars", incoming);
    if (uploaded.error) return { error: uploaded.error };
    uploadedPath = uploaded.src;
  }

  async function fail(error: string): Promise<ActionResult> {
    if (uploadedPath) {
      const removed = await removeStoredImage(uploadedPath);
      if (removed.error) {
        console.error(`Orphaned storage object (compensating delete failed): ${uploadedPath}`);
      }
    }
    return { error };
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("profiles")
    .select("avatar_src")
    .eq("id", user.id)
    .maybeSingle();
  if (readErr || !existing) return fail("Could not save your profile.");

  const previousPath = existing.avatar_src as string | null;
  const nextPath = uploadedPath ?? (removeAvatar ? null : previousPath);

  const { error } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ? parsed.data.phone : null,
      avatar_src: nextPath,
    })
    .eq("id", user.id);
  if (error) return fail("Could not save your profile.");

  // Deferred delete: only once the row no longer references the old photo.
  if (previousPath && previousPath !== nextPath) {
    await discardImage(previousPath, "avatar replaced");
  }

  await recordActivity(user, {
    type: "update",
    action: "updated own profile",
    entityType: "profile",
    entityId: user.id,
  });
  revalidatePath("/admin/settings");
  // The top bar renders the avatar from the portal layout, so revalidating the
  // settings page alone leaves the header showing stale initials until a hard
  // reload.
  revalidatePath("/admin", "layout");
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

  await recordActivity(user, {
    type: "password_reset",
    action: "changed own password",
    entityType: "account",
    entityId: user.id,
  });
  return { error: null };
}
