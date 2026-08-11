# Database

Supabase Postgres. Migrations live in `supabase/migrations/` (`0001`–`0037` as of
2026-08-11). zod is **v4** (not v3). See `.claude/deployment.md` for how migrations are
applied and the deploy-order hazards; this file is the schema/data model itself.

## RLS model — the single most important rule

**All write-bearing tables have RLS enabled with zero policies.** Three narrow,
pre-existing **read-only** exceptions exist for public/staff reference data:
`profiles` (`0001`), `services` (`0004`), `assistance_categories` (`0006`) — see
`docs/BACKEND_HANDOFF.md` §6 item 13. They predate the 2026-07-28 hardening pass and
expose no write path. Read the rule as *"no policies on the write-bearing/ticketing
tables"*, not literally zero policies anywhere.

Consequences:

- The service-role client (`src/lib/supabase/admin.ts`) behind an explicit
  `requirePermission(...)` code check is the **entire** auth gate for every write-bearing
  table.
- The public/published boundary is the `.eq("status","published")` filter in the query
  layer — nothing in the database enforces it.
- A cookie-bound anon client reading a non-exception table silently returns **zero rows
  with no error**. That is why `loadAppointmentDemand` uses the service-role client; the
  same "deliberately-public read, gates in code instead" carve-out
  `src/lib/supabase/admin.ts`'s doc comment grants `lookupTicket`. `services` is the
  counterexample — it has a public-read policy, so its public query uses the anon client.
- **Never expose the service-role key to the client.**

## Schema areas

### Auth / staff

- `profiles` — `email`, `full_name`, `first_name`/`middle_name`/`last_name` (`0031`),
  `phone` (`0003`), `status_label`, `is_superadmin`, `permissions[]`, `is_active`,
  `is_archived`, `avatar_src` (`0025`), `notifications_seen_at` (`0026`).
  `buildFullName()` (`src/features/admin/lib/build-full-name.ts`) keeps `full_name` in
  sync with the split columns on every SuperAdmin-driven write. **Accepted drift:**
  Settings → Profile's self-service "Full Name" field writes `full_name` directly, so a
  user who renames themselves there drifts the split columns out of sync.
- `profiles.email` is **not** guaranteed to share `auth.users.email`'s case normalization
  (`createTeamUser` inserts whatever case was typed) — never match an account by
  `profiles.email`; resolve the user id first and query by that.

### Ticketing (four flows)

`applications`, `appointments`, `complaints`, `assistance_requests` (`0005`, `0006`).

- `next_ticket_number` (`0005`) makes `ticket_no` **globally unique across all four
  prefixes** by construction. `tickets_view` is the union `lookupTicket` reads.
- **`tickets_view` carries only fields common to all four kinds**, so a type-specific
  column cannot leak to `/track`. Do not extend it with identifying data (a birth date was
  deliberately kept out — it is a stronger identifier than anything currently in it).
- Shared status shape: `<intake>` → `under-review` ⇄ `awaiting-info` → `<stage-1>` →
  `<stage-2>`. **`under-review` is optional, not mandatory** — a clerk may decide straight
  from intake in one click. Transition guards are
  `.in("status", ["pending","under-review","awaiting-info"])` (complaints use `received`
  for intake), and `awaiting-info` is reachable from any non-terminal status.
- `replied_at` (`0032`, all four tables) — set when a resident replies, cleared when staff
  next post an update. **Load-bearing:** a reply flips a ticket back to `under-review`,
  which `NOTIFICATION_QUEUES` correctly does *not* count as untouched work, and the staff
  notification email was removed 2026-08-06 — so this column and the "New reply" pill it
  drives are the *only* way staff learn a resident answered. Dropping the write or
  filtering it out of the queue query silently strands every awaiting-info ticket whose
  resident already responded.
- `applications` also carry `middle_name` (optional, stores `null`, never `""`) and
  `birth_date` (`0033`) — **required in Zod, nullable in the DB**, because pre-`0033` rows
  have no value and `not null` would fail the alter; the requirement lives in the public
  schema and the duplicated `walkInSchema`. `birthDate` is modelled on
  `complaintSchema.incidentDate`: a `YYYY-MM-DD` regex plus two **lexicographic** string
  comparisons (`<= manilaToday()`, `>= "1900-01-01"`), never a parsed `Date`.
- `applications.purpose` is nullable with only a 500-char cap (the `.min(4)` floor was
  dropped; the cap is what `public-forms.ts` requires of any free-text field on an
  unauthenticated endpoint, and only the floor was a policy choice). `remarks` on a
  rejection is optional too, a deliberate reversal of the spec's "every negative decision
  carries a readable reason" — so a rejection email can arrive with **no Reason block**
  (`TicketNotice` skips a falsy `remarks`) and its `/track` entry has an empty body.
  **No fallback copy was invented to hide that; don't add one.**
- Applications only — appointments/complaints/assistance are untouched by `0033`, which is
  why those two field schemas live in `src/features/services/schema.ts` and **not** in
  `residentFields` (`src/lib/public-forms.ts`), whose contract is "the identity block every
  public ticket form opens with".

### `ticket_updates` (`0032`) — the resident-facing timeline

Append-only. Replaces the old three-step diagram derived from
`status`/`created_at`/`reviewed_at`/`closed_at`.

- **Keyed on `ticket_no` (text), not a polymorphic `(kind, uuid)` pair or four nullable
  FKs** — `ticket_no` is already globally unique, `lookupTicket` already depends on that,
  and a text key needs no join in either direction. Accepted tradeoff: no cascade delete,
  which costs nothing while no ticket in this app has a delete path.
- `visibility` (`'public' | 'internal'`) **filtered in the query layer is the entire
  privacy gate** keeping staff internal notes off `/track`. `loadTimeline`
  (`src/features/track/actions.ts`) filters `.eq("visibility","public")` and the component
  never re-checks. **Do not move this check into `ticket-timeline.tsx` "for clarity"** —
  that would make the guarantee depend on the component rendering correctly instead of on
  the row never being returned.
- `author_name` is deliberately **not** selected into the public payload, for the same
  reason `loadExtras` withholds a complaint's narrative/respondent/location: an anonymous
  endpoint ships every column it selects whether or not anything renders it, and naming the
  staff member who handled a complaint to the reporter invites pressure on that person.
- `notified_at` is **not automatic**. `recordTicketUpdate` never writes it — every caller
  that emails the resident must call `markTicketUpdateNotified(entryId)` itself,
  immediately after its own `sendEmail`, **inside the same `if (email)` guard**, and guard
  on the id (`if (entryId)`) because `recordTicketUpdate` is fire-and-forget and returns
  null on failure; a log write must never turn a committed decision into a failed action.
  A missing "Email attempted" chip causes no duplicate send (nothing reads the stamp) — the
  damage is human: staff read it as "the resident was never told" and message them again by
  hand. Three deliberate non-callers, all because no resident email is attempted:
  `releaseApplication`, `completeAppointment` (non-terminal transitions the email design
  excludes), and `submitTicketReply`'s own resident-reply entry.
- `attachments` is a **jsonb array** (every other bucket-backed column in this app is plain
  text) — `scripts/report-orphaned-media.mjs` has a special case for it.
- `postTicketUpdate` (`src/features/admin/actions/ticket-updates.ts`) **never writes
  `reviewed_*`/`closed_*`/`released_*`/`decided_*` or `remarks`** — those columns record
  who decided what and when; moving a ticket to `under-review`/`awaiting-info` is not a
  decision, and `remarks` keeps holding the latest decision's own reason.

### Services catalog

`services.flow` (`0035`): `text not null default 'apply' check (flow in ('apply',
'complaint', 'assistance', 'appointment'))`. It **replaces** the old inference where
`tone === 'danger'` meant the complaint form and anything else meant the document
application — that scheme had no room for a third destination. `tone` now decides only the
card's visual variant. See `.claude/resident-portal.md` for the three guards that read it
and why every `.select()` must name the column explicitly.

`assistance_categories` gained `description`/`requirements` (`0035`), editable through the
categories panel at `/admin/services`.

### Content

- `news`, `news_photos`, `news_categories`, `announcements` (gained `slug` + `body` in
  `0027`; pre-`0027` rows backfilled to `body = ''` and fall back to the excerpt),
  `events`, `officials` + `official_achievements` + achievement photos,
  `legislative_documents` (structured number, `0024`), `transparency_documents`,
  `transparency_projects`, `transparency_files`.
- All six status-aware content types run `draft → in-review → published → archived`.
- **Archive provenance** (`0020`) backs `guardDelete()` — see `.claude/authorization.md`.

### Site content (Home/About CMS, `0021`)

Nine blocks across two tables: `site_blocks` (four singleton texts) + `site_items` (five
ordered collections in one table, discriminated by a `site_block` enum with generic
`label`/`value`/`body` slots whose per-block meaning is fixed in
`src/features/admin/site-blocks.ts`).

- **No status column; Save writes live.** A page section has no lifecycle, so there is no
  Active|Archived view and no `guardDelete`; deletion is direct and takes its storage
  object with it.
- An empty block hides its section (the hero keeps its text and drops the carousel).
- Section headings and the About `PageHero` stay hardcoded — editable everything is a page
  builder.
- Every site-content action must call `revalidatePath("/")` **and**
  `revalidatePath("/about")`, or edits sit invisible for an hour.
- Requires `node scripts/upload-site-images.mjs` once per environment, or the seeded rows
  point at objects that do not exist.

### Infrastructure tables

- `audit_log` (`0014`) — append-only at the DB level (UPDATE/DELETE revoked, rejecting
  triggers). See `.claude/audit-logs.md`.
- `rate_limit_hits` (`0029`) — the durable rate limiter. See `.claude/security.md`.
- `inquiries`, `alert_subscribers` (`0019`), `feedback` (`0023`).
- `alert_subscribers` currently gains no rows: the public site has no signup entry point
  since `NewsletterForm` was unmounted (2026-08-05). Nothing dispatches to that table
  anyway.

## SQL functions

- `public.fuzzy_match()` (`0016`/`0017`, final form `0034`) and its consumers
  `search_admin_global` (`0018`, redefined in `0033`), `search_audit_log` (`0015`), and the
  public `search_legislative_documents`. See `.claude/search.md`.
- **The Postgres null trap that `0033` exists to fix:** `search_admin_global` builds each
  row's haystack by concatenating columns with `||`, and `text || null` is `NULL` in
  Postgres. The moment `purpose` became nullable, every application without one produced a
  NULL haystack, `fuzzy_match(NULL, q)` returned NULL, and the row vanished from admin
  global search entirely. `coalesce(ap.purpose, '')` restores it, and `middle_name` joined
  the same haystack; only the applications branch changed, the other eleven are verbatim
  `0018`. **Any new nullable column joining a haystack must be `coalesce`d.** The same
  nullability bit `src/features/admin/queries/notifications.ts` (`sublabel: row.purpose`
  feeding a non-nullable `NotificationItem.sublabel` — Supabase rows are untyped there, so
  `npm run typecheck` could *not* have caught it; it is `?? ""` now).
- `next_ticket_number` (`0005`).
- `pg_trgm` is a required extension even though no match route uses it — the
  `gin_trgm_ops` indexes are declared with it.

## Reading and writing rules

- Every write re-validates its input with Zod at runtime — Server Actions are public HTTP
  endpoints.
- PostgREST is the only path to the database in this project: it invokes existing functions
  and **cannot evaluate an arbitrary expression**. Any new tuning constant in SQL is
  therefore unmeasurable from here without a new migration.
- Rows returned from `.select()` are untyped, so TypeScript cannot catch a nullable column
  feeding a non-nullable field. Verify nullability by reading the migration, not the types.
