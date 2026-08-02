# Progressive ticket timeline, `awaiting-info`, and resident replies — design

**Status:** approved, ready for implementation planning.
**Closes:** the gap where a ticket's entire history is three timestamp columns
and one overwritable `remarks` string, so barangay staff cannot record a second
update, cannot ask a resident for more information, and cannot tell a resident
anything between "received" and the final decision.

## Context

The four ticketing flows (`applications`, `appointments`, `complaints`,
`assistance_requests`, migrations `0005`/`0006`) all share one shape: an intake
status, a stage-1 staff decision, a stage-2 close, and a single `remarks` text
column overwritten on each transition.

The resident-facing timeline (`src/features/track/components/ticket-timeline.tsx`)
is not a log. It is a fixed three-step diagram *derived* from `status`,
`created_at`, `reviewed_at` and `closed_at`, with per-kind wording in a `COPY`
map. There is no way to render a fourth step, and no history of what was said
when — the second transition overwrites the first one's `remarks`.

Email (`docs/superpowers/specs/2026-07-30-resend-email-integration-design.md`,
Plans 1 and 2) fires only on submission and on **terminal** outcomes:
approved/rejected, confirmed/declined, resolved/dismissed, granted/declined. The
`released`/`completed`/`under-review` transitions were deliberately excluded as
non-terminal. Nothing emails a resident mid-flow, and nothing can, because there
is no mid-flow event to email about.

Two of the four flows already carry `under-review` (`complaints`,
`assistance_requests`); the other two do not. None of the four has any concept of
"we are blocked waiting on the resident."

## What this adds

1. A uniform status shape across all four flows, adding `under-review` where it
   is missing and `awaiting-info` everywhere.
2. An append-only `ticket_updates` table that becomes the single source of the
   resident timeline, carrying both staff-authored updates and machine-written
   status entries.
3. Staff-authored updates with a visibility choice (resident-visible vs internal
   note) and an opt-out email notification.
4. A resident reply path on `/track`, available only while a ticket is
   `awaiting-info`, with up to three file attachments into a new private bucket.

## 1. Status model

All four flows become identical in shape:

```
<intake> → under-review ⇄ awaiting-info → <stage-1 outcome> → <stage-2 outcome>
```

| Flow | Statuses after this change |
|---|---|
| Applications | `pending` → **`under-review`** ⇄ **`awaiting-info`** → `approved` → `released` \| `rejected` |
| Appointments | `pending` → **`under-review`** ⇄ **`awaiting-info`** → `confirmed` → `completed` \| `declined` |
| Complaints | `received` → `under-review` ⇄ **`awaiting-info`** → `resolved` \| `dismissed` |
| Assistance | `pending` → `under-review` ⇄ **`awaiting-info`** → `granted` \| `declined` |

Appointments gain `under-review` even though only three flows were originally
asked for. Making one of the four different buys nothing: "Under Review" reads
naturally for a schedule request, and a non-uniform enum means every consumer —
the timeline builder, the status chip, the queue filters, the transition guards —
carries a per-kind exception for no benefit.

**`under-review` is optional, not mandatory.** A clerk must still be able to
approve a simple barangay clearance in one click from `pending`. Concretely, the
existing transition guards widen:

```ts
.eq("status", "pending")   // before
.in("status", ["pending", "under-review", "awaiting-info"])   // after
```

for `reviewApplication`, `reviewAppointment`, `reviewAssistance`, and (with
`received` in place of `pending`) `reviewComplaint`. The stage-2 guards
(`releaseApplication` on `approved`, `completeAppointment` on `confirmed`,
`closeComplaint` and `decideAssistance` on `under-review`) are unchanged, except
that `closeComplaint`/`decideAssistance` also accept `awaiting-info` — staff must
be able to close a ticket the resident never answered.

**`awaiting-info` is reachable from any non-terminal status**, including the
intake status: staff may see a fresh ticket and immediately need something.

`StatusChip` (`src/features/admin/components/status-chip.tsx`) already has
`under-review` → "Under Review" in the amber attention tone. `awaiting-info`
joins it there as **"Awaiting Information"**, same amber tone — waiting on a
resident is workflow, not danger. Both `LABELS` and `TONES` are
`Record<AdminStatus, string>`, so TypeScript fails the build until both are added.

## 2. Data model

### 2.1 `ticket_updates`

```sql
create table public.ticket_updates (
  id            uuid primary key default gen_random_uuid(),
  ticket_no     text not null,
  ticket_kind   text not null check (ticket_kind in
                  ('application','appointment','complaint','assistance')),
  entry_type    text not null check (entry_type in
                  ('status','staff-note','info-request','resident-reply')),
  status        text,
  body          text not null default '',
  visibility    text not null check (visibility in ('public','internal')),
  author_kind   text not null check (author_kind in ('staff','resident','system')),
  author_id     uuid references auth.users (id) on delete set null,
  author_name   text,
  attachments   jsonb not null default '[]',
  notified_at   timestamptz,
  created_at    timestamptz not null default now()
);
```

RLS enabled with **zero policies**, matching every ticket table: neither `anon`
nor `authenticated` may touch it, and both the public `/track` read and the admin
read go through the service-role client after an explicit code check.

Column notes:

- **`status`** is set only on `entry_type = 'status'` rows; null otherwise. It
  records the status the ticket moved *to*, so the log stays readable without
  replaying it.
- **`visibility`** is the entire privacy gate for internal notes. `'internal'`
  rows are filtered out in the public query (§5.1), not in the component.
- **`author_kind = 'system'`** is used for the machine-written status rows;
  `'staff'` for a person's update; `'resident'` for a reply.
- **`attachments`** is `[{path, name, mime, sizeBytes}]`, written only on
  `resident-reply` rows. A jsonb column rather than a child table because there
  are at most three, they are never queried by field, and they are immutable
  after write. The cost is that `scripts/report-orphaned-media.mjs` needs its own
  jsonb extraction for this bucket rather than the plain-column pattern it uses
  for every other kind (§7).
- **`notified_at`** stamps when a resident email was attempted for this entry, so
  the admin panel can show "Resident notified" without a second table.

Indexes: `(ticket_no, created_at)` for both read paths, plus a partial index on
`(ticket_no, created_at) where visibility = 'public'` — the public path always
carries that filter and is the hotter of the two.

### 2.2 Why `ticket_no` is the link

There is no Postgres foreign key to a four-table union, so the alternatives were
a polymorphic `(kind, uuid)` pair or four nullable FK columns with a check that
exactly one is set.

`ticket_no` is already globally unique **by construction**: `next_ticket_number`
(migration `0005`) counts per `(prefix, year)` and the four prefixes are
`APP`/`APT`/`CMP`/`AST`. The codebase already depends on this — `lookupTicket`
does `.eq("ticket_no", ticket).maybeSingle()` against the `tickets_view` union and
would break today if two tables could produce the same number.

It is immutable, it is the key `/track` arrives with, it needs no join in either
direction, and it is human-readable in the database. `ticket_kind` is stored
alongside it for label rendering and index selectivity, not to disambiguate.

**Accepted tradeoff:** no cascade delete. No ticket in this application has a
delete path at all (unlike news/officials/transparency, and unlike `feedback`
which has a SuperAdmin dismissal delete), so there is nothing for a cascade to
fire from. If a ticket delete is ever added, it must delete its `ticket_updates`
rows and their storage objects explicitly, DB row first — the ordering rule the
rest of the codebase follows.

### 2.3 `replied_at` on the four ticket tables

```sql
alter table public.applications add column replied_at timestamptz;
-- and appointments, complaints, assistance_requests
```

Set when a resident replies; cleared (`null`) when staff post their next update
on that ticket.

This column exists because of a specific failure mode. A resident's reply flips
the ticket from `awaiting-info` back to `under-review`, which is correctly *not*
"untouched work" — so `NOTIFICATION_QUEUES[key].newStatus` (`'pending'` /
`'received'`) would never match it and the nav badge would never fire. Staff would
learn about the reply only from an email, which is exactly the channel most likely
to be missed. `NOTIFICATION_QUEUES` gains an optional `replyColumn?: string` and
the count query becomes:

```
status = newStatus  OR  replied_at is not null
```

for the four queues that set it; `inquiries` and `feedback` leave it undefined and
are unaffected. The column mirrors the `reviewed_at`/`closed_at`/`decided_at`
pattern the ticket tables already use, so it reads as native rather than bolted on.

The rejected alternative — flipping a reply back to the *intake* status so it
re-badges for free — was discarded because a ticket that has been reviewed and
replied to is not "Pending", and a status column should describe reality.

### 2.4 `ticket-media` bucket

One new **private** bucket, `ticket-media`, holding resident reply attachments at
`<ticket_no>/<uuid>.<ext>`. Staff read them through 10-minute signed URLs, exactly
the pattern `features/admin/queries/feedback.ts` established for feedback
screenshots.

It is private for the same reason `feedback-media` is: an attachment here is
typically a photo of the resident's own ID or proof of residency, and Supabase
Storage's `list()` rides the same RLS `select` policy as an individual `get()` — a
public bucket would make every resident's uploaded ID anonymously enumerable.
This becomes the project's second private bucket; like `feedback-media` it gets no
`photoUrl`-style public helper, deliberately.

Constants in `src/lib/storage.ts`:

```ts
export const TICKET_MEDIA_BUCKET = "ticket-media";
export const MAX_REPLY_FILES = 3;
export const MAX_REPLY_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
// types reuse the existing ALLOWED_DOC_FILE_TYPES (JPEG/PNG/WebP/PDF)
```

**The 2 MB / 3 file cap is chosen to avoid touching `bodySizeLimit`.** 3 × 2 MB =
6 MB sits under the current `"8mb"` Server Action ceiling
(`next.config.ts`, right-sized in security-hardening Plan 3), so the bytes ride
inside the Server Action and **no new Route Handler is required**. The Plan 3
document handler (`POST /api/admin/uploads/document`) is authenticated behind
`manage-transparency`; an anonymous twin of it accepting files from the public
internet would be the single largest new attack surface in this feature, and a
10 MB PDF allowance is not worth it. A resident sending a scan of an ID does not
need 10 MB.

## 3. Staff-authored updates

New Server Action `postTicketUpdate(kind, id, values)` in
`src/features/admin/actions/ticket-updates.ts`, dispatching to the correct
permission by kind:

| kind | permission |
|---|---|
| `application` | `process-applications` |
| `appointment` | `process-appointments` |
| `complaint` | `handle-complaints` |
| `assistance` | `handle-assistance` |

Values (Zod-validated at runtime, as every Server Action here is):

- `body` — required, trimmed, 1–2000 chars.
- `visibility` — `"public" | "internal"`.
- `notify` — boolean. Forced `false` and disabled in the UI when the ticket row
  has no email; ignored server-side when `visibility === "internal"`.
- `setStatus` — `null | "under-review" | "awaiting-info"`. The existing
  approve/reject/release/close buttons keep their own actions; this covers only
  the two mid-flow moves.

**`setStatus === "awaiting-info"` forces `visibility: "public"`.** Asking for
information the resident cannot see is incoherent. The UI locks the radio and the
action re-checks it rather than trusting the client.

The action writes the `ticket_updates` row, applies `setStatus` where given
(guarded in the `WHERE` clause against terminal statuses, the same stale-tab
protection every existing transition uses), clears `replied_at`, files a
`recordActivity` audit entry, sends the resident email where `notify` is true,
stamps `notified_at`, and revalidates the manager path.

`entry_type` is derived, not client-supplied: `"info-request"` when `setStatus` is
`awaiting-info`, otherwise `"staff-note"`.

**`postTicketUpdate` never touches `reviewed_by`/`reviewed_at`,
`closed_*`/`released_*`/`decided_*`, or `remarks`.** Those columns belong to the
decision actions and record *who decided what, when*. Moving a ticket to
`under-review` is not a decision, so an application that reaches `approved` later
still gets its `reviewed_at` stamped by `reviewApplication` at that moment. This
also means `remarks` continues to hold the latest decision's reason, unchanged and
un-deprecated — `tickets_view` exposes it and `TicketLookupResult.remarks` reads
it. The log supplements `remarks`; it does not replace it.

**Two doors into `under-review`, on purpose.** Applications and appointments enter
it only through `setStatus`, since neither has an existing action that produces it.
Complaints and assistance keep `reviewComplaint`/`reviewAssistance` as their
primary door (unchanged — those actions still write `reviewed_at`, which
`setStatus` does not) and gain `setStatus` as a second. Calling
`reviewComplaint` on an already-`under-review` complaint is idempotent and
harmless once the guard widens; it re-stamps `reviewed_at`, which is correct — it
was reviewed again.

## 4. Machine-written status entries

A shared helper `recordTicketUpdate()` in `src/lib/ticket-updates.ts`,
deliberately shaped like `recordActivity()` in `src/lib/audit.ts` so the two read
as siblings. It is called with `author_kind: "system"`, `visibility: "public"`,
`entry_type: "status"` from:

- the four public submission actions and the four walk-in create actions
  (intake row, status = the intake status);
- all eight transition actions (`reviewApplication`, `releaseApplication`,
  `reviewAppointment`, `completeAppointment`, `reviewComplaint`, `closeComplaint`,
  `reviewAssistance`, `decideAssistance`).

This is what makes the timeline one ordered source rather than two that can
disagree. The body is the transition's own `remarks` where it has one, otherwise
empty (the timeline supplies default wording per status).

`ticket_updates` is **not** a replacement for `audit_log`, and the two are not
merged. `audit_log` records staff actions for accountability across every module;
`ticket_updates` is resident-facing content for one module. The same distinction
the Resend design drew when it specified a separate `email_log` rather than
overloading `audit_log`.

## 5. Resident replies

### 5.1 Reading the timeline

`loadTimeline(ticketNo)` in `src/features/track/actions.ts` fetches
`ticket_updates` for the ticket with `.eq("visibility", "public")`.

**That one filter is the entire guarantee that a complaint's internal staff
coordination never reaches the reporter, and it lives in the query layer, not the
component** — the same structural choice `loadExtras` already makes by simply not
selecting a complaint's `narrative`, `respondent` or `location`.

`TicketLookupResult` gains `timeline: TicketUpdateEntry[]`.

### 5.2 Writing a reply

New public Server Action `submitTicketReply` in `src/features/track/actions.ts`,
in this exact order (security-hardening spec §5 mandates Turnstile first, so a
failed challenge is the cheapest rejection and never spends rate-limit budget):

1. `verifyTurnstileToken(token, ip)` → `TURNSTILE_FAILURE_MESSAGE` on failure.
2. `checkRateLimit` on `reply:ip:<ip>` and `reply:ticket:<ticketNo>`.
3. Zod validation of body and files.
4. **Re-verify `ticket_no` + last name through the same `sameSurname` gate
   `lookupTicket` uses.** Not optional: a Server Action is a public HTTP
   endpoint, and having been on the results page proves nothing about the next
   POST. `sameSurname`'s NFC normalisation matters here for the same reason it
   does in lookup — "Peña" must match whichever way it was typed.
5. Assert `status === "awaiting-info"`. Any other status is not repliable.
6. Upload attachments to `ticket-media`.
7. Insert the `resident-reply` row.
8. Flip status `awaiting-info → under-review`, set `replied_at = now()`.
9. Email every holder of that queue's permission via the existing
   `staffEmailsFor()`.

**Every rejection from steps 4 and 5 returns the same generic `NOT_FOUND` string
`lookupTicket` already uses**, so the endpoint cannot be used to confirm that a
ticket exists or to learn its status.

If step 7 fails after step 6 succeeded, the uploaded objects are
compensating-deleted before returning — the `fail()` pattern
`saveLegislative` established. A failure at step 8 or 9 does not roll back the
reply: the row is the resident's evidence that they answered, and losing it is
worse than a status left at `awaiting-info` that staff can move by hand.

### 5.3 When the composer appears

**Only while `status === "awaiting-info"`.** It appears when staff have actually
asked for something and disappears the moment the resident answers or the ticket
closes.

This keeps `/track` scoped to "answer the specific question we were asked" rather
than becoming a second, unmonitored inbox with file attachments competing with
`/contact`. It is the same boundary the feedback design drew when it ruled that
anything needing an answer goes through `/contact`.

## 6. UI

### 6.1 Public — `/track`

`ticket-timeline.tsx` renders the log in `created_at` order, then **one** greyed
trailing step derived from the current status ("Released — waiting to be claimed
at the barangay hall"). A pure append-only log would lose the resident's sense of
what is still ahead; the current three-step diagram loses everything that happened
in between. One trailing derived step is the smallest thing that keeps both.

The existing per-kind `COPY` map survives but shrinks: it now supplies only the
trailing "what's next" line per (kind, status), not a whole three-step skeleton.
`buildSteps` stays a pure function.

Resident replies render as their own entry, visually distinguished so a resident
can see what they sent and when. When status is `awaiting-info`, a highlighted
card below the timeline holds the reply composer: a textarea, a file picker
(pure — no network call until submit, matching every uploader in this codebase
except `AchievementPhotoUploader`), a `TurnstileWidget`, and a submit button.

The composer follows the established public-form shape: `try` / `catch` setting an
inline recoverable message / `finally`, with a dismissible `InlineAlert` — never a
bare `try`/`finally`, which falls through to a full-page `error.tsx` crash and
loses what the resident typed.

### 6.2 Admin

One new shared component, `TicketTimelinePanel`, mounted in all four existing
review drawers (`application-`, `appointment-`, `complaint-`,
`assistance-review-drawer.tsx`). It renders:

- the full log **including** internal notes, visually distinct — muted background,
  a lock icon, and the literal words "Internal — not visible to the resident", so
  a staff member cannot mistake one for something the resident has seen;
- resident attachments as signed-URL links (10-minute TTL, rendered `unoptimized`
  if any preview is ever added, for the reason `feedback-drawer.tsx` already
  documents: a URL that expires in ten minutes has nothing worth caching);
- "Resident notified" where `notified_at` is set;
- the composer from §3.

The four queue managers gain "Awaiting Information" as a status filter value and a
"New reply" pill on rows where `replied_at` is set.

Every `startTransition` call the panel adds wraps its action in
`try`/`catch { showError(...) }`, per the sweep that covered all 76 existing
blocks.

## 7. Email

Two new templates, both composed inside the shared `<EmailLayout>`:

**`TicketUpdateEmail`** — covers both a plain update and an information request
via a `needsInfo: boolean` prop rather than two near-identical files, the same DRY
reasoning that produced the shared `<TicketNotice>`. It reuses `<TicketNotice>` for
the ticket-number treatment and the "Track this ticket" button; when `needsInfo`
is true the button copy becomes "Send the information".

**`TicketReplyStaffNotifyEmail`** — staff-facing: a reply arrived, how many files
came with it, and the admin deep link. **It does not echo the reply body.** For a
complaint that body can contain incident detail, and the restraint
`ComplaintSubmittedEmail` already applies (never echoing a narrative, even to the
reporter's own inbox) applies here too.

`TicketUpdateEmail` carries **only what staff typed into the update body** — never
any field read from the ticket row itself. That keeps the "complaints show status
only" rule intact by construction rather than by review.

Every send follows Plan 1's established shape unchanged: `await`ed, never
fire-and-forget; the resident's `email` column null/`""`-checked before sending;
the caller never inspects `sendEmail()`'s return value; fail-open throughout, since
the DB write has already committed and an email failure must never surface as a
failed staff action.

`staffEmailsFor()` needs no changes — it already resolves recipients from a
`Permission`, and all four ticket permissions are ordinary members of that enum.

## 8. Migration and deploy

**`supabase/migrations/0032_ticket_updates.sql`**, one migration, five parts:

1. Drop and recreate the `status` check constraint on all four ticket tables with
   the new values.
2. `add column replied_at timestamptz` × 4.
3. Create `ticket_updates`, its indexes, and RLS (enabled, zero policies).
4. Create the private `ticket-media` bucket — same shape migration `0028` used for
   the 14 media buckets, minus any read policy.
5. Backfill a log row per existing ticket so no live ticket renders an empty
   timeline.

**The backfill needs explicit per-table rules, and the plan must spell them out
rather than leave them to whoever writes the SQL.** Each ticket gets an intake row
at `created_at`; a row at `reviewed_at` where non-null; and a row at the stage-2
timestamp (`released_at` / `completed_at` / `closed_at` / `decided_at`) where
non-null. The `status` value on a historical `reviewed_at` row must be **inferred**,
because the column was overwritten — an application now `released` was `approved`
at its `reviewed_at`. That is a `CASE` per table. The existing `remarks` string
becomes the body of the latest synthesized row for that ticket, since that is the
transition it actually describes. `remarks` itself is **not** dropped or emptied by
the backfill (§3): it stays the live "latest decision reason" column.

**Deploy order — the same hazard class as `0031`:** apply `0032` before this
code reaches an environment. List queries select `replied_at` and the drawers
write `ticket_updates`; a missing column fails at runtime. Staging first, verified,
then production.

**`scripts/report-orphaned-media.mjs` must gain a `ticket-media` case**, checking
objects against `ticket_updates.attachments`. Because that is a jsonb array it
needs its own extraction rather than the plain-column pattern the script uses for
`site_items.image_path`, `profiles.avatar_src` and `feedback.screenshot_path`.
This is not optional housekeeping: the script silently reported zero orphans on
every run for a period after the media-bucket split because it was not updated,
and this feature adds a bucket with a *known* orphan window (§5.2 step 6
succeeding and step 7 failing, outside the compensating delete's reach — a dropped
connection).

## 9. Testing

- **Unit** (`tests/unit/`): `buildSteps` is pure and currently has **zero** tests
  despite being the entire public timeline. It gets real coverage here, including
  the shape-level assertion that internal entries are absent. Plus a small pure
  `canReply(status)` helper.
- **E2E, highest value:** staff post an **internal** note on a complaint; a public
  `/track` lookup of that same ticket then asserts the note's text is **not** in
  the DOM. That single test is what stands between this feature and leaking staff
  coordination notes to a reporter.
- **E2E:** the reply round trip — `awaiting-info` shows the composer, a submitted
  reply appears in the timeline, status flips, composer disappears.
- **Rate-limit non-idempotency:** the reply spec spends a `reply:ip:*` budget per
  run, joining `tests/e2e/admin/login.spec.ts` and
  `tests/e2e/public/feedback.spec.ts` on the list of suites that cannot be re-run
  inside their window. This must be documented in CLAUDE.md's Commands section
  alongside the existing two, or the next person reads a collision as a regression.

## 10. Out of scope

Deliberately excluded, each a separate feature rather than a corner of this one:

- **Inbound email parsing.** A reply arrives via `/track`, not by answering the
  notification. Parsing inbound mail means a webhook, MIME handling, and a spoofing
  surface with no authentication story.
- **Resident accounts.** The ticket number + surname gate stays the whole auth
  model.
- **SMS.** `contact_number` is collected on every ticket, but no SMS provider is
  integrated and none is designed.
- **Staff attachments.** Staff describe what they need in text; they do not send
  files back. Adding it means a second upload path, a second bucket-resolution
  rule, and public exposure of staff-uploaded files.
- **Badging replies distinctly from new tickets.** `replied_at` folds into the
  existing count; it does not get its own badge colour or its own row in the bell
  dropdown.

## File inventory

**New (~14)**

| Path | Purpose |
|---|---|
| `supabase/migrations/0032_ticket_updates.sql` | schema, bucket, backfill |
| `src/lib/ticket-updates.ts` | `recordTicketUpdate()`, pure status/transition helpers |
| `src/features/admin/actions/ticket-updates.ts` | `postTicketUpdate` |
| `src/features/admin/queries/ticket-updates.ts` | log fetch + signed attachment URLs |
| `src/features/admin/components/ticket-timeline-panel.tsx` | log + composer, shared by 4 drawers |
| `src/features/track/components/ticket-reply-form.tsx` | public composer |
| `src/emails/TicketUpdateEmail.tsx` | resident update / info request |
| `src/emails/TicketReplyStaffNotifyEmail.tsx` | staff notification |
| `tests/unit/ticket-timeline.test.ts` | `buildSteps`, `canReply` |
| `tests/e2e/public/track-reply.spec.ts` | reply round trip |
| `tests/e2e/admin/ticket-updates.spec.ts` | internal-note leak test |

**Modified (~20)**

| Path | Change |
|---|---|
| `src/types/index.ts` | 4 status unions, `TicketUpdateEntry`, `TicketLookupResult.timeline` |
| `src/features/admin/components/status-chip.tsx` | `awaiting-info` label + tone |
| `src/features/admin/actions/{applications,appointments,complaints,assistance}.ts` | log rows, widened transition guards |
| `src/features/{services,appointments,complaints,assistance}/actions.ts` | intake log rows |
| 4 review drawers + 4 managers | mount panel, status filter, reply pill |
| `src/features/track/actions.ts` | `loadTimeline`, `submitTicketReply` |
| `src/features/track/components/ticket-timeline.tsx` | log rendering + trailing step |
| `src/lib/notifications.ts` | optional `replyColumn` |
| `src/lib/storage.ts` | `TICKET_MEDIA_BUCKET`, reply limits |
| `scripts/report-orphaned-media.mjs` | `ticket-media` case |
| `docs/BACKEND_HANDOFF.md` | ticketing sections' mid-flow-email gaps closed |
| `CLAUDE.md` | new architecture bullet + Commands rate-limit note |
