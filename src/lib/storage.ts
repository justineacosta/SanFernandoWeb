export const PUBLIC_MEDIA_BUCKET = "public-media";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB (spec §5)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

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
