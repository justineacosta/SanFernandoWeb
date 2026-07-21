-- Fuzzy search for the Audit Logs table (portal overhaul; pulled forward from
-- sub-project 4 at the owner's request).
--
-- Why an RPC and not a PostgREST filter: PostgREST cannot express pg_trgm's
-- similarity operators, and the matching below is per-term rather than
-- per-row, so it has to live in SQL. `searchAuditLog()` in
-- src/features/admin/queries/audit.ts calls this and nothing else.
--
-- Matching strategy — a row matches only if EVERY search term matches it
-- somehow (AND across terms, so "juan dela" narrows rather than widens).
-- Each term matches by any of three routes, because no single one covers all
-- the cases the owner asked for:
--
--   1. substring        "cert"   -> "certificate"        (prefixes/partials)
--   2. levenshtein      "offcal" -> "official"           (typos, transpositions)
--   3. word_similarity  general trigram recall for anything the first two miss
--
-- Levenshtein is what actually carries the misspelling case: "offcal" and
-- "official" share only one trigram ("off"), so trigram similarity alone
-- scores them too low to match. Edit distance sees them as 2 apart.

create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch;

-- Trigram index over the same concatenation the function searches, so the
-- substring and similarity routes stay indexable as the table grows.
create index if not exists audit_log_search_trgm_idx
  on public.audit_log using gin (
    (
      lower(
        actor_name || ' ' ||
        coalesce(entity_label, '') || ' ' ||
        entity_type || ' ' ||
        action || ' ' ||
        coalesce(entity_id, '')
      )
    ) gin_trgm_ops
  );

/**
 * Paginated fuzzy search over the audit log.
 *
 * Returns the page's rows plus total_count (a window function over the full
 * match set) so the caller gets rows and pagination in one round trip.
 *
 * SECURITY INVOKER (the default) is deliberate: audit_log has RLS enabled with
 * no policies, so this returns nothing for anon/authenticated even if they
 * reach it. Only the service-role client — used behind requireSuperAdmin() —
 * sees rows.
 */
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
    with terms as (
      select t
      from unnest(regexp_split_to_array(lower(btrim(coalesce($1, ''))), '\s+')) as t
      where t <> ''
    ),
    candidates as (
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
    ),
    matched as (
      select c.*
      from candidates c
      where not exists (
        -- A row is excluded the moment ONE term fails to match it.
        select 1
        from terms
        where not (
             c.haystack like '%%' || terms.t || '%%'
          or word_similarity(terms.t, c.haystack) >= 0.45
          or exists (
               select 1
               from regexp_split_to_table(c.haystack, '\s+') as w
               where w <> ''
                 and levenshtein(terms.t, w) <= (case when length(terms.t) <= 4 then 1 else 2 end)
             )
        )
      )
    )
    select
      m.id, m.actor_name, m.action_type, m.action, m.entity_type,
      m.entity_id, m.entity_label, m.detail, m.created_at,
      count(*) over () as total_count
    from matched m
    -- id desc is a stable tiebreak: rows written in one transaction share a
    -- created_at, and without it pagination can repeat or drop rows.
    order by %I %s, m.id desc
    limit $3 offset $4
  $sql$, v_sort, v_dir)
  using p_q, p_type, greatest(p_limit, 1), greatest(p_offset, 0);
end $$;

-- The audit log is SuperAdmin-only and reached through the service-role
-- client. Nothing else should be able to invoke this.
revoke execute on function public.search_audit_log(text, text, text, text, int, int)
  from public, anon, authenticated;
