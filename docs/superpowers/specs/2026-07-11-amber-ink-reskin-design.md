# Amber + Ink Full Re-skin — Design Spec

**Date:** 2026-07-11
**Status:** Approved by user (pending spec review)
**Reference:** https://constructioneng.vercel.app/ ("ConstructEng")

## Goal

Restyle the entire Barangay Sampaguita website — theme, navbar, footer, every public
page section, and the admin shell — to match the visual design of the ConstructEng
reference site, while keeping **all content, routes, data files, and section order
unchanged**. This is a pure re-skin (Approach A): no content is invented, removed, or
restructured.

## Decisions (user-confirmed)

1. **Palette:** Adopt the reference's amber + ink palette exactly (not National Blue,
   not a hybrid).
2. **Scope:** Everything, including the `/admin` portal shell.
3. **Navbar:** Full reference style — floating glassy pill, seal as small round logo,
   short "Barangay Sampaguita" wordmark, pill links, single CTA. The TopBar is
   **removed**; hotline + office hours relocate to the footer.
4. **Approach:** Token-first re-theme + component restyle; architecture untouched.

## 1. Design Tokens & Typography (`src/app/globals.css`)

Replace the "Civic Horizon / National Blue" `@theme` with:

### Brand (amber — Tailwind amber scale)

| Token | Value |
| --- | --- |
| `brand-100` | `#fef3c7` |
| `brand-200` | `#fde68a` |
| `brand-300` | `#fcd34d` |
| `brand-400` | `#fbbf24` |
| `brand-500` (primary) | `#f59e0b` |
| `brand-600` | `#d97706` |
| `brand-700` | `#b45309` |
| `brand-800` | `#92400e` |

Primary CTA gradient: `from-brand-400 to-brand-600`, text `ink-900`.

### Ink (neutrals)

| Token | Value |
| --- | --- |
| `ink-50` | `#f7f7f8` |
| `ink-100` | `#eeeef0` |
| `ink-200` | `#d8d8dd` |
| `ink-300` | `#b6b6bf` |
| `ink-400` | `#8e8e9b` |
| `ink-500` | `#71717f` |
| `ink-600` | `#5b5b67` |
| `ink-700` | `#4a4a55` |
| `ink-800` | `#3f3f47` |
| `ink-900` | `#1a1a1f` |
| `ink-950` | `#0d0d10` |

Page background: white. Body text `ink-600`, headings `ink-900`. Dark surfaces:
`ink-900` / `ink-950`. Subtle section tint: `ink-50`.

### Danger (kept, re-tuned)

Emergency/hotline red stays as a token family, adjusted to sit on the new neutrals
(e.g. red-600 family on white, red-400 accents on dark). No blue tokens remain.

### Typography

- `font-display`: **Space Grotesk** (headings — semibold, tracking-tight). Replaces
  Montserrat.
- `font-sans`: **Inter** (body) — unchanged.
- Both loaded via `next/font/google` in `src/app/layout.tsx` exposing `--font-space-grotesk`
  and `--font-inter`.
- Headline scale follows the reference: hero `text-4xl → lg:text-[64px]`,
  `leading-[1.05]`, `text-balance`.

### Shape, depth, motion

- Base radius ~`1rem`; cards `rounded-3xl`, hero/feature panels `rounded-[2rem]`,
  buttons/badges/nav pills `rounded-full`, inputs `rounded-2xl`.
- Shadows: soft layered (`0 8px 24px rgba(0,0,0,0.18)` for dark buttons,
  `0 24px 60px -20px` for panels); amber glow `0 8px 24px rgba(245,158,11,0.35)` on
  primary CTAs, deepening on hover.
- Micro-interactions: `active:scale-[0.98]` on buttons, `hover:brightness-110` on
  gradient CTAs, existing `fade-up` keyframe kept.

### Signature utilities (new, copied from reference)

- `grid-bg` — faint blueprint grid background, masked with a radial ellipse.
- `bg-radial-fade` — soft amber radial glow.
- `text-gradient-brand` — amber gradient text for headline accent words.
- Blur-orb pattern for dark panels: absolutely-positioned `bg-brand-500/30 blur-3xl`
  circles.

## 2. UI Primitives (`src/components/ui`)

| Component | New treatment |
| --- | --- |
| `Button` | `rounded-full`. Variants: **primary** = amber gradient + glow + `active:scale-[0.98]`; **secondary** = solid `ink-900`, white text, dark shadow; **outline** = `border-ink-200` white/70 backdrop-blur; **ghost**. CTA convention: trailing `ArrowUpRight` icon. Danger variant kept for emergency CTAs. |
| `Card` | `rounded-3xl border-ink-200/70 bg-white` + ambient shadow, hover lift. |
| `Badge` | Eyebrow pill: `rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider` with leading icon (amber). Light and on-dark (`border-white/15 bg-white/5 text-brand-300`) variants. |
| `SectionHeading` | Eyebrow pill + Space Grotesk heading with optional gradient accent word; supporting copy in `ink-600`. |
| Form fields | `rounded-2xl`, `focus-visible:ring-4 ring-brand-400/20 focus-visible:border-brand-400`, `h-12`. Dark variant for footer newsletter: `border-white/15 bg-white/5 text-white placeholder:text-ink-400`. |
| `Accordion` | Ink borders, amber chevron/accents, rounded-2xl items. |
| `DataTable` | Ink header row (`ink-50` bg), `border-ink-200` dividers, rounded-2xl wrapper. |
| `IconCircle` | Amber-tinted (`bg-brand-100 text-brand-700`) default; dark variant for ink panels. |
| `Container` / `Section` | Unchanged structurally; Section gains optional `tone` (white / ink-50 / dark). |

## 3. Layout Chrome

### Navbar (`site-header.tsx` + `navigation/*`)

- `fixed inset-x-0 top-0 z-50` with `py-5`; inner pill:
  `rounded-full border bg-white/40 backdrop-blur-md px-4 py-2` inside the container.
- Left: barangay **seal image** as a small round logo (~36px) + "Barangay Sampaguita"
  wordmark (`text-base font-semibold tracking-tight`). The three-line
  republic/locality identity block is dropped from the header (locality remains in the
  footer identity block).
- Center (md+): pill nav links — `rounded-full px-4 py-2 text-sm font-medium`,
  inactive `text-ink-600 hover:text-ink-900`, active gets an absolute
  `bg-ink-900/[0.06]` pill behind it (`NavLink` stays the active-route-aware client
  helper).
- Right: **"Contact Us"** CTA — solid `ink-900` rounded-full button with
  `ArrowUpRight`, hidden on mobile; round glassy burger button
  (`border-ink-200/80 bg-white/80 backdrop-blur`) on mobile opening the existing
  `MobileNav` sheet (restyled to match).
- Scroll behavior: past ~8px the pill gains a visible border + stronger bg
  (`bg-white/80`). Implemented inside the existing client boundary (header wrapper
  becomes a thin client component or the scroll state lives in `MobileNav`'s parent —
  a small new `"use client"` `HeaderShell` is acceptable; keep it minimal).
- **TopBar component is deleted** and its imports removed from `public-shell.tsx`.
- Because the header is now `fixed` (not sticky/in-flow), every page's first section
  (heroes) provides top padding (`pt-32`-ish) to clear it.

### Footer (`site-footer.tsx`)

- `bg-ink-950 text-ink-100 border-t border-white/10`, radial amber fade at top.
- **Newsletter panel** (top): `rounded-[2rem]` gradient panel
  (`from-ink-900 via-ink-900 to-ink-800`, `border-white/10`) with an amber blur orb;
  left = on-dark eyebrow pill + Space Grotesk heading + supporting copy; right = the
  existing `NewsletterForm` client island restyled (dark input + gradient submit).
  This is the SMS/newsletter signup that previously lived in the news sidebar — the
  sidebar instance stays; the footer panel reuses the same component.
- **Link columns**: existing government links, legal links, quick nav, social icons.
- **Contact block**: address, phone, email, and — relocated from the deleted TopBar —
  **emergency hotline and office hours**.
- Bottom row: seal + identity line ("Republic of the Philippines · Barangay
  Sampaguita, City of San Fernando") + copyright.

### Heroes

- `HomeHero`: badge pill (e.g. "Serving the community since …" from existing data),
  huge Space Grotesk headline with an amber `text-gradient-brand` accent phrase and
  the hand-drawn SVG underline stroke, supporting copy, dual pill CTAs (primary
  gradient + outline), `grid-bg` + radial fade background, hero image in a
  `rounded-[2rem]` framed card. Content (headline text, CTAs, image) unchanged from
  `features/home/data.ts`.
- `PageHero` (inner pages): same language scaled down — eyebrow pill, gradient accent
  word, grid-bg backdrop, `pt-36`-ish top padding to clear the fixed navbar.

## 4. Feature Sections & Admin

Every component under `src/features/*/components` and `src/components/{sections,shared}`
keeps its content, props, data source, and order, restyled to the new language:

- Eyebrow pill badges replace current section eyebrows.
- Cards → `rounded-3xl` ink-bordered with soft shadows; image cards get
  `rounded-[2rem]` frames.
- Dark CTA panels (`CtaBanner`, `GetInvolvedSection`, `ActionCenterBanner`,
  `FoiSection`, `HelpSection` emergency block) → `ink-900`/`ink-950` gradient panels
  with amber blur orbs and on-dark buttons.
- `StatCard` → reference metric style (big Space Grotesk number, `ink-500` label).
- Emergency/danger elements keep red accents on the new neutrals.
- **Admin shell** (`features/admin/components`, `app/admin/layout.tsx`): sidebar and
  topbar re-skinned to ink neutrals with amber active states; `ContentTypeCard`,
  `RecentDrafts`, `PublishingActivity`, `AdminPlaceholder` adopt the card/badge
  language. Structure and mock data unchanged.

## Constraints & Conventions (unchanged from BACKEND_HANDOFF §5)

- No raw hex in components — extend `@theme` in `globals.css` only.
- Client islands stay minimal: existing four + (at most) one small header scroll-state
  component.
- Pages stay thin; no data or route changes; `data.ts` files untouched except where a
  purely presentational string (e.g. a hero accent phrase split) requires a
  presentational prop — content text itself never changes.
- Path alias `@/*`, shared types in `src/types`, shared values in `src/constants`
  (NAV_ITEMS untouched; `TopBar`-only constants stay in `site.ts` for the footer to
  consume).

## Out of Scope

- Any backend work, new routes, new content, image re-hosting, auth.
- Reference-site sections that have no counterpart here (testimonials carousel,
  before/after slider, FAQ, process steps) — not added.
- Dark mode toggle (reference ships `.dark` vars; we ship light-only like today).

## Verification

1. `npm run typecheck` passes.
2. `npm run build` passes with all routes still prerendering static.
3. Visual pass over all 7 public routes + 5 admin routes in the dev server: no
   remaining blue-token classes (grep for old token names verifies), navbar floats and
   gains border on scroll, footer newsletter form still submits (fake) correctly,
   mobile nav works.
