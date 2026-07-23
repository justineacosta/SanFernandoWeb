# Permission-Gated 404s — Design

**Date:** 2026-07-22
**Status:** Approved
**Umbrella:** `docs/superpowers/specs/2026-07-22-portal-overhaul-design.md` (sub-project 2 of 9)

## 1. Goal

A staff member who lacks a module's permission must not be able to tell the module
exists. Direct URL access returns a genuine 404; navigation never offers the link; the
module's Server Actions refuse to run.

No database, no migration, no new dependencies.

## 2. Current behaviour

`src/lib/auth.ts` (52 lines) exposes three gates, all of which `redirect()`:

| Gate | Today | Used by |
| --- | --- | --- |
| `requireSessionUser()` | `redirect("/admin/login")` | pages, `account.ts` (2×) |
| `requireSuperAdmin()` | `redirect("/admin")` | 1 page, 20 action sites |
| `requirePermission(p)` | `redirect("/admin")` | 8 pages, 66 action sites |

A staff member without `manage-news` who visits `/admin/news` is bounced to the dashboard.
That is not a 404, and the bounce itself hints that the route exists and is protected.

**Nav filtering is already correct in two of three places.** `AdminSidebar` filters
`ADMIN_NAV_ITEMS` by `superAdminOnly` / `permission`, and `AdminMobileNav` reuses
`AdminSidebar`, so it inherits the filter.

### 2.1 Finding: the dashboard leaks three modules

`ContentHub` renders all three `CONTENT_TYPE_ACTIONS` cards unconditionally
(`content-hub.tsx:29-31`). The entries link to `/admin/transparency`, `/admin/events`, and
`/admin/news`, and `CONTENT_TYPE_ACTIONS` carries no `permission` field at all.

So a staff member holding only `handle-complaints` currently sees "Ordinance / Resolution",
"Community Event", and "News & Announcement" cards on the dashboard they land on after
login. Today those links bounce to the dashboard; after this change they would 404 — a
worse experience, and either way it violates "unauthorized modules must not appear in
navigation menus". This was not in the original request's list of affected areas; it was
found while mapping the call sites.

## 3. Decisions

### 3.1 Two gate families, split by execution context

Page gates keep their names and switch to `notFound()`. Action gates get new `check*`
names and return `null` instead of throwing.

```ts
// page loads — throw, rendering the admin 404 boundary
requireSessionUser()      → redirect("/admin/login")   // unchanged
requireSuperAdmin()       → notFound()
requirePermission(p)      → notFound()

// Server Actions — never throw
checkSuperAdmin()         → Promise<SessionUser | null>
checkPermission(p)        → Promise<SessionUser | null>
```

`requireSessionUser()` deliberately keeps redirecting. A signed-out user asking for
`/admin/news` should be invited to sign in, not told the page does not exist — they may
well have permission once authenticated.

A thrown `notFound()` inside a Server Action does not render a 404; actions are POSTs, and
the throw surfaces as an unhandled digest error in the client transition. Hence the split.
The `check*` variants make the correct thing the easy thing: an action author cannot
accidentally reach for a throwing gate, because the throwing gates are not what the
surrounding action code uses.

### 3.2 Denial at the 86 action call sites is an ordinary early return

Each site becomes two lines in the idiom the file already uses for validation failures:

```ts
const actor = await checkPermission("manage-news");
if (!actor) return { error: NOT_FOUND };
```

Return shapes turned out to be far more concentrated than feared — of ~90 exported
actions, **71 return plain `ActionResult` (`{ error: string | null }`)**, 8 `SaveResult`,
3 `SlugResult`, and the rest are one-offs (`UploadResult`, `UploadFileResult`,
`UploadDocumentResult`, `CreateResult`, plus four non-result returns).

This matters more than convenience: **`tsc` verifies every one of the 86 conversions.** A
denial object with the wrong shape is a compile error. With no test framework in the repo,
a type-checked mechanical change is the safest kind of wide edit available.

Rejected: a `withPermission(permission, fn, denied)` higher-order wrapper. It would
re-indent all ~90 action bodies for no type-safety gain, and it hides the gate inside a
callback where today it is the visible first statement of every action.

### 3.3 One denial message, and an accepted rough edge

`NOT_FOUND = "Not found."` is exported from `src/lib/auth.ts` and used at every site, so
the copy is not re-invented 86 times.

Accepted tradeoff: `checkPermission` returns `null` both when the caller lacks the
permission **and** when the session has expired. An expired session inside an action
therefore surfaces "Not found." rather than "Please sign in again", which is mildly
misleading. Distinguishing them would mean threading a reason through all 86 sites to
improve a rare case; the user's next navigation hits `requireSessionUser` and lands on the
login page, which is where they needed to go regardless. Noted here so the next reader
knows it was a decision and not an oversight.

### 3.4 The 404 renders inside the portal, not bare

The new boundary goes at `src/app/admin/(portal)/not-found.tsx`, inside the route group,
so it renders within `(portal)/layout.tsx` — sidebar and topbar included. The staff member
gets a dead end with a way out: the sidebar still lists exactly the modules they *can*
reach.

`src/app/admin/layout.tsx` only sets `noindex` metadata and returns `children`, so a
boundary placed at `admin/` instead would render chrome-less. The root
`src/app/not-found.tsx` is unusable here — it renders `PublicShell`, i.e. the public site
header, footer, and emergency hotlines, inside the admin portal.

The page must not explain that permission was denied. It says the page does not exist,
consistent with what the 404 is for.

### 3.5 The dashboard cards get a permission field

`CONTENT_TYPE_ACTIONS` gains an optional `permission` on its type, populated for all three
entries, and `ContentHub` filters with the same predicate `AdminSidebar` uses. `ContentHub`
is a Server Component, so it can read the session directly rather than accept props.

`RECENT_DRAFTS` is left alone: it is placeholder seed data with no real records behind it
(umbrella §6), so it leaks nothing. It becomes a real leak the moment it is wired to the
database, and that is called out in the plan for whoever does it.

### 3.6 Admin queries stay ungated, deliberately

`src/features/admin/queries/*.ts` do not check permissions; several carry comments stating
they rely on the calling page having gated first. That invariant is unchanged — pages
still gate, and now they gate harder. Adding redundant checks in the query layer is out of
scope for this sub-project.

## 4. Scope

| In scope | Out of scope |
| --- | --- |
| `notFound()` in `requirePermission` / `requireSuperAdmin` | Any change to `requireSessionUser` |
| `checkPermission` / `checkSuperAdmin` + 86 call-site conversions | Gating the query layer |
| `admin/(portal)/not-found.tsx` | The global topbar search (sub-project 4 scopes its results) |
| Permission-filtering the dashboard cards | `RECENT_DRAFTS` placeholder seed |
| | New permissions (`manage-site-content` lands in sub-project 9) |

## 5. Files

- `src/lib/auth.ts` — gates split, `NOT_FOUND` exported
- `src/app/admin/(portal)/not-found.tsx` — **new**
- `src/types/index.ts` — `permission?: Permission` on the content-type action shape
- `src/features/admin/data.ts` — populate the three permissions
- `src/features/admin/components/content-hub.tsx` — filter
- 21 files in `src/features/admin/actions/` — 86 conversions

## 6. Verification

1. `npm run typecheck` — the primary check. It proves all 86 denial shapes are correct.
2. `npm run lint` clean.
3. Signed out, `/admin/news` still redirects to `/admin/login` (proves §3.1's deliberate
   exception did not regress).
4. Signed out, `/admin` still redirects to `/admin/login`.
5. Signed in without the permission: `/admin/news` renders the portal 404 with sidebar and
   topbar present, and the sidebar lists only permitted modules.
6. Signed in without the permission: the dashboard shows no content-type card for modules
   the user cannot reach.
7. Signed in *with* the permission: the module loads normally — the gate must not be
   inverted.

Steps 1–4 need no credentials. **Steps 5–7 require an authenticated staff session with a
restricted permission set**, which does not exist yet. Creating one means writing a user
into live Supabase Auth, which is an outward-facing change and needs the owner's say-so.
Until that is resolved, steps 5–7 are verified locally by temporarily disabling the
`(portal)` layout's session redirect, exercising the boundary, and restoring it — with a
`git diff` check confirming the restore. That gap is stated plainly rather than papered
over.
