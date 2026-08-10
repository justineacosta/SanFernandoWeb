# Assistance and Appointments on the Services page — design

**Date:** 2026-08-10
**Status:** approved, not yet implemented
**Migration:** `0035` (one migration covers the whole spec)

## 1. Problem

`/services` lists only the DB-backed `services` rows — three document applications and
one complaint flow. Two of the barangay's four ticketing flows are missing from it:

- **Social Services Assistance** (`/assistance/new`)
- **Set an Appointment** (`/appointments/new`)

Today both are reachable *only* from the home page's `QUICK_SERVICES` shortcut cards. A
resident who navigates to the Services page — the page whose own hero calls itself the
"Official Services Directory" — cannot find either one, and nothing on the page hints
they exist.

Both forms are also thinner than the apply flow they sit beside. `ApplyForm` opens with a
brand-tinted "Bring these when you claim your …" card; neither of these does. The
appointment date field accepts weekends the hall is closed on. The assistance category
picker is a bare list of labels with no guidance about what to prepare, and a resident
with a medical abstract in hand has no way to attach it until staff explicitly ask for it
through an `awaiting-info` round trip.

## 2. Scope

Two halves, both approved:

1. **Placement** — both flows appear as cards in the existing services directory grid.
2. **Flow improvements** — four for appointments, three for assistance (§5, §6).

Out of scope, stated so nobody reads them as covered:

- **Public holidays.** §5.1 blocks weekends only. There is no holiday table in this
  project and building one is its own feature.
- **Complaints and applications.** Untouched apart from the `flow` column backfill in §4.
- **Appointment capacity.** §5.4 renders a coarse busyness hint. It is a hint, not a
  booking limit — nothing rejects a submission for a "full" day, because no capacity
  model exists.

## 3. Decisions taken before designing

Both settled with the project owner up front:

- **Placement: inline in the existing grid**, not a separate section below it. Residents
  see one complete directory. `Blotter & Complaints` already set the precedent that a
  non-document flow can live in that grid as a service card.
- **Content source: `services` table rows**, not a code constant. Staff can reword,
  reorder, and toggle availability on both cards from the existing admin Services
  manager, the same as every other card in the grid.

That second decision sits in tension with CLAUDE.md's standing rule that links to this
site's own routes belong in code, not the CMS — the rule that pulled `QUICK_SERVICES` back
out of `site_items` in migration `0022`. §4 resolves the tension rather than overriding
the rule: the **copy** lives in the CMS, the **route** stays in code.

## 4. Placement

### 4.1 The `flow` column

```sql
alter table public.services
  add column flow text not null default 'apply'
    check (flow in ('apply', 'complaint', 'assistance', 'appointment'));

update public.services set flow = 'complaint' where tone = 'danger';
```

Routing today is *inferred from `tone`* in `service-card.tsx`: `danger` means
`/complaints/new`, anything else means `/services/apply/{id}`. That conflates a visual
property with a behavioural one and has no room for a third or fourth destination.
`flow` names the destination explicitly; `tone` reverts to meaning only what it looks
like.

A `flow` **name** rather than an `href` **string** is the whole point. A free-text href
column would let a staff member point a card at a typo, an external site, or a route that
no longer exists — exactly what the `QUICK_SERVICES` rule exists to prevent. A CHECK-
constrained name can only ever be one of four values the code already knows how to route.

`not null default 'apply'` matters beyond convenience: `search_admin_global` builds each
row's haystack by concatenating columns with `||`, and `text || null` is `NULL` in
Postgres — the trap that made every `purpose`-less application vanish from admin search in
`0033`. A non-null column cannot reproduce it. `0035` therefore does **not** need to
redefine `search_admin_global`; its services branch selects `s.title, s.department` only,
neither of which changes.

### 4.2 Routing

New pure module `src/features/services/flow.ts`:

```ts
export function serviceHref(service: Pick<Service, "id" | "flow">): string {
  switch (service.flow) {
    case "complaint":   return "/complaints/new";
    case "assistance":  return "/assistance/new";
    case "appointment": return "/appointments/new";
    case "apply":       return `/services/apply/${service.id}`;
  }
}
```

Pure and exhaustive over the union, so adding a fifth flow to `ServiceFlow` without adding
its route is a type error rather than a silent fallthrough. Unit-tested (§7).

`ServiceCard`'s two-branch ternary at `service-card.tsx:49-62` collapses to
`serviceHref(service)`. The button **variant** stays keyed on `tone` — that is the one
thing tone should still decide.

### 4.3 The apply-page guard

`getApplyService` currently returns `null` when `data.tone !== "primary"`. That check is
doing double duty: it is nominally a tone check, but its actual job is "this row is not a
document application, do not render an apply form for it." It must become
`data.flow !== "apply"`.

Without this change, `/services/apply/social-services-assistance` would render a full
document-application form — resident fields, requirements card, submit — against a row
that has no application table behind it. The two new rows are `tone = 'primary'`, so the
existing check would pass them.

### 4.4 Types and admin

- `Service` gains `flow: ServiceFlow`; new `ServiceFlow` union type in `src/types/index.ts`
  beside `ServiceTone`.
- `listServices` and `getApplyService` select `flow`.
- `ServiceFormValues` gains `flow`. `service-form.tsx` gains a **Destination** select
  beside the existing Type select: `Apply form` / `Complaint form` / `Assistance form` /
  `Appointment form`. The existing Type select's option labels ("Standard (Apply Online)",
  "Urgent / Report (File Incident Report)") lose their parenthetical CTA hints, which are
  no longer true now that destination is separate — they become "Standard" and
  "Urgent / Report".
- `createService` / `updateService` validate `flow` against the same four values.

**`labelsForTone` becomes `labelsForFlow`.** `requirements_label` and `cta_label` are not
editable fields — `services.ts:30-34` *derives* them from `tone` on every create and
update. Left alone, the §4.6 seed rows' labels ("What to prepare" / "Request Now", "How it
works" / "Book Now") would be silently reset to "View Requirements" / "Apply Online" the
first time a SuperAdmin saved any edit to those rows — a bug that would surface days later,
far from its cause, and look like the seed data was wrong.

Deriving from `flow` instead of `tone` is also simply more correct now: the CTA names the
destination, and `flow` is what the destination *is*.

| flow | requirements_label | cta_label |
| --- | --- | --- |
| `apply` | View Requirements | Apply Online |
| `complaint` | View Process | File Incident Report |
| `assistance` | What to prepare | Request Now |
| `appointment` | How it works | Book Now |

The seed values in §4.6 are exactly this table's rows, so a save is a no-op rather than a
rewrite. `tone` no longer feeds label derivation at all — it is purely visual, as §4.1
intends.

### 4.5 Dead code removed

`src/features/services/data.ts` exports `SERVICES`, a static mock of the four seeded rows
left over from the pre-backend build. Nothing imports it (grep-verified: the only
occurrence in `src/` is its own declaration). Adding a required `flow` field to `Service`
would break its typecheck, so it is **deleted** rather than updated — maintaining a dead
constant is worse than either. `WASTE_SCHEDULE`, in the same file and genuinely used by
`WasteScheduleSection`, stays.

### 4.6 Seed rows

```sql
insert into public.services
  (id, title, description, icon_name, tone, requirements_label, cta_label,
   requirements, department, sort_order, flow)
values
  ('social-services-assistance', 'Social Services Assistance',
   'Medical, burial, financial and calamity aid for residents in need. The Barangay Social Welfare Desk reviews every request.',
   'hand-heart', 'primary', 'What to prepare', 'Request Now',
   array['Valid ID of the person needing help',
         'Barangay Certificate of Indigency, if you already have one',
         'Documents supporting your case (medical abstract, death certificate, damage photos)'],
   'Barangay Social Welfare Desk', 5, 'assistance'),
  ('set-an-appointment', 'Set an Appointment',
   'Reserve a time to meet an official or follow up on a transaction, so you are not waiting at the hall.',
   'calendar-days', 'primary', 'How it works', 'Book Now',
   array['Pick a weekday — the hall is closed on weekends',
         'Tell us what the visit is about',
         'Staff confirm your slot before you come',
         'Bring a valid ID on the day'],
   'Office of the Barangay Secretary', 6, 'appointment');
```

`sort_order` 5 and 6 place both after the four existing rows (1-4).

The assistance card uses **`hand-heart`, not `heart-handshake`** — the latter is already
`certificate-of-indigency`'s icon, and two identical icons in one six-card grid reads as a
bug. Both values are in `ICON_OPTIONS`.

`requirements_label` differs per card because the lists differ in kind: assistance lists
documents to prepare, appointments lists how the request is handled.

Titles match the `QUICK_SERVICES` wording on the home page exactly, so a resident who saw
the shortcut there recognises the card here.

## 5. Appointments

### 5.1 Closed days

New pure helper, unit-tested:

```ts
export function isClosedDay(iso: string): boolean  // Saturday or Sunday
```

It reads the day via `getUTCDay()` on a `YYYY-MM-DD` string. `new Date("2026-08-16")`
parses as UTC midnight, so `getUTCDay()` is the calendar day of that date regardless of
where the server or the browser is. `getDay()` would shift by one for half the world and
must not be used — the same class of trap that makes `complaintSchema.incidentDate` and
`applicationSchema.birthDate` compare date strings lexicographically instead of parsing
them.

Added as a third `.refine()` on `appointmentSchema.preferredDate`, after the existing
not-in-the-past and within-a-year rules:

> "The barangay hall is closed on weekends. Please pick a weekday."

Because `appointmentSchema` is shared by `appointment-form.tsx` and `submitAppointment`,
this is enforced on the client and on the server from one declaration. The form's
`<Input type="date">` keeps its `min={manilaToday()}`; native date inputs cannot disable
weekends, so the inline validation message is the only feedback — which is why it names
the reason rather than saying "invalid date."

**Deliberately not applied to the walk-in path.** `walkInSchema` in
`src/features/admin/actions/appointments.ts` and the review drawer's propose-a-different-
date field keep accepting any weekday-or-weekend date: a staff member scheduling a
weekend special session knows something the rule does not. The rule exists to stop a
*resident* filing a request that will certainly be declined.

### 5.2 "Before you book" card

A brand-tinted `Card` above the form, reusing the exact markup of `apply-form.tsx:153-167`
(`rounded-3xl border-brand-200 bg-brand-100/50 p-6`, `CheckCircle2` bullets). Content:

- Office hours, from `SITE.officeHours` — never a second hardcoded copy of that string.
- Bring a valid ID on the day.
- The date you pick is a request; staff confirm the slot.

That third line already appears on the success receipt (`appointment-form.tsx:119-122`).
Saying it *before* submitting is the point — a resident who learns it only after filing
has already formed the wrong expectation.

Static copy in code, not the CMS: it describes how the form behaves, and it changes when
the form changes.

### 5.3 Purpose quick-picks

A `PURPOSE_PRESETS` constant renders as a row of chips above the purpose textarea:
Consultation with an official / Document follow-up / Complaint mediation / Business
inquiry.

Click behaviour: **fill when the textarea is empty, append on a new line otherwise**, then
focus the textarea with the caret at the end. Never destructive — a resident who has typed
three sentences and taps a chip out of curiosity does not lose them — and never inert,
which a "only fills when empty" rule would make it. Repeated clicks appending twice is
visible and self-correcting.

Chips are `type="button"` and carry no `aria-pressed`: they are insert actions, not
toggles, and nothing about them persists as state.

The preset text comfortably clears `purpose`'s `.min(4)`.

### 5.4 Busyness hint

**Shape, and why it changed.** The obvious build is a client-side lookup that re-queries as
the resident changes the date. That needs a new public Server Action reading
`appointments` — a table with zero public read paths today — plus its own rate-limit
budget, plus a decision about whether to Turnstile-gate a call that fires on every
keystroke in a date field. All of that is new attack surface for a hint.

Instead: `/appointments/new` is already a Server Component, so it loads the counts **once
at render** and passes them to `AppointmentForm` as a prop.

```ts
// src/features/appointments/queries.ts
export async function loadAppointmentDemand(): Promise<AppointmentDemand>
// { "2026-08-14": { am: 4, pm: 1 }, … } for today .. today+60d
```

Selects `preferred_date, preferred_period` where the date is in range and `status` is not
`declined` or `completed`, then tallies in JS. No RPC, no new index — 60 days of barangay
appointments is a small result set. Aggregate counts only; no names, no ticket numbers, no
row identity ever leaves the server.

Consequences on the record:

- The route becomes **dynamic** (a DB read at render). `/assistance/new` already is, for
  the same reason.
- The numbers are **as of page load**. A form left open shows stale counts. Acceptable —
  it is a hint, and the alternative is the endpoint this design just avoided.

**Displayed coarsely, not as a raw count.** A pure `demandLabel(count)` maps to
`"Light" | "Moderate" | "Busy"` against two named threshold constants, rendered under the
period select as e.g. "Busy — afternoons this week are lighter." Showing "4 requests" would
invite a resident to read 4 as a limit when there is no limit, and exposes the barangay's
raw operational volume to anyone who loads the page. The label conveys the same actionable
information — pick a different slot — without either problem. Thresholds are unit-tested
(§7) so a later tuning pass has something to change deliberately.

A date with no entry in the map renders no hint at all rather than "Light", since absence
of data and genuine quiet look identical and only one of them is a claim worth making.

## 6. Assistance

### 6.1 Per-category guidance

```sql
alter table public.assistance_categories
  add column description text not null default '',
  add column requirements text[] not null default '{}';
```

Both `not null default`, for the §4.1 null-trap reason and so every pre-`0035` row stays
valid without a backfill.

- `AssistanceCategoryRow` gains `description: string` and `requirements: string[]`;
  `listActiveAssistanceCategories` selects them.
- On the public form, picking a category reveals the §5.2 card below the select, titled
  "What to prepare", listing that category's requirements with the description above them.
- **An empty category renders nothing** — no card, no empty heading. This is the project's
  existing "an empty block hides its section" rule from the `site_blocks` work, and it is
  what lets `0035` ship without content: every existing category starts empty, the form
  looks exactly as it does today, and each category lights up as staff fill it in.

**Admin editing.** `assistance-categories-panel.tsx` today has an inline editor driven by
`editingId` plus a single `editBuffer` string. It grows to three fields in that same
inline slot — label `Input`, description `Input`, and a requirements `Textarea` taking one
per line (the exact convention `service-form.tsx` already uses for the same kind of list).
Growing the existing expand-in-place mechanic is a smaller change than introducing a
`Drawer` to a panel that has never had one, and keeps the panel's rename/reorder/retire
affordances working unchanged.

`renameAssistanceCategory(id, { label })` becomes
`updateAssistanceCategory(id, { label, description, requirements })`. The rename is no
longer all it does, and a name that says otherwise would mislead the next reader.
`createAssistanceCategory` keeps taking a label only — a new category is created from the
inline "add" row and filled in afterwards through the editor.

### 6.2 Attachments at filing

Near-zero new schema, because the pieces already exist:

- `submitAssistance` **already** calls `recordTicketUpdate` for every submission
  (`assistance/actions.ts:88-95`).
- `recordTicketUpdate` **already** accepts an `attachments: TicketAttachment[]`.
- `uploadTicketAttachment(file, ticketNo)` and `discardTicketAttachment(path, context)`
  already exist in `src/lib/media.ts`, writing to the private `ticket-media` bucket.
- `discardTicketAttachment`'s path allow-list regex already covers the `AST-` prefix.
- `scripts/report-orphaned-media.mjs` already has a `ticket-media` case reading
  `ticket_updates.attachments`.

So this is: upload the files, and pass them to the call that is already there. **No new
column, no new bucket, no script change.**

**Signature.** `submitAssistance(values, files, turnstileToken)`. `File[]` as a plain
Server Action argument has precedent at `src/features/admin/actions/news.ts:102`;
`submitTicketReply` uses `FormData` instead, but only because it also carries the ticket
number and surname as form fields, which this action does not.

**Limits.** `MAX_TICKET_FILES` (3) × `MAX_TICKET_FILE_BYTES` (2 MB) = 6 MB, plus form
fields, under the existing `"8mb"` `bodySizeLimit`. Chosen to fit that ceiling rather than
raise it, for the reason the ticket-reply design already recorded: raising it widens the
limit for every public form at once. Types stay `ALLOWED_DOC_FILE_TYPES` (JPG/PNG/WebP/PDF).

**Rename.** `MAX_REPLY_FILES` / `MAX_REPLY_FILE_BYTES` in `src/lib/storage.ts` become
`MAX_TICKET_FILES` / `MAX_TICKET_FILE_BYTES`. Two flows share them now and the `REPLY`
names would be actively misleading at the new call site.

**Ordering, and the failure case.** The storage path is prefixed with `ticket_no`, which
does not exist until the row is inserted. So the order is: Turnstile → rate limit → Zod →
file count/type/size pre-check → category check → **insert** → upload each file → 
`recordTicketUpdate({ …, attachments })`.

That means a storage failure happens *after* the resident's ticket already exists. Failing
the whole submission at that point would be wrong — the ticket is real, and the resident
would refile and get a second one. Instead: discard any partial uploads via
`discardTicketAttachment`, record the timeline entry **without** attachments, and return
the ticket number along with a warning.

`SubmitTicketResult` is `{ error, ticketNo }`, where a non-null `error` means no ticket.
Returning both would break that contract for its four other callers, so assistance gets
its own type:

```ts
export interface SubmitAssistanceResult extends SubmitTicketResult {
  /** Non-null only alongside a successful ticketNo: the ticket filed, the files did not. */
  attachmentWarning: string | null;
}
```

Extending rather than widening the shared type mirrors `SignInFormState extends
AuthFormState`, which exists for the same reason — the base type must not carry a field
that is inert for most of its users.

The receipt renders the warning when present: *"We could not attach your files. Your
request is filed — you can add them by replying on the Track page."* That is actionable,
because the reply path accepts exactly these attachments.

Every file-level rejection the resident *can* fix (too many, too big, wrong type) is
caught in the pre-check **before** the insert, and returns a normal `error` with no
ticket — so the warning path is reserved for genuine storage failures the resident had no
part in.

**Client.** A file picker copied from `ticket-reply-form.tsx:127-140`, labelled "Supporting
documents (optional)", with the same helper line and the same per-file list. Consuming the
renamed shared constants, never its own copies.

### 6.3 "Before you file" card and character counter

Card, same treatment as §5.2:

- Reviewed by the Barangay Social Welfare Desk.
- A staff visit or follow-up call may follow.
- This is a request for assessment, not cash released on the spot.

Counter under the details textarea: `n / 20 characters minimum` while below the floor,
then `n / 2000` once above it, `aria-live="polite"`. `assistanceSchema.details` enforces
`.min(20)`, which is currently invisible until the resident submits and is turned away —
the counter makes the requirement legible while they are still typing.

## 7. Testing

**Vitest** (pure functions only, per the project's standing rule):

- `serviceHref` — all four flows, including that `apply` builds `/services/apply/{id}`.
- `isClosedDay` — Saturday and Sunday true, the other five false, and a date whose UTC and
  local weekday differ (guards the `getUTCDay()` choice specifically).
- `demandLabel` — both thresholds, at and either side of each boundary.

**Playwright, `public` project** (no login needed):

- `/services` renders both new cards, and their CTAs link to `/assistance/new` and
  `/appointments/new`.
- `/services/apply/social-services-assistance` does **not** render an application form —
  the §4.3 guard. Verified to fail without the guard, per this repo's "a guard that has
  never been seen to fail is not a guard" rule.
- `/appointments/new` rejects a Saturday with the weekend message.
- `/assistance/new` shows the "What to prepare" card after picking a category that has
  requirements, and shows nothing for one that does not.
- The assistance attachment round trip: file with a document attached, then confirm it
  reaches the ticket.

**Rate-limit cost, to be recorded in CLAUDE.md's Commands section** alongside the other
non-idempotent suites: the attachment test spends one `assistance:<ip>` hit against
`SUBMIT_LIMIT` = 5 per **hour**. Roughly 5 runs an hour before it fails on the limiter
rather than on a regression. A failure shortly after a recent run is a collision first, a
regression second.

## 8. Deploy

**Order matters — same hazard class as `0031`/`0032`/`0033`:**

1. Apply `0035` to **staging**, verify.
2. Apply `0035` to **production**.
3. Deploy this branch's code.

`listServices` selects `flow` and `listActiveAssistanceCategories` selects `description`
and `requirements`. A missing column fails at **runtime**, not at build — `npm run build`
will not catch a skipped migration, and the services grid and the assistance category
picker would both render empty (both queries log and return `[]` on error rather than
throwing).

`0035` is folded into `supabase/baseline/0000_baseline_2026-07-23.sql` **as it lands**,
keeping the baseline contiguous — the streak `0032`/`0033`/`0034` restored and CLAUDE.md
asks to maintain. The two seed rows in §4.6 go into the baseline too; unlike the demo news
and transparency content the baseline deliberately omits, these are real directory
entries, not placeholder content.

Migrations `0004`, `0007`, `0009` and `0021` are **not** retro-edited. They are historical
records, and rewriting them changes nothing in a database that already ran them.

## 9. CLAUDE.md

Updated in the same session as the code, per the project's standing rule. The bullets that
need to change:

- **Architecture** — a new bullet for the `flow` column: why routing moved off `tone`, why
  the column names a flow rather than storing an href, and that `getApplyService`'s guard
  is now the thing standing between a non-application row and the apply form.
- **Commands** — the assistance suite's rate-limit budget (§7).
- **Conventions** — the `SERVICES` mock deletion, and the `MAX_REPLY_FILES` →
  `MAX_TICKET_FILES` rename.
- **Placeholder reality** — the two new seeded service rows are real content, not
  placeholder.
