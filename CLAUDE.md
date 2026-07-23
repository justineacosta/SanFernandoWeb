# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

The official website of **Barangay San Fernando, San Nicolas, Ilocos Norte** (Philippines).
Next.js 16 App Router + React 19 + TypeScript (strict) + Tailwind CSS v4, backed by
**Supabase** (Postgres + Auth + Storage). The frontend was built first as a fully static
mock; backend integration is now well underway (migrations `0001`–`0011` applied;
`0012`–`0023` applied to staging, still pending on production). Live and
DB-backed: auth + account self-service, the services catalog, all four ticketing flows
(applications / appointments / complaints / assistance), contact inquiries + alert
subscribers, anonymous site feedback, news + announcements + events, transparency
(legislative documents / disclosure documents / monitored projects), and the officials
directory. What remains
static lives in typed `data.ts` files — the contact channels and inquiry subject list, and
the home page's six Quick Services cards. The Home and About pages became DB-backed in
sub-project 9 (`0021`). `docs/BACKEND_HANDOFF.md` is the living integration brief;
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
  Server Actions**. Every manager is now DB-backed; the mock Dashboard Overview was deleted
  in the 2026-07-22 polish pass and **`/admin` is a redirect**, not a page — it sends the
  signed-in user to the first nav entry they may reach (`firstPermittedPath`; Settings is
  ungated, so a target always exists and it cannot loop). `ADMIN_TEAM` in
  `features/admin/data.ts` is the last placeholder constant left, and nothing renders it.
- **The nav gate is one module, not a predicate copied four times.** `src/lib/admin-nav.ts`
  holds pure helpers over `ADMIN_NAV_ITEMS` — `canSeeNavItem` / `visibleNavItems` /
  `groupNavItems` / `firstPermittedPath` / `adminPageTitle` — consumed by the sidebar, the
  mobile drawer, the `/admin` redirect and the top bar's title. It is the only unit-tested
  code in the admin portal (`tests/unit/admin-nav.test.ts`), because it is the only pure
  logic. **`adminPageTitle` is permission-gated on purpose:** the portal 404s on unpermitted
  routes so those modules stay hidden, but the layout renders *above* that 404, so an
  ungated lookup would print the module's name over the not-found page. Nav items are
  grouped **Requests / Content / System**, and the flat order of that table decides where
  each user lands after login. The sidebar collapses to a 72px icon rail; its state is a
  `sf-admin-sidebar` **cookie read server-side in the layout**, never `localStorage` in an
  effect — an effect runs after paint, so the rail would render expanded and snap shut on
  every load. `AdminShell` owns that state because the fixed rail and the main column's
  compensating margin have to move together.
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
- **Archive vs delete** (sub-project 6, migration `0020`): archiving is a soft delete anyone
  with the module permission may do; **permanent deletion is SuperAdmin-only and reachable
  only from a record already `archived`** — both conditions enforced server-side by
  `guardDelete()` in `src/lib/archive.ts`, never by the UI alone. Every manager has an
  **Active | Archived** view (`ViewToggle`); `archived` is not a status-dropdown value.
  Restore returns a record to `draft`, never to `published`, and files a `restore` audit
  entry. News, announcements and events gained their deletes in sub-project 7, on the same
  two-condition gate, each removing its own media (an article's `news_photos` objects
  included — the DB cascade drops the rows, not the files).
- **Feedback is anonymous, and that shapes everything about it** (sub-project 10, migration
  `0023`). The floating widget on the public side stores no name, email or IP, so there is no
  consent field, no reply path and no `/track` entry — `/contact` stays the channel for anything
  needing an answer. Screenshots live in the **private** `feedback-media` bucket and are read
  through ten-minute signed URLs minted in the query layer, because a screenshot can contain the
  sender's own account page; it is the project's only private bucket, so `photoUrl`-style
  helpers deliberately have no twin for it. `feedback` is also the one table whose delete is not
  gated on `archived`: SuperAdmin, from a `dismissed` row only, because an anonymous endpoint
  that accepts images needs a janitor. Inquiries still have no delete at all. The widget is
  mounted once in `PublicShell` as a **sibling** of the header — nesting it inside the
  `backdrop-filter` chrome would break its `position: fixed`.
- **Uploads defer to Save** (sub-project 7, 2026-07-22): every uploader is a *pure file
  picker* making no network calls — `PdfUploader`, `MultiFileUploader`, `SingleImageUploader`,
  and `NewsPhotoUploader`'s pending list. The save Server Action uploads server-side and
  **compensating-deletes** the object if the row write fails, so "a storage object exists only
  if a row references it" holds by construction. Copy `saveLegislative`'s `fail()` helper for
  any new one. `src/lib/media.ts` (not a `"use server"` module, deliberately unaudited) holds
  `uploadSingleImage` / `removeStoredImage` / `discardImage`. The one exception is
  `AchievementPhotoUploader`: its editor has no Save button to defer to, so it stays eager —
  see the sub-project 7 spec §2.4 before "fixing" it. `scripts/report-orphaned-media.mjs`
  lists unreferenced objects and never deletes.
- **Autosave is a local recovery copy, never a database write** (sub-project 8, 2026-07-22).
  The seven draft-capable drawers call `useFormDraft(userId, scope, recordId, values)`
  (`src/hooks/use-form-draft.ts`; pure helpers in `src/lib/form-draft.ts`), which debounces a
  JSON snapshot of `values` into `localStorage` under
  `sf-draft:v1:<userId>:<scope>:<recordId|new>`. **It must never write to Postgres:** editing a
  published record does not change its status, so a timed DB write would push unreviewed text
  onto the live site. Files stay out because the hook is handed `values` and `File` state lives
  outside it — don't "fix" that by passing file state in. Restore is **offered, never applied**
  (the server may have moved on). The status line says *"Recovery copy saved on this device"*,
  never "Saved". `AchievementsEditor` is out of scope: it saves each field on blur and has no
  draft model to hook into.
- **Home and About are database-backed content, not code** (sub-project 9, migration `0021`).
  Nine blocks live in `site_blocks` (four singleton texts) + `site_items` (five ordered
  collections in one table, discriminated by a `site_block` enum with generic
  `label`/`value`/`body` slots whose per-block meaning is fixed in
  `src/features/admin/site-blocks.ts`). **There is no status column and Save writes live** — a
  page section has no lifecycle, so there is no Active|Archived view and no `guardDelete`;
  deletion is direct and takes its storage object with it. Every action must call
  `revalidatePath("/")` **and** `revalidatePath("/about")`, or edits sit invisible for an hour.
  An empty block hides its section (the hero keeps its text and drops the carousel). Section
  headings, the About `PageHero` and the Join-Community panel stay hardcoded — editable
  everything is a page builder. `manage-site-content` is deliberately **not** in
  `STATUS_PRESETS.editor`. `@dnd-kit` is confined to `src/components/ui/sortable-list.tsx`
  (pass a `useId()` as the `DndContext` id or several lists hydrate mismatched); every existing
  up/down list stays as it is. **Migration `0021` requires `node scripts/upload-site-images.mjs`
  once per environment** — without it the seeded rows point at objects that do not exist.
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
- **Motion (framer-motion, imported from `"motion/react"`) is for what CSS cannot do** —
  exit animations (`AnimatePresence`), shared-element indicators (the admin sidebar's
  `layoutId` pill), and mount-time staggers over data. The CSS three-pattern system
  (hero-seq, `.reveal-*`, `--duration-quick` micro-interactions) stays CSS; never port it
  to Motion. All springs/durations come from `src/lib/motion.ts` (budget-tested in
  `tests/unit/motion.test.ts`) — never inline them. Every Motion surface wraps in
  `<MotionConfig reducedMotion="user">`. Never put a transform on a wrapper containing
  `position: fixed` descendants — the admin `Drawer` renders in place, which is why the
  route templates animate opacity only, and why the Drawer itself stays CSS (converting
  it to `AnimatePresence` would also unmount closed editors and reset their form state).
- **Icon caveat:** several data shapes carry `icon: LucideIcon` (a React component). A future
  API must return icon *name strings* mapped to components on the frontend.

## Conventions and gotchas

- Path alias `@/*` → `src/*`.
- Content changes for the **still-static** features go in that feature's `data.ts`, never
  hardcoded in components. Content for **DB-backed** features (services, tickets, news,
  transparency, officials, and the Home/About page blocks) is edited through the admin portal
  and lives in Supabase — not in the repo. `src/features/home/data.ts` holds only
  `QUICK_SERVICES`, which **came back out of the CMS** in the 2026-07-22 polish pass
  (migration `0022` deleted its rows): six links to this site's own routes change when the
  routes change, which is a deploy, not an edit. Don't put them back.
  `src/features/about/data.ts` retains only the `CAPTAIN` name/role/photo fallback.
- Placeholder reality: transparency documents now serve **real** Supabase-hosted PDFs/images,
  so the old `"#"` download stubs are gone; remaining `"#"` hrefs are in-page anchors / not-
  yet-wired links (the contact page's "Get Directions", captain message, hero CTA). The
  barangay hotline is **real** (`(077) 600 1082` in `SITE.phone` / `EMERGENCY_HOTLINES[0]`)
  and the officials page's 24/7 Action Center dials it rather than 911; other phones, emails,
  and office hours are still placeholder-shaped (correct names, not real contact data). Most
  images are hotlinked from `lh3.googleusercontent.com` (allow-listed in `next.config.ts`)
  and must eventually move to owned Storage (`public-media` exists). The home hero carousel and
  the About history images moved to `public-media/site/` in sub-project 9 (`0021`); like
  `src/images/officials/`, the files in `src/images/carousel/` now stay in the repo only as the
  source for `scripts/upload-site-images.mjs`, not as an app dependency. The remaining bundled
  static imports are the barangay seal (`src/images/logo/`, `SITE.sealImage`) and the barangay
  map (`src/images/map/san-fernando-map.png`, `MAP_IMAGE` on the contact page) — the map is
  bundled deliberately: one file, no admin surface, changes only when the boundary does.
  The other 11 officials' portraits live in Supabase Storage (`public-media/officials/`,
  migration `0012`); `src/images/officials/` is likewise script source only. The **Punong
  Barangay's** portrait is still a bundled static import, but only as the *fallback* in the
  About-page `CAPTAIN` block — `CaptainMessageSection` reads the officials table first. Officials' names are real; their bios are empty and emails/phones are
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
- The admin nav entry is **`Inquiries & Feedback`** at the unchanged `/admin/inquiries` route —
  two tabs, one `handle-inquiries` permission, since the same people work both queues. Its tab
  strip is `src/components/ui/tab-pills.tsx`; `transparency-manager.tsx` still carries its own
  hand-rolled copy of that markup and is a pending mechanical follow-up.
- `stitch/` holds the original design-tool HTML exports — reference material only, ignored
  by ESLint, not part of the app. Newer exports (`stitch_tabbed_content_manager/` — source
  of the admin screens) sit untracked at the repo root by choice: don't commit or delete them.
- Design/implementation history (specs and plans) lives in `docs/superpowers/specs/` and
  `docs/superpowers/plans/`; those dated files are historical records — don't retro-edit them.
