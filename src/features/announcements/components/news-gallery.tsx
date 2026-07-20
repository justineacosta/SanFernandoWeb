"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { NewsPhoto } from "@/types";
import { cn } from "@/lib/utils";

export function NewsGallery({ photos }: { photos: NewsPhoto[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const count = photos.length;

  const close = useCallback(() => setOpenAt(null), []);
  const step = useCallback(
    (delta: number) => setOpenAt((i) => (i === null ? i : (i + delta + count) % count)),
    [count],
  );

  useEffect(() => {
    if (openAt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAt, close, step]);

  if (count === 0) return null;

  const tile = (photo: NewsPhoto, index: number, className: string) => (
    <button
      key={photo.id}
      type="button"
      onClick={() => setOpenAt(index)}
      className={cn("group relative overflow-hidden rounded-2xl bg-ink-100", className)}
      aria-label={`View photo ${index + 1} of ${count}`}
    >
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes="(min-width: 768px) 66vw, 100vw"
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
    </button>
  );

  return (
    <>
      <div
        className={cn(
          "grid gap-3",
          count === 1 && "grid-cols-1",
          count === 2 && "grid-cols-1 sm:grid-cols-2",
          count === 3 && "grid-cols-2",
        )}
      >
        {count === 3
          ? [
              tile(photos[0], 0, "col-span-2 aspect-video"),
              tile(photos[1], 1, "aspect-square"),
              tile(photos[2], 2, "aspect-square"),
            ]
          : photos.map((photo, index) => tile(photo, index, "aspect-video"))}
      </div>

      {openAt !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/90 p-4"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          {count > 1 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); step(-1); }}
              aria-label="Previous photo"
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <ChevronLeft className="h-7 w-7" aria-hidden="true" />
            </button>
          ) : null}
          <div className="relative h-[80vh] w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <Image
              src={photos[openAt].src}
              alt={photos[openAt].alt}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
          {count > 1 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); step(1); }}
              aria-label="Next photo"
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <ChevronRight className="h-7 w-7" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
