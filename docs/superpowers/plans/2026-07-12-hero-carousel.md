# Auto-Sliding Home Hero Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single static hero image on the home page with an auto-sliding, cross-fading picture carousel (auto-advance every 5s, dot controls, pause on hover/focus), leaving the Emergency Hotlines card untouched.

**Architecture:** A new `HeroSlide` shared type, a `HERO_SLIDES` mock-data array in the home feature's `data.ts`, and one small `"use client"` `HeroCarousel` component that stacks `next/image` elements and fades between them. `HomeHero` stays a server component and swaps its `<Image>` for `<HeroCarousel>`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4 tokens. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-12-hero-carousel-design.md`

## Global Constraints

- **No test framework exists — do not add one.** Verification = `npm run typecheck` + `npm run lint` + driving the running app (recipe: `.claude/skills/verify/SKILL.md`).
- **No new npm dependencies.**
- Content lives in the feature's `data.ts`, never hardcoded in components.
- Use only the amber+ink Tailwind theme tokens (`brand-*`, `ink-*`); no blue tokens.
- Path alias `@/*` → `src/*`.
- The identity is "Barangay San Fernando" — the string "Sampaguita" must not appear.
- Dev server is often already running on `http://localhost:3000`; check before starting another.

---

### Task 1: `HeroSlide` type, `HERO_SLIDES` data, and the `HeroCarousel` component

**Files:**
- Modify: `src/types/index.ts` (insert after the `IconNavItem` interface, around line 24)
- Modify: `src/features/home/data.ts` (add `HERO_SLIDES` below the existing `CTA_IMAGE`; leave `HERO_IMAGE` in place — Task 2 removes it)
- Create: `src/features/home/components/hero-carousel.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils` (existing).
- Produces: `HeroSlide { src: string; alt: string }` exported from `@/types`; `HERO_SLIDES: HeroSlide[]` exported from `@/features/home/data`; `HeroCarousel({ slides, className })` exported from `./hero-carousel` — Task 2 relies on all three names exactly.

- [ ] **Step 1: Add the `HeroSlide` type**

In `src/types/index.ts`, directly after the `IconNavItem` interface (before the `/* Contact */` section comment), insert:

```ts
/* ------------------------------------ Media ------------------------------------ */

export interface HeroSlide {
  /** Image URL. Hotlinked placeholder until owned storage exists. */
  src: string;
  alt: string;
}
```

- [ ] **Step 2: Add `HERO_SLIDES` to the home data file**

In `src/features/home/data.ts`:

1. Extend the type import to include `HeroSlide`:

```ts
import type {
  Announcement,
  CommunityEvent,
  HeroSlide,
  QuickService,
  Stat,
  ValueItem,
} from "@/types";
```

2. Directly after the `CTA_IMAGE` constant, add (the four URLs are, in order: the current `HERO_IMAGE`, `CTA_IMAGE`, and the first two `LATEST_ANNOUNCEMENTS` images — copy them exactly from the same file):

```ts
/** Home hero carousel slides. Placeholder images until real barangay photos are provided. */
export const HERO_SLIDES: HeroSlide[] = [
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuB6faUsk_X5aG7dJSCaPD0iynJ9zyUAOQ31BcXvBKmyxNUWIVmPeUMDNkrXBjdfD5Sbh3RwnnPysj_RxfrMhBwTPGb-BP4mDyyH5pBOrh8ofsySWtfjhE3jGUBJUtHisLpGRFiJHiyO1HwFQEw8KYPLhWDyvG3jUzkKqxH9lIEQZya9ZR5D_Ojw3nN6wAa9ciR_WqVt8F-e2sR_Oh-HFrXZISx48HxChtUdNXfk1pngRXYLGnffZle8eZLdxxT5pWYCjvLGSEkFhNY",
    alt: "Barangay San Fernando community",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuDdUZq8tdAhUP0f1C3psoNXrr7LYQFX_4T6TL0OjRcM0zwxNFRi3Syn7EBYV9Vh3XhVTmfY_wz2-9d2Gowg6-C4aBHMmP5G3FIkuoLomUFq5cRZ041Bp8nRb9KX4ylWdytodNwOBZeFzuKDGNJ_uoLas3SuyV1tme8Unz0JoXnWTC-6v-BnV5IWyVX70-H0oqLiWjLZFG48zxBKvRdJrr8FEsSWNlhRDeGlLorF3NvaUGRej6MN-GkAhgojKlOmgtHIqPT5eMSs2QY",
    alt: "Community members joining a barangay program",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuAKfX6kI2fekmRPUd1kE_O3EyuEA3gJBN7KbNJDLjXz1PYGsNn8myyZZFhbbGnpIeJy711seRjFGNjzfgJJdN1_4JCKTETETxt_Qey4QEJ8cyiyPU2l9b_qB-HLlkwi9reMFdSd0b8LbCrY5AkFxFJvPLTHF-UpjNkyazbr4gVeTVo71J3OEJEqVDi46slsj_oc8JcjUShpuGlDyHCccCPsQAkf0lEW4spWv-w4YL9D0fJp_v3CXRVXoSwVDPQWzMXvMg6jDS_CObk",
    alt: "Residents gathered for a barangay assembly",
  },
  {
    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBQMEWS1CFwllE8d9raqgMitrZe3lxxzWXQ3Bcl2I1HXP7eHqHEK-hqYJgyWkH3UD0brZRExGSa6WZnAViKeIXMh8s0B4saCQjR7DrQUVlkYtWz7hleSkf5wufO4vDDEmqkDlv8z6bMCyl0t04YwZws14Lx0jGXLoOWgFmGq-2O9kHlhu5ab9-ojY4N96RIQVx5QlNdldjOaujdC7lDoqUfEQxtEysVrhbjng7EVEHi9Z_d91NIpXXDZFAILNbLfieTKvuefXZDugY",
    alt: "Health workers during a medical mission",
  },
];
```

- [ ] **Step 3: Create the `HeroCarousel` client component**

Create `src/features/home/components/hero-carousel.tsx`:

```tsx
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
```

Notes for the implementer:

- The `onFocus`/`onBlur` on the wrapper work because React focus events bubble — tabbing onto a dot pauses the timer.
- Do **not** put `overflow-hidden`/`rounded` here; the parent frame in `HomeHero` already clips (Task 2).
- Do not export `HeroCarousel` from `src/features/home/index.ts` — the barrel only re-exports page-level sections, and this component is internal to `HomeHero`.

- [ ] **Step 4: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0 with no errors (the new component is not yet imported anywhere — that's fine).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/features/home/data.ts src/features/home/components/hero-carousel.tsx
git commit -m "feat: add HeroSlide type, HERO_SLIDES data, and HeroCarousel component"
```

---

### Task 2: Wire `HeroCarousel` into `HomeHero` and verify at runtime

**Files:**
- Modify: `src/features/home/components/home-hero.tsx:1-8` (imports) and `:62-72` (image block)
- Modify: `src/features/home/data.ts` (delete the now-unused `HERO_IMAGE` constant)

**Interfaces:**
- Consumes: `HeroCarousel` from `./hero-carousel`; `HERO_SLIDES` from `@/features/home/data` (both from Task 1).
- Produces: nothing new — `HomeHero`'s export is unchanged.

- [ ] **Step 1: Swap the static image for the carousel in `home-hero.tsx`**

Replace the import lines

```tsx
import Image from "next/image";
```

and

```tsx
import { HERO_IMAGE } from "@/features/home/data";
```

with

```tsx
import { HeroCarousel } from "./hero-carousel";
import { HERO_SLIDES } from "@/features/home/data";
```

(keep all other imports; `SITE` is still used by the tagline/description). Then replace the `<Image ... />` element inside the rounded frame:

```tsx
<div className="overflow-hidden rounded-[2rem] border border-ink-200/70 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.3)]">
  <Image
    src={HERO_IMAGE}
    alt={`${SITE.name} community`}
    width={640}
    height={420}
    className="h-52 w-full object-cover sm:h-64"
    priority
  />
</div>
```

becomes

```tsx
<div className="overflow-hidden rounded-[2rem] border border-ink-200/70 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.3)]">
  <HeroCarousel slides={HERO_SLIDES} />
</div>
```

- [ ] **Step 2: Remove the dead `HERO_IMAGE` constant from `src/features/home/data.ts`**

Delete the `HERO_IMAGE` export (the `export const HERO_IMAGE = "https://lh3...FhNY";` statement). Leave `CTA_IMAGE` alone — it is still used by the CTA section. Do **not** touch `src/features/transparency/data.ts`, which has its own separate `HERO_IMAGE`.

- [ ] **Step 3: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. A leftover `HERO_IMAGE` reference or unused `Image` import will fail here.

- [ ] **Step 4: Verify at runtime**

Follow `.claude/skills/verify/SKILL.md` (check whether `http://localhost:3000` is already serving before starting `npm run dev`). On the home page confirm:

1. The hero frame shows the first slide immediately (no blank flash).
2. Slides cross-fade automatically roughly every 5 seconds.
3. Four dots sit at the top-right of the image; clicking a dot jumps to that slide.
4. Hovering the image stops auto-advance; leaving resumes it.
5. The Emergency Hotlines card still overlaps the image bottom exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/features/home/components/home-hero.tsx src/features/home/data.ts
git commit -m "feat: auto-sliding hero carousel on home page"
```

---

### Task 3: Backend handoff doc update

**Files:**
- Modify: `docs/BACKEND_HANDOFF.md` (entity table ~line 106; mock-data inventory ~line 121)

**Interfaces:**
- Consumes: `HeroSlide` name from Task 1 (documentation only).
- Produces: nothing — docs only.

- [ ] **Step 1: Add `HeroSlide` to the entity table**

In the entity table in §2, insert directly after the `| \`Stat\` | ... |` row:

```markdown
| `HeroSlide` | Home hero carousel | `src` is a hotlinked placeholder image — needs owned image storage |
```

- [ ] **Step 2: Update the mock-data inventory row for the home feature**

Change:

```markdown
| `src/features/home/data.ts` | Quick services, 3 announcements, 4 events, 4 stats, hero/CTA images |
```

to:

```markdown
| `src/features/home/data.ts` | Quick services, 3 announcements, 4 events, 4 stats, 4 hero carousel slides, CTA image |
```

- [ ] **Step 3: Commit**

```bash
git add docs/BACKEND_HANDOFF.md
git commit -m "docs: add HeroSlide carousel entity to backend handoff"
```
