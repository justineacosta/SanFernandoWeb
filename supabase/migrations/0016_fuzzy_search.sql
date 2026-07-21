-- Fuzzy search, sub-project 4: one reusable match predicate, plus the public
-- legislative browse page moved onto it.
--
-- Migration 0015 inlined the matching CTE inside search_audit_log. The owner's
-- requirement covers "all future tables", and copying that block into every new
-- search function would guarantee the definitions drift apart. This extracts it
-- once and rewrites search_audit_log to call it, so exactly one definition of
-- "matches" exists in the database.

create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch;

/**
 * True when EVERY whitespace-separated term in p_q matches p_haystack.
 * An empty or null query matches everything.
 *
 * Each term matches by any of three routes, because no single one covers all
 * the cases asked for:
 *
 *   1. substring        "cert"   -> "certificate"        (prefixes/partials)
 *   2. levenshtein      "offcal" -> "official"           (typos, transpositions)
 *   3. word_similarity  general trigram recall for anything the first two miss
 *
 * Levenshtein is what carries the misspelling case: "offcal" and "official"
 * share only one trigram ("off"), so trigram similarity alone scores them too
 * low. Edit distance sees them as 2 apart. Distance is measured against
 * individual WORDS rather than the whole haystack — against a long
 * concatenated string, the budget needed to accept a transposed surname also
 * accepts unrelated words.
 *
 * Deliberately `language sql` and a single SELECT: Postgres inlines such
 * functions into the calling query, so the trigram indexes below stay
 * eligible. A plpgsql body would be a per-row black box and force a seq scan.
 */
create or replace function public.fuzzy_match(p_haystack text, p_q text)
returns boolean
language sql
stable
as $$
  select
    coalesce(btrim(p_q), '') = ''
    or not exists (
      -- Excluded the moment ONE term fails to match.
      select 1
      from unnest(regexp_split_to_array(lower(btrim(p_q)), '\s+')) as t
      where t <> ''
        and not (
             lower(coalesce(p_haystack, '')) like '%' || t || '%'
          or word_similarity(t, lower(coalesce(p_haystack, ''))) >= 0.45
          or exists (
               select 1
               from regexp_split_to_table(lower(coalesce(p_haystack, '')), '\s+') as w
               where w <> ''
                 and levenshtein(t, w) <= (case when length(t) <= 4 then 1 else 2 end)
             )
        )
    );
$$;

/* ── search_audit_log: same signature and behaviour, one less copy of the
      predicate. Privileges survive CREATE OR REPLACE, so the 0015 revoke stays
      in force; it is re-issued at the bottom rather than relied upon. ─────── */

create or replace function public.search_audit_log(
  p_q      text default '',
  p_type   text default null,
  p_sort   text default 'created_at',
  p_dir    text default 'desc',
  p_limit  int  default 10,
  p_offset int  default 0
)
returns table (
  id           bigint,
  actor_name   text,
  action_type  public.audit_action,
  action       text,
  entity_type  text,
  entity_id    text,
  entity_label text,
  detail       text,
  created_at   timestamptz,
  total_count  bigint
)
language plpgsql
stable
as $$
declare
  -- Whitelisted, so format(%I) below cannot be an injection vector even
  -- though p_sort arrives from a URL query string.
  v_sort text := case p_sort
                   when 'actor_name'  then 'actor_name'
                   when 'action_type' then 'action_type'
                   when 'entity_type' then 'entity_type'
                   else 'created_at'
                 end;
  v_dir  text := case when lower(coalesce(p_dir, '')) = 'asc' then 'asc' else 'desc' end;
begin
  return query execute format($sql$
    with candidates as (
      select
        l.*,
        lower(
          l.actor_name || ' ' ||
          coalesce(l.entity_label, '') || ' ' ||
          l.entity_type || ' ' ||
          l.action || ' ' ||
          coalesce(l.entity_id, '')
        ) as haystack
      from public.audit_log l
      where $2 is null or l.action_type = $2::public.audit_action
    )
    select
      c.id, c.actor_name, c.action_type, c.action, c.entity_type,
      c.entity_id, c.entity_label, c.detail, c.created_at,
      count(*) over () as total_count
    from candidates c
    where public.fuzzy_match(c.haystack, $1)
    -- id desc is a stable tiebreak: rows written in one transaction share a
    -- created_at, and without it pagination can repeat or drop rows.
    order by %I %s, c.id desc
    limit $3 offset $4
  $sql$, v_sort, v_dir)
  using p_q, p_type, greatest(p_limit, 1), greatest(p_offset, 0);
end $$;

/* ── Public legislative browse (/transparency/legislative) ───────────────── */

create index if not exists legislative_documents_search_trgm_idx
  on public.legislative_documents using gin (
    (lower(number || ' ' || title || ' ' || coalesce(summary, ''))) gin_trgm_ops
  );

/**
 * Paginated fuzzy search over PUBLISHED legislative documents.
 *
 * The status filter lives here rather than in the caller so the public
 * boundary stays in one place — this function can only ever return rows the
 * public may already read.
 *
 * Undated ("pending") documents sort first, matching listRecentLegislative()
 * and the 2026-07-20 decision recorded in migration 0010.
 */
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
  order by d.date_approved desc nulls first, d.id desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- Every RPC in this codebase is reached through the service-role client behind
-- an explicit code check. search_legislative_documents returns only published
-- rows so exposing it would not leak, but one function opting out of the
-- convention invites the next one to.
revoke execute on function public.search_audit_log(text, text, text, text, int, int)
  from public, anon, authenticated;
revoke execute on function public.search_legislative_documents(text, text, int, int)
  from public, anon, authenticated;
revoke execute on function public.fuzzy_match(text, text)
  from public, anon, authenticated;
