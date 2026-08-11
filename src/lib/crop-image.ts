import { AVATAR_OUTPUT_PX } from "@/lib/storage";

/**
 * Canvas work for the avatar cropper, plus the two pure helpers it is built on.
 *
 * Browser-only in practice, but deliberately not marked `client-only`: the pure
 * exports below are unit-tested under Vitest, which has no DOM. Nothing here
 * touches `document` outside a function body, so importing the module in node is
 * safe.
 */

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box of a `width`×`height` rectangle rotated `degrees` about its centre. */
export function rotatedBoundingBox(width: number, height: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height),
    height: Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height),
  };
}

/**
 * Side of the output square for a crop `cropWidth` source pixels wide. Clamped
 * to AVATAR_OUTPUT_PX and never larger than the crop itself — resampling a 300px
 * region up to 512px would only add blur.
 */
export function outputSizeFor(cropWidth: number, max = AVATAR_OUTPUT_PX): number {
  return Math.max(1, Math.min(max, Math.floor(cropWidth)));
}

/**
 * Decode an object URL into an image element, or null if the file is not a
 * usable image. Resolving null rather than throwing keeps the caller's error
 * path to a single branch — a corrupt JPEG and an unsupported codec have the
 * same remedy: pick another file.
 */
export function decodeImageUrl(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Draw `pixelCrop` out of an already-decoded image and hand back a square WebP
 * File, or null if the browser could not produce one.
 *
 * Two canvases, in this order, because that is the coordinate space
 * react-easy-crop reports in: `croppedAreaPixels` is measured against the
 * *rotated* image, so the whole image is rotated onto its bounding box first and
 * the crop rectangle is lifted out of that second. Cropping first and rotating
 * after would silently offset every non-zero rotation.
 */
export async function cropFromImage(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  rotation: number,
): Promise<File | null> {
  const { naturalWidth, naturalHeight } = image;
  const box = rotatedBoundingBox(naturalWidth, naturalHeight, rotation);

  const stage = document.createElement("canvas");
  stage.width = Math.round(box.width);
  stage.height = Math.round(box.height);
  const stageCtx = stage.getContext("2d");
  if (!stageCtx) return null;
  stageCtx.translate(stage.width / 2, stage.height / 2);
  stageCtx.rotate((rotation * Math.PI) / 180);
  stageCtx.drawImage(image, -naturalWidth / 2, -naturalHeight / 2);

  const size = outputSizeFor(pixelCrop.width);
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(
    stage,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    out.toBlob(resolve, "image/webp", 0.9);
  });
  if (!blob) return null;
  // toBlob(callback, "image/webp", quality) silently falls back to image/png
  // on a browser that can't encode WebP (e.g. pre-16.4 Safari) — take the type
  // from what the blob actually is, not what we asked for, so the upload-time
  // sniffMimeType check downstream doesn't reject a valid PNG fallback as a
  // mismatch.
  return new File([blob], "avatar.webp", { type: blob.type || "image/webp" });
}
