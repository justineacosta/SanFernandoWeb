import type { ContentStatus } from "@/types";

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

/**
 * Map an allowed MIME type to a file extension. Originally image-only; now
 * also used by `uploadTicketAttachment`, whose ALLOWED_DOC_FILE_TYPES include
 * PDFs, so `application/pdf` must resolve to `pdf` rather than falling
 * through to the `jpg` default.
 */
export function extForType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "application/pdf") return "pdf";
  return "jpg";
}

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

/** The three document/PDF upload surfaces the Route Handler at
 * /api/admin/uploads/document (security-hardening Plan 3) serves. */
export type DocUploadKind = "legislative" | "documents" | "projects";

export interface DocUploadRules {
  mediaKind: "legislative" | "transparency";
  allowedTypes: readonly string[];
  maxBytes: number;
  maxFiles: number;
}

/**
 * Validation ceiling per upload kind. Legislative accepts exactly one PDF;
 * transparency documents/projects accept up to MAX_FILES_PER_RECORD
 * PDF-or-image files each — mirrors the rules `uploadDocumentPdf`/
 * `uploadTransparencyFile` used to enforce before this plan moved them into
 * the Route Handler.
 */
export function uploadRulesFor(kind: DocUploadKind): DocUploadRules {
  if (kind === "legislative") {
    return { mediaKind: "legislative", allowedTypes: ALLOWED_PDF_TYPES, maxBytes: MAX_PDF_BYTES, maxFiles: 1 };
  }
  return {
    mediaKind: "transparency",
    allowedTypes: ALLOWED_DOC_FILE_TYPES,
    maxBytes: MAX_DOC_FILE_BYTES,
    maxFiles: MAX_FILES_PER_RECORD,
  };
}

/** File extension for an allowed document MIME type. */
export function extForDocType(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg"; // image/jpeg
}

/**
 * The MIME type the first bytes actually claim, or null when they match none
 * of the four types this site accepts.
 *
 * `file.type` is supplied by whatever posted the request and is not evidence
 * of anything — and every uploader here then hands that same unverified string
 * to Storage as `contentType`. This reads the bytes instead. Callers reject on
 * `sniffMimeType(buffer) !== file.type`, which makes an unrecognised file a
 * rejection without needing a separate branch for it.
 *
 * Deliberately pure and dependency-free: this module must stay importable by
 * Vitest, which cannot load anything that transitively pulls in a Supabase
 * client — and a byte-signature check is exactly the kind of logic the browser
 * suite cannot reach.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  const startsWith = (offset: number, signature: readonly number[]): boolean =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, i) => bytes[offset + i] === byte);

  // 0x89 P N G CR LF SUB LF — the longest of the four, and self-verifying.
  if (startsWith(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // SOI plus the first marker byte; the marker's own second byte varies by encoder.
  if (startsWith(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // "RIFF" <4-byte size> "WEBP" — the offset-8 tag is what separates a WebP
  // from every other RIFF container (AVI, WAV), so both halves are required.
  if (startsWith(0, [0x52, 0x49, 0x46, 0x46]) && startsWith(8, [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp";
  }
  // "%PDF-"
  if (startsWith(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";

  return null;
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
 * is deliberately no `feedbackScreenshotUrl()` twin of `mediaUrl` for the same
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

/**
 * Resident reply attachments. Private for the same reason feedback-media is:
 * an attachment here is typically a photo of the resident's own ID, and
 * Storage's list() rides the same RLS select policy as an individual get().
 */
export const TICKET_MEDIA_BUCKET = "ticket-media";

/**
 * 3 files x 2 MB = 6 MB, deliberately under next.config.ts's
 * bodySizeLimit: "8mb". This is what lets resident-supplied ticket attachments
 * ride inside the Server Action instead of needing a Route Handler — and the
 * Plan 3 document handler is authenticated, so a public twin of it would be the
 * largest new attack surface in this feature. Do NOT raise these to fit a 10 MB scan.
 */
export const MAX_TICKET_FILES = 3;
export const MAX_TICKET_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
