# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

The official website of **Barangay San Fernando, San Nicolas, Ilocos Norte** (Philippines).
Next.js 16 App Router + React 19 + TypeScript (strict) + Tailwind CSS v4, backed by
**Supabase** (Postgres + Auth + Storage). The frontend was built first as a fully static
mock; backend integration is now well underway (migrations `0001`–`0011` applied; `0012`
applied to staging, still pending on production). Live and DB-backed: auth + account
self-service, the services catalog, all four ticketing flows (applications / appointments /
complaints / assistance), news + announcements + events, transparency (legislative documents
/ disclosure documents / monitored projects), and the officials directory. What remains
static lives in typed `data.ts` files — the About, Contact, and home content, plus the admin
**Dashboard Overview** seed. `docs/BACKEND_HANDOFF.md` is the living integration brief;
`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the per-plan history. Remaining
work: 2D email (Resend), migrating `lh3`-hotlinked images to owned Storage, and a
security-hardening pass.

## Commands

```bash
npm run dev        # http://localhost:3000 — often already running; check before starting another
npm run build      # production build (mix of static + dynamic/DB-backed routes)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint 9 flat config (eslint.config.mjs) — `next lint` no longer exists in Next 16
npm run test:unit  # Vitest, pure functions only (tests/unit)
npm run test:e2e   # Playwright against the dev server (tests/e2e); `--project=public` needs no login
```

**Tests were added 2026-07-22** (sub-project 5), lifting the earlier no-test rule. Two
frameworks with different jobs: **Vitest** covers pure functions — no jsdom, no React
renderer, so a broken test environment cannot make a broken page look green. **Playwright**
drives the real dev server through system Chrome; the `public` project needs no session, the
`admin` project reuses a storage state from `tests/e2e/auth.setup.ts` and skips unless
`E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` are set in `.env.local`. Component-level tests are
deliberately *not* a thing here — behaviour is verified in the browser. The ad-hoc
verification recipe still applies for one-off checks: `.claude/skills/verify/SKILL.md`.

## Architecture

- **Pages are thin.** Files in `src/app/` only compose named feature sections
  (`<TransparencyHero />`, `<LegislativeSection />`, …) — no inline layout logic or data.
  Public routes live in the `app/(public)` route group (shared header/footer chrome);
  the admin portal has its own `app/admin/layout.tsx` (sidebar chrome, `noindex`). The
  admin portal is **auth-gated** (Supabase Auth) and **permission-gated** — every admin
  route and Server Action goes through `requireSessionUser` / `requirePermission(...)` /
  `requireSuperAdmin()` in `src/lib/auth.ts`. Managers are DB-backed with real
  draft→in-review→published→archived workflows and drawer editors that **persist through
  Server Actions**; only the **Dashboard Overview** still renders mock seed from
  `features/admin/data.ts` (the nav is real, but `RECENT_DRAFTS` / `PUBLISHING_ACTIVITY` /
  `ADMIN_TEAM` are placeholder).
- **Admin table standards** (sub-project 5, 2026-07-22) are shared primitives, not per-manager
  code: `RowActions` (the row kebab — Edit / Publish / Archive / Delete; portals to
  `document.body` because every admin table sits in `overflow-x-auto`), `ConfirmDialog`
  (replaces `window.confirm`; focus starts on Cancel, stays locked while the action runs),
  `useToast` (carries an incrementing `id` so a repeated message re-fires, plus an error
  tone), `Skeleton` + a `loading.tsx` per admin route, `Tooltip`, `SortableTh` +
  `useTableSort`, and `useEditDeepLink` (`?edit=` / `?review=` from global search).
  **Destructive actions belong on the row, not in the drawer.** Reorder arrows are hidden
  whenever a filter, a search, or a non-`order` sort is active — "move up" only means
  something when the row above is the one that would be swapped.
- **Feature modules own everything for a route:** `src/features/<name>/` =
  `data.ts` (typed mock content) + `components/` (section components) + `index.ts`
  (barrel re-exports, kept in page order). Pages import only from the barrel.
- **Shared shapes live in `src/types/index.ts`** — the single source of entity interfaces
  and the de-facto API contract. Site-wide identity/nav/hotlines live in
  `src/constants/site.ts` (`SITE` object).
- **Writes go through Server Actions + a service-role Supabase client.** All tables have
  **RLS enabled with zero policies** — the service-role client (`src/lib/supabase/admin.ts`)
  behind an explicit `requirePermission(...)` code check is the *entire* auth gate, and the
  public/published boundary is the `.eq("status","published")` filter in the query layer.
  Server Actions are public HTTP endpoints, so every write re-validates its input with Zod
  at runtime. Never expose the service-role key to the client. Migrations live in
  `supabase/migrations/`; the owner applies them **manually** against live Supabase staging —
  never assume a migration is applied without confirmation. zod is **v4** (not v3).
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
- Content changes for the **still-static** features go in that feature's `data.ts`, never
  hardcoded in components. Content for **DB-backed** features (services, tickets, news,
  transparency, officials) is edited through the admin portal and lives in Supabase — not in
  the repo.
- Placeholder reality: transparency documents now serve **real** Supabase-hosted PDFs/images,
  so the old `"#"` download stubs are gone; remaining `"#"` hrefs are in-page anchors / not-
  yet-wired links (contact map, captain message, hero CTA). The barangay hotline is **real**
  (`(077) 600 1082` in `SITE.phone` / `EMERGENCY_HOTLINES[0]`); other phone numbers, emails,
  and office hours are still placeholder-shaped (correct names, not real contact data). Most
  images are hotlinked from `lh3.googleusercontent.com` (allow-listed in `next.config.ts`)
  and must eventually move to owned Storage (`public-media` exists). Exceptions — real assets
  bundled via static
  imports: the home hero carousel (`src/images/carousel/`, `HERO_SLIDES` in
  `src/features/home/data.ts`) and the barangay seal (`src/images/logo/`, `SITE.sealImage`).
  The other 11 officials' portraits now live in Supabase Storage (`public-media/officials/`,
  migration `0012`); `src/images/officials/` stays in the repo only as the source for
  `scripts/upload-official-portraits.mjs`, not as an app dependency. The **Punong Barangay's**
  portrait is still a bundled static import, reused by the About-page `CAPTAIN` block — that
  did not change. Officials' names are real; their bios are empty and emails/phones are
  placeholder-shaped. The favicon `src/app/icon.png` is a 256px circular crop of the seal —
  regenerate it if the seal changes.
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
  by ESLint, not part of the app. Newer exports (`stitch_tabbed_content_manager/` — source
  of the admin screens) sit untracked at the repo root by choice: don't commit or delete them.
- Design/implementation history (specs and plans) lives in `docs/superpowers/specs/` and
  `docs/superpowers/plans/`; those dated files are historical records — don't retro-edit them.
