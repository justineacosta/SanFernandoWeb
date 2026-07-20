# Transparency Documents Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take every content block on `/transparency` — ordinances and resolutions, budget/financial documents, and project monitoring — from mock constants to DB-backed records with real PDF upload, slug detail pages, a working search, and a tabbed `/admin/transparency` section.

**Architecture:** Mirrors Plan 3 (news content) exactly. New migration `0009_transparency.sql` adds four tables with RLS enabled and **no policies at all**; every read and write goes through the service-role client after an explicit permission check in code. Public reads live in a `server-only` queries module; admin writes are Server Actions. PDFs go to a new `public-documents` Storage bucket, separate from `public-media` because the size caps differ (10MB vs 2MB).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (Postgres + Storage), Zod for server-side validation.

**Spec:** `docs/superpowers/specs/2026-07-20-transparency-documents-design.md`

## Global Constraints

- **There is no test framework and this plan does not add one.** CLAUDE.md forbids it; Playwright tests are build-order step 8 (the hardening plan). Every task's verification is `npm run typecheck`, `npm run lint`, and — where the task changes rendered output — driving the running app per `.claude/skills/verify/SKILL.md`. Steps below say exactly which to run.
- Path alias `@/*` → `src/*`.
- **Design tokens only.** `brand-*`, `ink-*`, `danger*` from `src/app/globals.css`. No raw hex, no blue tokens, and **no `brand-50`/`brand-900`** — those tokens do not exist and Tailwind will silently drop the class.
- **Pages stay thin.** Files in `src/app/` compose feature sections only; no inline layout or data logic.
- **Server Components by default.** `"use client"` only for real interactivity.
- **The RSC icon boundary:** a `LucideIcon` value must never cross into a `"use client"` prop or a DB row. Store icon *name strings* and resolve via `resolveIcon()` in `src/lib/icon-map.ts`.
- **RLS pattern:** every new table gets `alter table … enable row level security;` and **zero policies**. The only policy in this migration is public-read on `storage.objects` for the new bucket.
- Content status vocabulary is the existing `public.content_status` enum: `draft | in-review | published | archived`.
- Never `git add -A` — stage explicit paths (untracked `stitch_tabbed_content_manager/` and `proposal/` must stay out of commits).
- Commit after every task, using the message given in the task's final step.

## Correction to the spec

Spec §6 says `manage-transparency` is a **new** permission. It already exists — `PERMISSIONS` in `src/types/index.ts:451-459` includes it (added by the auth-foundation plan, never wired to a route). No permission needs to be added; it only needs to gate the new page and nav entry, and it already renders as a checkbox in Manage Users.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/0009_transparency.sql` | Schema, seed, bucket, storage policy |
| `src/features/transparency/queries.ts` | Public reads (`server-only`) |
| `src/features/transparency/components/projects-card.tsx` | Project Monitoring card |
| `src/features/transparency/components/legislative-archive.tsx` | Search results list |
| `src/features/transparency/components/document-download-card.tsx` | Download affordance + no-file fallback |
| `src/features/transparency/components/pdf-viewer.tsx` | Inline `<object>` viewer with fallback |
| `src/app/(public)/transparency/legislative/page.tsx` | Archive + search route |
| `src/app/(public)/transparency/legislative/[slug]/page.tsx` | Detail route |
| `src/app/admin/(portal)/transparency/page.tsx` | Admin route |
| `src/features/admin/queries/transparency.ts` | Admin list reads (`server-only`) |
| `src/features/admin/queries/transparency-categories.ts` | Category reads |
| `src/features/admin/actions/legislative.ts` | Legislative save/workflow/delete |
| `src/features/admin/actions/transparency-documents.ts` | Document save/workflow/delete |
| `src/features/admin/actions/transparency-projects.ts` | Project CRUD |
| `src/features/admin/actions/transparency-categories.ts` | Category CRUD |
| `src/features/admin/actions/documents.ts` | PDF upload/remove |
| `src/features/admin/components/pdf-uploader.tsx` | Client uploader |
| `src/features/admin/components/transparency-manager.tsx` | Tab shell |
| `src/features/admin/components/transparency-document-form.tsx` | Documents drawer |
| `src/features/admin/components/transparency-projects-panel.tsx` | Projects tab |
| `src/features/admin/components/transparency-categories-panel.tsx` | SuperAdmin category editor |

**Modified:** `src/lib/storage.ts`, `src/types/index.ts`, `src/lib/icon-map.ts`, the four existing transparency components, `src/features/transparency/index.ts`, `src/features/admin/index.ts`, `src/features/admin/data.ts`, `src/features/admin/components/legislative-manager.tsx`, `src/features/admin/components/legislative-form.tsx`, `next.config.ts` (nothing — the Supabase host is already allow-listed), `docs/BACKEND_HANDOFF.md`.

**Deleted:** `src/features/transparency/data.ts`, `src/app/admin/(portal)/legislative/page.tsx`.

---

## Task 1: Migration — schema, seed, bucket

**Files:**
- Create: `supabase/migrations/0009_transparency.sql`
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Produces: tables `transparency_categories`, `legislative_documents`, `transparency_documents`, `transparency_projects`; enum `public.legislative_type`; bucket `public-documents`. From `storage.ts`: `PUBLIC_DOCUMENTS_BUCKET`, `MAX_PDF_BYTES`, `ALLOWED_PDF_TYPES`, `documentUrl(path: string): string`, `legislativePdfPath(id: string): string`, `documentPdfPath(id: string): string`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_transparency.sql`:

```sql
-- Transparency documents (Plan 4, spec §3).
--
-- RLS: enabled with NO policies on all four tables, deliberately — the same
-- pattern as the ticket and news tables. Neither anon nor authenticated may
-- touch them. Every read (public queries filter status='published') and every
-- write goes through the service-role client after an explicit permission
-- check in code, so the gate lives in one reviewable place.
--
-- Storage: a second public bucket `public-documents`, separate from
-- `public-media`. PDFs cap at 10MB where images cap at 2MB; holding both
-- limits in one bucket's upload actions invites applying the wrong one.

create type public.legislative_type as enum ('ordinance', 'resolution');

-- ── Categories ──────────────────────────────────────────────────────────────
-- SuperAdmin-editable; retired via is_active, never deleted (documents
-- reference them). Mirrors news_categories / assistance_categories.
create table public.transparency_categories (
  id text primary key,
  label text not null,
  icon_name text not null default 'file-text',
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index transparency_categories_sort_order_idx
  on public.transparency_categories (sort_order);
alter table public.transparency_categories enable row level security;
create trigger transparency_categories_updated_at
  before update on public.transparency_categories
  for each row execute function public.set_updated_at();

insert into public.transparency_categories (id, label, icon_name, sort_order) values
  ('financials', 'Financials', 'receipt', 1),
  ('legislative', 'Legislative', 'gavel', 2),
  ('projects', 'Projects', 'landmark', 3),
  ('awards', 'Awards', 'file-check', 4);

-- ── Legislative documents (ordinances & resolutions) ────────────────────────
-- Ordered by date_approved, NOT published_at: a 2023 ordinance may be uploaded
-- after a 2024 one, and spec §7 requires newest-approved-first.
create table public.legislative_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  doc_type public.legislative_type not null,
  number text not null,
  title text not null,
  date_approved date not null,
  summary text not null default '',
  file_path text,
  file_size_bytes int,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index legislative_documents_status_date_idx
  on public.legislative_documents (status, date_approved desc);
create index legislative_documents_type_status_date_idx
  on public.legislative_documents (doc_type, status, date_approved desc);
alter table public.legislative_documents enable row level security;
create trigger legislative_documents_updated_at
  before update on public.legislative_documents
  for each row execute function public.set_updated_at();

-- ── Transparency documents (budgets, financials, awards) ────────────────────
create table public.transparency_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_id text not null
    references public.transparency_categories (id) on delete restrict,
  date_released date not null,
  file_path text,
  file_size_bytes int,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transparency_documents_status_date_idx
  on public.transparency_documents (status, date_released desc);
create index transparency_documents_category_idx
  on public.transparency_documents (category_id, status, date_released desc);
alter table public.transparency_documents enable row level security;
create trigger transparency_documents_updated_at
  before update on public.transparency_documents
  for each row execute function public.set_updated_at();

-- ── Projects ────────────────────────────────────────────────────────────────
create table public.transparency_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  progress int not null default 0 check (progress between 0 and 100),
  sort_order int not null default 0,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transparency_projects_status_sort_idx
  on public.transparency_projects (status, sort_order);
alter table public.transparency_projects enable row level security;
create trigger transparency_projects_updated_at
  before update on public.transparency_projects
  for each row execute function public.set_updated_at();

-- ── Storage: public-documents bucket (PDFs, 10MB) ───────────────────────────
insert into storage.buckets (id, name, public)
  values ('public-documents', 'public-documents', true)
  on conflict (id) do nothing;
create policy "public read public-documents" on storage.objects
  for select to public using (bucket_id = 'public-documents');

-- ── Seed (day-one parity with the mock data being replaced) ─────────────────
-- Published with file_path null: records render with a "available at the
-- barangay hall" note instead of a download link until real PDFs are attached
-- through /admin/transparency.
insert into public.legislative_documents
  (slug, doc_type, number, title, date_approved, summary, status, published_at) values
  ('ordinance-no-05-2024-comprehensive-solid-waste-management-program', 'ordinance',
   'Ordinance No. 05-2024', 'Comprehensive Solid Waste Management Program', '2024-09-28',
   'An ordinance institutionalizing waste segregation at source in all households and establishments within Barangay San Fernando, prescribing collection schedules per purok, designating materials recovery facilities, and providing penalties of ₱500 to ₱2,500 for non-compliance. Enacted pursuant to RA 9003 (Ecological Solid Waste Management Act).',
   'published', now()),
  ('ordinance-no-03-2024-curfew-hours-for-minors', 'ordinance',
   'Ordinance No. 03-2024', 'Curfew Hours for Minors', '2024-06-14',
   'An ordinance setting curfew hours for minors below 18 years of age from 10:00 PM to 4:00 AM daily, defining exemptions for work, school, and emergencies, and directing barangay tanods to escort apprehended minors to their parents or guardians. First offense carries a written warning; succeeding offenses require parental conference with the Lupon.',
   'published', now()),
  ('ordinance-no-11-2023-anti-illegal-parking-on-barangay-roads', 'ordinance',
   'Ordinance No. 11-2023', 'Anti-Illegal Parking on Barangay Roads', '2023-11-08',
   'An ordinance prohibiting the parking of motor vehicles on designated barangay road sections that obstruct traffic flow or emergency access, establishing towing and impounding procedures in coordination with the municipal traffic office, and imposing graduated fines starting at ₱1,000.',
   'published', now()),
  ('resolution-no-12-2024-adopting-the-annual-budget-for-fiscal-year-2025', 'resolution',
   'Resolution No. 12-2024', 'Adopting the Annual Budget for Fiscal Year 2025', '2024-10-05',
   'A resolution adopting the proposed annual budget of Barangay San Fernando for fiscal year 2025 amounting to ₱8,450,000, allocating 20% to the Barangay Development Fund, 10% to the Sangguniang Kabataan fund, and 5% to the Barangay Disaster Risk Reduction and Management Fund, as reviewed by the Barangay Development Council.',
   'published', now()),
  ('resolution-no-09-2024-authorizing-a-memorandum-of-agreement-for-the-feeding-program', 'resolution',
   'Resolution No. 09-2024', 'Authorizing a Memorandum of Agreement for the Feeding Program', '2024-07-19',
   'A resolution authorizing the Punong Barangay to enter into a memorandum of agreement with the Municipal Social Welfare and Development Office for the implementation of a six-month supplemental feeding program benefiting 120 undernourished children in the barangay day care centers.',
   'published', now()),
  ('resolution-no-04-2024-requesting-streetlight-installation-along-san-fernando-extension', 'resolution',
   'Resolution No. 04-2024', 'Requesting Streetlight Installation Along San Fernando Extension', '2024-03-22',
   'A resolution respectfully requesting the Municipal Engineering Office to install fifteen (15) LED streetlights along San Fernando Extension from Purok 3 to Purok 5, citing recorded safety incidents and the results of the barangay assembly consultation held February 2024.',
   'published', now());

insert into public.transparency_documents
  (title, category_id, date_released, status, published_at) values
  ('2024 Approved Budget', 'financials', '2024-01-15', 'published', now()),
  ('2023 Expenditure Report', 'financials', '2024-02-10', 'published', now()),
  ('2024 Q3 Income Statement', 'financials', '2024-10-12', 'published', now()),
  ('Ordinance No. 05-2024: Waste Management', 'legislative', '2024-09-28', 'published', now()),
  ('Road Improvement Project Report', 'projects', '2024-09-15', 'published', now()),
  ('Seal of Good Governance Certificate', 'awards', '2024-08-20', 'published', now());

insert into public.transparency_projects (name, progress, sort_order, status, published_at) values
  ('Barangay Hall Renovation', 100, 1, 'published', now()),
  ('Main Road Lighting Phase II', 65, 2, 'published', now());
```

- [ ] **Step 2: Apply the migration**

Apply it the same way the previous eight were applied in this project (Supabase SQL editor or `supabase db push`). Confirm in the Supabase dashboard that all four tables exist, show **RLS enabled with 0 policies**, and that the `public-documents` bucket is listed as public.

- [ ] **Step 3: Extend the storage helper**

Append to `src/lib/storage.ts`:

```ts
export const PUBLIC_DOCUMENTS_BUCKET = "public-documents";

export const ALLOWED_PDF_TYPES = ["application/pdf"] as const;
export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB (spec §4 — scanned ordinances run big)

/**
 * Resolve a stored document reference to a public URL. Mirrors photoUrl()'s
 * contract: a full remote URL passes through unchanged, a bare object path
 * resolves against the documents bucket.
 */
export function documentUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${PUBLIC_DOCUMENTS_BUCKET}/${path}`;
}

/** Storage object path for a legislative PDF: `legislative/<id>/<uuid>.pdf`. */
export function legislativePdfPath(documentId: string): string {
  return `legislative/${documentId}/${crypto.randomUUID()}.pdf`;
}

/** Storage object path for a transparency document PDF: `documents/<id>/<uuid>.pdf`. */
export function documentPdfPath(documentId: string): string {
  return `documents/${documentId}/${crypto.randomUUID()}.pdf`;
}

/** Human-readable file size for download affordances, e.g. "2.4 MB". */
export function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both pass with no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_transparency.sql src/lib/storage.ts
git commit -m "feat(db): transparency schema, seed & public-documents bucket (0009)"
```

---

## Task 2: Types

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every type named below. Later tasks import these exact names.

Old types (`LegislativeDocument`, `TransparencyDocument`, `ProjectStatus`, `AdminLegislativeRecord`, `AdminLegislativeStatus`, `LegislativeFormValues`) stay for now — their consumers are still live. Task 12 removes them.

- [ ] **Step 1: Add the new types**

Add to `src/types/index.ts`, near the existing transparency types:

```ts
/* ── Transparency (Plan 4) ───────────────────────────────────────────────── */

export type LegislativeType = "ordinance" | "resolution";

/** A published ordinance/resolution as the public tables and archive render it. */
export interface LegislativeListItem {
  id: string;
  slug: string;
  docType: LegislativeType;
  number: string;
  title: string;
  /** ISO date approved. */
  dateApproved: string;
  /** Resolved public URL, or null when no PDF is attached yet. */
  fileUrl: string | null;
  fileSizeBytes: number | null;
}

/** Detail-page shape: the list item plus the expanded summary. */
export interface LegislativeDetail extends LegislativeListItem {
  summary: string;
}

/** A published document in the disclosure/latest-uploads tables. */
export interface TransparencyDocumentItem {
  id: string;
  title: string;
  categoryLabel: string;
  /** Icon name string — resolve with resolveIcon(); never store a component. */
  categoryIconName: string;
  /** ISO date released. */
  dateReleased: string;
  fileUrl: string | null;
  fileSizeBytes: number | null;
}

export interface TransparencyProjectItem {
  id: string;
  name: string;
  progress: number;
}

export interface TransparencyCategoryRow {
  id: string;
  label: string;
  iconName: string;
  sortOrder: number;
  isActive: boolean;
}

/* Admin rows (serializable — cross the client boundary into the manager). */

export interface AdminLegislativeRow {
  id: string;
  slug: string;
  docType: LegislativeType;
  number: string;
  title: string;
  dateApproved: string;
  status: ContentStatus;
  hasFile: boolean;
  fileUrl: string | null;
}

export interface AdminTransparencyDocumentRow {
  id: string;
  title: string;
  categoryId: string;
  categoryLabel: string;
  dateReleased: string;
  status: ContentStatus;
  hasFile: boolean;
  fileUrl: string | null;
}

export interface AdminTransparencyProjectRow {
  id: string;
  name: string;
  progress: number;
  sortOrder: number;
  status: ContentStatus;
}

/* Drawer-form body shapes (the write-side contract). */

export interface LegislativeValues {
  docType: LegislativeType;
  number: string;
  title: string;
  dateApproved: string;
  summary: string;
  /** Storage object path, or null. Set by the uploader, persisted by the action. */
  filePath: string | null;
  fileSizeBytes: number | null;
}

export interface TransparencyDocumentValues {
  title: string;
  categoryId: string;
  dateReleased: string;
  filePath: string | null;
  fileSizeBytes: number | null;
}

export interface TransparencyProjectValues {
  name: string;
  progress: number;
}

export interface TransparencyCategoryValues {
  label: string;
  iconName: string;
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(transparency): view-model and form-values types"
```

---

## Task 3: Public queries

**Files:**
- Create: `src/features/transparency/queries.ts`

**Interfaces:**
- Consumes: Task 1's tables and `documentUrl()`; Task 2's types.
- Produces: `listRecentLegislative(docType, limit)`, `searchLegislative({ q, docType, page })`, `getPublishedLegislativeBySlug(slug)`, `listPublishedDocumentsByCategory(categoryId, limit?)`, `listLatestPublishedDocuments(limit)`, `listPublishedProjects()`, and the exported `LEGISLATIVE_PAGE_SIZE`.

- [ ] **Step 1: Write the queries module**

Create `src/features/transparency/queries.ts`:

```ts
import "server-only";
import type {
  LegislativeDetail,
  LegislativeListItem,
  LegislativeType,
  TransparencyDocumentItem,
  TransparencyProjectItem,
} from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { documentUrl } from "@/lib/storage";

export const LEGISLATIVE_PAGE_SIZE = 10;

const LIST_COLUMNS =
  "id, slug, doc_type, number, title, date_approved, file_path, file_size_bytes";

interface LegislativeRow {
  id: string;
  slug: string;
  doc_type: LegislativeType;
  number: string;
  title: string;
  date_approved: string;
  summary?: string;
  file_path: string | null;
  file_size_bytes: number | null;
}

function toListItem(row: LegislativeRow): LegislativeListItem {
  return {
    id: row.id,
    slug: row.slug,
    docType: row.doc_type,
    number: row.number,
    title: row.title,
    dateApproved: row.date_approved,
    fileUrl: row.file_path ? documentUrl(row.file_path) : null,
    fileSizeBytes: row.file_size_bytes,
  };
}

/**
 * Escape a user search term for a PostgREST `ilike` filter.
 *
 * Two separate hazards, escaped in order:
 *  1. LIKE pattern chars — `%` and `_` are wildcards, `\` is the escape
 *     character. An unescaped `%` matches everything, which is how the same
 *     mistake in /track's surname lookup would have leaked every ticket.
 *  2. PostgREST filter grammar — `,` `.` `(` `)` and `"` are structural inside
 *     an or() expression. Wrapping the value in double quotes makes them
 *     literal; the quote and backslash themselves then need escaping.
 */
function ilikePattern(raw: string): string {
  const escaped = raw
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

/** Recent published documents of one type — the /transparency preview tables. */
export async function listRecentLegislative(
  docType: LegislativeType,
  limit = 5,
): Promise<LegislativeDetail[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select(`${LIST_COLUMNS}, summary`)
    .eq("status", "published")
    .eq("doc_type", docType)
    .order("date_approved", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as LegislativeRow[]).map((row) => ({
    ...toListItem(row),
    summary: row.summary ?? "",
  }));
}

/** Paginated search over number, title and summary. */
export async function searchLegislative({
  q,
  docType,
  page,
}: {
  q: string;
  docType: LegislativeType | "all";
  page: number;
}): Promise<{ items: LegislativeDetail[]; total: number; pageSize: number }> {
  const admin = createSupabaseAdminClient();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * LEGISLATIVE_PAGE_SIZE;

  let query = admin
    .from("legislative_documents")
    .select(`${LIST_COLUMNS}, summary`, { count: "exact" })
    .eq("status", "published");

  if (docType !== "all") query = query.eq("doc_type", docType);

  const term = q.trim();
  if (term) {
    const value = quoteFilterValue(ilikePattern(term));
    query = query.or(`number.ilike.${value},title.ilike.${value},summary.ilike.${value}`);
  }

  const { data, count, error } = await query
    .order("date_approved", { ascending: false })
    .range(from, from + LEGISLATIVE_PAGE_SIZE - 1);

  if (error || !data) return { items: [], total: 0, pageSize: LEGISLATIVE_PAGE_SIZE };
  return {
    items: (data as LegislativeRow[]).map((row) => ({
      ...toListItem(row),
      summary: row.summary ?? "",
    })),
    total: count ?? 0,
    pageSize: LEGISLATIVE_PAGE_SIZE,
  };
}

export async function getPublishedLegislativeBySlug(
  slug: string,
): Promise<LegislativeDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select(`${LIST_COLUMNS}, summary`)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as LegislativeRow;
  return { ...toListItem(row), summary: row.summary ?? "" };
}

interface DocumentRow {
  id: string;
  title: string;
  date_released: string;
  file_path: string | null;
  file_size_bytes: number | null;
  transparency_categories: { label: string; icon_name: string } | null;
}

function toDocumentItem(row: DocumentRow): TransparencyDocumentItem {
  return {
    id: row.id,
    title: row.title,
    categoryLabel: row.transparency_categories?.label ?? "Document",
    categoryIconName: row.transparency_categories?.icon_name ?? "file-text",
    dateReleased: row.date_released,
    fileUrl: row.file_path ? documentUrl(row.file_path) : null,
    fileSizeBytes: row.file_size_bytes,
  };
}

const DOCUMENT_COLUMNS =
  "id, title, date_released, file_path, file_size_bytes, transparency_categories(label, icon_name)";

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
    .order("date_released", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as unknown as DocumentRow[]).map(toDocumentItem);
}

export async function listLatestPublishedDocuments(
  limit = 4,
): Promise<TransparencyDocumentItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("status", "published")
    .order("date_released", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as unknown as DocumentRow[]).map(toDocumentItem);
}

export async function listPublishedProjects(): Promise<TransparencyProjectItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_projects")
    .select("id, name, progress")
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data as TransparencyProjectItem[];
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/features/transparency/queries.ts
git commit -m "feat(transparency): public queries for legislative, documents & projects"
```

---

## Task 4: Shared download + viewer components

**Files:**
- Create: `src/features/transparency/components/document-download-card.tsx`
- Create: `src/features/transparency/components/pdf-viewer.tsx`

**Interfaces:**
- Consumes: `formatFileSize` from `@/lib/storage`.
- Produces: `<DocumentDownloadCard fileUrl title fileSizeBytes />` and `<PdfViewer fileUrl title fileSizeBytes />`. Both are Server Components.

- [ ] **Step 1: Write the download card**

This is the single place the "no file yet" state is rendered — every consumer delegates to it, so no dead links can appear anywhere.

Create `src/features/transparency/components/document-download-card.tsx`:

```tsx
import { Download, FileText, Info } from "lucide-react";
import { formatFileSize } from "@/lib/storage";

/**
 * Download affordance for a document. When no PDF is attached the record is
 * still useful — it renders a "available at the barangay hall" note rather
 * than a dead link (spec §4).
 */
export function DocumentDownloadCard({
  fileUrl,
  title,
  fileSizeBytes = null,
}: {
  fileUrl: string | null;
  title: string;
  fileSizeBytes?: number | null;
}) {
  if (!fileUrl) {
    return (
      <p className="flex items-start gap-3 rounded-2xl bg-ink-50 p-4 text-sm text-ink-600">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-ink-500" aria-hidden="true" />
        <span>
          A digital copy is not yet uploaded. The full document is available on request at the
          barangay hall.
        </span>
      </p>
    );
  }

  const size = formatFileSize(fileSizeBytes);
  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4 transition-colors hover:border-brand-400 hover:bg-brand-100/40"
    >
      <FileText className="h-6 w-6 shrink-0 text-ink-900" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink-900">{title}</span>
        <span className="text-sm text-ink-500">PDF{size ? ` · ${size}` : ""}</span>
      </span>
      <Download className="h-5 w-5 shrink-0 text-ink-500" aria-hidden="true" />
      <span className="sr-only">Download {title}</span>
    </a>
  );
}
```

- [ ] **Step 2: Write the viewer**

Create `src/features/transparency/components/pdf-viewer.tsx`:

```tsx
import { DocumentDownloadCard } from "./document-download-card";

/**
 * Inline PDF preview. `<object>` renders natively on desktop browsers; mobile
 * browsers and anything without a PDF plugin fall back to the element's
 * children, which is the same download card used elsewhere — there is never a
 * viewer-shaped hole on the page.
 */
export function PdfViewer({
  fileUrl,
  title,
  fileSizeBytes = null,
}: {
  fileUrl: string | null;
  title: string;
  fileSizeBytes?: number | null;
}) {
  if (!fileUrl) {
    return <DocumentDownloadCard fileUrl={null} title={title} />;
  }

  return (
    <div className="space-y-4">
      <object
        data={fileUrl}
        type="application/pdf"
        aria-label={`${title} (PDF preview)`}
        className="hidden h-[70vh] w-full rounded-2xl border border-ink-200 md:block"
      >
        <DocumentDownloadCard fileUrl={fileUrl} title={title} fileSizeBytes={fileSizeBytes} />
      </object>
      <div className="md:hidden">
        <DocumentDownloadCard fileUrl={fileUrl} title={title} fileSizeBytes={fileSizeBytes} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/transparency/components/document-download-card.tsx src/features/transparency/components/pdf-viewer.tsx
git commit -m "feat(transparency): document download card and inline PDF viewer"
```

---

## Task 5: Rewire `/transparency` to the DB

**Files:**
- Modify: `src/features/transparency/components/disclosure-grid.tsx`
- Modify: `src/features/transparency/components/latest-uploads-section.tsx`
- Modify: `src/features/transparency/components/legislative-section.tsx`
- Modify: `src/features/transparency/components/legislative-table.tsx`
- Create: `src/features/transparency/components/projects-card.tsx`
- Modify: `src/features/transparency/index.ts`

**Interfaces:**
- Consumes: Task 3's queries, Task 4's `DocumentDownloadCard`, Task 2's types.
- Produces: a `/transparency` page whose every block reads from the DB. `LegislativeTable` now takes `documents: LegislativeDetail[]`.

All four section components become `async` Server Components that fetch their own data — per `docs/BACKEND_HANDOFF.md` §5, data fetching belongs in the section, not the page. `src/app/(public)/transparency/page.tsx` needs **no change**.

- [ ] **Step 1: Create the projects card**

Extracted from `DisclosureGrid` so the grid file does not also own a data fetch for an unrelated entity.

Create `src/features/transparency/components/projects-card.tsx`:

```tsx
import { Construction } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { listPublishedProjects } from "@/features/transparency/queries";

/** Project monitoring card — DB-backed progress list. */
export async function ProjectsCard() {
  const projects = await listPublishedProjects();

  return (
    <Card className="rounded-3xl p-8 md:col-span-6 lg:col-span-4">
      <span className="mb-6 inline-block rounded-2xl bg-brand-100 p-4 text-brand-700">
        <Construction className="h-9 w-9" aria-hidden="true" />
      </span>
      <h3 className="mb-4 text-2xl font-semibold">Project Monitoring</h3>
      <p className="mb-6 text-ink-600">
        Real-time status of local infrastructure and community welfare projects.
      </p>
      {projects.length === 0 ? (
        <p className="text-sm text-ink-500">No monitored projects are published yet.</p>
      ) : (
        <ul className="space-y-4">
          {projects.map((project) => (
            <li key={project.id} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  project.progress === 100 ? "bg-green-500" : "bg-brand-500",
                )}
                aria-hidden="true"
              />
              <span>
                {project.name} ({project.progress}%)
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Rewire the disclosure grid**

In `src/features/transparency/components/disclosure-grid.tsx`:

1. Make the component `async`: `export async function DisclosureGrid() {`.
2. Delete the `BUDGET_DOCUMENTS, PROJECTS` import from `@/features/transparency/data` and the `DocumentLink` import; import instead:

```tsx
import { listPublishedDocumentsByCategory } from "@/features/transparency/queries";
import { DocumentDownloadCard } from "./document-download-card";
import { ProjectsCard } from "./projects-card";
```

3. At the top of the function body:

```tsx
const budgetDocuments = await listPublishedDocumentsByCategory("financials", 4);
```

4. Replace the budget-documents grid (currently mapping `BUDGET_DOCUMENTS` over `DocumentLink`) with:

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
  {budgetDocuments.length === 0 ? (
    <p className="text-sm text-ink-500">No budget reports are published yet.</p>
  ) : (
    budgetDocuments.map((doc) => (
      <DocumentDownloadCard
        key={doc.id}
        fileUrl={doc.fileUrl}
        title={doc.title}
        fileSizeBytes={doc.fileSizeBytes}
      />
    ))
  )}
</div>
```

5. Replace the whole Project Monitoring `<Card>` block with `<ProjectsCard />`, and delete the now-unused `Construction` import and `cn` import if nothing else in the file uses them.
6. Change the Financial Statements card's `<Button variant="outline" className="w-full">View Archive</Button>` to anchor at the uploads table:

```tsx
<Button href="#latest-uploads" variant="outline" className="w-full">
  View Archive
</Button>
```

(If `Button` does not accept `href`, wrap it in a plain `<a href="#latest-uploads">` — check `src/components/ui/button.tsx` and follow whichever the file supports.)

7. Point the search form at the archive route and let it submit as a GET:

```tsx
<form className="flex flex-col items-center gap-4 md:flex-row" action="/transparency/legislative" method="get">
```

and give the input `name="q"`:

```tsx
<Input
  id="ordinance-search"
  name="q"
  type="search"
  placeholder="Search by ordinance number or keyword..."
  className="pl-12"
/>
```

- [ ] **Step 3: Rewire the latest-uploads table**

In `src/features/transparency/components/latest-uploads-section.tsx`:

1. Swap the type import to `TransparencyDocumentItem`, drop the `LATEST_UPLOADS` import, and add:

```tsx
import { resolveIcon } from "@/lib/icon-map";
import { listLatestPublishedDocuments } from "@/features/transparency/queries";
```

2. Rewrite the columns and component:

```tsx
const columns: DataTableColumn<TransparencyDocumentItem>[] = [
  {
    header: "Document Title",
    cell: (doc) => {
      const Icon = resolveIcon(doc.categoryIconName);
      return (
        <span className="flex items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-ink-900" aria-hidden="true" />
          <span className="font-medium text-ink-900">{doc.title}</span>
        </span>
      );
    },
  },
  { header: "Category", cell: (doc) => doc.categoryLabel },
  {
    header: "Date Released",
    cell: (doc) => <span className="text-ink-600">{formatDate(doc.dateReleased)}</span>,
  },
  {
    header: "Action",
    align: "right",
    cell: (doc) =>
      doc.fileUrl ? (
        <a
          href={doc.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold uppercase text-ink-900 hover:underline"
        >
          Download
          <span className="sr-only"> {doc.title}</span>
        </a>
      ) : (
        <span className="text-sm text-ink-500">At the barangay hall</span>
      ),
  },
];

/** Table of the most recent documents added to the portal. */
export async function LatestUploadsSection() {
  const documents = await listLatestPublishedDocuments(4);
  return (
    <Section id="latest-uploads" tone="white" className="border-t border-ink-200">
      <SectionHeading
        title="Latest Uploads"
        description="Recent documents added to the transparency portal."
      />
      <DataTable
        caption="Latest documents uploaded to the transparency portal"
        columns={columns}
        rows={documents}
        rowKey={(doc) => doc.id}
      />
    </Section>
  );
}
```

Note the added `id="latest-uploads"` — that is the anchor the Financial Statements button targets. If `Section` does not forward an `id` prop, add one to it (`src/components/ui/section.tsx`) the same way it forwards `className`.

- [ ] **Step 4: Rewire the legislative section and table**

In `src/features/transparency/components/legislative-table.tsx`, change the prop type from `LegislativeDocument[]` to `LegislativeDetail[]` and update the field references: `doc.number` and `doc.title` are unchanged, `doc.date` becomes `doc.dateApproved`, and the download cell keys off `doc.fileUrl` being null exactly as the uploads table does above (render "At the barangay hall" rather than a `#` link). Add a "View" link to the detail page beside it:

```tsx
<Link href={`/transparency/legislative/${doc.slug}`} className="font-semibold uppercase text-ink-900 hover:underline">
  View
  <span className="sr-only"> {doc.number}</span>
</Link>
```

Use `doc.id` as the row key wherever the file currently keys on `doc.number`.

In `src/features/transparency/components/legislative-section.tsx`:

```tsx
import Link from "next/link";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { LegislativeTable } from "@/features/transparency/components/legislative-table";
import { listRecentLegislative } from "@/features/transparency/queries";

/** Ordinances and resolutions of the Sangguniang Barangay, each row expandable to its summary. */
export async function LegislativeSection() {
  const [ordinances, resolutions] = await Promise.all([
    listRecentLegislative("ordinance", 5),
    listRecentLegislative("resolution", 5),
  ]);

  return (
    <Section tone="white" className="border-t border-ink-200">
      <SectionHeading
        title="Ordinances & Resolutions"
        description="Enacted legislation of the Sangguniang Barangay. Expand a row to read the document summary."
      />
      <div className="space-y-10">
        <div>
          <h3 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Ordinances
          </h3>
          <LegislativeTable caption="Barangay ordinances" documents={ordinances} />
        </div>
        <div>
          <h3 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Resolutions
          </h3>
          <LegislativeTable caption="Barangay resolutions" documents={resolutions} />
        </div>
      </div>
      <p className="mt-8 text-center">
        <Link href="/transparency/legislative" className="font-semibold text-ink-900 hover:underline">
          Browse and search the full archive →
        </Link>
      </p>
    </Section>
  );
}
```

- [ ] **Step 5: Export the new component**

Add to `src/features/transparency/index.ts`, in page order:

```ts
export { ProjectsCard } from "./components/projects-card";
export { DocumentDownloadCard } from "./components/document-download-card";
export { PdfViewer } from "./components/pdf-viewer";
```

- [ ] **Step 6: Verify in the browser**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all three pass. `/transparency` should now report as a dynamic route, not static.

Then drive the app per `.claude/skills/verify/SKILL.md` and confirm at `http://localhost:3000/transparency`:
- Budget reports, latest uploads, projects, and both legislative tables all render the seeded records.
- No `#` links remain in those blocks — records without files read "At the barangay hall".
- The search form's Search Database button navigates to `/transparency/legislative?q=…` (the route 404s until Task 6 — that is expected here).

- [ ] **Step 7: Commit**

```bash
git add src/features/transparency/components src/features/transparency/index.ts
git commit -m "feat(transparency): DB-backed disclosure grid, uploads, projects & legislative tables"
```

---

## Task 6: Legislative archive + search route

**Files:**
- Create: `src/app/(public)/transparency/legislative/page.tsx`
- Create: `src/features/transparency/components/legislative-archive.tsx`
- Modify: `src/features/transparency/index.ts`

**Interfaces:**
- Consumes: `searchLegislative`, `LEGISLATIVE_PAGE_SIZE` from Task 3.
- Produces: the `/transparency/legislative` route.

- [ ] **Step 1: Write the archive section**

Create `src/features/transparency/components/legislative-archive.tsx`:

```tsx
import Link from "next/link";
import { Search } from "lucide-react";
import type { LegislativeType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Section } from "@/components/ui/section";
import { formatDate } from "@/lib/format";
import { searchLegislative } from "@/features/transparency/queries";

const TYPE_TABS: { value: LegislativeType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ordinance", label: "Ordinances" },
  { value: "resolution", label: "Resolutions" },
];

function hrefFor(q: string, docType: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (docType !== "all") params.set("type", docType);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/transparency/legislative?${qs}` : "/transparency/legislative";
}

export async function LegislativeArchive({
  q,
  docType,
  page,
}: {
  q: string;
  docType: LegislativeType | "all";
  page: number;
}) {
  const { items, total, pageSize } = await searchLegislative({ q, docType, page });
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Section tone="white">
      <form action="/transparency/legislative" method="get" className="mb-8 flex flex-col gap-4 md:flex-row">
        {docType !== "all" ? <input type="hidden" name="type" value={docType} /> : null}
        <div className="relative w-full">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <label htmlFor="archive-search" className="sr-only">
            Search ordinances and resolutions
          </label>
          <Input
            id="archive-search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search by number, title, or keyword..."
            className="pl-12"
          />
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full whitespace-nowrap md:w-auto">
          Search
        </Button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {TYPE_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={hrefFor(q, tab.value, 1)}
            aria-current={docType === tab.value ? "page" : undefined}
            className={
              docType === tab.value
                ? "rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 hover:border-brand-400"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <p className="mb-4 text-sm text-ink-500">
        {total === 0
          ? "No documents found."
          : `${total} document${total === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}.`}
      </p>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-ink-50 p-8 text-center text-ink-600">
          No ordinances or resolutions match that search. Try a different number or keyword.
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((doc) => (
            <li key={doc.id} className="rounded-2xl border border-ink-200 p-6 transition-colors hover:border-brand-400">
              <Link href={`/transparency/legislative/${doc.slug}`} className="block">
                <p className="text-sm font-semibold uppercase tracking-wider text-ink-500">
                  {doc.number} · {formatDate(doc.dateApproved)}
                </p>
                <h3 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink-900">
                  {doc.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-ink-600">{doc.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-4">
          {page > 1 ? (
            <Link href={hrefFor(q, docType, page - 1)} className="font-semibold text-ink-900 hover:underline">
              ← Previous
            </Link>
          ) : null}
          <span className="text-sm text-ink-500">
            Page {page} of {lastPage}
          </span>
          {page < lastPage ? (
            <Link href={hrefFor(q, docType, page + 1)} className="font-semibold text-ink-900 hover:underline">
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </Section>
  );
}
```

- [ ] **Step 2: Write the route**

Create `src/app/(public)/transparency/legislative/page.tsx`:

```tsx
import type { Metadata } from "next";
import type { LegislativeType } from "@/types";
import { PageHero } from "@/components/sections/page-hero";
import { LegislativeArchive } from "@/features/transparency";

export const metadata: Metadata = {
  title: "Ordinances & Resolutions",
  description:
    "Searchable archive of ordinances and resolutions enacted by the Sangguniang Barangay of San Fernando.",
};

export default async function LegislativeArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const docType: LegislativeType | "all" =
    params.type === "ordinance" || params.type === "resolution" ? params.type : "all";
  const page = Number.parseInt(params.page ?? "1", 10);

  return (
    <>
      <PageHero
        title="Ordinances & Resolutions"
        description="Search the enacted legislation of the Sangguniang Barangay."
      />
      <LegislativeArchive
        q={params.q ?? ""}
        docType={docType}
        page={Number.isFinite(page) ? page : 1}
      />
    </>
  );
}
```

Check `src/components/sections/page-hero.tsx` for the exact prop names before writing this — match them, and remember the fixed-header clearance rule (`pt-32 md:pt-44` for text-first heroes) if `PageHero` does not already apply it.

- [ ] **Step 3: Export the section**

Add to `src/features/transparency/index.ts`:

```ts
export { LegislativeArchive } from "./components/legislative-archive";
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Drive the app and confirm:
- `/transparency/legislative` lists all 6 seeded records.
- `?q=curfew` returns exactly the curfew ordinance.
- `?q=waste` matches on summary text as well as title.
- `?type=resolution` narrows to 3 records and the tab is visually active.
- **`?q=%` returns 0 results, not everything** — this is the escaping check. Also try `?q=100%` and confirm it does not match every row.
- A search with no matches shows the empty state, not a blank page.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/transparency/legislative/page.tsx" src/features/transparency/components/legislative-archive.tsx src/features/transparency/index.ts
git commit -m "feat(transparency): searchable legislative archive route"
```

---

## Task 7: Legislative detail page

**Files:**
- Create: `src/app/(public)/transparency/legislative/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getPublishedLegislativeBySlug` (Task 3), `PdfViewer` and `DocumentDownloadCard` (Task 4).
- Produces: the `/transparency/legislative/[slug]` route.

- [ ] **Step 1: Write the route**

Create `src/app/(public)/transparency/legislative/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { formatDate } from "@/lib/format";
import { DocumentDownloadCard, PdfViewer } from "@/features/transparency";
import { getPublishedLegislativeBySlug } from "@/features/transparency/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getPublishedLegislativeBySlug(slug);
  if (!doc) return { title: "Document not found" };
  return {
    title: `${doc.number} — ${doc.title}`,
    description: doc.summary.slice(0, 160),
  };
}

export default async function LegislativeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = await getPublishedLegislativeBySlug(slug);
  if (!doc) notFound();

  return (
    <Section className="pt-32 md:pt-44">
      <Container>
        <Link
          href="/transparency/legislative"
          className="text-sm font-semibold text-ink-500 hover:text-ink-900 hover:underline"
        >
          ← Back to Ordinances &amp; Resolutions
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Badge variant={doc.docType === "ordinance" ? "soft" : "neutral"}>
            {doc.docType === "ordinance" ? "Ordinance" : "Resolution"}
          </Badge>
          <span className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            {doc.number}
          </span>
        </div>

        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
          {doc.title}
        </h1>
        <p className="mt-2 text-ink-500">Approved {formatDate(doc.dateApproved)}</p>

        {doc.summary ? (
          <div className="mt-8 max-w-3xl">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink-900">
              Summary
            </h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-600">{doc.summary}</p>
          </div>
        ) : null}

        <div className="mt-10">
          <h2 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Full Document
          </h2>
          <PdfViewer
            fileUrl={doc.fileUrl}
            title={`${doc.number} — ${doc.title}`}
            fileSizeBytes={doc.fileSizeBytes}
          />
          {doc.fileUrl ? (
            <div className="mt-4 max-w-lg">
              <DocumentDownloadCard
                fileUrl={doc.fileUrl}
                title={`${doc.number} — ${doc.title}`}
                fileSizeBytes={doc.fileSizeBytes}
              />
            </div>
          ) : null}
        </div>
      </Container>
    </Section>
  );
}
```

**Before pasting:** verify the real prop names of `Badge`, `Container` and `Section` against `src/components/ui/`, and check whether `Section` already renders a `Container` internally — if it does, drop the inner one rather than nesting two.

- [ ] **Step 2: Verify in the browser**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Drive the app and confirm:
- `/transparency/legislative/ordinance-no-05-2024-comprehensive-solid-waste-management-program` renders the number, title, approval date and summary.
- With no PDF attached, the Full Document block shows the "available at the barangay hall" note and **no viewer frame and no download button**.
- `/transparency/legislative/not-a-real-slug` returns the 404 page.
- A row's "View" link on `/transparency` reaches the right detail page.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/transparency/legislative/[slug]/page.tsx"
git commit -m "feat(transparency): legislative detail page with inline PDF viewer"
```

---

## Task 8: PDF upload action + uploader component

**Files:**
- Create: `src/features/admin/actions/documents.ts`
- Create: `src/features/admin/components/pdf-uploader.tsx`
- Modify: `src/features/admin/index.ts`

**Interfaces:**
- Consumes: `PUBLIC_DOCUMENTS_BUCKET`, `MAX_PDF_BYTES`, `ALLOWED_PDF_TYPES`, `documentUrl`, `formatFileSize` (Task 1).
- Produces: `uploadDocumentPdf(folder, formData) → { error, path, url, sizeBytes }`, `removeStoredDocument(path) → { error }`, and `<PdfUploader folder path sizeBytes previewUrl onChange />`.

- [ ] **Step 1: Write the upload action**

Size and type are re-checked server-side here even though the uploader checks them too — the client is never trusted (spec §4).

Create `src/features/admin/actions/documents.ts`:

```ts
"use server";

import { requirePermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_PDF_TYPES,
  MAX_PDF_BYTES,
  PUBLIC_DOCUMENTS_BUCKET,
  documentUrl,
} from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}
export interface UploadDocumentResult {
  error: string | null;
  /** Raw storage path to persist in file_path. */
  path: string | null;
  /** Resolved public URL, for immediate preview. */
  url: string | null;
  sizeBytes: number | null;
}

/**
 * Upload one PDF for a legislative record or transparency document.
 * Persisting the returned `path` and `sizeBytes` is the caller's job — this
 * keeps the action reusable across both tables without a discriminator,
 * mirroring uploadSingleImage in media.ts.
 */
export async function uploadDocumentPdf(
  folder: "legislative" | "documents",
  formData: FormData,
): Promise<UploadDocumentResult> {
  await requirePermission("manage-transparency");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF.", path: null, url: null, sizeBytes: null };
  }
  if (!ALLOWED_PDF_TYPES.includes(file.type as (typeof ALLOWED_PDF_TYPES)[number])) {
    return { error: "The document must be a PDF.", path: null, url: null, sizeBytes: null };
  }
  if (file.size > MAX_PDF_BYTES) {
    return { error: "The PDF must be 10 MB or smaller.", path: null, url: null, sizeBytes: null };
  }

  const path = `${folder}/${crypto.randomUUID()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(PUBLIC_DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (error) return { error: "Upload failed. Try again.", path: null, url: null, sizeBytes: null };

  return { error: null, path, url: documentUrl(path), sizeBytes: file.size };
}

/** Delete an owned storage object. A remote URL is left alone. */
export async function removeStoredDocument(path: string): Promise<ActionResult> {
  await requirePermission("manage-transparency");
  if (/^https?:\/\//i.test(path)) return { error: null };
  if (!/^(legislative|documents)\//.test(path)) {
    return { error: "That file cannot be removed." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(PUBLIC_DOCUMENTS_BUCKET).remove([path]);
  if (error) return { error: "Could not remove the file." };
  return { error: null };
}
```

- [ ] **Step 2: Write the uploader**

Create `src/features/admin/components/pdf-uploader.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { MAX_PDF_BYTES, formatFileSize } from "@/lib/storage";
import { uploadDocumentPdf } from "@/features/admin/actions/documents";

export function PdfUploader({
  folder,
  path,
  sizeBytes,
  previewUrl,
  onChange,
}: {
  folder: "legislative" | "documents";
  path: string | null;
  sizeBytes: number | null;
  previewUrl: string | null;
  onChange: (next: {
    path: string | null;
    sizeBytes: number | null;
    previewUrl: string | null;
  }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.type !== "application/pdf") {
      setError("The document must be a PDF.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("The PDF must be 10 MB or smaller.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const res = await uploadDocumentPdf(folder, fd);
      if (res.error) setError(res.error);
      else onChange({ path: res.path, sizeBytes: res.sizeBytes, previewUrl: res.url });
    });
  }

  return (
    <div className="space-y-3">
      {path ? (
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4">
          <FileText className="h-6 w-6 shrink-0 text-ink-900" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink-900">
              {previewUrl ? (
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Attached PDF
                </a>
              ) : (
                "Attached PDF"
              )}
            </span>
            <span className="text-sm text-ink-500">{formatFileSize(sizeBytes)}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange({ path: null, sizeBytes: null, previewUrl: null })}
            disabled={pending}
            aria-label="Remove PDF"
            className="rounded p-2 text-danger hover:bg-ink-100 disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            submit(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 hover:border-brand-400"
        >
          <Upload className="h-6 w-6" aria-hidden="true" />
          <span>
            {pending ? "Uploading…" : "Drag a PDF here or click to choose (PDF only, ≤ 10 MB)."}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              submit(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

**Deferred delete:** the remove button clears the form field only. The old storage object is deleted by the save action *after* the row update succeeds (Task 9), never before — the same ordering Plan 3 settled on for news photos, so a failed save cannot orphan a live record's file.

- [ ] **Step 3: Export the component**

Add `export { PdfUploader } from "./components/pdf-uploader";` to `src/features/admin/index.ts`, following the file's existing ordering convention.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions/documents.ts src/features/admin/components/pdf-uploader.tsx src/features/admin/index.ts
git commit -m "feat(admin): PDF upload action and uploader with 10MB guards"
```

---

## Task 9: Legislative admin queries + actions

**Files:**
- Create: `src/features/admin/queries/transparency.ts`
- Create: `src/features/admin/actions/legislative.ts`

**Interfaces:**
- Consumes: Task 2's admin types, Task 8's `removeStoredDocument`.
- Produces: `listAdminLegislative()`, `getLegislativeForEdit(id)`; actions `getLegislativeForEditAction(id)`, `saveLegislative(id, values)`, `setLegislativeStatus(id, status)`, `deleteLegislative(id)`.

- [ ] **Step 1: Write the admin queries**

Create `src/features/admin/queries/transparency.ts`:

```ts
import "server-only";
import type {
  AdminLegislativeRow,
  ContentStatus,
  LegislativeType,
  LegislativeValues,
} from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { documentUrl } from "@/lib/storage";

export async function listAdminLegislative(): Promise<AdminLegislativeRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select("id, slug, doc_type, number, title, date_approved, status, file_path")
    .order("date_approved", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    docType: row.doc_type as LegislativeType,
    number: row.number as string,
    title: row.title as string,
    dateApproved: row.date_approved as string,
    status: row.status as ContentStatus,
    hasFile: Boolean(row.file_path),
    fileUrl: row.file_path ? documentUrl(row.file_path as string) : null,
  }));
}

export async function getLegislativeForEdit(
  id: string,
): Promise<{ values: LegislativeValues; status: ContentStatus; fileUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select("doc_type, number, title, date_approved, summary, file_path, file_size_bytes, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    values: {
      docType: data.doc_type as LegislativeType,
      number: data.number as string,
      title: data.title as string,
      dateApproved: data.date_approved as string,
      summary: (data.summary as string) ?? "",
      filePath: (data.file_path as string) ?? null,
      fileSizeBytes: (data.file_size_bytes as number) ?? null,
    },
    status: data.status as ContentStatus,
    fileUrl: data.file_path ? documentUrl(data.file_path as string) : null,
  };
}
```

- [ ] **Step 2: Write the actions**

Create `src/features/admin/actions/legislative.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, LegislativeValues } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLegislativeForEdit } from "@/features/admin/queries/transparency";
import { removeStoredDocument } from "./documents";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

const schema = z.object({
  docType: z.enum(["ordinance", "resolution"]),
  number: z.string().trim().min(3, "Enter the official document number."),
  title: z.string().trim().min(3, "Enter a title."),
  dateApproved: z.string().trim().min(1, "Pick the date approved."),
  summary: z.string(),
  filePath: z.string().nullable(),
  fileSizeBytes: z.number().nullable(),
});

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function revalidate(slug?: string) {
  revalidatePath("/admin/transparency");
  revalidatePath("/transparency");
  revalidatePath("/transparency/legislative");
  if (slug) revalidatePath(`/transparency/legislative/${slug}`);
}

type SlugResult = { slug: string; error: null } | { slug: null; error: string };

/** Ensure a slug is unique, suffixing -2, -3… (ignoring the row being edited). */
async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
  ignoreId: string | null,
): Promise<SlugResult> {
  const { data, error } = await admin.from("legislative_documents").select("id, slug");
  if (error) return { slug: null, error: "Could not save the document. Try again." };
  const taken = new Set((data ?? []).filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return { slug: base, error: null };
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return { slug: candidate, error: null };
  }
}

/**
 * Client-callable counterpart to `getLegislativeForEdit` (which is
 * `server-only` and cannot be imported into the "use client" manager). The
 * manager fetches full detail — including `summary` and the file — only when
 * a drawer opens.
 */
export async function getLegislativeForEditAction(id: string) {
  await requirePermission("manage-transparency");
  return getLegislativeForEdit(id);
}

export async function saveLegislative(
  id: string | null,
  values: LegislativeValues,
): Promise<SaveResult> {
  const actor = await requirePermission("manage-transparency");
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };
  }

  const admin = createSupabaseAdminClient();
  const base = slugify(`${parsed.data.number} ${parsed.data.title}`);
  if (!base) return { error: "Enter a number and title with letters or numbers.", id: null };

  if (id) {
    const { data: existing, error: readErr } = await admin
      .from("legislative_documents")
      .select("status, slug, file_path")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { error: "Could not save the document.", id: null };
    if (!existing) return { error: "Document not found.", id: null };

    // Lock the slug once published — a published URL must not move under
    // anyone who has already shared or bookmarked it.
    const wasPublished = existing.status === "published";
    let slug = existing.slug as string;
    if (!wasPublished) {
      const slugResult = await uniqueSlug(admin, base, id);
      if (slugResult.error) return { error: slugResult.error, id: null };
      slug = slugResult.slug;
    }

    let query = admin
      .from("legislative_documents")
      .update({
        doc_type: parsed.data.docType,
        number: parsed.data.number,
        title: parsed.data.title,
        date_approved: parsed.data.dateApproved,
        summary: parsed.data.summary,
        file_path: parsed.data.filePath,
        file_size_bytes: parsed.data.fileSizeBytes,
        slug,
      })
      .eq("id", id);
    // The slug above was computed against the status just read. If that read
    // saw a non-published status, re-assert it in the WHERE: should the
    // document get published concurrently, this update must not silently
    // apply a slug computed against the now-stale status.
    if (!wasPublished) {
      query = query.in("status", ["draft", "in-review", "archived"]);
    }
    const { error } = await query;
    if (error) return { error: "Could not save the document.", id: null };

    // Deferred delete: only once the row no longer references the old file.
    const oldPath = existing.file_path as string | null;
    if (oldPath && oldPath !== parsed.data.filePath) {
      await removeStoredDocument(oldPath);
    }

    await recordActivity(actor, "updated document", "legislative document", id, parsed.data.number);
    revalidate(slug);
    return { error: null, id };
  }

  const slugResult = await uniqueSlug(admin, base, null);
  if (slugResult.error) return { error: slugResult.error, id: null };

  const { data, error } = await admin
    .from("legislative_documents")
    .insert({
      slug: slugResult.slug,
      doc_type: parsed.data.docType,
      number: parsed.data.number,
      title: parsed.data.title,
      date_approved: parsed.data.dateApproved,
      summary: parsed.data.summary,
      file_path: parsed.data.filePath,
      file_size_bytes: parsed.data.fileSizeBytes,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the document.", id: null };

  await recordActivity(
    actor,
    "created document",
    "legislative document",
    data.id,
    parsed.data.number,
  );
  revalidate(slugResult.slug);
  return { error: null, id: data.id };
}

/**
 * Move a document through draft → in-review → published → archived.
 * `published_at` is set once, on the first transition into published
 * (matching Plan 3); archiving is the normal path for a repealed ordinance.
 */
export async function setLegislativeStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const actor = await requirePermission("manage-transparency");
  const admin = createSupabaseAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("legislative_documents")
    .select("number, slug, published_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Document not found." };

  const patch: Record<string, unknown> = { status };
  if (status === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("legislative_documents").update(patch).eq("id", id);
  if (error) return { error: "Could not update the document." };

  await recordActivity(
    actor,
    `${status} document`,
    "legislative document",
    id,
    existing.number as string,
  );
  revalidate(existing.slug as string);
  return { error: null };
}

/**
 * Hard delete — for mistakes only. Archiving is the normal path (spec §6):
 * a repealed ordinance is legal history and must stay readable.
 */
export async function deleteLegislative(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-transparency");
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("legislative_documents")
    .select("number, slug, file_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("legislative_documents").delete().eq("id", id);
  if (error) return { error: "Could not delete the document." };

  if (existing?.file_path) await removeStoredDocument(existing.file_path as string);
  await recordActivity(
    actor,
    "deleted document",
    "legislative document",
    id,
    (existing?.number as string) ?? "",
  );
  revalidate((existing?.slug as string) ?? undefined);
  return { error: null };
}
```

Check `recordActivity`'s exact signature in `src/lib/audit.ts` and match it — the argument order above follows the `news-categories.ts` usage but verify before committing.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/queries/transparency.ts src/features/admin/actions/legislative.ts
git commit -m "feat(admin): legislative queries and workflow actions"
```

---

## Task 10: Documents, projects & categories — queries + actions

**Files:**
- Modify: `src/features/admin/queries/transparency.ts`
- Create: `src/features/admin/queries/transparency-categories.ts`
- Create: `src/features/admin/actions/transparency-documents.ts`
- Create: `src/features/admin/actions/transparency-projects.ts`
- Create: `src/features/admin/actions/transparency-categories.ts`

**Interfaces:**
- Produces: `listAdminTransparencyDocuments()`, `listAdminTransparencyProjects()`, `getTransparencyDocumentForEdit(id)`, `listTransparencyCategories()`; actions `saveTransparencyDocument`, `setTransparencyDocumentStatus`, `deleteTransparencyDocument`, `getTransparencyDocumentForEditAction`, `saveTransparencyProject`, `setTransparencyProjectStatus`, `deleteTransparencyProject`, `moveTransparencyProject`, `createTransparencyCategory`, `renameTransparencyCategory`, `setTransparencyCategoryActive`, `moveTransparencyCategory`.

- [ ] **Step 1: Extend the admin queries**

Append to `src/features/admin/queries/transparency.ts`:

```ts
import type {
  AdminTransparencyDocumentRow,
  AdminTransparencyProjectRow,
  TransparencyDocumentValues,
} from "@/types";

export async function listAdminTransparencyDocuments(): Promise<AdminTransparencyDocumentRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select("id, title, category_id, date_released, status, file_path, transparency_categories(label)")
    .order("date_released", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as {
    id: string;
    title: string;
    category_id: string;
    date_released: string;
    status: ContentStatus;
    file_path: string | null;
    transparency_categories: { label: string } | null;
  }[]).map((row) => ({
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    categoryLabel: row.transparency_categories?.label ?? "Document",
    dateReleased: row.date_released,
    status: row.status,
    hasFile: Boolean(row.file_path),
    fileUrl: row.file_path ? documentUrl(row.file_path) : null,
  }));
}

export async function getTransparencyDocumentForEdit(
  id: string,
): Promise<{ values: TransparencyDocumentValues; status: ContentStatus; fileUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select("title, category_id, date_released, file_path, file_size_bytes, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    values: {
      title: data.title as string,
      categoryId: data.category_id as string,
      dateReleased: data.date_released as string,
      filePath: (data.file_path as string) ?? null,
      fileSizeBytes: (data.file_size_bytes as number) ?? null,
    },
    status: data.status as ContentStatus,
    fileUrl: data.file_path ? documentUrl(data.file_path as string) : null,
  };
}

export async function listAdminTransparencyProjects(): Promise<AdminTransparencyProjectRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_projects")
    .select("id, name, progress, sort_order, status")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    progress: row.progress as number,
    sortOrder: row.sort_order as number,
    status: row.status as ContentStatus,
  }));
}
```

Merge the new `import type` names into the file's existing type import rather than adding a second import statement.

- [ ] **Step 2: Write the categories query**

Create `src/features/admin/queries/transparency-categories.ts`:

```ts
import "server-only";
import type { TransparencyCategoryRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function listTransparencyCategories(): Promise<TransparencyCategoryRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_categories")
    .select("id, label, icon_name, sort_order, is_active")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    label: row.label as string,
    iconName: row.icon_name as string,
    sortOrder: row.sort_order as number,
    isActive: row.is_active as boolean,
  }));
}
```

- [ ] **Step 3: Write the documents actions**

Create `src/features/admin/actions/transparency-documents.ts`, following `legislative.ts` from Task 9 with these differences: no slug (so no `uniqueSlug` and no published-slug lock), the Zod schema is

```ts
const schema = z.object({
  title: z.string().trim().min(3, "Enter a title."),
  categoryId: z.string().trim().min(1, "Pick a category."),
  dateReleased: z.string().trim().min(1, "Pick the date released."),
  filePath: z.string().nullable(),
  fileSizeBytes: z.number().nullable(),
});
```

and `saveTransparencyDocument` must **verify the category exists before writing** — never trust `categoryId` from the client, exactly as `saveNewsArticle` does:

```ts
const { data: cat, error: catErr } = await admin
  .from("transparency_categories")
  .select("id")
  .eq("id", parsed.data.categoryId)
  .maybeSingle();
if (catErr) return { error: "Could not save the document. Try again.", id: null };
if (!cat) return { error: "Pick a valid category.", id: null };
```

`revalidate()` for this file covers `/admin/transparency` and `/transparency` only (documents have no slug page). Include the same deferred-delete of a replaced `file_path`, the same `published_at`-set-once logic in `setTransparencyDocumentStatus`, and a `deleteTransparencyDocument` that removes the stored file after the row delete. Export `getTransparencyDocumentForEditAction` wrapping the query with `requirePermission("manage-transparency")`.

- [ ] **Step 4: Write the projects actions**

Create `src/features/admin/actions/transparency-projects.ts` with `saveTransparencyProject(id, values)`, `setTransparencyProjectStatus(id, status)`, `deleteTransparencyProject(id)` and `moveTransparencyProject(id, direction)`. Schema:

```ts
const schema = z.object({
  name: z.string().trim().min(3, "Enter a project name."),
  progress: z.number().int().min(0, "Progress must be 0–100.").max(100, "Progress must be 0–100."),
});
```

`moveTransparencyProject` is a direct copy of `moveNewsCategory` in `src/features/admin/actions/news-categories.ts` with the table name changed — including its comment explaining why the two swap updates are deliberately not transactional. On create, set `sort_order` to `max(sort_order) + 1` as `createNewsCategory` does. Gate every action on `requirePermission("manage-transparency")`, record activity, and revalidate `/admin/transparency` and `/transparency`.

- [ ] **Step 5: Write the categories actions**

Create `src/features/admin/actions/transparency-categories.ts` as a direct port of `src/features/admin/actions/news-categories.ts`:

- Table `transparency_categories` instead of `news_categories`.
- Every action gated on `requireSuperAdmin()` (unchanged from the source).
- Schema gains `iconName: z.string().trim().min(1, "Pick an icon.")`, persisted to `icon_name`; `createTransparencyCategory` and `renameTransparencyCategory` both write it.
- Revalidate `/admin/transparency` and `/transparency` instead of `/admin/news` and `/announcements`.
- Keep the reject-on-collision behaviour and its comment: the id is a stable FK for `transparency_documents.category_id`, so auto-suffixing would be confusing rather than helpful.
- Keep `setTransparencyCategoryActive` with no delete action — `transparency_documents.category_id` references these rows.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/queries/transparency.ts src/features/admin/queries/transparency-categories.ts src/features/admin/actions/transparency-documents.ts src/features/admin/actions/transparency-projects.ts src/features/admin/actions/transparency-categories.ts
git commit -m "feat(admin): transparency document, project and category actions"
```

---

## Task 11: Admin UI — tabbed manager, forms, panels, route

**Files:**
- Modify: `src/features/admin/components/legislative-manager.tsx`
- Modify: `src/features/admin/components/legislative-form.tsx`
- Create: `src/features/admin/components/transparency-manager.tsx`
- Create: `src/features/admin/components/transparency-document-form.tsx`
- Create: `src/features/admin/components/transparency-projects-panel.tsx`
- Create: `src/features/admin/components/transparency-categories-panel.tsx`
- Create: `src/app/admin/(portal)/transparency/page.tsx`
- Delete: `src/app/admin/(portal)/legislative/page.tsx`
- Modify: `src/features/admin/data.ts`, `src/features/admin/index.ts`, `src/lib/icon-map.ts`

**Interfaces:**
- Consumes: every action and query from Tasks 9–10, `PdfUploader` from Task 8.
- Produces: the `/admin/transparency` route.

Confirm the exact admin route-group path first — `src/app/admin/(portal)/news/page.tsx` is the reference. If the group is named differently, follow the real one.

- [ ] **Step 1: Rewire the legislative manager**

Rework `src/features/admin/components/legislative-manager.tsx`:

- Props become `{ documents: AdminLegislativeRow[] }`; delete the `ADMIN_LEGISLATIVE` import and the `indexById` `useMemo` that depended on it (key the `#` column off the filtered index instead).
- Swap `AdminLegislativeRecord` for `AdminLegislativeRow` and `record.document.*` for the flattened fields (`record.number`, `record.title`, `record.dateApproved`).
- The status filter options become the four `ContentStatus` values — reuse the `STATUS_OPTIONS` array shape from `news-manager.tsx`.
- The stat cards become Total Ordinances / Total Resolutions / **Drafts & In Review** (`status === "draft" || status === "in-review"`).
- Opening an edit drawer calls `getLegislativeForEditAction(id)` inside a transition and shows a loading state on the row, exactly as `NewsManager` does with `getNewsArticleForEditAction`.
- `handleSaved` calls `router.refresh()` and toasts "Document saved." — the faked `"Saved — demo only, backend pending."` string must go.
- Add a File column rendering "PDF" when `hasFile`, "—" otherwise.

Rework `src/features/admin/components/legislative-form.tsx` to submit `LegislativeValues` through `saveLegislative`, with fields: type select (Ordinance/Resolution), number, title, date approved (`type="date"`), summary textarea, and `<PdfUploader folder="legislative" … />`. Add status-transition buttons (Save Draft / Submit for Review / Publish / Archive) calling `setLegislativeStatus`, and a delete button behind a confirm, mirroring `news-form.tsx`'s layout and error handling.

- [ ] **Step 2: Write the documents form**

Create `src/features/admin/components/transparency-document-form.tsx` mirroring the reworked `legislative-form.tsx`: title, category select (from `TransparencyCategoryRow[]`, filtered to `isActive` for new records but always including the current value when editing so an archived record's retired category still displays), date released, and `<PdfUploader folder="documents" … />`, wired to `saveTransparencyDocument` / `setTransparencyDocumentStatus` / `deleteTransparencyDocument`.

- [ ] **Step 3: Write the projects panel**

Create `src/features/admin/components/transparency-projects-panel.tsx`: a `"use client"` card listing `AdminTransparencyProjectRow[]` with name, a 0–100 number input for progress, a status chip, up/down reorder buttons calling `moveTransparencyProject`, publish/archive buttons calling `setTransparencyProjectStatus`, a delete behind a confirm, and an inline add row calling `saveTransparencyProject(null, …)`. Model the layout on `assistance-categories-panel.tsx`.

- [ ] **Step 4: Write the categories panel**

Create `src/features/admin/components/transparency-categories-panel.tsx` as a direct port of `src/features/admin/components/news-categories-panel.tsx`, pointed at the Task 10 category actions and with an icon `<select>` sourced from `ICON_OPTIONS` in `src/lib/icon-map.ts`.

If any seeded `icon_name` is missing from `ICONS` in `src/lib/icon-map.ts`, add it there — the seed uses `receipt`, `gavel`, `landmark` and `file-check`, all of which are already present, so this should be a no-op. `resolveIcon()` already falls back to `FileText` for anything unknown.

- [ ] **Step 5: Write the tab shell**

Create `src/features/admin/components/transparency-manager.tsx`, a `"use client"` component owning `const [tab, setTab] = useState<Tab>("legislative")` where `type Tab = "legislative" | "documents" | "projects"`. Copy the tab-button markup and the filter-reset-on-switch behaviour from `news-manager.tsx` (`switchTab`). It renders `<AdminPageHeader title="Transparency" description="Manage ordinances, resolutions, public documents, and project monitoring." />` and then the active tab's content.

- [ ] **Step 6: Write the route and update navigation**

Create `src/app/admin/(portal)/transparency/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { TransparencyManager, TransparencyCategoriesPanel } from "@/features/admin";
import {
  listAdminLegislative,
  listAdminTransparencyDocuments,
  listAdminTransparencyProjects,
} from "@/features/admin/queries/transparency";
import { listTransparencyCategories } from "@/features/admin/queries/transparency-categories";

export const metadata: Metadata = { title: "Transparency" };

export default async function AdminTransparencyPage() {
  const user = await requirePermission("manage-transparency");
  const [documents, files, projects, categories] = await Promise.all([
    listAdminLegislative(),
    listAdminTransparencyDocuments(),
    listAdminTransparencyProjects(),
    listTransparencyCategories(),
  ]);
  return (
    <>
      <TransparencyManager
        legislative={documents}
        documents={files}
        projects={projects}
        categories={categories}
      />
      {user.isSuperAdmin ? (
        <div className="mt-8">
          <TransparencyCategoriesPanel categories={categories} />
        </div>
      ) : null}
    </>
  );
}
```

Delete `src/app/admin/(portal)/legislative/page.tsx`.

In `src/features/admin/data.ts`:
- Replace the nav entry `{ label: "Ordinance & Resolution", href: "/admin/legislative", icon: Scale }` with `{ label: "Transparency", href: "/admin/transparency", icon: FileStack, permission: "manage-transparency" }` and import `FileStack` from `lucide-react` (if that icon does not exist in the installed version, use `Files`). Note the old entry had **no permission** — it was ungated; the new one is gated.
- Update `CONTENT_TYPE_ACTIONS`'s "Ordinance / Resolution" entry `href` to `/admin/transparency`.

Add the four new components to `src/features/admin/index.ts`.

- [ ] **Step 7: Verify in the browser**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass.

Drive the app signed in as a SuperAdmin and confirm:
- `/admin/legislative` 404s; `/admin/transparency` loads with three working tabs.
- Creating a legislative record as a draft leaves `/transparency` unchanged; publishing it makes it appear there without a manual restart.
- Uploading a real PDF attaches it; the detail page then shows the inline viewer and a Download button.
- Replacing that PDF with another leaves the record pointing at the new file and the old object gone from the bucket.
- **Uploading a `.png` is rejected, and a PDF over 10MB is rejected** — check both, and confirm the server-side check by watching the action's response, not just the client-side guard.
- The categories panel adds, renames, reorders and retires; a retired category disappears from the new-document picker but existing documents keep their label.
- Signed in as a user **without** `manage-transparency`, `/admin/transparency` redirects to `/admin` and the sidebar entry is hidden.

- [ ] **Step 8: Commit**

```bash
git add src/features/admin "src/app/admin/(portal)/transparency/page.tsx" src/lib/icon-map.ts
git rm "src/app/admin/(portal)/legislative/page.tsx"
git commit -m "feat(admin): DB-backed tabbed transparency manager with PDF upload"
```

---

## Task 12: Remove the mocks and update the handoff doc

**Files:**
- Delete: `src/features/transparency/data.ts`
- Modify: `src/types/index.ts`, `src/features/admin/data.ts`, `src/features/transparency/components/transparency-hero.tsx`, `docs/BACKEND_HANDOFF.md`

Do this only after Task 11 is verified — these deletions are safe exactly when nothing imports them.

- [ ] **Step 1: Confirm nothing imports the mocks**

Run:

```bash
grep -rn "transparency/data\|ADMIN_LEGISLATIVE\|AdminLegislativeRecord\|AdminLegislativeStatus\|LegislativeFormValues\|ProjectStatus\|TransparencyDocument\b\|LegislativeDocument\b\|NewsArticle\b" src/
```

Expected: the only hits are the declarations themselves (plus `HERO_IMAGE` in `transparency-hero.tsx`). Any other hit means a consumer was missed — fix it before deleting.

- [ ] **Step 2: Delete the mocks**

- Move `HERO_IMAGE`'s value inline into `src/features/transparency/components/transparency-hero.tsx` as a local `const`, then delete `src/features/transparency/data.ts`. (It stays an `lh3` URL — migrating the site's remaining hotlinked images is separate outstanding work, `BACKEND_HANDOFF.md` §3D.)
- Remove `ADMIN_LEGISLATIVE` from `src/features/admin/data.ts` and any now-unused imports it leaves behind.
- Remove from `src/types/index.ts`: `LegislativeDocument`, `TransparencyDocument`, `ProjectStatus`, `AdminLegislativeRecord`, `AdminLegislativeStatus`, `LegislativeFormValues`, and the dead `NewsArticle` interface. Remove `AdminLegislativeStatus` from the `StatusChip` status union — `ContentStatus` already covers every value the chip renders.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. Then reload `/transparency` and `/admin/transparency` and confirm both still render — a stale import would have failed the build, but the hero image is a runtime-only concern.

- [ ] **Step 4: Update the handoff doc**

In `docs/BACKEND_HANDOFF.md`:
- Add a `> **Updated 2026-07-20 (transparency documents):**` changelog entry at the end of the header block, following the shape of the Plan 3 entry: tables added, the `public-documents` bucket and its 10MB PDF cap, the new routes, the `/admin/legislative` → `/admin/transparency` move and its permission gate, the search-escaping note, and which mocks and types were deleted.
- Mark §3C item 2 (transparency documents) as **BUILT 2026-07-20**, like item 1.
- Update §3E item 4 — `LegislativeManager` is no longer "the one editor still waiting".
- Update the §1 Current State table (Backend and Images rows) and the Routes tables with the three new public routes and the renamed admin route.
- Update §2: remove the deleted type rows, add the new ones.
- Update §6: strike the resolved gaps (the `#` `fileUrl`s, the dead `NewsArticle`), and note that the seeded transparency records still need real PDFs and an editorial pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/features/admin/data.ts src/features/transparency docs/BACKEND_HANDOFF.md
git rm src/features/transparency/data.ts
git commit -m "refactor(transparency): remove mock data now that every read hits the DB"
```

---

## Done

After Task 12, `/transparency` and `/admin/transparency` are fully DB-backed, no `#` download links remain on the page, and build-order step 7 is complete. The next plan is **2D (notifications)** — still blocked on a Resend account.
