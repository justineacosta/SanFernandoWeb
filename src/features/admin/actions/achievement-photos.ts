"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { GalleryPhoto } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  achievementPhotoPath,
  extForType,
  photoUrl,
} from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}

const MAX_PHOTOS = 3;

const idSchema = z.uuid();
const reorderSchema = z.array(z.uuid()).min(1).max(MAX_PHOTOS);

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function currentPhotos(admin: Admin, achievementId: string) {
  const { data } = await admin
    .from("official_achievement_photos")
    .select("id, src, alt, sort_order")
    .eq("achievement_id", achievementId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

/** Achievements render only on the owning official's profile page. */
async function revalidateForAchievement(admin: Admin, achievementId: string) {
  revalidatePath("/admin/officials");
  const { data: achievement } = await admin
    .from("official_achievements")
    .select("official_id")
    .eq("id", achievementId)
    .maybeSingle();
  if (!achievement) return;
  const { data: official } = await admin
    .from("officials")
    .select("slug")
    .eq("id", achievement.official_id as string)
    .maybeSingle();
  if (official?.slug) revalidatePath(`/officials/${official.slug as string}`);
}

export async function uploadAchievementPhotos(
  achievementId: string,
  formData: FormData,
): Promise<{ error: string | null; photos: GalleryPhoto[] }> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND, photos: [] };
  if (!idSchema.safeParse(achievementId).success) {
    return { error: "Invalid achievement.", photos: [] };
  }

  const admin = createSupabaseAdminClient();
  const { data: achievement } = await admin
    .from("official_achievements")
    .select("id")
    .eq("id", achievementId)
    .maybeSingle();
  if (!achievement) return { error: "Achievement not found.", photos: [] };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one photo.", photos: [] };

  const existing = await currentPhotos(admin, achievementId);
  if (existing.length + files.length > MAX_PHOTOS) {
    return { error: `An achievement can have at most ${MAX_PHOTOS} photos.`, photos: [] };
  }
  // Re-checked server-side: a Server Action is a public HTTP endpoint and the
  // client-side check can simply be skipped.
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { error: "Photos must be JPG, PNG, or WebP.", photos: [] };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: "Each photo must be 2 MB or smaller.", photos: [] };
    }
  }

  let sortOrder = existing.reduce((max, p) => Math.max(max, p.sort_order as number), -1);
  for (const file of files) {
    const path = achievementPhotoPath(achievementId, extForType(file.type));
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(PUBLIC_MEDIA_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return { error: "Upload failed. Try again.", photos: [] };
    sortOrder += 1;
    const { error: insErr } = await admin
      .from("official_achievement_photos")
      .insert({ achievement_id: achievementId, src: path, alt: "", sort_order: sortOrder });
    if (insErr) return { error: "Upload failed. Try again.", photos: [] };
  }

  await recordActivity(actor, {
    type: "file_upload",
    action: "uploaded achievement photos",
    entityType: "official achievement",
    entityId: achievementId,
  });
  await revalidateForAchievement(admin, achievementId);
  const refreshed = await currentPhotos(admin, achievementId);
  return {
    error: null,
    photos: refreshed.map((p) => ({
      id: p.id as string,
      src: photoUrl(p.src as string),
      alt: p.alt as string,
    })),
  };
}

export async function reorderAchievementPhotos(
  achievementId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };
  if (!idSchema.safeParse(achievementId).success) return { error: "Invalid achievement." };
  if (!reorderSchema.safeParse(orderedIds).success) return { error: "Invalid ordering." };

  const admin = createSupabaseAdminClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from("official_achievement_photos")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("achievement_id", achievementId);
    if (error) return { error: "Could not reorder photos." };
  }

  await recordActivity(actor, {
    type: "reorder",
    action: "reordered achievement photos",
    entityType: "official achievement",
    entityId: achievementId,
  });
  await revalidateForAchievement(admin, achievementId);
  return { error: null };
}

export async function updateAchievementPhotoAlt(
  photoId: string,
  alt: string,
): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };
  if (!idSchema.safeParse(photoId).success) return { error: "Invalid photo." };
  if (typeof alt !== "string" || alt.length > 200) {
    return { error: "Keep the description under 200 characters." };
  }

  const admin = createSupabaseAdminClient();
  const { data: photo } = await admin
    .from("official_achievement_photos")
    .select("id, achievement_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { error: "Could not update the photo description." };

  const { error } = await admin
    .from("official_achievement_photos")
    .update({ alt })
    .eq("id", photoId);
  if (error) return { error: "Could not update the photo description." };

  const achievementId = photo.achievement_id as string;
  await recordActivity(actor, {
    type: "update",
    action: "updated achievement photo description",
    entityType: "official achievement",
    entityId: achievementId,
  });
  await revalidateForAchievement(admin, achievementId);
  return { error: null };
}

export async function removeAchievementPhoto(photoId: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };
  if (!idSchema.safeParse(photoId).success) return { error: "Invalid photo." };

  const admin = createSupabaseAdminClient();
  const { data: photo } = await admin
    .from("official_achievement_photos")
    .select("id, src, achievement_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { error: null }; // already gone

  const { error } = await admin
    .from("official_achievement_photos")
    .delete()
    .eq("id", photoId);
  if (error) return { error: "Could not remove the photo." };

  // Only once the row is gone: an object deleted ahead of a failed row delete
  // would leave a live photo row pointing at nothing. Only delete an object we
  // own, never a remote URL.
  if (!/^https?:\/\//i.test(photo.src as string)) {
    const { error: removeErr } = await admin.storage
      .from(PUBLIC_MEDIA_BUCKET)
      .remove([photo.src as string]);
    if (removeErr) {
      // A failed cleanup must not fail the removal the user just made, but the
      // orphan it leaves is invisible otherwise — log the path for a human.
      console.error(`Orphaned storage object (photo cleanup failed): ${photo.src as string}`);
    }
  }

  const achievementId = photo.achievement_id as string;
  await recordActivity(actor, {
    type: "file_delete",
    action: "removed achievement photo",
    entityType: "official achievement",
    entityId: achievementId,
  });
  await revalidateForAchievement(admin, achievementId);
  return { error: null };
}
