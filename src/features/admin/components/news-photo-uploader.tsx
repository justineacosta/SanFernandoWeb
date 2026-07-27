"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, Trash2, Upload } from "lucide-react";
import type { GalleryPhoto } from "@/types";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/storage";
import { Input } from "@/components/ui/form";
import {
  removeNewsPhoto,
  reorderNewsPhotos,
  updateNewsPhotoAlt,
} from "@/features/admin/actions/news-photos";

const MAX = 3;

/** A photo chosen in this session: still a File, nothing in storage yet. */
export interface PendingPhoto {
  file: File;
  alt: string;
}

interface NewsPhotoUploaderProps {
  /** null while the article is still unsaved — every photo is then pending. */
  articleId: string | null;
  /** Photos already stored against the article. */
  photos: GalleryPhoto[];
  pending: PendingPhoto[];
  onPendingChange: (next: PendingPhoto[]) => void;
}

/**
 * Two lists, deliberately.
 *
 * Photos already saved keep their server-side operations — reorder, remove and
 * alt-text edits all persist immediately, because they act on rows that exist.
 * Photos chosen in this session are held as Files and travel with the form's
 * Save, so cancelling the drawer leaves nothing behind to clean up. That split
 * is what let the "save this post as a draft first" message go away: a brand
 * new article now has an all-pending list and saves in one pass.
 */
export function NewsPhotoUploader({
  articleId,
  photos: initial,
  pending,
  onPendingChange,
}: NewsPhotoUploaderProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Last-known-good alt text per photo id, so a failed save can revert the input
  // instead of leaving stale, unsaved text sitting in the field.
  const savedAltRef = useRef<Record<string, string>>(
    Object.fromEntries(initial.map((p) => [p.id, p.alt])),
  );

  // One object URL per pending file, created in the handler that picks it (an
  // effect would be a setState-in-effect cascade) and released when that photo
  // is dropped or the drawer unmounts.
  const [previews, setPreviews] = useState<string[]>([]);
  const urlsRef = useRef<string[]>([]);
  useEffect(() => () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const total = photos.length + pending.length;

  function pick(files: File[]) {
    setError(null);
    if (files.length === 0) return;
    if (total + files.length > MAX) {
      setError(`A post can have at most ${MAX} photos.`);
      return;
    }
    for (const f of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(f.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
        setError("Photos must be JPG, PNG, or WebP.");
        return;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        setError("Each photo must be 2 MB or smaller.");
        return;
      }
    }
    urlsRef.current = [...urlsRef.current, ...files.map((f) => URL.createObjectURL(f))];
    setPreviews(urlsRef.current);
    onPendingChange([...pending, ...files.map((file) => ({ file, alt: "" }))]);
  }

  function move(index: number, delta: number) {
    if (!articleId) return;
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

  function setPendingAlt(index: number, alt: string) {
    onPendingChange(pending.map((p, i) => (i === index ? { ...p, alt } : p)));
  }

  function dropPending(index: number) {
    const url = urlsRef.current[index];
    if (url) URL.revokeObjectURL(url);
    urlsRef.current = urlsRef.current.filter((_, i) => i !== index);
    setPreviews(urlsRef.current);
    onPendingChange(pending.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {total < MAX ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(Array.from(e.dataTransfer.files)); }}
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
            onChange={(e) => { pick(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          />
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}

      {total > 0 ? (
        <ul className="grid grid-cols-3 gap-3">
          {photos.map((p, i) => (
            <li key={p.id} className="space-y-1.5">
              <div className="relative overflow-hidden rounded-2xl bg-ink-100">
                <div className="relative aspect-square">
                  <Image
                    src={p.src}
                    alt={p.alt}
                    fill
                    sizes="120px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="flex items-center justify-between gap-1 p-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || busy} aria-label={`Move photo ${i + 1} up`} className="rounded p-1 text-ink-600 hover:bg-white disabled:opacity-30">
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1 || busy} aria-label={`Move photo ${i + 1} down`} className="rounded p-1 text-ink-600 hover:bg-white disabled:opacity-30">
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => remove(p.id)} disabled={busy} aria-label={`Remove photo ${i + 1}`} className="rounded p-1 text-danger hover:bg-white disabled:opacity-30">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <Input
                value={p.alt}
                onChange={(e) => updateAltLocal(p.id, e.target.value)}
                onBlur={(e) => saveAlt(p.id, e.target.value)}
                // This uploader lives inside the article's <form>; Enter in a
                // text input would submit that form and close the drawer.
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                placeholder="Description"
                aria-label={`Description for photo ${i + 1}`}
                className="rounded-lg px-2 py-1.5 text-xs"
              />
            </li>
          ))}

          {pending.map((p, i) => (
            <li key={`pending-${i}`} className="space-y-1.5">
              <div className="relative overflow-hidden rounded-2xl bg-ink-100 ring-1 ring-brand-300">
                <div className="relative aspect-square">
                  {/* blob: URL for a file the user just picked — nothing for
                      next/image to optimise, and it cannot fetch it either. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previews[i]} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="flex items-center justify-between gap-1 p-1">
                  <span className="pl-1 text-[11px] font-medium text-ink-500">Uploads on save</span>
                  <button
                    type="button"
                    onClick={() => dropPending(i)}
                    aria-label={`Remove new photo ${i + 1}`}
                    className="rounded p-1 text-danger hover:bg-white"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <Input
                value={p.alt}
                onChange={(e) => setPendingAlt(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                placeholder="Description"
                aria-label={`Description for new photo ${i + 1}`}
                className="rounded-lg px-2 py-1.5 text-xs"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
