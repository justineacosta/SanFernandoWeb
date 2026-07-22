# UI/UX Overhaul — Design Spec

**Date:** 2026-07-23
**Status:** Approved (brainstormed and section-approved in session)
**Executor:** Planned for execution by a separate session (Opus) via a written implementation plan.

## 1. Purpose and constraints

The site and CMS will be demonstrated live to Barangay San Fernando's officials as part of the
project proposal (`proposal/` at repo root, untracked). The goal of this pass is **demo
credibility**: both surfaces must read as professional, finished software. This is a
**presentational overhaul only**.

Hard constraints, in priority order:

1. **All functionality keeps working exactly as it does today.** No changes to Server Actions,
   query functions, Zod schemas, hook logic, handlers, routing, or data shapes. Diffs live in
   JSX structure, class names, `globals.css`, and the presentation layer of UI primitives.
2. **Existing tests are the behavioral contract.** Vitest and both Playwright projects
   (`public`, `admin`) must pass unchanged — a visual change never edits a test to fit.
   `npm run typecheck` and `npm run lint` green at every phase boundary.
3. **Identity stays amber + ink.** Palette and fonts (Space Grotesk display, Inter body) are
   fixed. Color additions are limited to the three tokens this spec names: `--color-brand-50`
   (§2) and the `--color-success` / `--color-success-soft` pair (§4).
4. **Interface text** may change only where this spec says so (empty states, §4). Labels that
   tests or user flows depend on stay verbatim.
5. **Responsive is first-class at every breakpoint** — the demo runs desktop → laptop →
   tablet → phone. Verification covers 1440 / 1024 / 768 / 390 widths.
6. **Motion:** orchestrated key moments only (§5), always respecting
   `prefers-reduced-motion`. No animation libraries.

## 2. Design language refinements (Phase 0 — the shared layer)

Palette and fonts unchanged; the refinement is discipline and hierarchy.

- **Type scale.** Page heroes step up to `text-5xl`–`text-7xl` on desktop; inner headings stay
  where they are, restoring a clear "one big moment" per page.
- **Editorial eyebrow.** `SectionHeading`'s eyebrow changes from the pill `Badge` to an
  editorial label: uppercase, `tracking-[0.2em]`, `text-xs`, ink-500, preceded by a short amber
  rule (24px `bg-brand-500` bar). Badges remain for genuine statuses (news categories, ticket
  states). The change is internal to `SectionHeading`; pages inherit it.
- **Signature mark.** The hand-drawn amber underline stroke (today only in the home hero) is
  extracted into a `BrandStroke` component and used sparingly and only in: the home hero, each
  public page's `PageHero` keyword, the auth/login card, and the form-success reference-number
  moment (§3). Nowhere else.
- **Elevation tokens.** Replace ad-hoc `shadow-[...]` literals (Button, cards) with a token
  scale in `@theme`: `--shadow-ambient` (exists), `--shadow-raised`, `--shadow-floating`, and
  `--shadow-brand-glow` (the amber glow, reserved for primary CTAs). Cards standardize on one
  border+shadow recipe.
- **Section rhythm.** `Section` gains a `spacing` prop: `normal` (current `py-12 md:py-16`)
  and `spacious` (`py-16 md:py-24`).
- **Color roles, written down:** amber = action and wayfinding only (never long text);
  `ink-950` surfaces = at most one anchor moment per page; danger = destructive/emergency only.
  One additive palette token: `--color-brand-50: #fffbeb` for soft amber washes.
- **Motion tokens** live here too (§5) so both surfaces share one vocabulary.

## 3. Public site pass (demo order)

- **Home.** The one page-load orchestration on the site: eyebrow → headline → `BrandStroke`
  drawing itself in (SVG stroke-dash reveal, ~600ms) → tagline → CTAs, staggered over ~1s,
  pure CSS delays. Carousel behavior unchanged; its frame gets standardized elevation and a
  subtle amber edge. Sections below (Quick Services, Community Pulse, Get Involved) get
  scroll reveals and the new heading treatment. Quick Services cards: hover lift + icon tint
  shift.
- **All public pages** inherit the upgraded `PageHero` (bigger display type, editorial
  eyebrow, stroke under the keyword).
- **Services.** Catalog cards get clearer affordance: requirements count, fee, an "Apply"
  arrow that nudges on hover.
- **Transparency.** Quiet and precise — this page sells trust. Row hover states, unified
  file-type badge alignment, `tabular-nums` on dates/figures. No motion beyond section
  reveals.
- **News / Announcements / Events.** Consistent aspect-ratio crops on card imagery, gentle
  image zoom-on-hover, typography does the rest.
- **Officials.** Uniform portrait framing; the 24/7 Action Center panel becomes an `ink-950`
  anchor moment.
- **About.** History timeline rendered as a visually connected line (the content is a real
  sequence, so the device is honest); stats section gets `spacious` rhythm.
- **Forms & ticket flows (apply / appointments / complaints / assistance).** Same fields,
  steps, actions, and validation. Upgrades: a consistent form shell (title, short "what
  happens next" note, progress context where multi-part), field grouping with section rules,
  unified inline-validation styling, and a celebratory success state — the reference-number
  moment gets the `BrandStroke` and a confident layout.
- **Track.** Status history rendered as a proper status-timeline treatment.

## 4. Admin CMS pass

Direction: density, calm, status clarity — professional software, no theatrics.

- **Shell.** All behavior unchanged (cookie-persisted collapse, permission-gated titles,
  grouped nav, `AdminShell` state ownership). Visual: active nav item gets an amber left-edge
  rule + tinted background; group labels adopt the letterspaced editorial style; the top bar
  gets a hairline bottom border + slight background blur; the `ink-950` sidebar gets subtle
  depth separation from the content column.
- **Tables.** One polish applied through the shared primitives: consistent cell-padding
  scale, `tabular-nums` on dates/counts, unified status-badge vocabulary with a colored dot —
  draft = ink, in-review = amber, published = green. This adds the only other new tokens:
  `--color-success` / `--color-success-soft` (a semantic pair, not decoration). Row hover is
  a soft ink wash. Empty states become invitations to act ("No announcements yet — create the
  first one"), the only sanctioned interface-text change. `Skeleton` shimmer aligns to the
  real table layout.
- **Drawers & feedback.** Sticky drawer header (record title + status badge) and sticky
  footer (actions always visible); field grouping with section rules; the "Recovery copy
  saved on this device" line styled as a quiet timestamp row. Toasts use the elevation tokens
  and a slide-fade entrance; `ConfirmDialog` shares the surface language. Focus and behavior
  logic untouched.
- **Login.** The auth card adopts the portal's card language: seal, `BrandStroke` under
  "San Fernando" — currently plainer than what it unlocks.

## 5. Motion system

Defined once in `globals.css`, shared by both surfaces.

- **Tokens:** `--duration-quick: 150ms` (micro-interactions), `--duration-reveal: 600ms`
  (entrances), `--ease-out-soft: cubic-bezier(0.16, 1, 0.3, 1)`. All transitions use these;
  the current mix of ad-hoc durations goes away.
- **Exactly three patterns:**
  1. **Page-load orchestration** — home hero only. Pure CSS animation delays, no JS.
  2. **Scroll reveal** — a small `Reveal` client component (~30 lines): IntersectionObserver
     adds a class once, then disconnects. Fade + 16px rise; optional stagger for card grids.
     Children render server-side and untouched (it only toggles a class), so Server Component
     sections stay server components, and content is visible without JS (the observer only
     animates; initial state is visible when JS is absent).
  3. **Micro-interactions** — hover lift on cards, icon nudges, button states, drawer/toast
     entrances. CSS only, `--duration-quick`.
- **Admin gets pattern 3 only.** No scroll reveals or orchestration on a daily work tool.
- **Reduced motion:** one `@media (prefers-reduced-motion: reduce)` block zeroes reveal
  transforms and durations globally, covering the hero orchestration too.
- **No animation libraries.**

## 6. Verification

- Per phase: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e` —
  all green, tests unmodified.
- Per phase: drive the real dev server (project `verify` skill) and screenshot affected pages
  at 1440 / 1024 / 768 / 390, checked against this spec.
- Final: full demo-route walkthrough (home → services → one ticket flow → transparency →
  news → admin login → managers) at all four widths.
- **Accessibility floor** (built in, not a phase): visible keyboard focus everywhere, reduced
  motion respected, WCAG AA contrast for all new color applications — amber-on-white text is
  only ever `brand-600`+, and status dots always pair with text, never color alone.

## 7. Phasing (= the demo route after the foundation)

| Phase | Scope |
| --- | --- |
| 0 | Design language (§2) + motion tokens (§5) — lifts every page at once |
| 1 | Home page orchestration + sections |
| 2 | Public inner pages (services → transparency → news/announcements → officials → about → contact) |
| 3 | Forms, ticket flows, track |
| 4 | Admin CMS (shell → tables → drawers/feedback → login) |
| 5 | Full demo-route walkthrough + fixes |

Phases are ordered so that cutting from the bottom always leaves a coherent front of the
demo walkthrough.

## 8. Explicitly out of scope

- Any behavior, flow, schema, or Server Action change; any test edit.
- Palette or font replacement; blue tokens stay dead.
- New dependencies (animation or otherwise).
- Resend email work, `lh3` image migration, security hardening (tracked separately in
  `docs/BACKEND_HANDOFF.md`).
- Copy rewrites beyond admin empty states.
