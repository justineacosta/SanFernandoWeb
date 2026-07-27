# Admin signed preview URLs: wiring resolveMediaUrl(s) into every remaining call site

2026-07-28. Not yet built — this is the approved design, to be handed to the
planning skill next.

## Problem

The 2026-07-27 media-bucket-split design (see
`2026-07-27-media-bucket-split-design.md`) named this exact gap as its
largest single piece of work, and Plan 1 built the fix for it —
`resolveMediaUrl(kind, status, path)` and its batch form
`resolveMediaUrls(kind, status, paths)` in `src/lib/media-lifecycle.ts` —
but Plan 2's wiring pass deferred actually calling them, leaving every admin
preview surface still resolving images and documents through the old,
synchronous, client-safe `photoUrl(path)` / `documentUrl(path)` string
builders (`src/lib/storage.ts`), which only ever point at the two old shared
buckets (`public-media`, `public-documents`).

CLAUDE.md currently describes the deferred surface as "three documented
admin-preview call sites" (`announcement-form.tsx`, `event-form.tsx`,
`officials-manager.tsx`). That undercounts it. A full grep turns up **13
call sites across 7 query files** — `announcements.ts`, `events.ts`,
`news.ts`, `officials.ts`, `achievements.ts`, and `transparency.ts` (which
covers legislative documents, transparency documents, and transparency
projects) — spanning both admin **list-view thumbnails** and **edit-drawer
previews** for every one of the six status-aware content types.
`resolveMediaUrl`/`resolveMediaUrls` have zero callers anywhere in the
codebase today.

This is not purely a future/cosmetic concern. Since the Plan 2 wiring
landed, any draft/in-review/archived record's file uploads straight into its
`<kind>-drafts` bucket and never touches `public-media`/`public-documents`
at all — so `photoUrl()`/`documentUrl()` already return a broken URL for any
such record's preview, today, on the currently-migrated staging environment.
The failure mode is a broken image icon or a dead document link in the admin
UI — never data loss, never a blocked workflow, since Save/publish/archive
never depended on the preview rendering — but it is a real, present, minor
regression, not a hypothetical one.

## Goals

1. Every admin list-thumbnail and edit-drawer preview resolves correctly
   regardless of the record's status: a plain public URL for `published`,
   a short-lived signed URL for anything else.
2. Published records still resolve with zero extra network round-trips —
   don't sign what's already public.
3. One consistent pattern across all six content types, matching how Plan 2
   itself was structured (one task per content type).

## Non-goals

- Deleting the old `public-media`/`public-documents` buckets — separate,
  later, manual step once every environment has migrated and this plan has
  shipped.
- Changing `AchievementPhotoUploader`'s eager-upload behavior (CLAUDE.md
  sub-project 7 §2.4) — only the query-side URL it's previewing changes,
  not when the upload happens.
- Avatars (`avatars-media`) and site content (`site-media`) — neither has a
  draft/published split, so `photoUrl`-style direct public URLs stay correct
  for them as-is.
- Any change to the public-facing site — public queries already resolve
  media correctly (Plan 2), since they only ever read `published` rows.

## Approach

### Single-value edit fields

`officials.ts`'s `getOfficialForEdit` and `transparency.ts`'s
`getLegislativeForEdit` already return the resolved URL as a field separate
from the raw stored path (`photoUrl` alongside `values.photoPath`; `fileUrl`
alongside `values.filePath`) — they just call the wrong builder. Swapping
`photoUrl(path)` → `await resolveMediaUrl("officials", status, path)` (same
for legislative) is a same-shape change, no type changes needed.

`announcements.ts`'s `getAnnouncementForEdit` and `events.ts`'s
`getEventForEdit` don't have that separation today — `values.imageSrc` /
`values.coverSrc` carry only the raw path (deliberately, so the value
round-trips unchanged through `saveAnnouncement`/`saveEvent` when the
uploader isn't touched), and `announcement-form.tsx` / `event-form.tsx`
compute `photoUrl(values.imageSrc)` **client-side** to build the preview.
Since `resolveMediaUrl` is `server-only`, that call has to move server-side.
Fix: add a sibling field to each edit-fetch return type —
`imagePreviewUrl` / `coverPreviewUrl` — resolved once in the query function,
threaded through the existing Server Action
(`getAnnouncementForEditAction`/`getEventForEditAction`) and the manager
component's state (`news-manager.tsx`, `events-manager.tsx`) into the form
as a new prop, replacing the client-side `photoUrl()` call. `values.imageSrc`
/ `values.coverSrc` themselves don't change shape or meaning.

### Per-record multi-file fields

News gallery photos (`news.ts`), achievement photos (`achievements.ts`), and
transparency files (`transparency.ts`, both documents and projects) each
belong to one record with one status — a direct fit for the existing
`resolveMediaUrls(kind, status, paths)` batch helper. Swap the
`.map(p => photoUrl(p.src))` / `.map(f => documentUrl(f.path))` line for one
`resolveMediaUrls` call ahead of the map.

### List views (new helper)

`listAnnouncements`, `listEvents`, `listAdminOfficials`,
`listNewsArticles` (cover only — the two transparency list functions return
only a file *count*, no URL, so they need no change) each render one
thumbnail per row across *many* rows that can be in different statuses at
once (e.g. a table showing a published row next to a draft row). Neither
existing helper fits directly: `resolveMediaUrl` would mean one signed-URL
network call per non-published row; `resolveMediaUrls` takes one status for
its whole batch.

New helper in `src/lib/media-lifecycle.ts`:

```ts
export async function resolveMediaUrlsForList(
  kind: MediaKind,
  rows: { path: string | null; status: ContentStatus }[],
): Promise<(string | null)[]>
```

Resolves every `published` row's path directly via `mediaUrl()` (no network
call). Collects every non-published row's path (regardless of *which*
non-published status — `bucketForStatus` already treats draft/in-review/
archived identically, all reading from the same `<kind>-drafts` bucket) and
signs them in **one** `createSignedUrls` batch call, same TTL and error
handling as `resolveMediaUrls`. Returns results in input order so each list
function can zip them back onto its rows positionally.

## Task breakdown

Mirrors Plan 2's own division — one content type per task, so each is
independently reviewable and testable:

0. Add `resolveMediaUrlsForList` to `media-lifecycle.ts`.
1. Officials + achievements (`officials.ts`, `achievements.ts`,
   `officials-manager.tsx` list thumbnail — `official-form.tsx` needs no
   change, it already consumes a separate `photoUrl` field).
2. Events (`events.ts` list + edit, `event-form.tsx` preview prop).
3. Announcements (`announcements.ts` list + edit, `announcement-form.tsx`
   preview prop).
4. News (`news.ts` cover in list + gallery photos in edit).
5. Legislative (`transparency.ts`'s `listAdminLegislative` +
   `getLegislativeForEdit`).
6. Transparency documents + projects (`transparency.ts`'s remaining four
   functions — file batches only, no list thumbnails to fix there).
7. Final whole-branch review — same subagent-driven review step that caught
   the demote-on-any-exit bug during Plan 2; this pass touches every admin
   query file, so it's worth the same scrutiny.

## Testing / verification

No live Supabase credentials in this environment beyond what the project
owner has already applied to staging. Per-task verification: typecheck +
lint, plus code review confirming the `published` branch never gains a
network round-trip it didn't have before. Real click-through — create or
edit a draft/in-review/archived record of each content type against
staging, confirm both its list thumbnail and edit-drawer preview render
(currently broken), confirm a published record's preview still renders with
no visible delay — is the project owner's job on staging once this ships,
same discipline as every other plan in this project.

## Risk

Moderate: touches 7 query files, 2 form components, and adds one new helper
— all read-only from the app's perspective (no new writes, no new migration,
no schema change), so the failure mode of a mistake here is the same broken-
preview symptom this plan exists to fix, not data loss. Low risk to build as
one plan; still worth the per-content-type task split so each is reviewable
on its own, matching Plan 2's structure.
