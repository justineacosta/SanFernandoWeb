# Transparency Tables, Kebab Actions & Production Baseline — Design

**Date:** 2026-07-23
**Status:** Approved, ready for planning

## Problem

Four unrelated asks, three of which land in the same place:

1. The tables on `/transparency` have no pagination, and their action column spends
   horizontal room on two text links (`View`, `Download`) plus a `<details>` disclosure
   for multi-file rows.
2. `/services` carries an "Emergency Assistance" banner whose hotline numbers
   (`911-SANFERNANDO`, `8-123-4567`) are invented placeholders sitting on a live page.
3. `/transparency/legislative` and `/transparency/uploads` want the same pagination and
   the same kebab treatment.
4. Production has no database. There is an untracked
   `supabase/baseline/0000_baseline_2026-07-23.sql` squashing migrations `0001`–`0022`,
   but `0023_feedback` landed after it was written, and it still seeds demo content.

### What the code actually does today

Worth stating plainly, because two of the asks are premised on behaviour that is not
quite what it looks like from the browser:

- The three tables on `/transparency` (Latest Uploads, Ordinances, Resolutions) are
  **5-row previews** that link out to the full archives. They have no pagination because
  they were never meant to hold everything.
- `/transparency/uploads` **already paginates** — 10 per page, server-side, via `?page=`.
  It renders `← Previous · Page 1 of N · Next →` only when `lastPage > 1`, so with the
  current dataset the control never appears.
- `/transparency/legislative` **also already paginates**, on the same terms — but it is a
  **card list, not a table**, and it has no `View`/`Download` links to convert.

So "add pagination" means *make it visible and make it the numbered control* in two
places, and *genuinely add it* in one.

## Decisions

| Question | Decision |
| --- | --- |
| Pagination on the `/transparency` previews | Paginate in place at 5/page over a bounded fetch of 25. No URL state — three `?page=` params on one URL is not a design. |
| `/transparency/legislative` shape | Convert the result cards to a table matching the other two screens. |
| Kebab contents for multi-file rows | One `Download` entry per file, labelled by the file's own label. Every destination is one click. |
| Production DB state | Empty. The baseline may assume a virgin `public` schema. |
| Seed data in the baseline | Real content only — officials, site blocks, services, category tables. The demo news/announcements/events/documents/projects go. |

## Design

### A. One pagination primitive

New `src/components/ui/pagination.tsx`, carrying the look `AdminPagination` already
established — `Showing X to Y of Z entries` on the left, `‹ ①②③ ›` on the right.

Two modes, one component:

- `onPageChange(page)` — client, local state. Used by the `/transparency` previews.
- `hrefFor(page)` — server-safe, renders `<Link>`s. Used by the two archive pages.

Exactly one of the two is supplied; the component renders `<button>`s or `<Link>`s
accordingly.

It also gains **windowing** that `AdminPagination` lacks: at most **7** number slots —
first page, last page, the current page with one neighbour either side, and `…` in the
gaps — so a 40-page archive does not paint 40 circles. This is a real improvement for the
admin managers too.

`src/features/admin/components/admin-pagination.tsx` becomes a thin re-export with an
unchanged prop signature, so its 11 call sites do not churn while there is only one
implementation to maintain.

### B. One kebab, taught to hold links

`RowAction` (in `src/components/ui/row-actions.tsx`) gains an optional `href`. When it is
present the menu item renders as `<a role="menuitem">` rather than `<button>`, so
middle-click, open-in-new-tab and right-click-save behave the way a download link should.
`onSelect` is untouched, so every admin call site keeps working.

**Why extend rather than fork:** a second kebab would be a second set of positioning
math, a second focus trap and a second keyboard model to keep in sync. The public tables
want the same menu, just with different verbs inside it.

New `src/features/transparency/components/record-actions.tsx` — a small `"use client"`
wrapper taking only serializable props (`label`, `viewHref: string | null`,
`files: TransparencyFile[]`) so it can be dropped into a Server Component. It imports its
own Lucide icons, which is what keeps the RSC icon boundary intact. It builds:

```
⋮ ─┐
   │ 👁  View record          │   ← only when viewHref is non-null
   ├────────────────────────┤
   │ ⬇  Annual Budget.pdf   │   ← one per file, file.label
   │ ⬇  Annex A.pdf         │      (falls back to "File 1", "File 2", …)
   └────────────────────────┘
```

A row with **no** files and no `viewHref` renders no kebab at all — the cell keeps
today's `At the barangay hall` note, which is the more useful thing to say.

`FileDownloads` is **not** deleted. It stays where it is used outside a table: the budget
document tiles in `DisclosureGrid`.

**Risk, and its mitigation:** `RowActions` computes its menu height as
`items × ITEM_HEIGHT` to decide whether to flip above the trigger. A record with many
files makes that tall enough to mis-flip. The menu gets a `max-height` with internal
scroll, and the measured height is capped to the same value.

### C. `/transparency` — three tables paginate in place at 5/page

- `listLatestUploads(5)` → `listLatestUploads(25)`; `listRecentLegislative(type, 5)` →
  `listRecentLegislative(type, 25)`. Up to five pages per table.
- `LegislativeTable` is already `"use client"`, so it takes local `page` state directly.
  Changing the sort resets to page 1 — paging is meaningless if the rows underneath move.
- `LatestUploadsSection` splits into a Server Component that fetches and a new client
  `UploadsPreviewTable` that renders and pages. `UploadBrowseItem` is plain JSON
  (`key`/`type`/`title`/`date`/`href`/`files`/`progress`), so it crosses the RSC boundary
  without ceremony.
- The pagination footer is hidden when the table holds ≤5 rows.
- The `Browse all uploads` / `Browse and search the full archive` links **stay**. 25 is a
  cap, not the archive — the previews are still previews, they just hold more now.
- The action column becomes the kebab, in the desktop table and in the mobile stacked
  cards alike.

**Stated limitation:** sorting a preview sorts the fetched 25, not the whole table. This
is the same shape as today's behaviour, where it sorts the fetched 5.

### D. `/transparency/legislative` — cards become a table

`LegislativeArchive` renders the `LegislativeTable` shape: expand chevron / Number /
Title / Date Approved / kebab, with each document's summary moving from the card body
into the expandable row. Nothing is lost — the summary is still one click away, and the
number and date become scannable columns instead of a run-on eyebrow line.

`LegislativeTable` serves two owners with two small props:

- `previewPageSize?: number` — when set the table pages itself (the `/transparency`
  previews); when omitted it renders every row it is handed and the parent supplies the
  footer (the archive, which pages on the server).
- `sort?: "client" | "none"`, defaulting to `"client"` so the previews need not pass it —
  the archive's order is server-controlled, so client sorting there would sort one page of
  four and quietly lie. `"none"` renders plain `<th>`s instead of `SortableTh`. The
  archive has no sort UI today, so this loses nothing.

Its existing `?q` / `?type` / `?page` params are preserved exactly; only the footer
control changes. The mobile card list keeps its shape and gains the kebab.

### E. `/transparency/uploads`

- The `Files` column becomes the kebab, in the table and in the mobile cards.
- The prev/next text links become the shared `Pagination` in link mode, preserving
  `q` / `type` / `sort` / `dir` through `hrefFor`.
- The column sort links are untouched — that page's sorting is already server-side and
  therefore already correct across pages.

### F. `/services` — the Emergency Assistance banner is removed

Delete the card from `services-grid.tsx` and the now-dead `EMERGENCY_ASSISTANCE` constant
from `src/features/services/data.ts`. Its invented numbers go with it.

**No emergency route is lost.** The real hotline — `(077) 600 1082` — reaches residents
through `EMERGENCY_HOTLINES` on the site footer, the contact page, the officials page's
24/7 Action Center and the announcements sidebar. What is being removed is the fake one.

### G. Baseline regenerated for 0001–0023

Same path, `supabase/baseline/0000_baseline_2026-07-23.sql` (regenerated today, so the
date in the name is still accurate).

**Folded in from `0023_feedback`:**

- `public.feedback_category` and `public.feedback_status` enums, created whole in §3.
- `public.feedback` — table, `feedback_status_created_idx`, `enable row level security`,
  and the `feedback_updated_at` trigger. Placed with Inquiries in §9, since the two
  queues share the `handle-inquiries` permission.
- The **private** `feedback-media` bucket in §11 (`public = false`). It is the project's
  only private bucket; the file's storage note must say why — a screenshot can contain
  the sender's own account page, so reads go through short-lived signed URLs minted by
  the service-role client.
- `search_admin_global` appears **once**, in 0023's final form (the version carrying the
  feedback branch), superseding 0018's. This is the same "final state, not a replay"
  discipline the file already applies elsewhere.

**Removed:** §14 `SEED — DEMO CONTENT` in its entirety — sample news articles and their
photos, announcements, events, legislative documents, transparency documents and
monitored projects.

**Kept:** §13 `SEED — REFERENCE DATA & REAL CONTENT` — the services catalog, the
assistance/news/transparency category tables, the 12 officials, and the `site_blocks` +
`site_items` rows behind the Home and About pages.

Prose to update:

- The header's scope line: 0001–**0023**, not 0022.
- The section map, for the new §9 and §11 contents.
- The post-apply checklist: still the two upload scripts and the first-SuperAdmin
  insert, now noting **three** buckets (two public, one private).
- A new note that a freshly baselined site comes up with **no** news, announcements,
  events, legislative documents, transparency documents or monitored projects — those
  sections render their empty states until staff publish through the admin portal. This
  is intended, not a defect.

The file keeps its existing posture: assumes an empty `public` schema, runs in one
transaction, and fails loudly against a database that already holds these objects.

Then it gets **committed** — it is untracked today.

## Testing & verification

- `npm run typecheck`, `npm run lint`, `npm run build`.
- Drive `/transparency`, `/transparency/legislative`, `/transparency/uploads` and
  `/services` in the browser per `.claude/skills/verify/SKILL.md`. Specifically: kebab
  keyboard navigation (arrow keys, Home/End, Escape, Tab-to-dismiss), the menu's flip
  behaviour near the viewport bottom, pagination across all three surfaces, and mobile
  widths at 375px.
- Existing Playwright `public` specs must still pass; any that assert on the
  `View`/`Download` text links need updating to the kebab.
- **The baseline cannot be executed here.** Migrations are applied manually by the owner
  and there is no production database yet. Verification is a structural audit: every
  object across 0001–0023 appears exactly once, in final form, with no forward
  references. If proof-by-execution is wanted, it needs a throwaway Postgres to apply
  against — out of scope unless asked for.

## Out of scope

- The pending mechanical follow-up to move `transparency-manager.tsx` onto the shared
  `TabPills` primitive.
- Any admin-side manager work; the four modified admin files in the working tree belong
  to separate in-flight work and are not touched here.
- Migrating `lh3`-hotlinked images to owned Storage.
