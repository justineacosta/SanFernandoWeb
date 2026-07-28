"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Trash2, Upload } from "lucide-react";
import type { GalleryPhoto } from "@/types";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/storage";
import { Input } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import {
  removeAchievementPhoto,
  reorderAchievementPhotos,
  updateAchievementPhotoAlt,
  uploadAchievementPhotos,
} from "@/features/admin/actions/achievement-photos";

const MAX = 3;

interface AchievementPhotoUploaderProps {
  achievementId: string;
  photos: GalleryPhoto[];
}

export function AchievementPhotoUploader({
  achievementId,
  photos: initial,
}: AchievementPhotoUploaderProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Last-known-good alt text per photo id, so a failed save can revert the
  // input instead of leaving stale, unsaved text in the field.
  const savedAltRef = useRef<Record<string, string>>(
    Object.fromEntries(initial.map((p) => [p.id, p.alt])),
  );

  function validate(files: File[]): string | null {
    if (photos.length + files.length > MAX) {
      return `An achievement can have at most ${MAX} photos.`;
    }
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
        return "Photos must be JPG, PNG, or WebP.";
      }
      if (file.size > MAX_IMAGE_BYTES) return "Each photo must be 2 MB or smaller.";
    }
    return null;
  }

  function submit(files: File[]) {
    setError(null);
    if (files.length === 0) return;
    const message = validate(files);
    if (message) {
      setError(message);
      return;
    }
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    start(async () => {
      try {
        const result = await uploadAchievementPhotos(achievementId, formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        setPhotos(result.photos);
        result.photos.forEach((p) => {
          savedAltRef.current[p.id] = p.alt;
        });
      } catch {
        setError("Something went wrong. Please try again.");
      }
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
      try {
        const result = await reorderAchievementPhotos(
          achievementId,
          next.map((p) => p.id),
        );
        if (result.error) {
          setPhotos(previous);
          setError(result.error);
        }
      } catch {
        setPhotos(previous);
        setError("Something went wrong. Please try again.");
      }
    });
  }

  function remove(id: string) {
    const previous = photos;
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setError(null);
    start(async () => {
      try {
        const result = await removeAchievementPhoto(id);
        if (result.error) {
          setPhotos(previous);
          setError(result.error);
        }
      } catch {
        setPhotos(previous);
        setError("Something went wrong. Please try again.");
      }
    });
  }

  function saveAlt(id: string, alt: string) {
    const previousAlt = savedAltRef.current[id] ?? "";
    if (alt === previousAlt) return;
    setError(null);
    start(async () => {
      try {
        const result = await updateAchievementPhotoAlt(id, alt);
        if (result.error) {
          setError(result.error);
          setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, alt: previousAlt } : p)));
        } else {
          savedAltRef.current[id] = alt;
        }
      } catch {
        setError("Something went wrong. Please try again.");
        setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, alt: previousAlt } : p)));
      }
    });
  }

  return (
    <div className="space-y-2">
      {photos.length < MAX ? (
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            submit(Array.from(event.dataTransfer.files));
          }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 p-3 text-center text-xs text-ink-500 hover:border-brand-400"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          <span>Add photos (JPG/PNG/WebP, ≤ 2 MB, up to {MAX}).</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(event) => {
              submit(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>
      ) : null}

      {error ? (
        <InlineAlert message={error} onDismiss={() => setError(null)} className="text-xs" />
      ) : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <li key={photo.id} className="space-y-1">
              <div className="overflow-hidden rounded-xl bg-ink-100">
                <div className="relative aspect-square">
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="100px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="flex items-center justify-between gap-1 p-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || pending}
                    aria-label={`Move photo ${index + 1} left`}
                    className="rounded p-1 text-ink-600 hover:bg-white disabled:opacity-30"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === photos.length - 1 || pending}
                    aria-label={`Move photo ${index + 1} right`}
                    className="rounded p-1 text-ink-600 hover:bg-white disabled:opacity-30"
                  >
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(photo.id)}
                    disabled={pending}
                    aria-label={`Remove photo ${index + 1}`}
                    className="rounded p-1 text-danger hover:bg-white disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <Input
                value={photo.alt}
                onChange={(event) =>
                  setPhotos((prev) =>
                    prev.map((p) => (p.id === photo.id ? { ...p, alt: event.target.value } : p)),
                  )
                }
                onBlur={(event) => saveAlt(photo.id, event.target.value)}
                // This uploader lives inside the official's <form>; Enter in a
                // text input would submit that form and close the drawer.
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder="Description"
                aria-label={`Description for photo ${index + 1}`}
                className="rounded-lg px-2 py-1 text-xs"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
