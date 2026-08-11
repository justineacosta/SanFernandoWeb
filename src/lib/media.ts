import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ContentStatus } from "@/types";
import {
  ALLOWED_DOC_FILE_TYPES,
  ALLOWED_IMAGE_TYPES,
  AVATARS_MEDIA_BUCKET,
  FEEDBACK_MEDIA_BUCKET,
  MAX_IMAGE_BYTES,
  MAX_TICKET_FILE_BYTES,
  MAX_SCREENSHOT_BYTES,
  SITE_MEDIA_BUCKET,
  TICKET_MEDIA_BUCKET,
  bucketForStatus,
  extForType,
  feedbackScreenshotPath,
  mediaUrl,
  sniffMimeType,
} from "@/lib/storage";
import { resolveMediaUrl } from "@/lib/media-lifecycle";

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
export type ImageFolder = "announcements" | "events" | "officials" | "site" | "avatars";

/**
 * `"site"`/`"avatars"` have no draft/published split (Save writes live for
 * both), so `status` is ignored for them — callers pass `null`. The other
 * three folders share their name with a `MediaKind`.
 */
function bucketForUpload(folder: ImageFolder, status: ContentStatus | null): string {
  if (folder === "site") return SITE_MEDIA_BUCKET;
  if (folder === "avatars") return AVATARS_MEDIA_BUCKET;
  return bucketForStatus(folder, status ?? "draft");
}

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
  status: ContentStatus | null,
  file: File,
): Promise<UploadResult> {
  if (file.size === 0) return { error: "Choose an image.", src: null, url: null };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { error: "Images must be JPG, PNG, or WebP.", src: null, url: null };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "The image must be 2 MB or smaller.", src: null, url: null };
  }

  const bucket = bucketForUpload(folder, status);
  const path = `${folder}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (sniffMimeType(buffer) !== file.type) {
    return { error: "Images must be JPG, PNG, or WebP.", src: null, url: null };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", src: null, url: null };

  // "site"/"avatars" have no draft state (always public); the other three
  // folders share their name with a MediaKind and can be `-drafts`-bucketed,
  // so resolving must go through resolveMediaUrl to sign a URL when the
  // record isn't published — mirroring documents.ts's uploadDocumentPdf.
  const url =
    folder === "site" || folder === "avatars"
      ? mediaUrl(bucket, path)
      : await resolveMediaUrl(folder, status ?? "draft", path);
  return { error: null, src: path, url };
}

/** Delete an owned storage object. A remote seed URL is left alone. */
export async function removeStoredImage(
  folder: ImageFolder,
  status: ContentStatus | null,
  src: string,
): Promise<ActionResult> {
  if (/^https?:\/\//i.test(src)) return { error: null };
  if (!/^(announcements|events|officials|news|achievements|site|avatars)\//.test(src)) {
    return { error: "That image cannot be removed." };
  }
  if (src.split("/").some((segment) => segment === "..")) {
    return { error: "That image cannot be removed." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucketForUpload(folder, status)).remove([src]);
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
export async function discardImage(
  folder: ImageFolder,
  status: ContentStatus | null,
  src: string | null,
  context: string,
): Promise<void> {
  if (!src) return;
  const { error } = await removeStoredImage(folder, status, src);
  if (error) console.error(`Orphaned storage object (${context}): ${src}`);
}

/**
 * Upload one feedback screenshot into the private bucket.
 *
 * A separate function from `uploadSingleImage` rather than a new `ImageFolder`:
 * that helper writes to `public-media` and hands back a public URL, and neither
 * is true here. `url` comes back null on purpose — a private object has no
 * stable URL, and the admin queue signs one per page load.
 *
 * As with every uploader here, persisting the returned `src` is the caller's
 * job, and so is deleting the object if the row write then fails.
 */
export async function uploadFeedbackScreenshot(file: File): Promise<UploadResult> {
  if (file.size === 0) return { error: "Choose an image.", src: null, url: null };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { error: "Screenshots must be JPG, PNG, or WebP.", src: null, url: null };
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return { error: "The screenshot must be 2 MB or smaller.", src: null, url: null };
  }

  const path = feedbackScreenshotPath(extForType(file.type));
  const buffer = Buffer.from(await file.arrayBuffer());
  // Second anonymous upload path on the site, and it carries the same weakness
  // the ticket path did — the backlog named only the ticket one.
  if (sniffMimeType(buffer) !== file.type) {
    return { error: "Screenshots must be JPG, PNG, or WebP.", src: null, url: null };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(FEEDBACK_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", src: null, url: null };

  return { error: null, src: path, url: null };
}

/**
 * Delete a feedback screenshot. `removeStoredImage`'s allow-list is
 * public-media-specific, so this keeps its own — `feedback/` is the only prefix
 * ever written into that bucket, and an arbitrary string must never reach
 * storage.remove().
 */
export async function removeFeedbackScreenshot(path: string): Promise<ActionResult> {
  if (!/^feedback\//.test(path)) return { error: "That screenshot cannot be removed." };
  if (path.split("/").some((segment) => segment === "..")) {
    return { error: "That screenshot cannot be removed." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(FEEDBACK_MEDIA_BUCKET).remove([path]);
  if (error) return { error: "Could not remove the screenshot." };
  return { error: null };
}

/** Best-effort cleanup, mirroring `discardImage`: logs an orphan, never throws. */
export async function discardFeedbackScreenshot(
  path: string | null,
  context: string,
): Promise<void> {
  if (!path) return;
  const { error } = await removeFeedbackScreenshot(path);
  if (error) console.error(`Orphaned screenshot (${context}): ${path}`);
}

/**
 * Upload one resident reply attachment into the private ticket-media bucket.
 *
 * Separate from `uploadFeedbackScreenshot` because the bucket, the prefix and
 * the allowed types differ — replies accept PDFs, screenshots do not. As with
 * every uploader here, persisting the returned `src` is the caller's job, and
 * so is deleting the object if the row write then fails.
 */
export async function uploadTicketAttachment(
  file: File,
  ticketNo: string,
): Promise<UploadResult> {
  if (file.size === 0) return { error: "Choose a file.", src: null, url: null };
  if (!ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number])) {
    return { error: "Attachments must be JPG, PNG, WebP, or PDF.", src: null, url: null };
  }
  if (file.size > MAX_TICKET_FILE_BYTES) {
    return { error: "Each attachment must be 2 MB or smaller.", src: null, url: null };
  }
  // ticketNo is server-derived (matched against the DB), never client free text.
  const path = `${ticketNo}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // file.type got us this far, but it is the caller's own claim. The bytes have
  // to agree with it. Same rejection string as the declared-type check above,
  // deliberately: a prober must not learn which of the two it tripped.
  if (sniffMimeType(buffer) !== file.type) {
    return { error: "Attachments must be JPG, PNG, WebP, or PDF.", src: null, url: null };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(TICKET_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", src: null, url: null };
  return { error: null, src: path, url: null };
}

/** Best-effort cleanup, mirroring `discardFeedbackScreenshot`: logs, never throws. */
export async function discardTicketAttachment(
  path: string | null,
  context: string,
): Promise<void> {
  if (!path) return;
  // Same fixed-prefix allow-list `removeStoredImage` and `removeFeedbackScreenshot`
  // apply before any storage.remove(): today every caller passes a path this module
  // minted moments earlier in the same request, but an arbitrary string must never
  // reach storage.remove() on the strength of that — the next call site added won't
  // necessarily hold. `<TICKET_NO>/<uuid>.<ext>` is the only shape ever written here.
  if (!/^(APP|APT|CMP|AST)-\d{4}-\d{5,}\//.test(path)) return;
  if (path.split("/").some((segment) => segment === "..")) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(TICKET_MEDIA_BUCKET).remove([path]);
  if (error) console.error(`Orphaned ticket attachment (${context}): ${path}`);
}
