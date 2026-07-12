"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { HeroSlide } from "@/types";
import { cn } from "@/lib/utils";

const SLIDE_INTERVAL_MS = 5000;

/**
 * Auto-advancing cross-fade image layer with dot controls; pauses on
 * hover/focus. Fills its nearest `relative` parent, which provides the size.
 */
export function HeroCarousel({ slides, className }: { slides: HeroSlide[]; className?: string }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      SLIDE_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [paused, slides.length]);

  return (
    <div
      aria-roledescription="carousel"
      aria-label="Barangay photo highlights"
      className={cn("absolute inset-0", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((slide, index) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          fill
          sizes="(min-width: 1280px) 1200px, 100vw"
          priority={index === 0}
          aria-hidden={index !== active}
          className={cn(
            "object-cover transition-opacity duration-700",
            index === active ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-900/50 to-transparent"
      />
      <div className="absolute bottom-4 left-6 flex sm:bottom-6 sm:left-10">
        {slides.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === active}
            onClick={() => setActive(index)}
            className="group p-1.5"
          >
            <span
              className={cn(
                "block h-3 rounded-full transition-all",
                index === active ? "w-8 bg-white" : "w-3 bg-white/50 group-hover:bg-white/80",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
