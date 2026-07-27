# Media Bucket Split — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the 14 new per-type Storage buckets, the pure bucket-naming
helpers, the copy/promote/demote and signed-URL-resolution primitives, and
the one-time data-migration script — with nothing in the running application
yet pointed at any of it. This is Plan 1 of a sequence (see
`docs/superpowers/specs/2026-07-27-media-bucket-split-design.md`); later
plans wire promote/demote into the six content types' publish/archive
actions and switch admin previews to signed URLs. This plan alone is
low-risk: every existing Server Action, query, and page keeps using
`public-media`/`public-documents` exactly as it does today.

**Architecture:** Object path strings never change — only which bucket holds
a given path changes with a record's status. New pure helpers in
`src/lib/storage.ts` compute bucket names from a `MediaKind` + `ContentStatus`
pair; a new `src/lib/media-lifecycle.ts` module holds the Supabase-calling
primitives (copy between buckets, mint signed URLs) that later plans will
call from inside publish/archive actions and admin query loaders.

**Tech Stack:** Next.js 16 Server Actions, `@supabase/supabase-js` service-role
client, Vitest (pure-function tests only — this project's established
convention is that Supabase-calling code is verified by typecheck + lint +
manual review, not mocked-client unit tests; see `CLAUDE.md`'s Commands
section).

## Global Constraints

- Path alias `@/*` → `src/*`.
- zod is v4 — use `z.uuid()`, not the deprecated v3 `z.string().uuid()`.
- `npm run typecheck` and `npm run lint` must both pass clean before any task
  is considered done.
- Never `git add -A` — this repo has intentionally-untracked directories
  (`proposal/`, `stitch_tabbed_content_manager/`) at the root. Stage explicit
  paths only.
- Migrations are applied manually by the project owner against live Supabase
  environments — never assume a migration in this plan has been applied.
- Whenever a new numbered migration lands, `supabase/baseline/0000_baseline_2026-07-23.sql`
  must be updated in the same commit, in the baseline's own final-form style
  (not "run 0028 after") — see `supabase/migrations/README.md`.
- Object path strings must not change anywhere in this plan — only bucket
  targets change. No database column changes anywhere in this plan.
- Every new function needs a one-line doc comment only when the *why* is
  non-obvious — no comments that restate the signature.

---

### Task 1: Bucket-naming and URL helpers

**Files:**
- Modify: `src/lib/storage.ts`
- Test: `tests/unit/storage.test.ts` (new file)

**Interfaces:**
- Consumes: `ContentStatus` from `@/types` (existing: `"draft" | "in-review" | "published" | "archived"`).
- Produces (for later tasks/plans to consume):
  - `type MediaKind = "news" | "officials" | "events" | "announcements" | "legislative" | "transparency"`
  - `function publicBucketFor(kind: MediaKind): string`
  - `function draftBucketFor(kind: MediaKind): string`
  - `function bucketForStatus(kind: MediaKind, status: ContentStatus): string`
  - `const SITE_MEDIA_BUCKET: string`
  - `const AVATARS_MEDIA_BUCKET: string`
  - `function mediaUrl(bucket: string, path: string): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AVATARS_MEDIA_BUCKET,
  SITE_MEDIA_BUCKET,
  bucketForStatus,
  draftBucketFor,
  mediaUrl,
  publicBucketFor,
} from "@/lib/storage";

describe("publicBucketFor", () => {
  it("appends -media to the content kind", () => {
    expect(publicBucketFor("news")).toBe("news-media");
    expect(publicBucketFor("transparency")).toBe("transparency-media");
  });
});

describe("draftBucketFor", () => {
  it("appends -drafts to the content kind", () => {
    expect(draftBucketFor("officials")).toBe("officials-drafts");
  });
});

describe("bucketForStatus", () => {
  it("resolves to the public bucket only when published", () => {
    expect(bucketForStatus("events", "published")).toBe("events-media");
  });

  it("resolves to the drafts bucket for draft, in-review, and archived", () => {
    expect(bucketForStatus("events", "draft")).toBe("events-drafts");
    expect(bucketForStatus("events", "in-review")).toBe("events-drafts");
    expect(bucketForStatus("events", "archived")).toBe("events-drafts");
  });
});

describe("always-public buckets", () => {
  it("are fixed names with no status parameter", () => {
    expect(SITE_MEDIA_BUCKET).toBe("site-media");
    expect(AVATARS_MEDIA_BUCKET).toBe("avatars-media");
  });
});

describe("mediaUrl", () => {
  it("passes a full remote URL through unchanged", () => {
    expect(mediaUrl("news-media", "https://lh3.googleusercontent.com/foo.jpg")).toBe(
      "https://lh3.googleusercontent.com/foo.jpg",
    );
  });

  it("builds a public object URL for a bare path", () => {
    expect(mediaUrl("news-media", "news/abc-123/photo.jpg")).toContain(
      "/storage/v1/object/public/news-media/news/abc-123/photo.jpg",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storage.test.ts`
Expected: FAIL — `publicBucketFor`, `draftBucketFor`, `bucketForStatus`,
`SITE_MEDIA_BUCKET`, `AVATARS_MEDIA_BUCKET`, `mediaUrl` are not exported yet.

- [ ] **Step 3: Implement the helpers**

In `src/lib/storage.ts`, add near the top (after the existing
`PUBLIC_MEDIA_BUCKET`/`ALLOWED_IMAGE_TYPES` constants, before `photoUrl`):

```ts
import type { ContentStatus } from "@/types";

/**
 * The six content types with a draft → in-review → published → archived
 * lifecycle. Each gets a public/private bucket pair — see `publicBucketFor`
 * / `draftBucketFor`. Achievement photos ride on their parent official's
 * status and use the "officials" kind; they have no lifecycle of their own.
 */
export type MediaKind =
  | "news"
  | "officials"
  | "events"
  | "announcements"
  | "legislative"
  | "transparency";

/** The world-readable bucket for a content type — published media only. */
export function publicBucketFor(kind: MediaKind): string {
  return `${kind}-media`;
}

/** The service-role-only bucket for a content type — draft/in-review/archived media. */
export function draftBucketFor(kind: MediaKind): string {
  return `${kind}-drafts`;
}

/** Which bucket a status-aware type's media currently lives in. */
export function bucketForStatus(kind: MediaKind, status: ContentStatus): string {
  return status === "published" ? publicBucketFor(kind) : draftBucketFor(kind);
}

/** Home/About images — Save writes live, so there is no draft state to stage. */
export const SITE_MEDIA_BUCKET = "site-media";

/** Staff avatars — own-photo-only, no review step, no draft state either. */
export const AVATARS_MEDIA_BUCKET = "avatars-media";

/**
 * Resolve a stored path to a public URL for a bucket that is actually
 * public. A full remote URL (seed rows) passes through unchanged. Callers
 * must not use this for a `-drafts` bucket — see `resolveMediaUrl` in
 * `media-lifecycle.ts`, which signs a URL instead when the bucket is private.
 */
export function mediaUrl(bucket: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
```

Note `SUPABASE_URL` already exists as a module-level `const` in this file
(above `photoUrl`) — reuse it, don't redeclare it. Leave `PUBLIC_MEDIA_BUCKET`,
`PUBLIC_DOCUMENTS_BUCKET`, `photoUrl`, and `documentUrl` completely untouched;
they still back every existing call site and will only be retired in a later
plan once every caller has moved to the new helpers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storage.test.ts`
Expected: PASS, all 7 assertions.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts tests/unit/storage.test.ts
git commit -m "feat: add per-type media bucket naming helpers"
```

---

### Task 2: New buckets migration, baseline update, and seed-script repoint

**Files:**
- Create: `supabase/migrations/0028_media_buckets.sql`
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:1140-1191` (STORAGE BUCKETS section)
- Modify: `scripts/upload-official-portraits.mjs`
- Modify: `scripts/upload-site-images.mjs`

**Interfaces:**
- Consumes: nothing from Task 1 (bucket *names* here are literal SQL/JS
  strings — `MediaKind` is a TypeScript-only concept, not available in
  `.sql`/`.mjs` files — but the literal strings must match Task 1's
  `publicBucketFor`/`draftBucketFor`/`SITE_MEDIA_BUCKET`/`AVATARS_MEDIA_BUCKET`
  output exactly: `news-media`, `news-drafts`, `officials-media`,
  `officials-drafts`, `events-media`, `events-drafts`,
  `announcements-media`, `announcements-drafts`, `legislative-media`,
  `legislative-drafts`, `transparency-media`, `transparency-drafts`,
  `site-media`, `avatars-media`.
- Produces: the 14 buckets exist (once the owner applies this migration to
  an environment) for Task 3/4 and later plans' code to target.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0028_media_buckets.sql`:

```sql
-- Splits the two shared media buckets (public-media, public-documents) into
-- one public/private pair per status-aware content type, plus two simple
-- always-public buckets for content with no draft lifecycle (site, avatars).
--
-- Supabase Storage's list() operation is gated by the same RLS SELECT policy
-- as an individual object GET — there is no way to grant "read one file"
-- without also granting "list every file in the bucket". The existing single
-- `for select to public using (bucket_id = 'public-media')` policy (see
-- 0007_news_content.sql) therefore makes every draft/in-review/archived
-- photo anonymously enumerable, even though the site never links to it.
-- Splitting drafts into a private bucket per type closes that gap.
--
-- This migration only creates buckets and policies. It does not touch any
-- existing table and does not move any existing object — public-media and
-- public-documents keep working exactly as before until a later plan wires
-- the application over to these new buckets and the data-migration script
-- (scripts/migrate-media-buckets.mjs) copies existing objects across. See
-- docs/superpowers/specs/2026-07-27-media-bucket-split-design.md.

-- ── Public buckets: published media only, world-readable ───────────────────
insert into storage.buckets (id, name, public) values
  ('news-media', 'news-media', true),
  ('officials-media', 'officials-media', true),
  ('events-media', 'events-media', true),
  ('announcements-media', 'announcements-media', true),
  ('legislative-media', 'legislative-media', true),
  ('transparency-media', 'transparency-media', true),
  ('site-media', 'site-media', true),
  ('avatars-media', 'avatars-media', true)
  on conflict (id) do nothing;

create policy "public read news-media" on storage.objects
  for select to public using (bucket_id = 'news-media');
create policy "public read officials-media" on storage.objects
  for select to public using (bucket_id = 'officials-media');
create policy "public read events-media" on storage.objects
  for select to public using (bucket_id = 'events-media');
create policy "public read announcements-media" on storage.objects
  for select to public using (bucket_id = 'announcements-media');
create policy "public read legislative-media" on storage.objects
  for select to public using (bucket_id = 'legislative-media');
create policy "public read transparency-media" on storage.objects
  for select to public using (bucket_id = 'transparency-media');
create policy "public read site-media" on storage.objects
  for select to public using (bucket_id = 'site-media');
create policy "public read avatars-media" on storage.objects
  for select to public using (bucket_id = 'avatars-media');

-- ── Private buckets: draft/in-review/archived media, service-role only ─────
-- No read policy, deliberately — same shape as feedback-media (0023). The
-- service-role client (used by every Server Action) bypasses RLS entirely;
-- anonymous and authenticated roles get nothing.
insert into storage.buckets (id, name, public) values
  ('news-drafts', 'news-drafts', false),
  ('officials-drafts', 'officials-drafts', false),
  ('events-drafts', 'events-drafts', false),
  ('announcements-drafts', 'announcements-drafts', false),
  ('legislative-drafts', 'legislative-drafts', false),
  ('transparency-drafts', 'transparency-drafts', false)
  on conflict (id) do nothing;
```

- [ ] **Step 2: Update the baseline file's STORAGE BUCKETS section**

Open `supabase/baseline/0000_baseline_2026-07-23.sql` and replace lines
1140–1191 (the entire `-- 11. STORAGE BUCKETS [0007, 0009, 0023]` section,
from the `════` header through the `public-documents` policy) with:

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- 11. STORAGE BUCKETS                          [0007, 0009, 0023, 0028]
-- ════════════════════════════════════════════════════════════════════════════
-- One public/private bucket pair per status-aware content type, plus two
-- always-public buckets for content with no draft lifecycle, plus one
-- private bucket for anonymous feedback screenshots.
--
--   news-media / news-drafts                  news photos
--   officials-media / officials-drafts         portraits, achievement photos
--   events-media / events-drafts               event covers
--   announcements-media / announcements-drafts announcement images
--   legislative-media / legislative-drafts     ordinance/resolution PDFs
--   transparency-media / transparency-drafts   transparency documents/projects' files
--   site-media                                 Home/About imagery (no draft state — Save writes live)
--   avatars-media                              staff avatars (no draft state — own-photo-only)
--   feedback-media                             PRIVATE. Screenshots attached to anonymous site feedback.
--
-- Draft/in-review/archived media lives only in a `-drafts` bucket, which
-- carries no read policy at all — Supabase Storage's list() rides the same
-- RLS SELECT policy as an individual object GET, so a public-read policy on
-- a bucket also makes it anonymously enumerable. Media is promoted from a
-- `-drafts` bucket to its `-media` counterpart the moment a record is
-- published, and demoted back on archive — see src/lib/media-lifecycle.ts.
--
-- storage.objects gets a public-read policy on every `-media`/`site-media`/
-- `avatars-media` bucket, so a browser can fetch an uploaded file once it is
-- actually published. There is no anon/authenticated write policy anywhere:
-- uploads go through the service-role client, which bypasses RLS, after the
-- Server Action re-checks type and size server-side (never trusting the
-- client).
--
-- Uploads defer to Save: every uploader is a pure file picker making no
-- network calls, and the save action compensating-deletes the object if the
-- row write fails — so "a storage object exists only if a row references it"
-- holds by construction.

insert into storage.buckets (id, name, public) values
  ('news-media', 'news-media', true),
  ('officials-media', 'officials-media', true),
  ('events-media', 'events-media', true),
  ('announcements-media', 'announcements-media', true),
  ('legislative-media', 'legislative-media', true),
  ('transparency-media', 'transparency-media', true),
  ('site-media', 'site-media', true),
  ('avatars-media', 'avatars-media', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values
  ('news-drafts', 'news-drafts', false),
  ('officials-drafts', 'officials-drafts', false),
  ('events-drafts', 'events-drafts', false),
  ('announcements-drafts', 'announcements-drafts', false),
  ('legislative-drafts', 'legislative-drafts', false),
  ('transparency-drafts', 'transparency-drafts', false)
  on conflict (id) do nothing;

-- PRIVATE. A screenshot of the page a resident was looking at can contain
-- their own account page, their ticket, or their name; a public bucket would
-- leave that readable by anyone holding the URL, forever. There is
-- deliberately NO read policy below: the service-role client is the only
-- reader and it mints a short-lived signed URL per page load.
insert into storage.buckets (id, name, public)
  values ('feedback-media', 'feedback-media', false)
  on conflict (id) do nothing;

drop policy if exists "public read news-media" on storage.objects;
create policy "public read news-media" on storage.objects
  for select to public using (bucket_id = 'news-media');
drop policy if exists "public read officials-media" on storage.objects;
create policy "public read officials-media" on storage.objects
  for select to public using (bucket_id = 'officials-media');
drop policy if exists "public read events-media" on storage.objects;
create policy "public read events-media" on storage.objects
  for select to public using (bucket_id = 'events-media');
drop policy if exists "public read announcements-media" on storage.objects;
create policy "public read announcements-media" on storage.objects
  for select to public using (bucket_id = 'announcements-media');
drop policy if exists "public read legislative-media" on storage.objects;
create policy "public read legislative-media" on storage.objects
  for select to public using (bucket_id = 'legislative-media');
drop policy if exists "public read transparency-media" on storage.objects;
create policy "public read transparency-media" on storage.objects
  for select to public using (bucket_id = 'transparency-media');
drop policy if exists "public read site-media" on storage.objects;
create policy "public read site-media" on storage.objects
  for select to public using (bucket_id = 'site-media');
drop policy if exists "public read avatars-media" on storage.objects;
create policy "public read avatars-media" on storage.objects
  for select to public using (bucket_id = 'avatars-media');
```

This means a **brand-new** environment built from the baseline gets the new
14-bucket layout directly and never creates `public-media`/`public-documents`
at all — it has no existing data to migrate, so there's nothing for those
buckets to hold. Only an **existing** environment (staging today) needs
migration `0028` to add the new buckets alongside its still-live
`public-media`/`public-documents`, followed later by the data-migration
script and a manual cleanup of the two old buckets once verified.

Also update the baseline's seed-script checklist comment near line 25-26
(`-- 1. node scripts/upload-official-portraits.mjs ...`) to read:

```sql
--   1. node scripts/upload-official-portraits.mjs   (officials seed → officials-media/officials/)
--   2. node scripts/upload-site-images.mjs          (site content seed → site-media/site/)
```

And the confirmation checklist near the old line 1780-1782
(`-- 4. Confirm all three Storage buckets exist...`) to read:

```sql
--   4. Confirm all 15 Storage buckets exist: the eight `-media` buckets and
--      `site-media`/`avatars-media` PUBLIC, the six `-drafts` buckets and
--      feedback-media PRIVATE. A public drafts bucket would expose
--      unpublished content to anyone holding the URL; a public feedback-media
--      would expose residents' screenshots to anyone holding a
```

(Keep whatever the line originally continued with after "holding a" — only
the bucket-count/name portion of that sentence changes.)

- [ ] **Step 3: Repoint the two existing seed scripts**

In `scripts/upload-official-portraits.mjs`, change:

```js
  const { error } = await supabase.storage
    .from("public-media")
    .upload(path, body, { contentType, upsert: true });
```

to:

```js
  const { error } = await supabase.storage
    .from("officials-media")
    .upload(path, body, { contentType, upsert: true });
```

and update the header comment (lines 1-2) from `` push the 12 bundled
official portraits to the `public-media` bucket `` to `` push the 12 bundled
official portraits to the `officials-media` bucket ``. All 12 seeded
officials are published by `0012_officials.sql`, so `officials-media` (the
public bucket) is the correct target — nothing here goes to
`officials-drafts`.

In `scripts/upload-site-images.mjs`, change:

```js
  const { error } = await supabase.storage
    .from("public-media")
    .upload(path, body, { contentType, upsert: true });
```

to:

```js
  const { error } = await supabase.storage
    .from("site-media")
    .upload(path, body, { contentType, upsert: true });
```

and update its header comment the same way (`` push ... to the `site-media`
bucket ``). `site-media` has no draft/published split at all, so there is no
ambiguity about which bucket this seed data belongs in.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean. (These two scripts are plain `.mjs`, outside the
TypeScript project and outside ESLint's configured scope — this step
confirms nothing else broke, not that the scripts themselves are checked.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0028_media_buckets.sql supabase/baseline/0000_baseline_2026-07-23.sql scripts/upload-official-portraits.mjs scripts/upload-site-images.mjs
git commit -m "feat: add per-type media buckets migration and baseline"
```

---

### Task 3: Copy/promote/demote primitives

**Files:**
- Create: `src/lib/media-lifecycle.ts`

**Interfaces:**
- Consumes: `MediaKind`, `publicBucketFor`, `draftBucketFor` from
  `src/lib/storage.ts` (Task 1); `createSupabaseAdminClient` from
  `@/lib/supabase/admin` (existing).
- Produces (for later plans to consume):
  - `function promoteMedia(kind: MediaKind, paths: string[]): Promise<{ error: string | null }>`
  - `function demoteMedia(kind: MediaKind, paths: string[], context: string): Promise<void>`

- [ ] **Step 1: Implement `promoteMedia` and `demoteMedia`**

Create `src/lib/media-lifecycle.ts`:

```ts
import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type MediaKind, draftBucketFor, publicBucketFor } from "@/lib/storage";

/**
 * Copy every path in `paths` from `sourceBucket` to `destBucket`, leaving the
 * source untouched. Stops and reports the first failure — a partial copy is
 * the caller's problem to decide how to handle (see `promoteMedia` vs
 * `demoteMedia` below, which handle a failure very differently).
 */
async function copyObjects(
  sourceBucket: string,
  destBucket: string,
  paths: string[],
): Promise<{ error: string | null }> {
  const admin = createSupabaseAdminClient();
  for (const path of paths) {
    const { data: file, error: downloadErr } = await admin.storage
      .from(sourceBucket)
      .download(path);
    if (downloadErr || !file) {
      return { error: `Could not read ${path} from ${sourceBucket}.` };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from(destBucket)
      .upload(path, buffer, { contentType: file.type || undefined, upsert: true });
    if (uploadErr) {
      return { error: `Could not write ${path} to ${destBucket}.` };
    }
  }
  return { error: null };
}

/** Best-effort remove — logs and swallows, never throws, never fails the caller. */
async function bestEffortRemove(bucket: string, paths: string[], context: string): Promise<void> {
  if (paths.length === 0) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) {
    console.error(`Orphaned storage objects (${context}): ${paths.join(", ")}`);
  }
}

/**
 * Called before flipping a record's status to "published". Copies every path
 * from `<kind>-drafts` to `<kind>-media`. Returns an error if ANY copy fails
 * — the caller MUST abort the publish rather than let the row read
 * "published" while its media still lives only in the private bucket, which
 * would surface a broken image on a live public page. Remote seed URLs
 * (`https://...`) are skipped — they were never uploaded to either bucket.
 */
export async function promoteMedia(
  kind: MediaKind,
  paths: string[],
): Promise<{ error: string | null }> {
  const owned = paths.filter((p) => !/^https?:\/\//i.test(p));
  if (owned.length === 0) return { error: null };
  const result = await copyObjects(draftBucketFor(kind), publicBucketFor(kind), owned);
  if (result.error) return result;
  await bestEffortRemove(draftBucketFor(kind), owned, `${kind} promote cleanup`);
  return { error: null };
}

/**
 * Called after a record's status has already flipped away from "published"
 * — specifically, only when archiving something that WAS published (see the
 * publish/archive wiring plan for exactly which transitions call this).
 * Copies every path back from `<kind>-media` to `<kind>-drafts`. Best-effort:
 * the row is already excluded from public listings by its status regardless
 * of whether this fully succeeds, so a failure is logged, not surfaced to
 * the user whose archive action already committed.
 */
export async function demoteMedia(
  kind: MediaKind,
  paths: string[],
  context: string,
): Promise<void> {
  const owned = paths.filter((p) => !/^https?:\/\//i.test(p));
  if (owned.length === 0) return;
  const result = await copyObjects(publicBucketFor(kind), draftBucketFor(kind), owned);
  if (result.error) {
    console.error(`Could not demote media (${context}): ${result.error}`);
    return;
  }
  await bestEffortRemove(publicBucketFor(kind), owned, context);
}
```

`server-only` matches this project's convention for modules that hold a
service-role client and must never end up in a client bundle (see
`src/lib/media.ts`'s identical import).

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

There is deliberately no Vitest test for this file: every exported function
makes a live Supabase Storage call, and this project's established
convention (see `CLAUDE.md`'s Commands section and every prior Storage-
touching plan in `docs/superpowers/plans/`) is that such code is verified by
typecheck, lint, and a manual runtime sweep once deployed to staging — not
by mocking the Supabase client in a unit test. The remote-URL filter
(`/^https?:\/\//i.test(p)`) is the only branch of pure logic here, and it is
identical to the untested filter already used throughout
`src/features/admin/actions/*.ts` (e.g. `deleteNewsArticle`'s photo-path
filter) — not worth a new testing pattern for one regex.

- [ ] **Step 3: Commit**

```bash
git add src/lib/media-lifecycle.ts
git commit -m "feat: add promoteMedia/demoteMedia storage primitives"
```

---

### Task 4: Signed-URL resolution for admin previews

**Files:**
- Modify: `src/lib/media-lifecycle.ts`

**Interfaces:**
- Consumes: `MediaKind`, `publicBucketFor`, `draftBucketFor` from
  `src/lib/storage.ts`, `mediaUrl` from `src/lib/storage.ts` (Task 1);
  `ContentStatus` from `@/types`.
- Produces (for a later plan's query-loader wiring to consume):
  - `function resolveMediaUrl(kind: MediaKind, status: ContentStatus, path: string): Promise<string | null>`
  - `function resolveMediaUrls(kind: MediaKind, status: ContentStatus, paths: string[]): Promise<Map<string, string>>`

- [ ] **Step 1: Implement the resolvers**

Add to `src/lib/media-lifecycle.ts` (below the Task 3 functions):

```ts
import { mediaUrl } from "@/lib/storage";
import type { ContentStatus } from "@/types";

/** Ten minutes: long enough to open a preview, short enough to be worthless if leaked — matches `listFeedback`'s convention. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Resolve one stored path to a URL an admin editor can render. Published
 * content resolves to the plain public URL (no round trip); anything else
 * mints a short-lived signed URL against the private drafts bucket, since
 * that bucket has no public-read policy. A full remote seed URL passes
 * through unchanged either way.
 *
 * This does not gate who may call it — the existing `checkPermission(...)`
 * check on the admin action/query that calls this is what decides that. This
 * function only decides how to fetch the bytes once that check has passed.
 */
export async function resolveMediaUrl(
  kind: MediaKind,
  status: ContentStatus,
  path: string,
): Promise<string | null> {
  if (/^https?:\/\//i.test(path)) return path;
  if (status === "published") return mediaUrl(publicBucketFor(kind), path);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(draftBucketFor(kind))
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Batch form of `resolveMediaUrl` for a record with multiple files (news
 * photos, achievement photos, transparency files) — signs every owned path
 * in one Storage call instead of one round trip per file, mirroring
 * `listFeedback`'s `createSignedUrls` batch pattern.
 */
export async function resolveMediaUrls(
  kind: MediaKind,
  status: ContentStatus,
  paths: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const remote = paths.filter((p) => /^https?:\/\//i.test(p));
  for (const p of remote) result.set(p, p);

  const owned = paths.filter((p) => !/^https?:\/\//i.test(p));
  if (owned.length === 0) return result;

  if (status === "published") {
    for (const p of owned) result.set(p, mediaUrl(publicBucketFor(kind), p));
    return result;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(draftBucketFor(kind))
    .createSignedUrls(owned, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error(`resolveMediaUrls signing failed (${kind}):`, error.message);
    return result;
  }
  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl);
  }
  return result;
}
```

Move the two new imports (`mediaUrl`, `ContentStatus`) up to the file's
existing import block at the top rather than leaving them inline — this
listing shows them near their first use purely for readability in this plan.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

No Vitest test, for the same reason as Task 3 — both functions are
Storage-calling. The remote-URL passthrough branches are the same untested
regex pattern used everywhere else in this codebase.

- [ ] **Step 3: Commit**

```bash
git add src/lib/media-lifecycle.ts
git commit -m "feat: add resolveMediaUrl/resolveMediaUrls signed-URL resolution"
```

---

### Task 5: Data-migration script for existing objects

**Files:**
- Create: `scripts/migrate-media-buckets.mjs`

**Interfaces:**
- Consumes: nothing from the TypeScript codebase (plain Node ESM script,
  same convention as `scripts/upload-site-images.mjs`) — bucket name
  literals must match Task 2's migration exactly.
- Produces: nothing consumed by app code — this is a one-time operational
  script the project owner runs by hand against a real Supabase environment.

- [ ] **Step 1: Write the script**

Create `scripts/migrate-media-buckets.mjs`:

```js
// One-time data migration: after applying 0028_media_buckets.sql, copy every
// existing object out of the old public-media/public-documents buckets into
// the correct new per-type bucket — the PUBLIC one if the owning record is
// currently `published`, the PRIVATE `-drafts` one otherwise.
//
// Run ONCE PER ENVIRONMENT, after 0028 has been applied:
//   node scripts/migrate-media-buckets.mjs
//
// Read-only against the database and additive against Storage (upsert:
// true) — it only copies, it never deletes anything from public-media or
// public-documents. Deleting the two old buckets is a separate, manual step
// you take later, once you've confirmed the new buckets look right.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of (await readFile(".env.local", "utf8")).split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isRemote = (path) => /^https?:\/\//i.test(path ?? "");

/** Copy one object from `sourceBucket` to `destBucket` at the same path. */
async function copyObject(sourceBucket, destBucket, path) {
  const { data: file, error: downloadErr } = await supabase.storage.from(sourceBucket).download(path);
  if (downloadErr || !file) return { error: `download ${sourceBucket}/${path}: ${downloadErr?.message ?? "not found"}` };
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(destBucket)
    .upload(path, buffer, { contentType: file.type || undefined, upsert: true });
  if (uploadErr) return { error: `upload ${destBucket}/${path}: ${uploadErr.message}` };
  return { error: null };
}

let ok = 0;
let failed = 0;

/** Copy one path, given the owning record's current status. Skips remote seed URLs. */
async function migrateOne(kind, status, path) {
  if (isRemote(path)) return;
  const destBucket = status === "published" ? `${kind}-media` : `${kind}-drafts`;
  const { error } = await copyObject("public-media", destBucket, path);
  if (error) {
    console.error(`FAIL [${kind}] ${path}: ${error}`);
    failed += 1;
  } else {
    ok += 1;
  }
}

/** Same as migrateOne, but the source is public-documents, not public-media. */
async function migrateOneDocument(kind, status, path) {
  if (isRemote(path)) return;
  const destBucket = status === "published" ? `${kind}-media` : `${kind}-drafts`;
  const { error } = await copyObject("public-documents", destBucket, path);
  if (error) {
    console.error(`FAIL [${kind}] ${path}: ${error}`);
    failed += 1;
  } else {
    ok += 1;
  }
}

/** Always-public content (no status split): copy straight to its one bucket. */
async function migrateAlwaysPublic(bucket, path) {
  if (isRemote(path)) return;
  const { error } = await copyObject("public-media", bucket, path);
  if (error) {
    console.error(`FAIL [${bucket}] ${path}: ${error}`);
    failed += 1;
  } else {
    ok += 1;
  }
}

console.log("Migrating news articles' photos...");
{
  const { data: photos, error } = await supabase
    .from("news_photos")
    .select("src, news_articles!inner(status)");
  if (error) throw error;
  for (const row of photos ?? []) {
    await migrateOne("news", row.news_articles.status, row.src);
  }
}

console.log("Migrating officials' portraits...");
{
  const { data: officials, error } = await supabase.from("officials").select("status, photo_path");
  if (error) throw error;
  for (const row of officials ?? []) {
    if (row.photo_path) await migrateOne("officials", row.status, row.photo_path);
  }
}

console.log("Migrating officials' achievement photos...");
{
  const { data: photos, error } = await supabase
    .from("official_achievement_photos")
    .select("src, official_achievements!inner(officials!inner(status))");
  if (error) throw error;
  for (const row of photos ?? []) {
    const status = row.official_achievements.officials.status;
    await migrateOne("officials", status, row.src);
  }
}

console.log("Migrating event covers...");
{
  const { data: events, error } = await supabase.from("events").select("status, cover_src");
  if (error) throw error;
  for (const row of events ?? []) {
    if (row.cover_src) await migrateOne("events", row.status, row.cover_src);
  }
}

console.log("Migrating announcement images...");
{
  const { data: rows, error } = await supabase.from("announcements").select("status, image_src");
  if (error) throw error;
  for (const row of rows ?? []) {
    if (row.image_src) await migrateOne("announcements", row.status, row.image_src);
  }
}

console.log("Migrating legislative document PDFs...");
{
  const { data: rows, error } = await supabase.from("legislative_documents").select("status, file_path");
  if (error) throw error;
  for (const row of rows ?? []) {
    if (row.file_path) await migrateOneDocument("legislative", row.status, row.file_path);
  }
}

console.log("Migrating transparency documents' files...");
{
  const { data: rows, error } = await supabase
    .from("transparency_files")
    .select("path, owner_type, owner_id");
  if (error) throw error;
  const documentRows = (rows ?? []).filter((r) => r.owner_type === "document");
  const projectRows = (rows ?? []).filter((r) => r.owner_type === "project");

  const docIds = [...new Set(documentRows.map((r) => r.owner_id))];
  const projectIds = [...new Set(projectRows.map((r) => r.owner_id))];

  const docStatus = new Map();
  if (docIds.length > 0) {
    const { data, error: e } = await supabase.from("transparency_documents").select("id, status").in("id", docIds);
    if (e) throw e;
    for (const d of data ?? []) docStatus.set(d.id, d.status);
  }
  const projectStatus = new Map();
  if (projectIds.length > 0) {
    const { data, error: e } = await supabase.from("transparency_projects").select("id, status").in("id", projectIds);
    if (e) throw e;
    for (const p of data ?? []) projectStatus.set(p.id, p.status);
  }

  for (const row of documentRows) {
    const status = docStatus.get(row.owner_id);
    if (status) await migrateOneDocument("transparency", status, row.path);
  }
  for (const row of projectRows) {
    const status = projectStatus.get(row.owner_id);
    if (status) await migrateOneDocument("transparency", status, row.path);
  }
}

console.log("Migrating site content images...");
{
  const { data: blocks, error: e1 } = await supabase.from("site_blocks").select("value");
  if (e1) throw e1;
  for (const row of blocks ?? []) {
    if (row.value && /^site\//.test(row.value)) await migrateAlwaysPublic("site-media", row.value);
  }
  const { data: items, error: e2 } = await supabase.from("site_items").select("image_path");
  if (e2) throw e2;
  for (const row of items ?? []) {
    if (row.image_path) await migrateAlwaysPublic("site-media", row.image_path);
  }
}

console.log("Migrating staff avatars...");
{
  const { data: rows, error } = await supabase.from("profiles").select("avatar_src");
  if (error) throw error;
  for (const row of rows ?? []) {
    if (row.avatar_src) await migrateAlwaysPublic("avatars-media", row.avatar_src);
  }
}

console.log(`\n${ok} object(s) copied, ${failed} failed.`);
console.log(
  failed === 0
    ? "\nAll objects copied. Verify a sample of them in the Supabase dashboard, then delete public-media and public-documents by hand once satisfied."
    : "\nSome objects failed to copy — see FAIL lines above. Do not delete the old buckets until every failure is resolved and re-run.",
);
process.exit(failed === 0 ? 0 : 1);
```

Note on the `news_articles!inner(status)` / nested-embed syntax: this
mirrors the same PostgREST embedded-filter capability the project's own
Plan 7 already verified works against this schema (see `CLAUDE.md`'s
officials-achievements bullet — "the two-level nested PostgREST embed with
embedded filters WORKS against staging"). `!inner` makes the join required
so a photo with a deleted parent article (shouldn't happen, but defensively)
doesn't null out the embed and crash the `.status` access.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean (this file is outside the TS project / ESLint scope,
same as the two existing upload scripts — this step confirms nothing else
broke).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-media-buckets.mjs
git commit -m "feat: add one-time data migration script for the new media buckets"
```

---

## Self-Review Notes

**Spec coverage:** This plan covers the "Bucket layout," "Bucket resolution,"
and "Data migration for existing objects" sections of the design spec in
full. It deliberately does NOT cover "Status-transition rules
(promote/demote)," "Upload flow," or "Admin preview URLs" — those need
`promoteMedia`/`demoteMedia`/`resolveMediaUrl` to exist first (this plan
builds them) before their call sites can be wired up, which is the next
plan in the sequence.

**Placeholder scan:** No TBD/TODO; every step has literal code, not a
description of code.

**Type consistency:** `MediaKind`, `publicBucketFor`, `draftBucketFor`,
`bucketForStatus`, `SITE_MEDIA_BUCKET`, `AVATARS_MEDIA_BUCKET`, `mediaUrl`
(Task 1) are used with identical names and signatures in Tasks 3 and 4.
`promoteMedia`, `demoteMedia`, `resolveMediaUrl`, `resolveMediaUrls` (Tasks
3-4) are the exact names the next plan in the sequence will import.

**Scope check:** This plan is self-contained and produces working, tested
software on its own — the new pure helpers are unit-tested, the new
Storage-calling primitives typecheck clean and are unused (inert) until the
next plan wires them in, the migration is additive and safe to apply
anytime, and the data-migration script only copies (never deletes). Nothing
in this plan can break the currently-running site.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-27-media-bucket-split-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
