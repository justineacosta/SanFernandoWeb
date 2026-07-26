# News Teaser + Full Archive (`/news`)

**Date:** 2026-07-26
**Status:** Approved, ready for planning
**Migration:** none — schema unchanged
**Scope:** News articles only. Announcements and Events get the same treatment in
later, separate passes — not part of this spec.

## 1. What this is

`/announcements` currently *is* the full News Hub: a featured-article card, a
2-column grid, and numbered link-based pagination (`?page=n`), all under a
"Community News Feed" heading. Two things about that page are changing:

1. It becomes a **3-item teaser** for News, not the full archive.
2. The full archive moves to a **new page, `/news`**, with a "Load More" button
   instead of numbered pages.

Also bundled into this pass, since it's a one-line removal on the same hero
`/announcements` already ships: the dead **"Subscribe to Alerts"** button goes
away (the working SMS-subscribe form already lives in the sidebar). The
**"Community Calendar"** button stays exactly as it is today — inert — because
making it work depends on the Events archive, which is a separate future pass.
Article detail pages stay at `/announcements/[slug]`; this spec does not touch
that route.

## 2. The two surfaces

### `/announcements` — teaser

Fetches the 3 newest published articles. The newest renders as `FeaturedNewsCard`
(unchanged component), the other two as `NewsCard` in a 2-column row (unchanged
from today's grid styling, just capped at 2 items instead of 6). Below that, a
**"See More"** button links to `/news` — but only when there's more to see
(`total > 3`); if the barangay has 3 or fewer articles total, the button doesn't
render, since there'd be nothing more to show.

No pagination, no `?page=` param, no `Suspense key={current}` — this component
never re-fetches after first render.

### `/news` — full archive

New route. Same two-column layout as `/announcements` (archive in an 8-col main
column, `NewsSidebar` unchanged in a 4-col rail) so the reader keeps the
hotlines/newsletter/latest-announcements context while browsing.

First load fetches 6 articles: the newest as `FeaturedNewsCard`, the next 5 as a
**3-column grid** of `NewsCard` (`lg:grid-cols-3` — up from the teaser's/old
page's 2 columns). A **"Load More"** button below fetches 6 more each click,
appended to the grid, until nothing's left, at which point the button
disappears. The featured card never changes or re-fetches — it's fixed to
whatever was newest at first load.

Empty state (no published articles at all): "No news yet. Please check back
soon." — same copy, same treatment as the teaser and today's page.

## 3. Data layer

`listPublishedArticles` (`src/features/announcements/queries.ts`) changes from
page-based to **offset + limit**, since both surfaces now need arbitrary batch
sizes from the same query rather than one fixed page size:

```ts
export async function listPublishedArticles(
  offset: number,
  limit: number,
): Promise<{ items: NewsArticleListItem[]; total: number }>
```

It has exactly one caller today (`news-feed.tsx`), so this is a clean signature
change, not an addition alongside the old one. `ARCHIVE_BATCH = 6` is exported
from the same file — the one number both "first archive load" and "every Load
More click" share, so widening the batch later is a one-line change.

A new Server Action, `loadMoreNews(offset: number)`
(`src/features/announcements/actions.ts`, `"use server"`), wraps the query for
the client "Load More" button:

```ts
export async function loadMoreNews(offset: number) {
  const { items, total } = await listPublishedArticles(offset, ARCHIVE_BATCH);
  return { items, hasMore: offset + items.length < total };
}
```

It's a plain read — no auth check, same public-boundary rule as the query itself
(`.eq("status", "published")`), called directly from a client component the way
Next.js Server Actions support without a dedicated API route.

## 4. Components

| Component | File | Role |
| --- | --- | --- |
| `NewsTeaser` | `news-teaser.tsx` (renamed from `news-feed.tsx`) | Server component. Fetches `offset=0, limit=3`. Renders featured + up to 2 grid cards + conditional "See More". |
| `NewsArchive` | `news-archive.tsx` (new) | Server component. Fetches `offset=0, limit=ARCHIVE_BATCH`. Splits featured vs. grid, renders empty state, or hands off to `NewsArchiveGrid`. |
| `NewsArchiveGrid` | `news-archive-grid.tsx` (new) | Client component. Holds `items`/`offset` state seeded from the server fetch; "Load More" calls `loadMoreNews` via `useTransition`, appends results, hides the button once `hasMore` is false. |

`FeaturedNewsCard` and `NewsCard` (`news-card.tsx`) are unchanged — both new
components reuse them as-is.

`src/features/announcements/index.ts` drops the `NewsFeed` export, adds
`NewsTeaser` and `NewsArchive`.

## 5. Pages

- `src/app/(public)/announcements/page.tsx` — drops `searchParams`/`page`
  handling entirely, drops the "Subscribe to Alerts" button, swaps `NewsFeed` →
  `NewsTeaser`. "Community Calendar" button markup is untouched.
- `src/app/(public)/news/page.tsx` (new) — a `PageHero` (no CTA buttons needed)
  + the same 8/4 column split as `/announcements`, `NewsArchive` in the main
  column, `NewsSidebar` in the rail, each in its own `Suspense` boundary.

## 6. Loading states

`src/components/ui/public-skeleton.tsx`:
- `NewsFeedSkeleton`'s existing `count` prop covers the teaser's 2-card shape
  (`count={2}` at the call site) — no change to the component itself.
- New `NewsArchiveSkeleton`: same featured-block shimmer, followed by a 3-column
  grid of 5 image-topped card skeletons, matching the real first-load shape.

Both are `Suspense` fallbacks, not `loading.tsx` bodies, per the existing
convention — the hero has no data dependency and shouldn't flash grey on
navigation.

## 7. Accessibility

- "See More" and "Load More" are real `<Button>`s (already keyboard-operable,
  already have visible focus states) — no custom control.
- "Load More" shows a disabled + "Loading…" label state while its transition is
  pending, so a screen reader user gets a clear busy signal instead of a button
  that silently does nothing for a moment.
- Newly appended cards are plain DOM insertions into an existing list — no focus
  is stolen, so a keyboard user's position on the page is preserved after a
  click.

## 8. Out of scope (deliberately)

- Announcements and Events keep their current teaser-only/no-archive shape.
  Same pattern, separate pass, separate spec.
- "Community Calendar" stays a dead button until the Events pass gives it
  somewhere real to point.
- No URL-addressable pagination on `/news` (e.g. `?offset=`) — Load More is
  client state only, matching what was asked for. Deep-linking into page 3 of
  the archive isn't a requirement here.
- `/announcements/[slug]` detail route: unchanged.

## 9. Testing

No pure functions worth unit-testing here (the query is a thin Supabase
wrapper). Manual verification, per `.claude/skills/verify/SKILL.md`:

1. `/announcements` — shows exactly 3 items (1 featured + 2 grid), "See More"
   present iff more than 3 published articles exist, "Subscribe to Alerts" is
   gone, "Community Calendar" still renders (inert).
2. Click "See More" → lands on `/news`, shows 1 featured + 5 grid (3-column).
3. Click "Load More" on `/news` → 6 more cards append below, button shows a
   brief "Loading…" state.
4. Keep clicking "Load More" until every article is shown → button disappears.
5. With 3 or fewer total published articles: teaser shows them all, no "See
   More"; `/news` shows them all, no "Load More".
6. With zero published articles: both pages show "No news yet." and nothing
   else breaks (sidebar still renders independently).
