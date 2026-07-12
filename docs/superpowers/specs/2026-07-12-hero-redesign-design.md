# Home Hero Redesign: Full-Panel Carousel Background — Design

**Date:** 2026-07-12
**Status:** Approved

## Goal

Rebuild the home hero to match the user's mockup: the auto-sliding carousel
(built earlier today, spec `2026-07-12-hero-carousel-design.md`) becomes the
background of one large inset rounded panel; the welcome text moves into a
white overlay card on the left; the Emergency Hotlines card overlays on the
right; the carousel dots move to the bottom-left and get bigger.

## Decisions made during brainstorming

- **Inset rounded panel**, not full-bleed — a big rounded-corner panel with
  breathing room around it, inside the existing `Container` (user choice,
  matches their mockup).
- **White content card** on the left holds the existing badge, headline,
  tagline, description, and both CTA buttons.
- **Hotlines card unchanged**, just repositioned to overlay the panel's right
  side.
- **Dots bottom-left, larger** — active dot is a wide pill; every dot gets a
  padded ≥24px hit area (also resolves the accessibility minor from the
  previous branch review).
- Slide data, 5s timing, hover/focus pause, and reduced-motion behavior are
  all unchanged.

## Components

### `HeroCarousel` (edit, stays a client component)

`src/features/home/components/hero-carousel.tsx`

- Becomes a fill-its-parent background layer: the wrapper drops the fixed
  `h-52 sm:h-64` sizing in favor of `absolute inset-0` (the parent panel in
  `HomeHero` is `relative` and provides the size).
- Slide images switch from `width/height` to `next/image` **`fill`** mode with
  `sizes="(min-width: 1280px) 1200px, 100vw"`; first slide keeps `priority`.
- A subtle scrim is added above the slides, below the dots: a bottom-up
  gradient (`bg-gradient-to-t from-ink-900/40 via-transparent to-transparent`
  or equivalent) so dots stay visible on bright photos. `aria-hidden`,
  pointer-events-none.
- **Dots move to bottom-left** (`bottom-*` `left-*` inside the panel padding):
  inactive dots ~12px circles, active dot a ~32px-wide pill, white with
  opacity states as today. Each dot button gets padding so its hit area is at
  least 24×24px (visual dot centered inside).
- Timer, pause-on-hover/focus, reduced-motion guard, and all ARIA attributes
  are unchanged.

### `HomeHero` (rewrite of layout, stays a server component)

`src/features/home/components/home-hero.tsx`

Structure inside the existing `<section>` + `Container` (section keeps its
`grid-bg` / radial backdrop and top padding for the fixed header):

1. **Panel:** `relative overflow-hidden rounded-[2.5rem] border
   border-ink-200/70 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.3)]`, desktop
   min-height ≈ `lg:min-h-[600px]`; on smaller screens the panel grows to fit
   stacked content.
2. **Background:** `<HeroCarousel slides={HERO_SLIDES} />` (absolute layer).
3. **Content layer:** a relative grid (`lg:grid-cols-12`, generous panel
   padding ~`p-6 sm:p-10 lg:p-14`, `items-center`) above the carousel:
   - **Left (`lg:col-span-7`):** white card — `rounded-3xl bg-white/95
     backdrop-blur shadow-xl`, padding ~`p-8 sm:p-10` — containing the
     existing badge ("Welcome To"), the gradient "Barangay San Fernando"
     headline with its underline SVG, `SITE.tagline`, `SITE.description`, and
     the two CTA buttons. All copy and elements identical to today, only
     re-housed.
   - **Right (`lg:col-span-4`, offset by an empty `lg:col-span-1` gap or
     `justify-self-end`):** `<EmergencyHotlinesCard />` as-is.
   - Below `lg`: single column — white card first, hotlines card below it,
     both over the sliding images.
4. Extra bottom padding on the content layer (or panel) so the bottom-left
   dots don't collide with the cards on mobile.

## Data model

No changes. `HERO_SLIDES` / `HeroSlide` stay as-is.

## Backend handoff notes

No changes — entities and mock-data inventory are unaffected by a layout
change.

## Out of scope

- Pause/play button and slide-change live announcements (still a noted
  follow-up from the previous review).
- Real barangay photos, arrows, swipe gestures.
- Any change to other home sections or other pages.

## Verification

`npm run typecheck` + `npm run lint` pass. Load `http://localhost:3000`:

1. Hero is one large rounded panel with the images sliding as its background.
2. White card on the left holds badge/headline/tagline/description/CTAs and
   stays fully readable on every slide.
3. Emergency Hotlines card overlays the right side (below the card on
   mobile-width viewport).
4. Dots sit at the panel's bottom-left, larger than before; clicking works;
   auto-advance still ~5s with hover pause.
5. No layout overflow at mobile width (375px), tablet (768px), desktop
   (1440px); screenshot at desktop width for the user to judge.
