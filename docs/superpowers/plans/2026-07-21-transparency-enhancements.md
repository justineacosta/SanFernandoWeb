# Transparency Enhancements Implementation Plan (Plan 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the DB-backed transparency area sortable tables, a unified searchable "uploads" browse across all content types, optional dates, and multi-file (≤3 PDF/image, 10 MB each) documents & projects — uploaded orphan-free.

**Architecture:** One migration (`0011`) adds a shared polymorphic `transparency_files` child table, makes document/project dates nullable, and gives projects a date. Documents and projects carry up to three files each via that table; legislative keeps its single-PDF column unchanged. A new `/transparency/uploads` route unions the three published sources into one searchable/sortable/paginated list. On-page and admin tables gain client-side sortable headers; the browse sorts server-side. Files are chosen by a pure client picker and only uploaded server-side on Save, with compensating deletes on any failure — the Plan-4 "Option B" invariant extended to a *set* of files.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4, Supabase (Postgres + Storage), Zod.

**Spec:** `docs/superpowers/specs/2026-07-21-transparency-enhancements-design.md`.

## Global Constraints

Every task's requirements implicitly include these. Copy the relevant ones into each reviewer prompt.

- **RLS is enabled with ZERO policies.** The only auth gate is the service-role client behind an explicit `requirePermission("manage-transparency")` at the top of every write action. No write path may be reachable without it.
- **Server Actions are public HTTP endpoints.** Validate at runtime with Zod — status enums, folder params, file type/size/count. TypeScript unions erase at runtime.
- **RSC icon boundary:** icons travel as name strings resolved by `resolveIcon()` (`src/lib/icon-map.ts`). Never put a `LucideIcon` in serialized data or client props-from-server.
- **Design tokens only:** `brand-*` (amber), `ink-*`, `danger*`. `brand-50` and `brand-900` do NOT exist. No blue tokens.
- **Storage/DB invariant (by construction):** a storage object exists only if a DB row references it. The client uploader makes ZERO network calls; uploads happen server-side on Save; a failed row write compensating-deletes every object uploaded that call; a file removed on edit is deleted from storage only *after* the DB no longer references it.
- **Search escaping:** user search terms go through `ilikePattern()` + `quoteFilterValue()` (already in `src/features/transparency/queries.ts`) before reaching `.ilike()`/`.or()`.
- **Null dates sort first:** every date order uses `.order(col, { ascending: false, nullsFirst: true })`; a blank date input is stored as SQL `NULL` (never `""`).
- **File limits:** ≤ 3 files per document/project; 10 MB per file; MIME in `{application/pdf, image/png, image/jpeg, image/webp}`. Re-validated server-side.
- **Revalidation:** every mutating transparency action calls `revalidatePath` for `/admin/transparency`, `/transparency`, and `/transparency/uploads`.
- **No test framework** (project decision). Verification per task = `npm run typecheck` + `npm run lint` + runtime driving (`.claude/skills/verify/SKILL.md`).
- **Never `git add -A`.** Untracked `proposal/`, `stitch_tabbed_content_manager/`, and the root `.zip` must never be committed. Stage explicit paths only.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **The repo owner applies migrations manually** to Supabase when asked. See the CHECKPOINT after Task 4.

## File Structure

**Create:**
- `supabase/migrations/0011_transparency_enhancements.sql` — schema changes.
- `src/features/admin/components/multi-file-uploader.tsx` — pure client multi-file picker (≤3, PDF/image).
- `src/features/admin/components/transparency-project-form.tsx` — drawer form for a project (name, progress, optional date, files).
- `src/features/transparency/components/file-downloads.tsx` — server component rendering the 0/1/>1-file download affordance.
- `src/features/transparency/components/uploads-browse.tsx` — the browse list body (search, type filter, sort headers, pagination).
- `src/app/(public)/transparency/uploads/page.tsx` — the browse route.
- `src/components/ui/use-table-sort.ts` — client sort hook.
- `src/components/ui/sortable-th.tsx` — client sortable header cell.

**Modify:**
- `src/lib/storage.ts`, `src/lib/format.ts`, `src/types/index.ts`.
- `src/features/admin/actions/documents.ts` (add `uploadTransparencyFile`).
- `src/features/admin/actions/transparency-documents.ts`, `.../transparency-projects.ts`.
- `src/features/admin/queries/transparency.ts`.
- `src/features/transparency/queries.ts`, `src/features/transparency/index.ts`.
- `src/features/admin/components/transparency-document-form.tsx`, `.../transparency-manager.tsx`, `.../transparency-projects-panel.tsx`, `.../legislative-manager.tsx`.
- `src/features/transparency/components/legislative-table.tsx`, `.../disclosure-grid.tsx`, `.../latest-uploads-section.tsx`, `.../projects-card.tsx`.
- `src/app/(public)/transparency/legislative/page.tsx` (clamp page).
- `docs/BACKEND_HANDOFF.md`.

**Delete:** `src/components/shared/document-link.tsx` (orphaned); dead helpers `legislativePdfPath`/`documentPdfPath` in `storage.ts`.

---

## Task 1: Migration 0011 + library foundations

Additive and safe: nothing here breaks the running app (the migration file is created but not yet applied; the deleted helpers are already unused).

**Files:**
- Create: `supabase/migrations/0011_transparency_enhancements.sql`
- Modify: `src/lib/storage.ts`, `src/lib/format.ts`
- Modify: `src/types/index.ts` (additive types only)

**Interfaces produced (later tasks rely on these exact names):**
- `MAX_DOC_FILE_BYTES: number`, `ALLOWED_DOC_FILE_TYPES: readonly string[]`, `MAX_FILES_PER_RECORD = 3`, `extForDocType(mime: string): string` — in `storage.ts`.
- `formatOptionalDate(iso: string | null): string` — in `format.ts`.
- `TransparencyFile`, `UploadBrowseType`, `UploadBrowseItem` — in `types/index.ts`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0011_transparency_enhancements.sql`:

```sql
-- Plan 5: multi-file documents & projects, optional dates, project dates.
--
-- RLS: transparency_files is enabled with NO policies, like every other table.
-- All reads/writes go through the service-role client after an explicit
-- permission check in code.

-- ── Shared file child table (Option A) ──────────────────────────────────────
-- Polymorphic: one row per attached file for either a document or a project.
-- No FK on owner_id (it points at two tables); referential integrity is
-- enforced in the delete actions, which remove a record's files (rows +
-- storage objects) before/with the record. The ≤3 cap is enforced in the
-- save actions, not by a DB constraint.
create table public.transparency_files (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('document', 'project')),
  owner_id uuid not null,
  path text not null,
  mime text not null,
  size_bytes int not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index transparency_files_owner_idx
  on public.transparency_files (owner_type, owner_id, sort_order);
alter table public.transparency_files enable row level security;

-- ── transparency_documents: optional date, files move to the child table ────
-- Backfill any existing single file into the child table (no-op on the current
-- DB, where all seeded rows have file_path null; correct if a real PDF was
-- attached before this migration runs).
insert into public.transparency_files (owner_type, owner_id, path, mime, size_bytes, sort_order)
  select 'document', id, file_path, 'application/pdf', coalesce(file_size_bytes, 0), 0
  from public.transparency_documents
  where file_path is not null;

alter table public.transparency_documents alter column date_released drop not null;
alter table public.transparency_documents drop column file_path;
alter table public.transparency_documents drop column file_size_bytes;

-- The (status, date_released desc) and (category_id, status, date_released desc)
-- indexes are unaffected by dropping NOT NULL: a DESC index already orders
-- NULLS FIRST, which is exactly the "undated on top" ordering the app wants.

-- ── transparency_projects: add an optional date ─────────────────────────────
alter table public.transparency_projects add column date date;
```

- [ ] **Step 2: Add storage constants and helper, delete dead helpers**

In `src/lib/storage.ts`, after the `MAX_PDF_BYTES` block (line 33), add:

```ts
// Documents & projects accept PDF *or* image, up to 3 files, 10 MB each (Plan 5).
export const ALLOWED_DOC_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export const MAX_DOC_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_FILES_PER_RECORD = 3;

/** File extension for an allowed document MIME type. */
export function extForDocType(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg"; // image/jpeg
}
```

Then DELETE the now-dead `legislativePdfPath` (lines 45-48) and `documentPdfPath` (lines 50-53) — the Plan-4 final review flagged them as unused, and Task 2 writes its own path inline.

- [ ] **Step 3: Verify the dead helpers are truly unused before deleting**

Run: `git grep -n "legislativePdfPath\|documentPdfPath" -- src`
Expected: no matches after the edit (only the deleted definitions would have shown). If any consumer appears, stop and reconcile — do not delete a used export.

- [ ] **Step 4: Add `formatOptionalDate`**

In `src/lib/format.ts`, after `formatDateApproved` (line 15), add:

```ts
/** Format an optional release/effectivity date, showing "Undated" when unset. */
export function formatOptionalDate(iso: string | null): string {
  return iso ? formatDate(iso) : "Undated";
}
```

- [ ] **Step 5: Add the additive types**

In `src/types/index.ts`, in the Transparency block (after `TransparencyProjectItem`, ~line 287), add:

```ts
/** A file attached to a document or project (public, resolved for download). */
export interface TransparencyFile {
  id: string;
  url: string;
  /** Display label, e.g. the original-ish "Document 1" or a page label. */
  label: string;
  mime: string;
  sizeBytes: number;
}

export type UploadBrowseType = "legislative" | "document" | "project";

/** One row in the unified /transparency/uploads browse. */
export interface UploadBrowseItem {
  key: string; // `${type}:${id}`
  type: UploadBrowseType;
  title: string;
  date: string | null;
  /** Detail link for legislative; null for document/project (files render inline). */
  href: string | null;
  files: TransparencyFile[];
  /** Projects only, else null. */
  progress: number | null;
}
```

- [ ] **Step 6: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass. (No consumer references the new symbols yet; the deleted helpers were unused.)

```bash
git add supabase/migrations/0011_transparency_enhancements.sql src/lib/storage.ts src/lib/format.ts src/types/index.ts
git commit -m "feat(transparency): migration 0011, file constants, optional-date helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Do NOT ask the owner to apply the migration yet — later tasks still read the old columns. The apply CHECKPOINT is after Task 4.

---

## Task 2: Multi-file upload action + client picker

Both additive (a new action alongside the unchanged `uploadDocumentPdf`, and a new component nothing imports yet). Green build; no DB needed to typecheck.

**Files:**
- Modify: `src/features/admin/actions/documents.ts`
- Create: `src/features/admin/components/multi-file-uploader.tsx`

**Interfaces produced:**
- `uploadTransparencyFile(folder: "documents" | "projects", formData: FormData): Promise<{ path: string; sizeBytes: number; mime: string; error: null } | { path: null; sizeBytes: null; mime: null; error: string }>`
- `MultiFileUploader` — props below.
- `PendingFile` type — `{ file: File }`; and the existing-file display shape `{ id: string; url: string; label: string; sizeBytes: number }`.

- [ ] **Step 1: Add `uploadTransparencyFile`**

In `src/features/admin/actions/documents.ts`, import the new constants and add the action (leave `uploadDocumentPdf` and `removeStoredDocument` unchanged — `removeStoredDocument`'s folder regex already allows `documents/`; add `projects/` to it):

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

export interface UploadFileResult {
  error: string | null;
  path: string | null;
  sizeBytes: number | null;
  mime: string | null;
}

/**
 * Upload one PDF-or-image for a transparency document or project. The caller
 * persists the returned path/mime/size; on any later failure the caller must
 * delete the object (compensating delete), keeping the storage/DB invariant.
 */
export async function uploadTransparencyFile(
  folder: "documents" | "projects",
  formData: FormData,
): Promise<UploadFileResult> {
  await requirePermission("manage-transparency");
  if (!["documents", "projects"].includes(folder)) {
    return { error: "Upload failed. Try again.", path: null, sizeBytes: null, mime: null };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file.", path: null, sizeBytes: null, mime: null };
  }
  if (!ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number])) {
    return { error: "Files must be a PDF or image.", path: null, sizeBytes: null, mime: null };
  }
  if (file.size > MAX_DOC_FILE_BYTES) {
    return { error: "Each file must be 10 MB or smaller.", path: null, sizeBytes: null, mime: null };
  }
  const path = `${folder}/${crypto.randomUUID()}.${extForDocType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(PUBLIC_DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", path: null, sizeBytes: null, mime: null };
  return { error: null, path, sizeBytes: file.size, mime: file.type };
}
```

Also widen `removeStoredDocument`'s folder guard (line 70) so project files can be removed:

```ts
  if (!/^(legislative|documents|projects)\//.test(path)) {
    return { error: "That file cannot be removed." };
  }
```

- [ ] **Step 2: Build the multi-file picker**

Create `src/features/admin/components/multi-file-uploader.tsx`. Pure client, zero network calls; enforces the 3-file cap and per-file 10 MB/type client-side (the server re-validates):

```tsx
"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Trash2, Upload } from "lucide-react";
import { ALLOWED_DOC_FILE_TYPES, MAX_DOC_FILE_BYTES, MAX_FILES_PER_RECORD, formatFileSize } from "@/lib/storage";

/** An already-stored file the record currently has. */
export interface ExistingFile {
  id: string;
  url: string;
  label: string;
  mime: string;
  sizeBytes: number;
}

interface MultiFileUploaderProps {
  /** Files already on the record (edit mode). */
  existing: ExistingFile[];
  /** Ids of existing files the user has chosen to keep. */
  keptIds: string[];
  onKeptIdsChange: (ids: string[]) => void;
  /** Newly chosen files, not yet uploaded. */
  newFiles: File[];
  onNewFilesChange: (files: File[]) => void;
}

/**
 * Pure file picker for up to MAX_FILES_PER_RECORD PDF/image files. No network
 * calls: chosen files and kept-file ids live in the parent form and only turn
 * into uploads/deletes on Save (see transparency-document-form / -project-form
 * and their save actions). This keeps "an object exists only if a row
 * references it" true by construction.
 */
export function MultiFileUploader({
  existing,
  keptIds,
  onKeptIdsChange,
  newFiles,
  onNewFilesChange,
}: MultiFileUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const keptExisting = existing.filter((f) => keptIds.includes(f.id));
  const total = keptExisting.length + newFiles.length;

  function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const chosen: File[] = [];
    for (const file of Array.from(list)) {
      if (!ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number])) {
        setError("Files must be a PDF or image.");
        return;
      }
      if (file.size > MAX_DOC_FILE_BYTES) {
        setError("Each file must be 10 MB or smaller.");
        return;
      }
      chosen.push(file);
    }
    if (total + chosen.length > MAX_FILES_PER_RECORD) {
      setError(`Up to ${MAX_FILES_PER_RECORD} files.`);
      return;
    }
    onNewFilesChange([...newFiles, ...chosen]);
  }

  const iconFor = (mime: string) => (mime === "application/pdf" ? FileText : ImageIcon);

  return (
    <div className="space-y-3">
      {keptExisting.map((f) => {
        const Icon = iconFor(f.mime);
        return (
          <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4">
            <Icon className="h-6 w-6 shrink-0 text-ink-900" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-ink-900 hover:underline">
                {f.label}
              </a>
              <span className="text-sm text-ink-500">{formatFileSize(f.sizeBytes)}</span>
            </span>
            <button
              type="button"
              onClick={() => onKeptIdsChange(keptIds.filter((id) => id !== f.id))}
              aria-label={`Remove ${f.label}`}
              className="rounded p-2 text-danger hover:bg-ink-100"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}

      {newFiles.map((file, index) => {
        const Icon = iconFor(file.type);
        return (
          <div key={`new-${index}`} className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4">
            <Icon className="h-6 w-6 shrink-0 text-ink-900" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink-900">{file.name}</span>
              <span className="text-sm text-ink-500">{formatFileSize(file.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => onNewFilesChange(newFiles.filter((_, i) => i !== index))}
              aria-label={`Remove ${file.name}`}
              className="rounded p-2 text-danger hover:bg-ink-100"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}

      {total < MAX_FILES_PER_RECORD ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 hover:border-brand-400"
        >
          <Upload className="h-6 w-6" aria-hidden="true" />
          <span>Drag files here or click to choose (PDF or image, ≤ 10 MB each, up to {MAX_FILES_PER_RECORD}).</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
          />
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint` → both pass.

```bash
git add src/features/admin/actions/documents.ts src/features/admin/components/multi-file-uploader.tsx
git commit -m "feat(admin): multi-file upload action and picker (PDF/image, ≤3, 10MB)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Documents — multi-file + optional date (data layer + form + admin table)

The whole document path in one green-build unit: types, public + admin queries, save action, the shared file-download component, the drawer form, and the admin table cell. Runtime-verified after the migration CHECKPOINT (Task 4) is applied — so this task's runtime driving may be deferred until then; typecheck/lint must pass now.

**Files:**
- Modify: `src/types/index.ts`, `src/features/transparency/queries.ts`, `src/features/admin/queries/transparency.ts`, `src/features/admin/actions/transparency-documents.ts`, `src/features/admin/components/transparency-document-form.tsx`, `src/features/admin/components/transparency-manager.tsx`, `src/features/transparency/components/disclosure-grid.tsx`, `src/features/transparency/components/latest-uploads-section.tsx`, `src/features/transparency/index.ts`
- Create: `src/features/transparency/components/file-downloads.tsx`

**Interfaces consumed:** `uploadTransparencyFile`, `MultiFileUploader`/`ExistingFile` (Task 2); `TransparencyFile`, `formatOptionalDate`, doc-file constants (Task 1).

**Interfaces produced:**
- `TransparencyDocumentItem` gains `files: TransparencyFile[]`, `dateReleased: string | null`; drops `fileUrl`, `fileSizeBytes`.
- `AdminTransparencyDocumentRow`: `dateReleased: string | null`, `hasFile` → `fileCount: number`.
- `TransparencyDocumentValues`: `dateReleased: string | null`; drops `filePath`, `fileSizeBytes`.
- `getTransparencyDocumentForEdit` returns `{ values, status, files: ExistingFile[] }`.
- `saveTransparencyDocument(id, values, formData)` — formData carries `newFile` (repeated) + `keptFileId` (repeated).
- `<FileDownloads files={TransparencyFile[]} recordTitle={string} />`.

- [ ] **Step 1: Update the document types**

In `src/types/index.ts`:

```ts
export interface TransparencyDocumentItem {
  id: string;
  title: string;
  categoryLabel: string;
  categoryIconName: string;
  dateReleased: string | null;
  files: TransparencyFile[];
}
```
```ts
export interface AdminTransparencyDocumentRow {
  id: string;
  title: string;
  categoryId: string;
  categoryLabel: string;
  dateReleased: string | null;
  status: ContentStatus;
  fileCount: number;
}
```
```ts
export interface TransparencyDocumentValues {
  title: string;
  categoryId: string;
  dateReleased: string | null;
}
```

- [ ] **Step 2: Create the shared file-download affordance**

Create `src/features/transparency/components/file-downloads.tsx` (server component; the >1 case uses a native `<details>` so it needs no client JS):

```tsx
import type { TransparencyFile } from "@/types";

interface FileDownloadsProps {
  files: TransparencyFile[];
  /** For screen-reader context on the links. */
  recordTitle: string;
  align?: "left" | "right";
}

/** 0 files → barangay-hall note; 1 → a Download link; >1 → an expandable list. */
export function FileDownloads({ files, recordTitle, align = "left" }: FileDownloadsProps) {
  if (files.length === 0) {
    return <span className="text-sm text-ink-500">At the barangay hall</span>;
  }
  if (files.length === 1) {
    const file = files[0];
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="font-semibold uppercase text-ink-900 hover:underline">
        Download<span className="sr-only"> {recordTitle}</span>
      </a>
    );
  }
  return (
    <details className={align === "right" ? "text-right" : ""}>
      <summary className="cursor-pointer font-semibold uppercase text-ink-900 hover:underline">
        {files.length} files
      </summary>
      <ul className="mt-2 space-y-1">
        {files.map((file, index) => (
          <li key={file.id}>
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm text-ink-700 hover:underline">
              {file.label || `File ${index + 1}`}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

Export it from `src/features/transparency/index.ts` (add to the barrel in page order).

- [ ] **Step 3: Update public document queries to load files + optional date**

In `src/features/transparency/queries.ts`, replace the document section. Fetch files in a second query keyed by owner_id (PostgREST has no polymorphic join). Add a helper that resolves a `transparency_files` row to a `TransparencyFile`:

```ts
import type { TransparencyFile } from "@/types";

interface FileRow { id: string; owner_id: string; path: string; mime: string; size_bytes: number; sort_order: number; }

function toFile(row: FileRow, index: number): TransparencyFile {
  return {
    id: row.id,
    url: documentUrl(row.path),
    label: row.mime === "application/pdf" ? `Document ${index + 1}` : `Image ${index + 1}`,
    mime: row.mime,
    sizeBytes: row.size_bytes,
  };
}

/** Map owner_id → resolved files, for a set of document/project ids. */
async function filesByOwner(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  ownerType: "document" | "project",
  ownerIds: string[],
): Promise<Map<string, TransparencyFile[]>> {
  const map = new Map<string, TransparencyFile[]>();
  if (ownerIds.length === 0) return map;
  const { data } = await admin
    .from("transparency_files")
    .select("id, owner_id, path, mime, size_bytes, sort_order")
    .eq("owner_type", ownerType)
    .in("owner_id", ownerIds)
    .order("sort_order", { ascending: true });
  for (const row of (data ?? []) as FileRow[]) {
    const list = map.get(row.owner_id) ?? [];
    list.push(toFile(row, list.length));
    map.set(row.owner_id, list);
  }
  return map;
}
```

Rewrite `DocumentRow`, `toDocumentItem`, `DOCUMENT_COLUMNS`, `listPublishedDocumentsByCategory`, and `listLatestPublishedDocuments` to drop `file_path`/`file_size_bytes`, add files via `filesByOwner`, use `nullsFirst: true`, and set `dateReleased` nullable:

```ts
interface DocumentRow {
  id: string;
  title: string;
  date_released: string | null;
  transparency_categories: { label: string; icon_name: string } | null;
}

const DOCUMENT_COLUMNS =
  "id, title, date_released, transparency_categories(label, icon_name)";

function toDocumentItem(row: DocumentRow, files: TransparencyFile[]): TransparencyDocumentItem {
  return {
    id: row.id,
    title: row.title,
    categoryLabel: row.transparency_categories?.label ?? "Document",
    categoryIconName: row.transparency_categories?.icon_name ?? "file-text",
    dateReleased: row.date_released,
    files,
  };
}

export async function listPublishedDocumentsByCategory(
  categoryId: string,
  limit = 6,
): Promise<TransparencyDocumentItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("status", "published")
    .eq("category_id", categoryId)
    .order("date_released", { ascending: false, nullsFirst: true })
    .limit(limit);
  if (error || !data) return [];
  const rows = data as unknown as DocumentRow[];
  const files = await filesByOwner(admin, "document", rows.map((r) => r.id));
  return rows.map((r) => toDocumentItem(r, files.get(r.id) ?? []));
}

export async function listLatestPublishedDocuments(
  limit = 4,
): Promise<TransparencyDocumentItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("status", "published")
    .order("date_released", { ascending: false, nullsFirst: true })
    .limit(limit);
  if (error || !data) return [];
  const rows = data as unknown as DocumentRow[];
  const files = await filesByOwner(admin, "document", rows.map((r) => r.id));
  return rows.map((r) => toDocumentItem(r, files.get(r.id) ?? []));
}
```

Keep `filesByOwner` exported (Task 6's browse query reuses it) — add `export` to it.

- [ ] **Step 4: Update admin document queries**

In `src/features/admin/queries/transparency.ts`, rewrite `listAdminTransparencyDocuments` and `getTransparencyDocumentForEdit`. Fetch file counts (admin list) and full files (edit):

```ts
export async function listAdminTransparencyDocuments(): Promise<AdminTransparencyDocumentRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select("id, title, category_id, date_released, status, transparency_categories(label)")
    .order("date_released", { ascending: false, nullsFirst: true });
  if (error || !data) return [];
  const rows = data as unknown as {
    id: string; title: string; category_id: string; date_released: string | null;
    status: ContentStatus; transparency_categories: { label: string } | null;
  }[];
  const counts = new Map<string, number>();
  if (rows.length > 0) {
    // Guard the empty case: `.in("owner_id", [])` on a uuid column can error.
    const { data: fileRows } = await admin
      .from("transparency_files")
      .select("owner_id")
      .eq("owner_type", "document")
      .in("owner_id", rows.map((r) => r.id));
    for (const fr of (fileRows ?? []) as { owner_id: string }[]) {
      counts.set(fr.owner_id, (counts.get(fr.owner_id) ?? 0) + 1);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    categoryLabel: row.transparency_categories?.label ?? "Document",
    dateReleased: row.date_released,
    status: row.status,
    fileCount: counts.get(row.id) ?? 0,
  }));
}
```

`getTransparencyDocumentForEdit` returns `ExistingFile[]` (import `ExistingFile` type from the uploader is a client component — instead define the returned file shape structurally; the form maps it). Return `{ values: TransparencyDocumentValues; status: ContentStatus; files: { id: string; url: string; label: string; mime: string; sizeBytes: number }[] }`:

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

- [ ] **Step 5: Rewrite `saveTransparencyDocument` for a set of files + optional date**

In `src/features/admin/actions/transparency-documents.ts`: change the Zod schema's `dateReleased` to optional; add a `normalizeDate` helper; accept `newFile`/`keptFileId` from `formData`; upload all new files with per-file compensation; sync `transparency_files` rows; deferred-delete removed files' objects. Signature stays `(id, values, formData)`.

```ts
import { uploadTransparencyFile, removeStoredDocument } from "./documents";
import { MAX_FILES_PER_RECORD } from "@/lib/storage";

const schema = z.object({
  title: z.string().trim().min(3, "Enter a title."),
  categoryId: z.string().trim().min(1, "Pick a category."),
  dateReleased: z.string().trim().nullable(),
});

/** "" (empty date input) → SQL NULL; a real date passes through. */
function normalizeDate(value: string | null): string | null {
  return value && value.length > 0 ? value : null;
}
```

Replace the body from the file-handling block onward with the multi-file flow:

```ts
export async function saveTransparencyDocument(
  id: string | null,
  values: TransparencyDocumentValues,
  formData: FormData,
): Promise<SaveResult> {
  const actor = await requirePermission("manage-transparency");
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();
  const { data: cat, error: catErr } = await admin
    .from("transparency_categories").select("id").eq("id", parsed.data.categoryId).maybeSingle();
  if (catErr) return { error: "Could not save the document. Try again.", id: null };
  if (!cat) return { error: "Pick a valid category.", id: null };

  const newFiles = formData.getAll("newFile").filter((f): f is File => f instanceof File && f.size > 0);
  const keptIds = formData.getAll("keptFileId").map(String);

  // Upload every new file first; track them so any later failure deletes them.
  const uploaded: { path: string; mime: string; sizeBytes: number }[] = [];
  async function cleanupUploads() {
    for (const u of uploaded) {
      const removed = await removeStoredDocument(u.path);
      if (removed.error) console.error(`Orphaned storage object (compensating delete failed): ${u.path}`);
    }
  }
  for (const file of newFiles) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadTransparencyFile("documents", fd);
    if (res.error) { await cleanupUploads(); return { error: res.error, id: null }; }
    uploaded.push({ path: res.path, mime: res.mime, sizeBytes: res.sizeBytes });
  }

  // Enforce the ≤3 cap BEFORE any parent write, so an over-limit direct API
  // call can't leave an empty draft row behind. keptIds is client-supplied.
  if (keptIds.length + uploaded.length > MAX_FILES_PER_RECORD) {
    await cleanupUploads();
    return { error: `Up to ${MAX_FILES_PER_RECORD} files.`, id: null };
  }

  const dateReleased = normalizeDate(parsed.data.dateReleased);

  // Resolve the parent row id (insert if new).
  let docId = id;
  if (docId) {
    const { error } = await admin.from("transparency_documents")
      .update({ title: parsed.data.title, category_id: parsed.data.categoryId, date_released: dateReleased })
      .eq("id", docId);
    if (error) { await cleanupUploads(); return { error: "Could not save the document.", id: null }; }
  } else {
    const { data, error } = await admin.from("transparency_documents")
      .insert({ title: parsed.data.title, category_id: parsed.data.categoryId, date_released: dateReleased })
      .select("id").single();
    if (error || !data) { await cleanupUploads(); return { error: "Could not create the document.", id: null }; }
    docId = data.id as string;
  }

  // Existing files: delete the ones the user dropped (rows + objects), keep the rest.
  const { data: existingFiles } = await admin.from("transparency_files")
    .select("id, path, sort_order").eq("owner_type", "document").eq("owner_id", docId)
    .order("sort_order", { ascending: true });
  const removedRows = ((existingFiles ?? []) as { id: string; path: string }[]).filter((f) => !keptIds.includes(f.id));
  if (removedRows.length > 0) {
    await admin.from("transparency_files").delete().in("id", removedRows.map((r) => r.id));
    for (const r of removedRows) await removeStoredDocument(r.path); // deferred: row already gone
  }

  // Insert the newly uploaded files after the kept ones.
  const keptCount = ((existingFiles ?? []) as { id: string }[]).filter((f) => keptIds.includes(f.id)).length;
  if (uploaded.length > 0) {
    const insert = uploaded.map((u, i) => ({
      owner_type: "document", owner_id: docId, path: u.path, mime: u.mime,
      size_bytes: u.sizeBytes, sort_order: keptCount + i,
    }));
    const { error } = await admin.from("transparency_files").insert(insert);
    if (error) { await cleanupUploads(); return { error: "Could not save the document's files.", id: null }; }
  }

  await recordActivity(actor, id ? "updated document" : "created document", "transparency document", docId, parsed.data.title);
  revalidate();
  return { error: null, id: docId };
}
```

Add `revalidatePath("/transparency/uploads")` inside the existing `revalidate()` helper. Also add it to `setTransparencyDocumentStatus` and `deleteTransparencyDocument` paths (they call `revalidate()`, so one edit covers all). In `deleteTransparencyDocument`, replace the single-file cleanup with: fetch this document's `transparency_files`, delete those rows, and `removeStoredDocument` each path.

- [ ] **Step 6: Wire the document drawer form to the new picker + optional date**

In `src/features/admin/components/transparency-document-form.tsx`: swap `PdfUploader` for `MultiFileUploader`; the date input drops `required`; the record carries `files: ExistingFile[]`; submit builds FormData with repeated `newFile` and `keptFileId`.

Key changes:
- `TransparencyDocumentEditRecord` → `{ id; values: TransparencyDocumentValues; status: ContentStatus; files: ExistingFile[] }`.
- State: `const [newFiles, setNewFiles] = useState<File[]>([])`; `const [keptIds, setKeptIds] = useState<string[]>(record?.files.map((f) => f.id) ?? [])`.
- `EMPTY_VALUES` → `{ title: "", categoryId: "", dateReleased: null }`.
- Date `<Input type="date" value={values.dateReleased ?? ""} onChange={(e) => set("dateReleased", e.target.value || null)} />` (no `required`); label "Date Released (optional)".
- Replace the PDF block with:
  ```tsx
  <MultiFileUploader
    existing={record?.files ?? []}
    keptIds={keptIds}
    onKeptIdsChange={setKeptIds}
    newFiles={newFiles}
    onNewFilesChange={setNewFiles}
  />
  ```
- `handleSave`:
  ```ts
  const fd = new FormData();
  for (const f of newFiles) fd.append("newFile", f);
  for (const id2 of keptIds) fd.append("keptFileId", id2);
  const result = await saveTransparencyDocument(id, values, fd);
  ```

Update the manager (`transparency-manager.tsx`) `openEditDocument` to pass `files: detail.files` into the edit record, and the admin document table cell (line 255) from `record.hasFile ? "PDF" : "—"` to `record.fileCount > 0 ? \`${record.fileCount} file${record.fileCount === 1 ? "" : "s"}\` : "—"`, and the date cell (line 251) to `formatOptionalDate(record.dateReleased)`.

- [ ] **Step 7: Update public document consumers to compile with `files[]`**

- `disclosure-grid.tsx`: wherever a document's download link used `doc.fileUrl`, render `<FileDownloads files={doc.files} recordTitle={doc.title} />` instead, and any date uses `formatOptionalDate(doc.dateReleased)`.
- `latest-uploads-section.tsx`: minimal change to compile — swap the "Action" column cell to `<FileDownloads files={doc.files} recordTitle={doc.title} align="right" />` and the date cell to `formatOptionalDate(doc.dateReleased)`. (Task 6 replaces this section with the multi-type preview; this keeps the build green until then.)

- [ ] **Step 8: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint` → both pass.

```bash
git add src/types/index.ts src/features/transparency/queries.ts src/features/transparency/index.ts src/features/transparency/components/file-downloads.tsx src/features/transparency/components/disclosure-grid.tsx src/features/transparency/components/latest-uploads-section.tsx src/features/admin/queries/transparency.ts src/features/admin/actions/transparency-documents.ts src/features/admin/components/transparency-document-form.tsx src/features/admin/components/transparency-manager.tsx
git commit -m "feat(transparency): multi-file documents with optional release date

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Projects — optional date + files (data layer + drawer form + card token fix)

Projects gain a date and files. The inline name/progress editor can't hold a file uploader, so create a drawer form (mirroring documents) and simplify the panel to a list that opens it. Also fix the Plan-4 `bg-green-500` Minor here.

**Files:**
- Modify: `src/types/index.ts`, `src/features/transparency/queries.ts`, `src/features/admin/queries/transparency.ts`, `src/features/admin/actions/transparency-projects.ts`, `src/features/admin/components/transparency-projects-panel.tsx`, `src/features/transparency/components/projects-card.tsx`
- Create: `src/features/admin/components/transparency-project-form.tsx`

**Interfaces produced:**
- `TransparencyProjectItem` gains `date: string | null`, `files: TransparencyFile[]`.
- `AdminTransparencyProjectRow` gains `date: string | null`, `fileCount: number`.
- `TransparencyProjectValues` → `{ name; progress; date: string | null }`.
- `saveTransparencyProject(id, values, formData)` — formData carries `newFile`/`keptFileId`.
- `getTransparencyProjectForEdit(id)` and `getTransparencyProjectForEditAction(id)` returning `{ values, status, files }`.

- [ ] **Step 1: Types**

```ts
export interface TransparencyProjectItem {
  id: string;
  name: string;
  progress: number;
  date: string | null;
  files: TransparencyFile[];
}
export interface AdminTransparencyProjectRow {
  id: string;
  name: string;
  progress: number;
  sortOrder: number;
  status: ContentStatus;
  date: string | null;
  fileCount: number;
}
export interface TransparencyProjectValues {
  name: string;
  progress: number;
  date: string | null;
}
```

- [ ] **Step 2: Public + admin project queries**

- `listPublishedProjects` (in `queries.ts`): select `id, name, progress, date`, order `sort_order` asc, attach files via `filesByOwner(admin, "project", ids)`, map to include `date` and `files`.
- `listAdminTransparencyProjects` (in `admin/queries/transparency.ts`): select `id, name, progress, sort_order, status, date`; attach `fileCount` via a `transparency_files` count query keyed by `owner_type = "project"` (same pattern as documents in Task 3 Step 4).
- Add `getTransparencyProjectForEdit(id)` returning `{ values: { name, progress, date }, status, files: {...}[] }` (mirror `getTransparencyDocumentForEdit`, `owner_type = "project"`).

- [ ] **Step 3: `saveTransparencyProject` with date + files**

Change the signature to `(id, values, formData)`; add `date` to the Zod schema as `z.string().trim().nullable()` and `normalizeDate`; reuse the exact multi-file upload/compensation/sync logic from Task 3 Step 5 with `owner_type = "project"` and `uploadTransparencyFile("projects", …)`. Preserve the existing `sort_order`-on-create logic. Add `revalidatePath("/transparency/uploads")` to `revalidate()`. In `deleteTransparencyProject`, fetch and delete the project's `transparency_files` rows + objects before/with the row delete. Add a client-callable `getTransparencyProjectForEditAction(id)` (gated by `requirePermission`).

- [ ] **Step 4: Project drawer form**

Create `src/features/admin/components/transparency-project-form.tsx`, mirroring `transparency-document-form.tsx`: fields Name, Progress (number 0–100), Date (optional), and `MultiFileUploader`; status transitions (draft→in-review→published→archived) via `setTransparencyProjectStatus`; delete via `deleteTransparencyProject`; submit builds FormData with `newFile`/`keptFileId` and calls `saveTransparencyProject(id, values, fd)`. Export `TransparencyProjectEditRecord = { id; values: TransparencyProjectValues; status: ContentStatus; files: ExistingFile[] }`.

- [ ] **Step 5: Refactor the projects panel to open the drawer**

In `transparency-projects-panel.tsx`: keep the list, reorder (`move`), status, and delete controls; replace the inline name/progress edit + create with a `Drawer` + `TransparencyProjectForm` (mirror the documents tab in `transparency-manager.tsx`: `openCreate`/`openEdit` load via `getTransparencyProjectForEditAction`). Show the date (`formatOptionalDate(project.date)`) and `fileCount` in each list row. Remove the now-unused `editName`/`editProgress`/`newName`/`newProgress` state.

- [ ] **Step 6: Fix the `bg-green-500` token (Plan-4 review Minor #1)**

In `projects-card.tsx` line 28, replace `project.progress === 100 ? "bg-green-500" : "bg-brand-500"` with a sanctioned token. Use `"bg-brand-600"` for complete vs `"bg-brand-300"` for in-progress (both real amber tokens), or `"bg-ink-900"` vs `"bg-brand-500"`. Pick one and confirm it renders (amber tokens exist in `globals.css`).

- [ ] **Step 7: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint` → both pass.

```bash
git add src/types/index.ts src/features/transparency/queries.ts src/features/transparency/components/projects-card.tsx src/features/admin/queries/transparency.ts src/features/admin/actions/transparency-projects.ts src/features/admin/components/transparency-projects-panel.tsx src/features/admin/components/transparency-project-form.tsx
git commit -m "feat(transparency): projects gain optional date and file attachments

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## CHECKPOINT: apply migration 0011

After Task 4 is committed and reviewed, the controller asks the repo owner to apply `supabase/migrations/0011_transparency_enhancements.sql` to Supabase. Only after it is applied can Tasks 3–4 (and everything after) be runtime-verified: blank date → NULL/"Undated", uploading 1–3 mixed PDF/image files, cancel-leaves-no-orphan, remove-a-file, projects with files. Run those runtime checks now against the applied schema before proceeding to Task 5.

---

## Task 5: Unified uploads browse — `/transparency/uploads`

**Files:**
- Modify: `src/features/transparency/queries.ts`, `src/features/transparency/index.ts`, `src/features/transparency/components/latest-uploads-section.tsx`
- Create: `src/features/transparency/components/uploads-browse.tsx`, `src/app/(public)/transparency/uploads/page.tsx`

**Interfaces produced:**
- `UPLOADS_PAGE_SIZE = 10`.
- `searchUploads({ q, type, sort, dir, page }): Promise<{ items: UploadBrowseItem[]; total: number; pageSize: number }>`.
- `listLatestUploads(limit = 5): Promise<UploadBrowseItem[]>`.

- [ ] **Step 1: Browse + preview queries**

In `src/features/transparency/queries.ts` add a builder that fetches published legislative, documents, and projects, normalizes each to `UploadBrowseItem` (reusing `filesByOwner` for documents/projects; legislative's single `file_path` → a one-element `files` array when present), unions them, filters by `q` (case-insensitive `includes` on `title` — small dataset, in-memory) and `type`, sorts by `sort`/`dir` (dates: null first when descending, null last when ascending — keep undated pinned to the top only on the default `date`/`desc`; for `title`/`type` use locale compare), then paginates:

```ts
export const UPLOADS_PAGE_SIZE = 10;

async function allUploadItems(): Promise<UploadBrowseItem[]> {
  const admin = createSupabaseAdminClient();
  const [leg, docs, projs] = await Promise.all([
    admin.from("legislative_documents").select("id, slug, doc_type, number, title, date_approved, file_path, file_size_bytes").eq("status", "published"),
    admin.from("transparency_documents").select("id, title, date_released").eq("status", "published"),
    admin.from("transparency_projects").select("id, name, progress, date").eq("status", "published"),
  ]);
  const docFiles = await filesByOwner(admin, "document", (docs.data ?? []).map((d) => d.id as string));
  const projFiles = await filesByOwner(admin, "project", (projs.data ?? []).map((p) => p.id as string));

  const items: UploadBrowseItem[] = [];
  for (const r of (leg.data ?? []) as LegislativeRow[]) {
    items.push({
      key: `legislative:${r.id}`, type: "legislative",
      title: `${r.number} — ${r.title}`, date: r.date_approved, href: `/transparency/legislative/${r.slug}`,
      files: r.file_path ? [{ id: r.id, url: documentUrl(r.file_path), label: "Download PDF", mime: "application/pdf", sizeBytes: r.file_size_bytes ?? 0 }] : [],
      progress: null,
    });
  }
  for (const d of (docs.data ?? []) as { id: string; title: string; date_released: string | null }[]) {
    items.push({ key: `document:${d.id}`, type: "document", title: d.title, date: d.date_released, href: null, files: docFiles.get(d.id) ?? [], progress: null });
  }
  for (const p of (projs.data ?? []) as { id: string; name: string; progress: number; date: string | null }[]) {
    items.push({ key: `project:${p.id}`, type: "project", title: p.name, date: p.date, href: null, files: projFiles.get(p.id) ?? [], progress: p.progress });
  }
  return items;
}

function compareItems(a: UploadBrowseItem, b: UploadBrowseItem, sort: string, dir: "asc" | "desc"): number {
  const factor = dir === "asc" ? 1 : -1;
  if (sort === "title") return a.title.localeCompare(b.title) * factor;
  if (sort === "type") return a.type.localeCompare(b.type) * factor;
  // date: nulls always first (undated pinned on top), then by date in the chosen direction.
  if (a.date === null && b.date === null) return 0;
  if (a.date === null) return -1;
  if (b.date === null) return 1;
  return a.date.localeCompare(b.date) * factor;
}

export async function searchUploads({ q, type, sort, dir, page }: {
  q: string; type: UploadBrowseType | "all"; sort: "date" | "title" | "type"; dir: "asc" | "desc"; page: number;
}): Promise<{ items: UploadBrowseItem[]; total: number; pageSize: number }> {
  let items = await allUploadItems();
  const term = q.trim().toLowerCase();
  if (term) items = items.filter((i) => i.title.toLowerCase().includes(term));
  if (type !== "all") items = items.filter((i) => i.type === type);
  items.sort((a, b) => compareItems(a, b, sort, dir));
  const total = items.length;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * UPLOADS_PAGE_SIZE;
  return { items: items.slice(from, from + UPLOADS_PAGE_SIZE), total, pageSize: UPLOADS_PAGE_SIZE };
}

export async function listLatestUploads(limit = 5): Promise<UploadBrowseItem[]> {
  const items = await allUploadItems();
  items.sort((a, b) => compareItems(a, b, "date", "desc"));
  return items.slice(0, limit);
}
```

(Note: `q` is filtered in-memory with `includes`, so the ilike escaping helpers are not needed here — but if a future task moves this to a DB `.or()` query, route the term through `ilikePattern`/`quoteFilterValue`.)

- [ ] **Step 2: Browse body component**

Create `src/features/transparency/components/uploads-browse.tsx` (server component), modeled on `legislative-archive.tsx`: a GET search form (`name="q"`), type-filter links (All / Legislative / Documents / Projects), a table with **sortable header links** (Title, Type, Date — each toggling `sort`/`dir` via query params, showing ▲/▼ on the active column), each row rendering `<FileDownloads files={item.files} recordTitle={item.title} align="right" />`, a **View** link when `item.href` (legislative), and progress for projects. Preserve `q`/`type`/`sort`/`dir` across the sort/type/pagination links via a `hrefFor` helper (extend the archive's pattern). Pagination identical to the archive, with `page` clamped to `[1, lastPage]`.

- [ ] **Step 3: Route**

Create `src/app/(public)/transparency/uploads/page.tsx`:

```tsx
import type { Metadata } from "next";
import type { UploadBrowseType } from "@/types";
import { PageHero } from "@/components/sections/page-hero";
import { UploadsBrowse } from "@/features/transparency";

export const metadata: Metadata = {
  title: "Transparency Uploads",
  description: "Browse and search every published document, ordinance, resolution, and project of Barangay San Fernando.",
};

export default async function UploadsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; type?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const p = await searchParams;
  const type: UploadBrowseType | "all" =
    p.type === "legislative" || p.type === "document" || p.type === "project" ? p.type : "all";
  const sort: "date" | "title" | "type" = p.sort === "title" || p.sort === "type" ? p.sort : "date";
  const dir: "asc" | "desc" = p.dir === "asc" ? "asc" : "desc";
  const rawPage = Number.parseInt(p.page ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  return (
    <>
      <PageHero title="Transparency Uploads" description="Search every published record of the barangay." />
      <UploadsBrowse q={p.q ?? ""} type={type} sort={sort} dir={dir} page={page} />
    </>
  );
}
```

Export `UploadsBrowse` from `src/features/transparency/index.ts`.

- [ ] **Step 4: Repurpose the `/transparency` preview**

Rewrite `latest-uploads-section.tsx` to call `listLatestUploads(5)` and render the rows with `FileDownloads` (+ a legislative View link, + project progress), followed by a **"Browse all uploads →"** `Link` to `/transparency/uploads`. Keep the `Section`/`SectionHeading` wrapper.

- [ ] **Step 5: Typecheck, lint, runtime, commit**

Run: `npm run typecheck && npm run lint` → pass. Then drive `/transparency/uploads`: search, each type filter, each sort toggle (▲/▼), pagination, and confirm projects appear with files + progress and legislative rows link to their detail page. Confirm `/transparency` shows the preview + working "Browse all" link.

```bash
git add src/features/transparency/queries.ts src/features/transparency/index.ts src/features/transparency/components/uploads-browse.tsx src/features/transparency/components/latest-uploads-section.tsx "src/app/(public)/transparency/uploads/page.tsx"
git commit -m "feat(transparency): unified uploads browse with search, filter, sort

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Sortable tables (public legislative + admin)

**Files:**
- Create: `src/components/ui/use-table-sort.ts`, `src/components/ui/sortable-th.tsx`
- Modify: `src/features/transparency/components/legislative-table.tsx`, `src/features/admin/components/legislative-manager.tsx`, `src/features/admin/components/transparency-manager.tsx`, `src/features/admin/components/transparency-projects-panel.tsx`

**Interfaces produced:**
- `useTableSort<T>(rows: T[], initial: { key: string; dir: "asc" | "desc" }, accessors: Record<string, (row: T) => string | number | null>) => { sorted: T[]; sortKey: string; sortDir: "asc" | "desc"; toggle: (key: string) => void }`
- `<SortableTh label={string} sortKey={string} activeKey={string} dir="asc"|"desc" onToggle={(key) => void} align?: "left"|"right" />`

- [ ] **Step 1: Sort hook**

Create `src/components/ui/use-table-sort.ts`:

```ts
"use client";

import { useMemo, useState } from "react";

type Dir = "asc" | "desc";

export function useTableSort<T>(
  rows: T[],
  initial: { key: string; dir: Dir },
  accessors: Record<string, (row: T) => string | number | null>,
) {
  const [sortKey, setSortKey] = useState(initial.key);
  const [sortDir, setSortDir] = useState<Dir>(initial.dir);

  const sorted = useMemo(() => {
    const get = accessors[sortKey];
    if (!get) return rows;
    const factor = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      // Null (e.g. undated) always sorts first, regardless of direction.
      if (av === null && bv === null) return 0;
      if (av === null) return -1;
      if (bv === null) return 1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, sortKey, sortDir, accessors]);

  function toggle(key: string) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  return { sorted, sortKey, sortDir, toggle };
}
```

- [ ] **Step 2: Sortable header cell**

Create `src/components/ui/sortable-th.tsx`:

```tsx
"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableThProps {
  label: string;
  sortKey: string;
  activeKey: string;
  dir: "asc" | "desc";
  onToggle: (key: string) => void;
  align?: "left" | "right";
  className?: string;
}

export function SortableTh({ label, sortKey, activeKey, dir, onToggle, align = "left", className }: SortableThProps) {
  const active = sortKey === activeKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn("px-6 py-4", align === "right" && "text-right", className)}>
      <button type="button" onClick={() => onToggle(sortKey)}
              className={cn("inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-ink-900",
                            align === "right" && "flex-row-reverse")}>
        {label}
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </th>
  );
}
```

- [ ] **Step 3: Public legislative table**

In `legislative-table.tsx`, wrap `documents` with `useTableSort(documents, { key: "date", dir: "desc" }, { number: (d) => d.number, title: (d) => d.title, date: (d) => d.dateApproved })`, render the three data headers as `<SortableTh …>` wired to `toggle`, and map over `sorted` instead of `documents`. Keep the expand column as a plain `<th>`.

- [ ] **Step 4: Admin tables**

- `legislative-manager.tsx`: the legislative directory table — add `useTableSort` over `documents` with accessors for Number, Title, Date (dateApproved, null-first), Status; render `SortableTh`s. Keep pagination/filters working on the sorted array.
- `transparency-manager.tsx` (documents tab table): add `useTableSort` over `filteredDocuments` (accessors Title, Category, Date `dateReleased`, Status) and render `SortableTh`s; paginate the sorted result.
- `transparency-projects-panel.tsx`: the list is an ordered `<ul>` with manual reorder — do NOT impose column sorting that fights the reorder controls. Instead skip client sort here (reorder IS the ordering) OR add a light sort only if it reads cleanly; the reviewer decides. Default: leave projects on manual `sort_order`. (Document this choice in the commit message.)

- [ ] **Step 5: Typecheck, lint, runtime, commit**

Run: `npm run typecheck && npm run lint` → pass. Drive: click each sortable header on the public legislative tables and the admin legislative + documents tables; confirm ▲/▼ toggles and rows reorder, undated rows stay pinned first.

```bash
git add src/components/ui/use-table-sort.ts src/components/ui/sortable-th.tsx src/features/transparency/components/legislative-table.tsx src/features/admin/components/legislative-manager.tsx src/features/admin/components/transparency-manager.tsx src/features/admin/components/transparency-projects-panel.tsx
git commit -m "feat(transparency): sortable columns on public and admin tables

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Cleanups + docs

**Files:**
- Delete: `src/components/shared/document-link.tsx`
- Modify: `src/app/(public)/transparency/legislative/page.tsx`, `docs/BACKEND_HANDOFF.md`

- [ ] **Step 1: Delete the orphaned component (after confirming no importers)**

Run: `git grep -n "document-link\|DocumentLink" -- src`
Expected: no matches. If clean:
```bash
git rm src/components/shared/document-link.tsx
```
If any importer appears, stop and reconcile.

- [ ] **Step 2: Clamp the legislative archive page param (Plan-4 review Minor #4)**

In `src/app/(public)/transparency/legislative/page.tsx`, the page currently clamps only `>= 1`. Because `searchLegislative` returns `total`, clamp against `lastPage` too. The simplest correct fix: pass the raw page to `LegislativeArchive` but have it (or the page) recompute `lastPage` and clamp before building pagination/labels. Minimal approach — in `LegislativeArchive`, after computing `lastPage`, add `const safePage = Math.min(Math.max(1, page), lastPage);` and use `safePage` for the "Page X of Y" label and the Previous/Next `hrefFor(..., safePage ± 1)` guards. (The query already clamps internally; this aligns the UI.)

- [ ] **Step 3: Update BACKEND_HANDOFF.md**

Add a Plan-5 section documenting: the `transparency_files` polymorphic child table (no FK; app-enforced integrity and ≤3 cap); optional `date_released`/`transparency_projects.date` ("Undated"); the multi-file orphan-free save (deferred upload + compensation, extended to a file set); the `/transparency/uploads` browse (in-memory union/sort — revisit if the dataset grows); and that migration 0011 was applied by the owner. Do NOT retro-edit files under `docs/superpowers/specs/` or `docs/superpowers/plans/`.

- [ ] **Step 4: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint` → pass.

```bash
git add "src/app/(public)/transparency/legislative/page.tsx" docs/BACKEND_HANDOFF.md
git commit -m "chore(transparency): drop dead document-link, clamp archive page, document Plan 5

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final: whole-branch review + merge

After Task 7, run the final whole-branch review (`superpowers:requesting-code-review`) over `git merge-base main HEAD`..HEAD, dispatch ONE fix subagent for any Critical/Important findings, then present merge options to the repo owner (owner reserves the merge/push-to-main decision).
