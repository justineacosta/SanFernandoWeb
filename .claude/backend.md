# Backend conventions

Server Actions, the query layer, and the two HTTP endpoints. Schema:
`.claude/database.md`. Gates: `.claude/authorization.md`.

## Writes go through Server Actions + the service-role client

Reads that must bypass RLS do too. There is no other write path.

**Every Server Action, in order:**

1. **Turnstile first** on public anonymous actions — before rate limiting, before Zod
   (`.claude/security.md`). `/admin/login` is the one documented inversion.
2. **Gate** — `checkPermission(...)` / `checkSuperAdmin()`, never the `require*` page
   variants (a thrown `notFound()` in a POST surfaces as an unhandled digest error). Return
   `{ error: NOT_FOUND }` on failure.
3. **Rate limit** where the action is publicly reachable.
4. **Zod re-validation** — Server Actions are public HTTP endpoints and the client schema
   proves nothing.
5. The write, with any compensating cleanup helper **already defined above this point**
   (`.claude/storage.md`).
6. **`revalidatePath(...)`** for every route the write affects — including the `/admin` one,
   the public list, **and the detail page as a `[slug]` pattern**.
7. **`recordActivity(...)`** for anything a staff member did to a record
   (`.claude/audit-logs.md`).

Return `{ error: string }` rather than throwing wherever a client is waiting on the result —
the client-side counterpart of that contract is in `.claude/frontend.md`.

## Query layer

- One `queries.ts` per feature (`src/features/<name>/queries.ts`), plus
  `src/features/admin/queries/` per module for the portal.
- **The public/published boundary is the `.eq("status","published")` filter here** — nothing
  in the database enforces it.
- **Resolve media URLs in the query layer**, batching with `resolveMediaUrlsForList` over a
  list query's rows rather than per row.
- **A `.select()` must name every column the code reads.** `services.flow` is the standing
  cautionary tale (`.claude/resident-portal.md`): a dropped column reads `undefined`, the
  guard inverts, and nothing in review looks wrong.
- **Rows returned from `.select()` are untyped.** TypeScript cannot catch a nullable column
  feeding a non-nullable field — verify nullability by reading the migration.
- Pagination is offset/limit with a **secondary sort key as tiebreaker**, or batches produce
  duplicate keys.

## Actions that must not fail their caller

Three fire-and-forget writes, each for the same reason — the thing they record already
committed:

| Helper | On failure |
|---|---|
| `recordActivity` (audit) | logs, returns |
| `recordTicketUpdate` (timeline) | logs, returns `null` — **callers must guard on the id** |
| `sendEmail` (Resend) | never throws; returns `{ ok: false }` |

Never make a committed decision conditional on any of them succeeding.

## HTTP endpoints — exactly two Route Handlers

`src/app/api/` holds only these. Prefer a Server Action for anything new; a Route Handler
needs a reason of the kind these two have.

### `GET /api/admin/notifications`

Feeds the 60s poll (`.claude/admin-cms.md`). **Outside `src/proxy.ts`'s matcher, so it
re-checks `getSessionUser` itself.** A 401 stops the poll silently. This is why the
`sf-activity` cookie is `Path=/` rather than `/admin`.

### `POST /api/admin/uploads/document`

Exists because the three document forms were the only call sites forcing `bodySizeLimit` up
for every public unauthenticated form too. Full contract — including why it reads `status`
from the DB and never from the client — is in `.claude/storage.md`.

`src/proxy.ts`'s Server Action POST matcher exclusion (`missing: [{type: "header", key:
"next-action"}]`) was re-checked against that change and deliberately left alone: never
PDF-specific, and the largest remaining Server-Action payload is well under
`proxyClientMaxBodySize`'s 10MB default.

## Proxy (`src/proxy.ts`)

Renamed from `middleware.ts` in the 2026-07-28 pass — **Next 16 deprecated the `middleware`
file convention in favor of `proxy`**, and `proxy.ts` does not accept a `runtime` config at
all (setting one throws). It defaults to the Node.js runtime, which is what makes the
service-role client and audit insert in its idle branch safe.

**Server Action POSTs are excluded from its matcher on purpose** — which is exactly why
`getSessionUser()` carries its own idle check (`.claude/authentication.md`).

## Dates and time

Manila is the only timezone that matters. `manilaToday()` produces the `YYYY-MM-DD` the
schemas compare against, and date bounds are **lexicographic string comparisons on
`YYYY-MM-DD`, never parsed `Date` objects** (`complaintSchema.incidentDate` is the model,
`birthDate` copies it). Where a weekday is needed from such a string, use `getUTCDay()` —
see `.claude/resident-portal.md` for why `getDay()` is wrong.

A route whose output depends on "today" or on a service-role read needs
`export const dynamic = "force-dynamic"` — the service-role client calls no Next.js Dynamic
API, so nothing else forces the route dynamic and `next build` will prerender it static and
freeze the value forever.
