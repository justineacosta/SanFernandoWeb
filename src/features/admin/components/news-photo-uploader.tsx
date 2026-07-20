"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, Trash2, Upload } from "lucide-react";
import type { NewsPhoto } from "@/types";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/storage";
import { Input } from "@/components/ui/form";
import {
  removeNewsPhoto,
  reorderNewsPhotos,
  updateNewsPhotoAlt,
  uploadNewsPhotos,
} from "@/features/admin/actions/news-photos";

const MAX = 3;

export function NewsPhotoUploader({
  articleId,
  photos: initial,
}: {
  articleId: string;
  photos: NewsPhoto[];
}) {
  const [photos, setPhotos] = useState<NewsPhoto[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Last-known-good alt text per photo id, so a failed save can revert the input
  // instead of leaving stale, unsaved text sitting in the field.
  const savedAltRef = useRef<Record<string, string>>(
    Object.fromEntries(initial.map((p) => [p.id, p.alt])),
  );

  function validate(files: File[]): string | null {
    if (photos.length + files.length > MAX) return `A post can have at most ${MAX} photos.`;
    for (const f of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(f.type as (typeof ALLOWED_IMAGE_TYPES)[number]))
        return "Photos must be JPG, PNG, or WebP.";
      if (f.size > MAX_IMAGE_BYTES) return "Each photo must be 2 MB or smaller.";
    }
    return null;
  }

  function submit(files: File[]) {
    setError(null);
    const msg = validate(files);
    if (msg) { setError(msg); return; }
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    start(async () => {
      const res = await uploadNewsPhotos(articleId, fd);
      if (res.error) setError(res.error);
      else setPhotos(res.photos);
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return;
    const previous = photos;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    setPhotos(next);
    setError(null);
    start(async () => {
      const res = await reorderNewsPhotos(articleId, next.map((p) => p.id));
      if (res.error) {
        setPhotos(previous);
        setError(res.error);
      }
    });
  }

  function remove(id: string) {
    const previous = photos;
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setError(null);
    start(async () => {
      const res = await removeNewsPhoto(id);
      if (res.error) {
        setPhotos(previous);
        setError(res.error);
      }
    });
  }

  function updateAltLocal(id: string, alt: string) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, alt } : p)));
  }

  function saveAlt(id: string, alt: string) {
    const previousAlt = savedAltRef.current[id] ?? "";
    if (alt === previousAlt) return;
    setError(null);
    start(async () => {
      const res = await updateNewsPhotoAlt(id, alt);
      if (res.error) {
        setError(res.error);
        updateAltLocal(id, previousAlt);
      } else {
        savedAltRef.current[id] = alt;
      }
    });
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); submit(Array.from(e.dataTransfer.files)); }}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 hover:border-brand-400"
      >
        <Upload className="h-6 w-6" aria-hidden="true" />
        <span>Drag photos here or click to choose (JPG/PNG/WebP, ≤ 2 MB, up to {MAX}).</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => { submit(Array.from(e.target.files ?? [])); e.target.value = ""; }}
        />
      </div>

      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3">
          {photos.map((p, i) => (
            <li key={p.id} className="space-y-1.5">
              <div className="relative overflow-hidden rounded-2xl bg-ink-100">
                <div className="relative aspect-square">
                  <Image src={p.src} alt={p.alt} fill sizes="120px" className="object-cover" />
                </div>
                <div className="flex items-center justify-between gap-1 p-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || pending} aria-label={`Move photo ${i + 1} up`} className="rounded p-1 text-ink-600 hover:bg-white disabled:opacity-30">
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1 || pending} aria-label={`Move photo ${i + 1} down`} className="rounded p-1 text-ink-600 hover:bg-white disabled:opacity-30">
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => remove(p.id)} disabled={pending} aria-label={`Remove photo ${i + 1}`} className="rounded p-1 text-danger hover:bg-white disabled:opacity-30">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <Input
                value={p.alt}
                onChange={(e) => updateAltLocal(p.id, e.target.value)}
                onBlur={(e) => saveAlt(p.id, e.target.value)}
                placeholder="Description"
                aria-label={`Description for photo ${i + 1}`}
                className="rounded-lg px-2 py-1.5 text-xs"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
