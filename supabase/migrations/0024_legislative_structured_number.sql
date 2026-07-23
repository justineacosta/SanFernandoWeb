-- 0024 — structured legislative document numbers
--
-- `number` was free text an encoder typed by hand ("Ordinance No. 05-2024"),
-- which could not be sorted: localeCompare buries the year behind the
-- sequence, so "Ordinance No. 11-2023" sorted after "Ordinance No. 05-2024".
-- Type was also retyped into a string the doc_type enum already held, with
-- nothing checking the two agreed.
--
-- Number and year become integer columns. `number` stays as the composed
-- display string, written by saveLegislative via formatLegislativeNumber() —
-- a generated column would need doc_type::text, and the enum-to-text cast is
-- STABLE rather than IMMUTABLE, which Postgres may refuse in a generation
-- expression.
--
-- The backfill has no fallback on purpose. If a row's number cannot be
-- parsed, the `set not null` in step 3 fails and this whole transaction rolls
-- back. Applied by hand against a live database, a loud failure beats writing
-- seq_no = 0 onto a real ordinance.

begin;

-- 1. New columns, nullable until the backfill has run.
alter table public.legislative_documents
  add column seq_no int,
  add column year   int;

-- 2. Backfill from the existing "<type> No. <seq>-<year>" text.
update public.legislative_documents
set seq_no = (regexp_match(number, '(\d+)\s*-\s*(\d{4})'))[1]::int,
    year   = (regexp_match(number, '(\d+)\s*-\s*(\d{4})'))[2]::int
where number ~ '(\d+)\s*-\s*(\d{4})';

-- 3. Constrain. A row the regex above missed fails here and aborts.
alter table public.legislative_documents
  alter column seq_no set not null,
  alter column year   set not null,
  add constraint legislative_documents_seq_no_range
    check (seq_no > 0 and seq_no < 10000),
  add constraint legislative_documents_year_range
    check (year between 1900 and 2200),
  add constraint legislative_documents_number_unique
    unique (doc_type, year, seq_no);

-- 4. Rewrite every number into the composed format. Mirrors
--    formatLegislativeNumber() in src/lib/legislative-number.ts.
update public.legislative_documents
set number = initcap(doc_type::text)
          || ' No. ' || lpad(seq_no::text, 2, '0')
          || ', '    || year::text;

-- 5. Index matching the new public ordering: newest year first, counting up.
create index legislative_documents_type_status_year_seq_idx
  on public.legislative_documents (doc_type, status, year desc, seq_no asc);

-- 6. Public browse RPC — same body and same return shape as 0016, ordered by
--    the structured columns instead of date_approved.
create or replace function public.search_legislative_documents(
  p_q        text default '',
  p_doc_type text default null,
  p_limit    int  default 10,
  p_offset   int  default 0
)
returns table (
  id              uuid,
  slug            text,
  doc_type        public.legislative_type,
  number          text,
  title           text,
  summary         text,
  date_approved   date,
  file_path       text,
  file_size_bytes int,
  total_count     bigint
)
language sql
stable
as $$
  select
    d.id, d.slug, d.doc_type, d.number, d.title, coalesce(d.summary, '') as summary,
    d.date_approved, d.file_path, d.file_size_bytes,
    count(*) over () as total_count
  from public.legislative_documents d
  where d.status = 'published'
    and (p_doc_type is null or d.doc_type = p_doc_type::public.legislative_type)
    and public.fuzzy_match(
          d.number || ' ' || d.title || ' ' || coalesce(d.summary, ''),
          p_q
        )
  order by d.year desc, d.seq_no asc, d.id desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

revoke execute on function public.search_legislative_documents(text, text, int, int)
  from anon, authenticated;

commit;
