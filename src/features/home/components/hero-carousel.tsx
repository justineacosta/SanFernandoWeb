"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { HeroSlide } from "@/types";
import { cn } from "@/lib/utils";

const SLIDE_INTERVAL_MS = 5000;

/**
 * Auto-advancing cross-fade image layer with dot controls; pauses on
 * hover/focus. Fills its nearest `relative` parent. The image layer fades
 * out at every edge and carries a light wash so overlaid ink text stays
 * readable; the dots sit outside the mask so they never fade.
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
      <div className="absolute inset-0 overflow-hidden [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,black_3rem,black_calc(100%-3rem),transparent),linear-gradient(to_bottom,transparent,black_3rem,black_calc(100%-3rem),transparent)]">
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
        <div aria-hidden="true" className="absolute inset-0 bg-white/85 lg:hidden" />
        <div
          aria-hidden="true"
          className="absolute inset-0 hidden bg-gradient-to-r from-white/95 via-white/85 via-60% to-white/10 lg:block"
        />
      </div>
      <div className="absolute bottom-4 left-6 flex sm:bottom-6 sm:left-10">
        {slides.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === active}
            onClick={() => setActive(index)}
            className="group rounded-full p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <span
              className={cn(
                "block h-3 rounded-full transition-all",
                index === active ? "w-8 bg-brand-600" : "w-3 bg-ink-900/50 group-hover:bg-ink-900/70",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
