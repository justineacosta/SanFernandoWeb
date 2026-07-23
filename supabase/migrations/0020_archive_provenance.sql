-- Archive provenance: when a record was archived, and by whom.
--
-- Sub-project 6 (docs/superpowers/specs/2026-07-22-archive-restore-design.md).
-- The audit log already records every archive with an actor and a timestamp,
-- but it is SuperAdmin-only — so the staff member actually looking at the
-- Archived view, who holds the module permission and nothing more, cannot see
-- why a record is sitting there or how long it has been. These two columns put
-- that on the row itself.
--
-- `archived_by` is ON DELETE SET NULL for the same reason `inquiries.handled_by`
-- is: removing a staff account must never remove the record they archived. The
-- audit log remains the durable record of who did what.
--
-- Both columns are nullable and stay null for every live record. They are set
-- by the archive actions and cleared by the restore actions, so a record that
-- has been brought back does not keep claiming it is archived.

alter table public.news_articles
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

alter table public.announcements
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

alter table public.events
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

alter table public.officials
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

alter table public.legislative_documents
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

alter table public.transparency_documents
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

alter table public.transparency_projects
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

-- Backfill: rows archived before this migration have no provenance to recover
-- (the audit log has it, but matching entry to row is not reliable enough to
-- write into the record). They keep NULLs, and the Archived view says
-- "archived before 22 July 2026" rather than inventing a date.
