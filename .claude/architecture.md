# Architecture

Structural rules for the app. See `.claude/backend.md` for Server Action / data-layer
conventions and `.claude/frontend.md` for component-level conventions.

## Route layout

- `src/app/(public)/` — public route group, shared header/footer chrome
  (`PublicShell`), `template.tsx` for route transitions.
- `src/app/admin/` — its own `layout.tsx` (sidebar chrome, `noindex`). Contains the
  public auth pages (`login`, `forgot-password`, `reset-password`) plus the
  auth-gated `(portal)` group.
- `src/app/api/` — exactly two Route Handlers:
  `GET /api/admin/notifications` and `POST /api/admin/uploads/document`.
- **`/admin` is a redirect, not a page.** It sends the signed-in user to the first nav
  entry they may reach (`firstPermittedPath`). Settings is ungated, so a target always
  exists and it cannot loop.

## Pages are thin

Files in `src/app/` only compose named feature sections (`<TransparencyHero />`,
`<LegislativeSection />`, …). No inline layout logic, no inline data, no queries written
in a page body.

## Feature modules own everything for a route

`src/features/<name>/` = `data.ts` (typed static content, where any remains) +
`components/` (section components) + `index.ts` (barrel re-exports, kept in page order) +
optionally `queries.ts` / `actions.ts` / `schema.ts`. **Pages import only from the barrel.**

Feature list: `about`, `admin`, `announcements`, `appointments`, `assistance`,
`complaints`, `contact`, `events`, `feedback`, `home`, `legal`, `officials`, `services`,
`site-content`, `track`, `transparency`.

`src/features/admin/` is the exception in size: it carries `actions/`, `queries/`,
`components/`, `lib/`, `search-modules.ts` and `site-blocks.ts`.

## Shared modules

- **`src/types/index.ts`** — the single source of entity interfaces and the de-facto API
  contract. New shared shapes go here.
- **`src/constants/site.ts`** — site-wide identity, nav (`NAV_ITEMS`), hotlines (`SITE`).
- **`src/constants/permissions.ts`** — `PERMISSIONS`, `STATUS_PRESETS`.
- **`src/lib/`** — cross-cutting helpers: `auth.ts`, `admin-nav.ts`, `archive.ts`,
  `audit.ts`, `email.ts`, `fuzzy.ts`, `media.ts`, `media-lifecycle.ts`, `storage.ts`,
  `notifications.ts`, `rate-limit.ts`, `turnstile.ts`, `session-activity.ts`,
  `public-forms.ts`, `ticket-updates.ts`, `office-days.ts`, `resident-name.ts`,
  `icon-map.ts`, `motion.ts`, `form-draft.ts`, `initials.ts`, `pagination.ts`,
  `crop-image.ts`, `legislative-number.ts`, `format.ts`, `utils.ts`, plus
  `supabase/` (the `server.ts` cookie-bound client and the `admin.ts` service-role one).
- **`src/hooks/`** — small state helpers (`useDisclosure`, `useFormDraft`, `useToast`,
  `useTableSort`, `useEditDeepLink`).
- Path alias `@/*` → `src/*`.

## Server Components by default

`"use client"` only for real interactivity: `SiteHeader` scroll state, mobile navs,
`Accordion`, `LegislativeTable` (collapsible rows), the public forms, and the admin
portal's managers / drawer editors (Drawer, Toast, MiniCalendar, ToggleSwitch,
uploaders).

## Type/serialization boundaries

- **Icon caveat:** several data shapes carry `icon: LucideIcon` (a React component). Any
  future API must return icon *name* strings mapped to components on the frontend via
  `src/lib/icon-map.ts` (`ICONS`, `ICON_OPTIONS`, `SITE_ICON_OPTIONS`).
- Anything threaded as a prop into a client component **serializes whole into the RSC
  payload**, whether or not it renders. Coarsen or drop sensitive values server-side
  before they cross the boundary (see the appointment demand hint in
  `.claude/resident-portal.md`).

## Static vs DB-backed content

Live and DB-backed: auth + account self-service, the services catalog, all four ticketing
flows, contact inquiries + alert subscribers, anonymous feedback, news + announcements +
events, transparency (legislative / disclosure documents / monitored projects), the
officials directory, and the Home/About page blocks.

Still static, in typed `data.ts` files:

- `src/features/contact/data.ts` — contact channels + inquiry subject list.
- `src/features/home/data.ts` — `QUICK_SERVICES` only. These **came back out of the CMS**
  (migration `0022` deleted its rows): six links to this site's own routes change when the
  routes change, which is a deploy, not an edit. **Don't put them back.**
- `src/features/about/data.ts` — the `CAPTAIN` name/role/photo fallback only.
- `src/features/legal/data.ts` — `/privacy` and `/terms` placeholder content.
- `src/features/services/data.ts` — `WASTE_SCHEDULE` only (the pre-backend `SERVICES` mock
  array was deleted 2026-08-10).
- `src/features/events/data.ts` — `EVENT_CATEGORY_LABELS` (moved here from
  `features/admin/data.ts`, which had no other reason to depend on `EventCategory`).

**Rule:** content for still-static features goes in that feature's `data.ts`, never
hardcoded in a component. Content for DB-backed features is edited through the admin
portal and lives in Supabase — not in the repo.

## Historical record

Design/implementation history lives in `docs/superpowers/specs/` and
`docs/superpowers/plans/` (and `docs/superpowers/sdd/` for later work). Those dated files
are **historical records — never retro-edit them**, even when a decision they document has
since been reversed. `docs/BACKEND_HANDOFF.md` is the living integration brief;
`docs/HARDENING_BACKLOG.md` is the live deferred-work list.
