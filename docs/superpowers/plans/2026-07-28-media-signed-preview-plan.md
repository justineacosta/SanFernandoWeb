# Admin Signed Preview URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every admin list-thumbnail and edit-drawer preview across all six
status-aware content types resolves correctly regardless of the record's
status — a plain public URL for `published`, a short-lived signed URL for
anything else — using the `resolveMediaUrl`/`resolveMediaUrls` helpers Plan 1
already built but nothing calls yet.

**Architecture:** Swap every remaining `photoUrl()`/`documentUrl()` call (and
two disguised variants that call `mediaUrl(bucketForStatus(...))` directly
against what may be a private bucket) for the status-aware
`resolveMediaUrl`/`resolveMediaUrls` pair, plus one new batching helper,
`resolveMediaUrlsForList`, for admin list views where many rows of mixed
status each need one thumbnail. Two form components
(`announcement-form.tsx`, `event-form.tsx`) need a new resolved-URL field
threaded through their Server Action and manager component, since they
don't already separate the raw stored path from a resolved preview URL the
way officials/legislative do.

**Tech Stack:** Next.js 16 Server Actions, Supabase Storage (service-role
client), TypeScript strict.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-28-media-signed-preview-design.md`
  (approved, committed as `2a0a86e`).
- **Scope correction found while mapping files for this plan:** the spec
  documents 13 call sites across 6 query files. Three more of the same bug
  hide behind a different spelling — `mediaUrl(bucketForStatus(kind,
  status), path)` called directly instead of through `photoUrl`/
  `documentUrl` — in `src/features/admin/actions/achievement-photos.ts:140`,
  `src/features/admin/actions/news.ts:185`, and
  `src/features/admin/actions/documents.ts:84`. All three compose a
  plain-public-style URL string against what may be a *private* `-drafts`
  bucket, which 403/404s in the browser exactly like the documented gap.
  They're folded into Tasks 1, 4, and 5 respectively (same content type,
  same task boundary) rather than treated as a new task.
- No Vitest coverage is added by this plan. Every touched function is
  `server-only` and calls the Supabase service-role client — this project's
  existing convention (see CLAUDE.md's Commands section) is that Vitest
  covers pure functions only; nothing here qualifies, matching how Plan 1
  and Plan 2 verified (typecheck + lint + manual click-through, never a
  fabricated unit test around a live database call). Each task's
  verification step is `npm run typecheck`, `npm run lint`, and a note on
  what to click-test manually against staging once deployed — do not invent
  a mocked-Supabase test to satisfy a TDD cycle that doesn't fit this
  codebase.
- `resolveMediaUrl(kind, status, path)` and `resolveMediaUrls(kind, status,
  paths)` already exist in `src/lib/media-lifecycle.ts` (Plan 1) — do not
  redefine them, only add callers and the one new `resolveMediaUrlsForList`
  helper (Task 0).
- Published records must never gain a network round-trip they didn't have
  before — `resolveMediaUrl`/`resolveMediaUrls`/`resolveMediaUrlsForList`
  all already special-case `status === "published"` to call `mediaUrl()`
  directly with no Storage API call; preserve that in every call site.
- Run `npm run typecheck` and `npm run lint` after every task — both must be
  clean before moving to the next task.

---

### Task 0: `resolveMediaUrlsForList` helper

**Files:**
- Modify: `src/lib/media-lifecycle.ts`

**Interfaces:**
- Consumes: `MediaKind`, `draftBucketFor`, `mediaUrl`, `publicBucketFor` (all
  already imported in this file from `@/lib/storage`), `ContentStatus` (already
  imported from `@/types`), `createSupabaseAdminClient` (already imported),
  `SIGNED_URL_TTL_SECONDS` (already defined in this file, just above
  `resolveMediaUrl`).
- Produces: `resolveMediaUrlsForList(kind: MediaKind, rows: { path: string |
  null; status: ContentStatus }[]): Promise<(string | null)[]>` — one result
  per input row, same order, `null` for a row whose `path` was `null` or
  whose signing failed.

- [ ] **Step 1: Add the function**

Append to the end of `src/lib/media-lifecycle.ts`:

```ts
/**
 * Batch form of `resolveMediaUrl` for a *list* of records that can each be a
 * different status — an admin table showing a published row next to a
 * draft row, say. `resolveMediaUrls` doesn't fit here because it takes one
 * status for its whole batch; this groups rows by published/not instead:
 * published rows resolve with no network call, and every non-published
 * row's path is signed in a single batched `createSignedUrls` call
 * regardless of which specific non-published status it's in — draft,
 * in-review, and archived all read from the same `<kind>-drafts` bucket
 * (see `bucketForStatus`), so one status value stands in for all of them.
 */
export async function resolveMediaUrlsForList(
  kind: MediaKind,
  rows: { path: string | null; status: ContentStatus }[],
): Promise<(string | null)[]> {
  const results: (string | null)[] = rows.map(() => null);
  const toSign = new Map<number, string>();

  rows.forEach((row, i) => {
    if (!row.path) return;
    if (/^https?:\/\//i.test(row.path)) {
      results[i] = row.path;
      return;
    }
    if (row.status === "published") {
      results[i] = mediaUrl(publicBucketFor(kind), row.path);
      return;
    }
    toSign.set(i, row.path);
  });

  if (toSign.size === 0) return results;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(draftBucketFor(kind))
    .createSignedUrls([...toSign.values()], SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error(`resolveMediaUrlsForList signing failed (${kind}):`, error.message);
    return results;
  }
  const byPath = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) byPath.set(entry.path, entry.signedUrl);
  }
  for (const [i, path] of toSign) {
    const url = byPath.get(path);
    if (url) results[i] = url;
  }
  return results;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors (this function has no callers yet, so it can't
break anything — this step only confirms the function itself compiles).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/media-lifecycle.ts
git commit -m "feat: add resolveMediaUrlsForList for mixed-status admin list thumbnails"
```

---

### Task 1: Officials + achievements

**Files:**
- Modify: `src/features/admin/queries/achievements.ts`
- Modify: `src/features/admin/queries/officials.ts`
- Modify: `src/features/admin/actions/achievement-photos.ts:135-143`

**Interfaces:**
- Consumes: `resolveMediaUrl`, `resolveMediaUrls`, `resolveMediaUrlsForList`
  (Task 0) from `@/lib/media-lifecycle`.
- Produces: `listAchievementsForOfficial(officialId: string, status:
  ContentStatus): Promise<AdminAchievement[]>` — signature gains a required
  `status` parameter (was `(officialId: string)`), used by
  `getOfficialForEdit`, its only caller.

- [ ] **Step 1: Fix `achievements.ts` to resolve photo URLs correctly**

Replace the whole file:

```ts
import "server-only";
import type { AdminAchievement, ContentStatus } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveMediaUrls } from "@/lib/media-lifecycle";

interface PhotoRow {
  id: string;
  src: string;
  alt: string;
  sort_order: number;
}

interface AchievementRow {
  id: string;
  title: string;
  description: string;
  date_label: string;
  is_visible: boolean;
  sort_order: number;
  official_achievement_photos: PhotoRow[] | null;
}

/**
 * Every achievement for one official, visible or not, in editor order.
 * Admin-side: no is_visible or title filtering — the drawer must show
 * unfinished and deliberately hidden entries. `status` is the *official's*
 * status — achievement photos have no lifecycle of their own and ride on
 * their parent's, so it decides whether photos resolve as public or signed.
 */
export async function listAchievementsForOfficial(
  officialId: string,
  status: ContentStatus,
): Promise<AdminAchievement[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("official_achievements")
    .select(
      "id, title, description, date_label, is_visible, sort_order, official_achievement_photos(id, src, alt, sort_order)",
    )
    .eq("official_id", officialId)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  const rows = (data as unknown as AchievementRow[]).map((row) => ({
    ...row,
    // Embedded rows come back in no guaranteed order — sort here rather than
    // relying on a nested order parameter.
    sortedPhotos: [...(row.official_achievement_photos ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  }));

  const urlByPath = await resolveMediaUrls(
    "officials",
    status,
    rows.flatMap((row) => row.sortedPhotos.map((p) => p.src)),
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    dateLabel: row.date_label,
    isVisible: row.is_visible,
    photos: row.sortedPhotos.map((photo) => ({
      id: photo.id,
      // Fall back to the raw path (matches pre-fix behavior) on the rare
      // signing failure, rather than inventing a nullable GalleryPhoto.src.
      src: urlByPath.get(photo.src) ?? photo.src,
      alt: photo.alt,
    })),
  }));
}
```

- [ ] **Step 2: Fix `officials.ts`'s list and edit queries**

Replace the whole file:

```ts
import "server-only";
import type {
  AdminAchievement,
  AdminOfficialRow,
  ContentStatus,
  OfficialGroup,
  OfficialValues,
} from "@/types";
import { ARCHIVE_SELECT, toArchiveMeta, type ArchiveMetaRow } from "@/lib/archive";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveMediaUrl, resolveMediaUrlsForList } from "@/lib/media-lifecycle";
import { listAchievementsForOfficial } from "./achievements";

/** Every official, all statuses, in directory order. */
export async function listAdminOfficials(): Promise<AdminOfficialRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    // `group` is a SQL reserved word — keep it quoted.
    .select(`id, slug, name, role, "group", photo_path, sort_order, status, ${ARCHIVE_SELECT}`)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  const photoUrls = await resolveMediaUrlsForList(
    "officials",
    data.map((row) => ({
      path: row.photo_path as string | null,
      status: row.status as ContentStatus,
    })),
  );

  return data.map((row, i) => ({
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    role: row.role as string,
    group: row.group as OfficialGroup,
    photoUrl: photoUrls[i],
    sortOrder: row.sort_order as number,
    status: row.status as ContentStatus,
    ...toArchiveMeta(row as unknown as ArchiveMetaRow),
  }));
}

export async function getOfficialForEdit(
  id: string,
): Promise<{
  values: OfficialValues;
  status: ContentStatus;
  photoUrl: string | null;
  achievements: AdminAchievement[];
} | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select('name, role, "group", badge, photo_path, photo_alt, term, email, phone, bio, status')
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const status = data.status as ContentStatus;
  const photoPath = (data.photo_path as string) || null;
  const [achievements, photoUrl] = await Promise.all([
    listAchievementsForOfficial(id, status),
    photoPath ? resolveMediaUrl("officials", status, photoPath) : Promise.resolve(null),
  ]);

  return {
    values: {
      name: data.name as string,
      role: data.role as string,
      group: data.group as OfficialGroup,
      badge: (data.badge as string) ?? null,
      photoPath: (data.photo_path as string) ?? null,
      photoAlt: (data.photo_alt as string) ?? "",
      term: (data.term as string) ?? "",
      email: (data.email as string) ?? null,
      phone: (data.phone as string) ?? null,
      bio: (data.bio as string) ?? "",
    },
    status,
    photoUrl,
    achievements,
  };
}
```

- [ ] **Step 3: Fix `achievement-photos.ts`'s post-upload preview URL**

In `src/features/admin/actions/achievement-photos.ts`, find the import
block pulling several names from `@/lib/storage` (it includes a `mediaUrl,`
line among others). Delete just that `mediaUrl,` line from the block —
there is only the one call site at line 140 today, and it's being replaced
below, so the import becomes unused. Leave every other name in that import
block untouched. Add a new import line near the top of the file:

```ts
import { resolveMediaUrls } from "@/lib/media-lifecycle";
```

Then replace the tail of `uploadAchievementPhotos` (currently around lines
135–143):

```ts
  await recordActivity(actor, {
    type: "file_upload",
    action: "uploaded achievement photos",
    entityType: "official achievement",
    entityId: achievementId,
  });
  await revalidateForAchievement(admin, achievementId);
  const refreshed = await currentPhotos(admin, achievementId);
  return {
    error: null,
    photos: refreshed.map((p) => ({
      id: p.id as string,
      src: mediaUrl(bucketForStatus("officials", officialStatus), p.src as string),
      alt: p.alt as string,
    })),
  };
```

with:

```ts
  await recordActivity(actor, {
    type: "file_upload",
    action: "uploaded achievement photos",
    entityType: "official achievement",
    entityId: achievementId,
  });
  await revalidateForAchievement(admin, achievementId);
  const refreshed = await currentPhotos(admin, achievementId);
  const urlByPath = await resolveMediaUrls(
    "officials",
    officialStatus,
    refreshed.map((p) => p.src as string),
  );
  return {
    error: null,
    photos: refreshed.map((p) => ({
      id: p.id as string,
      src: urlByPath.get(p.src as string) ?? (p.src as string),
      alt: p.alt as string,
    })),
  };
```

`bucketForStatus` may now be unused in this file — check with a search
before removing its import; leave the import in place if anything else in
the file still references it.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean. If `bucketForStatus` or `mediaUrl` show as unused imports
under the project's lint rules, remove them (checked in the next step
regardless).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: clean, no unused-import warnings.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/queries/achievements.ts src/features/admin/queries/officials.ts src/features/admin/actions/achievement-photos.ts
git commit -m "fix: resolve officials/achievements admin previews via signed URLs"
```

- [ ] **Step 7: Manual verification note (owner, on staging)**

Open `/admin/officials`, edit a **draft** official with a portrait and at
least one achievement photo: both the list thumbnail and the edit-drawer
portrait/achievement-photo previews should render (they render broken
today). Edit a **published** official and confirm its preview still renders
with no visible delay (no accidental signing round-trip for published
content).

---

### Task 2: Events

**Files:**
- Modify: `src/features/admin/queries/events.ts`
- Modify: `src/features/admin/actions/events.ts:55-60`
- Modify: `src/features/admin/components/event-form.tsx`
- Modify: `src/features/admin/components/events-manager.tsx:101-113`

**Interfaces:**
- Consumes: `resolveMediaUrl`, `resolveMediaUrlsForList` (Task 0).
- Produces: `getEventForEdit(id: string): Promise<{ values: EventValues;
  status: ContentStatus; coverPreviewUrl: string | null } | null>` — return
  type gains `coverPreviewUrl`. `EventEditRecord` (in `event-form.tsx`)
  gains the same field.

- [ ] **Step 1: Fix `events.ts`**

Replace the whole file:

```ts
import "server-only";
import type { AdminEventRow, ContentStatus, EventCategory, EventValues } from "@/types";
import { ARCHIVE_SELECT, toArchiveMeta, type ArchiveMetaRow } from "@/lib/archive";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveMediaUrl, resolveMediaUrlsForList } from "@/lib/media-lifecycle";

interface Row extends ArchiveMetaRow {
  id: string;
  title: string;
  category: EventCategory;
  event_date: string;
  start_time: string;
  end_time: string | null;
  venue: string;
  capacity: number | null;
  description: string;
  cover_src: string | null;
  cover_alt: string;
  status: ContentStatus;
}

const COLUMNS = `id, title, category, event_date, start_time, end_time, venue, capacity, description, cover_src, cover_alt, status, ${ARCHIVE_SELECT}`;

/** All events for the admin manager list, soonest event date first. */
export async function listEvents(): Promise<AdminEventRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("events").select(COLUMNS).order("event_date", { ascending: true });
  if (error || !data) return [];
  const rows = data as unknown as Row[];
  const coverUrls = await resolveMediaUrlsForList(
    "events",
    rows.map((r) => ({ path: r.cover_src, status: r.status })),
  );
  return rows.map((r, i) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    // `event_date` is a bare Postgres `date` column, not a timestamptz — pass
    // it straight through (no toManilaDate). Callers format it with formatDate().
    eventDate: r.event_date,
    startTime: r.start_time,
    endTime: r.end_time ?? "",
    venue: r.venue,
    capacity: r.capacity,
    description: r.description,
    status: r.status,
    coverSrc: coverUrls[i],
    coverAlt: r.cover_alt,
    ...toArchiveMeta(r),
  }));
}

/** One event's editable values + status, for the drawer editor. */
export async function getEventForEdit(
  id: string,
): Promise<{ values: EventValues; status: ContentStatus; coverPreviewUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("events").select(COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as Row;
  const coverPreviewUrl = row.cover_src
    ? await resolveMediaUrl("events", row.status, row.cover_src)
    : null;
  return {
    values: {
      title: row.title,
      category: row.category,
      eventDate: row.event_date,
      startTime: row.start_time,
      endTime: row.end_time ?? "",
      venue: row.venue,
      capacity: row.capacity,
      description: row.description,
      // Raw storage path (or remote seed URL) — never resolved here. The form
      // round-trips this value back through saveEvent unchanged unless the
      // uploader replaces it.
      coverSrc: row.cover_src,
      coverAlt: row.cover_alt,
    },
    status: row.status,
    coverPreviewUrl,
  };
}
```

- [ ] **Step 2: Thread the new field through the Server Action**

In `src/features/admin/actions/events.ts`, replace:

```ts
export async function getEventForEditAction(
  id: string,
): Promise<{ values: EventValues; status: ContentStatus } | null> {
  if (!(await checkPermission("manage-news"))) return null;
  return getEventForEdit(id);
}
```

with:

```ts
export async function getEventForEditAction(
  id: string,
): Promise<{ values: EventValues; status: ContentStatus; coverPreviewUrl: string | null } | null> {
  if (!(await checkPermission("manage-news"))) return null;
  return getEventForEdit(id);
}
```

- [ ] **Step 3: Update `EventEditRecord` and drop the client-side `photoUrl` call**

In `src/features/admin/components/event-form.tsx`, remove the import:

```ts
import { photoUrl } from "@/lib/storage";
```

Replace:

```ts
export interface EventEditRecord {
  id: string;
  values: EventValues;
  status: ContentStatus;
}
```

with:

```ts
export interface EventEditRecord {
  id: string;
  values: EventValues;
  status: ContentStatus;
  coverPreviewUrl: string | null;
}
```

Replace:

```tsx
            existingPreviewUrl={values.coverSrc ? photoUrl(values.coverSrc) : null}
```

with:

```tsx
            existingPreviewUrl={record?.coverPreviewUrl ?? null}
```

- [ ] **Step 4: Pass the field through `events-manager.tsx`**

In `src/features/admin/components/events-manager.tsx`, replace:

```ts
      setEditing({ id: row.id, values: detail.values, status: detail.status });
```

with:

```ts
      setEditing({
        id: row.id,
        values: detail.values,
        status: detail.status,
        coverPreviewUrl: detail.coverPreviewUrl,
      });
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/queries/events.ts src/features/admin/actions/events.ts src/features/admin/components/event-form.tsx src/features/admin/components/events-manager.tsx
git commit -m "fix: resolve events admin previews via signed URLs"
```

- [ ] **Step 8: Manual verification note (owner, on staging)**

Open `/admin/events`, edit a **draft** event with a cover image: the list
thumbnail and the edit-drawer cover preview should both render. Confirm a
**published** event's cover still renders with no added delay.

---

### Task 3: Announcements

**Files:**
- Modify: `src/features/admin/queries/announcements.ts`
- Modify: `src/features/admin/actions/announcements.ts:67-72`
- Modify: `src/features/admin/components/announcement-form.tsx`
- Modify: `src/features/admin/components/news-manager.tsx:171-186`

**Interfaces:**
- Consumes: `resolveMediaUrl`, `resolveMediaUrlsForList` (Task 0).
- Produces: `getAnnouncementForEdit(id: string): Promise<{ values:
  AnnouncementValues; status: ContentStatus; imagePreviewUrl: string | null
  } | null>` — return type gains `imagePreviewUrl`. `AnnouncementEditRecord`
  (in `announcement-form.tsx`) gains the same field.

- [ ] **Step 1: Fix `announcements.ts`**

Replace the whole file:

```ts
import "server-only";
import type { AdminAnnouncementRow, AnnouncementValues, ContentStatus } from "@/types";
import { ARCHIVE_SELECT, toArchiveMeta, type ArchiveMetaRow } from "@/lib/archive";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveMediaUrl, resolveMediaUrlsForList } from "@/lib/media-lifecycle";
import { formatDate, toManilaDate } from "@/lib/format";

interface Row extends ArchiveMetaRow {
  id: string;
  title: string;
  date: string;
  excerpt: string;
  image_src: string | null;
  image_alt: string;
  urgent: boolean;
  status: ContentStatus;
  updated_at: string;
}

/** All announcements for the admin manager grid, most recently updated first. */
export async function listAnnouncements(): Promise<AdminAnnouncementRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select(
      `id, title, date, excerpt, image_src, image_alt, urgent, status, updated_at, ${ARCHIVE_SELECT}`,
    )
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const rows = data as unknown as Row[];
  const imageUrls = await resolveMediaUrlsForList(
    "announcements",
    rows.map((r) => ({ path: r.image_src, status: r.status })),
  );
  return rows.map((r, i) => ({
    id: r.id,
    title: r.title,
    // `date` is a bare Postgres `date` column, not a timestamptz — pass it
    // straight through (no toManilaDate). Callers format it with formatDate().
    date: r.date,
    excerpt: r.excerpt,
    urgent: r.urgent,
    status: r.status,
    imageSrc: imageUrls[i],
    imageAlt: r.image_alt,
    updatedLabel: formatDate(toManilaDate(r.updated_at)),
    ...toArchiveMeta(r),
  }));
}

/** One announcement's editable values + status, for the drawer editor. */
export async function getAnnouncementForEdit(
  id: string,
): Promise<{ values: AnnouncementValues; status: ContentStatus; imagePreviewUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("id, slug, title, date, excerpt, body, image_src, image_alt, urgent, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const status = data.status as ContentStatus;
  const imagePreviewUrl = data.image_src
    ? await resolveMediaUrl("announcements", status, data.image_src)
    : null;
  return {
    values: {
      title: data.title,
      slug: data.slug,
      date: data.date,
      excerpt: data.excerpt,
      body: data.body ?? "",
      urgent: data.urgent,
      // Raw storage path (or remote seed URL) — never resolved here. The form
      // round-trips this value back through saveAnnouncement unchanged unless
      // the uploader replaces it.
      imageSrc: data.image_src,
      imageAlt: data.image_alt,
    },
    status,
    imagePreviewUrl,
  };
}
```

- [ ] **Step 2: Thread the new field through the Server Action**

In `src/features/admin/actions/announcements.ts`, replace:

```ts
export async function getAnnouncementForEditAction(
  id: string,
): Promise<{ values: AnnouncementValues; status: ContentStatus } | null> {
  if (!(await checkPermission("manage-news"))) return null;
  return getAnnouncementForEdit(id);
}
```

with:

```ts
export async function getAnnouncementForEditAction(
  id: string,
): Promise<{ values: AnnouncementValues; status: ContentStatus; imagePreviewUrl: string | null } | null> {
  if (!(await checkPermission("manage-news"))) return null;
  return getAnnouncementForEdit(id);
}
```

- [ ] **Step 3: Update `AnnouncementEditRecord` and drop the client-side `photoUrl` call**

In `src/features/admin/components/announcement-form.tsx`, remove the import:

```ts
import { photoUrl } from "@/lib/storage";
```

Replace:

```ts
export interface AnnouncementEditRecord {
  id: string;
  values: AnnouncementValues;
  status: ContentStatus;
}
```

with:

```ts
export interface AnnouncementEditRecord {
  id: string;
  values: AnnouncementValues;
  status: ContentStatus;
  imagePreviewUrl: string | null;
}
```

Replace:

```tsx
            existingPreviewUrl={values.imageSrc ? photoUrl(values.imageSrc) : null}
```

with:

```tsx
            existingPreviewUrl={record?.imagePreviewUrl ?? null}
```

- [ ] **Step 4: Pass the field through `news-manager.tsx`**

In `src/features/admin/components/news-manager.tsx`, replace:

```ts
        setEditingAnnouncement({ id: row.id, values: detail.values, status: detail.status });
```

with:

```ts
        setEditingAnnouncement({
          id: row.id,
          values: detail.values,
          status: detail.status,
          imagePreviewUrl: detail.imagePreviewUrl,
        });
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/queries/announcements.ts src/features/admin/actions/announcements.ts src/features/admin/components/announcement-form.tsx src/features/admin/components/news-manager.tsx
git commit -m "fix: resolve announcements admin previews via signed URLs"
```

- [ ] **Step 8: Manual verification note (owner, on staging)**

Open `/admin/news` → Announcements tab, edit a **draft** announcement with
an image: list thumbnail and edit-drawer preview should both render.
Confirm a **published** announcement's image still renders with no added
delay.

---

### Task 4: News (cover + gallery photos)

**Files:**
- Modify: `src/features/admin/queries/news.ts`
- Modify: `src/features/admin/actions/news.ts:172-188`

**Interfaces:**
- Consumes: `resolveMediaUrls`, `resolveMediaUrlsForList` (Task 0).
- Produces: no signature changes — `listNewsArticles`, `getNewsArticleForEdit`,
  and `listPhotos` (internal to `actions/news.ts`) keep their existing
  return shapes; only their URL construction changes. `news-form.tsx`
  already consumes `record.photos: GalleryPhoto[]` as pre-resolved URLs, so
  it needs no change.

- [ ] **Step 1: Fix `news.ts`'s query file**

Replace the whole file:

```ts
import "server-only";
import type { AdminNewsArticleRow, ContentStatus, NewsArticleValues, GalleryPhoto } from "@/types";
import { ARCHIVE_SELECT, toArchiveMeta, type ArchiveMetaRow } from "@/lib/archive";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveMediaUrls, resolveMediaUrlsForList } from "@/lib/media-lifecycle";
import { formatDate, toManilaDate } from "@/lib/format";

interface NewsPhotoRow {
  id: string;
  src: string;
  alt: string;
  sort_order: number;
}

interface Row extends ArchiveMetaRow {
  id: string;
  slug: string;
  title: string;
  category_id: string;
  excerpt: string;
  status: ContentStatus;
  published_at: string | null;
  updated_at: string;
  news_categories: { label: string } | null;
  news_photos: NewsPhotoRow[];
}

/** All news articles for the admin manager grid, most recently updated first. */
export async function listNewsArticles(): Promise<AdminNewsArticleRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .select(
      `id, slug, title, category_id, excerpt, status, published_at, updated_at, news_categories(label), news_photos(id, src, alt, sort_order), ${ARCHIVE_SELECT}`,
    )
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const rows = data as unknown as Row[];
  const covers = rows.map(
    (r) => [...r.news_photos].sort((a, b) => a.sort_order - b.sort_order)[0] ?? null,
  );
  const coverUrls = await resolveMediaUrlsForList(
    "news",
    rows.map((r, i) => ({ path: covers[i]?.src ?? null, status: r.status })),
  );
  return rows.map((r, i) => {
    const cover = covers[i];
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: r.news_categories?.label ?? "—",
      categoryId: r.category_id,
      excerpt: r.excerpt,
      status: r.status,
      coverSrc: coverUrls[i],
      coverAlt: cover?.alt ?? "",
      photoCount: r.news_photos.length,
      updatedLabel: formatDate(toManilaDate(r.updated_at)),
      publishedLabel: r.published_at ? formatDate(toManilaDate(r.published_at)) : null,
      ...toArchiveMeta(r),
    };
  });
}

/** One article's editable values + status + photos, for the drawer editor. */
export async function getNewsArticleForEdit(
  id: string,
): Promise<{ values: NewsArticleValues; status: ContentStatus; photos: GalleryPhoto[] } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .select("id, slug, title, category_id, excerpt, body, status, news_photos(id, src, alt, sort_order)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const status = data.status as ContentStatus;
  const sortedPhotos = ([...(data.news_photos ?? [])] as NewsPhotoRow[]).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const urlByPath = await resolveMediaUrls("news", status, sortedPhotos.map((p) => p.src));
  const photos = sortedPhotos.map((p) => ({
    id: p.id,
    src: urlByPath.get(p.src) ?? p.src,
    alt: p.alt,
  }));
  return {
    values: {
      title: data.title,
      slug: data.slug,
      categoryId: data.category_id,
      excerpt: data.excerpt,
      body: data.body ?? "",
    },
    status,
    photos,
  };
}
```

- [ ] **Step 2: Fix the disguised bug in `actions/news.ts`'s `listPhotos` helper**

In `src/features/admin/actions/news.ts`, this helper currently builds a
plain-public-style URL against `bucketForStatus("news", status)` even when
that resolves to the private `news-drafts` bucket — broken for any
non-published article whose photos were just saved. Replace:

```ts
/** The article's stored photos, in display order. */
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

with:

```ts
/** The article's stored photos, in display order. */
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
  const rows = (data ?? []) as { id: string; src: string; alt: string }[];
  const urlByPath = await resolveMediaUrls("news", status, rows.map((p) => p.src));
  return rows.map((p) => ({
    id: p.id,
    src: urlByPath.get(p.src) ?? p.src,
    alt: p.alt,
  }));
}
```

Add the import near the top of the file (alongside the existing
`cleanupPromotedMedia, demoteMedia, promoteMedia` import from
`@/lib/media-lifecycle`):

```ts
import { cleanupPromotedMedia, demoteMedia, promoteMedia, resolveMediaUrls } from "@/lib/media-lifecycle";
```

`bucketForStatus` and `mediaUrl` may now be unused in this file's import
from `@/lib/storage` — search for other uses in the file before removing
either (this file also uploads photos directly with `bucketForStatus`
elsewhere, so most likely only `mediaUrl` becomes unused; check both).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean, no unused-import warnings.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/queries/news.ts src/features/admin/actions/news.ts
git commit -m "fix: resolve news admin previews via signed URLs"
```

- [ ] **Step 6: Manual verification note (owner, on staging)**

Open `/admin/news`, edit a **draft** article with photos, add a new photo
and confirm the drawer's returned preview after save renders (this is the
`listPhotos` post-save path). Confirm list thumbnails and the edit-drawer
gallery both render for a draft article, and that a **published** article's
cover/gallery still render with no added delay.

---

### Task 5: Legislative

**Files:**
- Modify: `src/features/admin/queries/transparency.ts` (legislative
  functions only — `listAdminLegislative`, `getLegislativeForEdit`)
- Modify: `src/features/admin/actions/documents.ts:84`

**Interfaces:**
- Consumes: `resolveMediaUrl`, `resolveMediaUrlsForList` (Task 0).
- Produces: no signature changes to `getLegislativeForEdit` or
  `listAdminLegislative` (`fileUrl` stays `string | null`, just correctly
  resolved now). `uploadDocumentPdf`'s `UploadDocumentResult.url` field
  keeps its type but is now correctly resolved too (currently unused by its
  only caller, `legislative.ts`, but its own doc comment claims it's "for
  immediate preview" — fix it so that claim is true).

- [ ] **Step 1: Fix `listAdminLegislative` and `getLegislativeForEdit`**

In `src/features/admin/queries/transparency.ts`, replace the import:

```ts
import { documentUrl } from "@/lib/storage";
```

with:

```ts
import { resolveMediaUrl, resolveMediaUrlsForList } from "@/lib/media-lifecycle";
```

Replace:

```ts
export async function listAdminLegislative(): Promise<AdminLegislativeRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select(`id, slug, doc_type, number, seq_no, year, title, date_approved, status, file_path, ${ARCHIVE_SELECT}`)
    // Pending (undated) documents sort first — the repo owner's explicit
    // call, stated explicitly rather than relying on Postgres's NULLS FIRST
    // default for DESC (see 0010 migration).
    .order("date_approved", { ascending: false, nullsFirst: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    docType: row.doc_type as LegislativeType,
    seqNo: row.seq_no as number,
    year: row.year as number,
    number: row.number as string,
    title: row.title as string,
    dateApproved: row.date_approved as string | null,
    status: row.status as ContentStatus,
    hasFile: Boolean(row.file_path),
    fileUrl: row.file_path ? documentUrl(row.file_path as string) : null,
    ...toArchiveMeta(row as unknown as ArchiveMetaRow),
  }));
}
```

with:

```ts
export async function listAdminLegislative(): Promise<AdminLegislativeRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select(`id, slug, doc_type, number, seq_no, year, title, date_approved, status, file_path, ${ARCHIVE_SELECT}`)
    // Pending (undated) documents sort first — the repo owner's explicit
    // call, stated explicitly rather than relying on Postgres's NULLS FIRST
    // default for DESC (see 0010 migration).
    .order("date_approved", { ascending: false, nullsFirst: true });

  if (error || !data) return [];
  const fileUrls = await resolveMediaUrlsForList(
    "legislative",
    data.map((row) => ({
      path: row.file_path as string | null,
      status: row.status as ContentStatus,
    })),
  );
  return data.map((row, i) => ({
    id: row.id as string,
    slug: row.slug as string,
    docType: row.doc_type as LegislativeType,
    seqNo: row.seq_no as number,
    year: row.year as number,
    number: row.number as string,
    title: row.title as string,
    dateApproved: row.date_approved as string | null,
    status: row.status as ContentStatus,
    hasFile: Boolean(row.file_path),
    fileUrl: fileUrls[i],
    ...toArchiveMeta(row as unknown as ArchiveMetaRow),
  }));
}
```

Replace:

```ts
export async function getLegislativeForEdit(
  id: string,
): Promise<{ values: LegislativeValues; status: ContentStatus; fileUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select("doc_type, number, seq_no, year, title, date_approved, summary, file_path, file_size_bytes, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    values: {
      docType: data.doc_type as LegislativeType,
      seqNo: data.seq_no as number,
      year: data.year as number,
      title: data.title as string,
      dateApproved: data.date_approved as string | null,
      summary: (data.summary as string) ?? "",
      filePath: (data.file_path as string) ?? null,
      fileSizeBytes: (data.file_size_bytes as number) ?? null,
    },
    status: data.status as ContentStatus,
    fileUrl: data.file_path ? documentUrl(data.file_path as string) : null,
  };
}
```

with:

```ts
export async function getLegislativeForEdit(
  id: string,
): Promise<{ values: LegislativeValues; status: ContentStatus; fileUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select("doc_type, number, seq_no, year, title, date_approved, summary, file_path, file_size_bytes, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const status = data.status as ContentStatus;
  const filePath = (data.file_path as string) || null;
  const fileUrl = filePath ? await resolveMediaUrl("legislative", status, filePath) : null;
  return {
    values: {
      docType: data.doc_type as LegislativeType,
      seqNo: data.seq_no as number,
      year: data.year as number,
      title: data.title as string,
      dateApproved: data.date_approved as string | null,
      summary: (data.summary as string) ?? "",
      filePath: (data.file_path as string) ?? null,
      fileSizeBytes: (data.file_size_bytes as number) ?? null,
    },
    status,
    fileUrl,
  };
}
```

Leave the rest of the file (transparency documents/projects functions)
untouched here — they're Task 6.

- [ ] **Step 2: Fix `uploadDocumentPdf`'s dead-but-wrong preview URL**

In `src/features/admin/actions/documents.ts`, replace:

```ts
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

with:

```ts
import {
  ALLOWED_DOC_FILE_TYPES,
  ALLOWED_PDF_TYPES,
  MAX_DOC_FILE_BYTES,
  MAX_PDF_BYTES,
  bucketForStatus,
  extForDocType,
} from "@/lib/storage";
import { resolveMediaUrl } from "@/lib/media-lifecycle";
```

Replace:

```ts
  return { error: null, path, url: mediaUrl(bucket, path), sizeBytes: file.size };
```

with:

```ts
  const kind = folder === "legislative" ? "legislative" : "transparency";
  const url = await resolveMediaUrl(kind, status, path);
  return { error: null, path, url, sizeBytes: file.size };
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/queries/transparency.ts src/features/admin/actions/documents.ts
git commit -m "fix: resolve legislative admin previews via signed URLs"
```

- [ ] **Step 6: Manual verification note (owner, on staging)**

Open `/admin/transparency` → Legislative tab, edit a **draft** ordinance
with a PDF attached: the list's "has file" state and the edit-drawer's PDF
link should both resolve (open the link and confirm the PDF loads, not a
403). Confirm a **published** document's file link still works with no
added delay.

---

### Task 6: Transparency documents + projects

**Files:**
- Modify: `src/features/admin/queries/transparency.ts` (remaining four
  functions — `listAdminTransparencyDocuments`, `getTransparencyDocumentForEdit`,
  `listAdminTransparencyProjects`, `getTransparencyProjectForEdit`)

**Interfaces:**
- Consumes: `resolveMediaUrls` (Task 0).
- Produces: no signature changes — `getTransparencyDocumentForEdit`'s and
  `getTransparencyProjectForEdit`'s `files` arrays keep their shape, just
  correctly resolved.

- [ ] **Step 1: Add `resolveMediaUrls` to this file's import**

Task 5 already changed this file's `@/lib/media-lifecycle` import to
`import { resolveMediaUrl, resolveMediaUrlsForList } from "@/lib/media-lifecycle";`.
This task needs the per-record batch variant too — replace that line with:

```ts
import { resolveMediaUrl, resolveMediaUrls, resolveMediaUrlsForList } from "@/lib/media-lifecycle";
```

- [ ] **Step 2: Fix `getTransparencyDocumentForEdit`**

Replace:

```ts
export async function getTransparencyDocumentForEdit(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select("title, category_id, date_released, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const { data: fileRows } = await admin
    .from("transparency_files")
    .select("id, path, mime, size_bytes, sort_order")
    .eq("owner_type", "document")
    .eq("owner_id", id)
    .order("sort_order", { ascending: true });
  const files = ((fileRows ?? []) as { id: string; path: string; mime: string; size_bytes: number }[]).map(
    (f, i) => ({
      id: f.id,
      url: documentUrl(f.path),
      label: f.mime === "application/pdf" ? `Document ${i + 1}` : `Image ${i + 1}`,
      mime: f.mime,
      sizeBytes: f.size_bytes,
    }),
  );
  return {
    values: {
      title: data.title as string,
      categoryId: data.category_id as string,
      dateReleased: data.date_released as string | null,
    } satisfies TransparencyDocumentValues,
    status: data.status as ContentStatus,
    files,
  };
}
```

with:

```ts
export async function getTransparencyDocumentForEdit(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select("title, category_id, date_released, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const status = data.status as ContentStatus;
  const { data: fileRows } = await admin
    .from("transparency_files")
    .select("id, path, mime, size_bytes, sort_order")
    .eq("owner_type", "document")
    .eq("owner_id", id)
    .order("sort_order", { ascending: true });
  const rows = (fileRows ?? []) as { id: string; path: string; mime: string; size_bytes: number }[];
  const urlByPath = await resolveMediaUrls("transparency", status, rows.map((f) => f.path));
  const files = rows.map((f, i) => ({
    id: f.id,
    url: urlByPath.get(f.path) ?? f.path,
    label: f.mime === "application/pdf" ? `Document ${i + 1}` : `Image ${i + 1}`,
    mime: f.mime,
    sizeBytes: f.size_bytes,
  }));
  return {
    values: {
      title: data.title as string,
      categoryId: data.category_id as string,
      dateReleased: data.date_released as string | null,
    } satisfies TransparencyDocumentValues,
    status,
    files,
  };
}
```

- [ ] **Step 3: Fix `getTransparencyProjectForEdit`**

Replace:

```ts
export async function getTransparencyProjectForEdit(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_projects")
    .select("name, progress, date, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const { data: fileRows } = await admin
    .from("transparency_files")
    .select("id, path, mime, size_bytes, sort_order")
    .eq("owner_type", "project")
    .eq("owner_id", id)
    .order("sort_order", { ascending: true });
  const files = ((fileRows ?? []) as { id: string; path: string; mime: string; size_bytes: number }[]).map(
    (f, i) => ({
      id: f.id,
      url: documentUrl(f.path),
      label: f.mime === "application/pdf" ? `Document ${i + 1}` : `Image ${i + 1}`,
      mime: f.mime,
      sizeBytes: f.size_bytes,
    }),
  );
  return {
    values: {
      name: data.name as string,
      progress: data.progress as number,
      date: data.date as string | null,
    } satisfies TransparencyProjectValues,
    status: data.status as ContentStatus,
    files,
  };
}
```

with:

```ts
export async function getTransparencyProjectForEdit(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_projects")
    .select("name, progress, date, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const status = data.status as ContentStatus;
  const { data: fileRows } = await admin
    .from("transparency_files")
    .select("id, path, mime, size_bytes, sort_order")
    .eq("owner_type", "project")
    .eq("owner_id", id)
    .order("sort_order", { ascending: true });
  const rows = (fileRows ?? []) as { id: string; path: string; mime: string; size_bytes: number }[];
  const urlByPath = await resolveMediaUrls("transparency", status, rows.map((f) => f.path));
  const files = rows.map((f, i) => ({
    id: f.id,
    url: urlByPath.get(f.path) ?? f.path,
    label: f.mime === "application/pdf" ? `Document ${i + 1}` : `Image ${i + 1}`,
    mime: f.mime,
    sizeBytes: f.size_bytes,
  }));
  return {
    values: {
      name: data.name as string,
      progress: data.progress as number,
      date: data.date as string | null,
    } satisfies TransparencyProjectValues,
    status,
    files,
  };
}
```

`listAdminTransparencyDocuments` and `listAdminTransparencyProjects` need no
change — they only return a `fileCount`, never a URL.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean, no unused-import errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/queries/transparency.ts
git commit -m "fix: resolve transparency documents/projects admin previews via signed URLs"
```

- [ ] **Step 7: Manual verification note (owner, on staging)**

Open `/admin/transparency` → Disclosure Documents and Monitored Projects
tabs, edit a **draft** record of each with an attached file: the edit-drawer
file link should resolve and open (not 403). Confirm a **published**
record's file link still works with no added delay.

---

### Task 7: Final whole-branch review

**Files:** none created or modified directly — this is a review pass over
Tasks 0–6's combined diff.

- [ ] **Step 1: Full typecheck + lint across the branch**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 2: Grep for any remaining old-helper call site**

Run: `grep -rn "photoUrl(\|documentUrl(" src/features/admin`
Expected: no output. (`photoUrl`/`documentUrl` may still be imported and
used correctly elsewhere in the codebase — e.g. nowhere else, since the
earlier investigation for this plan found every call site lived under
`src/features/admin`; this grep is the closing check that none were missed.)

Run: `grep -rn "mediaUrl(bucket" src/features/admin`
Expected: no output — confirms the two disguised call sites
(`achievement-photos.ts`, `news.ts`) and the dead-code one (`documents.ts`)
were all fixed, and no other instance of this pattern was missed.

- [ ] **Step 3: Dispatch a review subagent**

Use a `feature-dev:code-reviewer` (or equivalent) subagent over the full
diff from Task 0 through Task 6, with this specific instruction: **check
every call site for the "published skips the network call" invariant** —
that no code path added here calls `resolveMediaUrl`/`resolveMediaUrls`/
`resolveMediaUrlsForList` (or otherwise touches Storage) when a row's status
is already `published`. This mirrors the review instruction that caught the
real security bug in Plan 2 (the demote-on-any-exit gap) — the equivalent
risk in this plan is a performance regression on the by-far-most-common
case (published content), not a security hole, but it's the same kind of
"check every path, not just the one exercised by a button" scrutiny.

- [ ] **Step 4: Update CLAUDE.md**

Per this repo's own standing rule (top of `CLAUDE.md`: "every session that
changes code updates this file in the same session"), update the
media-bucket-split bullet: remove or correct the "three documented
admin-preview call sites" framing, note that `resolveMediaUrl`/
`resolveMediaUrls`/`resolveMediaUrlsForList` are now wired into every admin
list and edit-drawer preview across all six content types, and record that
this closes out the deferred signed-preview gap named in the original
2026-07-27 design doc.

- [ ] **Step 5: Commit the CLAUDE.md update**

```bash
git add CLAUDE.md
git commit -m "docs: record signed-preview wiring completion in CLAUDE.md"
```
