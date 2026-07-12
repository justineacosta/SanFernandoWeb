# Full-Panel Hero Carousel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the home hero so the existing auto-sliding carousel becomes the background of one large inset rounded panel, with the welcome text in a white overlay card on the left, the Emergency Hotlines card overlaid on the right, and bigger dots at the bottom-left.

**Architecture:** `HeroCarousel` becomes a fill-its-parent absolute background layer (`next/image` `fill` mode, bottom scrim, bottom-left dots with ≥24px hit areas). `HomeHero` (still a server component) wraps it in a `relative` rounded panel and overlays a content grid: white card (badge/headline/tagline/description/CTAs) left, `EmergencyHotlinesCard` right.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4 tokens. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-12-hero-redesign-design.md`

## Global Constraints

- **No test framework exists — do not add one.** Verification = `npm run typecheck` + `npm run lint` + driving the running app (recipe: `.claude/skills/verify/SKILL.md`).
- **No new npm dependencies.**
- Use only the amber+ink Tailwind theme tokens (`brand-*`, `ink-*`, `danger*`); no blue tokens.
- Path alias `@/*` → `src/*`.
- The string "Sampaguita" must not appear.
- Slide data (`HERO_SLIDES`), 5s interval, hover/focus pause, reduced-motion guard, and ARIA carousel semantics are **unchanged** from the current implementation.
- `EmergencyHotlinesCard` itself must not be modified — only repositioned.
- Dev server is often already running on `http://localhost:3000`; check before starting another.

---

### Task 1: Full-panel hero layout

**Files:**
- Modify: `src/features/home/components/hero-carousel.tsx` (full rewrite below)
- Modify: `src/features/home/components/home-hero.tsx` (full rewrite below)

**Interfaces:**
- Consumes: `HeroSlide` from `@/types`, `HERO_SLIDES` from `@/features/home/data`, `cn` from `@/lib/utils`, `SITE` from `@/constants/site`, UI primitives `Badge`/`Button`/`Container`, `EmergencyHotlinesCard` from `@/components/shared/emergency-hotlines-card` (all existing).
- Produces: `HeroCarousel({ slides, className })` — now an `absolute inset-0` layer that requires a `relative` sized parent. `HomeHero()` export unchanged.

- [ ] **Step 1: Rewrite `src/features/home/components/hero-carousel.tsx`**

Replace the entire file contents with:

```tsx
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
```

What changed vs. the previous version (for your understanding — write the file exactly as above):
- Wrapper: `relative h-52 w-full sm:h-64` → `absolute inset-0` (parent supplies size).
- Images: `width={640} height={420}` → `fill` + `sizes="(min-width: 1280px) 1200px, 100vw"`; `absolute inset-0 h-full w-full` classes dropped (`fill` positions the image itself).
- New scrim div between images and dots.
- Dots: moved from `right-4 top-4` to bottom-left; each dot is now a `p-1.5` button (24px hit area) wrapping a `<span>` visual dot (12px, active pill 32px wide, `h-3`); hover state via `group`.
- Timer/pause/reduced-motion/ARIA logic untouched.

- [ ] **Step 2: Rewrite `src/features/home/components/home-hero.tsx`**

Replace the entire file contents with:

```tsx
import { ArrowUpRight, Sparkles } from "lucide-react";
import { SITE } from "@/constants/site";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmergencyHotlinesCard } from "@/components/shared/emergency-hotlines-card";
import { HeroCarousel } from "./hero-carousel";
import { HERO_SLIDES } from "@/features/home/data";

/** Full-panel hero: sliding image background with overlaid welcome card and hotline rail. */
export function HomeHero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-28 md:pb-24 md:pt-36">
      <div
        aria-hidden="true"
        className="grid-bg pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="bg-radial-fade pointer-events-none absolute -top-32 left-1/2 -z-10 h-[600px] w-[1100px] -translate-x-1/2 rounded-full blur-2xl"
      />
      <Container>
        <div className="relative overflow-hidden rounded-[2.5rem] border border-ink-200/70 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.3)] lg:min-h-[600px]">
          <HeroCarousel slides={HERO_SLIDES} />
          <div className="relative grid items-center gap-8 p-6 pb-20 sm:p-10 sm:pb-24 lg:grid-cols-12 lg:p-14 lg:pb-24">
            <div className="lg:col-span-7">
              <div className="rounded-3xl bg-white/95 p-8 shadow-xl backdrop-blur sm:p-10">
                <Badge variant="soft" className="mb-5">
                  <Sparkles className="size-3.5 text-brand-500" aria-hidden="true" />
                  Welcome To
                </Badge>
                <h1 className="text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl md:text-6xl">
                  Barangay{" "}
                  <span className="relative whitespace-nowrap">
                    <span className="text-gradient-brand">San Fernando</span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 300 14"
                      className="absolute -bottom-2 left-0 h-2 w-full text-brand-400"
                      fill="none"
                      preserveAspectRatio="none"
                    >
                      <path
                        d="M2 11C57 4 130 4 187 9C229 12 269 11 298 6"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </h1>
                <p className="mt-6 text-lg font-medium text-ink-700 md:text-xl">{SITE.tagline}</p>
                <p className="mt-3 text-balance text-base leading-relaxed text-ink-600 md:text-lg">
                  {SITE.description}
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button href="/about" size="lg">
                    About Our Barangay <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button href="/contact" variant="outline" size="lg">
                    Contact Us
                  </Button>
                </div>
              </div>
            </div>
            <div className="lg:col-span-4 lg:col-start-9">
              <EmergencyHotlinesCard />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
```

What changed vs. the previous version (write the file exactly as above):
- The two-column layout (text left, small image + hotlines right) is replaced by one `relative` rounded panel containing the carousel as background plus an overlaid content grid.
- Badge, headline (incl. underline SVG), tagline, description, and both CTAs are identical, just re-housed in the white card; the description's old `max-w-2xl` is dropped (the card constrains width).
- Section top padding eased from `pt-32 md:pt-44` to `pt-28 md:pt-36` (the panel reads as the page's first block under the fixed header).
- Bottom padding `pb-20 sm:pb-24 lg:pb-24` on the content grid reserves space for the bottom-left dots.
- Hotlines grid placement: `lg:col-span-4 lg:col-start-9` (column 8 stays empty as a gutter); below `lg` it stacks under the white card.

- [ ] **Step 3: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Verify at runtime**

Follow `.claude/skills/verify/SKILL.md` (check whether `http://localhost:3000` is already serving before starting `npm run dev`). On the home page confirm:

1. The hero is one large rounded panel with the slide images filling it as the background; slides still cross-fade ~5s, hover pauses, dots jump on click.
2. Desktop 1440×900: white card on the left holds badge/headline/tagline/description/CTAs, fully readable, headline not overflowing the card; hotlines card on the right; dots at the bottom-left, not overlapped by either card.
3. Tablet 768px and mobile 375px: white card stacks above the hotlines card, both inside the panel over the images; no horizontal overflow; dots visible below the cards.
4. Save a desktop screenshot to `.superpowers/sdd/hero-redesign-desktop.png` (the user will judge the look from it and the live page).

- [ ] **Step 5: Commit**

```bash
git add src/features/home/components/hero-carousel.tsx src/features/home/components/home-hero.tsx
git commit -m "feat: full-panel hero with carousel background and overlay cards"
```
