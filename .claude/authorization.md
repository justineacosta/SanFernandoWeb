# Authorization

Who may do what. Session resolution itself is `.claude/authentication.md`.

## The model

- **SuperAdmin** (`profiles.is_superadmin`) passes every permission check, and additionally
  owns three things nobody else can do: user management (`/admin/users`), permanent
  deletion, and service-catalog toggles.
- **Nine permissions** (`Permission` in `@/types`, labels + groups in
  `src/constants/permissions.ts`): `process-applications`, `process-appointments`,
  `handle-complaints`, `handle-assistance`, `handle-inquiries` (Tickets);
  `manage-news`, `manage-officials`, `manage-transparency`, `manage-site-content` (Content).
- `STATUS_PRESETS` pre-ticks checkboxes when a SuperAdmin picks a status label.
  **`manage-site-content` is deliberately absent from `editor`** — presets pre-tick boxes
  for every account created afterwards, so including it would hand the front page to the
  next editor without anyone deciding to.

## The four gates in `src/lib/auth.ts`

**Every admin route and Server Action goes through one of these. There is no other gate —
see the RLS note in `.claude/database.md`.**

| Gate | Use | On failure |
|---|---|---|
| `requireSessionUser()` | any authenticated page | `redirect("/admin/login")` |
| `requirePermission(p)` | permission-gated **pages** | `notFound()` |
| `requireSuperAdmin()` | SuperAdmin-only **pages** | `notFound()` |
| `checkPermission(p)` / `checkSuperAdmin()` | **Server Actions** | returns `null` |

- **Page gates 404, they don't bounce.** A staff member without a permission must not learn
  the module exists.
- **Actions must use `check*`, never `require*`.** Server Actions are POSTs — a thrown
  `notFound()` there does not render a 404, it surfaces as an unhandled digest error in the
  client transition. The caller returns `{ error: NOT_FOUND }` (`"Not found."`, the single
  denial message every gated action hands back).
- `checkPermission` returns `null` for both "missing permission" and "expired session", so
  an expired session surfaces "Not found." rather than "sign in again" — accepted, since the
  user's next navigation hits `requireSessionUser` and lands on the login page anyway.
- **`gatedMetadata(permission, title)` exists because a static `metadata` export resolves
  regardless of what the render throws** — without it the browser tab names the module over
  the not-found page. Returning `{}` falls back to the layout's "Admin".

## Disclosure follows permission everywhere, not just on the route

The same rule applied consistently, each in its own module:

- **Nav** — `src/lib/admin-nav.ts` (`canSeeNavItem` / `visibleNavItems` / `groupNavItems` /
  `firstPermittedPath` / `adminPageTitle`) is **one module, not a predicate copied four
  times**, consumed by the sidebar, the mobile drawer, the `/admin` redirect and the top
  bar's title. It is the only unit-tested code in the admin portal
  (`tests/unit/admin-nav.test.ts`) because it is the only pure logic.
- **`adminPageTitle` is permission-gated on purpose:** the portal 404s on unpermitted routes
  so those modules stay hidden, but the layout renders *above* that 404, so an ungated
  lookup would print the module's name over the not-found page.
- **Notifications** — counts and recent items are computed only for queues the viewer's
  permissions allow.
- **Global search** — module scoping follows the same rule.

## Deletion is two conditions, enforced server-side

`guardDelete()` (`src/lib/archive.ts`) requires **SuperAdmin** *and* a record already
`archived`. Never rely on the UI hiding the button. Two documented carve-outs (`feedback`,
`inquiries`) are in `.claude/database.md`.

## Which service row, not just which user

A permission answers *who* may call an action; it does not answer *what* they may pass. The
`services.flow` incident is the standing example: `process-applications` gated who could
call `createWalkInApplication`, but nothing gated **which service row** the drawer
submitted, so an assistance row produced a real application ticket. See
`.claude/resident-portal.md`. When routing or eligibility moves onto a column, audit the
**write** paths, not only the render path.
