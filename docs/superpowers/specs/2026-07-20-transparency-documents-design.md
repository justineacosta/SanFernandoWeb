# Transparency Documents — Design (Plan 4)

> Build order step 7 of `docs/superpowers/specs/2026-07-15-backend-integration-design.md` §7.
> Takes the last major mock-backed public page fully DB-backed: ordinances and resolutions,
> the other transparency documents, and project monitoring — with real PDF upload, slug
> detail pages, a working ordinance search, and `/admin/legislative` rebuilt as a real
> `/admin/transparency` section.
>
> Prioritised ahead of Plan 2D (notifications) at the client's request: `/transparency` is
> the page they need to present, and it is currently the largest surface still showing
> placeholder `#` download links.

## 1. Scope

In scope — every content block on `/transparency` except FOI:

| Block | Today | After this plan |
| --- | --- | --- |
| Ordinances & Resolutions tables | `ORDINANCES`/`RESOLUTIONS` mocks, `fileUrl: "#"` | `legislative_documents` table, real PDFs, slug pages |
| Ordinance search form | `action="#"` | `/transparency/legislative?q=` archive |
| Annual Budget Reports | `BUDGET_DOCUMENTS` string array | `transparency_documents`, category `financials` |
| Financial Statements card | static "View Archive" button | anchors to the Latest Uploads table |
| Latest Uploads table | `LATEST_UPLOADS` mock, `#` download links | newest published `transparency_documents` |
| Project Monitoring | `PROJECTS` mock | `transparency_projects` table |
| Admin | `/admin/legislative`, mock + faked saves | `/admin/transparency`, three tabs, real Server Actions |

Out of scope: the FOI section and its "Submit FOI Request" CTA (v1 exclusion, backend spec
§13), the "Download All Forms" CTA, and resident-facing document subscriptions.

## 2. Decisions locked with the user

1. **Full scope** — all transparency content, not legislative alone, so no mock data or dead
   links remain on the page during the client presentation.
2. **Real PDFs exist** and are attached **through the admin upload drawer** after deploy —
   no binary seeding via migration, no seed script, no PDFs committed to the repo. The
   upload flow doubles as the demo script.
3. **Two tables plus projects** (approach A), not a unified `kind`-discriminated table:
   legislative records carry official numbers, summaries and slug pages; the other documents
   are a titled file in a category. The two shapes never mix in the UI.
4. **A managed category table**, mirroring `assistance_categories` / `news_categories`, so
   staff can add a category without a deploy.
5. **A dedicated search results page**, not in-place table filtering — shareable URLs, real
   pagination, and it demos as an actual searchable database.
6. **One tabbed admin section** at `/admin/transparency`, mirroring how `/admin/news` tabs
   News and Announcements — one nav entry, one permission.

## 3. Data model — `supabase/migrations/0009_transparency.sql`

RLS is enabled with **no policies at all** on every table in this migration — the same
deliberate pattern as the ticket and news tables. Neither `anon` nor `authenticated` may
touch them directly. Every read and write, public and admin, goes through the service-role
client after an explicit permission check in code, so the access gate lives in one
reviewable place rather than spread across row policies. Public queries additionally filter
`status = 'published'` explicitly.

### `transparency_categories`

Field-for-field mirror of `news_categories`:

```sql
id text primary key
label text not null
sort_order int not null default 0
is_active boolean not null default true
updated_at timestamptz not null default now()
```

Seeded `financials`, `legislative`, `projects`, `awards`. Retired via `is_active`, never
deleted — past documents keep their category label. `updated_at` trigger via the existing
`public.set_updated_at()`.

### `legislative_documents`

```sql
id uuid primary key default gen_random_uuid()
slug text not null unique
doc_type public.legislative_type not null      -- enum: 'ordinance' | 'resolution'
number text not null                            -- e.g. "Ordinance No. 05-2024"
title text not null
date_approved date not null
summary text not null default ''
file_path text                                  -- null until a PDF is attached
file_size_bytes int
status public.content_status not null default 'draft'
published_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

- Reuses the existing `content_status` enum (`draft → in-review → published → archived`)
  rather than the mock's `active | under-review | archived`, so the whole site shares one
  workflow vocabulary. `archived` carries the repealed-ordinance meaning spec §7 asks for —
  repealed ordinances are legal history and are never deleted from the UI's normal path.
- `published_at` is set once, on the first transition into `published`, matching Plan 3.
- **Ordering is by `date_approved desc`**, not `published_at` — spec §7 requires
  newest-approved-first, and a document approved in 2023 may be uploaded after one from 2024.
- Indexes: `(status, date_approved desc)` and `(doc_type, status, date_approved desc)`.

### `transparency_documents`

```sql
id uuid primary key default gen_random_uuid()
title text not null
category_id text not null references public.transparency_categories (id) on delete restrict
date_released date not null
file_path text
file_size_bytes int
status public.content_status not null default 'draft'
published_at timestamptz
created_at, updated_at
```

Covers budget reports, financial statements, awards and anything else document-shaped. The
"Latest Uploads" table is simply the newest published rows across all categories; the
"Annual Budget Reports" card is the published rows in `financials`. Index on
`(status, date_released desc)` and `(category_id, status, date_released desc)`.

### `transparency_projects`

```sql
id uuid primary key default gen_random_uuid()
name text not null
progress int not null default 0 check (progress between 0 and 100)
sort_order int not null default 0
status public.content_status not null default 'draft'
published_at timestamptz
created_at, updated_at
```

### Seed data

The migration seeds the current mock metadata as **published records with
`file_path = null`**: 3 ordinances, 3 resolutions (numbers, titles, dates and summaries
carried over verbatim from `src/features/transparency/data.ts`), 4 latest uploads, 2 budget
documents and 2 projects. `/transparency` therefore renders identically on the day the
migration applies, and real PDFs are attached afterwards through the admin UI.

Like the Plan 3 seed content, these rows are **placeholder barangay content**, not verified
records — they need the same editorial pass before launch.

## 4. Storage & PDF upload

A **new public bucket `public-documents`**, separate from `public-media`. Images are capped
at 2MB; scanned ordinances run to 10MB, and holding both limits in one bucket's upload
actions invites applying the wrong one. Separate buckets keep each action's validation
unambiguous.

- **PDFs only** (`application/pdf`), **10MB cap**, validated client-side in the uploader
  *and* re-validated server-side in the upload Server Action — the client is never trusted.
- Public read via a single storage RLS policy, exactly as `public-media` has; no
  anon/authenticated write policy (the service-role client bypasses RLS for uploads).
- Object paths: `legislative/<documentId>/<uuid>.pdf` and
  `documents/<documentId>/<uuid>.pdf`.

`src/lib/storage.ts` gains `PUBLIC_DOCUMENTS_BUCKET`, `MAX_PDF_BYTES`, `ALLOWED_PDF_TYPES`
and `documentUrl(path)` alongside the existing `photoUrl()`. `documentUrl()` follows
`photoUrl()`'s contract: a full `http(s)` URL passes through unchanged, a bare object path
resolves against the bucket.

Replacing a file deletes the old object **after** the row update succeeds, never before —
the same deferred-delete ordering Plan 3 settled on for news photos.

### Missing files are a supported state

A record with `file_path = null` renders its summary plus "full document available at the
barangay hall" instead of a Download button. **No dead links anywhere on the page.** This is
what makes the seeded demo content presentable before a single PDF is uploaded.

## 5. Public surface

### `/transparency`

Layout is unchanged; every block becomes a DB read through a new
`src/features/transparency/queries.ts` (`import "server-only"`):

- `listPublishedDocumentsByCategory("financials")` → Annual Budget Reports card
- `listLatestPublishedDocuments(4)` → Latest Uploads table
- `listPublishedProjects()` → Project Monitoring card
- `listRecentLegislative(type, limit)` → the two collapsible tables (a recent preview; the
  full archive lives on its own page)

Category icons come from the existing `src/lib/icon-map.ts` lookup keyed on `category_id`.
No `LucideIcon` value crosses a data or client boundary — the icon-as-component caveat in
`docs/BACKEND_HANDOFF.md` §2 is resolved for this feature.

The Financial Statements card's "View Archive" button, static today, anchors to the Latest
Uploads table further down the page. **There is no separate documents archive route in this
plan** — only legislative records get one, because only they have the volume and the search
requirement to justify it. If the document count later outgrows the Latest Uploads table, a
`/transparency/documents` listing is the natural follow-up.

### `/transparency/legislative` — searchable archive

Server-rendered from `?q=`, `?type=` and `?page=`, with link-based pagination matching
`/announcements`. Search covers **number, title and summary**.

**Search input is escaped before it reaches PostgREST.** A raw `%` (or `*`, which PostgREST
rewrites to `%`) inside an `ilike` value is a pattern character, not a literal — the same
trap that would have turned `/track`'s surname match into a privacy leak. Here the
consequence is only a wrong result set rather than a disclosure, but the escaping is applied
for the same reason and in the same place: at the query boundary.

Empty results render an explicit empty state, not a blank table.

### `/transparency/legislative/[slug]`

Type + official number, title, date approved, summary, an **inline PDF viewer**, and an
always-present Download button when a file exists. The viewer is an `<object>` element with
a download-card fallback for browsers and mobile devices that will not render PDFs inline —
the fallback is the same `DocumentDownloadCard` used elsewhere, so there is no viewer-shaped
hole when it cannot load.

404s for a slug that does not exist or is not `published`, matching
`/announcements/[slug]`.

### Slugs

Derived from number + title (`ordinance-no-05-2024-comprehensive-solid-waste-management`),
lowercased and hyphenated. Uniqueness is enforced by the DB constraint, and the create
action handles the collision the same way `news` does — the check-then-insert race is closed
by letting the unique violation surface and retrying with a numeric suffix, not by trusting
a prior existence check.

## 6. Admin surface

`/admin/legislative` is replaced by **`/admin/transparency`**, gated by a new
**`manage-transparency`** permission (`requirePermission("manage-transparency")` in the page
file and on the nav entry in `ADMIN_NAV_ITEMS`). The permission joins the checkbox list in
Manage Users.

Three tabs, mirroring `NewsManager`'s tabbed structure:

1. **Legislative** — the existing `LegislativeManager` layout (stat cards, type/status
   filters, paginated directory, drawer editor) wired to real Server Actions, with a
   `PdfUploader` in the drawer and workflow transitions replacing the faked save toast.
2. **Documents** — `transparency_documents` table with category and status filters, the same
   drawer + uploader shape.
3. **Projects** — a compact list editor: name, progress, sort order, status.

Beneath the tabs, a SuperAdmin-only **`TransparencyCategoriesPanel`** — add, rename,
reorder, retire — a direct mirror of `NewsCategoriesPanel` and `AssistanceCategoriesPanel`.

**Archive-first deletion.** Archiving is the normal path for a repealed ordinance or a
superseded report; hard delete exists only for mistakes and requires confirmation.

Every publish, archive and delete writes an `audit_log` entry (feeding `/admin`'s Publishing
Activity) and revalidates `/transparency`, `/transparency/legislative`, and the affected
slug page.

### New client components

`PdfUploader` (mirrors `SingleImageUploader`: dropzone, filename + size, replace/remove) and
the tab shell. `DocumentDownloadCard` is a shared server component. Everything else reuses
existing primitives — no new UI vocabulary.

## 7. Types

Added to `src/types/index.ts`:

- `LegislativeType` (`"ordinance" | "resolution"`)
- `LegislativeListItem`, `LegislativeDetail` (public read shapes; `LegislativeDetail`
  extends the list item with `summary` and resolved `fileUrl`)
- `TransparencyDocumentRow`, `TransparencyProjectRow`, `TransparencyCategoryRow`
- `AdminLegislativeRow`, `AdminTransparencyDocumentRow`, `AdminTransparencyProjectRow`
- `LegislativeValues`, `TransparencyDocumentValues`, `TransparencyProjectValues`,
  `TransparencyCategoryValues` (drawer-form body shapes)

Removed once their last consumer is gone:

- `AdminLegislativeRecord`, `AdminLegislativeStatus`, `LegislativeFormValues`
- `LegislativeDocument`, `TransparencyDocument`, `ProjectStatus` (the mock-era public shapes)
- `ADMIN_LEGISLATIVE` from `src/features/admin/data.ts`
- `src/features/transparency/data.ts` in full (`HERO_IMAGE` moves into the hero component or
  onto storage with the other hotlinked images)
- The dead `NewsArticle` type flagged in `docs/BACKEND_HANDOFF.md` §2 — a one-line sweep in
  the same file, already known to have zero importers

`AdminLegislativeStatus` disappearing means the `StatusChip` union in
`src/types/index.ts` loses a member; `content_status` already covers every value the chip
needs to render.

## 8. Verification

No test framework exists yet, and this plan does not add one (Playwright tests are build
order step 8, the hardening plan). Verification is `npm run typecheck`, `npm run lint`,
`npm run build`, and driving the running app per `.claude/skills/verify/SKILL.md`:

1. `/transparency` renders every block from the DB and is visually unchanged from today.
2. Ordinance search returns matches on number, title and summary; a query containing `%`
   returns literal matches, not everything.
3. A slug page renders inline for a document with a PDF and falls back cleanly without one.
4. Upload rejects a non-PDF and a file over 10MB, both client- and server-side.
5. `/admin/transparency` is inaccessible without `manage-transparency`; the categories panel
   is invisible to non-SuperAdmins.
6. Publishing a document revalidates `/transparency` without a manual restart.

## 9. Known gaps after this plan

- Seeded transparency records remain placeholder content pending the barangay's real
  documents and an editorial pass.
- `public-documents` is PDF-only; other file types (spreadsheets, images of scanned awards)
  would need the allow-list extended.
- The FOI flow and "Download All Forms" remain unbuilt (v1 exclusions).
- Remaining `#` links after this plan: legal links, the FOI guide, and get-directions.
