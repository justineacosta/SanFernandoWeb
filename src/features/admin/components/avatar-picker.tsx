"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { UploadCloud } from "lucide-react";
import { ImageCropperDialog } from "@/components/ui/image-cropper-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { cropFromImage, decodeImageUrl, type PixelCrop } from "@/lib/crop-image";
import { ALLOWED_AVATAR_SOURCE_TYPES, AVATARS_MEDIA_BUCKET, MAX_AVATAR_SOURCE_BYTES, mediaUrl } from "@/lib/storage";

interface AvatarPickerProps {
  /** Storage path already on the profile, or null. */
  existingSrc: string | null;
  /** The cropped, not-yet-uploaded file, or null. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** True once the user has asked to drop the stored photo; applies on save. */
  removeExisting: boolean;
  onRemoveExistingChange: (remove: boolean) => void;
}

/**
 * The profile photo as a control: click the circle, crop what you picked, save.
 *
 * Not a variant of SingleImageUploader. That component is a rectangle-first
 * drop-box with an alt-text field and four other consumers, and the two share
 * nothing but the words "pick a file" — folding a cropper, a circular hover state
 * and an 8 MB source ceiling into it would have made every announcement image and
 * event cover pay for the avatar's requirements.
 *
 * Like every uploader in this codebase it makes NO network calls. The crop
 * becomes a File in the parent's state and reaches storage only when
 * updateMyProfile runs on Save, so a cancelled crop cannot orphan an object.
 */
export function AvatarPicker({
  existingSrc,
  file,
  onFileChange,
  removeExisting,
  onRemoveExistingChange,
}: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // The cropped result's preview URL. Owned here and revoked on replace, on
  // unmount, and when the parent resets `file` to null after a successful save —
  // the Settings card is a long-lived mount that never unmounts, so an
  // unmount-only cleanup would leak one object URL per save.
  const previewRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // The source being edited: its object URL for the dialog, and the decoded
  // element the canvas draws from. The element sits in a ref because nothing
  // renders it and a new one must not trigger a render of its own.
  const sourceUrlRef = useRef<string | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
  }, []);

  useEffect(() => {
    if (!file && previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
      setPreview(null);
    }
  }, [file]);

  function closeCropper() {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = null;
    sourceImageRef.current = null;
    setSourceUrl(null);
  }

  async function pick(candidate: File | undefined) {
    if (!candidate) return;
    setError(null);
    if (!ALLOWED_AVATAR_SOURCE_TYPES.includes(candidate.type as (typeof ALLOWED_AVATAR_SOURCE_TYPES)[number])) {
      setError("Images must be JPG or PNG.");
      return;
    }
    if (candidate.size > MAX_AVATAR_SOURCE_BYTES) {
      setError("The image must be 5 MB or smaller.");
      return;
    }

    // Decoded before the dialog opens, not inside it: a file the browser cannot
    // read would otherwise put an empty crop stage in front of the user and only
    // fail when they pressed "Use photo".
    const url = URL.createObjectURL(candidate);
    const image = await decodeImageUrl(url);
    if (!image) {
      URL.revokeObjectURL(url);
      setError("That image could not be opened. Try another file.");
      return;
    }
    sourceUrlRef.current = url;
    sourceImageRef.current = image;
    setSourceUrl(url);
  }

  async function applyCrop(pixelCrop: PixelCrop, rotation: number) {
    const image = sourceImageRef.current;
    if (!image) return;
    setCropping(true);
    const cropped = await cropFromImage(image, pixelCrop, rotation);
    setCropping(false);
    if (!cropped) {
      closeCropper();
      setError("That image could not be opened. Try another file.");
      return;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(cropped);
    setPreview(previewRef.current);
    onFileChange(cropped);
    // Picking a photo means keeping one, whatever a pending remove flag said.
    onRemoveExistingChange(false);
    closeCropper();
  }

  const storedUrl = existingSrc && !removeExisting ? mediaUrl(AVATARS_MEDIA_BUCKET, existingSrc) : null;
  const shown = preview ?? storedUrl;
  const pendingRemoval = removeExisting && Boolean(existingSrc) && !file;
  const hasSomethingToRemove = Boolean(file) || (Boolean(existingSrc) && !removeExisting);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void pick(event.dataTransfer.files[0]);
        }}
        aria-label={shown ? "Change profile photo" : "Add profile photo"}
        className="group relative block h-32 w-32 shrink-0 overflow-hidden rounded-full ring-2 ring-brand-400/40 transition-shadow duration-(--duration-quick) hover:ring-brand-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
      >
        {preview ? (
          // A blob: URL from the crop that was just made — next/image can neither
          // fetch nor optimise it, so this stays a plain img.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : storedUrl ? (
          <Image src={storedUrl} alt="" fill sizes="128px" className="object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center bg-linear-to-br from-brand-400 to-brand-600"
          >
            <UploadCloud className="h-9 w-9 text-white" />
          </span>
        )}

        {/* The hover/focus affordance, over a photo only — the empty state already
            shows the upload icon, so a scrim there would just dim it. */}
        {shown ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-ink-950/45 opacity-0 transition-opacity duration-(--duration-quick) group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <UploadCloud className="h-8 w-8 text-white" />
          </span>
        ) : null}
      </button>

      <div className="flex flex-col items-center gap-1">
        <p className="max-w-48 text-xs text-ink-500">
          {file
            ? "Uploads when you save."
            : pendingRemoval
              ? "The photo will be removed when you save."
              : "Click the circle to upload. JPG or PNG, up to 5 MB."}
        </p>
        {hasSomethingToRemove ? (
          <button
            type="button"
            onClick={() => {
              onFileChange(null);
              if (existingSrc) onRemoveExistingChange(true);
            }}
            className="text-xs font-medium text-danger hover:underline"
          >
            Remove photo
          </button>
        ) : null}
        {pendingRemoval ? (
          <button
            type="button"
            onClick={() => onRemoveExistingChange(false)}
            className="block text-xs font-medium text-ink-700 hover:underline"
          >
            Keep it
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}

      <ImageCropperDialog
        open={Boolean(sourceUrl)}
        src={sourceUrl ?? ""}
        pending={cropping}
        onCancel={closeCropper}
        onConfirm={(pixelCrop, rotation) => void applyCrop(pixelCrop, rotation)}
      />
    </div>
  );
}
