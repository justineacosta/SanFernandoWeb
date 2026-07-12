"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { HeroSlide } from "@/types";
import { cn } from "@/lib/utils";

const SLIDE_INTERVAL_MS = 5000;

/** Auto-advancing cross-fade image carousel with dot controls; pauses on hover/focus. */
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
      className={cn("relative h-52 w-full sm:h-64", className)}
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
          width={640}
          height={420}
          priority={index === 0}
          aria-hidden={index !== active}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
            index === active ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
      <div className="absolute right-4 top-4 flex gap-2">
        {slides.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === active}
            onClick={() => setActive(index)}
            className={cn(
              "h-2.5 rounded-full transition-all",
              index === active ? "w-6 bg-white" : "w-2.5 bg-white/50 hover:bg-white/80",
            )}
          />
        ))}
      </div>
    </div>
  );
}
