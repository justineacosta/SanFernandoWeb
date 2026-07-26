# Notices (Announcements) Archive + Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give announcements a full archive (`/notices`, all published announcements, newest
first, "Load More" 6-at-a-time) and a real detail page (`/notices/[slug]`), and wire the two
existing announcement widgets (the homepage card, the `/announcements` sidebar) to link into it —
fixing the two links that currently point at `/announcements` (the unrelated News teaser page)
instead.

**Architecture:** `announcements` gains `slug` and `body` columns (migration `0027`), mirroring
`news_articles`. The data/admin layers extend exactly the way News' own slug + body support
works. Two new routes (`/notices`, `/notices/[slug]`) mirror `/news` and
`/announcements/[slug]` structurally, simplified for what an announcement actually has (no
category, no author, a single image instead of a gallery). The existing `AnnouncementCard`
becomes clickable and is reused as the archive's row card — no second card type, matching how
`/news` reuses `NewsCard` for both its teaser and its archive.

**Tech Stack:** Next.js 16 App Router, Supabase (service-role client), Zod v4, Tailwind v4,
Playwright (`public` project).

## Global Constraints

- Migration `0027_announcement_notices.sql` is **written and committed only** — it is never
  applied by an implementer, and never run against a live database from this repo. Per
  `CLAUDE.md`, the project owner applies every migration by hand against Supabase staging. Task 1
  ends with the file committed, nothing more. Tasks 2–3 (types, queries, admin) typecheck cleanly
  without the migration being live, because none of this codebase's Supabase calls are validated
  against the real schema at compile time. **Tasks 4–6's Playwright verification does require the
  migration applied** to whatever environment `npm run dev` points at — if it visibly isn't (e.g.
  a "column does not exist" error, or `/notices/[slug]` 404ing on every published announcement),
  stop and ask the project owner to apply `0027` before continuing; this is a real external
  blocker, not a bug to work around.
- `supabase/migrations/README.md` requires every migration `0024`+ to be folded into
  `supabase/baseline/0000_baseline_2026-07-23.sql` in the **same commit** — in final form (the
  `announcements` table gets `slug`/`body` as plain columns in its `create table`, no backfill
  logic, since a baselined environment starts empty). Task 1 covers this.
- Path alias `@/*` → `src/*`. zod is v4.
- No new Vitest unit tests: nothing in this feature is a pure function outside what `/news` and
  `/events` already established and covered (ordering/pagination/dedupe-on-append). Playwright's
  `public` project (`npx playwright test --project=public`, no login needed) is how Tasks 4–6 are
  verified.
- Every admin action that can change what `/notices` or `/notices/[slug]` shows must
  `revalidatePath` the exact paths named in its task. This was the single Critical finding from
  the News archive's final review, and it is easy to reintroduce by forgetting one call site.
- `saveAnnouncement`'s slug handling mirrors `saveNewsArticle` exactly: locked once `published`,
  recomputed (via `slugify()` + a `-2`/`-3`… uniqueness suffix) only while `draft`/`in-review`/
  `archived`.
- The `Announcement` type's field order, once changed in Task 2, is: `id, slug, title, date,
  excerpt, image?, imageAlt?, isNew?, urgent?`. `AnnouncementValues`'s order is: `title, slug,
  date, excerpt, body, urgent, imageSrc, imageAlt`. Every later task's code assumes these exact
  shapes.

---

### Task 1: Schema — `slug` + `body` on `announcements`

**Files:**
- Create: `supabase/migrations/0027_announcement_notices.sql`
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:3` (squash-range comment) and
  `supabase/baseline/0000_baseline_2026-07-23.sql:639-653` (the `announcements` table)

**Interfaces:**
- Produces: `public.announcements.slug text not null unique`, `public.announcements.body text
  not null default ''`. No other task's code runs until this file is applied to the target
  Supabase environment (see Global Constraints), but Tasks 2–3 can be written and typechecked
  against it immediately.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0027_announcement_notices.sql`:

```sql
-- 0027 — notices: announcements gain a slug (public detail page) and body
-- (full notice text), mirroring news_articles. The teaser excerpt is no
-- longer the whole story — /notices/[slug] needs real content to show.
--
-- Slug backfill has no fallback beyond disambiguation. Every existing
-- announcement gets a slug derived from its title; duplicates (identical or
-- near-identical titles) are disambiguated with a -2, -3… suffix before the
-- NOT NULL UNIQUE constraint lands, so this migration cannot fail on
-- existing data the way 0024's numeric backfill deliberately could.

begin;

-- 1. New columns, slug nullable until the backfill has run.
alter table public.announcements
  add column slug text,
  add column body text not null default '';

-- 2. Backfill slugs from titles: lowercase, non-alphanumeric runs collapsed
--    to a single hyphen, leading/trailing hyphens trimmed.
update public.announcements
set slug = trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'))
where slug is null;

-- 3. Disambiguate duplicates the backfill above would otherwise collide on
--    (e.g. two announcements both titled "Notice") — oldest keeps the bare
--    slug, later rows get -2, -3…
update public.announcements a
set slug = a.slug || '-' || sub.rn
from (
  select id, row_number() over (partition by slug order by created_at) as rn
  from public.announcements
) sub
where a.id = sub.id and sub.rn > 1;

-- 4. Constrain now that every row has a slug.
alter table public.announcements
  alter column slug set not null,
  add constraint announcements_slug_unique unique (slug);

commit;
```

- [ ] **Step 2: Review the SQL by eye**

There is no local Postgres instance in this repo (no `supabase/config.toml`), so there is no
automated way to run this migration. Re-read the file and confirm: the `begin`/`commit` wrap
everything, step 2's regex leaves no uppercase or punctuation in any slug, step 3's
`row_number()` only touches rows beyond the first per slug group, and step 4 only runs after
every row is guaranteed non-null.

- [ ] **Step 3: Fold the same change into the baseline**

In `supabase/baseline/0000_baseline_2026-07-23.sql`, change line 3:

```diff
--- Squash of migrations 0001–0026, as of 2026-07-23.
+-- Squash of migrations 0001–0027, as of 2026-07-23.
```

Then replace the `announcements` table definition (currently lines 639–653) with:

```sql
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  date date not null,
  excerpt text not null,
  body text not null default '',
  image_src text,
  image_alt text not null default '',
  urgent boolean not null default false,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null
);
create index announcements_status_date_idx
  on public.announcements (status, date desc);
alter table public.announcements enable row level security;
create trigger announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();
```

(Only `slug text not null unique,` and `body text not null default '',` are new — everything
else is unchanged, reproduced here so the block is easy to paste in whole.)

- [ ] **Step 4: Sanity-check nothing else broke**

Run: `npm run typecheck`
Expected: PASS (this task touches no `.ts`/`.tsx` file, so this only confirms the baseline edit
didn't accidentally corrupt something outside SQL — a quick safety net, not a real test of this
task's change).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0027_announcement_notices.sql supabase/baseline/0000_baseline_2026-07-23.sql
git commit -m "feat(db): add slug and body to announcements (migration 0027)"
```

---

### Task 2: Types + public/admin query layer

**Files:**
- Modify: `src/types/index.ts:169-178` (`Announcement`), add `AnnouncementDetail` after it, and
  `src/types/index.ts:298-305` (`AnnouncementValues`)
- Modify: `src/features/announcements/queries.ts`
- Modify: `src/features/admin/queries/announcements.ts`

**Interfaces:**
- Consumes: Task 1's `announcements.slug`/`announcements.body` columns.
- Produces:
  - `Announcement { id: string; slug: string; title: string; date: string; excerpt: string;
    image?: string; imageAlt?: string; isNew?: boolean; urgent?: boolean; }`
  - `AnnouncementDetail extends Announcement { body: string }`
  - `AnnouncementValues { title: string; slug: string; date: string; excerpt: string; body:
    string; urgent: boolean; imageSrc: string | null; imageAlt: string; }`
  - `NOTICES_ARCHIVE_BATCH = 6` in `src/features/announcements/queries.ts`
  - `listAllAnnouncements(offset: number, limit: number): Promise<{ items: Announcement[]; total: number }>`
  - `getPublishedAnnouncementBySlug(slug: string): Promise<AnnouncementDetail | null>`
  - `listPublishedAnnouncements(limit?: number): Promise<Announcement[]>` — same signature,
    extended to select `id`/`slug`.
  - `getAnnouncementForEdit(id): Promise<{ values: AnnouncementValues; status: ContentStatus } | null>`
    — same signature, `values` now carries `slug` and `body`.

- [ ] **Step 1: Update the types**

In `src/types/index.ts`, replace the `Announcement` interface (currently lines 169-178):

```ts
export interface Announcement {
  id: string;
  slug: string;
  title: string;
  /** ISO date, e.g. "2025-05-20" */
  date: string;
  excerpt: string;
  image?: string;
  imageAlt?: string;
  isNew?: boolean;
  urgent?: boolean;
}

/** Public notice detail (slug page). */
export interface AnnouncementDetail extends Announcement {
  body: string;
}
```

Then replace `AnnouncementValues` (currently lines 298-305):

```ts
export interface AnnouncementValues {
  title: string;
  slug: string;
  date: string;
  excerpt: string;
  body: string;
  urgent: boolean;
  imageSrc: string | null;
  imageAlt: string;
}
```

- [ ] **Step 2: Run typecheck to see the ripple**

Run: `npm run typecheck`
Expected: FAIL — `src/features/announcements/queries.ts`, `src/features/admin/queries/announcements.ts`,
`src/features/admin/actions/announcements.ts`, `src/features/admin/components/announcement-form.tsx`,
`src/features/announcements/components/news-sidebar.tsx`, and
`src/features/home/components/community-pulse-section.tsx` all now fail to satisfy the new
shapes. This confirms every call site that needs updating actually lit up.

- [ ] **Step 3: Extend the public query layer**

In `src/features/announcements/queries.ts`, add `AnnouncementDetail` to the type-only import at
the top:

```ts
import type { Announcement, AnnouncementDetail, NewsArticleDetail, NewsArticleListItem } from "@/types";
```

Add `NOTICES_ARCHIVE_BATCH` next to the existing `ARCHIVE_BATCH`:

```ts
export const ARCHIVE_BATCH = 6;
export const NOTICES_ARCHIVE_BATCH = 6;
```

Add an `AnnouncementRow` interface and a `toAnnouncement` mapper (place these near the existing
`ArticleRow`/`toListItem` pair), then replace `listPublishedAnnouncements` to use them and add
the two new functions:

```ts
interface AnnouncementRow {
  id: string;
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  body?: string;
  image_src: string | null;
  image_alt: string;
  urgent: boolean;
  published_at: string | null;
}

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    date: row.date,
    excerpt: row.excerpt,
    image: row.image_src ? photoUrl(row.image_src) : undefined,
    imageAlt: row.image_alt ?? "",
    urgent: row.urgent,
    isNew: isWithin7Days(row.published_at),
  };
}

export async function listPublishedAnnouncements(limit = 3): Promise<Announcement[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("id, slug, title, date, excerpt, image_src, image_alt, urgent, published_at")
    .eq("status", "published")
    .order("date", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as unknown as AnnouncementRow[]).map(toAnnouncement);
}

export async function listAllAnnouncements(
  offset: number,
  limit: number,
): Promise<{ items: Announcement[]; total: number }> {
  const admin = createSupabaseAdminClient();
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1;

  const { data, count, error } = await admin
    .from("announcements")
    .select(
      "id, slug, title, date, excerpt, image_src, image_alt, urgent, published_at",
      { count: "exact" },
    )
    .eq("status", "published")
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error || !data) return { items: [], total: 0 };
  return {
    items: (data as unknown as AnnouncementRow[]).map(toAnnouncement),
    total: count ?? 0,
  };
}

export async function getPublishedAnnouncementBySlug(slug: string): Promise<AnnouncementDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("id, slug, title, date, excerpt, body, image_src, image_alt, urgent, published_at")
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as AnnouncementRow;
  return { ...toAnnouncement(row), body: row.body ?? "" };
}
```

This replaces the old inline `listPublishedAnnouncements` body (the one that mapped fields
directly) — `toAnnouncement` is now the single place that shape is built.

- [ ] **Step 4: Extend the admin query layer**

In `src/features/admin/queries/announcements.ts`, replace `getAnnouncementForEdit`:

```ts
/** One announcement's editable values + status, for the drawer editor. */
export async function getAnnouncementForEdit(
  id: string,
): Promise<{ values: AnnouncementValues; status: ContentStatus } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("id, slug, title, date, excerpt, body, image_src, image_alt, urgent, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
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
    status: data.status as ContentStatus,
  };
}
```

(`listAnnouncements`, the admin manager grid query, is unchanged — the manager table shows
neither slug nor body as columns, same as `AdminNewsArticleRow` not showing `body`.)

- [ ] **Step 5: Run typecheck again**

Run: `npm run typecheck`
Expected: The errors from Step 2 that were inside `queries.ts` and
`admin/queries/announcements.ts` are gone. Remaining failures are in
`admin/actions/announcements.ts`, `admin/components/announcement-form.tsx`,
`features/announcements/components/news-sidebar.tsx`, and
`features/home/components/community-pulse-section.tsx` — Tasks 3, 3, 4, and 6 respectively.
This is expected; do not fix them here.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/features/announcements/queries.ts src/features/admin/queries/announcements.ts
git commit -m "feat: add id/slug/body to the Announcement type and query layer"
```

---

### Task 3: Admin — slug + body in the announcement editor

**Files:**
- Modify: `src/features/admin/actions/announcements.ts`
- Modify: `src/features/admin/components/announcement-form.tsx`

**Interfaces:**
- Consumes: Task 2's `AnnouncementValues` (now carrying `slug`, `body`) and
  `getAnnouncementForEditAction`.
- Produces: no new exports — `saveAnnouncement`, `deleteAnnouncement`, and the other workflow
  actions keep their existing signatures; only their internals and the `revalidate()` helper
  change.

- [ ] **Step 1: Add slug handling and the body field to the save schema**

In `src/features/admin/actions/announcements.ts`, replace the `schema` and `revalidate`
declarations:

```ts
const schema = z.object({
  title: z.string().trim().min(3, "Enter a title."),
  slug: z.string().trim().min(1, "Enter a slug."),
  date: z.string().trim().min(1, "Pick a date."),
  excerpt: z.string().trim().min(1, "Enter an excerpt."),
  body: z.string(),
  urgent: z.boolean(),
  imageSrc: z.string().trim().nullable(),
  imageAlt: z.string().trim(),
});

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type SlugResult = { slug: string; error: null } | { slug: null; error: string };

/** Ensure a slug is unique, suffixing -2, -3… (ignoring the row being edited). */
async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
  ignoreId: string | null,
): Promise<SlugResult> {
  const { data, error } = await admin.from("announcements").select("id, slug");
  if (error) return { slug: null, error: "Could not save the announcement. Try again." };
  const taken = new Set((data ?? []).filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return { slug: base, error: null };
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return { slug: `${base}-${n}`, error: null };
}

function revalidate() {
  revalidatePath("/admin/news");
  revalidatePath("/announcements");
  revalidatePath("/notices");
  revalidatePath("/");
}
```

- [ ] **Step 2: Compute and persist the slug in `saveAnnouncement`**

Replace the whole `saveAnnouncement` function body with:

```ts
export async function saveAnnouncement(
  id: string | null,
  values: AnnouncementValues,
  imageForm: FormData,
): Promise<SaveResult> {
  const actor = await checkPermission("manage-news");
  if (!actor) return { error: NOT_FOUND, id: null };
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();

  const incoming = imageForm.get("image");
  const removeImage = imageForm.get("removeImage") === "1";
  let uploadedPath: string | null = null;
  if (incoming instanceof File && incoming.size > 0) {
    const uploaded = await uploadSingleImage("announcements", incoming);
    if (uploaded.error) return { error: uploaded.error, id: null };
    uploadedPath = uploaded.src;
  }

  async function fail(error: string): Promise<SaveResult> {
    if (uploadedPath) {
      const removed = await removeStoredImage(uploadedPath);
      if (removed.error) {
        console.error(`Orphaned storage object (compensating delete failed): ${uploadedPath}`);
      }
    }
    return { error, id: null };
  }

  const nextImageSrc = uploadedPath ?? (removeImage ? null : parsed.data.imageSrc);
  const nextImageAlt = nextImageSrc ? parsed.data.imageAlt : "";

  if (id) {
    const { data: existing, error: readErr } = await admin
      .from("announcements")
      .select("image_src, status, slug")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return fail("Could not save the announcement.");
    if (!existing) return fail("Announcement not found.");

    const wasPublished = existing.status === "published";
    let slug = existing.slug as string;
    if (!wasPublished) {
      const slugResult = await uniqueSlug(admin, slugify(parsed.data.slug) || slugify(parsed.data.title), id);
      if (slugResult.error) return fail(slugResult.error);
      slug = slugResult.slug;
    }

    let query = admin
      .from("announcements")
      .update({
        title: parsed.data.title,
        slug,
        date: parsed.data.date,
        excerpt: parsed.data.excerpt,
        body: parsed.data.body,
        urgent: parsed.data.urgent,
        image_src: nextImageSrc,
        image_alt: nextImageAlt,
      })
      .eq("id", id);
    // The slug above was computed against the status just read. If that read
    // saw a non-published status, re-assert it in the WHERE: should the
    // announcement get published concurrently, this update must not silently
    // apply a slug computed against the now-stale status.
    if (!wasPublished) {
      query = query.in("status", ["draft", "in-review", "archived"]);
    }
    const { data: updated, error } = await query.select("id").maybeSingle();
    if (error) return fail("Could not save the announcement.");
    if (!updated) {
      return fail(
        wasPublished
          ? "Announcement not found."
          : "This announcement was published while you were editing. Reopen it and try again.",
      );
    }

    const previous = existing.image_src as string | null;
    if (previous && previous !== nextImageSrc) {
      await discardImage(previous, "announcement image replaced");
    }
    await recordActivity(actor, {
      type: "update",
      action: "updated announcement",
      entityType: "announcement",
      entityId: id,
      entityLabel: parsed.data.title,
    });
    revalidate();
    return { error: null, id };
  }

  const slugResult = await uniqueSlug(admin, slugify(parsed.data.slug) || slugify(parsed.data.title), null);
  if (slugResult.error) return fail(slugResult.error);
  const slug = slugResult.slug;

  const { data: inserted, error } = await admin
    .from("announcements")
    .insert({
      title: parsed.data.title,
      slug,
      date: parsed.data.date,
      excerpt: parsed.data.excerpt,
      body: parsed.data.body,
      urgent: parsed.data.urgent,
      image_src: nextImageSrc,
      image_alt: nextImageAlt,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !inserted) return fail("Could not create the announcement.");
  await recordActivity(actor, {
    type: "create",
    action: "created announcement",
    entityType: "announcement",
    entityId: inserted.id,
    entityLabel: parsed.data.title,
  });
  revalidate();
  return { error: null, id: inserted.id };
}
```

- [ ] **Step 3: Revalidate the detail page on delete**

Replace `deleteAnnouncement`:

```ts
export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  const guard = await guardDelete<{ title: string; slug: string; image_src: string | null }>(
    "announcements",
    id,
    "title, slug, image_src",
  );
  if (!guard.ok) return { error: guard.error };
  const { actor, row: existing } = guard;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("announcements").delete().eq("id", id);
  if (error) return { error: "Could not delete the announcement." };

  // Only once the row is gone: an object deleted ahead of a failed row delete
  // would leave a live announcement pointing at nothing.
  await discardImage(existing.image_src, "announcement deleted");
  await recordActivity(actor, {
    type: "delete",
    action: "deleted announcement",
    entityType: "announcement",
    entityId: id,
    entityLabel: existing.title,
  });
  revalidatePath(`/notices/${existing.slug}`);
  revalidate();
  return { error: null };
}
```

- [ ] **Step 4: Add the Slug and Body fields to the drawer form**

In `src/features/admin/components/announcement-form.tsx`, add a `slugify` helper (top of file,
after the imports) and change `EMPTY_VALUES`:

```ts
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const EMPTY_VALUES: AnnouncementValues = {
  title: "",
  slug: "",
  date: "",
  excerpt: "",
  body: "",
  urgent: false,
  imageSrc: null,
  imageAlt: "",
};
```

Add a `handleTitleChange` function next to the `set` helper, so a blank slug tracks the title
until the admin edits it directly (identical behavior to `NewsForm`):

```ts
function handleTitleChange(next: string) {
  setValues((prev) => ({
    ...prev,
    title: next,
    slug: prev.slug.trim() === "" ? slugify(next) : prev.slug,
  }));
}
```

Change the Title field's `onChange` to call it, add a Slug field right after, and add a Body
field right after Excerpt:

```tsx
<Field label="Title" htmlFor="announcement-title">
  <Input
    id="announcement-title"
    value={values.title}
    onChange={(event) => handleTitleChange(event.target.value)}
    required
    minLength={3}
  />
</Field>
<Field label="Slug" htmlFor="announcement-slug">
  <Input
    id="announcement-slug"
    value={values.slug}
    onChange={(event) => set("slug", event.target.value)}
    disabled={status === "published"}
    required
  />
  {status === "published" ? (
    <p className="text-xs text-ink-500">The slug is locked once an announcement is published.</p>
  ) : null}
</Field>
<Field label="Date" htmlFor="announcement-date">
  <Input
    id="announcement-date"
    type="date"
    value={values.date}
    onChange={(event) => set("date", event.target.value)}
    required
  />
</Field>
<Field label="Excerpt" htmlFor="announcement-excerpt">
  <Textarea
    id="announcement-excerpt"
    rows={4}
    value={values.excerpt}
    onChange={(event) => set("excerpt", event.target.value)}
  />
</Field>
<Field label="Body" htmlFor="announcement-body">
  <Textarea
    id="announcement-body"
    rows={8}
    placeholder="Write the full notice text…"
    value={values.body}
    onChange={(event) => set("body", event.target.value)}
  />
</Field>
```

(This replaces the existing Title, Date, and Excerpt `Field` blocks in place — Date and Excerpt
are reproduced unchanged so the ordering is unambiguous; only Slug and Body are new.)

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: PASS — all of `admin/actions/announcements.ts` and
`admin/components/announcement-form.tsx`'s errors from Task 2 Step 2 are now resolved. Remaining
failures (if any) are in `news-sidebar.tsx` and `community-pulse-section.tsx`, left for Tasks 4
and 6.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/actions/announcements.ts src/features/admin/components/announcement-form.tsx
git commit -m "feat(admin): add slug and body editing to the announcement drawer"
```

---

### Task 4: Public detail page + `AnnouncementCard` becomes a link

**Files:**
- Create: `src/app/(public)/notices/[slug]/page.tsx`
- Create: `src/app/(public)/notices/[slug]/loading.tsx`
- Modify: `src/components/shared/announcement-card.tsx`
- Modify: `src/features/home/components/community-pulse-section.tsx` (only the `key` prop, line 50)
- Create: `tests/e2e/public/notices.spec.ts`

**Interfaces:**
- Consumes: Task 2's `getPublishedAnnouncementBySlug`, `Announcement.id`/`.slug`.
- Produces: `/notices/[slug]` route; `AnnouncementCard` now renders a "Details" link to it and an
  Urgent badge — Task 5's archive grid and Task 6's sidebar widget both read this file's final
  shape.

- [ ] **Step 1: Detail page**

Create `src/app/(public)/notices/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { formatDate } from "@/lib/format";
import { getPublishedAnnouncementBySlug } from "@/features/announcements/queries";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const notice = await getPublishedAnnouncementBySlug(slug);
  if (!notice) return { title: "Notice not found" };
  return {
    title: notice.title,
    description: notice.excerpt,
    openGraph: {
      title: notice.title,
      description: notice.excerpt,
      images: notice.image ? [notice.image] : undefined,
    },
  };
}

export default async function NoticePage({ params }: PageProps) {
  const { slug } = await params;
  const notice = await getPublishedAnnouncementBySlug(slug);
  if (!notice) notFound();

  const paragraphs = notice.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  // pt-32/md:pt-44 clears the fixed SiteHeader, matching the News article
  // detail page this route mirrors.
  return (
    <Container className="pb-12 pt-32 md:pb-16 md:pt-44">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/notices"
          className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Notices
        </Link>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {notice.urgent ? <Badge variant="urgent">Urgent</Badge> : null}
          {notice.isNew ? <Badge variant="new">New</Badge> : null}
        </div>
        <h1 className="mb-4 font-display text-3xl font-bold tracking-tight text-ink-900 md:text-4xl">
          {notice.title}
        </h1>
        <p className="mb-8 text-sm text-ink-600">{formatDate(notice.date)}</p>

        {notice.image ? (
          <div className="relative mb-8 aspect-video w-full overflow-hidden rounded-3xl bg-ink-100">
            <Image
              src={notice.image}
              alt={notice.imageAlt ?? ""}
              fill
              sizes="(min-width: 768px) 768px, 100vw"
              className="object-cover"
            />
          </div>
        ) : null}

        <div className="space-y-4 text-lg leading-relaxed text-ink-700">
          {paragraphs.length > 0
            ? paragraphs.map((p, i) => <p key={i}>{p}</p>)
            : <p>{notice.excerpt}</p>}
        </div>
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: Detail loading skeleton**

Create `src/app/(public)/notices/[slug]/loading.tsx`:

```tsx
import { ArticleSkeleton } from "@/components/ui/public-skeleton";

/**
 * Detail routes get a whole-page skeleton rather than a Suspense boundary:
 * the page awaits the record before it can render anything, its own title
 * included, so there is no instant part to protect.
 */
export default function Loading() {
  return <ArticleSkeleton what="this notice" />;
}
```

- [ ] **Step 3: `AnnouncementCard` becomes a link and gains the Urgent badge**

Replace `src/components/shared/announcement-card.tsx` in full:

```tsx
import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { Announcement } from "@/types";

interface AnnouncementCardProps {
  announcement: Announcement;
}

/** Compact announcement list item with thumbnail, date, and excerpt. */
export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  return (
    <article className="group flex gap-4">
      {announcement.image ? (
        <Image
          src={announcement.image}
          alt={announcement.imageAlt ?? ""}
          width={96}
          height={80}
          className="h-20 w-24 shrink-0 rounded-2xl object-cover"
        />
      ) : null}
      <div>
        <h4 className="text-sm font-semibold tracking-tight text-ink-900 transition-colors group-hover:text-brand-700">
          {announcement.isNew ? (
            <Badge variant="new" className="mr-1 px-1.5 text-[10px]">
              New
            </Badge>
          ) : null}
          {announcement.title}
        </h4>
        <p className="mb-1 mt-1 text-xs text-ink-600">{formatDate(announcement.date)}</p>
        <p className="line-clamp-2 text-xs text-ink-600">{announcement.excerpt}</p>
        {announcement.urgent ? (
          <Badge variant="urgent" className="mt-2 text-[10px]">
            Urgent
          </Badge>
        ) : null}
        <Link
          href={`/notices/${announcement.slug}`}
          className="mt-2 block text-xs font-semibold uppercase text-brand-700 hover:underline"
        >
          Details
        </Link>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Fix the now-brittle React key on the homepage card**

In `src/features/home/components/community-pulse-section.tsx`, change (currently around line 50):

```diff
-            {announcements.map((announcement) => (
-              <AnnouncementCard key={announcement.title} announcement={announcement} />
+            {announcements.map((announcement) => (
+              <AnnouncementCard key={announcement.id} announcement={announcement} />
             ))}
```

- [ ] **Step 5: Write the e2e test**

Create `tests/e2e/public/notices.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/**
 * Notices (/notices): the announcements archive and its detail pages.
 */

test("clicking Details on a homepage announcement opens its notice page", async ({ page }) => {
  await page.goto("/");
  const detailsLinks = page.getByRole("link", { name: "Details" });
  const count = await detailsLinks.count();
  test.skip(count === 0, "no published announcements in this environment");

  await detailsLinks.first().click();
  await page.waitForURL(/\/notices\/.+/);
  await expect(page.getByRole("link", { name: "Back to Notices" })).toHaveAttribute(
    "href",
    "/notices",
  );
});
```

- [ ] **Step 6: Run it**

Run: `npx playwright test tests/e2e/public/notices.spec.ts --project=public`
Expected: PASS if the target Supabase environment already has published announcements and
migration `0027` applied; SKIPPED (not a failure) if there are no published announcements. A
"column does not exist" or similar schema error means migration `0027` has not been applied yet —
stop and flag this rather than treating it as a code defect (see Global Constraints).

- [ ] **Step 7: Commit**

```bash
git add src/app/"(public)"/notices src/components/shared/announcement-card.tsx src/features/home/components/community-pulse-section.tsx tests/e2e/public/notices.spec.ts
git commit -m "feat: add the /notices/[slug] detail page and make AnnouncementCard link to it"
```

---

### Task 5: Public archive page

**Files:**
- Create: `src/app/(public)/notices/page.tsx`
- Create: `src/features/announcements/components/notices-archive.tsx`
- Create: `src/features/announcements/components/notices-archive-grid.tsx`
- Modify: `src/features/announcements/actions.ts` (add `loadMoreNotices`)
- Modify: `src/features/announcements/index.ts` (barrel export)
- Modify: `src/components/ui/public-skeleton.tsx` (add `NoticesArchiveSkeleton`)
- Modify: `tests/e2e/public/notices.spec.ts`

**Interfaces:**
- Consumes: Task 2's `listAllAnnouncements`, `NOTICES_ARCHIVE_BATCH`; Task 4's `AnnouncementCard`.
- Produces: `/notices` route; `NoticesArchive` (exported from the `announcements` barrel).

- [ ] **Step 1: `loadMoreNotices` server action**

In `src/features/announcements/actions.ts`, add the import and the function (place it after the
existing `loadMoreNews`):

```ts
import { ARCHIVE_BATCH, NOTICES_ARCHIVE_BATCH, listAllAnnouncements, listPublishedArticles } from "@/features/announcements/queries";
import type { Announcement, NewsArticleListItem } from "@/types";
```

(This replaces the file's existing `import { ARCHIVE_BATCH, listPublishedArticles } from ...`
and `import type { NewsArticleListItem } from "@/types";` lines with the combined versions above.)

```ts
export async function loadMoreNotices(
  offset: number,
): Promise<{ items: Announcement[]; hasMore: boolean }> {
  const { items, total } = await listAllAnnouncements(offset, NOTICES_ARCHIVE_BATCH);
  // If we're fetching more (offset > 0) but the query returns zero total, it's
  // a failure (not "no more notices"). Throw so the client error handler catches it.
  if (offset > 0 && total === 0) {
    throw new Error("Failed to load more notices.");
  }
  return { items, hasMore: offset + items.length < total };
}
```

- [ ] **Step 2: Archive skeleton**

In `src/components/ui/public-skeleton.tsx`, add (after `NewsSidebarSkeleton`):

```tsx
/** The Notices archive: a stack of announcement rows. */
export function NoticesArchiveSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-6">
      <LoadingLabel what="the notices archive" />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-4 rounded-3xl border border-ink-200 bg-white p-5">
          <Skeleton className="h-20 w-24 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Archive server component + client grid**

Create `src/features/announcements/components/notices-archive.tsx`:

```tsx
import { NOTICES_ARCHIVE_BATCH, listAllAnnouncements } from "@/features/announcements/queries";
import { NoticesArchiveGrid } from "@/features/announcements/components/notices-archive-grid";

/** Full Notices archive: every published announcement, newest first, growing via Load More. */
export async function NoticesArchive() {
  const { items, total } = await listAllAnnouncements(0, NOTICES_ARCHIVE_BATCH);

  if (items.length === 0) {
    return <p className="py-12 text-center text-ink-500">No notices yet. Please check back soon.</p>;
  }

  return (
    <NoticesArchiveGrid
      initialItems={items}
      initialOffset={items.length}
      initialHasMore={items.length < total}
    />
  );
}
```

Create `src/features/announcements/components/notices-archive-grid.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AnnouncementCard } from "@/components/shared/announcement-card";
import { loadMoreNotices } from "@/features/announcements/actions";
import type { Announcement } from "@/types";

interface NoticesArchiveGridProps {
  initialItems: Announcement[];
  initialOffset: number;
  initialHasMore: boolean;
}

/** A single-column stack of announcement cards that grows via "Load More" button. */
export function NoticesArchiveGrid({
  initialItems,
  initialOffset,
  initialHasMore,
}: NoticesArchiveGridProps) {
  const [items, setItems] = useState(initialItems);
  const [offset, setOffset] = useState(initialOffset);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await loadMoreNotices(offset);
        setItems((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...result.items.filter((a) => !seen.has(a.id))];
        });
        setOffset((prev) => prev + result.items.length);
        setHasMore(result.hasMore);
      } catch (err) {
        setError("Failed to load more notices. Please try again.");
        console.error("loadMoreNotices error:", err);
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        {items.map((announcement) => (
          <div key={announcement.id} className="rounded-3xl border border-ink-200 bg-white p-5">
            <AnnouncementCard announcement={announcement} />
          </div>
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

- [ ] **Step 4: Barrel export**

In `src/features/announcements/index.ts`, add:

```ts
export { NoticesArchive } from "./components/notices-archive";
```

- [ ] **Step 5: The `/notices` page**

Create `src/app/(public)/notices/page.tsx`:

```tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/sections/page-hero";
import { NoticesArchiveSkeleton } from "@/components/ui/public-skeleton";
import { NoticesArchive } from "@/features/announcements";

export const metadata: Metadata = {
  title: "All Notices",
  description:
    "Browse every announcement and public notice from Barangay San Fernando, newest first.",
};

export default function NoticesPage() {
  return (
    <>
      <PageHero
        eyebrow="Official Updates"
        title="Community Notices"
        description="Every notice, advisory, and update from Barangay San Fernando — current and past."
      />
      <Container className="py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <Suspense fallback={<NoticesArchiveSkeleton />}>
            <NoticesArchive />
          </Suspense>
        </div>
      </Container>
    </>
  );
}
```

- [ ] **Step 6: Extend the e2e test**

Append to `tests/e2e/public/notices.spec.ts`:

```ts
test("notices archive page renders and loads more on demand", async ({ page }) => {
  await page.goto("/notices");
  await expect(page.getByRole("heading", { name: "Community Notices" })).toBeVisible();

  const detailsLinks = page.getByRole("link", { name: "Details" });
  const initialCount = await detailsLinks.count();
  test.skip(initialCount === 0, "no published announcements in this environment");

  const loadMore = page.getByRole("button", { name: "Load More" });
  if ((await loadMore.count()) === 0) {
    return; // fewer than 6 announcements total — nothing more to load
  }

  await loadMore.click();
  await expect
    .poll(async () => detailsLinks.count(), { timeout: 10_000 })
    .toBeGreaterThan(initialCount);
});
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

Run: `npx playwright test tests/e2e/public/notices.spec.ts --project=public`
Expected: PASS/SKIP per Task 4 Step 6's same caveat.

- [ ] **Step 8: Commit**

```bash
git add src/app/"(public)"/notices/page.tsx src/features/announcements/components/notices-archive.tsx src/features/announcements/components/notices-archive-grid.tsx src/features/announcements/actions.ts src/features/announcements/index.ts src/components/ui/public-skeleton.tsx tests/e2e/public/notices.spec.ts
git commit -m "feat: add the /notices archive page"
```

---

### Task 6: Wire the two existing widgets into `/notices`

**Files:**
- Modify: `src/features/home/components/community-pulse-section.tsx:46,53`
- Modify: `src/features/announcements/components/news-sidebar.tsx`
- Modify: `tests/e2e/public/notices.spec.ts`

**Interfaces:**
- Consumes: Task 5's `/notices` route.
- Produces: nothing new — this is the last task; it only repoints existing links.

- [ ] **Step 1: Fix the homepage's dead links**

In `src/features/home/components/community-pulse-section.tsx`, change both `/announcements`
targets in the Announcements card (currently lines 46 and 53):

```diff
             action={<ViewAllLink label="View All" href="/announcements" />}
+            action={<ViewAllLink label="View All" href="/notices" />}
```

```diff
-          <Button href="/announcements" variant="outline" className="mt-6 w-full">
+          <Button href="/notices" variant="outline" className="mt-6 w-full">
             View All Announcements
           </Button>
```

- [ ] **Step 2: Sidebar widget — rows link out, and gains a "View All" footer**

Replace the `AnnouncementsWidget` function in `src/features/announcements/components/news-sidebar.tsx`
in full, and add the two new imports at the top of the file:

```ts
import Link from "next/link";
import { Button } from "@/components/ui/button";
```

```tsx
function AnnouncementsWidget({ announcements }: AnnouncementsWidgetProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white">
      <div className="flex items-center gap-3 bg-danger-deep p-4">
        <Megaphone className="h-5 w-5 text-white" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-white">Latest Announcements</h3>
      </div>
      <div className="space-y-4 p-4">
        {announcements.map((announcement) => {
          const { month, day } = toCalendarParts(announcement.date);
          return (
            <Link
              key={announcement.id}
              href={`/notices/${announcement.slug}`}
              className="group flex gap-4 border-b border-ink-200 pb-4 last:border-0 last:pb-0"
            >
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl",
                  announcement.urgent
                    ? "bg-danger-soft text-danger-soft-fg"
                    : "bg-brand-100 text-ink-900",
                )}
              >
                <span className="text-lg font-bold leading-tight">{day}</span>
                <span className="text-[10px] font-bold">{month}</span>
              </div>
              <div>
                <h4 className="text-sm font-semibold tracking-tight text-ink-900 transition-colors group-hover:text-brand-700">
                  {announcement.title}
                </h4>
                <p className="mt-1 text-xs text-ink-600">{announcement.excerpt}</p>
                {announcement.urgent ? (
                  <Badge variant="urgent" className="mt-2 text-[10px]">
                    Urgent
                  </Badge>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
      <div className="border-t border-ink-200 p-4">
        <Button href="/notices" variant="outline" className="w-full">
          View All
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Extend the e2e test**

Append to `tests/e2e/public/notices.spec.ts`:

```ts
test("homepage and sidebar 'View All' links point to /notices", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "View All" })).toHaveAttribute("href", "/notices");
  await expect(page.getByRole("link", { name: "View All Announcements" })).toHaveAttribute(
    "href",
    "/notices",
  );

  await page.goto("/announcements");
  const viewAll = page.getByRole("link", { name: "View All" });
  test.skip((await viewAll.count()) === 0, "no published announcements in this environment");
  await expect(viewAll.last()).toHaveAttribute("href", "/notices");
});
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS — this resolves the last of the `news-sidebar.tsx`/`community-pulse-section.tsx`
errors left over from Task 2 Step 2.

Run: `npx playwright test tests/e2e/public/notices.spec.ts --project=public`
Expected: PASS (all three tests), or SKIP where no published announcements exist in the target
environment.

- [ ] **Step 5: Commit**

```bash
git add src/features/home/components/community-pulse-section.tsx src/features/announcements/components/news-sidebar.tsx tests/e2e/public/notices.spec.ts
git commit -m "feat: wire the homepage card and sidebar widget into /notices"
```

---

## After Task 6

Run the full suite once more (`npm run typecheck && npm run lint && npm run test:unit && npx
playwright test --project=public`), then update `CLAUDE.md` per its own standing rule (a new
public route, a new migration, and a new admin-editable field are all architecturally relevant)
before considering this plan done.
