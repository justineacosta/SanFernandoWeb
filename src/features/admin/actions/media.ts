"use server";

import type { Permission } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
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
  /** Raw storage path to persist in image_src / cover_src / photo_path. */
  src: string | null;
  /** Resolved public URL, for immediate preview. */
  url: string | null;
}

export type ImageFolder = "announcements" | "events" | "officials";

/**
 * Which permission owns each folder. `folder` arrives from a client component
 * over a Server Action — a public HTTP endpoint — so an unknown value must be
 * rejected rather than fed to checkPermission(). Returning null here is what
 * stops a caller from inventing a folder to dodge the permission check.
 */
function permissionForFolder(folder: string): Permission | null {
  if (folder === "announcements" || folder === "events") return "manage-news";
  if (folder === "officials") return "manage-officials";
  return null;
}

/**
 * Upload one image for a single-slot field (announcement image, event cover,
 * official portrait). Persisting the returned `src` is the caller's job — this
 * keeps the action reusable across tables without a discriminator.
 */
export async function uploadSingleImage(
  folder: ImageFolder,
  formData: FormData,
): Promise<UploadResult> {
  const permission = permissionForFolder(folder);
  if (!permission) return { error: "Unknown upload folder.", src: null, url: null };
  const actor = await checkPermission(permission);
  if (!actor) return { error: NOT_FOUND, src: null, url: null };

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

  await recordActivity(actor, {
    type: "file_upload",
    action: "uploaded image",
    entityType: `${folder} image`,
    entityId: path,
    entityLabel: file.name,
  });
  return { error: null, src: path, url: photoUrl(path) };
}

/** Delete an owned storage object. A remote seed URL is left alone. */
export async function removeStoredImage(src: string): Promise<ActionResult> {
  if (/^https?:\/\//i.test(src)) return { error: null };

  const folder = src.split("/")[0] ?? "";
  const permission = permissionForFolder(folder);
  if (!permission) return { error: "That image cannot be removed." };
  const actor = await checkPermission(permission);
  if (!actor) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove([src]);
  if (error) return { error: "Could not remove the image." };

  // Also fires for the deferred cleanup inside saveOfficial when a portrait is
  // replaced. That is a real file deletion the user's edit caused, so it earns
  // its own entry rather than hiding inside the "updated official" one.
  await recordActivity(actor, {
    type: "file_delete",
    action: "deleted image",
    entityType: `${folder} image`,
    entityId: src,
  });
  return { error: null };
}
