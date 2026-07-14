# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

The official website of **Barangay San Fernando, San Nicolas, Ilocos Norte** (Philippines).
Next.js 16 App Router + React 19 + TypeScript (strict) + Tailwind CSS v4. Frontend is
complete and fully static; **there is no backend yet** — every piece of content the backend
will eventually own lives in typed `data.ts` files. `docs/BACKEND_HANDOFF.md` is the
authoritative brief for that integration (entities, mock-data inventory, suggested API
surface, work items in priority order).

## Commands

```bash
npm run dev        # http://localhost:3000 — often already running; check before starting another
npm run build      # production build (all routes prerender static)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint 9 flat config (eslint.config.mjs) — `next lint` no longer exists in Next 16
```

**There is no test framework.** Do not add one casually. Verification = typecheck + lint +
driving the running app; the runtime-verification recipe (including how to drive the browser
with playwright-core against system Chrome) is in `.claude/skills/verify/SKILL.md`.

## Architecture

- **Pages are thin.** Files in `src/app/` only compose named feature sections
  (`<TransparencyHero />`, `<LegislativeSection />`, …) — no inline layout logic or data.
  Public routes live in the `app/(public)` route group (shared header/footer chrome);
  the admin portal has its own `app/admin/layout.tsx` (sidebar chrome, `noindex`,
  unprotected interactive mock — six sections over typed seed data in
  `features/admin/data.ts` — mostly wrapping the public content; applications are first-class records keyed by `serviceId`; drawer editors fake-save).
- **Feature modules own everything for a route:** `src/features/<name>/` =
  `data.ts` (typed mock content) + `components/` (section components) + `index.ts`
  (barrel re-exports, kept in page order). Pages import only from the barrel.
- **Shared shapes live in `src/types/index.ts`** — the single source of entity interfaces
  and the de-facto API contract for the future backend. Site-wide identity/nav/hotlines
  live in `src/constants/site.ts` (`SITE` object).
- **Server Components by default.** Client components (`"use client"`) only for real
  interactivity: `SiteHeader` scroll state, mobile navs, `Accordion`, `LegislativeTable`
  (collapsible rows), inquiry + newsletter forms, and the admin portal's managers/drawer
  editors (Drawer, Toast, MiniCalendar, ToggleSwitch). Small state helpers live in
  `src/hooks/` (`useDisclosure`).
- **Design system: amber + ink.** All colors/fonts/radii are Tailwind v4 `@theme` tokens in
  `src/app/globals.css` — `brand-*` (amber), `ink-*` (neutrals), `danger*`. Use only these
  tokens; blue tokens are from the pre-2026-07 design and must not reappear. Space Grotesk
  (`font-display`) headings, Inter body. UI primitives (Button, Card, Section,
  SectionHeading, DataTable, Accordion, …) are in `src/components/ui/`.
- **Icon caveat:** several data shapes carry `icon: LucideIcon` (a React component). A future
  API must return icon *name strings* mapped to components on the frontend.

## Conventions and gotchas

- Path alias `@/*` → `src/*`.
- Content changes go in the feature's `data.ts`, never hardcoded in components.
- Placeholder reality: document/download `fileUrl`s are `"#"`; phone numbers, emails, and
  office hours are placeholder-shaped (correct names, not real contact data); most images
  are hotlinked from `lh3.googleusercontent.com` (allow-listed in `next.config.ts`) and
  must eventually move to owned storage. Exceptions — real assets bundled via static
  imports: the home hero carousel (`src/images/carousel/`, `HERO_SLIDES` in
  `src/features/home/data.ts`), the barangay seal (`src/images/logo/`, `SITE.sealImage`),
  and **all 12 officials' portraits** (`src/images/officials/`; the Punong Barangay photo
  is also reused by the About-page `CAPTAIN` block). Officials' names are real; their
  emails/phones are placeholder-shaped. The favicon `src/app/icon.png` is a 256px circular
  crop of the seal — regenerate it if the seal changes.
- Real content (verified against the barangay's official **Ecological Profile / Barangay
  Development Plan** PDF, 2026-07-13): mission/vision, the About history timeline (1733
  founding) and "Community Programs", home glance stats, and the Services waste-collection
  schedule. Land area is **8.95 ha** — the PDF's own "(0.895 sq. km)" parenthetical is a
  decimal error; don't reintroduce it. Still invented: the About `CAPTAIN.message` quotes
  (flagged in `docs/BACKEND_HANDOFF.md` §6 — needs his real message before launch).
- The barangay identity is San Fernando everywhere (renamed 2026-07-12 from the
  "Barangay Sampaguita" design placeholder) — any "Sampaguita" appearing in `src/` is a
  regression. San Nicolas is a **municipality** (write "Municipal …", not "City …"), and the
  Ilocos Norte area code is (077).
- `stitch/` holds the original design-tool HTML exports — reference material only, ignored
  by ESLint, not part of the app.
- Design/implementation history (specs and plans) lives in `docs/superpowers/specs/` and
  `docs/superpowers/plans/`; those dated files are historical records — don't retro-edit them.
