import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  extForType,
  photoUrl,
} from "@/lib/storage";

/**
 * NOT a "use server" module, and deliberately NOT audited. It moved here from
 * `features/admin/actions/` when it stopped being an action.
 *
 * Both used to be true the other way round. The uploader widget called
 * `uploadSingleImage` directly on file-select, so it had to be a Server Action
 * and it earned its own `file_upload` entry. Sub-project 7 moved the upload
 * inside the save actions (announcements / events / officials), which changed
 * two things:
 *
 * 1. Nothing client-side imports this any more, so keeping it as a Server
 *    Action would leave a public HTTP endpoint whose whole job is to put an
 *    object in storage that no row references — the exact orphan this
 *    sub-project exists to prevent. `server-only` removes the endpoint.
 * 2. Every caller is now a step inside an action that records its own
 *    create/update/delete entry, so per-file entries would duplicate it.
 *    Worse, `removeStoredImage` is also the compensating-delete path: it runs
 *    when a save FAILS, and a `file_delete` entry from there would claim a
 *    deletion for an operation the user never completed.
 *
 * This mirrors documents.ts, which has been shaped this way since 2026-07-20.
 */

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

// `site` is the Home/About CMS prefix (sub-project 9). It shares this helper
// rather than getting its own uploader: a carousel slide, a history photo and
// the get-involved banner are all single-slot images with the same 2 MB / JPG-
// PNG-WebP rules as an official's portrait.
export type ImageFolder = "announcements" | "events" | "officials" | "site";

/**
 * Upload one image for a single-slot field (announcement image, event cover,
 * official portrait). Persisting the returned `src` is the caller's job, and so
 * is deleting the object if the row write then fails — see the `fail()` helper
 * in each save action. This keeps the helper reusable across tables without a
 * discriminator.
 *
 * The type/size checks are repeated here even though the caller's Zod schema
 * never sees the file: this is the last place that can reject a 40 MB "image"
 * before it reaches the bucket.
 */
export async function uploadSingleImage(
  folder: ImageFolder,
  file: File,
): Promise<UploadResult> {
  if (file.size === 0) return { error: "Choose an image.", src: null, url: null };
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
  if (/^https?:\/\//i.test(src)) return { error: null };
  // Every owned path is `<folder>/<uuid>.<ext>` written by this module or by
  // newsPhotoPath/achievementPhotoPath. Reject anything else — and any `..`
  // segment — rather than handing an arbitrary string to storage.remove().
  // `site/` covers both shapes the CMS stores: `site/<uuid>.<ext>` written by
  // uploadSingleImage, and the deterministic seed paths (site/hero-*.jpg)
  // scripts/upload-site-images.mjs populates. Leaving it out of this allow-list
  // would silently turn every replaced carousel photo into a logged orphan.
  if (!/^(announcements|events|officials|news|achievements|site)\//.test(src)) {
    return { error: "That image cannot be removed." };
  }
  if (src.split("/").some((segment) => segment === "..")) {
    return { error: "That image cannot be removed." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove([src]);
  if (error) return { error: "Could not remove the image." };
  return { error: null };
}

/**
 * Best-effort cleanup for an object the user's edit orphaned — a replaced
 * portrait, a removed cover, the media of a record being deleted.
 *
 * Never fails the caller: by the time this runs the row write has already
 * succeeded, and telling someone their save failed because a leftover file
 * could not be tidied would be both untrue and unactionable. The orphan is
 * invisible otherwise, so the path is logged for a human.
 */
export async function discardImage(src: string | null, context: string): Promise<void> {
  if (!src) return;
  const { error } = await removeStoredImage(src);
  if (error) console.error(`Orphaned storage object (${context}): ${src}`);
}
