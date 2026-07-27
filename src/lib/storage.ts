import type { ContentStatus } from "@/types";

export const PUBLIC_MEDIA_BUCKET = "public-media";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB (spec §5)

/**
 * Source ceiling for the avatar picker, enforced client-side only.
 *
 * Larger than MAX_IMAGE_BYTES on purpose. The avatar cropper re-encodes the
 * chosen region to AVATAR_OUTPUT_PX before anything is uploaded, so the source
 * file and the uploaded file stopped being the same thing: a raw phone photo is
 * a legitimate input while what reaches the bucket is a ~50 KB WebP. The 2 MB
 * check in uploadSingleImage still stands and still passes.
 */
export const MAX_AVATAR_SOURCE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Types the avatar picker accepts as a *source*. A narrower set than
 * ALLOWED_IMAGE_TYPES (no WebP): a camera roll is JPGs and screenshots are PNGs,
 * and the cropper re-encodes to WebP regardless, so accepting a WebP source buys
 * nothing. The output is still a WebP that ALLOWED_IMAGE_TYPES admits server-side.
 */
export const ALLOWED_AVATAR_SOURCE_TYPES = ["image/jpeg", "image/png"] as const;

/** Side of the square every avatar is normalised to, in pixels. */
export const AVATAR_OUTPUT_PX = 512;

/**
 * The six content types with a draft → in-review → published → archived
 * lifecycle. Each gets a public/private bucket pair — see `publicBucketFor`
 * / `draftBucketFor`. Achievement photos ride on their parent official's
 * status and use the "officials" kind; they have no lifecycle of their own.
 */
export type MediaKind =
  | "news"
  | "officials"
  | "events"
  | "announcements"
  | "legislative"
  | "transparency";

/** The world-readable bucket for a content type — published media only. */
export function publicBucketFor(kind: MediaKind): string {
  return `${kind}-media`;
}

/** The service-role-only bucket for a content type — draft/in-review/archived media. */
export function draftBucketFor(kind: MediaKind): string {
  return `${kind}-drafts`;
}

/** Which bucket a status-aware type's media currently lives in. */
export function bucketForStatus(kind: MediaKind, status: ContentStatus): string {
  return status === "published" ? publicBucketFor(kind) : draftBucketFor(kind);
}

/** Home/About images — Save writes live, so there is no draft state to stage. */
export const SITE_MEDIA_BUCKET = "site-media";

/** Staff avatars — own-photo-only, no review step, no draft state either. */
export const AVATARS_MEDIA_BUCKET = "avatars-media";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * Resolve a stored path to a public URL for a bucket that is actually
 * public. A full remote URL (seed rows) passes through unchanged. Callers
 * must not use this for a `-drafts` bucket — see `resolveMediaUrl` in
 * `media-lifecycle.ts`, which signs a URL instead when the bucket is private.
 */
export function mediaUrl(bucket: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * Resolve a stored image reference to a usable `next/image` src. A reference is
 * either a full remote URL (seed rows keep their original lh3 URLs) or a
 * `public-media` object path (uploaded photos).
 */
export function photoUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return `${SUPABASE_URL}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${src}`;
}

/** Storage object path for a news photo: `news/<articleId>/<uuid>.<ext>`. */
export function newsPhotoPath(articleId: string, ext: string): string {
  return `news/${articleId}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Storage object path for an achievement photo:
 * `achievements/<achievementId>/<uuid>.<ext>`. Mirrors newsPhotoPath so the
 * bucket keeps one convention for "photos belonging to a record".
 */
export function achievementPhotoPath(achievementId: string, ext: string): string {
  return `achievements/${achievementId}/${crypto.randomUUID()}.${ext}`;
}

/** Map an allowed image MIME type to a file extension. */
export function extForType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export const PUBLIC_DOCUMENTS_BUCKET = "public-documents";

export const ALLOWED_PDF_TYPES = ["application/pdf"] as const;
export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB (spec §4 — scanned ordinances run big)

// Documents & projects accept PDF *or* image, up to 3 files, 10 MB each (Plan 5).
export const ALLOWED_DOC_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export const MAX_DOC_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_FILES_PER_RECORD = 3;

/** File extension for an allowed document MIME type. */
export function extForDocType(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg"; // image/jpeg
}

/**
 * Resolve a stored document reference to a public URL. Mirrors photoUrl()'s
 * contract: a full remote URL passes through unchanged, a bare object path
 * resolves against the documents bucket.
 */
export function documentUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${PUBLIC_DOCUMENTS_BUCKET}/${path}`;
}

/** Human-readable file size for download affordances, e.g. "2.4 MB". */
export function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Feedback screenshots. A PRIVATE bucket, unlike the two above: a screenshot of
 * the page a resident was on can contain their own account page or ticket. There
 * is deliberately no `feedbackScreenshotUrl()` twin of `photoUrl` for the same
 * reason — every read has to mint a short-lived signed URL through the admin
 * client, which is why signing lives in `features/admin/queries/feedback.ts`.
 */
export const FEEDBACK_MEDIA_BUCKET = "feedback-media";

/** Same ceiling as every other image on the site. */
export const MAX_SCREENSHOT_BYTES = MAX_IMAGE_BYTES;

/** Storage object path for a feedback screenshot: `feedback/<uuid>.<ext>`. */
export function feedbackScreenshotPath(ext: string): string {
  return `feedback/${crypto.randomUUID()}.${ext}`;
}
