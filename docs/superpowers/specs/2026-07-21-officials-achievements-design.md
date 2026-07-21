# Officials Achievements Timeline — Design

**Date:** 2026-07-21
**Status:** Approved
**Master spec:** `docs/superpowers/specs/2026-07-15-backend-integration-design.md` §6
**Predecessor:** `docs/superpowers/specs/2026-07-21-officials-backend-integration-design.md`
(Plan 6, which shipped the officials table, directory, profile pages, and admin manager,
and **explicitly deferred achievements to this follow-up**)

## 1. Goal

Give each barangay official a published achievements timeline on their profile page,
editable from the existing officials drawer in the admin portal. This closes the last
open item of master spec §6.

## 2. Scope

| In scope | Out of scope |
| --- | --- |
| `official_achievements` + `official_achievement_photos` tables (migration `0013`) | Achievements on the directory card — profile pages only |
| Up to 3 uploaded photos per achievement, with lightbox | Achievements in site search |
| Free-text date label per achievement | Real sortable `date` columns |
| Per-item show/hide toggle and manual reorder | Any seeded achievement content |
| Promoting the news lightbox to a shared `PhotoGallery` | Multi-term / term-history records |

## 3. Decisions

### 3.1 Photos: yes, up to 3 per achievement

Master spec §6 allows "optional photo" (singular). The owner chose **three per
achievement**, which is the same cap News and Events already use (master spec §5).

This is the decision that shapes everything else. Because photos are real uploads to
Storage, an achievement row must have a **stable id before its photos can exist** — so
achievements cannot be edited as a local array and flushed on the parent form's Save.
They persist immediately, per item, exactly as `news_photos` do today.

### 3.2 Date: free-text label, not a date column

`date_label text` holding values like `March 2024`, `2023–2024`, or `Ongoing`.
Barangay achievements rarely have a meaningful day-of-month, and a date picker would
force staff to invent one. Ordering is owned by explicit `sort_order` + reorder arrows,
so the date never needs to be sortable. Blank hides the label.

### 3.3 Two child tables, mirroring news

`official_achievements` → `official_achievement_photos` reproduces the
`news_articles` → `news_photos` shape already in the codebase. A `jsonb` photo array on
the achievement row would save one table but would diverge from an established pattern,
lose DB-generated photo ids, and make Storage-cleanup queries awkward. Consistency wins.

### 3.4 New achievements are not gated behind an extra step

The public query filters on `is_visible = true` **AND** `title <> ''`. A freshly added,
still-blank achievement therefore cannot leak to the public site, and staff are not
forced to flip a switch on every entry they write. The visibility toggle remains for
deliberately hiding a finished achievement.

### 3.5 The lightbox is promoted to a shared component

`NewsGallery` currently lives in `src/features/announcements/components/`. Importing it
from `src/features/officials/` would break the "feature modules own everything for a
route" rule in `CLAUDE.md`. It moves to `src/components/shared/photo-gallery.tsx` as
`PhotoGallery`, and the `NewsPhoto` type is renamed `GalleryPhoto`.

`NewsGallery` has exactly one consumer (`app/(public)/announcements/[slug]/page.tsx`)
and is not exported from the announcements barrel, so the move is contained.

## 4. Data model — migration `0013_official_achievements.sql`

```sql
create table public.official_achievements (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references public.officials (id) on delete cascade,
  title text not null default '',
  description text not null default '',
  date_label text not null default '',
  is_visible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index official_achievements_official_idx
  on public.official_achievements (official_id, sort_order);

alter table public.official_achievements enable row level security;

create trigger official_achievements_updated_at
  before update on public.official_achievements
  for each row execute function public.set_updated_at();

create table public.official_achievement_photos (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null
    references public.official_achievements (id) on delete cascade,
  src text not null,
  alt text not null default '',
  sort_order int not null default 0
);

create index official_achievement_photos_achievement_idx
  on public.official_achievement_photos (achievement_id, sort_order);

alter table public.official_achievement_photos enable row level security;
```

**RLS enabled with zero policies**, matching every other table. Reads go through the
service-role client with explicit filters; writes go through Server Actions behind
`requirePermission("manage-officials")`. The code check is the entire gate.

`title` defaults to `''` (not `not null` without a default) because "Add achievement"
creates the row before the staff member has typed anything — see §6.

**No seed rows.** The barangay has supplied no achievement content.

## 5. Storage

Photos land in the **existing** `public-media` bucket at:

```
achievements/<achievementId>/<uuid>.<ext>
```

This mirrors `newsPhotoPath`'s `news/<articleId>/<uuid>.<ext>`. A new
`achievementPhotoPath(achievementId, ext)` helper joins it in `src/lib/storage.ts`.

Limits, reusing the existing constants: `MAX_IMAGE_BYTES` (2 MB) per file,
`ALLOWED_IMAGE_TYPES` (JPG/PNG/WebP), 3 photos per achievement. All three are checked
client-side for a fast human message **and re-checked server-side**, because Server
Actions are public HTTP endpoints.

### 5.1 Storage cleanup on delete

Postgres cascade deletes rows; it knows nothing about Storage objects.

- `deleteAchievement` removes that achievement's photo objects before deleting the row.
- **`deleteOfficial` must be extended**: it currently removes only the portrait. It now
  also collects every `official_achievement_photos.src` belonging to that official and
  removes those objects. Without this, deleting an official silently orphans every
  achievement photo they had.

As elsewhere, only owned object paths are removed — a value matching `^https?://` is
left alone.

## 6. Admin editing

A new **Achievements** section in the officials drawer (`official-form.tsx`), placed
below Short Bio.

**Brand-new official (no id yet):** the section renders a muted note —
*"Save the official first to add achievements."* This is the existing `news-form.tsx`
precedent (`{id ? <NewsPhotoUploader … /> : null}`), not a new idea.

**Saved official:** an `AchievementsEditor` client component owns its own list state and
persists each change immediately, the same model as `NewsPhotoUploader`.

Per achievement card:

| Control | Behaviour |
| --- | --- |
| Title | Text input, saves on blur |
| Description | Textarea, saves on blur |
| Date label | Text input, saves on blur |
| Visible | `ToggleSwitch`, saves immediately |
| Reorder | Up/down arrow buttons — matches the officials manager, which also uses arrows rather than drag |
| Delete | Confirmed, removes the row and its photos |
| Photos | 3-photo uploader: drag-drop, thumbnail previews, per-photo alt text, reorder, remove |

"Add achievement" inserts an empty row immediately and the new card appears with its
title field focused. Text fields save on blur, mirroring the photo alt-text idiom
already in `NewsPhotoUploader`. §3.4 explains why an empty row is safe.

**Caps:** 20 achievements per official, 3 photos per achievement. Both validated
server-side with Zod, both surfaced as human messages client-side.

## 7. Public rendering

`/officials/[slug]` gains an **Achievements** section below About. Omitted entirely when
there are none, exactly as the bio section is today.

Layout — a vertical timeline:

- A left rail with an amber dot per entry and a connecting line between dots
- Date label above the title, small caps, `brand-700` (matching the role treatment
  already on the page)
- Title in `font-display`, `ink-900`
- Description in `ink-600`, `whitespace-pre-line`
- Up to 3 square thumbnails below the description, opening the shared lightbox

Only `brand-*` / `ink-*` / `danger*` tokens. No `brand-50`, no `brand-900`, no blue.

### 7.1 Query

`getPublishedOfficialBySlug` fetches all three levels in **one** PostgREST request using
a nested embed rather than three round trips:

```
.select(`${LIST_COLUMNS}, term, bio,
         official_achievements(id, title, description, date_label, sort_order,
           official_achievement_photos(id, src, alt, sort_order))`)
```

Public filtering (`is_visible = true`, `title <> ''`) and ordering by `sort_order` are
applied on the embedded rows — in supabase-js, via dotted filter keys
(`.eq("official_achievements.is_visible", true)`) and `referencedTable` on `.order(...)`.
`group` stays quoted as `"group"` — it is a SQL reserved word and PostgREST needs the
quotes in every select and filter string.

**Accepted fallback:** if two-level embedded ordering or filtering proves unreliable in
practice, fetching the achievements (with their photos) in a second query and sorting in
TypeScript is acceptable. A profile page is a handful of rows; correctness outranks the
saved round trip. Do not leave the page silently unsorted or unfiltered to preserve the
single-query shape.

### 7.2 `PhotoGallery` variants

The promoted component takes a `variant` prop:

- `"feature"` (default) — the current news layout: 1/2/3-photo responsive grid with the
  3-photo hero arrangement. The announcements page passes nothing and its rendered
  output is **unchanged**.
- `"thumbs"` — a compact row of up to 3 square thumbnails, used by the timeline.

The lightbox itself (click to open, arrow keys, Escape, click-outside to close) is
shared by both variants and is not modified.

## 8. Workflow and revalidation

Achievements have no independent workflow — they inherit the official's. The profile
page returns 404 for any official that is not `published`, so:

- **Archiving an official** already hides their achievements while preserving the
  records as term history, satisfying master spec §6 with no additional work.
- **Deleting an official** cascades the rows and (per §5.1) sweeps the Storage objects.

Every achievement mutation revalidates `/admin/officials` and `/officials/<slug>`,
resolving the slug through `official_id`. It does **not** revalidate `/officials` or
`/about` — neither surface renders achievements.

Every mutation records an entry through `recordActivity`, consistent with the rest of
the admin portal.

## 9. Files

**Create**

- `supabase/migrations/0013_official_achievements.sql`
- `src/features/admin/actions/achievements.ts`
- `src/features/admin/actions/achievement-photos.ts`
- `src/features/admin/queries/achievements.ts`
- `src/features/admin/components/achievements-editor.tsx`
- `src/features/admin/components/achievement-photo-uploader.tsx`
- `src/features/officials/components/achievements-timeline.tsx`
- `src/components/shared/photo-gallery.tsx` *(moved from
  `src/features/announcements/components/news-gallery.tsx`)*

**Modify**

- `src/types/index.ts` — achievement types; `NewsPhoto` → `GalleryPhoto`
- `src/lib/storage.ts` — `achievementPhotoPath`
- `src/features/officials/queries.ts` — nested embed on `getPublishedOfficialBySlug`
- `src/app/(public)/officials/[slug]/page.tsx` — render the timeline
- `src/features/admin/components/official-form.tsx` — mount the editor
- `src/features/admin/actions/officials.ts` — Storage sweep in `deleteOfficial`
- `src/app/(public)/announcements/[slug]/page.tsx` — import the moved gallery
- `docs/BACKEND_HANDOFF.md` — document the new tables, actions, and storage prefix

**Delete**

- `src/features/announcements/components/news-gallery.tsx` *(moved, not removed
  outright — it has exactly one consumer and is absent from the feature barrel)*

## 10. Verification

There is no test framework, and this plan does not add one — that belongs to the
hardening phase. Verification is:

1. `npm run typecheck` — clean
2. `npm run lint` — clean
3. `npm run build` — clean; `/officials/[slug]` and `/announcements/[slug]` still build
4. Public runtime checks per `.claude/skills/verify/SKILL.md`
5. **Admin runtime checks are run by the repo owner**, who holds the credentials. The
   owner's checklist covers: add an achievement, upload 3 photos, reorder them, hide and
   re-show an entry, reorder entries, delete an entry, and confirm the announcements
   photo gallery still renders identically after the `PhotoGallery` move.

Migration `0013` is applied **manually by the owner** against Supabase staging. Nothing
in this plan may assume it has been applied without explicit confirmation.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| The `PhotoGallery` move touches shipped news code | Exactly one consumer, no barrel export; `variant` defaults to today's layout so news output is byte-identical; typecheck catches every missed reference |
| Orphaned Storage objects after deleting an official | §5.1 extends `deleteOfficial` — called out explicitly because the DB cascade hides the problem |
| `0013` not applied to production at deploy | Same standing risk as `0012`, which is also staging-only; recorded in the handoff doc |
| An empty achievement row reaching the public site | `title <> ''` filter in the public query (§3.4) |

## 12. Deferred

Achievements on directory cards; achievements in search; sortable real dates; multi-term
history; seeded content. Officials' real bios, emails, and phone numbers remain owed by
the barangay and are unchanged by this work.
