# Auto-Sliding Hero Carousel on Home Page — Design

**Date:** 2026-07-12
**Status:** Approved

## Goal

Replace the single static hero image on the home page with an auto-sliding
picture carousel. The Emergency Hotlines card that overlaps the image stays
exactly as it is.

## Decisions made during brainstorming

- **Placeholder slide set for now:** 4 slides drawn from images already used on
  the site (current hero image, CTA image, announcement images) — all already
  allow-listed for `lh3.googleusercontent.com`. Real barangay photos arrive
  later by editing one array in `data.ts`.
- **Auto + dots:** slides cross-fade every 5 seconds; dot indicators let
  visitors jump to a slide; auto-advance pauses on hover/focus.
- **No carousel library:** a small custom client component, matching how the
  project already handles interactivity (small `"use client"` components).

## Components

### `HeroCarousel` (new, client component)

`src/features/home/components/hero-carousel.tsx`

- Props: `slides: HeroSlide[]`, optional `className`.
- All slides render as stacked `next/image` elements filling the frame; the
  active slide fades in via an opacity transition (~700ms). The first slide
  keeps `priority` so hero LCP is unaffected.
- **Timer:** advances every 5s via `setInterval` in a `useEffect`; paused while
  the pointer hovers the carousel or focus is inside it; disabled entirely when
  `prefers-reduced-motion` is set (dots still work).
- **Dots:** overlaid at the **top-right corner** of the image (the bottom edge
  is covered by the overlapping hotlines card). Real `<button>`s with
  `aria-label="Go to slide N"`; the active dot is visually distinct and marked.
- **Accessibility:** wrapper carries `aria-roledescription="carousel"` and a
  label; inactive slides are `aria-hidden`.

### `HomeHero` (edit, stays a server component)

`src/features/home/components/home-hero.tsx` — the `<Image>` block inside the
rounded frame is replaced with `<HeroCarousel slides={HERO_SLIDES} />`. The
rounded frame, shadow, and the Emergency Hotlines card below are untouched.

## Data model

New type in `src/types/index.ts` (future backend content, so it belongs in the
shared contract):

```ts
export interface HeroSlide {
  /** Image URL. Hotlinked placeholder until owned storage exists. */
  src: string;
  alt: string;
}
```

`src/features/home/data.ts`: new `HERO_SLIDES: HeroSlide[]` array (4 entries).
The existing `HERO_IMAGE` constant (used only by `HomeHero`) is removed; its
URL becomes the first slide. Transparency's separate `HERO_IMAGE` is untouched.

## Backend handoff notes

Update `docs/BACKEND_HANDOFF.md`: add `HeroSlide` / `HERO_SLIDES` to the entity
table and mock-data inventory (home hero carousel images, needs owned image
storage).

## Out of scope

- Swipe/drag gestures and arrow buttons.
- Real barangay photos (pending from user).
- Owned image storage (backend work).

## Verification

Load `http://localhost:3000`; confirm the hero shows the carousel, slides
cross-fade automatically every ~5s, dots switch slides on click, auto-advance
pauses on hover, and the Emergency Hotlines card still overlaps correctly.
`npm run typecheck` and `npm run lint` pass.
