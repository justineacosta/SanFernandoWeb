"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { HeroSlide } from "@/types";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";

const SLIDE_INTERVAL_MS = 3000;

/** Stable string key for a slide whether its src is a static import or a URL. */
function slideKey(slide: HeroSlide) {
  return typeof slide.src === "string" ? slide.src : slide.src.src;
}

/**
 * Auto-advancing cross-fade image layer with dot controls; pauses on
 * hover/focus. Fills its nearest `relative` parent — since 2026-08-06 that is
 * the hero `<section>` itself rather than a Container-width card, so this is a
 * full-bleed background layer and carries the same wash `TransparencyHero`
 * uses: a flat white veil below `md`, a left-weighted gradient at `md`+ so the
 * copy column sits under the heavy end while the photo reads through on the
 * right, plus top/bottom fades to solid white so the floating header and the
 * section below never meet a hard photo edge. The old all-edge mask is gone
 * with the card it softened. The dots ride their own `Container` so they stay
 * aligned to the copy's gutter instead of the viewport edge.
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
      <div className="absolute inset-0 overflow-hidden">
        {slides.map((slide, index) => (
          <Image
            key={slideKey(slide)}
            src={slide.src}
            alt={slide.alt}
            fill
            sizes="100vw"
            priority={index === 0}
            aria-hidden={index !== active}
            className={cn(
              "object-cover transition-opacity duration-700",
              index === active ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
        <div aria-hidden="true" className="absolute inset-0 bg-white/82 md:hidden" />
        <div
          aria-hidden="true"
          className="absolute inset-0 hidden bg-gradient-to-r from-white/88 from-20% via-white/72 via-55% to-white/20 md:block"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white to-transparent"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white to-transparent"
        />
      </div>
      <Container className="absolute inset-x-0 bottom-4 sm:bottom-6">
        {/* -ml-1.5 cancels the buttons' own padding so the dots optically line
            up with the copy's left edge, not 6px inside it. */}
        <div className="-ml-1.5 flex">
          {slides.map((slide, index) => (
            <button
              key={slideKey(slide)}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === active}
              onClick={() => setActive(index)}
              className="group rounded-full p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <span
                className={cn(
                  "block h-3 rounded-full transition-all",
                  index === active
                    ? "w-8 bg-brand-600"
                    : "w-3 bg-ink-900/50 group-hover:bg-ink-900/70",
                )}
              />
            </button>
          ))}
        </div>
      </Container>
    </div>
  );
}
