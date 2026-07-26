# Notices (Announcements) Archive + Detail Page — Design Spec

**Date:** 2026-07-27
**Status:** Approved by user, pending plan

## Problem

Announcements ("Latest Announcements" — urgent notices, assembly schedules,
medical missions, etc., stored in the `announcements` table) render in two
places on the public site and are non-interactive in both:

- `src/features/home/components/community-pulse-section.tsx` — a homepage
  card using the shared `AnnouncementCard`, under a "View All Announcements"
  button and a "View All" header link. **Both currently point at
  `/announcements`**, which is the News teaser page (a different content
  type entirely) — the same class of dead/mis-wired link the Events feature
  fixed for "Community Calendar".
- `src/features/announcements/components/news-sidebar.tsx`'s
  `AnnouncementsWidget`, shown beside the News feed on `/announcements` — a
  hand-rolled list with no link-through and no "see more" affordance at all.

There is also no way to see the full history of announcements (past ones
scroll off the 3-item teaser with nothing behind them), and no detail view —
today's `announcements` table has no `body` column, so an announcement's
excerpt (a line or two) is the entirety of its content.

## Goal

A new public route, `/notices`, listing **every** published announcement —
current and past — newest first, reachable from both existing teaser spots.
Each announcement gets its own detail page at `/notices/[slug]` with real
content: the schema gains a `body` field so admins can write the full notice
text, not just the teaser excerpt.

`/announcements` and `/news` are already taken by the News feature, so the
archive/detail routes use `/notices` rather than colliding.

## Architecture

`/notices` is a single archive (no upcoming/past split like `/events` —
announcements are just "things posted," not scheduled occurrences), paginated
6-at-a-time with a "Load More" button — the same offset/limit +
`useTransition` + dedupe-on-append pattern already built for `/news` and
`/events`, ordered `date desc, id desc` (tiebreaker, same reasoning as the
other two archives).

`/notices/[slug]` mirrors the News article detail page
(`src/app/(public)/announcements/[slug]/page.tsx`) almost exactly, simplified
for what announcements actually have:

- Urgent `Badge` instead of a category badge (announcements have no category).
- A single image (`image_src`) instead of a `PhotoGallery` (announcements
  never had multi-photo support).
- No author line — announcements have no `author_name` field; just the date.
- Body renders as paragraphs split on blank lines, falling back to the
  excerpt when body is empty — identical fallback to the News detail page,
  so older announcements (backfilled with `body = ''`) still show something.

## Data Layer

### Schema — migration `0027_announcement_notices.sql`

`announcements` gains:

```sql
alter table public.announcements
  add column slug text,
  add column body text not null default '';
```

Backfill existing rows' slugs from their titles (lowercase, non-alphanumeric
runs collapsed to `-`, trimmed), then disambiguate any duplicates produced by
identical/similar titles with a `-2`, `-3`… suffix via `row_number()`,
mirroring the nullable→backfill→constrain shape of migration `0024`. Only
then:

```sql
alter table public.announcements
  alter column slug set not null,
  add constraint announcements_slug_unique unique (slug);
```

No new index is needed for the archive ordering — the existing
`announcements_status_date_idx (status, date desc)` already covers it, same
as `news_articles`' index not carrying an explicit `id` tiebreaker either.

### Types (`src/types/index.ts`)

- `Announcement` (currently `title, date, excerpt, image?, imageAlt?, isNew?,
  urgent?`) gains `id: string` and `slug: string` — needed for linking and
  for a stable React key (both existing render sites currently key on
  `announcement.title`, which is not guaranteed unique; switch both to
  `id` while touching this).
- New `AnnouncementDetail = Announcement & { body: string }`, mirroring
  `NewsArticleDetail`'s relationship to `NewsArticleListItem`.
- `AnnouncementValues` (admin edit-form shape) gains `slug: string` and
  `body: string`.

### Queries (`src/features/announcements/queries.ts`)

- `export const NOTICES_ARCHIVE_BATCH = 6;` — new constant, defined once in
  this file, independent of `ARCHIVE_BATCH` (News' own constant) — distinct
  content type, distinct pagination cursor, same reasoning as
  `EVENTS_ARCHIVE_BATCH`.
- `listPublishedAnnouncements(limit = 3)` — **existing**, used by the
  homepage card and the sidebar widget. Extended to additionally select
  `id` and `slug`. Signature and both call sites' behavior unchanged.
- `listAllAnnouncements(offset: number, limit: number): Promise<{ items: Announcement[]; total: number }>`
  — **new**, for the `/notices` archive. `status = 'published'`, ordered
  `date desc, id desc`, using `.range()` + `{ count: "exact" }`, exactly like
  `listPublishedArticles` / `listPastEvents`.
- `getPublishedAnnouncementBySlug(slug: string): Promise<AnnouncementDetail | null>`
  — **new**, `status = 'published'` + `slug` match, `maybeSingle()`, mirrors
  `getPublishedArticleBySlug`.

### Admin (`src/features/admin/queries/announcements.ts`,
`src/features/admin/actions/announcements.ts`)

- `getAnnouncementForEdit` additionally selects `slug` and `body`, returned
  on `AnnouncementValues`.
- `saveAnnouncement`'s zod schema gains `slug: z.string().trim().min(1, "Enter a slug.")`
  and `body: z.string()` (no minimum — same as News' `body`, and publishing
  stays gated on the existing `excerpt` check only; body is not
  publish-required, matching News' own rule).
- Slug handling on save mirrors `saveNewsArticle` exactly: a `slugify()` +
  `uniqueSlug()` helper (copy the pattern, scoped to the `announcements`
  table), locked once the row is `published`, recomputed only while still
  `draft`/`in-review`/`archived`.
- `revalidate()` gains `revalidatePath("/notices")` alongside its existing
  three paths. `deleteAnnouncement` additionally calls
  `revalidatePath(`/notices/${existing.slug}`)` before the generic
  `revalidate()`, mirroring `deleteNewsArticle`'s explicit slug revalidation.

## Components

- `src/app/(public)/notices/page.tsx` — `PageHero` ("Community Notices" /
  "Official notices, advisories, and updates from the barangay — current and
  past.") + a `Suspense` boundary around a new `NoticesArchive` server
  component, fallback `NoticesArchiveSkeleton`. Same shape as
  `src/app/(public)/news/page.tsx`.
- `src/app/(public)/notices/[slug]/page.tsx` — mirrors
  `src/app/(public)/announcements/[slug]/page.tsx`: `generateMetadata` from
  the record, "Back to Notices" link to `/notices`, Urgent badge, title, date,
  single image (if present), body paragraphs (falling back to excerpt).
- `src/app/(public)/notices/[slug]/loading.tsx` — `<ArticleSkeleton what="this notice" />`,
  identical reasoning to the announcements (News) detail route's own
  `loading.tsx`: the page awaits the record before it can render anything,
  including the title, so a whole-page skeleton replaces the usual
  Suspense-fallback approach.
- `src/features/announcements/components/notices-archive.tsx` (server) —
  calls `listAllAnnouncements(0, NOTICES_ARCHIVE_BATCH)`, renders nothing if
  `total === 0`, otherwise passes `initialItems`/`initialOffset`/`initialHasMore`
  to:
- `src/features/announcements/components/notices-archive-grid.tsx` (client) —
  same shape as `NewsArchiveGrid`/`PastEventsArchiveGrid`: `useState` +
  `useTransition` Load More, try/catch error banner (`role="alert"`,
  `text-danger`), dedupe-on-append by `id`. Renders a **single-column stack**
  of `AnnouncementCard`s (not a grid) — a notice board reads as a list, and
  this keeps `/notices` visually distinct from `/news`'s magazine-style grid
  rather than looking like a reskinned clone of it.
- `src/features/announcements/actions.ts` (new `"use server"` module) —
  `loadMoreNotices(offset: number)`, mirroring `loadMoreNews`/`loadMorePastEvents`:
  throws if a non-first fetch returns zero rows, returns `{ items, hasMore }`
  otherwise.
- `src/features/announcements/index.ts` — barrel gains `NoticesArchive`.
- `src/components/ui/public-skeleton.tsx` — new `NoticesArchiveSkeleton`,
  a stack of row placeholders (thumbnail + two text lines), matching the
  shape `AnnouncementCard` actually renders — closest existing precedent is
  `NewsSidebarSkeleton`'s rows, sized up slightly for a full-width list.

### `AnnouncementCard` becomes clickable and gains the Urgent badge

`src/components/shared/announcement-card.tsx` currently renders a "New"
badge but not "Urgent" (the sidebar widget's own hand-rolled markup is the
only place that shows urgency today). Changes:

- Wrap the card body in a `Link href={`/notices/${announcement.slug}`}`.
- Add the same `Badge variant="urgent"` the sidebar widget already uses,
  shown when `announcement.urgent` is true.
- Both existing consumers (`community-pulse-section.tsx`'s homepage card,
  and the new `notices-archive-grid.tsx`) switch their `key` from
  `announcement.title` to `announcement.id`.

### The sidebar widget gains links and a "View All" footer

`AnnouncementsWidget` in `news-sidebar.tsx` keeps its own bespoke
calendar-tile markup (distinct look from `AnnouncementCard`, intentionally —
it is not being unified in this pass). Changes:

- Each row wraps in a `Link` to `/notices/${announcement.slug}`.
- A "View All" `Button` (`variant="outline"`, matching the homepage card's
  own "View All Announcements" button) is added below the list, `href="/notices"`.

## Wiring the Dead Links

- `src/features/home/components/community-pulse-section.tsx`:
  - Line 46's `ViewAllLink href="/announcements"` → `/notices`.
  - Line 53's `Button href="/announcements"` ("View All Announcements") →
    `/notices`.

## Testing

- `tests/e2e/public/notices.spec.ts` (new) — mirrors
  `tests/e2e/public/news.spec.ts` and the events equivalent: `/notices` loads
  with its heading, Load More increases the visible count when more than 6
  announcements exist, a card's link lands on `/notices/[slug]` with the
  right title, and the homepage's "View All"/"View All Announcements" links
  navigate to `/notices` instead of `/announcements`.
- No new pure functions are introduced (ordering/pagination mirrors the
  already-covered News/Events pattern), so no new Vitest unit tests are
  needed beyond the existing suite.

## Out of Scope

- No nav-bar entry for `/notices` — neither `/news` nor `/events` has one
  either; both are reachable only via a "See More"/"View All" link, and
  `/notices` follows the same convention.
- No rich-text editor for the new `body` field — a plain `Textarea`,
  identical to how the News article body is authored today.
- No change to how urgent announcements are chosen, sorted, or highlighted
  beyond carrying the existing `urgent` flag onto the archive card and detail
  page — no new "urgent-first" ordering.
- No unification of `AnnouncementCard`'s thumbnail styling with the sidebar
  widget's calendar-tile styling — they stay visually distinct, as they are
  today.
