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
