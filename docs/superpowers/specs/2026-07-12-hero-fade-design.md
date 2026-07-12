# Home Hero: Faded-Edge Carousel, No White Card — Design

**Date:** 2026-07-12
**Status:** Approved

## Goal

Third iteration of today's home hero (follows `2026-07-12-hero-redesign-design.md`).
Per the user's annotated mockup: remove the white content card and the panel's
hard border/shadow; the welcome text sits directly on the panel again
(dark-on-light), the sliding photos show through mostly on the right, and the
image layer **fades out softly at every edge** into the page background.

## Decisions made during brainstorming

- **Light wash on the left** (user choice): on desktop the photos get a
  left-to-right white gradient overlay — nearly solid white under the text,
  ~10% over the photo side — so the text stays readable without a card. Below
  `lg` (content stacks) the wash is a uniform light tint over the whole panel.
- **Faded edges replace the border:** no border, no shadow, no visible hard
  corner — a CSS mask fades the image layer over ~3rem at all four edges.
- **Dots recolored for the light wash** they now sit on: active pill
  `brand-500`, inactive `ink-900/20` (hover `/40`), focus ring
  `focus-visible:outline-brand-500` (Button convention). Position, size, hit
  areas unchanged.
- Slide data, 5s timing, hover/focus pause, reduced-motion, ARIA semantics,
  and the content-first DOM order + pointer-events wiring from the previous
  iteration all carry over unchanged.

## Components

### `HeroCarousel` (edit, stays a client component)

`src/features/home/components/hero-carousel.tsx`

- Wrapper unchanged (`absolute inset-0`, carousel ARIA, pause handlers).
- New inner **masked image layer** (`absolute inset-0 overflow-hidden`) that
  holds the slides plus two wash overlays, and carries the fade mask:
  `mask-image` = two stacked linear gradients (horizontal and vertical), each
  `transparent → black 3rem → black calc(100% - 3rem) → transparent`, with
  `mask-composite: intersect`. Dots stay OUTSIDE this layer so they never fade.
- Slides: unchanged (`fill`, `sizes`, `priority` on first, cross-fade classes).
- The previous dark bottom scrim is **removed**; in its place two wash divs
  (`aria-hidden`, absolute inset-0): `bg-white/85 lg:hidden` and
  `hidden lg:block bg-gradient-to-r from-white/95 via-white/75 to-white/10`.
- Dots: same placement/structure; colors change to
  active `w-8 bg-brand-500` / inactive `w-3 bg-ink-900/20
  group-hover:bg-ink-900/40`; button gains `rounded-full` +
  `focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-brand-500` (replacing `outline-white`).

### `HomeHero` (edit, stays a server component)

`src/features/home/components/home-hero.tsx`

- Panel div loses `overflow-hidden rounded-[2.5rem] border … shadow-…` —
  it becomes a plain `relative` wrapper (the mask now shapes the edges).
- `lg:min-h-[600px]` moves from the panel to the **content grid**, so
  `items-center` actually centers (fixes a latent minor from the last review).
- The white card wrapper is removed: badge, headline (with underline SVG),
  tagline, description (restore `max-w-2xl`), and both CTAs sit directly in
  the left grid column, exactly as in the pre-carousel design.
- Everything else carries over: content grid first in DOM (`pointer-events-none
  relative z-10`, `pointer-events-auto` on both columns), `lg:col-span-7` text /
  `lg:col-span-4 lg:col-start-9` hotlines, grid padding `p-6 pb-20 sm:p-10
  sm:pb-24 lg:p-14 lg:pb-24`, `<HeroCarousel slides={HERO_SLIDES} />` after the
  grid, section backdrop/padding unchanged.

## Data model / backend handoff

No changes.

## Out of scope

- Pause/play control, `role="region"`, slide announcements (tracked follow-up).
- Real photos, arrows, swipe.

## Verification

`npm run typecheck` + `npm run lint` pass. On `http://localhost:3000`:

1. No hard border/corner on the hero — photos dissolve into the page
   background on all four edges.
2. Desktop 1440: text crisp dark-on-light on the left (no card), photos
   clearly visible on the right behind/around the hotlines card; dots
   bottom-left in amber/ink, clickable, visible focus ring.
3. Mobile 375 / tablet 768: uniform light wash, text readable, no overflow.
4. Cross-fade ~5s, hover pause, tab order content-before-dots all still work.
5. Desktop screenshot saved for the user.
