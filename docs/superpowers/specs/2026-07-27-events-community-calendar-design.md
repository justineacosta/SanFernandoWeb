# Events / Community Calendar — Design Spec

**Date:** 2026-07-27
**Status:** Approved by user, pending plan

## Problem

The "Community Calendar" button on `/announcements` (`src/app/(public)/announcements/page.tsx:25-27`)
is a literal dead button — no `href`, no handler. The homepage's "Upcoming Events"
widget (`community-pulse-section.tsx`) has the same problem: its "View Calendar"
link (line 64) and "View All Events" button (line 71-73) both point at
`/announcements`, a page that has nothing to do with events.

Meanwhile the `events` table, its admin CRUD (`events-manager.tsx`,
`admin/actions/events.ts`), and a public query (`listUpcomingEvents`) already
exist — only the public listing page is missing.

## Goal

A new public route, `/events`, showing **all** events — both upcoming and past
— reachable from the Community Calendar button and the homepage's two dead
links.

## Architecture

`/events` has two independently-fetched sections:

- **Upcoming Events** — all published events with `event_date >= today`,
  soonest first. No pagination: the realistic count is small (a handful of
  scheduled civic events), so fetching all of them is simpler than adding a
  second Load More control for no practical benefit.
- **Past Events** — published events with `event_date < today`, most recent
  first, paginated 6-at-a-time with a "Load More" button — the same
  offset/limit + `useTransition` + dedupe-on-append pattern already built for
  `/news`, including its ordering tiebreaker (`event_date desc, id desc`) to
  prevent duplicate/skipped rows across paginated fetches.

Each section hides itself if empty (no upcoming events scheduled / no past
events yet) rather than rendering an empty heading — matching the Home page's
"empty block hides its section" convention.

## Data Layer

`src/features/events/queries.ts`:

- `listUpcomingEvents(limit = 4)` — **existing**, used by the homepage widget.
  Extended to additionally select `id`, `description`, `category` (currently
  omitted; needed by the richer archive card). Signature and homepage
  behavior unchanged.
- `listAllUpcomingEvents(): Promise<CommunityEvent[]>` — **new**. Same filter
  as `listUpcomingEvents` (`status='published'`, `event_date >= today`,
  ascending) but no `limit`, for the archive page's Upcoming section.
- `listPastEvents(offset: number, limit: number): Promise<{ items: CommunityEvent[]; total: number }>`
  — **new**. `status='published'`, `event_date < today`, ordered
  `event_date desc, id desc`, using `.range()` + `{ count: "exact" }` exactly
  like `listPublishedArticles`.
- `export const EVENTS_ARCHIVE_BATCH = 6;` — new constant, defined once in
  this file. Not shared with announcements' `ARCHIVE_BATCH`: events are a
  distinct content type with their own pagination cursor.

`CommunityEvent` (`src/types/index.ts:180`) gains `id: string`,
`description: string`, and `category: EventCategory` (all already stored in
the `events` table; only the type and the existing query were narrower than
the schema).

## Category Labels

`EVENT_CATEGORY_LABELS` currently lives in `src/features/admin/data.ts:43-49`
(admin-only). The archive card needs the same labels to render a category
badge on the public site, and admin code must not be a dependency of public
code. Move the map to `src/features/events/data.ts` (a public feature file);
update `event-form.tsx` and `events-manager.tsx` (the two existing admin
importers) to import it from there instead. This is a move, not a
duplication.

## Components

- `src/app/(public)/events/page.tsx` — `PageHero` ("Community Calendar" /
  "Every civic event, town hall, and festival — upcoming and past.") +
  `UpcomingEventsSection` + `PastEventsArchive`, each in its own `Suspense`
  boundary (two independent queries, same reasoning as `/announcements`'
  two boundaries).
- `src/components/shared/event-archive-card.tsx` — new `EventArchiveCard`,
  a row layout matching `AnnouncementCard`'s shape (date tile or cover image,
  title, category `Badge`, date/time/venue line, `line-clamp-2` description
  excerpt — omitted entirely when `description` is empty, since the column
  defaults to `''` and older events may have none). The existing compact `EventCard` (used only by the homepage
  widget) is untouched — it has no room for a category badge or excerpt and
  doesn't need one there.
- `src/features/events/components/upcoming-events-section.tsx` — server
  component, no props, calls `listAllUpcomingEvents()`, renders a stack of
  `EventArchiveCard`; renders nothing if empty.
- `src/features/events/components/past-events-archive.tsx` (server) — calls
  `listPastEvents(0, EVENTS_ARCHIVE_BATCH)`, renders nothing if `total === 0`,
  otherwise passes `initialItems`/`initialOffset`/`initialHasMore` to:
- `src/features/events/components/past-events-archive-grid.tsx` (client) —
  same shape as `NewsArchiveGrid`: `useState` + `useTransition` Load More,
  try/catch error banner (`role="alert"`, `text-danger`, matching
  `form.tsx`'s convention), dedupe-on-append by `id`.
- `src/features/events/actions.ts` — new `"use server"` module,
  `loadMorePastEvents(offset: number)`, mirroring `loadMoreNews`: throws if
  a non-first fetch returns zero rows (a real failure), returns
  `{ items, hasMore }` otherwise.
- `src/features/events/index.ts` — barrel exporting
  `UpcomingEventsSection`, `PastEventsArchive`.
- `src/components/ui/public-skeleton.tsx` — new `EventsArchiveSkeleton`,
  row-shaped (like `NewsFeedSkeleton`'s rows, without the lead block).

## Wiring the Dead Links

- `src/app/(public)/announcements/page.tsx:25-27` — the "Community Calendar"
  button becomes `<Button href="/events" variant="outline" size="lg">`.
- `src/features/home/components/community-pulse-section.tsx:64,71-73` — both
  the "View Calendar" `ViewAllLink` and the "View All Events" `Button` change
  their `href` from `/announcements` to `/events`.

## Must Not Forget (learned from the News review)

`src/features/admin/actions/events.ts`'s shared `revalidate()` helper
(lines 43-46) currently calls `revalidatePath("/admin/events")` and
`revalidatePath("/")`. Add `revalidatePath("/events")` there — every
create/update/publish/archive/restore/delete action already routes through
this one helper, so it's a single-line fix covering all of them. Without it,
`/events` freezes at build-time content in production, exactly like the
Critical finding from the News final review.

## Testing

- `tests/e2e/public/events.spec.ts` (new) — mirrors `tests/e2e/public/news.spec.ts`:
  page loads with both section headings (skip assertions gracefully if a
  section is empty), Load More on Past Events increases the visible count
  when present, and the homepage's "View Calendar"/"View All Events" links
  navigate to `/events` instead of `/announcements`.
- No new pure functions are introduced (ordering/pagination logic mirrors
  the already-covered News pattern), so no new Vitest unit tests are needed
  beyond what the existing suite covers.

## Out of Scope

- No detail page per event (confirmed with user — richer card only).
- No literal month-grid calendar UI (confirmed with user — list/archive
  shape, matching the rest of the site).
- The homepage's "Upcoming Events" widget itself (`community-pulse-section.tsx`)
  is unchanged beyond its two link targets — same compact `EventCard`, same
  `listUpcomingEvents(4)` call.
