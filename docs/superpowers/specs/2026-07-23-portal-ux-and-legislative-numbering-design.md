# Portal UX fixes and structured legislative numbering — design

**Date:** 2026-07-23
**Status:** approved
**Scope:** five items — two admin UI corrections, one module extraction, one
public-site correction, and one schema change to `legislative_documents`.

Four of the five are self-contained. Item 5 carries migration `0024` and therefore a
baseline update, and is the only item that must be applied by hand to staging.

---

## 1. Admin global search: panel width must equal input width

### Problem

`src/features/admin/components/admin-global-search.tsx` wraps the input and the
results panel in one `relative` container. The container is `w-64` (256px); the
panel is a hardcoded `w-96` (384px) pinned `right-0`. The panel therefore
overhangs the input's left edge by 128px, which reads as a misalignment rather
than a deliberate flyout.

### Change

- Container `w-64` → **`w-80`** (320px).
- Panel `w-96` → **`w-full`**.

### Why `w-full` rather than a second fixed width

The container already carries `min-w-0`, which lets the search bar shrink between
`md` and roughly 980px, where the 256px sidebar plus the right-hand cluster would
otherwise overflow the viewport. A second hardcoded width would match at exactly
one viewport size and drift everywhere else. `w-full` resolves against the
container's rendered width, so the two stay equal at every size, including while
shrinking.

320px rather than staying at 256px because each result row carries a truncating
label, a truncating sublabel, and a status pill; at 256px a pill reading
"Under Review" leaves under 140px for the record label.

### Out of scope

The panel's `max-h-[70vh]`, its grouping, its keyboard behaviour, and the
debounce are untouched.

---

## 2. Sidebar collapse control: full disc → semi-circular tab

### Problem

The control in `src/features/admin/components/admin-sidebar.tsx` is a 28px disc
(`h-7 w-7 rounded-full`) centred on the rail's right border (`-right-3.5`, exactly
half its width). The owner wants a semi-circle.

### Change

Within the existing wrapper `<div>` that carries the positioning (the wrapper owns
placement because `Tooltip` measures its own span — hanging position off the button
collapses that span to zero and takes the tooltip elsewhere):

| | from | to |
|---|---|---|
| wrapper offset | `-right-3.5` | `-right-5` |
| size + radius | `h-7 w-7 rounded-full` | `h-11 w-5 rounded-r-full` |
| border | `border border-white/15` | `border border-l-0 border-white/15` |
| shadow | `shadow-[0_2px_10px_rgb(0_0_0/0.4)]` | `shadow-[2px_0_10px_rgb(0_0_0/0.4)]` |
| icon | `PanelLeftClose` / `PanelLeftOpen` | `ChevronLeft` / `ChevronRight` |

`-right-5` puts the tab entirely outside the rail so the flat edge sits flush
against it; `border-l-0` stops that flat edge being outlined against the rail it is
supposed to be part of. The shadow rotates because light now falls off to the right,
not downward.

The icon changes because a panel glyph is unreadable at 20px of usable width. A
chevron pointing left when expanded and right when collapsed is the direction the
click moves the rail.

### Unchanged

`Tooltip` label, `aria-label`, `aria-expanded`, `handleToggle`, and the
`sf-admin-sidebar` cookie read server-side in the layout.

---

## 3. Users Management as its own module

### Problem

`TeamManager` renders inside the right-hand column of `SettingsPanel`, below
Preferences, only when `currentUser.isSuperAdmin`. It is the portal's only CMS
surface without a route, a nav entry, or the table conventions every other manager
follows.

### Route and gate

- **`/admin/users`** — `src/app/admin/(portal)/users/page.tsx`, calling
  `requireSuperAdmin()`, plus a sibling `loading.tsx` matching the other admin
  routes.
- Nav entry appended to `ADMIN_NAV_ITEMS` in `src/features/admin/data.ts`:
  `{ label: "Users Management", href: "/admin/users", icon: UserCog, superAdminOnly: true, group: "system" }`,
  positioned **first within the System group**, i.e. immediately before
  `Services Management`.

`src/lib/admin-nav.ts` needs no change. `canSeeNavItem` already honours
`superAdminOnly`, and the sidebar, mobile drawer, `/admin` redirect and top-bar
title all derive from the same array. Placing the entry after every `requests` and
`content` item means `firstPermittedPath` is unaffected for non-SuperAdmins, and a
SuperAdmin still lands on Applications.

### Manager rebuild

`TeamManager` moves from a compact `<ul>` with an archived `<details>` disclosure to
the standard manager composition, matching `ServicesManager` and `OfficialsManager`:

| Region | Content |
|---|---|
| Header | `AdminPageHeader` "Users Management", description, `Add user` action |
| Filters | `AdminFilterBar` — search, plus a Role select (All / SuperAdmin / Editor / Staff) |
| View | `ViewToggle` on its own row below the header, `noun="users"` |
| Table | Name · Email · Role · Permissions · Status · Actions |
| Sorting | `SortableTh` + `useTableSort` on Name, Email, Role, Status |
| Paging | `AdminPagination`, `PAGE_SIZE = 10` |
| Rows | `RowActions` kebab |

The Role select is hidden in the Archived view for the same reason the other
managers hide their Status select there: it has nothing left to narrow.

The `<details>` disclosure and its explanatory footer are deleted — the Archived
view replaces both. The existing `AdminEmptyState` messages distinguish "nothing
archived" from "no match", as `OfficialsManager` does.

### Delete moves behind the archive gate

Delete currently appears on **active** rows. Every other module in the portal
reaches Delete only from an already-archived record, enforced server-side.

- **UI:** Delete appears only in the Archived view. Active rows keep Edit,
  Disable/Enable sign-in, and Archive.
- **Server:** `deleteTeamUser` gains an `is_archived` precondition, returning
  *"Archive this account before deleting it."* when the row is not archived.

This is an **additional** condition. The existing audit-log-emptiness check
("This user has recorded actions. Disable or archive instead of deleting.") and the
`wouldOrphanSuperAdmin` and self-deletion guards all remain. The UI must never be
the only gate.

### Revalidation

All six actions in `src/features/admin/actions/users.ts` currently call
`revalidatePath("/admin/settings")`. Every one becomes
`revalidatePath("/admin/users")`. Settings no longer renders any user data, so
revalidating it achieves nothing; missing this makes every save appear to do
nothing until the route cache expires.

### Settings after the extraction

`SettingsPanel` drops the `TeamManager` card, its `team`/`archived` props, and the
`isSuperAdmin` branch around it. `src/app/admin/(portal)/settings/page.tsx` drops
the `listTeamUsers` / `listArchivedTeamUsers` reads. The grid becomes
`lg:grid-cols-2` rather than `lg:grid-cols-[2fr_1fr]`, so the remaining Preferences
card is not stranded in a narrow column beside two tall ones. The `min-w-0` on both
grid items stays — it is what stops the mobile single-column grid panning sideways.

### Out of scope

Users are **not** added to global search. Indexing staff records is a privacy
decision, not a layout one, and nothing in this work requires it. Settings keeps its
own route and nav entry.

---

## 4. Transparency: no-file rows get a kebab with a real next step

### Problem

`RecordActions` returns `null` when a record has neither a detail page nor files.
Each of the four call sites then prints its own `At the barangay hall` sentence.
Because a sentence and a kebab are different widths, the Actions column's right
edge moves from row to row.

A *disabled* kebab would align the column but tells the reader nothing, and on
touch there is no hover to recover the explanation from.

### Change

`RecordActions` stops returning `null`. When a record has no files, its menu holds
exactly one item:

```
label: "Request a copy"   icon: Mail   href: "/contact"
```

Every row then renders one enabled, fixed-width control, and a resident who reaches
a paper-only document gets a way to ask for it rather than a full stop.

The `At the barangay hall` sentence is deleted from all four call sites:

- `src/features/transparency/components/legislative-table.tsx` (both the desktop
  `LegislativeRow` and the mobile `LegislativeCard`)
- `src/features/transparency/components/uploads-preview-table.tsx` (both renderings)
- `src/features/transparency/components/uploads-browse.tsx` (both renderings)
- `src/features/transparency/components/disclosure-grid.tsx`, via the
  `FileDownloads` component it renders

That last one was missed in the first pass of this design and is worth stating
plainly, because it is the surface the owner screenshotted. `FileDownloads`
(`file-downloads.tsx`) is **not** dead code: `DisclosureGrid` uses it for the
"Annual Budget Reports" list on `/transparency`, where a document with a file
shows `DOWNLOAD` and one without shows `At the barangay hall` — two different
affordances in the same column of the same card.

`DisclosureGrid` therefore swaps `FileDownloads` for `RecordActions`, giving that
list the same kebab as every other transparency surface. `file-downloads.tsx` is
then genuinely unreferenced and is deleted, along with its `FileDownloads` export
from `src/features/transparency/index.ts`.

`RecordActions`'s own barrel export goes with it. Every call site already
imports it directly from `./record-actions`, and nothing reaches it through the
barrel — which is just as well, because that barrel also re-exports Server
Components that import the `server-only` `queries.ts`. A client component
pulling `RecordActions` from there would drag `queries.ts` across the boundary
and fail the build. `DisclosureGrid` therefore imports it directly, as the other
three call sites do.

(An earlier draft of this design claimed `RecordActions` was already absent from
that barrel. It was not — the export was there, and this work removes it.)

The doc comment on `RecordActions` that currently explains the `null` return is
rewritten; leaving it would document behaviour that no longer exists.

---

## 5. Structured legislative document numbers

### Problem

`legislative_documents.number` is free text that an encoder types by hand, e.g.
`Ordinance No. 05-2024`. Two consequences:

1. **It cannot be sorted.** `localeCompare` on those strings buries the year behind
   the sequence, so `Ordinance No. 11-2023` sorts after `Ordinance No. 05-2024`. A
   missing leading zero makes it worse: `11-2023` precedes `5-2024`.
2. Type is already captured structurally as the `doc_type` enum, so the encoder is
   retyping information the record already holds, with nothing checking the two
   agree.

### Target format

Three inputs compose one display string:

```
Type = ordinance,  Number = 5,  Year = 2024   →   "Ordinance No. 05, 2024"
```

Sequence is zero-padded to a minimum of two digits so the column's numbers align;
numbers of three or more digits are not truncated.

### Sort order

**Year descending, sequence ascending within the year.** The current year's
legislation leads, and each year reads 03, 04, 05 downward.

### Migration `0024`

Applied by hand to staging, and folded into
`supabase/baseline/0000_baseline_2026-07-23.sql` per the two-path rule documented in
`supabase/migrations/README.md`. Production is empty and will receive it through the
baseline.

Single transaction, in order:

1. `add column seq_no int`, `add column year int` (nullable).
2. Backfill both by parsing the existing `number` against `(\d+)\s*-\s*(\d{4})`.
3. `set not null` on both; `check (seq_no > 0 and seq_no < 10000)`;
   `check (year between 1900 and 2200)`.

   The upper bound on `seq_no` is load-bearing, not defensive tidiness:
   `legislativeSortKey` below multiplies the year by 10000, so a five-digit
   sequence would overflow into the adjacent year's range and silently
   mis-order the table. The constraint and the key must move together.
4. `unique (doc_type, year, seq_no)`.
5. Rewrite every `number` to the new composed format.
6. `create index legislative_documents_type_status_year_seq_idx on (doc_type, status, year desc, seq_no asc)`.
7. `create or replace function public.search_legislative_documents(...)` — body
   unchanged except `order by d.date_approved desc nulls first, d.id desc` becomes
   `order by d.year desc, d.seq_no asc, d.id desc`. Its return shape is unchanged,
   so the query layer's row mapping is untouched.

**The backfill has no fallback, deliberately.** If a row's number cannot be parsed,
step 3's `set not null` fails and the transaction rolls back. For a migration
applied by hand against a live database, a loud failure is correct; silently
writing `seq_no = 0` onto a real ordinance is not. The unique constraint in step 4
behaves the same way if staging holds a duplicate.

### Why `number` stays a plain column

A Postgres generated column would make the composed string structurally incapable
of drifting from its parts, which matches this codebase's preferences elsewhere.
It is rejected here: the expression requires `doc_type::text`, and the enum-to-text
cast is `stable`, not `immutable`, so Postgres may refuse the generation
expression. There is no database available to test that against, and a hand-applied
migration that fails partway is a worse outcome than a formatter. Every write to
this table goes through a Server Action, so there is no second writer to drift from.

### New pure module

`src/lib/legislative-number.ts`, with unit tests in
`tests/unit/legislative-number.test.ts`:

```ts
/** "Ordinance No. 05, 2024" from the three structured fields. */
export function formatLegislativeNumber(
  docType: LegislativeType, seqNo: number, year: number,
): string;

/** Single descending key producing year-desc, sequence-asc. */
export function legislativeSortKey(year: number, seqNo: number): number;
```

`legislativeSortKey` returns `year * 10000 - seqNo`. `useTableSort` applies one
direction to one key, but the required order mixes directions. Subtracting the
sequence inverts it within the year, so one descending sort yields
`2025 → 03, 04, 05`, then `2024 → 03, 04, 05`. This is not self-evident and gets
both a comment and a test.

Test coverage: padding at 1, 2 and 3+ digits; both document types; that
`legislativeSortKey` orders a mixed-year fixture correctly under a descending sort;
that a later year always outranks an earlier one regardless of sequence; and that
the maximum permitted sequence (9999) still sorts below the same year's sequence 1
and above the previous year's — the boundary the `seq_no < 10000` constraint
protects.

### Application changes

| File | Change |
|---|---|
| `src/types/index.ts` | `LegislativeListItem` gains `seqNo: number`, `year: number`. `LegislativeValues` replaces `number: string` with `seqNo: number`, `year: number`. |
| `src/features/transparency/queries.ts` | Select and map the two new columns; `listRecentLegislative` orders `year desc, seq_no asc`. |
| `src/features/admin/components/legislative-form.tsx` | The "Document Number" text input becomes **Number** and **Year** number inputs side by side, with a live read-only preview of the composed string beneath them. |
| `src/features/admin/actions/legislative.ts` | Zod takes `seqNo` (int, 1–9999) and `year` (int, 1900–2200), mirroring the check constraints exactly; composes `number` with `formatLegislativeNumber` before writing; slug base becomes the composed number plus title. |
| `src/features/admin/components/legislative-manager.tsx` | Its `number` sort accessor uses `legislativeSortKey`. Display still reads `record.number`. |
| `src/features/transparency/components/legislative-table.tsx` | `SORT_ACCESSORS.number` uses `legislativeSortKey`; default sort becomes `{ key: "number", dir: "desc" }`. |

### Duplicate handling

The unique constraint means saving a second `Ordinance No. 05, 2024` raises
Postgres error `23505`. `saveLegislative` catches it and returns
*"Ordinance No. 05, 2024 already exists."* — a raw constraint-violation string is
not an error message for an encoder.

### Draft-recovery key

`useFormDraft` restores a JSON snapshot blindly. A snapshot written before this
change carries `number: string` and no `seqNo`/`year`, which would restore
`undefined` into two controlled number inputs. The draft **scope** string in
`legislative-form.tsx` changes from `"legislative"` to `"legislative-v2"`, so
pre-change snapshots are never matched. They expire on their own.

### Scope boundaries

- `/transparency/legislative` passes `sort="none"` and takes its order from the
  server across all pages; its own sort behaviour is unchanged beyond the new
  server ordering.
- Slugs are stored, so no existing published URL changes. Only newly created
  documents get slugs derived from the new format.
- `date_approved` stays independent and still optional — a document may be
  numbered before it is approved, which is why `year` is its own field rather than
  derived from the date.

---

## Verification

- `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build`.
- New unit tests for `formatLegislativeNumber` and `legislativeSortKey`.
- No Playwright work is requested for this round. The owner verifies in the browser;
  the plan's final task lists what to look at in plain sentences.
- Migration `0024` is **not** executed as part of this work — no database is
  available. Its verification is structural, as the baseline's was: statement
  ordering, and the baseline copy agreeing with the migration.

## Risks

- **`0024` is unexecuted.** Same standing caveat as the baseline. The backfill regex
  is written against the six seeded rows in `0009_transparency.sql`; any staging row
  encoded differently will roll the migration back rather than corrupt data.
- **Item 3 touches the nav array**, which decides where every user lands after
  login. The entry is `superAdminOnly` and sits after all `requests` and `content`
  items, so `firstPermittedPath` is provably unchanged for everyone else.
- **Item 5 changes a shared type** (`LegislativeValues`) used by the form, the
  action and the draft hook. `typecheck` catches every consumer.
