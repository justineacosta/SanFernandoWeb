# Events / Community Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/events` page ("Community Calendar") showing every
published event — upcoming and past — and wire the site's two existing dead
links (the "Community Calendar" button on `/announcements`, and the
homepage's "View Calendar"/"View All Events" links) to it.

**Architecture:** Two independently-fetched sections on one page: an
unpaginated "Upcoming Events" list and a paginated ("Load More") "Past
Events" archive, following the exact offset/limit + `useTransition` +
dedupe-on-append pattern already built for `/news`. A richer public
`EventArchiveCard` (category badge, schedule line, description excerpt)
supplements the existing compact `EventCard` used by the homepage widget,
which is left untouched.

**Tech Stack:** Next.js 16 App Router, React 19 Server + Client Components,
TypeScript strict, Supabase (Postgres via a service-role client), Tailwind
CSS v4, Playwright.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-27-events-community-calendar-design.md`
  — read it for the full rationale; this plan's tasks implement it verbatim.
- No detail page per event — card only (confirmed with the user).
- No literal month-grid calendar UI — list/archive shape matching the rest
  of the site (confirmed with the user).
- `EVENTS_ARCHIVE_BATCH = 6`, defined once in `src/features/events/queries.ts`
  — never reuse announcements' `ARCHIVE_BATCH`.
- Past Events ordering is `event_date desc, id desc` (the `id` tiebreaker
  prevents duplicate/skipped rows across paginated fetches — the same fix
  applied to News after its final review).
- `EVENT_CATEGORY_LABELS` moves from `src/features/admin/data.ts` to
  `src/features/events/data.ts` (a public feature file) — a move, not a
  duplication. Both existing admin importers (`event-form.tsx`,
  `events-manager.tsx`) update their import path in the same task.
- Every admin `events` action already routes through one shared
  `revalidate()` helper in `src/features/admin/actions/events.ts` — add
  `revalidatePath("/events")` there, once, covering every action.
- `npm run typecheck` must pass after every task.
- Playwright via `npx playwright test <file> --project=public`.
- The homepage's "Upcoming Events" widget (`community-pulse-section.tsx`)
  is unchanged beyond its two link targets — same compact `EventCard`, same
  `listUpcomingEvents(4)` call.

---

### Task 1: Event data model — types, category labels, and archive queries

**Files:**
- Modify: `src/types/index.ts:180-189` (`CommunityEvent` interface)
- Create: `src/features/events/data.ts`
- Modify: `src/features/events/queries.ts` (full rewrite of its contents)
- Modify: `src/features/admin/data.ts` (remove `EVENT_CATEGORY_LABELS` + its
  now-unused `EventCategory` import)
- Modify: `src/features/admin/components/event-form.tsx:9` (import path)
- Modify: `src/features/admin/components/events-manager.tsx:20` (import path)

**Interfaces:**
- Produces: `EVENT_CATEGORY_LABELS: Record<EventCategory, string>` from
  `src/features/events/data.ts`
- Produces: `EVENTS_ARCHIVE_BATCH = 6`,
  `listUpcomingEvents(limit = 4): Promise<CommunityEvent[]>` (existing
  signature, extended row shape),
  `listAllUpcomingEvents(): Promise<CommunityEvent[]>`,
  `listPastEvents(offset: number, limit: number): Promise<{ items: CommunityEvent[]; total: number }>`
  — all from `src/features/events/queries.ts`
- Produces: `CommunityEvent` now carries `id: string`, `description: string`,
  `categoryLabel: string` in addition to its existing fields.
- Consumes (Task 2): the three query functions and `EVENTS_ARCHIVE_BATCH`.

- [ ] **Step 1: Extend the `CommunityEvent` type**

In `src/types/index.ts`, replace:

```ts
export interface CommunityEvent {
  title: string;
  /** ISO date, e.g. "2025-05-25" */
  date: string;
  time: string;
  venue: string;
  /** Resolved public URL of the optional cover image. */
  image?: string;
  imageAlt?: string;
}
```

with:

```ts
export interface CommunityEvent {
  id: string;
  title: string;
  /** ISO date, e.g. "2025-05-25" */
  date: string;
  time: string;
  venue: string;
  description: string;
  /** Display label resolved from the `events.category` enum column. */
  categoryLabel: string;
  /** Resolved public URL of the optional cover image. */
  image?: string;
  imageAlt?: string;
}
```

- [ ] **Step 2: Create the public category-label map**

Create `src/features/events/data.ts`:

```ts
import type { EventCategory } from "@/types";

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  "town-hall": "Town Hall",
  "health-drive": "Health Drive",
  festival: "Festival",
  youth: "Youth",
  environment: "Environment",
  community: "Community",
};
```

- [ ] **Step 3: Remove the map from `src/features/admin/data.ts`**

In `src/features/admin/data.ts`, remove `EventCategory` from the type
import (it becomes unused in this file):

```ts
import type {
  AdminTeamMember,
  EventCategory,
  IconNavItem,
  TeamRole,
} from "@/types";
```

becomes:

```ts
import type {
  AdminTeamMember,
  IconNavItem,
  TeamRole,
} from "@/types";
```

And remove the map itself and its preceding comment:

```ts
/* ------------------- Section seed data (wraps real public content) ------------------ */

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  "town-hall": "Town Hall",
  "health-drive": "Health Drive",
  festival: "Festival",
  youth: "Youth",
  environment: "Environment",
  community: "Community",
};

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
```

becomes:

```ts
export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
```

- [ ] **Step 4: Update the two admin importers**

In `src/features/admin/components/event-form.tsx:9`, change:

```ts
import { EVENT_CATEGORY_LABELS } from "@/features/admin/data";
```

to:

```ts
import { EVENT_CATEGORY_LABELS } from "@/features/events/data";
```

In `src/features/admin/components/events-manager.tsx:20`, make the same
change.

- [ ] **Step 5: Rewrite the events query layer**

Replace the entire contents of `src/features/events/queries.ts` with:

```ts
import "server-only";
import type { CommunityEvent, EventCategory } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { manilaToday } from "@/lib/format";
import { photoUrl } from "@/lib/storage";
import { EVENT_CATEGORY_LABELS } from "@/features/events/data";

export const EVENTS_ARCHIVE_BATCH = 6;

const EVENT_COLUMNS =
  "id, title, category, event_date, start_time, end_time, venue, description, cover_src, cover_alt";

interface EventRow {
  id: string;
  title: string;
  category: EventCategory;
  event_date: string;
  start_time: string;
  end_time: string | null;
  venue: string;
  description: string;
  cover_src: string | null;
  cover_alt: string | null;
}

function toCommunityEvent(r: EventRow): CommunityEvent {
  return {
    id: r.id,
    title: r.title,
    categoryLabel: EVENT_CATEGORY_LABELS[r.category],
    // event_date is a bare `date` column — pass it through untouched.
    date: r.event_date,
    time: r.end_time ? `${r.start_time} - ${r.end_time}` : r.start_time,
    venue: r.venue,
    description: r.description,
    image: r.cover_src ? photoUrl(r.cover_src) : undefined,
    imageAlt: r.cover_alt ?? undefined,
  };
}

/** Upcoming published events, soonest first, capped at `limit` — the homepage widget. */
export async function listUpcomingEvents(limit = 4): Promise<CommunityEvent[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "published")
    .gte("event_date", manilaToday())
    .order("event_date", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return (data as unknown as EventRow[]).map(toCommunityEvent);
}

/** Every upcoming published event, soonest first — no cap, for the archive page. */
export async function listAllUpcomingEvents(): Promise<CommunityEvent[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "published")
    .gte("event_date", manilaToday())
    .order("event_date", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as EventRow[]).map(toCommunityEvent);
}

/** Past published events, most recent first, paginated. */
export async function listPastEvents(
  offset: number,
  limit: number,
): Promise<{ items: CommunityEvent[]; total: number }> {
  const admin = createSupabaseAdminClient();
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1;

  const { data, count, error } = await admin
    .from("events")
    .select(EVENT_COLUMNS, { count: "exact" })
    .eq("status", "published")
    .lt("event_date", manilaToday())
    .order("event_date", { ascending: false })
    .order("id", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error || !data) return { items: [], total: 0 };
  return {
    items: (data as unknown as EventRow[]).map(toCommunityEvent),
    total: count ?? 0,
  };
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: PASS, no errors — `EventCard` (the existing compact card) still
compiles against the extended `CommunityEvent` interface because it only
destructures the fields it already used.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/features/events/data.ts src/features/events/queries.ts src/features/admin/data.ts src/features/admin/components/event-form.tsx src/features/admin/components/events-manager.tsx
git commit -m "feat(events): extend event model with id/description/category and add archive queries"
```

---

### Task 2: Events archive page

**Files:**
- Create: `src/components/shared/event-archive-card.tsx`
- Create: `src/features/events/components/upcoming-events-section.tsx`
- Create: `src/features/events/components/past-events-archive.tsx`
- Create: `src/features/events/components/past-events-archive-grid.tsx`
- Create: `src/features/events/actions.ts`
- Modify: `src/features/events/index.ts`
- Modify: `src/components/ui/public-skeleton.tsx` (add `EventsArchiveSkeleton`)
- Create: `src/app/(public)/events/page.tsx`
- Create: `tests/e2e/public/events.spec.ts`

**Interfaces:**
- Consumes: `EVENTS_ARCHIVE_BATCH`, `listAllUpcomingEvents`, `listPastEvents`
  from Task 1's `src/features/events/queries.ts`; `CommunityEvent` from
  `src/types`.
- Produces: `UpcomingEventsSection` and `PastEventsArchive` (both async
  server components, no props) exported from `src/features/events/index.ts`
  — consumed by Task 3's nothing (this task's own `page.tsx` is the only
  consumer; Task 3 does not touch these).
- Produces: `loadMorePastEvents(offset: number): Promise<{ items: CommunityEvent[]; hasMore: boolean }>`
  Server Action in `src/features/events/actions.ts`.

- [ ] **Step 1: Build the richer public event card**

Create `src/components/shared/event-archive-card.tsx`:

```tsx
import Image from "next/image";
import { formatDate, toCalendarParts } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { CommunityEvent } from "@/types";

interface EventArchiveCardProps {
  event: CommunityEvent;
}

/**
 * Full-detail event row for the /events archive: cover image or calendar-date
 * tile, category badge, schedule line, and a description excerpt — omitted
 * entirely when empty, since the column defaults to '' and older events may
 * have none.
 */
export function EventArchiveCard({ event }: EventArchiveCardProps) {
  const { month, day } = toCalendarParts(event.date);

  return (
    <article className="flex gap-4 rounded-3xl border border-ink-200 bg-white p-5">
      {event.image ? (
        <Image
          src={event.image}
          alt={event.imageAlt ?? ""}
          width={112}
          height={96}
          className="h-24 w-28 shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <div className="flex h-24 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border border-brand-200 bg-brand-100">
          <span className="text-xs font-bold uppercase text-brand-700">{month}</span>
          <span className="text-2xl font-bold leading-none text-ink-900">{day}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <Badge variant="soft">{event.categoryLabel}</Badge>
          {event.image ? (
            <span className="text-xs font-semibold text-brand-700">{formatDate(event.date)}</span>
          ) : null}
        </div>
        <h4 className="text-base font-semibold tracking-tight text-ink-900">{event.title}</h4>
        <p className="mt-1 text-sm text-ink-600">
          {event.time} · {event.venue}
        </p>
        {event.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-ink-600">{event.description}</p>
        ) : null}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Build the Upcoming Events section**

Create `src/features/events/components/upcoming-events-section.tsx`:

```tsx
import { listAllUpcomingEvents } from "@/features/events/queries";
import { SectionHeading } from "@/components/ui/section-heading";
import { EventArchiveCard } from "@/components/shared/event-archive-card";

/** All upcoming published events, soonest first. No pagination — the realistic count is small. */
export async function UpcomingEventsSection() {
  const events = await listAllUpcomingEvents();

  if (events.length === 0) return null;

  return (
    <div>
      <SectionHeading title="Upcoming Events" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {events.map((event) => (
          <EventArchiveCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build the Load More Server Action**

Create `src/features/events/actions.ts`:

```ts
"use server";

import { EVENTS_ARCHIVE_BATCH, listPastEvents } from "@/features/events/queries";
import type { CommunityEvent } from "@/types";

export async function loadMorePastEvents(
  offset: number,
): Promise<{ items: CommunityEvent[]; hasMore: boolean }> {
  const { items, total } = await listPastEvents(offset, EVENTS_ARCHIVE_BATCH);
  // If we're fetching more (offset > 0) but the query returns zero total, it's
  // a failure (not "no more past events"). Throw so the client error handler catches it.
  if (offset > 0 && total === 0) {
    throw new Error("Failed to load more events.");
  }
  return { items, hasMore: offset + items.length < total };
}
```

- [ ] **Step 4: Build the Past Events client grid**

Create `src/features/events/components/past-events-archive-grid.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EventArchiveCard } from "@/components/shared/event-archive-card";
import { loadMorePastEvents } from "@/features/events/actions";
import type { CommunityEvent } from "@/types";

interface PastEventsArchiveGridProps {
  initialItems: CommunityEvent[];
  initialOffset: number;
  initialHasMore: boolean;
}

/** A stack of past-event cards that grows via "Load More" button. */
export function PastEventsArchiveGrid({
  initialItems,
  initialOffset,
  initialHasMore,
}: PastEventsArchiveGridProps) {
  const [items, setItems] = useState(initialItems);
  const [offset, setOffset] = useState(initialOffset);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await loadMorePastEvents(offset);
        setItems((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...result.items.filter((e) => !seen.has(e.id))];
        });
        setOffset((prev) => prev + result.items.length);
        setHasMore(result.hasMore);
      } catch (err) {
        setError("Failed to load more events. Please try again.");
        console.error("loadMorePastEvents error:", err);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((event) => (
          <EventArchiveCard key={event.id} event={event} />
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {hasMore ? (
        <div className="flex justify-center pt-4">
          <Button variant="outline" size="lg" onClick={handleLoadMore} disabled={isPending}>
            {isPending ? "Loading…" : "Load More"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Build the Past Events server wrapper**

Create `src/features/events/components/past-events-archive.tsx`:

```tsx
import { EVENTS_ARCHIVE_BATCH, listPastEvents } from "@/features/events/queries";
import { SectionHeading } from "@/components/ui/section-heading";
import { PastEventsArchiveGrid } from "./past-events-archive-grid";

/** Past published events, most recent first, growing via "Load More". */
export async function PastEventsArchive() {
  const { items, total } = await listPastEvents(0, EVENTS_ARCHIVE_BATCH);

  if (items.length === 0) return null;

  return (
    <div>
      <SectionHeading title="Past Events" />
      <PastEventsArchiveGrid
        initialItems={items}
        initialOffset={items.length}
        initialHasMore={items.length < total}
      />
    </div>
  );
}
```

- [ ] **Step 6: Export both sections from the feature barrel**

Replace the contents of `src/features/events/index.ts`:

```ts
export { listUpcomingEvents } from "./queries";
export { UpcomingEventsSection } from "./components/upcoming-events-section";
export { PastEventsArchive } from "./components/past-events-archive";
```

- [ ] **Step 7: Add the loading skeleton**

In `src/components/ui/public-skeleton.tsx`, add this export (place it after
`NewsArchiveSkeleton`):

```tsx
/** The Events archive: a stack of two-column event rows. */
export function EventsArchiveSkeleton({ count = 4, what }: { count?: number; what: string }) {
  return (
    <div className="space-y-6">
      <LoadingLabel what={what} />
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex gap-4 rounded-3xl border border-ink-200 bg-white p-5">
            <Skeleton className="h-24 w-20 shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Build the page**

Create `src/app/(public)/events/page.tsx`:

```tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/sections/page-hero";
import { EventsArchiveSkeleton } from "@/components/ui/public-skeleton";
import { UpcomingEventsSection, PastEventsArchive } from "@/features/events";

export const metadata: Metadata = {
  title: "Community Calendar",
  description:
    "Every civic event, town hall, and festival hosted by Barangay San Fernando — upcoming and past.",
};

export default function EventsPage() {
  return (
    <>
      <PageHero
        eyebrow="Community Calendar"
        title="Barangay Events"
        description="Every civic event, town hall, and festival hosted by Barangay San Fernando — upcoming and past."
      />
      <Container className="py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-16">
          <Suspense fallback={<EventsArchiveSkeleton what="upcoming events" />}>
            <UpcomingEventsSection />
          </Suspense>
          <Suspense fallback={<EventsArchiveSkeleton what="past events" />}>
            <PastEventsArchive />
          </Suspense>
        </div>
      </Container>
    </>
  );
}
```

- [ ] **Step 9: Write the e2e test for the page itself**

Create `tests/e2e/public/events.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/**
 * Community Calendar (/events): upcoming events and the past-events archive.
 */

test("events page renders", async ({ page }) => {
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Barangay Events" })).toBeVisible();
});

test("past events archive loads more on demand", async ({ page }) => {
  await page.goto("/events");

  const pastHeading = page.getByRole("heading", { name: "Past Events" });
  test.skip((await pastHeading.count()) === 0, "no published past events in this environment");

  const cards = page.getByRole("article");
  const initialCount = await cards.count();

  const loadMore = page.getByRole("button", { name: "Load More" });
  if ((await loadMore.count()) === 0) {
    return; // fewer than 6 past events total — nothing more to load
  }

  await loadMore.click();
  await expect
    .poll(async () => cards.count(), { timeout: 10_000 })
    .toBeGreaterThan(initialCount);
});
```

- [ ] **Step 10: Run typecheck and the new e2e tests**

Run: `npm run typecheck`
Expected: PASS

Run: `npx playwright test tests/e2e/public/events.spec.ts --project=public`
Expected: both tests PASS (the second skips or no-ops gracefully if the
environment has no published past events, or fewer than 7 total)

- [ ] **Step 11: Commit**

```bash
git add src/components/shared/event-archive-card.tsx src/features/events/ src/components/ui/public-skeleton.tsx "src/app/(public)/events/page.tsx" tests/e2e/public/events.spec.ts
git commit -m "feat(events): add the /events Community Calendar archive page"
```

---

### Task 3: Wire the dead links and admin revalidation

**Files:**
- Modify: `src/app/(public)/announcements/page.tsx:25-27`
- Modify: `src/features/home/components/community-pulse-section.tsx:64,71-73`
- Modify: `src/features/admin/actions/events.ts:43-46`
- Modify: `tests/e2e/public/events.spec.ts` (append one test)

**Interfaces:**
- Consumes: `/events` (Task 2's page) as a navigation target only — no code
  imports.

- [ ] **Step 1: Wire the "Community Calendar" button**

In `src/app/(public)/announcements/page.tsx`, change:

```tsx
          <Button variant="outline" size="lg">
            Community Calendar
          </Button>
```

to:

```tsx
          <Button href="/events" variant="outline" size="lg">
            Community Calendar
          </Button>
```

- [ ] **Step 2: Wire the homepage's two dead links**

In `src/features/home/components/community-pulse-section.tsx`, change line 64:

```tsx
            action={<ViewAllLink label="View Calendar" href="/announcements" />}
```

to:

```tsx
            action={<ViewAllLink label="View Calendar" href="/events" />}
```

And change lines 71-73:

```tsx
          <Button href="/announcements" variant="outline" className="mt-6 w-full">
            View All Events
          </Button>
```

to:

```tsx
          <Button href="/events" variant="outline" className="mt-6 w-full">
            View All Events
          </Button>
```

- [ ] **Step 3: Add `/events` to the admin revalidation helper**

In `src/features/admin/actions/events.ts`, change:

```ts
function revalidate() {
  revalidatePath("/admin/events");
  revalidatePath("/");
}
```

to:

```ts
function revalidate() {
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath("/");
}
```

- [ ] **Step 4: Add the link-wiring e2e test**

Append to `tests/e2e/public/events.spec.ts`:

```ts
test("Community Calendar button and homepage links point to /events", async ({ page }) => {
  await page.goto("/announcements");
  await page.getByRole("link", { name: "Community Calendar" }).click();
  await expect(page).toHaveURL(/\/events$/);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "View Calendar" })).toHaveAttribute(
    "href",
    "/events",
  );
  await expect(page.getByRole("link", { name: "View All Events" })).toHaveAttribute(
    "href",
    "/events",
  );
});
```

- [ ] **Step 5: Run typecheck and the full events e2e file**

Run: `npm run typecheck`
Expected: PASS

Run: `npx playwright test tests/e2e/public/events.spec.ts --project=public`
Expected: all three tests PASS

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/announcements/page.tsx" src/features/home/components/community-pulse-section.tsx src/features/admin/actions/events.ts tests/e2e/public/events.spec.ts
git commit -m "fix(events): wire Community Calendar and homepage links to /events, revalidate on admin write"
```

---

### Task 4: Documentation

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** None — this task changes no code.

- [ ] **Step 1: Add a CLAUDE.md bullet**

Under "Conventions and gotchas" in `CLAUDE.md`, add a new bullet (after the
existing `/announcements`/`/news` bullet) documenting:
- `/events` ("Community Calendar") shows every published event: an
  unpaginated "Upcoming Events" section (`event_date >= today`, soonest
  first) and a paginated "Past Events" archive (`event_date < today`, most
  recent first, `EVENTS_ARCHIVE_BATCH = 6`, its own Load More — same
  offset/limit pattern as `/news`, its own `event_date desc, id desc`
  ordering tiebreaker).
- No detail page per event and no literal calendar-grid UI — a richer
  `EventArchiveCard` (category badge + description excerpt) supplements the
  existing compact `EventCard`, which stays as the homepage widget's card
  unchanged.
- `EVENT_CATEGORY_LABELS` lives in `src/features/events/data.ts` (moved out
  of `src/features/admin/data.ts`, which had no other reason to depend on
  the `EventCategory` type) — both admin consumers now import it from there.
- The previously dead "Community Calendar" button and the homepage's
  "View Calendar"/"View All Events" links now point at `/events`.
- `src/features/admin/actions/events.ts`'s shared `revalidate()` helper
  calls `revalidatePath("/events")` alongside `/admin/events` and `/` —
  every event action routes through it.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the /events Community Calendar page"
```
