# Media Bucket Split — Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point every upload at the correct per-type bucket for the record's
current status, move media between the public and private bucket at publish
and archive-from-published, and fix every **public-facing** (`status =
"published"`-filtered) query so it resolves images/documents from the new
buckets instead of the retired single-bucket helpers. This is Plan 2 of the
sequence started by
`docs/superpowers/plans/2026-07-27-media-bucket-split-foundation.md` (Plan 1,
merged at `c07ba57`), which built the bucket-naming helpers
(`src/lib/storage.ts`) and the copy/promote/demote/signed-URL primitives
(`src/lib/media-lifecycle.ts`) but wired none of them in.

**Architecture:** `src/lib/media.ts` and
`src/features/admin/actions/documents.ts` become status-aware — every upload
targets `bucketForStatus(kind, status)` instead of the old single
`PUBLIC_MEDIA_BUCKET`/`PUBLIC_DOCUMENTS_BUCKET` constants. Each of the six
content types' publish action calls `promoteMedia` before its DB status
update and `cleanupPromotedMedia` after; each type's archive action calls
`demoteMedia` only when the row being archived was previously `published`.
Every hard-delete action (which `guardDelete` only ever allows from
`archived`) removes its Storage objects from `draftBucketFor(kind)` — safe
because, once this plan lands, an `archived` row's media is *always* in the
private bucket (never promoted, or demoted back by the archive transition).
Public query functions filtered to `status = "published"` switch their
`photoUrl`/`documentUrl` calls to `mediaUrl(publicBucketFor(kind), path)`.

**Tech Stack:** Next.js 16 Server Actions, `@supabase/supabase-js`
service-role client, Vitest (pure-function tests only — see Global
Constraints).

## Global Constraints

- Path alias `@/*` → `src/*`.
- zod is v4 — use `z.uuid()`, not the deprecated v3 `z.string().uuid()`.
- `npm run typecheck` and `npm run lint` must both pass clean before any task
  is considered done.
- Never `git add -A` — this repo has intentionally-untracked directories
  (`proposal/`, `stitch_tabbed_content_manager/`) at the root. Stage explicit
  paths only.
- Object path strings must not change anywhere in this plan — only bucket
  targets change. No database column changes anywhere.
- Every new function/parameter needs a one-line doc comment only when the
  *why* is non-obvious — no comments that restate the signature.
- No live Supabase environment to click-test against (same limitation noted
  in Plan 1 and every prior Storage-touching plan). Verification here is
  typecheck/lint plus careful manual review of each diff; a real click-through
  is the owner's job once this ships to staging.
- **Every task must leave the app in a fully working state** — no task may
  depend on a later task to avoid a runtime break. Where a shared helper
  (`media.ts`, `documents.ts`) changes signature, the task that changes it
  also fixes every existing call site in the same commit.

### Explicit scope boundary — read this before objecting to something left untouched

This plan deliberately does **not** touch:

- Admin **list** thumbnails for mixed-status rows (`listAdminOfficials`,
  `listAnnouncements`, `listEvents`, `listNewsArticles`, `listAdminLegislative`,
  `listAdminTransparencyDocuments`, `listAdminTransparencyProjects`).
- Admin **edit-drawer** existing-image/file previews
  (`getOfficialForEdit`, `getAnnouncementForEdit`, `getEventForEdit`,
  `getLegislativeForEdit`, `getTransparencyDocumentForEdit`,
  `getTransparencyProjectForEdit`, and the client-side `photoUrl()` calls in
  `announcement-form.tsx`/`event-form.tsx`).
- `GalleryPhoto` producers for **news photos and achievement photos**
  (`getNewsArticleForEdit`, `listAchievementsForOfficial`,
  `uploadAchievementPhotos`'s returned list) — these mix all statuses and, for
  achievement photos, ride on a *different* record's (the parent official's)
  status.

All of the above keep calling the untouched `photoUrl(path)` /
`documentUrl(path)` helpers exactly as they do today, targeting the old
`public-media`/`public-documents` buckets. **Why this is safe to defer:**
those buckets are not being deleted or emptied by this plan (Plan 1 confirmed
they stay in the baseline "until the wiring plan lands," and no data
migration has run yet) — every object that exists *today* keeps resolving
correctly through them, unchanged, **as long as it is read through the old
helpers** (which every admin-side surface listed above still uses). The
*admin-only* regression this plan introduces is cosmetic: from the moment
this plan ships, a **newly uploaded or replaced** image/file for a record
that is not yet (or no longer) `published` lands in the new `<kind>-drafts`
bucket (which has no public-read policy by design), so its thumbnail in an
admin list or edit drawer will show broken until a future plan (not written
yet — the natural next one after this) adds signed-URL resolution for
exactly those surfaces. Save, Publish, Archive, Restore and Delete all
round-trip the raw stored **path string**, never the resolved URL, so this
cosmetic gap cannot corrupt data, block a workflow, or leak anything.

**This does NOT extend to the public-facing query fixes, and that distinction
matters for deployment.** Every public query this plan touches switches from
`photoUrl(path)`/`documentUrl(path)` (old bucket, unconditionally correct
today) to `mediaUrl(publicBucketFor(kind), path)` (new bucket) — correctly,
because that is what stops a *newly published* object from 404ing. But an
**existing already-published** row's file still physically sits in
`public-media`/`public-documents` today; nothing has copied it into
`<kind>-media` yet. `scripts/migrate-media-buckets.mjs` (built in Plan 1) is
that copy step, and it has not been run against any real environment.

**Consequence: this plan's public-query changes must not reach a live
environment before `scripts/migrate-media-buckets.mjs` has been run there.**
Deployed on its own, ahead of the migration, every currently-published
image and document on the live public site — not just newly uploaded ones —
would 404 the moment each content type's task lands, because the public
query for that type would be asking a bucket that doesn't have the object
yet. This is a full public-facing regression, not the cosmetic admin-only one
above, and it is new information this plan did not originally call out
loudly enough. Whoever merges and deploys this branch (staging first, per
this project's migration discipline) must run the migration script as part
of that same deploy window, before or immediately after applying migration
`0028`, and before traffic hits the updated code — see the Risk section at
the end of this plan.

---

### Task 1: Officials + achievements — `media.ts` becomes status-aware, full lifecycle wiring

**Files:**
- Modify: `src/lib/media.ts`
- Modify: `src/features/admin/actions/officials.ts`
- Modify: `src/features/admin/actions/achievement-photos.ts`
- Modify: `src/features/admin/actions/achievements.ts`
- Modify: `src/features/officials/queries.ts`

**Interfaces:**
- Consumes: `MediaKind`, `bucketForStatus`, `SITE_MEDIA_BUCKET`,
  `AVATARS_MEDIA_BUCKET`, `mediaUrl`, `publicBucketFor`, `draftBucketFor` (all
  from `src/lib/storage.ts`, built in Plan 1); `promoteMedia`,
  `cleanupPromotedMedia`, `demoteMedia` (from `src/lib/media-lifecycle.ts`,
  built in Plan 1 — signatures: `promoteMedia(kind, paths):
  Promise<{error: string|null}>`, `cleanupPromotedMedia(kind, paths,
  context): Promise<void>`, `demoteMedia(kind, paths, context):
  Promise<void>`).
- Produces (for Tasks 2–3, 7 to consume unchanged):
  - `uploadSingleImage(folder: ImageFolder, status: ContentStatus | null, file: File): Promise<UploadResult>`
  - `removeStoredImage(folder: ImageFolder, status: ContentStatus | null, src: string): Promise<ActionResult>`
  - `discardImage(folder: ImageFolder, status: ContentStatus | null, src: string | null, context: string): Promise<void>`

- [ ] **Step 1: Make `media.ts`'s three exported functions status-aware**

In `src/lib/media.ts`, replace the imports and the three exported functions.
Replace:

```ts
import {
  ALLOWED_IMAGE_TYPES,
  FEEDBACK_MEDIA_BUCKET,
  MAX_IMAGE_BYTES,
  MAX_SCREENSHOT_BYTES,
  PUBLIC_MEDIA_BUCKET,
  extForType,
  feedbackScreenshotPath,
  photoUrl,
} from "@/lib/storage";
```

with:

```ts
import type { ContentStatus } from "@/types";
import {
  ALLOWED_IMAGE_TYPES,
  AVATARS_MEDIA_BUCKET,
  FEEDBACK_MEDIA_BUCKET,
  MAX_IMAGE_BYTES,
  MAX_SCREENSHOT_BYTES,
  SITE_MEDIA_BUCKET,
  bucketForStatus,
  extForType,
  feedbackScreenshotPath,
  mediaUrl,
} from "@/lib/storage";
```

(`PUBLIC_MEDIA_BUCKET` and `photoUrl` are no longer used by this file — every
remaining reference below is replaced. `documentUrl`/`PUBLIC_DOCUMENTS_BUCKET`
are a different file, untouched.)

Add, right after the `ImageFolder` type:

```ts
/**
 * `"site"`/`"avatars"` have no draft/published split (Save writes live for
 * both), so `status` is ignored for them — callers pass `null`. The other
 * three folders share their name with a `MediaKind`.
 */
function bucketForUpload(folder: ImageFolder, status: ContentStatus | null): string {
  if (folder === "site") return SITE_MEDIA_BUCKET;
  if (folder === "avatars") return AVATARS_MEDIA_BUCKET;
  return bucketForStatus(folder, status ?? "draft");
}
```

Replace `uploadSingleImage`:

```ts
export async function uploadSingleImage(
  folder: ImageFolder,
  status: ContentStatus | null,
  file: File,
): Promise<UploadResult> {
  if (file.size === 0) return { error: "Choose an image.", src: null, url: null };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { error: "Images must be JPG, PNG, or WebP.", src: null, url: null };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "The image must be 2 MB or smaller.", src: null, url: null };
  }

  const bucket = bucketForUpload(folder, status);
  const path = `${folder}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", src: null, url: null };

  return { error: null, src: path, url: mediaUrl(bucket, path) };
}
```

Replace `removeStoredImage`:

```ts
/** Delete an owned storage object. A remote seed URL is left alone. */
export async function removeStoredImage(
  folder: ImageFolder,
  status: ContentStatus | null,
  src: string,
): Promise<ActionResult> {
  if (/^https?:\/\//i.test(src)) return { error: null };
  if (!/^(announcements|events|officials|news|achievements|site|avatars)\//.test(src)) {
    return { error: "That image cannot be removed." };
  }
  if (src.split("/").some((segment) => segment === "..")) {
    return { error: "That image cannot be removed." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucketForUpload(folder, status)).remove([src]);
  if (error) return { error: "Could not remove the image." };
  return { error: null };
}
```

Replace `discardImage`:

```ts
export async function discardImage(
  folder: ImageFolder,
  status: ContentStatus | null,
  src: string | null,
  context: string,
): Promise<void> {
  if (!src) return;
  const { error } = await removeStoredImage(folder, status, src);
  if (error) console.error(`Orphaned storage object (${context}): ${src}`);
}
```

Leave `uploadFeedbackScreenshot`, `removeFeedbackScreenshot`,
`discardFeedbackScreenshot` untouched — `feedback-media` is out of scope for
this whole effort (Plan 1's design doc, "Non-goals").

- [ ] **Step 2: Wire `officials.ts`**

In `src/features/admin/actions/officials.ts`, update the imports:

```ts
import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";
import { discardImage, removeStoredImage, uploadSingleImage } from "@/lib/media";
```

becomes:

```ts
import { draftBucketFor } from "@/lib/storage";
import { discardImage, removeStoredImage, uploadSingleImage } from "@/lib/media";
import { cleanupPromotedMedia, demoteMedia, promoteMedia } from "@/lib/media-lifecycle";
```

In `saveOfficial`, the upload currently happens *before* the row is read, so
the current status isn't known yet. Restructure to read `existing` first when
editing:

Replace the block that currently reads (from `const admin =
createSupabaseAdminClient();` through the `nextPhotoPath`/`nextPhotoAlt`
lines, i.e. lines 117–142 today) with:

```ts
  const admin = createSupabaseAdminClient();
  const base = slugify(parsed.data.name);
  if (!base) return { error: "Enter a name with letters or numbers.", id: null };

  // The upload target depends on the record's CURRENT status (design: "if
  // it's already published, new files upload straight into <kind>-media").
  // For a brand-new official there is no current status yet — it will be
  // created as "draft", so that's what a new portrait uploads against.
  let currentStatus: ContentStatus = "draft";
  if (id) {
    const { data: statusRow, error: statusErr } = await admin
      .from("officials")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (statusErr) return { error: "Could not save the official.", id: null };
    if (!statusRow) return { error: "Official not found.", id: null };
    currentStatus = statusRow.status as ContentStatus;
  }

  // Upload first, then compensate on any later failure — see saveAnnouncement.
  const incoming = portraitForm.get("image");
  const removePortrait = portraitForm.get("removeImage") === "1";
  let uploadedPath: string | null = null;
  if (incoming instanceof File && incoming.size > 0) {
    const uploaded = await uploadSingleImage("officials", currentStatus, incoming);
    if (uploaded.error) return { error: uploaded.error, id: null };
    uploadedPath = uploaded.src;
  }

  async function fail(error: string): Promise<SaveResult> {
    if (uploadedPath) {
      const removed = await removeStoredImage("officials", currentStatus, uploadedPath);
      if (removed.error) {
        console.error(`Orphaned storage object (compensating delete failed): ${uploadedPath}`);
      }
    }
    return { error, id: null };
  }

  const nextPhotoPath = uploadedPath ?? (removePortrait ? null : parsed.data.photoPath);
  const nextPhotoAlt = nextPhotoPath ? parsed.data.photoAlt : "";
```

This makes one extra `select("status")` round trip on edit, which the `if
(id)` branch just below already repeats with more columns (`status, slug,
photo_path, published_at`) — leave that second read as-is (it needs
`published_at` for the slug lock, which the status-only read above doesn't
fetch); the small duplicate read is simpler and safer than threading the
first read's result through, since the two reads happen either side of the
new upload call.

Update `discardImage(oldPath, "portrait replaced")` (existing, inside the
`if (id)` branch) to `discardImage("officials", currentStatus, oldPath,
"portrait replaced")`.

No new type import is needed here — this file already has `import type {
ContentStatus, OfficialValues } from "@/types";` at the top.

Now wire promote/demote into `setOfficialStatus`. Replace the function body
(the whole function, since the read needs an extra column and two new
sections are inserted) with:

```ts
export async function setOfficialStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const actor = await checkPermission("manage-officials");
  if (!actor) return { error: NOT_FOUND };

  const statusResult = statusSchema.safeParse(status);
  if (!statusResult.success) {
    return { error: statusResult.error.issues[0]?.message ?? "Invalid status." };
  }
  const nextStatus = statusResult.data;

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("officials")
    .select("name, slug, status, photo_path, photo_alt, published_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Official not found." };

  const previousStatus = existing.status as ContentStatus;

  if (nextStatus === "published" && !existing.photo_path) {
    return { error: "Add a portrait before publishing this official." };
  }
  if (nextStatus === "published" && !(existing.photo_alt as string | null)?.trim()) {
    return {
      error: "Add a description (alt text) for the portrait before publishing this official.",
    };
  }

  // Achievement photos ride on the parent official's status — moved as one
  // batch alongside the portrait, never independently.
  const { data: achievements } = await admin
    .from("official_achievements")
    .select("id")
    .eq("official_id", id);
  const achievementIds = (achievements ?? []).map((a) => a.id as string);
  let achievementPhotoPaths: string[] = [];
  if (achievementIds.length > 0) {
    const { data: photos } = await admin
      .from("official_achievement_photos")
      .select("src")
      .in("achievement_id", achievementIds);
    achievementPhotoPaths = (photos ?? []).map((p) => p.src as string);
  }
  const portraitPath = existing.photo_path as string | null;
  const allPaths = portraitPath ? [portraitPath, ...achievementPhotoPaths] : achievementPhotoPaths;

  const promotingNow = nextStatus === "published" && previousStatus !== "published";
  if (promotingNow) {
    const promoted = await promoteMedia("officials", allPaths);
    if (promoted.error) {
      return { error: "Could not publish the official's photos. Try again." };
    }
  }

  const patch = statusPatch(actor, nextStatus);
  if (nextStatus === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("officials").update(patch).eq("id", id);
  if (error) return { error: "Could not update the official." };

  if (promotingNow) {
    await cleanupPromotedMedia("officials", allPaths, "official published");
  }
  if (nextStatus === "archived" && previousStatus === "published") {
    await demoteMedia("officials", allPaths, "official archived");
  }

  await recordActivity(actor, {
    type: auditTypeForStatus(nextStatus),
    action: `${nextStatus} official`,
    entityType: "official",
    entityId: id,
    entityLabel: existing.name as string,
  });
  revalidate(existing.slug as string);
  return { error: null };
}
```

Finally, in `deleteOfficial`, replace the two raw storage calls. Replace:

```ts
  if (achievementPhotoPaths.length > 0) {
    const { error: removeErr } = await admin.storage
      .from(PUBLIC_MEDIA_BUCKET)
      .remove(achievementPhotoPaths);
```

with:

```ts
  if (achievementPhotoPaths.length > 0) {
    const { error: removeErr } = await admin.storage
      .from(draftBucketFor("officials"))
      .remove(achievementPhotoPaths);
```

and replace:

```ts
  if (existing.photo_path) {
    const removed = await removeStoredImage(existing.photo_path);
```

with:

```ts
  if (existing.photo_path) {
    const removed = await removeStoredImage("officials", "archived", existing.photo_path);
```

(`guardDelete` only ever reaches here from `status = "archived"`, so both of
these are always removing from the private bucket — the invariant this whole
plan establishes.)

- [ ] **Step 3: Wire `achievement-photos.ts`**

Achievement photos ride on the **parent official's current status** — add a
helper and use it in both storage-touching functions. In
`src/features/admin/actions/achievement-photos.ts`, this file already has
`import type { GalleryPhoto } from "@/types";` at the top — change that one
line to `import type { ContentStatus, GalleryPhoto } from "@/types";` (adding
a second, separate `import type ... from "@/types"` statement would trip
this project's `import/no-duplicates` lint rule). Then update the
value-import block:

```ts
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  achievementPhotoPath,
  extForType,
  photoUrl,
} from "@/lib/storage";
```

becomes:

```ts
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  achievementPhotoPath,
  bucketForStatus,
  extForType,
  mediaUrl,
} from "@/lib/storage";
```

Add, near `currentPhotos`:

```ts
/** The status of the official that owns this achievement — decides the bucket. */
async function officialStatusForAchievement(
  admin: Admin,
  achievementId: string,
): Promise<ContentStatus | null> {
  const { data: achievement } = await admin
    .from("official_achievements")
    .select("official_id")
    .eq("id", achievementId)
    .maybeSingle();
  if (!achievement) return null;
  const { data: official } = await admin
    .from("officials")
    .select("status")
    .eq("id", achievement.official_id as string)
    .maybeSingle();
  return (official?.status as ContentStatus) ?? null;
}
```

In `uploadAchievementPhotos`, after the existing `achievement` lookup (the
`if (!achievement) return { error: "Achievement not found.", photos: [] };`
line), add:

```ts
  const officialStatus = await officialStatusForAchievement(admin, achievementId);
  if (!officialStatus) return { error: "Achievement not found.", photos: [] };
```

Replace the upload loop's `admin.storage.from(PUBLIC_MEDIA_BUCKET).upload(...)`
with `admin.storage.from(bucketForStatus("officials", officialStatus)).upload(...)`,
and the function's final `photoUrl(p.src as string)` with
`mediaUrl(bucketForStatus("officials", officialStatus), p.src as string)`.

In `removeAchievementPhoto`, after the existing `photo` lookup (the
`if (!photo) return { error: null };` line), add:

```ts
  const officialStatus = await officialStatusForAchievement(admin, photo.achievement_id as string);
```

Replace:

```ts
    const { error: removeErr } = await admin.storage
      .from(PUBLIC_MEDIA_BUCKET)
      .remove([photo.src as string]);
```

with:

```ts
    const { error: removeErr } = await admin.storage
      .from(bucketForStatus("officials", officialStatus ?? "archived"))
      .remove([photo.src as string]);
```

(`officialStatus` is only ever `null` here if the parent official row was
deleted between the photo lookup and this line — an unreachable-in-practice
race; falling back to `"archived"` — the private bucket — is the safe
direction to fail in, since removing from the wrong-but-private bucket just
leaves a harmless orphan rather than trying a bucket that might not have the
object either.)

`reorderAchievementPhotos` and `updateAchievementPhotoAlt` touch no storage
object — leave them untouched.

- [ ] **Step 4: Wire `achievements.ts`**

In `src/features/admin/actions/achievements.ts`, update the import:

```ts
import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";
```

becomes:

```ts
import { bucketForStatus } from "@/lib/storage";
```

In `deleteAchievement`, after `if (!existing) return { error: null };`, add:

```ts
  const { data: officialRow } = await admin
    .from("officials")
    .select("status")
    .eq("id", existing.official_id as string)
    .maybeSingle();
  const officialStatus = (officialRow?.status as ContentStatus) ?? "archived";
```

This file already has `import type { AchievementValues } from "@/types";` at
the top — change that one line to `import type { AchievementValues,
ContentStatus } from "@/types";` (a second, separate `import type ... from
"@/types"` statement would trip this project's `import/no-duplicates` lint
rule). Replace:

```ts
  if (paths.length > 0) {
    const { error: removeErr } = await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove(paths);
```

with:

```ts
  if (paths.length > 0) {
    const { error: removeErr } = await admin.storage
      .from(bucketForStatus("officials", officialStatus))
      .remove(paths);
```

- [ ] **Step 5: Fix the public officials queries**

In `src/features/officials/queries.ts` — every function here already filters
`.eq("status", "published")`, so the public bucket is always correct. Update
the import:

```ts
import { photoUrl } from "@/lib/storage";
```

to:

```ts
import { mediaUrl, publicBucketFor } from "@/lib/storage";
```

In `toListItem`, replace:

```ts
    photoUrl: photoUrl(row.photo_path as string),
```

with:

```ts
    photoUrl: mediaUrl(publicBucketFor("officials"), row.photo_path as string),
```

In `getPublishedOfficialBySlug`, replace:

```ts
        .map((photo) => ({ id: photo.id, src: photoUrl(photo.src), alt: photo.alt })),
```

with:

```ts
        .map((photo) => ({
          id: photo.id,
          src: mediaUrl(publicBucketFor("officials"), photo.src),
          alt: photo.alt,
        })),
```

(Achievement photos are embedded and filtered by `is_visible`/non-empty
`title` above this, but the *parent* official row is already filtered to
`status = "published"` by the outer query, so `publicBucketFor("officials")`
is unconditionally correct here too — an achievement's photo can only ever be
promoted alongside its official, per Task 1's `setOfficialStatus` batch.)

`src/features/admin/queries/officials.ts` and
`src/features/admin/queries/achievements.ts` are **left untouched** — see
"Explicit scope boundary" above.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/media.ts src/features/admin/actions/officials.ts src/features/admin/actions/achievement-photos.ts src/features/admin/actions/achievements.ts src/features/officials/queries.ts
git commit -m "feat: wire officials media through per-status buckets"
```

---

### Task 2: Events

**Files:**
- Modify: `src/features/admin/actions/events.ts`
- Modify: `src/features/events/queries.ts`

**Interfaces:**
- Consumes: `uploadSingleImage`/`removeStoredImage`/`discardImage` (now
  status-aware, from Task 1); `promoteMedia`/`cleanupPromotedMedia`/
  `demoteMedia` from `@/lib/media-lifecycle`; `draftBucketFor`, `mediaUrl`,
  `publicBucketFor` from `@/lib/storage`.

- [ ] **Step 1: Restructure `saveEvent` to read status before uploading**

In `src/features/admin/actions/events.ts`, update the imports — add
`draftBucketFor` is not needed here (delete uses it inline, see Step 2), so
just add the media-lifecycle import:

```ts
import { cleanupPromotedMedia, demoteMedia, promoteMedia } from "@/lib/media-lifecycle";
```

Replace the block from `const admin = createSupabaseAdminClient();` through
the `nextCoverAlt` line with:

```ts
  const admin = createSupabaseAdminClient();

  let currentStatus: ContentStatus = "draft";
  if (id) {
    const { data: statusRow, error: statusErr } = await admin
      .from("events")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (statusErr) return { error: "Could not save the event.", id: null };
    if (!statusRow) return { error: "Event not found.", id: null };
    currentStatus = statusRow.status as ContentStatus;
  }

  // Upload first, then compensate on any later failure — see saveAnnouncement.
  const incoming = coverForm.get("image");
  const removeCover = coverForm.get("removeImage") === "1";
  let uploadedPath: string | null = null;
  if (incoming instanceof File && incoming.size > 0) {
    const uploaded = await uploadSingleImage("events", currentStatus, incoming);
    if (uploaded.error) return { error: uploaded.error, id: null };
    uploadedPath = uploaded.src;
  }

  async function fail(error: string): Promise<SaveResult> {
    if (uploadedPath) {
      const removed = await removeStoredImage("events", currentStatus, uploadedPath);
      if (removed.error) {
        console.error(`Orphaned storage object (compensating delete failed): ${uploadedPath}`);
      }
    }
    return { error, id: null };
  }

  const nextCoverSrc = uploadedPath ?? (removeCover ? null : parsed.data.coverSrc);
  const nextCoverAlt = nextCoverSrc ? parsed.data.coverAlt : "";
```

The `if (id)` branch just below re-reads `cover_src` (a different column than
the status-only read above) — leave that read as-is; update its
`discardImage(previous, "event cover replaced")` call to
`discardImage("events", currentStatus, previous, "event cover replaced")`.

- [ ] **Step 2: Wire publish/archive/delete**

Replace `publishEvent`'s body (needs `status` added to its `select`, plus
promote/cleanup around the update):

```ts
export async function publishEvent(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("events")
    .select("published_at, title, event_date, start_time, venue, cover_src, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: "Could not publish the event." };
  if (!row) return { error: "Event not found." };
  if (!row.title?.trim() || !row.event_date || !row.start_time?.trim() || !row.venue?.trim()) {
    return { error: "Add a title, date, start time, and venue before publishing." };
  }

  const alreadyPublished = row.status === "published";
  const coverPath = row.cover_src as string | null;
  if (!alreadyPublished && coverPath) {
    const promoted = await promoteMedia("events", [coverPath]);
    if (promoted.error) return { error: "Could not publish the event's cover photo. Try again." };
  }

  const patch = statusPatch(actor, "published");
  if (!row.published_at) patch.published_at = new Date().toISOString();
  const { data, error } = await admin
    .from("events")
    .update(patch)
    .eq("id", id)
    .in("status", ["draft", "in-review", "archived"])
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not publish the event." };
  if (!data) return { error: "This event is already published." };

  if (!alreadyPublished && coverPath) {
    await cleanupPromotedMedia("events", [coverPath], "event published");
  }

  await recordActivity(actor, {
    type: "publish",
    action: "published event",
    entityType: "event",
    entityId: id,
    entityLabel: row.title,
  });
  revalidate();
  return { error: null };
}
```

Replace `archiveEvent` (no longer delegates to `applyTransition`, so it can
learn the previous status atomically):

```ts
export async function archiveEvent(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const patch = statusPatch(actor, "archived");

  // Try the published→archived branch first: a row has exactly one status,
  // so at most one of these two guarded updates ever matches, and which one
  // matched tells us — atomically, no separate read-then-write race — whether
  // the cover needs to move back into the private bucket.
  let result: { id: string; title: string; cover_src: string | null } | null = null;
  let wasPublished = false;
  {
    const { data, error } = await admin
      .from("events")
      .update(patch)
      .eq("id", id)
      .eq("status", "published")
      .select("id, title, cover_src")
      .maybeSingle();
    if (error) return { error: "Could not update the event." };
    if (data) {
      result = data;
      wasPublished = true;
    }
  }
  if (!result) {
    const { data, error } = await admin
      .from("events")
      .update(patch)
      .eq("id", id)
      .in("status", ["draft", "in-review"])
      .select("id, title, cover_src")
      .maybeSingle();
    if (error) return { error: "Could not update the event." };
    result = data;
  }
  if (!result) return { error: "This event is no longer in a state that allows that action." };

  if (wasPublished && result.cover_src) {
    await demoteMedia("events", [result.cover_src], "event archived");
  }

  await recordActivity(actor, {
    type: "archive",
    action: "archived event",
    entityType: "event",
    entityId: id,
    entityLabel: result.title,
  });
  revalidate();
  return { error: null };
}
```

In `deleteEvent`, replace `await discardImage(existing.cover_src, "event
deleted");` with `await discardImage("events", "archived", existing.cover_src,
"event deleted");` (`guardDelete` only reaches here from `archived`).

- [ ] **Step 3: Fix the public events query**

In `src/features/events/queries.ts`, update the import:

```ts
import { photoUrl } from "@/lib/storage";
```

to:

```ts
import { mediaUrl, publicBucketFor } from "@/lib/storage";
```

In `toCommunityEvent`, replace:

```ts
    image: r.cover_src ? photoUrl(r.cover_src) : undefined,
```

with:

```ts
    image: r.cover_src ? mediaUrl(publicBucketFor("events"), r.cover_src) : undefined,
```

(Every function in this file already filters `.eq("status", "published")`.)
`src/features/admin/queries/events.ts` is left untouched.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions/events.ts src/features/events/queries.ts
git commit -m "feat: wire events media through per-status buckets"
```

---

### Task 3: Announcements

**Files:**
- Modify: `src/features/admin/actions/announcements.ts`
- Modify: `src/features/announcements/queries.ts` (announcement-related
  functions only — the news-related functions in this same file are Task 4's)

**Interfaces:** same as Task 2, kind `"announcements"`.

- [ ] **Step 1: Restructure `saveAnnouncement` to read status before uploading**

In `src/features/admin/actions/announcements.ts`, add the import:

```ts
import { cleanupPromotedMedia, demoteMedia, promoteMedia } from "@/lib/media-lifecycle";
```

Replace the block from `const admin = createSupabaseAdminClient();` through
the `nextImageAlt` line with:

```ts
  const admin = createSupabaseAdminClient();

  let currentStatus: ContentStatus = "draft";
  if (id) {
    const { data: statusRow, error: statusErr } = await admin
      .from("announcements")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (statusErr) return { error: "Could not save the announcement.", id: null };
    if (!statusRow) return { error: "Announcement not found.", id: null };
    currentStatus = statusRow.status as ContentStatus;
  }

  // Upload a newly chosen image up front — the only side effect before the row
  // write, so every failure past this point must delete the object it just
  // created. `fail()` does that.
  const incoming = imageForm.get("image");
  const removeImage = imageForm.get("removeImage") === "1";
  let uploadedPath: string | null = null;
  if (incoming instanceof File && incoming.size > 0) {
    const uploaded = await uploadSingleImage("announcements", currentStatus, incoming);
    if (uploaded.error) return { error: uploaded.error, id: null };
    uploadedPath = uploaded.src;
  }

  async function fail(error: string): Promise<SaveResult> {
    if (uploadedPath) {
      const removed = await removeStoredImage("announcements", currentStatus, uploadedPath);
      if (removed.error) {
        console.error(`Orphaned storage object (compensating delete failed): ${uploadedPath}`);
      }
    }
    return { error, id: null };
  }

  // A new upload wins; an explicit remove clears the slot; otherwise the stored
  // value carries through untouched.
  const nextImageSrc = uploadedPath ?? (removeImage ? null : parsed.data.imageSrc);
  const nextImageAlt = nextImageSrc ? parsed.data.imageAlt : "";
```

The `if (id)` branch's existing read (`image_src, status, slug`) already has
`status` — the extra status-only read above is a small duplicate, same
tradeoff as Task 1/2. Update its `discardImage(previous, "announcement image
replaced")` call to `discardImage("announcements", currentStatus, previous,
"announcement image replaced")`.

- [ ] **Step 2: Wire publish/archive/delete**

Replace `publishAnnouncement`:

```ts
export async function publishAnnouncement(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("announcements")
    .select("published_at, title, excerpt, image_src, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: "Could not publish the announcement." };
  if (!row) return { error: "Announcement not found." };
  if (!row.excerpt?.trim()) return { error: "Add an excerpt before publishing." };

  const alreadyPublished = row.status === "published";
  const imagePath = row.image_src as string | null;
  if (!alreadyPublished && imagePath) {
    const promoted = await promoteMedia("announcements", [imagePath]);
    if (promoted.error) return { error: "Could not publish the announcement's image. Try again." };
  }

  const patch = statusPatch(actor, "published");
  if (!row.published_at) patch.published_at = new Date().toISOString();
  const { data, error } = await admin
    .from("announcements")
    .update(patch)
    .eq("id", id)
    .in("status", ["draft", "in-review", "archived"])
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not publish the announcement." };
  if (!data) return { error: "This announcement is already published." };

  if (!alreadyPublished && imagePath) {
    await cleanupPromotedMedia("announcements", [imagePath], "announcement published");
  }

  await recordActivity(actor, {
    type: "publish",
    action: "published announcement",
    entityType: "announcement",
    entityId: id,
    entityLabel: row.title,
  });
  revalidate();
  return { error: null };
}
```

Replace `archiveAnnouncement`:

```ts
export async function archiveAnnouncement(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const patch = statusPatch(actor, "archived");

  let result: { id: string; title: string; image_src: string | null } | null = null;
  let wasPublished = false;
  {
    const { data, error } = await admin
      .from("announcements")
      .update(patch)
      .eq("id", id)
      .eq("status", "published")
      .select("id, title, image_src")
      .maybeSingle();
    if (error) return { error: "Could not update the announcement." };
    if (data) {
      result = data;
      wasPublished = true;
    }
  }
  if (!result) {
    const { data, error } = await admin
      .from("announcements")
      .update(patch)
      .eq("id", id)
      .in("status", ["draft", "in-review"])
      .select("id, title, image_src")
      .maybeSingle();
    if (error) return { error: "Could not update the announcement." };
    result = data;
  }
  if (!result) {
    return { error: "This announcement is no longer in a state that allows that action." };
  }

  if (wasPublished && result.image_src) {
    await demoteMedia("announcements", [result.image_src], "announcement archived");
  }

  await recordActivity(actor, {
    type: "archive",
    action: "archived announcement",
    entityType: "announcement",
    entityId: id,
    entityLabel: result.title,
  });
  revalidate();
  return { error: null };
}
```

In `deleteAnnouncement`, replace `await discardImage(existing.image_src,
"announcement deleted");` with `await discardImage("announcements",
"archived", existing.image_src, "announcement deleted");`.

- [ ] **Step 3: Fix the public announcements query**

In `src/features/announcements/queries.ts`, this file's import line is shared
with Task 4 (the news-related functions in this same file still call
`photoUrl` until that task lands). Change it **additively** — keep `photoUrl`
so the file still compiles regardless of which of Tasks 3/4 lands first —
from:

```ts
import { photoUrl } from "@/lib/storage";
```

to:

```ts
import { mediaUrl, photoUrl, publicBucketFor } from "@/lib/storage";
```

(Task 4 is the one that removes `photoUrl` from this line, once its own
edits are the last thing in the file still calling it.)

In `toAnnouncement`, replace:

```ts
    image: row.image_src ? photoUrl(row.image_src) : undefined,
```

with:

```ts
    image: row.image_src ? mediaUrl(publicBucketFor("announcements"), row.image_src) : undefined,
```

Leave `toListItem`'s `photoUrl(cover.src)` call (the news-kind function in
this same file) for Task 4 to change — `photoUrl` stays imported (see Step 3)
so this line keeps compiling regardless of task order. `src/features/admin/
queries/announcements.ts` is left untouched.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean — this task is self-contained regardless of whether
Task 4 has landed yet, because Step 3 keeps `photoUrl` imported for the
news-kind functions this task doesn't touch.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions/announcements.ts src/features/announcements/queries.ts
git commit -m "feat: wire announcements media through per-status buckets"
```

---

### Task 4: News

**Files:**
- Modify: `src/features/admin/actions/news.ts`
- Modify: `src/features/admin/actions/news-photos.ts`
- Modify: `src/features/announcements/queries.ts` (news-related functions —
  see Task 3's note; this task's import-line edit and Task 3's must land
  together)

**Interfaces:**
- Consumes: `bucketForStatus`, `draftBucketFor`, `mediaUrl`,
  `publicBucketFor` from `@/lib/storage`; `promoteMedia`,
  `cleanupPromotedMedia`, `demoteMedia` from `@/lib/media-lifecycle`. News
  photos upload through their own direct `admin.storage` calls (via
  `newsPhotoPath`), not through `media.ts` — Task 1 does not affect this file.

- [ ] **Step 1: Wire `news.ts`**

Update the imports — replace:

```ts
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  extForType,
  newsPhotoPath,
  photoUrl,
} from "@/lib/storage";
```

with:

```ts
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  bucketForStatus,
  draftBucketFor,
  extForType,
  mediaUrl,
  newsPhotoPath,
} from "@/lib/storage";
import { cleanupPromotedMedia, demoteMedia, promoteMedia } from "@/lib/media-lifecycle";
```

(`publicBucketFor` is not called directly in this file — the public-facing
`mediaUrl(publicBucketFor("news"), ...)` calls this task also makes are in
`src/features/announcements/queries.ts`, which imports it separately.)

`attachPendingPhotos` needs to know the article's current status. Change its
signature and body:

```ts
async function attachPendingPhotos(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  articleId: string,
  status: ContentStatus,
  files: File[],
  alts: string[],
): Promise<{ error: string | null }> {
  if (files.length === 0) return { error: null };

  const bucket = bucketForStatus("news", status);

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { error: "Photos must be JPG, PNG, or WebP." };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: "Each photo must be 2 MB or smaller." };
    }
  }

  const { data: existing, error: readErr } = await admin
    .from("news_photos")
    .select("id, sort_order")
    .eq("article_id", articleId);
  if (readErr) return { error: "Could not attach the photos." };
  if ((existing ?? []).length + files.length > MAX_PHOTOS) {
    return { error: `A post can have at most ${MAX_PHOTOS} photos.` };
  }

  const paths: string[] = [];
  const rowIds: string[] = [];

  async function rollback(message: string): Promise<{ error: string }> {
    if (rowIds.length > 0) {
      await admin.from("news_photos").delete().in("id", rowIds);
    }
    if (paths.length > 0) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) {
        console.error(`Orphaned storage objects (photo rollback failed): ${paths.join(", ")}`);
      }
    }
    return { error: message };
  }

  let sortOrder = (existing ?? []).reduce(
    (max, p) => Math.max(max, p.sort_order as number),
    -1,
  );
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = newsPhotoPath(articleId, extForType(file.type));
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(bucket)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return rollback("Could not upload the photos. Try again.");
    paths.push(path);

    sortOrder += 1;
    const { data: row, error: insErr } = await admin
      .from("news_photos")
      .insert({ article_id: articleId, src: path, alt: alts[i] ?? "", sort_order: sortOrder })
      .select("id")
      .single();
    if (insErr || !row) return rollback("Could not attach the photos. Try again.");
    rowIds.push(row.id as string);
  }

  return { error: null };
}
```

`listPhotos` calls `photoUrl(p.src as string)` — this is consumed by
`saveNewsArticle`'s return value, which the admin drawer uses to show the
photos it just saved this session (not the general edit-drawer load, which
is `getNewsArticleForEdit`, already in the deferred scope boundary). Since
`saveNewsArticle` always knows the article's status at this point (either
just-inserted `"draft"`, or `existing.status`/the just-applied status), this
one **is** in scope — leave `listPhotos` itself unparameterized but change
its one call site (see below) to pass the resolved bucket in, OR simplest:
change `listPhotos` to take a `status: ContentStatus` parameter mirroring
`attachPendingPhotos`:

```ts
async function listPhotos(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  articleId: string,
  status: ContentStatus,
): Promise<GalleryPhoto[]> {
  const { data } = await admin
    .from("news_photos")
    .select("id, src, alt")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true });
  const bucket = bucketForStatus("news", status);
  return (data ?? []).map((p) => ({
    id: p.id as string,
    src: mediaUrl(bucket, p.src as string),
    alt: p.alt as string,
  }));
}
```

In `saveNewsArticle`'s edit branch (`if (id) { ... }`), the existing read
already selects `status, slug` — no new read needed. Change the two calls at
the bottom of that branch:

```ts
    const attached = await attachPendingPhotos(admin, id, files, alts);
    revalidate();
    if (attached.error) return savedWithoutPhotos(id, attached.error);
    return { error: null, id, photos: files.length > 0 ? await listPhotos(admin, id) : null };
```

to:

```ts
    const attached = await attachPendingPhotos(admin, id, existing.status as ContentStatus, files, alts);
    revalidate();
    if (attached.error) return savedWithoutPhotos(id, attached.error);
    return {
      error: null,
      id,
      photos: files.length > 0 ? await listPhotos(admin, id, existing.status as ContentStatus) : null,
    };
```

In the create branch (bottom of the function), the new row is always
inserted with `status: "draft"` — change:

```ts
  const attached = await attachPendingPhotos(admin, inserted.id, files, alts);
  revalidate();
  if (attached.error) return savedWithoutPhotos(inserted.id, attached.error);
  return {
    error: null,
    id: inserted.id,
    photos: files.length > 0 ? await listPhotos(admin, inserted.id) : null,
  };
```

to:

```ts
  const attached = await attachPendingPhotos(admin, inserted.id, "draft", files, alts);
  revalidate();
  if (attached.error) return savedWithoutPhotos(inserted.id, attached.error);
  return {
    error: null,
    id: inserted.id,
    photos: files.length > 0 ? await listPhotos(admin, inserted.id, "draft") : null,
  };
```

Replace `publishNewsArticle`:

```ts
export async function publishNewsArticle(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("news_articles")
    .select("published_at, title, excerpt, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: "Could not publish the article." };
  if (!row) return { error: "Article not found." };
  if (!row.excerpt?.trim()) return { error: "Add an excerpt before publishing." };

  const alreadyPublished = row.status === "published";
  let photoPaths: string[] = [];
  if (!alreadyPublished) {
    const { data: photos } = await admin.from("news_photos").select("src").eq("article_id", id);
    photoPaths = (photos ?? []).map((p) => p.src as string);
    if (photoPaths.length > 0) {
      const promoted = await promoteMedia("news", photoPaths);
      if (promoted.error) return { error: "Could not publish the article's photos. Try again." };
    }
  }

  const patch = statusPatch(actor, "published");
  if (!row.published_at) patch.published_at = new Date().toISOString();
  const { data, error } = await admin
    .from("news_articles")
    .update(patch)
    .eq("id", id)
    .in("status", ["draft", "in-review", "archived"])
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not publish the article." };
  if (!data) return { error: "This article is already published." };

  if (!alreadyPublished && photoPaths.length > 0) {
    await cleanupPromotedMedia("news", photoPaths, "news article published");
  }

  await recordActivity(actor, {
    type: "publish",
    action: "published news article",
    entityType: "news article",
    entityId: id,
    entityLabel: row.title,
  });
  revalidate();
  return { error: null };
}
```

Replace `archiveNewsArticle`:

```ts
export async function archiveNewsArticle(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const patch = statusPatch(actor, "archived");

  let result: { id: string; title: string } | null = null;
  let wasPublished = false;
  {
    const { data, error } = await admin
      .from("news_articles")
      .update(patch)
      .eq("id", id)
      .eq("status", "published")
      .select("id, title")
      .maybeSingle();
    if (error) return { error: "Could not update the article." };
    if (data) {
      result = data;
      wasPublished = true;
    }
  }
  if (!result) {
    const { data, error } = await admin
      .from("news_articles")
      .update(patch)
      .eq("id", id)
      .in("status", ["draft", "in-review"])
      .select("id, title")
      .maybeSingle();
    if (error) return { error: "Could not update the article." };
    result = data;
  }
  if (!result) return { error: "This article is no longer in a state that allows that action." };

  if (wasPublished) {
    const { data: photos } = await admin.from("news_photos").select("src").eq("article_id", id);
    const paths = (photos ?? []).map((p) => p.src as string);
    if (paths.length > 0) {
      await demoteMedia("news", paths, "news article archived");
    }
  }

  await recordActivity(actor, {
    type: "archive",
    action: "archived news article",
    entityType: "news article",
    entityId: id,
    entityLabel: result.title,
  });
  revalidate();
  return { error: null };
}
```

In `deleteNewsArticle`, replace:

```ts
  if (paths.length > 0) {
    const { error: removeErr } = await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove(paths);
```

with:

```ts
  if (paths.length > 0) {
    const { error: removeErr } = await admin.storage.from(draftBucketFor("news")).remove(paths);
```

(`guardDelete` only reaches here from `archived`.)

- [ ] **Step 2: Wire `news-photos.ts`**

`removeNewsPhoto` deletes an existing photo of an article that could be in
any status — it needs the article's current status. Update the import:

```ts
import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";
```

to:

```ts
import { bucketForStatus } from "@/lib/storage";
```

Replace the read and delete inside `removeNewsPhoto`:

```ts
  const { data: photo, error: readErr } = await admin
    .from("news_photos")
    .select("id, src, article_id")
    .eq("id", photoId)
    .maybeSingle();
  if (readErr) return { error: "Could not remove the photo." };
  if (!photo) return { error: null }; // already gone

  const { error } = await admin.from("news_photos").delete().eq("id", photoId);
  if (error) return { error: "Could not remove the photo." };

  // Only once the row is gone: an object deleted ahead of a failed row delete
  // would leave a live photo row pointing at nothing. Only delete an object we
  // own (uploaded path), never a seed URL.
  if (!/^https?:\/\//i.test(photo.src)) {
    const { error: removeErr } = await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove([photo.src]);
    if (removeErr) {
      console.error(`Orphaned storage object (news photo cleanup failed): ${photo.src}`);
    }
  }
```

with:

```ts
  const { data: photo, error: readErr } = await admin
    .from("news_photos")
    .select("id, src, article_id, news_articles!inner(status)")
    .eq("id", photoId)
    .maybeSingle();
  if (readErr) return { error: "Could not remove the photo." };
  if (!photo) return { error: null }; // already gone

  const { error } = await admin.from("news_photos").delete().eq("id", photoId);
  if (error) return { error: "Could not remove the photo." };

  // Only once the row is gone: an object deleted ahead of a failed row delete
  // would leave a live photo row pointing at nothing. Only delete an object we
  // own (uploaded path), never a seed URL.
  if (!/^https?:\/\//i.test(photo.src)) {
    const articleStatus = (photo.news_articles as unknown as { status: ContentStatus }).status;
    const { error: removeErr } = await admin.storage
      .from(bucketForStatus("news", articleStatus))
      .remove([photo.src]);
    if (removeErr) {
      console.error(`Orphaned storage object (news photo cleanup failed): ${photo.src}`);
    }
  }
```

Add `import type { ContentStatus } from "@/types";` to the top of the file.
`reorderNewsPhotos` and `updateNewsPhotoAlt` touch no storage object — leave
them untouched.

- [ ] **Step 3: Fix the public news queries**

In `src/features/announcements/queries.ts` (shared with Task 3, which already
changed the import line to `import { mediaUrl, photoUrl, publicBucketFor }
from "@/lib/storage";` — if Task 3 has not landed yet when this task is
worked, make that same import change here first). In `toListItem` (the
news-kind one, near the top of the file), replace:

```ts
    coverSrc: cover ? photoUrl(cover.src) : null,
```

with:

```ts
    coverSrc: cover ? mediaUrl(publicBucketFor("news"), cover.src) : null,
```

In `getPublishedArticleBySlug`, replace:

```ts
  const photos = [...row.news_photos]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ id: p.id, src: photoUrl(p.src), alt: p.alt }));
```

with:

```ts
  const photos = [...row.news_photos]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ id: p.id, src: mediaUrl(publicBucketFor("news"), p.src), alt: p.alt }));
```

(Both functions already filter `.eq("status", "published")`.)
`src/features/admin/queries/news.ts` is left untouched.

Once these two edits land, check whether `photoUrl` is still referenced
anywhere else in `src/features/announcements/queries.ts` (it is used only by
these two news functions and Task 3's `toAnnouncement` — Task 3 already moved
`toAnnouncement` off it). If Task 3 has already landed, `photoUrl` is now
unused in this file — drop it from the import line (`import { mediaUrl,
publicBucketFor } from "@/lib/storage";`). If Task 3 has not landed yet,
leave `photoUrl` in the import for Task 3's still-unconverted `toAnnouncement`
to keep using, and let Task 3 be the one to drop it once it lands.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean — this task is self-contained regardless of task order,
per the import-line handling above.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions/news.ts src/features/admin/actions/news-photos.ts src/features/announcements/queries.ts
git commit -m "feat: wire news media through per-status buckets"
```

---

### Task 5: Legislative — `documents.ts` becomes status-aware, full lifecycle wiring

**Files:**
- Modify: `src/features/admin/actions/documents.ts`
- Modify: `src/features/admin/actions/legislative.ts`
- Modify: `src/features/transparency/queries.ts` (legislative-related
  functions only — `listRecentLegislative`, `searchLegislative`,
  `getPublishedLegislativeBySlug`, `toListItem`; `filesByOwner` and the
  transparency-documents/projects functions are Task 6's)

**Interfaces:**
- Consumes: `bucketForStatus`, `draftBucketFor`, `mediaUrl`,
  `publicBucketFor` from `@/lib/storage`; `promoteMedia`,
  `cleanupPromotedMedia`, `demoteMedia` from `@/lib/media-lifecycle`.
- Produces (for Task 6 to consume unchanged):
  - `uploadDocumentPdf(folder: "legislative" | "documents", status: ContentStatus, formData: FormData): Promise<UploadDocumentResult>`
  - `uploadTransparencyFile(folder: "documents" | "projects", status: ContentStatus, formData: FormData): Promise<UploadFileResult>`
  - `removeStoredDocument(kind: "legislative" | "transparency", status: ContentStatus, path: string): Promise<ActionResult>`

- [ ] **Step 1: Make `documents.ts`'s three exported functions status-aware**

Update the imports — replace:

```ts
import {
  ALLOWED_DOC_FILE_TYPES,
  ALLOWED_PDF_TYPES,
  MAX_DOC_FILE_BYTES,
  MAX_PDF_BYTES,
  PUBLIC_DOCUMENTS_BUCKET,
  documentUrl,
  extForDocType,
} from "@/lib/storage";
```

with:

```ts
import type { ContentStatus } from "@/types";
import {
  ALLOWED_DOC_FILE_TYPES,
  ALLOWED_PDF_TYPES,
  MAX_DOC_FILE_BYTES,
  MAX_PDF_BYTES,
  bucketForStatus,
  extForDocType,
  mediaUrl,
} from "@/lib/storage";
```

Replace `uploadDocumentPdf`'s signature and bucket/URL lines:

```ts
export async function uploadDocumentPdf(
  folder: "legislative" | "documents",
  status: ContentStatus,
  formData: FormData,
): Promise<UploadDocumentResult> {
```

(body unchanged down to the upload call), then replace:

```ts
  const path = `${folder}/${crypto.randomUUID()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(PUBLIC_DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (error) return { error: "Upload failed. Try again.", path: null, url: null, sizeBytes: null };

  return { error: null, path, url: documentUrl(path), sizeBytes: file.size };
```

with:

```ts
  const bucket = bucketForStatus(folder === "legislative" ? "legislative" : "transparency", status);
  const path = `${folder}/${crypto.randomUUID()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (error) return { error: "Upload failed. Try again.", path: null, url: null, sizeBytes: null };

  return { error: null, path, url: mediaUrl(bucket, path), sizeBytes: file.size };
```

Replace `uploadTransparencyFile`'s signature:

```ts
export async function uploadTransparencyFile(
  folder: "documents" | "projects",
  status: ContentStatus,
  formData: FormData,
): Promise<UploadFileResult> {
```

and its upload call:

```ts
  const path = `${folder}/${crypto.randomUUID()}.${extForDocType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(PUBLIC_DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
```

becomes:

```ts
  const bucket = bucketForStatus("transparency", status);
  const path = `${folder}/${crypto.randomUUID()}.${extForDocType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: false });
```

Replace `removeStoredDocument`'s signature and bucket line:

```ts
export async function removeStoredDocument(
  kind: "legislative" | "transparency",
  status: ContentStatus,
  path: string,
): Promise<ActionResult> {
  if (!(await checkPermission("manage-transparency"))) return { error: NOT_FOUND };
  if (/^https?:\/\//i.test(path)) return { error: null };
  if (!/^(legislative|documents|projects)\//.test(path)) {
    return { error: "That file cannot be removed." };
  }
  if (path.split("/").some((segment) => segment === "..")) {
    return { error: "That file cannot be removed." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucketForStatus(kind, status)).remove([path]);
  if (error) return { error: "Could not remove the file." };
  return { error: null };
}
```

- [ ] **Step 2: Wire `legislative.ts`**

Update the import:

```ts
import { removeStoredDocument, uploadDocumentPdf } from "./documents";
```

stays the same name-wise; add:

```ts
import { cleanupPromotedMedia, demoteMedia, promoteMedia } from "@/lib/media-lifecycle";
```

(`bucketForStatus`/`draftBucketFor` are not called directly in this file —
every bucket lookup goes through `uploadDocumentPdf`/`removeStoredDocument`,
which now resolve the bucket internally from the `status` argument, or
through `promoteMedia`/`cleanupPromotedMedia`/`demoteMedia`.)

In `saveLegislative`, the upload already happens before any status read.
Replace:

```ts
  const admin = createSupabaseAdminClient();
  const base = slugify(`${number} ${parsed.data.title}`);
  if (!base) return { error: "Enter a number and title with letters or numbers.", id: null };

  // Upload a newly chosen file (if any) up front — this is the only side
  // effect in this action before the row write below, so every failure past
  // this point must delete the object it just created. `fail()` does that.
  const incomingFile = fileForm.get("file");
  const removeFile = fileForm.get("removeFile") === "1";
  let uploadedPath: string | null = null;
  let uploadedSize: number | null = null;
  if (incomingFile instanceof File && incomingFile.size > 0) {
    const uploadFd = new FormData();
    uploadFd.append("file", incomingFile);
    const uploadResult = await uploadDocumentPdf("legislative", uploadFd);
    if (uploadResult.error) return { error: uploadResult.error, id: null };
    uploadedPath = uploadResult.path;
    uploadedSize = uploadResult.sizeBytes;
  }

  async function fail(error: string): Promise<SaveResult> {
    if (uploadedPath) {
      const removed = await removeStoredDocument(uploadedPath);
```

with:

```ts
  const admin = createSupabaseAdminClient();
  const base = slugify(`${number} ${parsed.data.title}`);
  if (!base) return { error: "Enter a number and title with letters or numbers.", id: null };

  let currentStatus: ContentStatus = "draft";
  if (id) {
    const { data: statusRow, error: statusErr } = await admin
      .from("legislative_documents")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (statusErr) return { error: "Could not save the document.", id: null };
    if (!statusRow) return { error: "Document not found.", id: null };
    currentStatus = statusRow.status as ContentStatus;
  }

  // Upload a newly chosen file (if any) up front — this is the only side
  // effect in this action before the row write below, so every failure past
  // this point must delete the object it just created. `fail()` does that.
  const incomingFile = fileForm.get("file");
  const removeFile = fileForm.get("removeFile") === "1";
  let uploadedPath: string | null = null;
  let uploadedSize: number | null = null;
  if (incomingFile instanceof File && incomingFile.size > 0) {
    const uploadFd = new FormData();
    uploadFd.append("file", incomingFile);
    const uploadResult = await uploadDocumentPdf("legislative", currentStatus, uploadFd);
    if (uploadResult.error) return { error: uploadResult.error, id: null };
    uploadedPath = uploadResult.path;
    uploadedSize = uploadResult.sizeBytes;
  }

  async function fail(error: string): Promise<SaveResult> {
    if (uploadedPath) {
      const removed = await removeStoredDocument("legislative", currentStatus, uploadedPath);
```

Update the deferred-delete call inside the `if (id)` branch — replace `await
removeStoredDocument(oldPath);` with `await removeStoredDocument("legislative",
currentStatus, oldPath);`.

Replace `setLegislativeStatus`'s body:

```ts
export async function setLegislativeStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return { error: NOT_FOUND };

  const statusResult = statusSchema.safeParse(status);
  if (!statusResult.success) {
    return { error: statusResult.error.issues[0]?.message ?? "Invalid status." };
  }
  const nextStatus = statusResult.data;

  const admin = createSupabaseAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("legislative_documents")
    .select("number, slug, status, published_at, file_path")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Document not found." };

  const previousStatus = existing.status as ContentStatus;
  const filePath = existing.file_path as string | null;

  const promotingNow = nextStatus === "published" && previousStatus !== "published";
  if (promotingNow && filePath) {
    const promoted = await promoteMedia("legislative", [filePath]);
    if (promoted.error) return { error: "Could not publish the document's file. Try again." };
  }

  const patch = statusPatch(actor, nextStatus);
  if (nextStatus === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("legislative_documents").update(patch).eq("id", id);
  if (error) return { error: "Could not update the document." };

  if (promotingNow && filePath) {
    await cleanupPromotedMedia("legislative", [filePath], "document published");
  }
  if (nextStatus === "archived" && previousStatus === "published" && filePath) {
    await demoteMedia("legislative", [filePath], "document archived");
  }

  await recordActivity(actor, {
    type: auditTypeForStatus(nextStatus),
    action: `${nextStatus} document`,
    entityType: "legislative document",
    entityId: id,
    entityLabel: existing.number as string,
  });
  revalidate(existing.slug as string);
  return { error: null };
}
```

In `deleteLegislative`, replace `if (existing.file_path) await
removeStoredDocument(existing.file_path);` with `if (existing.file_path)
await removeStoredDocument("legislative", "archived", existing.file_path);`
(`guardDelete` only reaches here from `archived`).

- [ ] **Step 3: Fix the public legislative queries**

In `src/features/transparency/queries.ts`, this file's import line is shared
with Task 6 (`filesByOwner` and `allUploadItems`'s legislative-file inline
construction still call `documentUrl` until that task lands). Change it
**additively** — keep `documentUrl` so the file still compiles regardless of
which of Tasks 5/6 lands first — from:

```ts
import { documentUrl } from "@/lib/storage";
```

to:

```ts
import { documentUrl, mediaUrl, publicBucketFor } from "@/lib/storage";
```

(Task 6 is the one that removes `documentUrl` from this line, once its own
edits are the last thing in the file still calling it.)

In `toListItem` (the legislative one, near the top), replace:

```ts
    fileUrl: row.file_path ? documentUrl(row.file_path) : null,
```

with:

```ts
    fileUrl: row.file_path ? mediaUrl(publicBucketFor("legislative"), row.file_path) : null,
```

(All three legislative public functions — `listRecentLegislative`,
`searchLegislative`, `getPublishedLegislativeBySlug` — go through this one
`toListItem`, and all three already filter or RPC-enforce `status =
"published"`.) `src/features/admin/queries/transparency.ts`'s legislative
functions are left untouched.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean — this task is self-contained regardless of whether
Task 6 has landed yet, because Step 3 keeps `documentUrl` imported for the
functions this task doesn't touch.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions/documents.ts src/features/admin/actions/legislative.ts src/features/transparency/queries.ts
git commit -m "feat: wire legislative documents through per-status buckets"
```

---

### Task 6: Transparency documents + projects

**Files:**
- Modify: `src/features/admin/actions/transparency-documents.ts`
- Modify: `src/features/admin/actions/transparency-projects.ts`
- Modify: `src/features/transparency/queries.ts` (`filesByOwner`,
  `listPublishedDocumentsByCategory`, `listPublishedProjects`,
  `allUploadItems` — the transparency-documents/projects functions; the
  legislative ones are Task 5's, same file)

**Interfaces:**
- Consumes: `uploadTransparencyFile`/`removeStoredDocument` (now
  status-aware, from Task 5); `promoteMedia`/`cleanupPromotedMedia`/
  `demoteMedia` from `@/lib/media-lifecycle`; `mediaUrl`, `publicBucketFor`
  from `@/lib/storage`.

- [ ] **Step 1: Wire `transparency-documents.ts`**

Add the import:

```ts
import { cleanupPromotedMedia, demoteMedia, promoteMedia } from "@/lib/media-lifecycle";
```

In `saveTransparencyDocument`, every call to `uploadTransparencyFile("documents",
fd)` and `removeStoredDocument(u.path)` / `removeStoredDocument(r.path)`
needs a status. This action has no existing row to read a status from until
after the parent insert/update runs, and — unlike the single-image actions —
its upload loop runs *before* the parent row exists on create. Resolve the
status the same way `saveLegislative` does, reading it up front:

Replace the top of the function (from `const admin =
createSupabaseAdminClient();` through the upload loop) with:

```ts
  const admin = createSupabaseAdminClient();
  const { data: cat, error: catErr } = await admin
    .from("transparency_categories").select("id").eq("id", parsed.data.categoryId).maybeSingle();
  if (catErr) return { error: "Could not save the document. Try again.", id: null };
  if (!cat) return { error: "Pick a valid category.", id: null };

  let currentStatus: ContentStatus = "draft";
  if (id) {
    const { data: statusRow, error: statusErr } = await admin
      .from("transparency_documents")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (statusErr) return { error: "Could not save the document.", id: null };
    if (!statusRow) return { error: "Document not found.", id: null };
    currentStatus = statusRow.status as ContentStatus;
  }

  const newFiles = formData.getAll("newFile").filter((f): f is File => f instanceof File && f.size > 0);
  const keptIds = formData.getAll("keptFileId").map(String);

  if (keptIds.length + newFiles.length > MAX_FILES_PER_RECORD) {
    return { error: `Up to ${MAX_FILES_PER_RECORD} files.`, id: null };
  }

  const uploaded: { path: string; mime: string; sizeBytes: number }[] = [];
  async function cleanupUploads() {
    for (const u of uploaded) {
      const removed = await removeStoredDocument("transparency", currentStatus, u.path);
      if (removed.error) console.error(`Orphaned storage object (compensating delete failed): ${u.path}`);
    }
  }
  for (const file of newFiles) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadTransparencyFile("documents", currentStatus, fd);
    if (res.error || res.path === null || res.mime === null || res.sizeBytes === null) {
      await cleanupUploads();
      return { error: res.error ?? "Upload failed. Try again.", id: null };
    }
    uploaded.push({ path: res.path, mime: res.mime, sizeBytes: res.sizeBytes });
  }
```

(This adds one extra `select("status")` read on edit, mirroring the pattern
used throughout this plan. Add `import type { ContentStatus } from
"@/types";` if not already present — it already is, per the file's existing
`import type { ContentStatus, TransparencyDocumentValues } from "@/types";`
line.)

Further down, replace the two remaining `removeStoredDocument(r.path)` calls
(one in the "delete the ones the user dropped" block) with
`removeStoredDocument("transparency", currentStatus, r.path)`.

Replace `setTransparencyDocumentStatus`'s body:

```ts
export async function setTransparencyDocumentStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return { error: NOT_FOUND };

  const statusResult = statusSchema.safeParse(status);
  if (!statusResult.success) {
    return { error: statusResult.error.issues[0]?.message ?? "Invalid status." };
  }
  const nextStatus = statusResult.data;

  const admin = createSupabaseAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("transparency_documents")
    .select("title, status, published_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Document not found." };

  const previousStatus = existing.status as ContentStatus;

  const { data: fileRows } = await admin
    .from("transparency_files")
    .select("path")
    .eq("owner_type", "document")
    .eq("owner_id", id);
  const paths = (fileRows ?? []).map((f) => f.path as string);

  const promotingNow = nextStatus === "published" && previousStatus !== "published";
  if (promotingNow && paths.length > 0) {
    const promoted = await promoteMedia("transparency", paths);
    if (promoted.error) return { error: "Could not publish the document's files. Try again." };
  }

  const patch = statusPatch(actor, nextStatus);
  if (nextStatus === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("transparency_documents").update(patch).eq("id", id);
  if (error) return { error: "Could not update the document." };

  if (promotingNow && paths.length > 0) {
    await cleanupPromotedMedia("transparency", paths, "transparency document published");
  }
  if (nextStatus === "archived" && previousStatus === "published" && paths.length > 0) {
    await demoteMedia("transparency", paths, "transparency document archived");
  }

  await recordActivity(actor, {
    type: auditTypeForStatus(nextStatus),
    action: `${nextStatus} document`,
    entityType: "transparency document",
    entityId: id,
    entityLabel: existing.title as string,
  });
  revalidate();
  return { error: null };
}
```

In `deleteTransparencyDocument`, replace `await removeStoredDocument(f.path);`
(inside the `for (const f of files)` loop) with `await
removeStoredDocument("transparency", "archived", f.path);` (`guardDelete`
only reaches here from `archived`).

- [ ] **Step 2: Wire `transparency-projects.ts`**

Mirror Step 1 exactly, `transparency_documents`/`"document"` →
`transparency_projects`/`"project"`. Add the same
`import { cleanupPromotedMedia, demoteMedia, promoteMedia } from
"@/lib/media-lifecycle";`.

In `saveTransparencyProject`, insert the same status-read block right after
`const admin = createSupabaseAdminClient();` (this action has no category
lookup, so it's the very first thing):

```ts
  const admin = createSupabaseAdminClient();

  let currentStatus: ContentStatus = "draft";
  if (id) {
    const { data: statusRow, error: statusErr } = await admin
      .from("transparency_projects")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (statusErr) return { error: "Could not save the project.", id: null };
    if (!statusRow) return { error: "Project not found.", id: null };
    currentStatus = statusRow.status as ContentStatus;
  }
```

Change `uploadTransparencyFile("projects", fd)` to `uploadTransparencyFile
("projects", currentStatus, fd)`, and every `removeStoredDocument(u.path)` /
`removeStoredDocument(r.path)` to `removeStoredDocument("transparency",
currentStatus, u.path)` / `..., r.path)`.

Replace `setTransparencyProjectStatus`'s body identically to
`setTransparencyDocumentStatus` above, with `transparency_projects` /
`owner_type: "project"` / `entityType: "transparency project"` /
`existing.name` in place of the document equivalents.

In `deleteTransparencyProject`, replace `await removeStoredDocument(f.path);`
with `await removeStoredDocument("transparency", "archived", f.path);`.

`moveTransparencyProject` touches no storage object — leave it untouched.

- [ ] **Step 3: Fix the public transparency queries**

In `src/features/transparency/queries.ts` (shared import line with Task 5,
which already changed it to `import { documentUrl, mediaUrl, publicBucketFor
} from "@/lib/storage";` — if Task 5 has not landed yet when this task is
worked, make that same import change here first), replace `toFile`:

```ts
function toFile(row: FileRow, index: number): TransparencyFile {
  return {
    id: row.id,
    url: documentUrl(row.path),
    label: row.mime === "application/pdf" ? `Document ${index + 1}` : `Image ${index + 1}`,
    mime: row.mime,
    sizeBytes: row.size_bytes,
  };
}
```

with:

```ts
function toFile(row: FileRow, index: number): TransparencyFile {
  return {
    id: row.id,
    url: mediaUrl(publicBucketFor("transparency"), row.path),
    label: row.mime === "application/pdf" ? `Document ${index + 1}` : `Image ${index + 1}`,
    mime: row.mime,
    sizeBytes: row.size_bytes,
  };
}
```

(`filesByOwner`, the only caller of `toFile`, is itself only ever called from
`listPublishedDocumentsByCategory`/`listPublishedProjects`/`allUploadItems`,
all three filtered to `status = "published"` before collecting ids.) In
`allUploadItems`, replace the one inline legislative-file-URL construction:

```ts
      files: r.file_path
        ? [{ id: r.id, url: documentUrl(r.file_path), label: "Download PDF", mime: "application/pdf", sizeBytes: r.file_size_bytes ?? 0 }]
        : [],
```

with:

```ts
      files: r.file_path
        ? [{ id: r.id, url: mediaUrl(publicBucketFor("legislative"), r.file_path), label: "Download PDF", mime: "application/pdf", sizeBytes: r.file_size_bytes ?? 0 }]
        : [],
```

(This one is legislative-kind, not transparency-kind — `allUploadItems`
merges all three published-only sources, so it needs both bucket names.)
`src/features/admin/queries/transparency.ts`'s document/project functions are
left untouched.

This task's two edits are `documentUrl`'s only remaining call sites in this
file once Task 5 has landed (Task 5's `toListItem` was the other one). If
Task 5 has already landed, `documentUrl` is now unused — drop it from the
import line (`import { mediaUrl, publicBucketFor } from "@/lib/storage";`).
If Task 5 has not landed yet, leave `documentUrl` in the import for Task 5's
still-unconverted `toListItem` to keep using, and let Task 5 be the one to
drop it once it lands.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean — this task is self-contained regardless of task order,
per the import-line handling above.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions/transparency-documents.ts src/features/admin/actions/transparency-projects.ts src/features/transparency/queries.ts
git commit -m "feat: wire transparency documents and projects through per-status buckets"
```

---

### Task 7: Site content + avatars — repoint to their always-public buckets

**Files:**
- Modify: `src/features/admin/actions/site-content.ts`
- Modify: `src/features/admin/actions/account.ts`
- Modify: `src/features/site-content/queries.ts`
- Modify: `src/features/admin/queries/site-content.ts`
- Modify: `src/components/ui/avatar.tsx`
- Modify: `src/features/admin/components/avatar-picker.tsx`
- Modify: `src/features/home/components/get-involved-section.tsx`
- Modify: `src/features/admin/components/site-block-editor.tsx`

**Interfaces:**
- Consumes: `mediaUrl`, `SITE_MEDIA_BUCKET`, `AVATARS_MEDIA_BUCKET` from
  `@/lib/storage`; `uploadSingleImage`/`removeStoredImage`/`discardImage` (now
  status-aware, from Task 1 — these two folders have no lifecycle, so every
  call site here passes `null`).

Unlike Tasks 1–6, **every** consumer here is in scope — `site-media` and
`avatars-media` are always public with no draft/published split, so there is
no signed-URL piece to defer.

- [ ] **Step 1: Repoint the action files**

In `src/features/admin/actions/site-content.ts`, every
`uploadSingleImage("site", incoming)` call becomes `uploadSingleImage("site",
null, incoming)` (there are two: in `saveSiteBlock` and `saveSiteItem`), and
every `removeStoredImage(uploadedPath)` becomes `removeStoredImage("site",
null, uploadedPath)`, and every `discardImage(previous, "...")` /
`discardImage(existingImagePath, "...")` / `discardImage(existing.image_path
as string | null, "...")` gains `"site", null,` as its first two arguments.

In `src/features/admin/actions/account.ts`, `uploadSingleImage("avatars",
incoming)` becomes `uploadSingleImage("avatars", null, incoming)`,
`removeStoredImage(uploadedPath)` becomes `removeStoredImage("avatars", null,
uploadedPath)`, and `discardImage(previousPath, "avatar replaced")` becomes
`discardImage("avatars", null, previousPath, "avatar replaced")`.

- [ ] **Step 2: Fix the public and admin site-content queries**

In `src/features/site-content/queries.ts`, update the import:

```ts
import { photoUrl } from "@/lib/storage";
```

to:

```ts
import { SITE_MEDIA_BUCKET, mediaUrl } from "@/lib/storage";
```

Replace the two call sites — in `listHeroSlides`:

```ts
    src: photoUrl(row.image_path!),
```

becomes:

```ts
    src: mediaUrl(SITE_MEDIA_BUCKET, row.image_path!),
```

and in `listHistoryTimeline`:

```ts
    image: photoUrl(row.image_path!),
```

becomes:

```ts
    image: mediaUrl(SITE_MEDIA_BUCKET, row.image_path!),
```

In `src/features/admin/queries/site-content.ts`, same import change, and in
`toAdminRow`:

```ts
    imageUrl: row.image_path ? photoUrl(row.image_path) : null,
```

becomes:

```ts
    imageUrl: row.image_path ? mediaUrl(SITE_MEDIA_BUCKET, row.image_path) : null,
```

- [ ] **Step 3: Fix `avatar.tsx` and `avatar-picker.tsx`**

In `src/components/ui/avatar.tsx`, update the import:

```ts
import { photoUrl } from "@/lib/storage";
```

to:

```ts
import { AVATARS_MEDIA_BUCKET, mediaUrl } from "@/lib/storage";
```

and its one call site:

```ts
        <Image
          src={photoUrl(src)}
```

to:

```ts
        <Image
          src={mediaUrl(AVATARS_MEDIA_BUCKET, src)}
```

In `src/features/admin/components/avatar-picker.tsx`, update:

```ts
import { ALLOWED_AVATAR_SOURCE_TYPES, MAX_AVATAR_SOURCE_BYTES, photoUrl } from "@/lib/storage";
```

to:

```ts
import { ALLOWED_AVATAR_SOURCE_TYPES, AVATARS_MEDIA_BUCKET, MAX_AVATAR_SOURCE_BYTES, mediaUrl } from "@/lib/storage";
```

and:

```ts
  const storedUrl = existingSrc && !removeExisting ? photoUrl(existingSrc) : null;
```

to:

```ts
  const storedUrl = existingSrc && !removeExisting ? mediaUrl(AVATARS_MEDIA_BUCKET, existingSrc) : null;
```

(`mediaUrl` and the two bucket constants are plain exported values from
`storage.ts`, not `server-only` — safe to call from this client component,
exactly as `photoUrl` was.)

- [ ] **Step 4: Fix `get-involved-section.tsx` and `site-block-editor.tsx`**

In `src/features/home/components/get-involved-section.tsx`, update:

```ts
import { photoUrl } from "@/lib/storage";
```

to:

```ts
import { SITE_MEDIA_BUCKET, mediaUrl } from "@/lib/storage";
```

and:

```ts
      backgroundImage={ctaImage ? photoUrl(ctaImage) : undefined}
```

to:

```ts
      backgroundImage={ctaImage ? mediaUrl(SITE_MEDIA_BUCKET, ctaImage) : undefined}
```

In `src/features/admin/components/site-block-editor.tsx`, update the same
import pattern and:

```ts
              existingPreviewUrl={value ? photoUrl(value) : null}
```

to:

```ts
              existingPreviewUrl={value ? mediaUrl(SITE_MEDIA_BUCKET, value) : null}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/actions/site-content.ts src/features/admin/actions/account.ts src/features/site-content/queries.ts src/features/admin/queries/site-content.ts src/components/ui/avatar.tsx src/features/admin/components/avatar-picker.tsx src/features/home/components/get-involved-section.tsx src/features/admin/components/site-block-editor.tsx
git commit -m "feat: repoint site content and avatars to their own buckets"
```

---

## Self-Review Notes

**Spec coverage:** Of the design spec's four sections — "Bucket resolution"
and "Data migration" were fully covered by Plan 1. "Upload flow" and
"Status-transition rules (promote/demote)" are fully covered by this plan,
for all six status-aware content types plus the two always-public ones.
"Admin preview URLs" is **deliberately not covered** — see "Explicit scope
boundary" at the top of this plan for the reasoning; that section remains
for a follow-up plan once this one has shipped and been observed on staging.

**Placeholder scan:** No TBD/TODO; every step shows the literal before/after
code. The one place that could look like a placeholder — `officialStatus ??
"archived"` in Task 1's `removeAchievementPhoto`, and similar `?? "archived"`
fallbacks in delete paths — is not a stand-in for missing logic; it is the
documented, deliberate choice of which bucket to try in an unreachable-race
edge case, explained inline.

**Type consistency:** `uploadSingleImage`/`removeStoredImage`/`discardImage`'s
new `(folder, status, ...)` shape (Task 1) is used identically by every
caller in Tasks 2, 3, 7. `uploadDocumentPdf`/`uploadTransparencyFile`/
`removeStoredDocument`'s new `(folder|kind, status, ...)` shape (Task 5) is
used identically by Task 6. `promoteMedia(kind, paths)` /
`cleanupPromotedMedia(kind, paths, context)` / `demoteMedia(kind, paths,
context)` are called with the exact signatures Plan 1 shipped in
`src/lib/media-lifecycle.ts` (verified against that file's current contents,
not just the plan that built it) throughout Tasks 1–6.

**Cross-task file overlap:** `src/features/announcements/queries.ts` is
touched by both Task 3 (announcements) and Task 4 (news); `src/features/
transparency/queries.ts` is touched by both Task 5 (legislative) and Task 6
(transparency documents/projects). Each pair's *first*-landed task changes
its shared import line **additively** (keeping the old helper alongside the
new ones) so the file compiles regardless of which task runs first or
whether they're reviewed as separate subagent dispatches; the *second*-landed
task in each pair drops the now-fully-unused old helper from the import. Both
tasks in each pair are independently typecheck-clean and independently
reviewable — no ordering constraint, no "must land in the same commit."

**Scope check (corrected during Task 1's review):** This plan does **not**
keep the whole repository typecheck-clean at every intermediate task
boundary, and the original draft of this section overclaimed that it did.
Task 1 and Task 5 each change a shared helper's signature (`media.ts`,
`documents.ts`) but only update *one* of that helper's several callers (the
content type each task owns); `media.ts`'s other four callers
(`events.ts`/Task 2, `announcements.ts`/Task 3, `site-content.ts` +
`account.ts`/Task 7) and `documents.ts`'s other caller
(`transparency-documents.ts`/`transparency-projects.ts`/Task 6) will not
typecheck again until their own listed task lands. This is expected,
scoped-per-task breakage inside an isolated worktree that is not merged
until the final whole-branch review — every task IS independently
diff-reviewable and independently correct for the files it owns; it is only
`npm run typecheck` run against the *whole repo* that is red in between.
Anyone reviewing an individual task's diff should expect and discount
compile errors in the other four/one file(s) named above until the task that
owns them lands — see each affected task's own dispatch notes.

**Deployment prerequisite (added during Task 1's review — read before this
branch is merged or deployed anywhere):** see the corrected paragraph in
"Explicit scope boundary" above. In short: `scripts/migrate-media-buckets.mjs`
must run against an environment (after migration `0028` is applied there)
**before or as part of** deploying this branch's code to that environment —
not at leisure afterward. Deploying the public-query changes ahead of the
data migration breaks every currently-published image/document on the live
public site, not just newly-uploaded ones. This is a hard blocker for
`superpowers:finishing-a-development-branch`'s merge step on any environment
that serves real traffic (staging, then production) — it is not a hard
blocker for merging into `development` itself, since `development` is not
directly deployed.

**CLAUDE.md (added during Task 1's review):** Task 1's review found that
this project's `docs/superpowers/plans/2026-07-27-media-bucket-split-*`
sequence makes CLAUDE.md's media-bucket-split bullet — "**Nothing in the
running app uses any of this yet**" — false, and no task in this plan was
originally assigned to fix it, per this project's own standing rule ("every
session that changes code updates CLAUDE.md in the same session"). This is
now owned as an explicit step of the final whole-branch review / finish
step below, not left to chance.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-27-media-bucket-split-wiring.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
