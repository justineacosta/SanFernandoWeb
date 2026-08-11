/**
 * Shrink an oversized resident attachment in the browser so it fits the
 * ticket-media cap, instead of rejecting a photo the resident cannot easily
 * resize on a phone.
 *
 * Structured after `src/lib/crop-image.ts`: canvas work happens inside function
 * bodies only and nothing touches `document` at module scope, so the pure
 * exports below stay importable by Vitest, which runs with no DOM.
 */

/**
 * Longest-edge bounds tried in order. Bounded and named rather than a
 * shrink-until-it-fits loop: a corrupt or pathological image must not be able
 * to spin the main thread.
 */
export const DOWNSCALE_EDGE_LADDER = [2048, 1600, 1200, 900] as const;

/** JPEG/WebP quality for every re-encode step. */
const DOWNSCALE_QUALITY = 0.82;

/**
 * `width`x`height` scaled so neither side exceeds `maxEdge`, aspect preserved.
 * Sides are whole pixels and never zero — a canvas with a zero side throws.
 */
export function scaleToFit(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** Decode a File into an image element, or null if it is not a usable image. */
async function decodeFile(file: File): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Original basename with `ext` swapped in, so staff see a real filename. */
function renamed(original: string, ext: string): string {
  const base = original.replace(/\.[^./\\]+$/, "") || "attachment";
  return `${base}.${ext}`;
}

/**
 * An attachment small enough to upload, or null if it cannot be made small
 * enough. A null is a normal, visible rejection at the call site — never a
 * silent drop.
 *
 * PDFs are returned untouched: there is no lossless way to shrink one here, and
 * re-encoding is not an option. An image already under the cap is also returned
 * untouched — re-encoding a 300 KB photo costs quality and buys nothing.
 */
export async function downscaleImageFile(file: File, maxBytes: number): Promise<File | null> {
  if (!file.type.startsWith("image/")) return file.size <= maxBytes ? file : null;
  if (file.size <= maxBytes) return file;

  const image = await decodeFile(file);
  if (!image) return null;

  for (const maxEdge of DOWNSCALE_EDGE_LADDER) {
    const size = scaleToFit(image.naturalWidth, image.naturalHeight, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, size.width, size.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", DOWNSCALE_QUALITY);
    });
    if (!blob) return null;
    if (blob.size > maxBytes) continue;

    // The type comes from the blob, NEVER from what we asked for. toBlob falls
    // back to image/png where WebP encoding is unavailable, and the server
    // compares the uploaded bytes against the DECLARED type (sniffMimeType) —
    // so a hardcoded "image/webp" would get a perfectly valid PNG rejected as a
    // mismatch. crop-image.ts documents this same trap for the avatar cropper.
    const mime = blob.type || "image/webp";
    const ext = mime === "image/png" ? "png" : "webp";
    return new File([blob], renamed(file.name, ext), { type: mime });
  }

  return null;
}
