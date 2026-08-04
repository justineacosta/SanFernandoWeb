-- Fix: fuzzy_match's third route, `word_similarity(term, haystack) >= 0.45`,
-- matched records a human would never call a match, so the global admin search
-- (and the audit-log and public legislative searches, which share the
-- predicate) returned junk alongside the real hits.
--
-- Found on /admin/transparency. The three per-tab searches there run the
-- JavaScript half (fuzzyFilter, src/lib/fuzzy.ts) and were correct; the top-bar
-- global search runs this predicate and was not. Measured over every
-- transparency record with 40 realistic queries — 560 pairs, SQL vs JS on the
-- same haystack and the same term:
--
--   "renovation" -> "Requesting Streetlight Installation Along San Fernando Extension"
--   "feeding"    -> "Curfew Hours for Minors"
--   "meeting"    -> "Comprehensive Solid Waste Management Program"
--   "tax"        -> "Curfew Hours for Minors"
--   "election"   -> "Comprehensive Solid Waste Management Program"
--   "housing"    -> "Comprehensive Solid Waste Management Program"
--   "renovate"   -> "Barangay Hall Renovation"
--
-- Seven disagreements, all SQL-matches-where-JS-does-not, and six of the seven
-- are nonsense. Only the last is a match worth having, and it is not worth the
-- other six: a resident-facing search that answers "Curfew Hours for Minors"
-- to "tax" reads as broken, which is how this was reported.
--
-- WHY REMOVE THE ROUTE RATHER THAN RAISE THE THRESHOLD
-- ---------------------------------------------------
-- Two reasons, in order of weight.
--
-- 1. The contract. `src/lib/fuzzy.ts`'s header and the design spec
--    (docs/superpowers/specs/2026-07-22-fuzzy-search-design.md §3.1) both state
--    that the two halves implement the SAME rule, "so a user cannot tell which
--    one answered". That was already false — §3.1 recorded the extra route as a
--    deliberate asymmetry, justified on the grounds that "substring and per-word
--    edit distance already cover every case in §1" and that the route was nearly
--    free. The first half of that justification is the argument for deleting it
--    now that it is shown to cost something; the second stopped being true in
--    0017, which noted the trigram indexes were already unlikely to be chosen.
--    Removing the route makes the SQL predicate implement the documented
--    contract exactly, so global search and every in-table search on the same
--    page finally agree.
--
-- 2. A new threshold would be a guess. Picking 0.6 or 0.7 needs the actual
--    word_similarity scores of the good and bad matches, and nothing in this
--    project can read them — every path to the database here is PostgREST, which
--    calls existing functions and cannot evaluate an arbitrary expression. A
--    tuned constant nobody measured is how 0.45 got here.
--
-- WHAT THIS CHANGES ELSEWHERE
-- ---------------------------
-- fuzzy_match is shared, so this also tightens search_audit_log (0015/0016),
-- search_legislative_documents (0016, the PUBLIC /transparency/legislative
-- browse) and search_admin_global (0018, redefined by 0033). All three get
-- strictly fewer results, never more, and everything they lose is a match
-- neither the JS half nor the stated contract ever accepted. Typo tolerance is
-- untouched: "offcal" -> official and "sanots" -> Santos both ride the
-- levenshtein route, which is unchanged.
--
-- Nothing else about the predicate moves — the substring route, the per-word
-- edit-distance budget, the per-term AND, and the empty-query behaviour are all
-- exactly as 0017 left them.

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
