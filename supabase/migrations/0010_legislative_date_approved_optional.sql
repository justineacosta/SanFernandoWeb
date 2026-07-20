-- Allow uploading an ordinance/resolution before it is approved (spec: repo
-- owner request 2026-07-21). The draft PDF, its number and its title all
-- exist ahead of the approval date, so `date_approved` can no longer be a
-- required field — the admin flow needs to save a document with no date and
-- show it as "Pending Approval" until one is entered.
--
-- No backfill needed: every existing row already has a date_approved value,
-- so relaxing the NOT NULL constraint changes nothing for current data.
--
-- Ordering: pending (undated) documents sort above approved ones. Postgres
-- already defaults a DESC index — and a DESC `ORDER BY` — to NULLS FIRST, so
-- the original 0009 indexes (`(..., date_approved desc)`) already serve this
-- exact ordering; the app query's explicit `desc nulls first` matches what the
-- default already does. The indexes are recreated with an explicit `nulls
-- first` below purely so the index definition mirrors the query verbatim and
-- the null-ordering intent is stated rather than inherited — it is NOT a
-- correctness fix (the physical index is unchanged) and could be dropped
-- without affecting the plan.
alter table public.legislative_documents
  alter column date_approved drop not null;

drop index if exists public.legislative_documents_status_date_idx;
create index legislative_documents_status_date_idx
  on public.legislative_documents (status, date_approved desc nulls first);

drop index if exists public.legislative_documents_type_status_date_idx;
create index legislative_documents_type_status_date_idx
  on public.legislative_documents (doc_type, status, date_approved desc nulls first);
