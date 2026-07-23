# Table Standards — Design

**Sub-project 5 of the portal overhaul.** Umbrella: `2026-07-22-portal-overhaul-design.md`.
Date: 2026-07-22. Status: **shipped**, all four phases. Verified by typecheck, lint,
`npm run test:unit` (21 cases), `npm run test:e2e --project=public`, `npm run build`, and a
browser drive of every admin route.

## 1. The problem

Every admin manager was built to its own standard. The result is twelve routes that
each behave slightly differently:

| Standard | State before this sub-project |
| --- | --- |
| Loading feedback | **None.** There is no `loading.tsx` anywhere in `src/app`. Navigating to a DB-backed admin route shows the previous page until the server finishes. |
| Sorting | Only `transparency-manager` and `legislative-manager` use `SortableTh` + `useTableSort`. Eight other tables have fixed order. |
| Toasts | Success only. `useState<string \| null>` keyed by message text, so firing the *same* message twice is a no-op — save twice, see one toast. Failures surface as inline red text or not at all. |
| Confirmation | `window.confirm()` — native, unstyled, unbranded, not focus-managed. |
| Row actions | Edit only. **Archive and Delete live inside the drawer form**, so archiving a record means opening an editor you did not want to open. |
| Focus | Per-component. No global `:focus-visible` rule; several icon buttons have no visible focus ring at all. |
| Tooltips | None. Icon-only buttons rely on `aria-label`, which screen readers get and sighted users do not. |
| Prefetch | Already correct — `AdminSidebar` renders `NavLink` → `next/link`, which prefetches by default. No work needed. |

## 2. Scope

This sub-project makes those eleven standards uniform and adds the test harness the
programme has been deferring. It does **not** change any Server Action's contract, does
not add a migration, and does not alter the permission model.

Out of scope, deliberately: the archive/restore *workflow* (sub-project 6 owns the
`archived_at` column and the restore path — this sub-project only surfaces the buttons
that call the actions that already exist), autosave (8), and the Home/About CMS (9).

## 3. Decisions

### 3.1 Row actions become a kebab menu, not inline icons

Chosen over always-visible inline icons and hover-revealed icons.

Officials rows already carry two reorder arrows. Adding three more buttons puts five
controls in one row and makes Delete a two-pixel slip from Edit. A single `⋮` trigger
keeps the row scannable and puts a destructive action behind one deliberate step. It
also scales: sub-project 6 adds Restore and sub-project 8 may add Duplicate, and a menu
absorbs those without redesigning the column.

Hover-revealed was rejected because it is invisible on touch and hurts discoverability.

**Clipping.** Every admin table sits inside `overflow-x-auto`, which would clip an
absolutely-positioned menu. `RowActions` therefore renders its menu through
`createPortal` into `document.body` at `position: fixed`, anchored from the trigger's
`getBoundingClientRect()`. This sidesteps the clipping problem rather than fighting it
with `overflow: visible`, which would break horizontal scrolling on narrow screens.

**Keyboard contract.** `aria-haspopup="menu"` + `aria-expanded` on the trigger;
`role="menu"` / `role="menuitem"` on the panel; ↑/↓ move, Home/End jump, Escape closes
and returns focus to the trigger, outside click closes, Tab closes and moves on.

### 3.2 Ticket managers keep the review drawer as their only action

The original brief said "move actions out of the drawers for all tables except
Certificate Applications". Applied literally that would give Appointments, Complaints,
and Assistance a kebab too — but there is nothing to put in it. Umbrella §3.6 excludes
tickets from archive, and §3.2 puts Delete in sub-project 6 as SuperAdmin-only. All four
ticket tables therefore keep their single Review affordance and gain only the *other*
standards (sorting, skeletons, toasts, focus, ARIA).

If quick status transitions from the row turn out to be wanted, they belong with
sub-project 6, where the delete path is already being designed.

### 3.3 Confirmation is a branded `alertdialog`, not `window.confirm`

`window.confirm` blocks the main thread, cannot be styled, cannot show the record's
name in the site's own type, and cannot express a pending state while the Server Action
runs. `ConfirmDialog` is a `role="alertdialog"` modal reusing the focus-trap logic
`Drawer` already proved: Escape cancels, the destructive button carries `variant`
`outline-danger`, and the dialog stays open and disabled while the action is in flight
so a double-click cannot fire two deletes.

### 3.4 Toasts get tones and an id

The current bug is structural: `setToast("Saved.")` when state is already `"Saved."`
is not a state change, so React does not re-render and the timer never restarts. The
fix is a `useToast()` hook holding `{ id, message, tone }` and incrementing `id` on
every call; `<Toast key={id}>` then remounts and the timer restarts. `tone: "error"`
switches the icon to `AlertCircle`, the surface to `danger`, and `role` from `status`
to `alert` so assistive tech announces failures immediately.

### 3.5 Skeletons are route-level `loading.tsx`, not in-component spinners

Every manager receives its rows as props from an `async` Server Component. There is no
client-side fetch to show a spinner for. The App Router's own streaming boundary is
exactly the right tool: a `loading.tsx` beside each `page.tsx` renders instantly on
navigation and is replaced when the server component resolves.

Skeletons mirror their route's real layout — `StatCardsSkeleton` + `TableSkeleton` for
Officials, `CardGridSkeleton` for News — so the swap is not a jolt. The pulse is wrapped
in `motion-safe:` so reduced-motion users get a static block.

### 3.6 A single global focus ring

`@layer base { :focus-visible { outline: 2px solid var(--color-brand-500); outline-offset: 2px } }`
in `globals.css`. Tailwind v4 emits utilities in a later layer, so the existing
`focus:outline-none focus-visible:ring-4` on form fields still wins and keeps its softer
ring; everything that previously had *nothing* now gets a visible amber outline. One
rule, no component churn.

### 3.7 Deep-linking uses `?edit=<id>`

Global search results (sub-project 4) currently land on the module's index page and
leave the user to find the record. Managers now read `?edit=<id>` on mount and open the
drawer for that record, then strip the param with `router.replace` so a refresh does not
re-open it. The search hit's `href` becomes `/admin/officials?edit=<uuid>`.

Permission is not re-derived here — the target page is already gated by
`requirePermission`, and a user who cannot see the module cannot receive the hit.

### 3.8 Inline validation is blur-then-live

Fields validate on `blur` (not on every keystroke, which shouts at someone halfway
through typing an email), and once a field has an error it re-validates on every
`change` so the message clears the moment it is fixed. Messages come from the same Zod
schemas the Server Actions use, so client and server cannot disagree. Server-side
validation is unchanged and remains the authority — Server Actions are public HTTP
endpoints.

## 4. The test harness

Two frameworks, because they answer different questions.

**Vitest** for pure logic — `src/lib/fuzzy.ts` (the 19 cases proven ad-hoc in
sub-project 4 become permanent), `src/lib/format.ts`, and the permission maps in
`src/features/admin/search-modules.ts`. No DOM, no React renderer, no jsdom: every
target is a pure function. Fast enough to run on every change.

**Playwright** for flows, driving the real dev server. Public specs need no auth. Admin
specs sign in as a dedicated staging user whose credentials live in `.env.local`
(gitignored) and reach CI as secrets; a `storageState` fixture signs in once per run
rather than once per test.

This reverses CLAUDE.md's "there is no test framework, do not add one casually" on the
owner's explicit instruction. The umbrella spec §5 anticipated it: the no-test rule was
written when the site was static, and sub-project 7 (transactional uploads) is the
riskiest change in the programme and the one most in need of a regression net.

**What the owner must create:** one Supabase Auth user in staging for the e2e suite. It
should be a normal staff account, not a SuperAdmin, so the permission-gating specs are
meaningful.

## 5. Sequence

| Phase | Content | Verifiable by |
| --- | --- | --- |
| 0 | Vitest + Playwright config, npm scripts, first unit tests | `npm run test:unit` green |
| A | `Skeleton`, `ConfirmDialog`, `Tooltip`, toast tones + `useToast`, `RowActions`, global focus ring, 12 × `loading.tsx` | typecheck, lint, throttled navigation |
| B | Kebab wired into the nine content managers; Archive/Delete removed from seven forms; sorting on the eight unsorted tables | browser drive of each manager |
| C | `?edit=` deep-linking, inline validation, ARIA/tooltip sweep | global search → drawer opens |

Phases A and B ship together as one commit per manager group; phase C ships separately.

## 6. Risks

- **Removing Archive/Delete from the forms is a behaviour change users may have learned.**
  Mitigated by the kebab being on the same row as Edit, so the action is closer than it
  was, not further.
- **`RowActions` portals to `document.body`.** If a menu is open when the row unmounts
  (a filter change, a refresh), the portal must close. The component closes on any
  `scroll`, `resize`, or unmount rather than trying to re-anchor.
- **Sorting and manual reorder conflict.** Officials and Transparency Projects persist a
  `sort_order`. When a user sorts by another column the reorder arrows are hidden, the
  same rule sub-project 4 applied for search — "move up" is only meaningful when the row
  above is the row that will be swapped.
- **The e2e suite writes to live staging.** Specs create records with an
  `E2E ` title prefix and delete them in `afterEach`; none touch the officials
  directory or transparency documents, which hold real content.

## 7. What the browser confirmed

- The row menu portals clear of the table: with the trigger at x≈1443 and the table's right
  edge at 1467, the menu renders inside the viewport and its parent element is
  `document.body`, not the scroll container.
- Keyboard: ↓ opens on the first item, ↓ again moves to Archive, End jumps to Delete, Enter
  opens the dialog with focus on **Cancel**, Escape cancels and returns focus to the kebab.
- Archive appears only on published rows; every other row offers Edit and Delete.
- Sorting Officials by name hides the reorder arrows (0 present) and restores them (12) when
  the Order column is selected again; `aria-sort` tracks the active column.
- The skeleton is real, not theoretical: 16 pulsing blocks and the live region reading
  "Loading the officials directory…", replaced by 12 rows.
- Deep-linking end to end: typing `dela cruz` in the top bar and clicking the hit lands on
  `/admin/officials` with the **Edit Official** drawer open and no `edit=` left in the URL.

## 8. Follow-up found after the first pass

Two call sites were missed by the sweep and fixed straight after, on the owner's
reminder that *"when archiving or deleting a user there should be confirmation"*:

- **`transparency-project-form.tsx`** still had its own Archive and Delete buttons with a
  `window.confirm`, duplicating the row kebab the projects panel had already gained. The
  other three forms were converted; this one was skipped. Both buttons removed, matching
  §3.1's rule that destructive actions live on the row.
- **`achievements-editor.tsx`** — the sub-list inside the officials drawer — deleted an
  achievement and its photos behind a `window.confirm`. Now a `ConfirmDialog` naming the
  achievement. It keeps its inline trash button rather than gaining a kebab: these are
  sub-records inside an open editor, not table rows.

`window.confirm` now appears nowhere in `src/` outside `confirm-dialog.tsx`'s own doc
comment. **Team users already had the dialog** — archive and delete both route through
`ConfirmDialog`, and a user cannot archive, delete, or disable their own account.

## 9. Open items

- Whether ticket rows should get quick status transitions — deferred to sub-project 6.
- The same standards on the **public side** — now programme sub-project 10, see the
  umbrella spec §4.1. This spec covers the admin portal only.
- The sidebar's **Emergency Response** button is a dead stub with no handler. Noted here
  because it was found during this survey; it belongs to whichever sub-project defines
  what it should do.
