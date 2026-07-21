# Transparency Enhancements Design (Plan 5)

**Status:** Approved by repo owner 2026-07-21.
**Builds on:** Plan 4 (transparency documents), merged to `main` at `a0a2255`.
**Branch:** `feature/transparency-enhancements`.

## 1. Overview

Five enhancements to the now DB-backed transparency area, all agreed with the
repo owner:

1. **Sortable tables** (ascending/descending) on the public `/transparency`
   tables *and* the admin manager tables.
2. **Unified "Latest Uploads" browse** — a dedicated, searchable, paginated
   page listing every published item across all three content types
   (legislative, documents, projects). The `/transparency` section keeps a
   short preview with a "Browse all" link.
3. **Optional dates** for transparency documents and projects. Full calendar
   dates only (no year-only granularity). Blank renders **"Undated"**.
4. **Projects gain an optional date and file attachments**, making them
   first-class records that appear in the uploads browse.
5. **Multi-file documents & projects** — up to **3 files** each, **PDF or
   image**, **10 MB per file**, uploaded orphan-free (deferred to Save, the
   legislative "Option B" pattern).

Plus: fold in the six Minor findings from the Plan-4 final review while the
same files are open.

### Non-goals

- No document/project **detail page**. Multiple files surface via an inline
  expandable row (the existing legislative-table disclosure pattern), not a
  new route.
- No year-only / partial-date data model. Dates are either a full calendar
  date or null.
- No change to **legislative** documents' single-PDF model — an ordinance is
  one PDF by nature. Legislative stays on its own `file_path` column and stays
  PDF-only.
- No new test framework (project decision). Verification = `npm run typecheck`
  + `npm run lint` + runtime driving per `.claude/skills/verify/SKILL.md`.

## 2. Data model — migration `0011_transparency_enhancements.sql`

### 2.1 New table: `transparency_files` (Option A — one shared child table)

```sql
create table public.transparency_files (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('document', 'project')),
  owner_id uuid not null,
  path text not null,           -- storage object path in public-documents
  mime text not null,           -- 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp'
  size_bytes int not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index transparency_files_owner_idx
  on public.transparency_files (owner_type, owner_id, sort_order);
alter table public.transparency_files enable row level security;
```

- **RLS enabled, zero policies** — identical to every other table. All reads
  and writes go through the service-role client behind an explicit permission
  check in code.
- **Polymorphic, no DB foreign key.** `owner_id` is not FK-constrained because
  it points at two tables. Referential integrity is enforced in application
  code: deleting a document or project first deletes its `transparency_files`
  rows and their storage objects. This mirrors the existing pattern where
  `deleteTransparencyDocument` already removes the single file.
- **≤3 files** is enforced in the save action and the client, not by a DB
  constraint (a partial-unique or count trigger would be heavier than the
  invariant warrants for a 3-item cap).

### 2.2 `transparency_documents`

```sql
-- Backfill any existing single file into the new child table (no-op on the
-- current DB, where all seeded rows have file_path null, but correct if the
-- owner has attached real PDFs before this migration runs).
insert into public.transparency_files (owner_type, owner_id, path, mime, size_bytes, sort_order)
  select 'document', id, file_path, 'application/pdf', coalesce(file_size_bytes, 0), 0
  from public.transparency_documents
  where file_path is not null;

alter table public.transparency_documents alter column date_released drop not null;
alter table public.transparency_documents drop column file_path;
alter table public.transparency_documents drop column file_size_bytes;
```

- The `(status, date_released desc)` and `(category_id, status, date_released
  desc)` indexes are **unaffected** by dropping `NOT NULL` — a DESC index
  already sorts NULLS FIRST, which is exactly the "undated on top" ordering we
  want. No index recreation (the Plan-4 migration 0010 lesson: recreating for
  explicit `nulls first` is a no-op).

### 2.3 `transparency_projects`

```sql
alter table public.transparency_projects add column date date;  -- nullable
```

- Projects had no file column, so nothing to backfill; files attach via
  `transparency_files` with `owner_type = 'project'`.
- The existing `(status, sort_order)` index stays (drives the projects card
  order). The uploads browse orders projects by `date`; project counts are
  small, so no dedicated date index.

### 2.4 Storage

- Reuse the existing public **`public-documents`** bucket for both PDFs and
  images. No DB/bucket change — the bucket has no MIME restriction; type and
  size are validated in the upload action.
- Object paths: `documents/<uuid>.<ext>` and `projects/<uuid>.<ext>`.

## 3. Upload pipeline — orphan-free, multi-file

### 3.1 Constants (`src/lib/storage.ts`)

- `MAX_DOC_FILE_BYTES = 10 * 1024 * 1024` (10 MB, applies per file to PDF and
  image alike).
- `ALLOWED_DOC_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']`.
- `MAX_FILES_PER_RECORD = 3`.
- Keep the existing `MAX_PDF_BYTES` / `ALLOWED_PDF_TYPES` for the unchanged
  legislative path.
- **Delete** the dead `legislativePdfPath()` / `documentPdfPath()` helpers
  (Plan-4 review Minor #2).

### 3.2 Upload action (`src/features/admin/actions/documents.ts`)

Leave the existing single-PDF `uploadDocumentPdf(folder, formData)` **unchanged**
(it stays the legislative path: folder `'legislative'`, `MAX_PDF_BYTES`,
`ALLOWED_PDF_TYPES`). Add a **new** sibling helper for the multi-type path:

```ts
uploadTransparencyFile(
  folder: 'documents' | 'projects',   // runtime allowlist, distinct from legislative's PDF-only path
  formData: FormData,                 // one file under key 'file'
): Promise<{ path: string; sizeBytes: number; mime: string; error: null }
         | { path: null; sizeBytes: null; mime: null; error: string }>
```

- Re-validates MIME against `ALLOWED_DOC_FILE_TYPES` and size against
  `MAX_DOC_FILE_BYTES` **server-side** (the client MIME label is advisory; the
  bucket is public-read and the caller already holds `manage-transparency`, so
  this is the same accepted residual risk as Plan 4).
- Keep the segment-level `..` rejection and folder allowlist from Plan 4's
  `removeStoredDocument`.

### 3.3 Save actions carry a *set* of files

Both `saveTransparencyDocument` and `saveTransparencyProject` receive, via
`FormData`:

- `newFiles`: 0–3 `File` entries the user just picked (never uploaded yet).
- `keptFileIds`: ids of existing `transparency_files` rows to retain (edit
  only).

The client uploader is a **pure controlled picker with zero network calls**
(the legislative Option-B pattern), so an abandoned drawer never leaves an
object in storage. The combined count `keptFileIds.length + newFiles.length`
must be ≤ `MAX_FILES_PER_RECORD`; the action rejects otherwise.

**Save ordering & compensation (new record):**

1. Validate values (zod), verify category exists (documents).
2. Upload each `newFile` server-side. If any upload fails, delete the
   objects already uploaded *this call* and return the error.
3. Insert the parent row.
4. Insert the `transparency_files` rows (`owner_id` = new parent id,
   `sort_order` by pick order).
5. If step 3 or 4 fails, **compensate**: delete the parent row (if it was
   inserted) and delete every object uploaded this call. Log any
   compensating-delete failure with `console.error` (a storage-cleanup fault,
   not a user action — not in `audit_log`), exactly as Plan 4 does.
6. `recordActivity`, `revalidate`.

**Save ordering & compensation (edit):**

1. Read the existing file rows for this owner.
2. Upload `newFiles` (same per-file compensation as above).
3. Update the parent row (title/category/date).
4. Delete `transparency_files` rows **not** in `keptFileIds`; insert rows for
   the newly uploaded files.
5. On any failure past the upload step, delete objects uploaded this call.
6. **Deferred delete**: only after the DB no longer references a removed
   file's object, delete that object from storage.

No cross-writer optimistic lock on the file *set* (unlike legislative's single
`file_path` lock): the child-table model makes concurrent edits additive
rather than silently overwriting, and last-write-wins on the parent's scalar
fields matches the rest of the admin. Recorded as an accepted simplification.

### 3.4 Client uploader (`src/features/admin/components/`)

A new **`multi-file-uploader.tsx`** (client): shows up to 3 slots, accepts
PDF/PNG/JPEG/WebP, enforces the 3-file cap and 10 MB/file client-side (a second
gate; the server is authoritative), lets the user remove a pending or existing
file, and renders a thumbnail for images / a file chip for PDFs. Zero network
calls — chosen files and kept-file ids are submitted with the drawer form.
The existing single-`PdfUploader` (legislative) is untouched.

## 4. Optional dates

- `TransparencyDocumentValues.dateReleased: string | null`;
  `TransparencyProjectValues` gains `date: string | null`.
- Drop the `min(1)` date rule in both save schemas; the action stores an empty
  date input as SQL `NULL` (the `normalizeDate("")→null` helper, mirroring
  legislative's `normalizeDateApproved`).
- Display: a shared `formatOptionalDate(iso): string` = `iso ? formatDate(iso)
  : "Undated"`. Reuse everywhere a document/project date renders (on-page
  tables, uploads browse, admin tables).
- Null sorts first (undated on top) on both public and admin surfaces —
  explicit `nullsFirst: true` in queries, matching legislative.

## 5. Unified uploads browse — `/transparency/uploads`

### 5.1 Normalized item

A query assembles a `UploadBrowseItem` from the three sources:

```ts
interface UploadBrowseItem {
  key: string;                 // `${type}:${id}` — stable React key
  type: 'legislative' | 'document' | 'project';
  title: string;               // legislative: "Ordinance No. 05-2024 — <title>"; else the record title/name
  date: string | null;         // date_approved | date_released | project.date
  href: string | null;         // legislative → /transparency/legislative/<slug>; document/project → null (inline files)
  files: { url: string; label: string; mime: string }[];  // resolved public URLs; legislative = its one PDF if present
  progress: number | null;     // projects only
}
```

### 5.2 Page behavior

- Route: `src/app/(public)/transparency/uploads/page.tsx` (Server Component),
  built like the existing legislative archive.
- **Search** `?q=` on title, using the escaped-ilike helper
  (`ilikePattern` / `quoteFilterValue`) — the `%`, `_`, `*`, backslash and
  filter-grammar handling from Plan 4.
- **Type filter** `?type=all|legislative|document|project`.
- **Sort** `?sort=date|title|type` and `?dir=asc|desc` (server-side, whole
  dataset). Default `sort=date&dir=desc`. Clickable header links toggle `dir`.
- **Pagination** `?page=` — same page size and **clamped-to-[1, lastPage]**
  rule as the archive (fixing Plan-4 review Minor #4 there too).
- Because the three sources have different columns, the union is assembled and
  sorted in the query layer. Row counts are barangay-scale (tens to low
  hundreds), so fetching published rows from each table and merging in memory
  is acceptable and simplest; documented as such.

### 5.3 Row rendering

- **0 files** → "At the barangay hall" (the existing no-file affordance).
- **1 file** → a direct **Download** link.
- **>1 file** → a **"N files ▾"** disclosure toggle expanding to per-file
  download links (the legislative-table row-expand pattern).
- Legislative rows also show a **View** link to their detail page. Project
  rows show their progress.

### 5.4 `/transparency` preview section

`LatestUploadsSection` becomes a preview across **all three types** (latest 5
by date, newest first) rendered with the same row component, plus a **"Browse
all uploads"** link to `/transparency/uploads`. It no longer queries documents
alone.

## 6. Sortable tables

### 6.1 Shared client primitives (`src/components/ui/`)

- `useTableSort<T>(rows, { key, dir })` hook → returns `{ sorted, sortKey,
  sortDir, toggle(key) }`. Comparator handles string (locale) and number;
  null dates sort first regardless of direction (undated stays pinned on top,
  consistent with the query default).
- `<SortableTh>` — a header cell rendering a button with an ▲/▼/neutral
  indicator and correct `aria-sort`.

These keep the render functions client-side (RSC functions can't cross the
boundary), so each sortable table is a client component that owns its columns
and wires them to the hook. `DataTable` (server component) is left as the
static default for non-sortable tables.

### 6.2 Which tables & columns

- **Public legislative tables** (`legislative-table.tsx`, already client):
  sort by Number, Title, Date Approved. Keep the per-row summary expansion.
- **Public documents table** (currently server `DataTable`) → new client
  `DocumentsTable`: sort by Title, Category, Date.
- **Public projects** → sortable by Name, Date, Progress.
- **Uploads browse**: server-side sort (§5.2), not this client hook.
- **Admin manager tables** (already client): legislative (Number, Title, Date,
  Status), documents (Title, Category, Date, Status), projects (Name, Date,
  Progress, Status).

## 7. Folded-in Plan-4 review cleanups

1. `projects-card.tsx` `bg-green-500` → a design-system token (e.g. a
   "complete" brand/ink state) instead of the raw default green.
2. Delete dead `legislativePdfPath()` / `documentPdfPath()` in `storage.ts`
   (superseded by §3.1).
3. Delete orphaned `src/components/shared/document-link.tsx`.
4. Clamp the legislative archive `?page=` to `lastPage` (and apply the same
   clamp to the new uploads browse).

Redundant `requirePermission` round-trips (Minor #5) are left as-is —
correct, and de-duplicating them would tangle the upload helpers' own gates.

## 8. Error handling

- All new Server Actions call `requirePermission("manage-transparency")` (or
  `requireSuperAdmin()` where the existing sibling does) before any write.
- Status params validated with a zod enum at runtime (Server Actions are
  public HTTP endpoints).
- File type/size/count validated server-side; user-facing errors are generic
  ("Could not save the document. Try again."), storage-cleanup faults logged
  via `console.error`.
- Every mutating action `revalidatePath`s `/admin/transparency`,
  `/transparency`, and `/transparency/uploads`.

## 9. Types touched (`src/types/index.ts`)

- `TransparencyDocumentItem` / `AdminTransparencyDocumentRow`: `dateReleased:
  string | null`; single `fileUrl` → `files: {...}[]`.
- `TransparencyProjectItem` / `AdminTransparencyProjectRow`: add `date: string
  | null` and `files: {...}[]`.
- `TransparencyDocumentValues`: `dateReleased: string | null`, drop
  `filePath`/`fileSizeBytes` (files now travel as FormData, not values).
- `TransparencyProjectValues`: add `date: string | null`.
- New: `TransparencyFile`, `UploadBrowseItem`, `UploadBrowseType`.

## 10. Verification

Per task and at the end: `npm run typecheck`, `npm run lint`, and runtime
driving of the affected admin drawers and public pages (upload 1–3 mixed
PDF/image files, cancel-leaves-no-orphan, remove-a-file, blank date shows
"Undated", sort toggles, browse search + type filter + pagination + sort,
projects appear in the browse with files and progress). The repo owner applies
migration 0011 to Supabase when asked; the multi-file save path can only be
exercised end-to-end after it is applied.
