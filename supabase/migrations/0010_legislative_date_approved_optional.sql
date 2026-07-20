-- Allow uploading an ordinance/resolution before it is approved (spec: repo
-- owner request 2026-07-21). The draft PDF, its number and its title all
-- exist ahead of the approval date, so `date_approved` can no longer be a
-- required field — the admin flow needs to save a document with no date and
-- show it as "Pending Approval" until one is entered.
--
-- No backfill needed: every existing row already has a date_approved value,
-- so relaxing the NOT NULL constraint changes nothing for current data.
--
-- Ordering: `legislative_documents_status_date_idx` and
-- `legislative_documents_type_status_date_idx` (0009_transparency.sql) are
-- `(..., date_approved desc)`. Postgres already sorts NULLs first on a DESC
-- index by default, which matches the product decision that pending
-- (undated) documents sort above approved ones — but the app code now states
-- that explicitly via `nullsFirst` rather than relying on the default, so
-- these indexes need `nulls first` too for the planner to use them for that
-- exact ordering.
alter table public.legislative_documents
  alter column date_approved drop not null;

drop index if exists public.legislative_documents_status_date_idx;
create index legislative_documents_status_date_idx
  on public.legislative_documents (status, date_approved desc nulls first);

drop index if exists public.legislative_documents_type_status_date_idx;
create index legislative_documents_type_status_date_idx
  on public.legislative_documents (doc_type, status, date_approved desc nulls first);
