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
