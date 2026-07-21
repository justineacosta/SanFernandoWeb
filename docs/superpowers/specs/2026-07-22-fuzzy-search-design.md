# Fuzzy Search — Design

**Date:** 2026-07-22
**Status:** Approved
**Umbrella:** `docs/superpowers/specs/2026-07-22-portal-overhaul-design.md` (sub-project 4 of 9)
**Already shipped:** the Audit Logs slice, pulled forward into sub-project 3 (migration `0015`)

## 1. Goal

Every search input in the portal — admin and public — becomes forgiving in the same way:
partial words, misspellings, transposed characters, and multi-word queries that narrow
rather than widen.

The owner's cases are the acceptance bar:

| Query | Must find |
| --- | --- |
| `offcal` | *official* (misspelling) |
| `ordinnace` | *ordinance* (transposition) |
| `cert` | *certificate* (partial) |
| `juan dela` | *Juan Dela Cruz* (multi-word) |
| `juan banana` | nothing (AND, not OR) |

## 2. What exists today

- **Ten admin managers filter with `.toLowerCase().includes()`** in a `useMemo`. Exact
  substring only — `offcal` finds nothing.
- **Four managers have no search input at all**: officials, legislative, transparency,
  team. The owner's list names Users, Officials, Documents, and Transparency explicitly,
  so these need the input added, not just the matcher swapped.
- **`searchLegislative()`** (public) uses PostgREST `ilike` across `number`, `title`,
  `summary`, server-paginated, with the escaping layer in `src/lib/postgrest.ts`.
- **`searchUploads()`** (public) already loads the full merged item list into memory —
  legislative + documents + projects — and filters with `String.includes`.
- **`search_audit_log()`** (migration `0015`) implements verified three-route per-term
  matching and is the semantic reference for everything below.
- **`AdminTopBar`'s search input is a dead stub** — no state, no handler.

## 3. Decisions

### 3.1 One matching contract, two engines

The umbrella (§3.4) locked a hybrid, and the audit work has now proved the SQL half. Both
engines implement the **same contract**, stated once here:

> Split the query on whitespace. A record matches only if **every** term matches it.
> A term matches if the record's haystack contains it as a **literal** substring, **or**
> some word in the haystack is within an edit distance of 1 (terms ≤ 4 characters) or 2
> (longer), **or** trigram word-similarity clears 0.45.

"Literal" is load-bearing. `0016` implemented the substring route as
`haystack like '%' || term || '%'`, which made `%` and `_` in a *user's query* behave as
LIKE wildcards — a lone `_` matched every row. Migration `0017` replaces it with
`strpos(...) > 0`, which has no pattern language to escape and is exactly what
`String.includes` does on the JavaScript side. See §7.

Substring carries `cert` → *certificate*. Edit distance carries `offcal` → *official* —
trigram similarity alone cannot, because the two share only the trigram `off`. Term-AND
carries `juan dela` and, just as importantly, makes `juan banana` return nothing.

- **`pg_trgm` + `fuzzystrmatch` in Postgres** for tables that grow without bound or are
  already server-paginated: `audit_log` (done), `legislative_documents`, and the global
  search in §3.5.
- **A ~60-line matcher in JavaScript** for datasets already fully in memory: the admin
  managers, which ship their whole table to the browser, and `searchUploads()`, which
  merges three small published tables server-side before filtering.

The split is about **where the data already is**, not about the surface. `searchUploads`
runs the JS matcher on the server; that is correct, because the rows are already loaded.

### 3.1.1 Fuse.js was installed, measured, and removed

The umbrella (§3.4) locked Fuse.js for the JavaScript half. It was installed and measured
against a table of realistic rows, and it **could not satisfy the owner's cases at any
threshold**:

| Threshold | `sanots` → *Santos* | `juan banana` → nothing |
| --- | --- | --- |
| 0.30 | ✗ missed | ✓ |
| 0.35 | ✓ | ✗ matched *Juan Dela Cruz* |

The cause is structural, not a tuning failure. Fuse scores a pattern against the **whole**
concatenated haystack, so a six-letter term is being compared against an eighty-character
string; the score needed to accept a transposed surname is also loose enough to accept an
unrelated word. Raising the threshold widened `juan banana`; lowering it broke `sanots`.

Matching **per word** — the strategy `search_audit_log` already uses and which was verified
against live data — has no such conflict, because words are compared to words. Implemented
directly it is about sixty lines, passes all nineteen measured cases, and makes the two
engines genuinely the same algorithm rather than two engines that merely feel similar.

Fuse.js was therefore uninstalled. This reverses umbrella §3.4 on the choice of library
while keeping its actual decision — hybrid, JS in the browser and SQL in Postgres —
unchanged.

**One deliberate difference remains between the halves.** The SQL predicate keeps a third
recall route, `word_similarity(term, haystack) >= 0.45`, which the JS side omits. It is
nearly free in Postgres — a GIN trigram index serves it — but reproducing Postgres's
trigram semantics in JavaScript would be an approximation of another system's internals
with no measured benefit, since substring and per-word edit distance already cover every
case in §1. Recorded here so the asymmetry is a decision rather than a discovery.

### 3.2 `public.fuzzy_match(haystack, q)` — one SQL predicate, reused

Migration `0015` inlined the matching CTE inside `search_audit_log`. Copying that block
into every future search function would guarantee drift, and the requirement explicitly
covers "all future tables". `0016` extracts it:

```sql
create or replace function public.fuzzy_match(p_haystack text, p_q text)
returns boolean language sql stable
```

Written as a **single SQL `SELECT`** so Postgres inlines it into the calling query, which
keeps the trigram indexes eligible. A PL/pgSQL body would be a per-row black box and force
a sequential scan.

`search_audit_log` is rewritten in `0016` to call it, so exactly one definition of "matches"
exists in the database. The `0015` verification script re-runs against the replacement as
the proof (§6).

### 3.3 `fuzzyFilter()` — the JavaScript half

`src/lib/fuzzy.ts` exports two functions, used by every client manager and by
`searchUploads()`:

```ts
fuzzyFilter<T>(items: T[], query: string, haystackOf: (item: T) => string): T[]
haystack(...parts: (string | null | undefined)[]): string
```

`fuzzyFilter` builds a per-item haystack, splits it into words, and keeps an item only if
every query term matches — by substring against the joined haystack, or by bounded
Levenshtein against some individual word. The distance budget is 1 for terms of four
characters or fewer and 2 above that; at 2, a four-letter term reaches most four-letter
words and stops discriminating. The distance loop abandons a pair as soon as the row
minimum exceeds the budget, which is what keeps this cheap enough to run on every
keystroke.

`haystack()` joins field values and drops blanks, so an absent field cannot leave a run of
separators for a term to match against.

Order is preserved from the input array rather than re-ranked by score. Managers sort by
date or status and the owner asked for column sorting, not relevance ranking; letting a
search silently reorder a sorted table would fight that.

**Why not route these to Postgres too.** Manager tables are already in the browser.
Each keystroke would become a ~250 ms debounced round-trip for data the browser is
holding.

### 3.4 Search inputs are added where they are missing

| Manager | Today | After |
| --- | --- | --- |
| Applications / Appointments / Complaints / Assistance | substring on name + ticket no. | fuzzy on name, ticket no., contact, subject |
| News | substring on title | fuzzy on title + category |
| Events | substring on title | fuzzy on title + location |
| Services | substring on title + department | fuzzy, unchanged fields |
| **Officials** | **none** | fuzzy on name, position, committee |
| **Legislative** | **none** | fuzzy on number, title, summary |
| **Transparency** | **none** | fuzzy on title / project name, per tab |
| **Team (Users)** | **none** | fuzzy on name, email, status label |

Every added input reuses `AdminFilterBar`, which already renders the search field, so the
managers gain a prop rather than new markup. `AdminFilterBar`'s hardcoded
`id="admin-filter-search"` becomes a required per-instance `id` — the transparency manager
renders two filter bars on one page, and duplicate DOM ids would break the `<label for>`
association for screen readers.

Searching resets pagination to page 1 in every manager that paginates. A stale page 3 with
two results reads as an empty table.

### 3.5 The global topbar search is permission-scoped

`AdminTopBar`'s stub becomes a real cross-module search: type, see grouped results, click
through to the record's manager page.

**Results are filtered by the viewer's permissions before they leave the server.** A staff
member without `manage-officials` must not see officials in results — that would leak the
existence of records that sub-project 2 makes 404 on direct access. The gate is the same
`checkPermission` used everywhere else, applied per module inside the Server Action, not a
client-side filter over a full result set.

Modules covered: news, announcements, events, officials, services, legislative,
transparency documents, transparency projects, and the four ticket flows. Not covered:
audit log (it has its own SuperAdmin page and searching it from a global box would surface
other people's logins in a dropdown).

### 3.6 Public search behaviour is unchanged apart from matching

`/transparency/legislative` and `/transparency/uploads` keep their current
submit-driven forms, sorting, type filters, and pagination — all added in sub-project 1.
Only the matcher changes. The instant-filter interaction added to Audit Logs was a
specific request for that page and is **not** propagated here; these are public pages
where each keystroke would be an uncached database round-trip from a phone.

## 4. Migration `0016_fuzzy_search.sql`

1. `create or replace function public.fuzzy_match(text, text)` — §3.2.
2. `create or replace function public.search_audit_log(...)` — same signature, body now
   calling `fuzzy_match`. Privileges survive `CREATE OR REPLACE`, so the `0015` revoke
   stays in force; the migration re-issues it anyway, because relying on that is a
   silent dependency.
3. Trigram GIN index on `legislative_documents` over
   `lower(number || ' ' || title || ' ' || coalesce(summary,''))`.
4. `create or replace function public.search_legislative_documents(p_q, p_doc_type,
   p_limit, p_offset)` returning the page's rows plus `total_count` from a window
   function, mirroring `search_audit_log`'s shape. Filters `status = 'published'`, so the
   public boundary stays in one place.
5. `revoke execute ... from public, anon, authenticated` on both search functions.
   `search_legislative_documents` only ever returns published rows, so exposing it would
   not leak — but the convention in this codebase is that every RPC is reached through the
   service-role client behind a code check, and one function opting out invites the next
   one to.

Undated documents keep sorting first (`nullsFirst: true`), matching `listRecentLegislative`
and the 2026-07-20 decision.

## 5. Order of work

Three independently shippable commits:

- **A — JS matcher and the ten managers.** `src/lib/fuzzy.ts`, the `AdminFilterBar` id
  change, four new search inputs, six matcher swaps. No migration, no schema risk.
- **B — public transparency.** Migration `0016`, `searchLegislative` moved onto the RPC,
  `searchUploads` moved onto `fuzzyFilter`. **Owner must apply `0016` before B is
  verifiable.**
- **C — global topbar search.** Depends on A only.

## 6. Verification

No test framework (umbrella §5), so: `npm run typecheck`, `npm run lint`, and driving the
running app per `.claude/skills/verify/SKILL.md`.

**A.** In each manager with search, type a deliberate misspelling of a record that exists
and confirm it is found; type a two-word query where the second word matches nothing and
confirm zero rows; confirm pagination resets to page 1.

**B.** Re-run `verify-fuzzy.mjs` unchanged against `search_audit_log` after the rewrite —
identical hit counts prove `fuzzy_match` is semantically the same predicate, and the
malicious-sort-key case proves the `format(%I)` whitelist survived. Then run the owner's
five cases against `/transparency/legislative` and `/transparency/uploads` in the browser.

**C.** Sign in as a `manage-news`-only user (local session stub, per sub-project 2's
method) and confirm a query matching a known official returns no official results, while
the same query as SuperAdmin does.

## 7. Risks

- **The edit-distance budget is a judgement call**, checked against nineteen cases on a
  representative table rather than derived. If real data shows short terms over-matching,
  the budget in `budgetFor()` is the single knob.
- **Rewriting `search_audit_log` touches verified, shipped behaviour.** Mitigated by
  re-running the original verification script unchanged — but it is the one place in this
  sub-project where a regression would be invisible in the UI.
- **The LIKE-wildcard defect, found in verification and fixed by `0017`.** `0016`'s
  substring route passed the search term straight into a `LIKE` pattern, so `%` and `_`
  were wildcards: `fuzzy_match('totally unrelated text', '_')` returned true, meaning a
  one-character query returned the entire table, and `form_data` matched `formXdata`.
  Not an injection — the term is a bound parameter and cannot alter the statement — but
  wrong results, and precisely the trap `src/lib/postgrest.ts` had guarded on the
  PostgREST side before it was deleted in the same commit. The lesson worth keeping: a
  matcher must be tested with the *pattern language's own metacharacters* as input, not
  only with words. `strpos` removes the class of bug rather than escaping around it.
  Cost: a GIN trigram index can serve `LIKE '%term%'` but not `strpos`. Those indexes were
  already unlikely to be used — the indexed expression is `lower(a || ' ' || b)` while the
  inlined predicate produces `lower(coalesce(a || ' ' || b, ''))` — and the tables are a
  few hundred rows. Whether to drop them belongs to the hardening pass.
- **`audit_log` is immutable**, so nothing in `0016` may attempt to update it.
- The trigram index on `legislative_documents` is built on a live staging table. It is
  small; `create index` (not `concurrently`) is acceptable and keeps the migration
  transactional.
