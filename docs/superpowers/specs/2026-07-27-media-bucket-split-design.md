# Media bucket split: per-type buckets + status-aware public/private isolation

2026-07-27. Not yet built — this is the approved design, to be handed to the
planning skill next.

## Problem

Two Supabase Storage buckets hold almost everything the site uploads:
`public-media` (news photos, official portraits + achievement photos, event
covers, announcement images, site/about images) and `public-documents`
(legislative PDFs, transparency documents/projects' files). Both use a single
RLS policy of the shape:

```sql
create policy "public read <bucket>" on storage.objects
  for select to public using (bucket_id = '<bucket>');
```

Supabase Storage's `list()` operation is implemented as a `SELECT` against
`storage.objects`, gated by the same RLS policy as an individual object read.
There is no way to grant "fetch one object by exact path" without also
granting "list every object in the bucket." Confirmed against staging with
the anon key: the bucket is fully enumerable by anyone, which means draft,
in-review, and archived content — which the admin UI describes as "hidden
from the public" — is technically visible to anyone who queries the Storage
API directly, even though the site itself never links to it.

Separately, both buckets mix every content type together, which makes them
harder to browse and reason about than a bucket-per-type layout would be.

## Goals

1. Make draft/in-review/archived media genuinely private — not just
   unlinked.
2. Organize storage by content type for clarity.
3. Change nothing about the DB schema or the string format of stored paths.

## Non-goals

- `feedback-media` is untouched — already private, already correct, and its
  screenshots have no lifecycle to key off of.
- No public-facing behavior changes. Public pages only ever query
  `published` rows, so they never touch a private bucket.

## Bucket layout

**Six content types have a draft → in-review → published → archived
lifecycle** and each gets a public/private pair:

| Type | Public bucket | Private bucket |
|---|---|---|
| News | `news-media` | `news-drafts` |
| Officials (portraits + achievement photos) | `officials-media` | `officials-drafts` |
| Events | `events-media` | `events-drafts` |
| Announcements | `announcements-media` | `announcements-drafts` |
| Legislative | `legislative-media` | `legislative-drafts` |
| Transparency (documents + projects) | `transparency-media` | `transparency-drafts` |

**Two content types have no lifecycle at all** — Save already writes live,
so there is nothing to stage — and get one always-public bucket each:

- `site-media` (Home/About images)
- `avatars-media` (staff avatars)

Total: 12 status-aware buckets + 2 simple buckets = 14, replacing today's
`public-media` and `public-documents`.

**Object path strings do not change.** A news photo keeps
`news/<articleId>/<uuid>.jpg`; an achievement photo keeps
`achievements/<achievementId>/<uuid>.jpg`; documents keep their existing
shape. Only *which bucket* holds that path changes with the record's status.
No database column changes anywhere.

## Bucket resolution

New helpers (`src/lib/storage.ts`, extending the existing
`PUBLIC_MEDIA_BUCKET`/`PUBLIC_DOCUMENTS_BUCKET` constants):

```ts
type MediaKind = "news" | "officials" | "events" | "announcements" | "legislative" | "transparency";

function publicBucketFor(kind: MediaKind): string;   // "<kind>-media"
function draftBucketFor(kind: MediaKind): string;    // "<kind>-drafts"
function bucketForStatus(kind: MediaKind, status: ContentStatus): string;
// -> draftBucketFor(kind) for draft/in-review/archived, publicBucketFor(kind) for published

const SITE_MEDIA_BUCKET = "site-media";
const AVATARS_MEDIA_BUCKET = "avatars-media";
```

Every call site that currently does
`admin.storage.from(PUBLIC_MEDIA_BUCKET)` or
`admin.storage.from(PUBLIC_DOCUMENTS_BUCKET)` resolves the bucket through
these helpers instead, using the record's kind and current status.

## Upload flow

At Save time, look at the record's current status: if it's already
`published` (editing a live article), new files upload straight into
`<kind>-media`. Otherwise they upload into `<kind>-drafts`. This preserves
today's "uploads defer to Save" and compensating-delete behavior — only the
bucket target changes.

## Status-transition rules (promote / demote)

Only two transitions move a file between buckets. Everything else — submit
for review, return to draft, restore from archived, archiving from draft or
in-review — stays within `<kind>-drafts` and needs no storage move.

1. **Publish** (draft/in-review/archived → published): copy the record's
   file(s) from `<kind>-drafts` to `<kind>-media` at the same path, **before**
   flipping the DB status. If the copy fails, abort the publish and return an
   error — a row must never read `published` while its image still lives only
   in the private bucket, since that would surface a broken image on a live
   public page. Once the DB update succeeds, best-effort delete the source
   objects from `-drafts` (log, don't fail, on cleanup failure — matches the
   existing `discardImage`/orphan-logging convention).
2. **Archive, only when the prior status was `published`**: after the DB
   status flips to `archived`, copy the file(s) back from `<kind>-media` to
   `<kind>-drafts`, then best-effort delete from `-media`. Archiving directly
   from `draft` or `in-review` needs no move — the file is already private.

Multi-file records (news photos ≤3, achievement photos, transparency files
≤3) promote/demote as a batch. The all-or-nothing guarantee only applies to
publish (must not flip status on a partial failure); a partial demote on
archive just logs the failure, since the row is already excluded from public
listings by its status regardless of where the file physically sits.

**Achievement photos have no status of their own** — achievements can only
be created/edited/reordered/hidden/deleted, never published or archived
independently. Their bucket placement rides entirely on their *parent
official's* status: when `publishOfficial`/`archiveOfficial` (in
`officials.ts`) promote or demote the portrait, they promote or demote every
one of that official's achievement photos in the same batch. There is no
promote/demote logic inside `achievements.ts` or `achievement-photos.ts`
themselves — new achievement photos uploaded after the official is already
published go straight into `officials-media`, same rule as any other
already-published record.

## Admin preview URLs

This is the largest single piece of work in this design. Today, every admin
editor resolves an image with the synchronous, client-safe `photoUrl(path)` /
`documentUrl(path)` string builders — no server round trip, because
`public-media` is world-readable. Once drafts live in a private bucket, that
stops working for unpublished content.

Admin query loaders (`getNewsArticleForEdit` and its equivalents for
officials/achievements/events/announcements/legislative/transparency) resolve
media URLs like this:

- `status === "published"` → the existing plain public URL, unchanged, no
  round trip.
- otherwise → a short-lived **signed URL**, minted server-side via the
  service-role client against the `<kind>-drafts` bucket — the same pattern
  `features/admin/queries/feedback.ts` already uses for feedback screenshots.

This makes each of those loaders async where it wasn't already (most are
already server-side query functions, so this is a smaller change than it
sounds, but it touches every one of them). It does **not** change who can see
draft/archived content: the existing `checkPermission("manage-news")` /
equivalent gate on each admin route and action is what decides who reaches
the loader at all. The signed URL is just the mechanism for delivering the
image once that permission check has already passed — access itself is
unchanged.

## Data migration for existing objects

This agent has no credentials for the live Supabase project, so this is
necessarily a script the project owner runs — same pattern as
`scripts/upload-official-portraits.mjs` / `scripts/upload-site-images.mjs`.

1. **New SQL migration** `00XX_media_buckets.sql`: creates all 14 buckets and
   their RLS policies (public buckets: "public read", same shape as today;
   drafts buckets: no public policies at all, service-role only). Applied
   manually, like every migration on this project.
2. **New script** `scripts/migrate-media-buckets.mjs`: for every row in every
   affected table (`news_articles`/`news_photos`, `officials`/
   `official_achievements`/`official_achievement_photos`, `events`,
   `announcements`, `legislative_documents`, `transparency_documents`/
   `transparency_projects`/`transparency_files`, `site_items`, `profiles`
   avatars), read the current status (where applicable) and path(s),
   download from the old bucket, upload to the correct new bucket at the
   same path. Site items and avatars always go to their single public bucket
   regardless of status. The script only copies and logs a summary — it does
   not delete anything from the old buckets.
3. **Old buckets** (`public-media`, `public-documents`) are deleted manually,
   later, once the new layout has been verified — not automated by the
   script.

## Implementation surface

- `src/lib/storage.ts`: bucket-resolution helpers (`publicBucketFor`,
  `draftBucketFor`, `bucketForStatus`, `SITE_MEDIA_BUCKET`,
  `AVATARS_MEDIA_BUCKET`), replacing the single `PUBLIC_MEDIA_BUCKET` /
  `PUBLIC_DOCUMENTS_BUCKET` constants at every call site.
- `src/lib/media.ts`: `uploadSingleImage`, `removeStoredImage`,
  `discardImage` become kind/status-aware.
- `src/features/admin/actions/documents.ts`: same for
  `uploadDocumentPdf`, `uploadTransparencyFile`, `removeStoredDocument`.
- Publish/archive Server Actions in `news.ts`, `officials.ts` (which also
  promotes/demotes that official's achievement photos as part of its own
  transition — see above), `events.ts`, `announcements.ts`, `legislative.ts`,
  `transparency-documents.ts`, `transparency-projects.ts`: wire in
  promote/demote at exactly the two transitions above.
- Admin query layer (`features/admin/queries/*`): async signed-URL
  resolution for any record whose status isn't `published`.
- `site-content.ts` (site items) and `account.ts`/`users.ts` (avatars):
  repoint to their single public buckets — no lifecycle logic needed.
- New migration + new migration script, as above.

Suggested phasing for the implementation plan (not a hard requirement, but
this is large enough that building it as one pass is risky):

1. Buckets + resolution helpers + upload/remove function updates
   (foundation; nothing else can be tested without this).
2. Promote/demote wired into publish/archive across all six content types.
3. Admin preview signed-URL plumbing across the query layer.
4. Data migration script + verification + old-bucket cleanup instructions.

## Testing / verification

This agent has no live Supabase environment to click-test against — the same
limitation noted for Plans 6 and 7 in the project's history. Verification
here is typecheck/lint plus careful code review; a real click-through
(uploading a draft, confirming it's actually inaccessible via a direct
Storage URL, publishing it, confirming it becomes public, archiving it,
confirming it goes private again) is the owner's job once the migration is
applied and the data-migration script has run on staging.

## Risk

This is a substantial, security-relevant change to a live production
system's storage layer, touching roughly 15 files plus a new migration and a
new hand-run script. Build and review it on its own feature branch, apply the
new migration and run the migration script against **staging only** first
(per this project's existing migration discipline — production is always
last and always by explicit confirmation), and get a full click-through
before production is even on the table.
