# Applications form fields: middle name, date of birth, and relaxed purpose/remarks

**Date:** 2026-08-05
**Status:** approved, ready for implementation

## Problem

The applications flow collects a first and last name only. A barangay certificate carries
the resident's full legal name, and staff issuing one have to ask for the middle name by
phone. Several of these documents also need a date of birth. Separately, `purpose` and the
reviewer's `remarks` are both mandatory today, which blocks the ordinary counter case where
neither is known or needed.

## Scope

Four field changes, **on the applications flow only** — the public apply form at
`/services/[slug]/apply`, the admin walk-in encode drawer, and the review drawer:

| Field | Change |
| --- | --- |
| Middle name | New. Optional. Blank stores `null`. |
| Date of birth | New. Required. Rejected if blank, in the future, or before 1900. |
| Purpose | Was required (min 4). Now optional; blank stores `null`. |
| Remarks | Was required when rejecting. Now always optional. |

Appointments, complaints and assistance are untouched. They keep the shared `residentFields`
identity block exactly as it is, which is why the two new field schemas live in the
applications feature rather than in `src/lib/public-forms.ts` — putting an applications-only
field in a module whose docstring reads "field schemas shared by the four public ticket
forms" would make that statement false.

## 1. Database — migration `0033_application_name_parts.sql`

```sql
alter table public.applications add column middle_name text;
alter table public.applications add column birth_date date;
alter table public.applications alter column purpose drop not null;
```

`remarks` needs no DDL — it has always been nullable, and only the Zod refine made it
mandatory.

Both columns are nullable even though the birthday is a required field. Every existing row
has no value for it, so `not null` would fail the alter outright. "Required" is enforced in
Zod, at both the public schema and the walk-in schema — the same place every other bound on
this table already lives. `address` and `purpose` have no DB-level constraint either; a check
constraint here would be the only one of its kind, and one written against `current_date`
would not be immutable.

`middle_name` is stored `null`, never `''`, when not given — matching how `email` already
treats "not given" on this same table.

### `tickets_view` is not touched

The view backing `/track` deliberately carries only the fields common to all four kinds, and
its own header records that type-specific columns stay out so a complaint's narrative cannot
leak through a future `select *`. A date of birth is a stronger identifier than anything
currently in that view, and the surname gate already performs the identity check, so adding
it would be a privacy regression for no gain.

### Baseline

`supabase/migrations/README.md` requires every new migration to land in
`supabase/baseline/0000_baseline_2026-07-23.sql` in the same commit. `0032_ticket_updates.sql`
was never folded in, and CLAUDE.md's instruction for that gap is to fold it in rather than
add a second "run X after the baseline" step. So **both `0032` and `0033` are folded into the
baseline in this change**, and CLAUDE.md's note about `0032` being outstanding is removed.

### Deploy order

Same hazard class as `0031` and `0032`. Apply `0033` to staging, verify, then production,
**before** this branch's code reaches either environment. `listApplications` selects the new
columns and both inserts write them; a missing column fails at runtime, not at build.

## 2. Field schemas — `src/features/services/schema.ts`

`applicationSchema` already spreads `residentFields` and adds its own `purpose` and
`consent`. The two new fields join it there, and `residentFields` is not modified:

```ts
middleName: z.string().trim().max(80, "Middle name is too long."),
birthDate: z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth.")
  .refine((value) => value <= manilaToday(), "Your date of birth cannot be in the future.")
  .refine((value) => value >= "1900-01-01", "Enter your date of birth."),
```

An empty middle name is valid — that is what "optional" means here — and the action maps
`""` to `null` on insert, the same shape `optionalEmailField` established.

`birthDate` is modelled on `complaintSchema.incidentDate`, the existing date field on a
public form. Both bounds are lexicographic string comparisons against zero-padded
`YYYY-MM-DD`, never a parsed `Date` — the same contract `manilaTodayNextYear` documents.

`purpose` drops its `.min(4, "Tell us what the document is for.")` and keeps only the 500
cap. The upper bound stays because these are unauthenticated endpoints writing to
unconstrained `text` columns, which is the reason `public-forms.ts` gives for capping every
free-text field; only the floor was a policy choice, and it is the one being reversed.

## 2b. Remarks — the rule being reversed

`reviewSchema` currently carries:

```ts
.refine((value) => value.status !== "rejected" || value.remarks.length > 0, {
  error: "Remarks are required when rejecting an application.",
  path: ["remarks"],
})
```

with a matching client-side guard in `application-review-drawer.tsx`. Both are removed. That
refine implemented "spec §3: every negative decision must carry a reason the resident can
read", so removing it is a deliberate reversal of that rule, not an oversight, and it has two
visible consequences that are accepted:

- `ApplicationRejectedEmail` passes `remarks` straight to `TicketNotice`, which already
  renders nothing for a falsy value. A rejection email can therefore arrive with no "Reason"
  block at all.
- The `ticket_updates` entry for the rejection gets an empty `body`, so `/track`'s timeline
  shows the status change with no explanation beside it.

No fallback copy is invented to paper over either. An empty reason renders as absent, because
inventing a reason the reviewer did not give would be worse than showing none.

## 3. Display name — `src/lib/resident-name.ts`

The applications queue table renders `First M. Last`. That is one pure function rather than a
template inlined at the two places in the manager that build a name:

```ts
export function residentDisplayName(
  firstName: string,
  middleName: string | null,
  lastName: string,
): string
```

The middle name contributes its first character plus a period. A blank or null middle name
contributes nothing and the result is plain `First Last`, which is what every pre-migration
row renders as. Multi-word middle names ("Dela Cruz", the common Philippine maternal
surname) yield a single initial from the first character — `Juan D. Cruz` — which is the
conventional rendering.

It lives in `src/lib/` rather than the applications feature because it describes a resident's
name, not an application, and the other three managers are the obvious next callers if this
ever widens. It is pure, so it is unit-tested.

The review drawer does **not** use this helper: it shows the middle name in full, because the
drawer is where staff read the record before issuing a document with the full legal name on
it.

## 4. Public apply form

The identity row goes from two columns to three, and the birthday pairs with the contact
number:

```
[ First name  | Middle name (optional) | Last name ]
[ Date of birth            | Contact number       ]
[ Address                                         ]
[ Email (optional)                                ]
[ Purpose (optional)                              ]
```

The birthday is a native `type="date"` input with `max={manilaToday()}`, matching the
incident-date field on the complaint form. The `EMPTY` constant gains the two keys. The
purpose field keeps its textarea and only its label changes.

## 5. Walk-in encoding (admin)

The walk-in drawer gains the same two inputs in its existing `sm:grid-cols-2` layout. The
`walkInSchema` in `src/features/admin/actions/applications.ts` gains the matching fields with
staff-facing copy ("Enter the applicant's date of birth."). That schema is duplicated from
the public one by existing convention — a walk-in row and an online row must be constrained
identically but the admin action does not import the public schema — and this change keeps
that as it is rather than refactoring mid-feature.

## 6. Admin read side

- `listApplications` selects `middle_name` and `birth_date` and maps them to `middleName` /
  `birthDate`.
- `ApplicationRow` gains `middleName: string | null` and `birthDate: string | null`, and
  `purpose` widens to `string | null`.
- The review drawer's `Purpose` detail row and the manager's search haystack both handle a
  null purpose; the drawer shows `—`, matching how it already renders absent remarks.
- The manager's queue row renders `residentDisplayName(...)`. The `applicant` sort key stays
  `last + first`, with no middle name in it — sorting a queue by a middle initial is
  meaningless.
- The search haystack gains `middleName`, so a resident can be found by it.
- The review drawer renders the full name including the middle name, and adds a `Date of
  birth` detail row. A pre-migration row shows `—`, which is exactly why the columns are
  nullable.

## 7. Explicitly out of scope

- **The other three ticketing flows.** Unchanged.
- **Email templates**, except where a now-nullable field forced a change:
  `ApplicationSubmittedEmail`'s `purpose` prop widens to `string | null` and its
  "Purpose" detail line is omitted when empty, because `TicketNotice` renders a detail line
  unconditionally and would otherwise print a bare `Purpose:`. `ApplicationRejectedEmail`
  needs no change — `TicketNotice` already skips a falsy `remarks`. Nothing echoes the
  birthday or the middle name back at the resident; a receipt has no reason to, and
  `TicketNotice` is deliberately lean.
- **`/track`.** Nothing the resident sees changes.
- **Notification bell labels.** They stay `First Last`; they are a glance surface, not a
  record.
- **Age.** Nothing derives or stores an age. The birthday is the fact; an age is a
  presentation of it at a point in time, and no current requirement needs one.

## 8. Testing

- `tests/unit/resident-name.test.ts` (new) covers `residentDisplayName` — with a middle name,
  with `null`, with `""`, with whitespace only, and with a multi-word middle name.
- `tests/unit/application-schema.test.ts` (new) covers all four field changes on
  `applicationSchema`: a blank middle name passes, an 81-character one fails, a blank
  birthday fails, a future birthday fails, an 1899 birthday fails, a valid one passes, a
  blank purpose passes, and a 501-character purpose still fails.
- `tests/unit/application-emails.test.ts` (exists) gains a case for a null purpose — the
  rendered receipt must contain no `Purpose:` label at all.
- `tests/e2e/admin/ticket-updates.spec.ts` encodes walk-in **complaints**, not applications,
  so it needs no change. It is re-run to confirm that.
