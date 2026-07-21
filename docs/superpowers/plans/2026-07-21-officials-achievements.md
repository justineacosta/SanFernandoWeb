# Officials Achievements Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each barangay official a published achievements timeline on their profile page, editable from the existing officials drawer, with up to three photos per achievement.

**Architecture:** Two child tables (`official_achievements` → `official_achievement_photos`) mirroring the shipped `news_articles` → `news_photos` shape. Achievements persist immediately per item through Server Actions behind `requirePermission("manage-officials")` — they cannot be batched into the parent form's Save, because photo uploads need a stable row id first. The public profile page reads them through a nested PostgREST embed and renders a vertical timeline reusing a lightbox promoted from the announcements feature.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Supabase (Postgres + Storage), zod v4, lucide-react.

**Design spec:** `docs/superpowers/specs/2026-07-21-officials-achievements-design.md`

## Global Constraints

- **zod is v4.** Use `z.uuid()`, never the deprecated v3 `z.string().uuid()`.
- **`group` is a SQL reserved word.** It must stay quoted as `"group"` in every DDL statement and every PostgREST `.select()` / `.eq()` / `.order()` string. Existing code already does this — do not "clean it up".
- **RLS is enabled with ZERO policies on every table.** New tables follow suit. The service-role client (`src/lib/supabase/admin.ts`) behind an explicit `requirePermission(...)` code check is the entire auth gate. Never expose the service-role key to the client.
- **Server Actions are public HTTP endpoints.** Every argument is attacker-controlled. Re-validate every input with Zod at runtime; TypeScript types constrain nothing at the wire.
- **PostgREST `.eq()` never matches NULL.** Use `.is(col, null)` when you mean NULL.
- **Design tokens only:** `brand-100`–`brand-800`, `ink-*`, `danger*`. There is **no** `brand-50` and **no** `brand-900`. No blue tokens — they are from the pre-2026-07 design and must not reappear. Space Grotesk is `font-display`.
- **No test framework exists and this plan does not add one.** Verification is `npm run typecheck`, `npm run lint`, `npm run build`, plus driving the running app. Tests belong to the later hardening phase.
- **Migrations are applied manually by the repo owner** against Supabase staging. Never assume `0013` has been applied without explicit confirmation. Do not attempt to apply it yourself.
- **Never `git add -A` or `git add .`** — `proposal/`, `stitch_tabbed_content_manager/`, `stitch_tabbed_content_manager.zip`, and the dirty `stitch/barangay_sampaguita_barangay_officials/code.html` must never be staged. Stage explicit paths only.
- **Never create, provision, or use an admin account**, and never modify or delete any database row or Storage object you did not create. The owner's real barangay documents live in this project.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Shell note:** the Bash tool is Git Bash. PowerShell here-strings (`@'...'@`) do **not** work. Use a heredoc (`git commit -F - <<'EOF'`) for multi-line commit messages.
- **Deliberate design decision (not a defect):** `achievement-photos.ts` closely mirrors `news-photos.ts` rather than abstracting a shared uploader. The two differ in table, FK column, permission, path helper, cap, revalidation targets, and audit label — seven parameters, which would make a factory harder to read than two concrete files. This matches the codebase's existing per-feature action-file convention.

## File Structure

**Create**

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0013_official_achievements.sql` | Both tables, indexes, RLS, `updated_at` trigger |
| `src/components/shared/photo-gallery.tsx` | Shared grid + lightbox (moved from announcements) |
| `src/features/admin/actions/achievements.ts` | Create / update / visibility / reorder / delete |
| `src/features/admin/actions/achievement-photos.ts` | Upload / reorder / alt / remove photos |
| `src/features/admin/queries/achievements.ts` | Admin-side read of an official's achievements |
| `src/features/admin/components/achievement-photo-uploader.tsx` | 3-photo uploader for one achievement |
| `src/features/admin/components/achievements-editor.tsx` | The drawer sub-list |
| `src/features/officials/components/achievements-timeline.tsx` | Public timeline |

**Modify**

| File | Change |
| --- | --- |
| `src/types/index.ts` | `NewsPhoto` → `GalleryPhoto`; achievement types |
| `src/lib/storage.ts` | `achievementPhotoPath` |
| `src/app/(public)/announcements/[slug]/page.tsx` | Import the moved gallery |
| `src/features/admin/actions/news-photos.ts`, `actions/news.ts`, `queries/news.ts`, `components/news-form.tsx`, `components/news-photo-uploader.tsx` | `NewsPhoto` → `GalleryPhoto` (type rename only) |
| `src/features/admin/queries/officials.ts` | `getOfficialForEdit` also returns achievements |
| `src/features/admin/actions/officials.ts` | Storage sweep in `deleteOfficial` |
| `src/features/admin/components/official-form.tsx` | Mount the editor |
| `src/features/officials/queries.ts` | Nested embed on `getPublishedOfficialBySlug` |
| `src/app/(public)/officials/[slug]/page.tsx` | Render the timeline |
| `docs/BACKEND_HANDOFF.md` | Document the new tables, actions, storage prefix |

**Delete**

- `src/features/announcements/components/news-gallery.tsx` (moved to shared)

---

## Task 1: Promote the lightbox to a shared `PhotoGallery`

Pure refactor with **zero behaviour change**. The announcements article page must render byte-identically afterwards. `NewsGallery` has exactly one consumer and is not exported from the announcements barrel, so the move is contained.

**Files:**
- Create: `src/components/shared/photo-gallery.tsx`
- Delete: `src/features/announcements/components/news-gallery.tsx`
- Modify: `src/types/index.ts:179-183`, `src/app/(public)/announcements/[slug]/page.tsx:7,63`
- Modify (type rename only): `src/features/admin/actions/news-photos.ts`, `src/features/admin/actions/news.ts`, `src/features/admin/queries/news.ts`, `src/features/admin/components/news-form.tsx`, `src/features/admin/components/news-photo-uploader.tsx`

**Interfaces:**
- Produces: `GalleryPhoto` (`{ id: string; src: string; alt: string }`), and `PhotoGallery({ photos, variant }: { photos: GalleryPhoto[]; variant?: "feature" | "thumbs" })`. Tasks 4 and 5 consume both.

- [ ] **Step 1: Rename the `NewsPhoto` type**

In `src/types/index.ts`, replace the `NewsPhoto` interface (currently at line 179) with:

```ts
export interface GalleryPhoto {
  id: string;
  src: string; // raw reference; resolve with photoUrl() at render
  alt: string;
}
```

Keep the trailing comment **verbatim** — this step changes the name only, not the semantics.

- [ ] **Step 2: Update every `NewsPhoto` reference**

These are the only occurrences. Replace `NewsPhoto` with `GalleryPhoto` in each (they are all type positions — do **not** rename `NewsPhotoUploader`, `uploadNewsPhotos`, `removeNewsPhoto`, `reorderNewsPhotos`, or `updateNewsPhotoAlt`, which are values, not the type):

- `src/types/index.ts` — the `photos: NewsPhoto[]` field around line 201
- `src/features/admin/actions/news-photos.ts:4,40`
- `src/features/admin/actions/news.ts:5,63`
- `src/features/admin/queries/news.ts:2,59`
- `src/features/admin/components/news-form.tsx:4,20`
- `src/features/admin/components/news-photo-uploader.tsx:6,23,25`

- [ ] **Step 3: Create the shared gallery**

Create `src/components/shared/photo-gallery.tsx`. This is the current `news-gallery.tsx` with three changes: the component and prop type are renamed, a `variant` prop is added, and `tile` takes its `sizes` from the variant.

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GalleryPhoto } from "@/types";
import { cn } from "@/lib/utils";

export type PhotoGalleryVariant = "feature" | "thumbs";

interface PhotoGalleryProps {
  photos: GalleryPhoto[];
  /**
   * `feature` (default) is the news-article layout: a responsive 1/2/3-photo
   * grid with a wide hero tile. `thumbs` is the compact row used inside an
   * achievement entry, where the photos support the text rather than lead it.
   */
  variant?: PhotoGalleryVariant;
}

export function PhotoGallery({ photos, variant = "feature" }: PhotoGalleryProps) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const count = photos.length;

  const close = useCallback(() => setOpenAt(null), []);
  const step = useCallback(
    (delta: number) => setOpenAt((i) => (i === null ? i : (i + delta + count) % count)),
    [count],
  );

  useEffect(() => {
    if (openAt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAt, close, step]);

  if (count === 0) return null;

  const tileSizes =
    variant === "thumbs" ? "(min-width: 768px) 240px, 33vw" : "(min-width: 768px) 66vw, 100vw";

  const tile = (photo: GalleryPhoto, index: number, className: string) => (
    <button
      key={photo.id}
      type="button"
      onClick={() => setOpenAt(index)}
      className={cn("group relative overflow-hidden rounded-2xl bg-ink-100", className)}
      aria-label={`View photo ${index + 1} of ${count}`}
    >
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes={tileSizes}
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
    </button>
  );

  return (
    <>
      {variant === "thumbs" ? (
        // Always three columns so thumbnails stay a uniform size whether the
        // entry has one photo or three.
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo, index) => tile(photo, index, "aspect-square"))}
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-3",
            count === 1 && "grid-cols-1",
            count === 2 && "grid-cols-1 sm:grid-cols-2",
            count === 3 && "grid-cols-2",
          )}
        >
          {count === 3
            ? [
                tile(photos[0], 0, "col-span-2 aspect-video"),
                tile(photos[1], 1, "aspect-square"),
                tile(photos[2], 2, "aspect-square"),
              ]
            : photos.map((photo, index) => tile(photo, index, "aspect-video"))}
        </div>
      )}

      {openAt !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/90 p-4"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          {count > 1 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); step(-1); }}
              aria-label="Previous photo"
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <ChevronLeft className="h-7 w-7" aria-hidden="true" />
            </button>
          ) : null}
          <div className="relative h-[80vh] w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <Image
              src={photos[openAt].src}
              alt={photos[openAt].alt}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
          {count > 1 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); step(1); }}
              aria-label="Next photo"
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <ChevronRight className="h-7 w-7" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Point the announcements page at the shared component**

In `src/app/(public)/announcements/[slug]/page.tsx`, change line 7 from

```tsx
import { NewsGallery } from "@/features/announcements/components/news-gallery";
```

to

```tsx
import { PhotoGallery } from "@/components/shared/photo-gallery";
```

and line 63 from `<NewsGallery photos={article.photos} />` to `<PhotoGallery photos={article.photos} />`. Do **not** pass a `variant` — the default preserves today's layout exactly.

Keep the import in the file's existing ordering convention (it sits with the other `@/` imports).

- [ ] **Step 5: Delete the old file**

```bash
git rm src/features/announcements/components/news-gallery.tsx
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: both clean. Typecheck is the real gate here — it catches any `NewsPhoto` or `NewsGallery` reference missed in Steps 2 and 4.

Then confirm nothing references the old names:

```bash
grep -rn "NewsGallery\|NewsPhoto\b" src/ || echo "clean"
```

Expected: `clean`.

- [ ] **Step 7: Commit**

`git rm` in Step 5 already staged the deletion, so it is not repeated here.

```bash
git add src/components/shared/photo-gallery.tsx src/types/index.ts \
  "src/app/(public)/announcements/[slug]/page.tsx" \
  src/features/admin/actions/news-photos.ts src/features/admin/actions/news.ts \
  src/features/admin/queries/news.ts src/features/admin/components/news-form.tsx \
  src/features/admin/components/news-photo-uploader.tsx
git commit -F - <<'EOF'
refactor(ui): promote the news lightbox to a shared PhotoGallery

The officials achievements timeline needs the same grid + lightbox, and
importing it from features/announcements would break the rule that feature
modules own everything for their own route.

Adds a `variant` prop: "feature" is the existing news layout (the default, so
the announcements page renders unchanged) and "thumbs" is the compact row the
timeline will use. Renames the NewsPhoto type to GalleryPhoto to match.

No behaviour change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: Migration, storage helper, and achievement types

Schema and shared vocabulary. No behaviour yet.

**Files:**
- Create: `supabase/migrations/0013_official_achievements.sql`
- Modify: `src/lib/storage.ts`, `src/types/index.ts`

**Interfaces:**
- Consumes: `GalleryPhoto` from Task 1.
- Produces: tables `official_achievements` and `official_achievement_photos`; `achievementPhotoPath(achievementId, ext)`; types `AchievementValues`, `AdminAchievement`, `PublicAchievement`. Tasks 3, 4, and 5 consume all of them.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0013_official_achievements.sql`:

```sql
-- Officials achievements (master spec §6; design doc
-- docs/superpowers/specs/2026-07-21-officials-achievements-design.md).
--
-- The follow-up deliberately deferred out of Plan 6 (migration 0012). Shape
-- mirrors news_articles → news_photos, which is the established pattern for
-- "a record with up to three uploaded photos".
--
-- RLS: enabled with NO policies, exactly like every other table. Public reads
-- go through the service-role client with explicit is_visible / title filters;
-- writes go through Server Actions behind requirePermission("manage-officials").
-- The code check is the entire gate.
--
-- Storage: photos live in the EXISTING `public-media` bucket under an
-- `achievements/<achievementId>/` prefix. No new bucket.

create table public.official_achievements (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references public.officials (id) on delete cascade,
  -- Defaults to '' because "Add achievement" creates the row before the staff
  -- member has typed anything. A blank title is filtered out of the public
  -- query, so an unfinished entry can never reach the site.
  title text not null default '',
  description text not null default '',
  -- Free text, not a date: barangay achievements are "March 2024", "2023-2024",
  -- or "Ongoing". Ordering is owned by sort_order, so this never needs to sort.
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

-- No seed rows: the barangay has supplied no achievement content yet.
```

**Do not apply this migration.** The repo owner applies migrations manually against Supabase staging.

- [ ] **Step 2: Add the storage path helper**

In `src/lib/storage.ts`, directly below `newsPhotoPath` (line 21), add:

```ts
/**
 * Storage object path for an achievement photo:
 * `achievements/<achievementId>/<uuid>.<ext>`. Mirrors newsPhotoPath so the
 * bucket keeps one convention for "photos belonging to a record".
 */
export function achievementPhotoPath(achievementId: string, ext: string): string {
  return `achievements/${achievementId}/${crypto.randomUUID()}.${ext}`;
}
```

- [ ] **Step 3: Add the achievement types**

In `src/types/index.ts`, immediately after the officials types (`OfficialListItem`, `OfficialDetail`, `OfficialValues`, `AdminOfficialRow`), add:

```ts
/** The three text fields of an achievement, as the drawer editor saves them. */
export interface AchievementValues {
  title: string;
  description: string;
  dateLabel: string;
}

/** One achievement row in the admin drawer editor. `photos[].src` is render-ready. */
export interface AdminAchievement extends AchievementValues {
  id: string;
  isVisible: boolean;
  photos: GalleryPhoto[];
}

/** One achievement as the public timeline renders it. `photos[].src` is render-ready. */
export interface PublicAchievement extends AchievementValues {
  id: string;
  photos: GalleryPhoto[];
}
```

Then extend `OfficialDetail` (which currently reads `extends OfficialListItem { term: string; bio: string; }`) with the timeline data:

```ts
export interface OfficialDetail extends OfficialListItem {
  term: string;
  bio: string;
  achievements: PublicAchievement[];
}
```

This will make `src/features/officials/queries.ts` fail to typecheck until Task 5 populates the field. To keep this task independently verifiable, add the field in `getPublishedOfficialBySlug`'s return object as `achievements: []` for now, with the comment:

```ts
    // Populated in Task 5, when the nested embed lands.
    achievements: [],
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_official_achievements.sql src/lib/storage.ts \
  src/types/index.ts src/features/officials/queries.ts
git commit -F - <<'EOF'
feat(officials): schema and types for the achievements timeline

Migration 0013 adds official_achievements and official_achievement_photos,
mirroring the news_articles -> news_photos shape. Both have RLS enabled with
zero policies; the code-level permission check is the gate, as everywhere else.

date_label is free text rather than a date column: barangay achievements are
"March 2024" or "Ongoing", and sort_order already owns the ordering.

Not applied — the owner applies migrations manually against staging.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 3: Server Actions and admin query

All the write paths, plus the Storage sweep that the DB cascade cannot do.

**Files:**
- Create: `src/features/admin/actions/achievements.ts`, `src/features/admin/actions/achievement-photos.ts`, `src/features/admin/queries/achievements.ts`
- Modify: `src/features/admin/queries/officials.ts`, `src/features/admin/actions/officials.ts:264-281`

**Interfaces:**
- Consumes: `AchievementValues`, `AdminAchievement`, `GalleryPhoto`, `achievementPhotoPath` (Task 2); `photoUrl`, `extForType`, `PUBLIC_MEDIA_BUCKET`, `ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_BYTES` (existing `src/lib/storage.ts`); `requirePermission`, `recordActivity`, `createSupabaseAdminClient`.
- Produces, for Task 4:
  - `createAchievement(officialId: string): Promise<{ error: string | null; id: string | null }>`
  - `updateAchievement(id: string, values: AchievementValues): Promise<{ error: string | null }>`
  - `setAchievementVisibility(id: string, isVisible: boolean): Promise<{ error: string | null }>`
  - `reorderAchievements(officialId: string, orderedIds: string[]): Promise<{ error: string | null }>`
  - `deleteAchievement(id: string): Promise<{ error: string | null }>`
  - `uploadAchievementPhotos(achievementId: string, formData: FormData): Promise<{ error: string | null; photos: GalleryPhoto[] }>`
  - `reorderAchievementPhotos(achievementId: string, orderedIds: string[]): Promise<{ error: string | null }>`
  - `updateAchievementPhotoAlt(photoId: string, alt: string): Promise<{ error: string | null }>`
  - `removeAchievementPhoto(photoId: string): Promise<{ error: string | null }>`
  - `getOfficialForEdit` gains an `achievements: AdminAchievement[]` field in its return object.

- [ ] **Step 1: Create the admin query**

Create `src/features/admin/queries/achievements.ts`:

```ts
import "server-only";
import type { AdminAchievement } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";

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
 * unfinished and deliberately hidden entries.
 */
export async function listAchievementsForOfficial(
  officialId: string,
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

  return (data as unknown as AchievementRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    dateLabel: row.date_label,
    isVisible: row.is_visible,
    // Embedded rows come back in no guaranteed order — sort here rather than
    // relying on a nested order parameter.
    photos: [...(row.official_achievement_photos ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((photo) => ({ id: photo.id, src: photoUrl(photo.src), alt: photo.alt })),
  }));
}
```

- [ ] **Step 2: Return achievements from `getOfficialForEdit`**

In `src/features/admin/queries/officials.ts`, add the import:

```ts
import { listAchievementsForOfficial } from "./achievements";
```

Change the `getOfficialForEdit` signature's return type to include achievements:

```ts
export async function getOfficialForEdit(
  id: string,
): Promise<{
  values: OfficialValues;
  status: ContentStatus;
  photoUrl: string | null;
  achievements: AdminAchievement[];
} | null> {
```

Add `AdminAchievement` to the type import on line 2. Then, after the `if (error || !data) return null;` guard, fetch the achievements and include them in the returned object:

```ts
  if (error || !data) return null;

  const achievements = await listAchievementsForOfficial(id);

  return {
    values: {
      // ... unchanged
    },
    status: data.status as ContentStatus,
    photoUrl: data.photo_path ? photoUrl(data.photo_path as string) : null,
    achievements,
  };
```

- [ ] **Step 3: Create the achievement actions**

Create `src/features/admin/actions/achievements.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AchievementValues } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}
export interface CreateResult {
  error: string | null;
  id: string | null;
}

/** A profile page is a summary, not a CV. */
const MAX_ACHIEVEMENTS = 20;

const valuesSchema = z.object({
  title: z.string().trim().max(160, "Keep the title under 160 characters."),
  description: z.string().max(2000, "Keep the description under 2000 characters."),
  dateLabel: z.string().trim().max(60, "Keep the date short, like “March 2024”."),
});

// `z.uuid()` is the zod v4 top-level form; the v3 `z.string().uuid()` spelling
// is deprecated in v4.
const idSchema = z.uuid();
const reorderSchema = z.array(z.uuid()).min(1).max(MAX_ACHIEVEMENTS);

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Achievements render only on the official's own profile page, so the
 * directory (/officials) and the About captain block need no revalidation.
 */
async function revalidateForOfficial(admin: Admin, officialId: string) {
  revalidatePath("/admin/officials");
  const { data } = await admin
    .from("officials")
    .select("slug")
    .eq("id", officialId)
    .maybeSingle();
  if (data?.slug) revalidatePath(`/officials/${data.slug as string}`);
}

/** Resolve the owning official — needed for both revalidation and audit. */
async function officialIdFor(admin: Admin, achievementId: string): Promise<string | null> {
  const { data } = await admin
    .from("official_achievements")
    .select("official_id")
    .eq("id", achievementId)
    .maybeSingle();
  return (data?.official_id as string) ?? null;
}

/**
 * Insert an empty achievement at the end of the list. The row exists before
 * the staff member types anything because its photos need a stable id to
 * upload against; a blank title is filtered out of the public query, so an
 * unfinished entry cannot reach the site.
 */
export async function createAchievement(officialId: string): Promise<CreateResult> {
  const actor = await requirePermission("manage-officials");
  if (!idSchema.safeParse(officialId).success) {
    return { error: "Invalid official.", id: null };
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: countErr } = await admin
    .from("official_achievements")
    .select("sort_order")
    .eq("official_id", officialId)
    .order("sort_order", { ascending: false });
  if (countErr) return { error: "Could not add the achievement.", id: null };

  const rows = existing ?? [];
  if (rows.length >= MAX_ACHIEVEMENTS) {
    return { error: `An official can have at most ${MAX_ACHIEVEMENTS} achievements.`, id: null };
  }
  const nextOrder = ((rows[0]?.sort_order as number) ?? -1) + 1;

  const { data, error } = await admin
    .from("official_achievements")
    .insert({ official_id: officialId, sort_order: nextOrder })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not add the achievement.", id: null };

  await recordActivity(actor, "added achievement", "official", officialId);
  await revalidateForOfficial(admin, officialId);
  return { error: null, id: data.id as string };
}

export async function updateAchievement(
  id: string,
  values: AchievementValues,
): Promise<ActionResult> {
  const actor = await requirePermission("manage-officials");
  if (!idSchema.safeParse(id).success) return { error: "Invalid achievement." };

  const parsed = valuesSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values." };
  }

  const admin = createSupabaseAdminClient();
  const officialId = await officialIdFor(admin, id);
  if (!officialId) return { error: "Achievement not found." };

  const { error } = await admin
    .from("official_achievements")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      date_label: parsed.data.dateLabel,
    })
    .eq("id", id);
  if (error) return { error: "Could not save the achievement." };

  await recordActivity(actor, "updated achievement", "official", officialId, parsed.data.title);
  await revalidateForOfficial(admin, officialId);
  return { error: null };
}

export async function setAchievementVisibility(
  id: string,
  isVisible: boolean,
): Promise<ActionResult> {
  const actor = await requirePermission("manage-officials");
  if (!idSchema.safeParse(id).success) return { error: "Invalid achievement." };
  if (typeof isVisible !== "boolean") return { error: "Invalid value." };

  const admin = createSupabaseAdminClient();
  const officialId = await officialIdFor(admin, id);
  if (!officialId) return { error: "Achievement not found." };

  const { error } = await admin
    .from("official_achievements")
    .update({ is_visible: isVisible })
    .eq("id", id);
  if (error) return { error: "Could not update the achievement." };

  await recordActivity(
    actor,
    isVisible ? "showed achievement" : "hid achievement",
    "official",
    officialId,
  );
  await revalidateForOfficial(admin, officialId);
  return { error: null };
}

/**
 * Rewrite positions from an ordered id list. Every update is scoped to the
 * owning official, so a forged id belonging to someone else is a no-op rather
 * than a cross-record write.
 */
export async function reorderAchievements(
  officialId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const actor = await requirePermission("manage-officials");
  if (!idSchema.safeParse(officialId).success) return { error: "Invalid official." };
  if (!reorderSchema.safeParse(orderedIds).success) return { error: "Invalid ordering." };

  const admin = createSupabaseAdminClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from("official_achievements")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("official_id", officialId);
    if (error) return { error: "Could not save the new order." };
  }

  await recordActivity(actor, "reordered achievements", "official", officialId);
  await revalidateForOfficial(admin, officialId);
  return { error: null };
}

/**
 * Delete an achievement and its photos. The DB cascade removes the photo
 * ROWS; Storage objects are invisible to Postgres and must be swept here.
 */
export async function deleteAchievement(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-officials");
  if (!idSchema.safeParse(id).success) return { error: "Invalid achievement." };

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("official_achievements")
    .select("official_id, title")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: null }; // already gone

  const { data: photos } = await admin
    .from("official_achievement_photos")
    .select("src")
    .eq("achievement_id", id);
  // Only remove objects we own — a value that is already a remote URL was
  // never uploaded here and must be left alone.
  const paths = (photos ?? [])
    .map((photo) => photo.src as string)
    .filter((src) => !/^https?:\/\//i.test(src));
  if (paths.length > 0) {
    await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove(paths);
  }

  const { error } = await admin.from("official_achievements").delete().eq("id", id);
  if (error) return { error: "Could not delete the achievement." };

  const officialId = existing.official_id as string;
  await recordActivity(
    actor,
    "deleted achievement",
    "official",
    officialId,
    (existing.title as string) ?? "",
  );
  await revalidateForOfficial(admin, officialId);
  return { error: null };
}
```

- [ ] **Step 4: Create the photo actions**

Create `src/features/admin/actions/achievement-photos.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { GalleryPhoto } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  achievementPhotoPath,
  extForType,
  photoUrl,
} from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}

const MAX_PHOTOS = 3;

const idSchema = z.uuid();
const reorderSchema = z.array(z.uuid()).min(1).max(MAX_PHOTOS);

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function currentPhotos(admin: Admin, achievementId: string) {
  const { data } = await admin
    .from("official_achievement_photos")
    .select("id, src, alt, sort_order")
    .eq("achievement_id", achievementId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

/** Achievements render only on the owning official's profile page. */
async function revalidateForAchievement(admin: Admin, achievementId: string) {
  revalidatePath("/admin/officials");
  const { data: achievement } = await admin
    .from("official_achievements")
    .select("official_id")
    .eq("id", achievementId)
    .maybeSingle();
  if (!achievement) return;
  const { data: official } = await admin
    .from("officials")
    .select("slug")
    .eq("id", achievement.official_id as string)
    .maybeSingle();
  if (official?.slug) revalidatePath(`/officials/${official.slug as string}`);
}

export async function uploadAchievementPhotos(
  achievementId: string,
  formData: FormData,
): Promise<{ error: string | null; photos: GalleryPhoto[] }> {
  const actor = await requirePermission("manage-officials");
  if (!idSchema.safeParse(achievementId).success) {
    return { error: "Invalid achievement.", photos: [] };
  }

  const admin = createSupabaseAdminClient();
  const { data: achievement } = await admin
    .from("official_achievements")
    .select("id")
    .eq("id", achievementId)
    .maybeSingle();
  if (!achievement) return { error: "Achievement not found.", photos: [] };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one photo.", photos: [] };

  const existing = await currentPhotos(admin, achievementId);
  if (existing.length + files.length > MAX_PHOTOS) {
    return { error: `An achievement can have at most ${MAX_PHOTOS} photos.`, photos: [] };
  }
  // Re-checked server-side: a Server Action is a public HTTP endpoint and the
  // client-side check can simply be skipped.
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { error: "Photos must be JPG, PNG, or WebP.", photos: [] };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: "Each photo must be 2 MB or smaller.", photos: [] };
    }
  }

  let sortOrder = existing.reduce((max, p) => Math.max(max, p.sort_order as number), -1);
  for (const file of files) {
    const path = achievementPhotoPath(achievementId, extForType(file.type));
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(PUBLIC_MEDIA_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return { error: "Upload failed. Try again.", photos: [] };
    sortOrder += 1;
    const { error: insErr } = await admin
      .from("official_achievement_photos")
      .insert({ achievement_id: achievementId, src: path, alt: "", sort_order: sortOrder });
    if (insErr) return { error: "Upload failed. Try again.", photos: [] };
  }

  await recordActivity(actor, "uploaded achievement photos", "official achievement", achievementId);
  await revalidateForAchievement(admin, achievementId);
  const refreshed = await currentPhotos(admin, achievementId);
  return {
    error: null,
    photos: refreshed.map((p) => ({
      id: p.id as string,
      src: photoUrl(p.src as string),
      alt: p.alt as string,
    })),
  };
}

export async function reorderAchievementPhotos(
  achievementId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const actor = await requirePermission("manage-officials");
  if (!idSchema.safeParse(achievementId).success) return { error: "Invalid achievement." };
  if (!reorderSchema.safeParse(orderedIds).success) return { error: "Invalid ordering." };

  const admin = createSupabaseAdminClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from("official_achievement_photos")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("achievement_id", achievementId);
    if (error) return { error: "Could not reorder photos." };
  }

  await recordActivity(actor, "reordered achievement photos", "official achievement", achievementId);
  await revalidateForAchievement(admin, achievementId);
  return { error: null };
}

export async function updateAchievementPhotoAlt(
  photoId: string,
  alt: string,
): Promise<ActionResult> {
  const actor = await requirePermission("manage-officials");
  if (!idSchema.safeParse(photoId).success) return { error: "Invalid photo." };
  if (typeof alt !== "string" || alt.length > 200) {
    return { error: "Keep the description under 200 characters." };
  }

  const admin = createSupabaseAdminClient();
  const { data: photo } = await admin
    .from("official_achievement_photos")
    .select("id, achievement_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { error: "Could not update the photo description." };

  const { error } = await admin
    .from("official_achievement_photos")
    .update({ alt })
    .eq("id", photoId);
  if (error) return { error: "Could not update the photo description." };

  const achievementId = photo.achievement_id as string;
  await recordActivity(
    actor,
    "updated achievement photo description",
    "official achievement",
    achievementId,
  );
  await revalidateForAchievement(admin, achievementId);
  return { error: null };
}

export async function removeAchievementPhoto(photoId: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-officials");
  if (!idSchema.safeParse(photoId).success) return { error: "Invalid photo." };

  const admin = createSupabaseAdminClient();
  const { data: photo } = await admin
    .from("official_achievement_photos")
    .select("id, src, achievement_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { error: null }; // already gone

  // Only delete an object we own, never a remote URL.
  if (!/^https?:\/\//i.test(photo.src as string)) {
    await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove([photo.src as string]);
  }
  const { error } = await admin
    .from("official_achievement_photos")
    .delete()
    .eq("id", photoId);
  if (error) return { error: "Could not remove the photo." };

  const achievementId = photo.achievement_id as string;
  await recordActivity(actor, "removed achievement photo", "official achievement", achievementId);
  await revalidateForAchievement(admin, achievementId);
  return { error: null };
}
```

- [ ] **Step 5: Sweep achievement photos when an official is deleted**

This is the integration point the DB cascade hides. In `src/features/admin/actions/officials.ts`, the `deleteOfficial` function (line 264) currently reads the row, deletes it, then removes the portrait. Insert the sweep **before** the delete — once the official row is gone, the achievement rows have cascaded away and their Storage paths are unrecoverable.

Add `PUBLIC_MEDIA_BUCKET` to the storage import at the top of the file (there is currently no import from `@/lib/storage` in this file, so add one):

```ts
import { PUBLIC_MEDIA_BUCKET } from "@/lib/storage";
```

Then rewrite the body of `deleteOfficial` between the `existing` read and the `.delete()` call:

```ts
  const { data: existing } = await admin
    .from("officials")
    .select("name, slug, photo_path")
    .eq("id", id)
    .maybeSingle();

  // Deleting the official cascades away its achievements and their photo
  // ROWS, but Postgres knows nothing about Storage. Collect the objects while
  // the rows still exist, or they are orphaned forever.
  const { data: achievements } = await admin
    .from("official_achievements")
    .select("id")
    .eq("official_id", id);
  const achievementIds = (achievements ?? []).map((row) => row.id as string);
  if (achievementIds.length > 0) {
    const { data: photos } = await admin
      .from("official_achievement_photos")
      .select("src")
      .in("achievement_id", achievementIds);
    const paths = (photos ?? [])
      .map((photo) => photo.src as string)
      .filter((src) => !/^https?:\/\//i.test(src));
    if (paths.length > 0) {
      await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove(paths);
    }
  }

  const { error } = await admin.from("officials").delete().eq("id", id);
```

Leave the rest of the function (portrait removal, audit, revalidate) unchanged.

- [ ] **Step 6: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/actions/achievements.ts \
  src/features/admin/actions/achievement-photos.ts \
  src/features/admin/queries/achievements.ts \
  src/features/admin/queries/officials.ts \
  src/features/admin/actions/officials.ts
git commit -F - <<'EOF'
feat(officials): server actions for achievements and their photos

Create/update/show-hide/reorder/delete for achievements, and
upload/reorder/alt/remove for their photos, all behind
requirePermission("manage-officials") with Zod re-validation at the wire.

deleteOfficial now sweeps achievement photos out of Storage before deleting
the row. The DB cascade removes the photo rows, but Postgres knows nothing
about Storage objects — without this, deleting an official orphaned every
achievement photo they had.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 4: Admin drawer editor

**Files:**
- Create: `src/features/admin/components/achievement-photo-uploader.tsx`, `src/features/admin/components/achievements-editor.tsx`
- Modify: `src/features/admin/components/official-form.tsx`, `src/features/admin/components/officials-manager.tsx:87-92`

**Interfaces:**
- Consumes: every action from Task 3; `AdminAchievement`, `AchievementValues`, `GalleryPhoto` (Task 2); existing `ToggleSwitch` (`{ label, checked, onChange }`) from `./toggle-switch`; existing `Input`, `Textarea` from `@/components/ui/form`.
- Produces: `AchievementsEditor({ officialId, achievements }: { officialId: string; achievements: AdminAchievement[] })`; `OfficialEditRecord` gains `achievements: AdminAchievement[]`.

- [ ] **Step 1: Create the photo uploader**

Create `src/features/admin/components/achievement-photo-uploader.tsx`. This mirrors `news-photo-uploader.tsx` against the achievement actions, at a smaller scale to suit a nested card.

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Trash2, Upload } from "lucide-react";
import type { GalleryPhoto } from "@/types";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/storage";
import { Input } from "@/components/ui/form";
import {
  removeAchievementPhoto,
  reorderAchievementPhotos,
  updateAchievementPhotoAlt,
  uploadAchievementPhotos,
} from "@/features/admin/actions/achievement-photos";

const MAX = 3;

interface AchievementPhotoUploaderProps {
  achievementId: string;
  photos: GalleryPhoto[];
}

export function AchievementPhotoUploader({
  achievementId,
  photos: initial,
}: AchievementPhotoUploaderProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Last-known-good alt text per photo id, so a failed save can revert the
  // input instead of leaving stale, unsaved text in the field.
  const savedAltRef = useRef<Record<string, string>>(
    Object.fromEntries(initial.map((p) => [p.id, p.alt])),
  );

  function validate(files: File[]): string | null {
    if (photos.length + files.length > MAX) {
      return `An achievement can have at most ${MAX} photos.`;
    }
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
        return "Photos must be JPG, PNG, or WebP.";
      }
      if (file.size > MAX_IMAGE_BYTES) return "Each photo must be 2 MB or smaller.";
    }
    return null;
  }

  function submit(files: File[]) {
    setError(null);
    if (files.length === 0) return;
    const message = validate(files);
    if (message) {
      setError(message);
      return;
    }
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    start(async () => {
      const result = await uploadAchievementPhotos(achievementId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPhotos(result.photos);
      result.photos.forEach((p) => {
        savedAltRef.current[p.id] = p.alt;
      });
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return;
    const previous = photos;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    setPhotos(next);
    setError(null);
    start(async () => {
      const result = await reorderAchievementPhotos(
        achievementId,
        next.map((p) => p.id),
      );
      if (result.error) {
        setPhotos(previous);
        setError(result.error);
      }
    });
  }

  function remove(id: string) {
    const previous = photos;
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setError(null);
    start(async () => {
      const result = await removeAchievementPhoto(id);
      if (result.error) {
        setPhotos(previous);
        setError(result.error);
      }
    });
  }

  function saveAlt(id: string, alt: string) {
    const previousAlt = savedAltRef.current[id] ?? "";
    if (alt === previousAlt) return;
    setError(null);
    start(async () => {
      const result = await updateAchievementPhotoAlt(id, alt);
      if (result.error) {
        setError(result.error);
        setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, alt: previousAlt } : p)));
      } else {
        savedAltRef.current[id] = alt;
      }
    });
  }

  return (
    <div className="space-y-2">
      {photos.length < MAX ? (
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            submit(Array.from(event.dataTransfer.files));
          }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 p-3 text-center text-xs text-ink-500 hover:border-brand-400"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          <span>Add photos (JPG/PNG/WebP, ≤ 2 MB, up to {MAX}).</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(event) => {
              submit(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <li key={photo.id} className="space-y-1">
              <div className="overflow-hidden rounded-xl bg-ink-100">
                <div className="relative aspect-square">
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="100px"
                    className="object-cover"
                  />
                </div>
                <div className="flex items-center justify-between gap-1 p-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || pending}
                    aria-label={`Move photo ${index + 1} left`}
                    className="rounded p-1 text-ink-600 hover:bg-white disabled:opacity-30"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === photos.length - 1 || pending}
                    aria-label={`Move photo ${index + 1} right`}
                    className="rounded p-1 text-ink-600 hover:bg-white disabled:opacity-30"
                  >
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(photo.id)}
                    disabled={pending}
                    aria-label={`Remove photo ${index + 1}`}
                    className="rounded p-1 text-danger hover:bg-white disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <Input
                value={photo.alt}
                onChange={(event) =>
                  setPhotos((prev) =>
                    prev.map((p) => (p.id === photo.id ? { ...p, alt: event.target.value } : p)),
                  )
                }
                onBlur={(event) => saveAlt(photo.id, event.target.value)}
                // This uploader lives inside the official's <form>; Enter in a
                // text input would submit that form and close the drawer.
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder="Description"
                aria-label={`Description for photo ${index + 1}`}
                className="rounded-lg px-2 py-1 text-xs"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Create the achievements editor**

Create `src/features/admin/components/achievements-editor.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { AchievementValues, AdminAchievement } from "@/types";
import { Field, Input, Textarea } from "@/components/ui/form";
import {
  createAchievement,
  deleteAchievement,
  reorderAchievements,
  setAchievementVisibility,
  updateAchievement,
} from "@/features/admin/actions/achievements";
import { AchievementPhotoUploader } from "./achievement-photo-uploader";
import { ToggleSwitch } from "./toggle-switch";

const MAX = 20;

function toValues(achievement: AdminAchievement): AchievementValues {
  return {
    title: achievement.title,
    description: achievement.description,
    dateLabel: achievement.dateLabel,
  };
}

function sameValues(a: AchievementValues, b: AchievementValues): boolean {
  return a.title === b.title && a.description === b.description && a.dateLabel === b.dateLabel;
}

interface AchievementsEditorProps {
  officialId: string;
  achievements: AdminAchievement[];
}

/**
 * The achievements sub-list in the officials drawer. Every change persists
 * immediately rather than waiting for the parent form's Save: photos are real
 * uploads, so an achievement row must exist before its photos can.
 */
export function AchievementsEditor({ officialId, achievements: initial }: AchievementsEditorProps) {
  const [items, setItems] = useState<AdminAchievement[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Last-saved text per achievement, so a blur that changed nothing skips the
  // round trip and a failed save can revert the fields.
  const savedRef = useRef<Record<string, AchievementValues>>(
    Object.fromEntries(initial.map((a) => [a.id, toValues(a)])),
  );

  function setField<K extends keyof AchievementValues>(
    id: string,
    key: K,
    value: AchievementValues[K],
  ) {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, [key]: value } : a)));
  }

  function add() {
    setError(null);
    start(async () => {
      const result = await createAchievement(officialId);
      if (result.error || !result.id) {
        setError(result.error ?? "Could not add the achievement.");
        return;
      }
      const created: AdminAchievement = {
        id: result.id,
        title: "",
        description: "",
        dateLabel: "",
        isVisible: true,
        photos: [],
      };
      savedRef.current[created.id] = toValues(created);
      setItems((prev) => [...prev, created]);
      setFocusId(created.id);
    });
  }

  function saveFields(id: string) {
    const current = items.find((a) => a.id === id);
    if (!current) return;
    const next = toValues(current);
    const previous = savedRef.current[id];
    if (previous && sameValues(previous, next)) return;
    setError(null);
    start(async () => {
      const result = await updateAchievement(id, next);
      if (result.error) {
        setError(result.error);
        if (previous) {
          setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...previous } : a)));
        }
        return;
      }
      savedRef.current[id] = next;
    });
  }

  function toggleVisible(id: string, isVisible: boolean) {
    const previous = items;
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, isVisible } : a)));
    setError(null);
    start(async () => {
      const result = await setAchievementVisibility(id, isVisible);
      if (result.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const previous = items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    setError(null);
    start(async () => {
      const result = await reorderAchievements(
        officialId,
        next.map((a) => a.id),
      );
      if (result.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this achievement? Its photos are deleted too.")) return;
    const previous = items;
    setItems((prev) => prev.filter((a) => a.id !== id));
    setError(null);
    start(async () => {
      const result = await deleteAchievement(id);
      if (result.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  // Enter inside these inputs would submit the surrounding official form and
  // close the drawer.
  const blockEnter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") event.preventDefault();
  };

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-ink-500">
          No achievements yet. Add the first one below — it appears on this official&rsquo;s
          profile page.
        </p>
      ) : null}

      <ul className="space-y-3">
        {items.map((achievement, index) => (
          <li
            key={achievement.id}
            className="space-y-3 rounded-2xl border border-ink-200/70 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Achievement {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || pending}
                  aria-label={`Move achievement ${index + 1} up`}
                  className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1 || pending}
                  aria-label={`Move achievement ${index + 1} down`}
                  className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(achievement.id)}
                  disabled={pending}
                  aria-label={`Delete achievement ${index + 1}`}
                  className="rounded p-1 text-danger hover:bg-ink-50 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <Field label="Title" htmlFor={`achievement-title-${achievement.id}`}>
              <Input
                id={`achievement-title-${achievement.id}`}
                autoFocus={achievement.id === focusId}
                placeholder="e.g. Completed the barangay road concreting project"
                value={achievement.title}
                onChange={(event) => setField(achievement.id, "title", event.target.value)}
                onBlur={() => saveFields(achievement.id)}
                onKeyDown={blockEnter}
              />
            </Field>

            <Field label="Date" htmlFor={`achievement-date-${achievement.id}`}>
              <Input
                id={`achievement-date-${achievement.id}`}
                placeholder="e.g. March 2024"
                value={achievement.dateLabel}
                onChange={(event) => setField(achievement.id, "dateLabel", event.target.value)}
                onBlur={() => saveFields(achievement.id)}
                onKeyDown={blockEnter}
              />
            </Field>

            <Field label="Description" htmlFor={`achievement-description-${achievement.id}`}>
              <Textarea
                id={`achievement-description-${achievement.id}`}
                rows={3}
                value={achievement.description}
                onChange={(event) => setField(achievement.id, "description", event.target.value)}
                onBlur={() => saveFields(achievement.id)}
              />
            </Field>

            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-700">Photos</p>
              <AchievementPhotoUploader
                achievementId={achievement.id}
                photos={achievement.photos}
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-ink-200/70 pt-3">
              <span className="text-sm text-ink-600">
                {achievement.isVisible ? "Shown on the profile page" : "Hidden from the public"}
              </span>
              <ToggleSwitch
                label={`Show achievement ${index + 1} publicly`}
                checked={achievement.isVisible}
                onChange={(checked) => toggleVisible(achievement.id, checked)}
              />
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={add}
        disabled={pending || items.length >= MAX}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-3 text-sm font-semibold text-ink-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {items.length >= MAX ? `Limit of ${MAX} reached` : "Add achievement"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Mount the editor in the officials drawer**

In `src/features/admin/components/official-form.tsx`:

Add the import beside the existing `SingleImageUploader` import:

```tsx
import { AchievementsEditor } from "./achievements-editor";
```

Add `AdminAchievement` to the type import on line 4:

```tsx
import type { AdminAchievement, ContentStatus, OfficialValues } from "@/types";
```

Extend `OfficialEditRecord`:

```tsx
export interface OfficialEditRecord {
  id: string;
  values: OfficialValues;
  status: ContentStatus;
  photoUrl: string | null;
  achievements: AdminAchievement[];
}
```

Then, immediately after the Short Bio `<Field>` block (which ends just before the `{error ? …}` block near line 226), insert:

```tsx
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-700">Achievements</h3>
          {id ? (
            // `key` remounts the editor when a brand-new official is saved and
            // first acquires an id.
            <AchievementsEditor
              key={id}
              officialId={id}
              achievements={record?.achievements ?? []}
            />
          ) : (
            <p className="rounded-2xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">
              Save the official first to add achievements.
            </p>
          )}
        </div>
```

- [ ] **Step 4: Pass achievements through the manager**

In `src/features/admin/components/officials-manager.tsx`, the `openEdit` handler builds the record at lines 87-92. Add the new field:

```tsx
        setEditing({
          id: row.id,
          values: detail.values,
          status: detail.status,
          photoUrl: detail.photoUrl,
          achievements: detail.achievements,
        });
```

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/achievement-photo-uploader.tsx \
  src/features/admin/components/achievements-editor.tsx \
  src/features/admin/components/official-form.tsx \
  src/features/admin/components/officials-manager.tsx
git commit -F - <<'EOF'
feat(admin): achievements sub-list in the officials drawer

Each achievement is a card with title, date label, description, a visibility
toggle, reorder arrows, delete, and its own three-photo uploader. Changes
persist immediately per item, matching how news photos already work — photos
are real uploads, so a row must exist before they can attach to it.

A brand-new official shows "Save the official first to add achievements.",
the same precedent news-form.tsx sets for its photo uploader.

Text inputs swallow Enter: they sit inside the official's <form>, where Enter
would otherwise submit it and close the drawer.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 5: Public timeline

**Files:**
- Create: `src/features/officials/components/achievements-timeline.tsx`
- Modify: `src/features/officials/queries.ts:78-95`, `src/features/officials/index.ts`, `src/app/(public)/officials/[slug]/page.tsx`

**Interfaces:**
- Consumes: `PublicAchievement`, `OfficialDetail.achievements` (Task 2); `PhotoGallery` with `variant="thumbs"` (Task 1).
- Produces: `AchievementsTimeline({ achievements }: { achievements: PublicAchievement[] })`.

- [ ] **Step 1: Fetch achievements in the profile query**

In `src/features/officials/queries.ts`, add `PublicAchievement` to the type import on line 2, then replace `getPublishedOfficialBySlug` (lines 78-95) with:

```ts
interface AchievementPhotoRow {
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
  official_achievement_photos: AchievementPhotoRow[] | null;
}

const ACHIEVEMENT_EMBED =
  "official_achievements(id, title, description, date_label, is_visible, sort_order, official_achievement_photos(id, src, alt, sort_order))";

export async function getPublishedOfficialBySlug(slug: string): Promise<OfficialDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select(`${LIST_COLUMNS}, term, bio, ${ACHIEVEMENT_EMBED}`)
    .eq("status", "published")
    .not("photo_path", "is", null)
    .eq("slug", slug)
    // Filter the embedded rows at the database rather than shipping hidden or
    // unfinished achievements over the wire.
    .eq("official_achievements.is_visible", true)
    .neq("official_achievements.title", "")
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as OfficialRow & {
    official_achievements: AchievementRow[] | null;
  };

  // Belt-and-braces. The embedded filters above are the wire-level saving; the
  // repeat here is the guarantee, because a silently ignored embedded filter
  // would publish an achievement the barangay deliberately hid. Ordering is
  // done here too — two-level embedded ordering is the fragile part of a
  // nested embed, and a profile page is a handful of rows.
  const achievements: PublicAchievement[] = [...(row.official_achievements ?? [])]
    .filter((achievement) => achievement.is_visible && achievement.title.trim() !== "")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((achievement) => ({
      id: achievement.id,
      title: achievement.title,
      description: achievement.description,
      dateLabel: achievement.date_label,
      photos: [...(achievement.official_achievement_photos ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((photo) => ({ id: photo.id, src: photoUrl(photo.src), alt: photo.alt })),
    }));

  return {
    ...toListItem(row),
    term: row.term ?? "",
    bio: row.bio ?? "",
    achievements,
  };
}
```

- [ ] **Step 2: Create the timeline component**

Create `src/features/officials/components/achievements-timeline.tsx`:

```tsx
import type { PublicAchievement } from "@/types";
import { PhotoGallery } from "@/components/shared/photo-gallery";

interface AchievementsTimelineProps {
  achievements: PublicAchievement[];
}

/** Vertical timeline of an official's published achievements. */
export function AchievementsTimeline({ achievements }: AchievementsTimelineProps) {
  if (achievements.length === 0) return null;

  return (
    <div className="mt-12 max-w-3xl">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink-900">
        Achievements
      </h2>
      <ol className="mt-6 space-y-8 border-l border-ink-200/70 pl-8">
        {achievements.map((achievement) => (
          <li key={achievement.id} className="relative">
            {/* Sits on the rail: -(32px padding + 1px border) - half the dot. */}
            <span
              aria-hidden="true"
              className="absolute -left-[38.5px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500"
            />
            {achievement.dateLabel ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                {achievement.dateLabel}
              </p>
            ) : null}
            <h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-ink-900">
              {achievement.title}
            </h3>
            {achievement.description ? (
              <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-600">
                {achievement.description}
              </p>
            ) : null}
            {achievement.photos.length > 0 ? (
              <div className="mt-4">
                <PhotoGallery photos={achievement.photos} variant="thumbs" />
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 3: Export from the feature barrel**

Append to `src/features/officials/index.ts`, keeping the file's page-order convention:

```ts
export { AchievementsTimeline } from "./components/achievements-timeline";
```

- [ ] **Step 4: Render it on the profile page**

In `src/app/(public)/officials/[slug]/page.tsx`, add the import beside the existing feature import:

```tsx
import { AchievementsTimeline } from "@/features/officials";
```

Then, immediately after the closing `) : null}` of the bio block (line 105) and before the closing `</Section>`, add:

```tsx
      <AchievementsTimeline achievements={official.achievements} />
```

The component returns `null` when the list is empty, so no conditional is needed at the call site.

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all three clean. The build must still emit `/officials/[slug]` and `/announcements/[slug]`.

- [ ] **Step 6: Runtime check**

Follow `.claude/skills/verify/SKILL.md`. With the dev server running, load a published official's profile — for example `http://localhost:3000/officials/dominic-b-dela-cruz`.

Expected **before** migration `0013` is applied: the page renders exactly as it does today, with **no** Achievements section and no console error. The nested embed fails against a missing table, so `getPublishedOfficialBySlug` returns `null` and the page 404s — **if that happens, report it as a blocker rather than working around it**, because it means the page breaks on production until `0013` lands.

Expected **after** `0013` is applied (owner-confirmed only): the page renders with no Achievements section, because there are no achievement rows.

- [ ] **Step 7: Commit**

```bash
git add src/features/officials/components/achievements-timeline.tsx \
  src/features/officials/queries.ts src/features/officials/index.ts \
  "src/app/(public)/officials/[slug]/page.tsx"
git commit -F - <<'EOF'
feat(officials): render the achievements timeline on profile pages

A vertical amber-railed timeline below the bio, omitted entirely when an
official has no visible achievements. Photos reuse the shared PhotoGallery in
its compact "thumbs" variant, so the lightbox behaves exactly as it does on
news articles.

Hidden and untitled achievements are filtered both in the query and again in
TypeScript: a silently ignored embedded filter would publish an achievement
the barangay deliberately hid.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 6: Documentation

**Files:**
- Modify: `docs/BACKEND_HANDOFF.md`

- [ ] **Step 1: Read before writing**

`docs/BACKEND_HANDOFF.md` is a **living** document (unlike `docs/superpowers/specs/` and `docs/superpowers/plans/`, which are historical records that must never be retro-edited). Read the officials section and the schema section first, and match their existing structure and voice rather than appending a new differently-shaped block.

Do not trust this plan for the current contents of that file — read it.

- [ ] **Step 2: Document the new surface**

Cover, in the places the document's existing structure puts them:

- The `official_achievements` and `official_achievement_photos` tables, with their columns and the `on delete cascade` chain from `officials`.
- That migration `0013` is applied to **staging only** at time of writing, and production needs both `0012` and `0013` before deploy.
- The `achievements/<achievementId>/` prefix in the `public-media` bucket.
- The nine new Server Actions, all behind `manage-officials`.
- The public boundary for achievements: `is_visible = true` **and** a non-empty `title`, in addition to the official's own `status = 'published'`.
- That deleting an official sweeps achievement photos from Storage, because the DB cascade cannot.
- Under remaining content owed by the barangay: **real achievement content** — no achievements are seeded, so every official's timeline is empty until staff enter them.

- [ ] **Step 3: Commit**

```bash
git add docs/BACKEND_HANDOFF.md
git commit -F - <<'EOF'
docs: record the achievements tables, actions, and storage prefix

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Final verification

After Task 6:

```bash
npm run typecheck && npm run lint && npm run build
```

All three must pass.

**Owner-run checks** (the repo owner holds the admin credentials; agents must not create or use an admin account):

1. `/admin/news` — open an article, upload a photo, reorder, edit a description, remove one. This is the **regression check for the `PhotoGallery` move and the `GalleryPhoto` rename**.
2. `/announcements/<slug>` — confirm a photo gallery still renders and the lightbox still opens, steps with the arrow keys, and closes with Escape.
3. `/admin/officials` — open an official, add an achievement, type a title/date/description, and confirm each saves on blur.
4. Upload three photos to that achievement, reorder them, add descriptions, remove one.
5. Add a second achievement and reorder the two.
6. Toggle one achievement hidden.
7. `/officials/<slug>` — confirm the visible achievement appears with its photos and the hidden one does not.
8. Delete an achievement and confirm it disappears from both the drawer and the profile page.

**Reminder for the summary to the owner:** migration `0013` must be applied to staging before any of checks 3-8 can work, and both `0012` and `0013` are needed on production before deploy.
