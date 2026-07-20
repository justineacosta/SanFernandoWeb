"use server";

import { requirePermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  extForType,
  photoUrl,
} from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}
export interface UploadResult {
  error: string | null;
  /** Raw storage path to persist in image_src / cover_src. */
  src: string | null;
  /** Resolved public URL, for immediate preview. */
  url: string | null;
}

/**
 * Upload one image for a single-slot field (announcement image, event cover).
 * Persisting the returned `src` is the caller's job — this keeps the action
 * reusable across tables without a discriminator.
 */
export async function uploadSingleImage(
  folder: "announcements" | "events",
  formData: FormData,
): Promise<UploadResult> {
  await requirePermission("manage-news");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image.", src: null, url: null };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { error: "Images must be JPG, PNG, or WebP.", src: null, url: null };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "The image must be 2 MB or smaller.", src: null, url: null };
  }

  const path = `${folder}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(PUBLIC_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", src: null, url: null };

  return { error: null, src: path, url: photoUrl(path) };
}

/** Delete an owned storage object. A remote seed URL is left alone. */
export async function removeStoredImage(src: string): Promise<ActionResult> {
  await requirePermission("manage-news");
  if (/^https?:\/\//i.test(src)) return { error: null };
  if (!/^(announcements|events)\//.test(src)) {
    return { error: "That image cannot be removed." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove([src]);
  if (error) return { error: "Could not remove the image." };
  return { error: null };
}
