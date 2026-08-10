# Search

**Two engines, exactly one rule.** Since migration `0034` (2026-08-05) that is finally true,
and keeping it true is the whole point of this file.

| Half | Where | Used by |
|---|---|---|
| JS | `fuzzyFilter`, `src/lib/fuzzy.ts` (unit-tested) | every in-table search box in the admin portal |
| SQL | `public.fuzzy_match()`, migrations `0016`/`0017`, final form `0034` | `search_admin_global` (top-bar global search), `search_audit_log`, and the **public** `search_legislative_documents` |

## The rule both halves implement

Two match routes, and only two:

1. literal substring;
2. per-word Levenshtein, budget **1** for terms ≤ 4 characters and **2** for longer.

## The third route that was removed, and why it matters

The SQL half carried a third route until `0034`: `word_similarity(term, haystack) >= 0.45`,
which the JS half never had. The 2026-07-22 fuzzy-search spec §3.1 recorded that asymmetry
as a **deliberate** decision — nearly free in Postgres, and the other two routes "already
cover every case in §1". So `0034` **reverses a documented decision rather than fixing an
oversight**, and that spec is left as the historical record it is.

It was reversed because the route was measurably wrong, not merely redundant. Measured over
every transparency record against 40 realistic queries (560 SQL-vs-JS pairs on identical
haystacks) the two halves disagreed 7 times, **always** SQL-matches-where-JS-does-not, and 6
of the 7 were nonsense: `"tax"` → *Curfew Hours for Minors*;
`"housing"`/`"meeting"`/`"election"` → *Solid Waste Management*; `"renovation"` →
*Streetlight Installation*. Only `"renovate"` → *Barangay Hall Renovation* was worth having,
and it is not worth the other six.

**This is why `/admin/transparency` looked broken while each of its three tabs behaved
perfectly:** the tab searches run the JS half and were always correct; the global search ran
the SQL half and was not.

**Removed rather than re-tuned to a higher threshold, deliberately.** Picking 0.6 or 0.7
requires reading the actual `word_similarity` scores of the good and bad matches, and
nothing here can: every path to the database in this project is PostgREST, which invokes
existing functions and cannot evaluate an arbitrary expression — so a new constant would be
as unmeasured as `0.45` was.

## Standing rules

- **Don't add a trigram route to `src/lib/fuzzy.ts` to "restore parity".** Parity holds now,
  in the other direction.
- Typo tolerance is untouched — it rides Levenshtein, not `word_similarity`.
- `pg_trgm` is still a required extension even though no match route uses it: the
  `gin_trgm_ops` indexes are declared with it.
- **This class of bug — the two halves silently drifting — is invisible to `npm run
  typecheck` and to every existing test**, since Vitest covers only the JS half. Catching it
  needs the two engines run against the same haystack and diffed. Do that whenever either
  half changes.
- All five of the spec's own acceptance cases were re-verified against the post-`0034` rule.

## Haystack construction (SQL side)

`search_admin_global` concatenates a row's searchable columns with `||`. **`text || null` is
`NULL` in Postgres**, so any nullable column joining a haystack must be `coalesce`d or the
entire row disappears from search. This has already happened once — see the `0033`
`purpose` incident in `.claude/database.md`.

## Two registries that look mergeable and are not

`src/lib/notifications.ts` (`NOTIFICATION_QUEUES`) and
`src/features/admin/search-modules.ts` are deliberately separate: **neither list contains
the other** (search omits `inquiries`; not all six notification queues are searchable). A
unit test checks the two agree on the five keys they share rather than merging them.

## Global search (top bar)

`MIN_QUERY_LENGTH` = 2 (`src/features/admin/search-modules.ts`) gates both the client
(`admin-global-search.tsx` won't fire below it) and the action (`search.ts` returns
`{ hits: [], tooShort: true }`) — one constant, both sides. Results deep-link into a
manager via `useEditDeepLink`'s `?edit=` / `?review=` params. Its catch sets a dismissible
`searchError` inside the results dropdown rather than failing silently.

## Public search

`search_legislative_documents` is the one search function reachable anonymously. It runs the
same `fuzzy_match`, so a change to that function changes public behaviour too.
