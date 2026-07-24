"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Trash2, Undo2, Upload } from "lucide-react";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/storage";
import { Field, Input } from "@/components/ui/form";

interface SingleImageUploaderProps {
  /** Storage path (or seed URL) already on the record being edited, or null. */
  existingSrc: string | null;
  /** Public URL for the already-stored image, for its preview. */
  existingPreviewUrl: string | null;
  alt: string;
  onAltChange: (alt: string) => void;
  /** The newly chosen (not yet uploaded) file, or null. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** True once the user has asked to drop the stored image; takes effect only on save. */
  removeExisting: boolean;
  onRemoveExistingChange: (remove: boolean) => void;
  /** Field id prefix, so two uploaders on one page keep distinct label targets. */
  idPrefix: string;
  /**
   * Hides the alt-text field. Only for images that are genuinely decorative —
   * the Get Involved banner is a CSS background behind its own heading, so it
   * is never announced and has no alt attribute to fill. Asking for alt text
   * that nothing renders trains editors to ignore the field on the images that
   * do need it.
   */
  decorative?: boolean;
  /**
   * Circular preview for a face. The rectangular default is right for a banner
   * or a cover; a portrait previewed as a rectangle hides exactly the cropping
   * the user is trying to judge.
   */
  previewShape?: "rect" | "circle";
}

/**
 * Pure file picker — no network calls, mirroring pdf-uploader.tsx. The chosen
 * `File` and the "remove the stored image" flag live in the parent form and
 * only become a real upload/delete when the form is saved (see
 * announcement-form.tsx / event-form.tsx / official-form.tsx and their save
 * actions). Nothing reaches storage until Save runs server-side, so a
 * cancelled drawer cannot orphan an object.
 */
export function SingleImageUploader({
  existingSrc,
  existingPreviewUrl,
  alt,
  onAltChange,
  file,
  onFileChange,
  removeExisting,
  onRemoveExistingChange,
  idPrefix,
  decorative = false,
  previewShape = "rect",
}: SingleImageUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const previewBox =
    previewShape === "circle"
      ? "relative h-24 w-24 overflow-hidden rounded-full bg-ink-100"
      : "relative h-24 w-32 overflow-hidden rounded-2xl bg-ink-100";

  // An object URL is leaked memory until revoked. It is created in the event
  // handler that chooses the file rather than in an effect (which would be a
  // setState-in-effect cascade), so the ref is what the unmount cleanup has to
  // work from.
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  function showPreviewFor(candidate: File | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = candidate ? URL.createObjectURL(candidate) : null;
    setLocalPreview(urlRef.current);
  }

  function pick(candidate: File | undefined) {
    if (!candidate) return;
    setError(null);
    if (!ALLOWED_IMAGE_TYPES.includes(candidate.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      setError("Images must be JPG, PNG, or WebP.");
      return;
    }
    if (candidate.size > MAX_IMAGE_BYTES) {
      setError("The image must be 2 MB or smaller.");
      return;
    }
    showPreviewFor(candidate);
    onFileChange(candidate);
  }

  function clearPick() {
    showPreviewFor(null);
    onFileChange(null);
  }

  const hasExisting = Boolean(existingSrc);
  const showExisting = !file && hasExisting && !removeExisting;
  const showRemovedNotice = !file && hasExisting && removeExisting;
  const showPicker = !file && (!hasExisting || removeExisting);
  const altId = `${idPrefix}-image-alt`;

  return (
    <div className="space-y-3">
      {file && localPreview ? (
        <div className="flex items-start gap-3">
          <div className={previewBox}>
            {/* A blob: URL from the file the user just picked — next/image has
                nothing to optimise and cannot fetch it, so this stays a plain img. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={localPreview} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-medium text-ink-800">{file.name}</p>
            <p className="text-xs text-ink-500">Uploads when you save.</p>
            <button
              type="button"
              onClick={clearPick}
              className="text-xs font-medium text-danger hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}

      {showExisting && existingPreviewUrl ? (
        <div className="flex items-start gap-3">
          <div className={previewBox}>
            <Image src={existingPreviewUrl} alt={alt} fill sizes="128px" className="object-cover" />
          </div>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="block text-xs font-medium text-ink-600 hover:underline"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onRemoveExistingChange(true)}
              aria-label="Remove image"
              className="flex items-center gap-1 text-xs font-medium text-danger hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>
      ) : null}

      {showRemovedNotice ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">
          <span>The image will be removed when you save.</span>
          <button
            type="button"
            onClick={() => onRemoveExistingChange(false)}
            className="flex items-center gap-1 text-xs font-medium text-ink-700 hover:underline"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Keep it
          </button>
        </div>
      ) : null}

      {showPicker ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 hover:border-brand-400"
        >
          <Upload className="h-6 w-6" aria-hidden="true" />
          <span>Drag an image here or click to choose (JPG/PNG/WebP, ≤ 2 MB).</span>
        </div>
      ) : null}

      {/* Outside the drop zone: "Replace" on the existing preview opens it too. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
      />

      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}

      {!decorative && (file || showExisting) ? (
        <Field label="Image description (alt text)" htmlFor={altId}>
          <Input id={altId} value={alt} onChange={(e) => onAltChange(e.target.value)} />
        </Field>
      ) : null}
    </div>
  );
}
