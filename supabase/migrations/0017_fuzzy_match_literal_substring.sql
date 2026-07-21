-- Fix: fuzzy_match's substring route treated the user's query as a LIKE
-- pattern, so `%` and `_` in a search term acted as wildcards.
--
-- Found during verification of 0016, by calling the predicate directly:
--
--   fuzzy_match('Ordinance 11-2023', '_')          -> true
--   fuzzy_match('totally unrelated text', '_')     -> true   (matches EVERY row)
--   fuzzy_match('Ordinance 11-2023', 'o_dinance')  -> true
--   fuzzy_match('Ordinance 11-2023', 'ord%2023')   -> true
--
-- Not an injection — the term arrives as a bound parameter and cannot alter the
-- statement — but a resident searching "50%" or a staff member searching
-- "form_data" gets wrong results, and a lone "_" or "%" returns the whole table.
-- This is the same wildcard trap the deleted src/lib/postgrest.ts guarded
-- against on the PostgREST side, reappearing in SQL.
--
-- The fix is `strpos(...) > 0` rather than escaping the metacharacters: it has
-- no pattern language at all, so there is nothing to escape and nothing to get
-- subtly wrong later. It is also exactly what fuzzyFilter's `joined.includes(term)`
-- does in src/lib/fuzzy.ts, so the two halves of the contract now agree
-- character for character on this route.
--
-- Trade-off, stated honestly: a GIN trigram index can serve `LIKE '%term%'` but
-- cannot serve `strpos`. In practice the trigram indexes from 0015/0016 were
-- already unlikely to be used here — the indexed expression is
-- `lower(a || ' ' || b)` while the inlined predicate produces
-- `lower(coalesce(a || ' ' || b, ''))`, which is not the same expression — and
-- the tables involved are a few hundred rows at barangay scale. Correctness
-- wins. The indexes are left in place; whether to drop them belongs to the
-- security/performance hardening pass, not here.
--
-- Only the substring route changes. The levenshtein and word_similarity routes,
-- the per-term AND, and the empty-query behaviour are all untouched, so the
-- verified fuzzy behaviour is preserved.

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
             strpos(lower(coalesce(p_haystack, '')), t) > 0
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

-- CREATE OR REPLACE preserves privileges, so the 0016 revoke still stands.
-- Re-issued rather than relied upon.
revoke execute on function public.fuzzy_match(text, text)
  from public, anon, authenticated;
