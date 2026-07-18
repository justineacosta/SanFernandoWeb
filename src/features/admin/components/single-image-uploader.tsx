"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Trash2, Upload } from "lucide-react";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/storage";
import { Field, Input } from "@/components/ui/form";
import { uploadSingleImage } from "@/features/admin/actions/media";

export function SingleImageUploader({
  folder,
  src,
  alt,
  previewUrl,
  onChange,
}: {
  folder: "announcements" | "events";
  src: string | null;
  alt: string;
  previewUrl: string | null;
  onChange: (next: { src: string | null; alt: string; previewUrl: string | null }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      setError("Images must be JPG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("The image must be 2 MB or smaller.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const res = await uploadSingleImage(folder, fd);
      if (res.error) setError(res.error);
      else onChange({ src: res.src, alt, previewUrl: res.url });
    });
  }

  function clear() {
    onChange({ src: null, alt: "", previewUrl: null });
  }

  return (
    <div className="space-y-3">
      {previewUrl ? (
        <div className="flex items-start gap-3">
          <div className="relative h-24 w-32 overflow-hidden rounded-2xl bg-ink-100">
            <Image src={previewUrl} alt={alt} fill sizes="128px" className="object-cover" />
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            aria-label="Remove image"
            className="rounded p-2 text-danger hover:bg-ink-100 disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); submit(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 hover:border-brand-400"
        >
          <Upload className="h-6 w-6" aria-hidden="true" />
          <span>Drag an image here or click to choose (JPG/PNG/WebP, ≤ 2 MB).</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => { submit(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>
      )}
      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
      {previewUrl ? (
        <Field label="Image description (alt text)" htmlFor="single-image-alt">
          <Input
            id="single-image-alt"
            value={alt}
            onChange={(e) => onChange({ src, alt: e.target.value, previewUrl })}
          />
        </Field>
      ) : null}
    </div>
  );
}
