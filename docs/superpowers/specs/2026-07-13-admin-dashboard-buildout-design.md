# Admin Dashboard Buildout — Design

**Date:** 2026-07-13
**Status:** Approved
**Source design:** `stitch_tabbed_content_manager/` (5 screens: services_management,
event_calendar, news_announcements, ordinance_and_resolution_management, user_settings +
`civic_horizon/DESIGN.md`)

## Goal

Replace the four `AdminPlaceholder` stubs under `/admin` with fully designed, interactive
mock screens based on the stitch export, add a new Ordinance & Resolution section, and in
doing so lock in the typed data contracts the future backend will implement. No backend, no
auth, no persistence — everything runs on typed mock data, but every UI state (search,
filters, pagination, create/edit forms, statuses, empty states) is real and exercised.

**Decisions made during brainstorming:**

1. **Depth:** interactive mock — search/filters/pagination/tabs work client-side over mock
   data; create/edit forms validate and fake-save. No in-memory store: a fake-save shows a
   toast and closes; lists do not mutate.
2. **Scope:** all five stitch screens, including the new Ordinance & Resolution section at
   `/admin/legislative` (new sidebar item).
3. **Editors:** slide-over drawer panels (right side), one reusable `Drawer` primitive.
4. **Data:** Approach A — admin lists wrap the *same records the public site renders*
   (from each feature's `data.ts`), plus a few extra mock rows to demonstrate every status.
   One entity contract per content type.

## 1. Shell & theme mapping

The existing shell already matches the stitch design (dark `ink-950` sidebar with seal
branding and Emergency Response button, sticky white topbar). Changes:

- **New nav item** in `ADMIN_NAV_ITEMS`: `{ label: "Ordinance & Resolution", href: "/admin/legislative", icon: Scale }`,
  inserted after Services Management (stitch nav order: Dashboard, Services, Ordinance &
  Resolution, Events, News, Settings).
- **Topbar heading** "Civic Horizon Admin" → **"San Fernando Admin"** (drop leaked
  design-tool branding).
- **Fix stale link:** `CONTENT_TYPE_ACTIONS[0]` ("Ordinance / Resolution") href
  `/admin/news` → `/admin/legislative`.

**Theme translation** (stitch "Civic Horizon" → our tokens): gold/primary → `brand-*`;
obsidian sidebar → `ink-950` (already done); urgent red → `danger`/`danger-deep`;
blue-tinted surfaces (`#f8f9ff`, `#e5eeff`, …) → `ink-50` page background + white cards;
Manrope → Space Grotesk (`font-display`) headings + Inter body. No new tokens, no raw hex.
Card language: white fill, `rounded-3xl` (matches existing admin cards), soft shadow,
`border-ink-200/70` hairlines. Status chips: soft low-opacity tints with high-contrast text.

## 2. Shared primitives

Built once, used across all five screens.

| Component | Location | Behavior |
| --- | --- | --- |
| `StatusChip` | `features/admin/components/` | Server-safe pill. Single tone map for all admin statuses: `published`, `scheduled`, `draft`, `in-review` (content); `active`, `inactive` (services); `under-review`, `archived` (legislative). Tones use `brand`/`ink`/`danger` tints only (e.g. published = brand tint, draft = ink tint, under-review = danger tint). |
| `Drawer` | `components/ui/drawer.tsx` | Client. Right slide-over: overlay, panel `max-w-md/lg`, Esc + overlay-click close, focus moved in on open, body scroll lock, `role="dialog"` + `aria-modal`, slide/fade transition with reduced-motion guard. Header (title + close), scrollable body, sticky footer for actions. |
| `AdminFilterBar` | `features/admin/components/` | Client (controlled by parent state). Search input (icon-prefixed) + 0–n `Select`s + optional date input, wrapping responsively inside the list card header. |
| `AdminPagination` | `features/admin/components/` | "Showing X to Y of Z entries" + numbered page buttons + prev/next. Client-side paging (page size 6 for tables, 8 for the news grid). |
| `AdminStatCard` | `features/admin/components/` | `IconCircle` + uppercase label + display-font value. Used by the legislative stats row. |
| `Toast` | `components/ui/toast.tsx` + `useToast` or callback prop | Minimal transient notice (bottom-right, auto-dismiss ~3 s, `role="status"`). Message on fake-save: "Saved — demo only, backend pending." One toast at a time; no queue/portal framework. |

Reused as-is: `Card`, `Button`, `Badge`, `IconCircle`, `Field`/`Input`/`Select`/`Textarea`/`Checkbox`,
`AdminPageHeader`. The public `DataTable` stays untouched — admin tables are bespoke enough
(avatars, chips, action buttons) that each section renders its own `<table>` inside a `Card`
with an `overflow-x-auto` wrapper.

## 3. Data model — the backend contract

All new types go in `src/types/index.ts` under the Admin section. Envelopes **wrap** public
entities rather than duplicating them, and carry **no `LucideIcon` fields** — components map
categories to icons locally (handoff doc §2 icon caveat).

```ts
export type AdminContentStatus = "published" | "scheduled" | "draft" | "in-review";
export type AdminServiceStatus = "active" | "inactive";
export type AdminLegislativeStatus = "active" | "under-review" | "archived";
export type EventCategory = "town-hall" | "health-drive" | "festival" | "sports" | "livelihood";

export interface AdminServiceRecord {
  id: string;                 // Service.id for real rows; "mock-*" for extras
  service: Service;
  department: string;         // e.g. "Barangay Health Center"
  status: AdminServiceStatus;
  updatedAt: string;          // ISO date
}

export interface AdminEventRecord {
  id: string;
  event: CommunityEvent;      // public entity has no id — envelope provides it
  category: EventCategory;
  status: "published" | "planning";
  registered?: number;
  capacity?: number;
  volunteers?: number;
  note?: string;              // e.g. "Registration opens Nov 1st" (festival card)
}

export interface AdminNewsRecord {
  id: string;
  article: NewsArticle;
  status: AdminContentStatus; // "in-review" allowed by type; seed uses published/scheduled/draft
  views?: number;             // published only
  scheduledFor?: string;      // ISO datetime, scheduled only
  updatedAt: string;          // ISO date (drives "Last edited" labels)
}

export interface AdminLegislativeRecord {
  id: string;                 // display index derives from list position ("001", "002", …)
  document: LegislativeDocument;
  type: "ordinance" | "resolution";  // public data splits by array; envelope makes it explicit
  status: AdminLegislativeStatus;
}

export interface AdminTeamMember {
  name: string;
  role: "super-admin" | "editor" | "viewer";
  initials: string;
  isCurrentUser?: boolean;
}
```

Form-value types (the future POST/PUT body shapes — fields mirror the drawer forms in §4):

```ts
export interface ServiceFormValues {
  title: string; description: string; department: string;
  requirements: string;        // textarea, newline-separated in the mock
  status: AdminServiceStatus;
}
export interface EventFormValues {
  title: string; category: EventCategory; date: string; startTime: string;
  endTime: string; venue: string; capacity?: number; description: string;
}
export interface NewsPostFormValues {
  title: string; category: string; excerpt: string; body: string;
  status: AdminContentStatus;  // form offers draft | published | scheduled
  scheduledFor?: string;
}
export interface LegislativeFormValues {
  type: "ordinance" | "resolution"; number: string; title: string;
  datePassed: string; summary: string; status: AdminLegislativeStatus;
}
```

**Seed data** (`features/admin/data.ts`) imports the real records and wraps them:

| Admin list | Real source | Extra mock rows |
| --- | --- | --- |
| `ADMIN_SERVICES` | `SERVICES` (4) from `features/services/data.ts` | +2 (one `inactive`) |
| `ADMIN_EVENTS` | `UPCOMING_EVENTS` (4) from `features/home/data.ts` | +1 `planning` festival with `note` |
| `ADMIN_NEWS` | `FEATURED_ARTICLE` + `NEWS_ARTICLES` (3 total) from `features/announcements/data.ts` | +1 `draft` (no image/excerpt), +1 `scheduled` |
| `ADMIN_LEGISLATIVE` | `ORDINANCES` + `RESOLUTIONS` (3+3) from `features/transparency/data.ts` | +1 `under-review`, +1 `archived` |
| `ADMIN_TEAM` | — | 3 members (Maria Santos super-admin/you, Juan Dela Cruz editor, Ana Reyes viewer — names already used by `RECENT_DRAFTS`) |

Department values for real services are invented mock (plausible barangay offices) — same
placeholder tier as phone numbers; the backend replaces them. Legislative stat-card counts
are **computed from the seeded arrays** (not hardcoded "142/308" like the stitch screen —
honest numbers beat impressive ones).

## 4. The five screens

Every page stays a thin Server Component (metadata + one feature section component). Each
section's interactive list is one `"use client"` component receiving seed data as props.

### 4.1 `/admin/services` — Services Management

`AdminPageHeader` (title, description, "Add New Service" primary button) → `Card` containing
`AdminFilterBar` (search + status select) → table: **Service** (icon in soft `IconCircle` +
title + first-line description), **Department**, **Status** (`StatusChip`), **Actions**
(edit pencil → drawer prefilled) → `AdminPagination`. Search matches title + department;
rows filter live.

### 4.2 `/admin/events` — Event Calendar

Two-column layout (`lg:` up; stacks on mobile — list first, rail second):

- **Left — Upcoming Schedule:** event cards: date block (`toCalendarParts()` from
  `lib/format.ts`), category chip (+ a "Planning" `StatusChip` when `status` is
  `planning`) + time row, title, venue with pin icon, divider, stats
  row (`registered/capacity` or `volunteers` or italic `note`), "Manage" text-button →
  edit drawer. Category filter (select) above the list.
- **Right rail:** (a) **Mini calendar** — client month grid, prev/next month nav, days with
  seeded events highlighted (brand-filled disc), current month derived from today;
  (b) **Engagement Overview** card — total YTD registrations (sum of seeded `registered`)
  with progress bar + attendance-rate stat with trend note (display strings).

"Create Event" primary button in the page header → create drawer.

### 4.3 `/admin/news` — News & Announcements

`AdminPageHeader` + "New Post" button → filter card (`AdminFilterBar`: search, category
select, status select, date input) → responsive card grid (1/2/3/4 cols by breakpoint):

- Image with `StatusChip` overlaid top-right; **draft cards** show the no-image placeholder
  (soft `ink-100` panel + image icon) per the stitch screen.
- Body: category tag + date (or "Last edited …" from `updatedAt` for drafts), title
  (2-line clamp), excerpt (3-line clamp) or italic "No excerpt available yet." for drafts.
- Footer: views + eye icon (published), "Awaiting publish" (scheduled), "Unpublished"
  (draft); edit pencil → drawer.

`AdminPagination` (page size 8) below the grid.

### 4.4 `/admin/legislative` — Ordinance & Resolution (new route + nav item)

`AdminPageHeader` + "Add New Document" button → **stats row** (3 × `AdminStatCard`: Total
Ordinances, Total Resolutions, Under Review — counts computed from seed) → "Document
Directory" `Card` with type + status selects → table: **#** (zero-padded index), **Title /
Description** (title + one-line summary), **Type** (`Badge`), **Date Passed**, **Status**
(`StatusChip`), **Actions** (edit pencil; archived rows get a view/eye icon instead) →
`AdminPagination`.

### 4.5 `/admin/settings` — Settings

Two-column layout (main + right rail; stacks on mobile):

- **Profile Information** card: avatar (`ADMIN_USER.avatar`) + "Change Photo" text-button
  (decorative), Full Name / Email / Contact Number fields prefilled from `ADMIN_USER`,
  "Save Profile" fake-saves (toast).
- **Account Security** card: current/new password fields, "Update Password" (validates both
  non-empty, fake-saves), divider, 2FA row with toggle switch (client state only).
- **Right rail — Preferences** card: Language select (English (US) / Filipino / Ilocano),
  Notifications toggle list (Email Alerts, Browser Push, Weekly Digest — client state).
- **Right rail — Team Roles** card: `ADMIN_TEAM` list (initials disc, name + "(You)",
  role badge), "View All Team Members" text-link (`href="#"` placeholder).

Toggle switch is a small local component inside the settings feature (button with
`role="switch"` + `aria-checked`), styled brand-amber when on.

`ADMIN_USER` gains a placeholder-shaped email/phone (`m.santos@brgy-sanfernando.gov.ph`,
`(077) 600-1234`-style) for the prefills.

## 5. Drawer forms (create/edit)

One form component per section (services, events, news, legislative), all hosted in
`Drawer`, all following the same pattern:

- Native controlled inputs using `Field`/`Input`/`Select`/`Textarea`; required fields
  validate on submit (inline error text under the field, `aria-invalid`).
- Edit mode receives the record and prefills; create mode starts empty. Title switches
  ("Add New Service" / "Edit Service").
- Submit: brief pending state on the button (~600 ms, mirrors `InquiryForm`) → toast
  ("Saved — demo only, backend pending.") → drawer closes. **No list mutation.**
- Cancel/Esc/overlay closes without saving.

Field sets are exactly the `*FormValues` types in §3.

## 6. Interactivity boundaries

- New client components: `Drawer`, `Toast`, the four section list components
  (`ServicesManager`, `EventsManager` (includes mini calendar), `NewsManager`,
  `LegislativeManager`), `SettingsPanel`, and the four drawer forms (rendered inside the
  managers). Everything else stays server.
- Filter/search/pagination state lives in each manager (`useState` + `useMemo` over props).
  Changing any filter resets to page 1.
- Empty filter results: centered empty state inside the card (icon, "No records match your
  filters.", "Clear filters" ghost button).
- Icon mapping (category → icon) lives in small `Record` maps inside the feature components,
  not in data or types.

## 7. Accessibility & responsive

- Drawer: focus into panel on open, Esc + overlay close, `aria-modal`, scroll lock.
- All icon-only buttons (edit pencils, calendar prev/next, close) get `aria-label`s.
- Tables: real `<thead>/<th scope="col">`, wrapped in `overflow-x-auto` inside their card
  so mobile scrolls the table, never the page.
- Status chips are text (not color-only); toggle switches expose `role="switch"`.
- Breakpoints: filter bars wrap; events + settings collapse to single column below `lg`;
  news grid steps 4→2→1; existing mobile admin nav unchanged.
- Transitions respect `prefers-reduced-motion` (drawer slide, toast).

## 8. Out of scope (unchanged this session)

- Auth — the portal stays unprotected and `noindex` (backend work item E1).
- Real persistence, uploads, image storage; public site pages and data untouched
  (admin only *reads* their exports).
- Dashboard (`ContentHub`) beyond the one href fix in §1.
- No `/admin/news/[id]` style routes — all editing happens in drawers.

## 9. Verification

`npm run typecheck` + `npm run lint` + `npm run build` (all routes must still prerender
static), then drive every screen with the verify skill (playwright-core against system
Chrome): each of the five screens at desktop + mobile widths; exercise search, one filter,
pagination, opening/validating/fake-saving a drawer form, and the settings toggles.

## 10. Documentation follow-through

Update `docs/BACKEND_HANDOFF.md` (§1 routes table, §2 data model, §3E admin items) to
reflect the new admin surface and the `Admin*Record` / `*FormValues` contracts, and refresh
the CLAUDE.md admin line if its description of the admin portal goes stale.
