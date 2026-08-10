# Admin portal (CMS)

The staff portal at `/admin`. Auth is `.claude/authentication.md`; permission gating is
`.claude/authorization.md`; the data model is `.claude/database.md`.

Every manager is DB-backed with a real `draft → in-review → published → archived` workflow
and drawer editors that **persist through Server Actions**.

## Shell and navigation

- **`/admin` is a redirect, not a page** — `firstPermittedPath` sends the signed-in user to
  the first nav entry they may reach. Settings is ungated, so a target always exists and it
  cannot loop.
- Nav items are grouped **Requests / Content / System**, and **the flat order of
  `ADMIN_NAV_ITEMS` decides where each user lands after login.**
- The sidebar collapses to a 72px icon rail. Its state is an `sf-admin-sidebar` **cookie
  read server-side in the layout**, never `localStorage` in an effect — an effect runs after
  paint, so the rail would render expanded and snap shut on every load. `AdminShell` owns
  that state because the fixed rail and the main column's compensating margin have to move
  together.
- **Nothing in the rail may move between the two states.** The brand header (seal +
  "Barangay Portal / San Fernando") is a `Link` to `/` — the whole block, seal included, so
  the collapsed rail keeps the same target when the seal is all that renders. Its padding,
  gap and sizes are unchanged from the `div` it replaced. The seal's `alt` is `""`: the link
  carries the accessible name, and an alt there would append a second one.
- **Sign-out lives in the sidebar's and mobile nav's own footers, not the top bar.**
  `SignOutButton` is a bare `{className, children}` shell over the form action + draft clear
  — no visual opinion of its own — rendered from a footer pinned below the scrolling nav in
  both `AdminSidebar` (inside the peek trigger, so hovering it collapsed reveals the label
  like any other row) and `AdminMobileNav`'s menu card. `AdminTopBar` does not render it.

## Shared table primitives — not per-manager code

`RowActions` (the row kebab: Edit / Publish / Archive / Delete — **portals to
`document.body`** because every admin table sits in `overflow-x-auto`), `ConfirmDialog`
(replaces `window.confirm`; focus starts on Cancel and stays locked while the action runs),
`useToast` (carries an incrementing `id` so a repeated message re-fires, plus an error
tone), `Skeleton` + a `loading.tsx` per admin route, `Tooltip`, `SortableTh` +
`useTableSort`, `ViewToggle` (Active | Archived), `TabPills`, and `useEditDeepLink`
(`?edit=` / `?review=` from global search).

- **Destructive actions belong on the row, not in the drawer.**
- **Reorder arrows are hidden whenever a filter, a search, or a non-`order` sort is active**
  — "move up" only means something when the row above is the one that would be swapped.
- Every manager has an **Active | Archived** view; `archived` is not a status-dropdown
  value. Restore returns a record to `draft`, never to `published`, and files a `restore`
  audit entry.

## Autosave is a local recovery copy, never a database write

The seven draft-capable drawers call `useFormDraft(userId, scope, recordId, values)`
(`src/hooks/use-form-draft.ts`; pure helpers in `src/lib/form-draft.ts`), which debounces a
JSON snapshot of `values` into `localStorage` under
`sf-draft:v2:<userId>:<scope>:<recordId|new>`.

- **It must never write to Postgres.** Editing a published record does not change its
  status, so a timed DB write would push unreviewed text onto the live site.
- **Restore is offered, never applied** — the server may have moved on. The status line says
  *"Recovery copy saved on this device"*, never "Saved".
- Files stay out because the hook is handed `values` and `File` state lives outside it —
  **don't "fix" that by passing file state in.**
- **`DRAFT_KEY_PREFIX` is the one constant to bump — never migrate — whenever a
  draft-capable form's values shape changes.** It went `v1 → v2` when the Notices work added
  required fields to `AnnouncementValues`: restoring a `v1` snapshot into the widened shape
  would `setValues` a form missing `slug`/`body` and crash on the next keystroke.
- `AchievementsEditor` is out of scope: it saves each field on blur and has no draft model
  to hook into.

## Request notifications are two signals, and they are the *only* signal

The three staff-directed notification emails were removed 2026-08-06 (`.claude/email.md`),
so **nothing outside this poll tells anyone that work arrived.**

- The five `requests` nav rows (six queues — Inquiries & Feedback sums two) get a **count
  badge** for unhandled work: rows still in their initial status (`pending`, `received` or
  `new`, depending on the table).
- The top bar's **bell** gets a dot for "something arrived since you last looked."
- **The count only moves on a status change; the dot only clears when the bell is opened**
  (`markNotificationsSeen` stamps `profiles.notifications_seen_at`).
- One registry, `src/lib/notifications.ts`, owns each queue's table, status, permission and
  deep link — deliberately **not** merged into `search-modules.ts` (see `.claude/search.md`).
- `NotificationProvider` runs the one 60s poll (`GET /api/admin/notifications`, outside
  `src/proxy.ts`'s matcher, so it re-checks `getSessionUser` itself) feeding the sidebar
  badges, the mobile nav card and the bell — **one poll, three consumers**. A 401 stops it
  silently; `<IdleTimeout />` alone owns the sign-out UI.
- Counts and recent items are computed only for queues the viewer's permissions allow.
- **The bell's dropdown panel tracks the top bar, not the bell.** It measures
  `[data-admin-topbar-bar]` (the bar's own DOM node, found via the bell's closest ancestor)
  and matches that element's width and left edge, so it reads as an extension of the bar
  rather than a menu anchored to the trigger. **Moving or renaming that data attribute
  breaks the panel's positioning silently.**
- **The "New reply" pill and `replied_at` are the only way staff learn a resident answered**
  — a reply flips a ticket back to `under-review`, which `NOTIFICATION_QUEUES` correctly
  does *not* count as untouched work. Dropping the write, or filtering it out of the queue
  query, silently strands every awaiting-info ticket whose resident already responded.

## Ticket handling

- `postTicketUpdate` (`src/features/admin/actions/ticket-updates.ts`) **never writes
  `reviewed_*`/`closed_*`/`released_*`/`decided_*` or `remarks`** — those record who decided
  what and when, and moving a ticket to `under-review`/`awaiting-info` is not a decision;
  `remarks` keeps holding the latest decision's own reason.
- An internal note is `visibility: 'internal'` and is kept off `/track` by the query layer
  alone — see `.claude/security.md` before touching that path.
- The applications queue table renders `residentDisplayName` (`src/lib/resident-name.ts`,
  unit-tested) as `First M. Last` — a function, not an inline template, because the middle
  name is absent in three different ways (null on a pre-`0033` row, `""` when skipped,
  whitespace when fat-fingered), each of which would otherwise render `Juan  Cruz` or
  `Juan . Cruz`. A multi-word middle name ("Dela Cruz") yields one initial.
  **The review drawer deliberately does NOT use it** — it shows the middle name in full,
  because that is where staff read the record before issuing a document carrying the
  applicant's full legal name; a queue table is a scanning surface. The `applicant` sort key
  stays `last + first`; the global-search dropdown and notification bell stay `First Last`
  (glance surfaces, not records).
- Staff may schedule a **weekend** appointment: the closed-day rule is deliberately not
  applied to `walkInSchema` or the review drawer's `confirmedDate`. Don't "fix" that
  inconsistency.

## Modules with their own shape

- **`/admin/users`** — SuperAdmin-only `TeamManager`, an Active|Archived table like the
  other managers. It exists so **Settings keeps only profile and security**. Avatars render
  read-only there.
- **`/admin/inquiries`** is nav-labelled **`Inquiries & Feedback`** (the route is unchanged)
  — two tabs, one `handle-inquiries` permission, since the same people work both queues. Its
  tab strip is `src/components/ui/tab-pills.tsx`, which `transparency-manager.tsx` also
  consumes now; no hand-rolled tab strip is left in the portal to migrate.
- **`/admin/services`** — the catalog plus the assistance-categories panel.
  `updateAssistanceCategory` (renamed from `renameAssistanceCategory` once it started
  writing `description`/`requirements` too). `labelsForFlow`
  (`src/features/admin/actions/services.ts`) **recomputes `requirements_label`/`cta_label`
  on every create *and* update rather than persisting an edit** — its four label pairs are
  kept character-identical to `0035`'s seed values, which is the only reason a no-op
  SuperAdmin save is a no-op instead of silently rewriting that row's card copy.
- **Site Content (Home/About)** — `manage-site-content`, no status column, Save writes live,
  and every action must `revalidatePath("/")` **and** `revalidatePath("/about")`. Details in
  `.claude/database.md`. `@dnd-kit` is confined to `src/components/ui/sortable-list.tsx`
  (pass a `useId()` as the `DndContext` id or several lists hydrate mismatched); every
  existing up/down list stays as it is.
- **Settings** — profile + security only. The two cards sit side by side at **`xl`, not
  `lg`**: with the sidebar and page padding removed, a half track at `lg` is ~276px inside
  the card, too narrow for the profile card's avatar-beside-fields row (measured in-browser:
  `xl` ≈ 404px, 1440px ≈ 484px). Two inner layouts undo themselves at that same `xl` to pay
  for the narrower track — the profile row restacks the avatar above the form
  (`xl:flex-col xl:items-stretch`), and the security form's new/confirm password pair goes
  one-column (`xl:grid-cols-1`, since "New Password (min 10 characters)" wraps to two lines
  at ~195px and drops its input out of line with Confirm's). **Container queries are the
  natural tool here and are unusable** — see the containing-block trap in
  `.claude/ui-ux.md`.

## Icon lists

`ICON_OPTIONS` and `SITE_ICON_OPTIONS` (`src/lib/icon-map.ts`) are separate lists resolving
through the same shared `ICONS` map. **An icon seeded into a row but missing from its list
is a blocking bug, not a cosmetic one:** `calendar-days` was missing from `ICON_OPTIONS`, so
the Select rendered blank and `serviceSchema.iconName`'s refine rejected the empty value on
Save — a SuperAdmin could not save *any* edit to `set-an-appointment`, including a no-op,
without first changing its icon.
