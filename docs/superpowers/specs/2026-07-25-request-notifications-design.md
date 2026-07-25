# Request notifications: nav count badges and a top-bar bell

**Date:** 2026-07-25
**Scope:** new `supabase/migrations/0026_notification_seen.sql`; new `src/lib/notifications.ts`;
new `src/features/admin/queries/notifications.ts`; new
`src/features/admin/actions/notifications.ts`; new
`src/app/api/admin/notifications/route.ts`; new
`src/features/admin/components/{notification-provider,notification-bell,nav-count-badge}.tsx`;
new `tests/unit/notifications.test.ts`; `src/app/admin/(portal)/layout.tsx`;
`src/features/admin/components/{admin-sidebar,admin-mobile-nav,admin-topbar}.tsx`;
`src/features/admin/index.ts`; `src/types/index.ts`;
`supabase/baseline/0000_baseline_2026-07-23.sql`; `CLAUDE.md`
**Status:** design approved

## Problem

Five of the portal's modules are inboxes: a resident submits something and a staff member has
to act on it. Nothing in the portal says so. A clearance application filed at 9am is invisible
until somebody thinks to click Applications and look, and there is no surface anywhere — not
the sidebar, not the top bar — that distinguishes a module with eleven people waiting from one
with nothing in it.

The top bar makes the gap explicit in a comment: *"Notifications and Help used to sit here.
Both were stubs wired to nothing."* They were removed in the 2026-07-22 polish pass rather
than wired up. This puts Notifications back, against real data.

Two additions:

1. **A count badge on each of the five request nav rows**, in the desktop rail and the mobile
   card, showing how many submissions are still untouched.
2. **A bell in the top bar**, with a dot when something has arrived since you last looked and a
   dropdown listing the newest unhandled items across every queue you may see.

## Decisions taken before design

| Question | Answer |
| --- | --- |
| Which modules | The five entries of the `requests` nav group, and only those. Content and System modules are staff-authored — nothing arrives unbidden, so a badge there is permanent noise. |
| Content awaiting review | **Out of scope.** `in-review` news is an approvals workflow with a different audience; folding it in would make the bell mean two unrelated things. |
| What the number counts | **Unhandled work** — rows still in their initial status. It clears by doing the work, never by glancing. |
| What the dot means | **Novelty** — something arrived since this user last opened the bell. Separate signal, separate mechanism. |
| Freshness | Server-rendered initial counts, then a 60s client poll. |
| Realtime | **Unavailable.** Every table has RLS enabled with zero policies, so a browser subscription receives nothing. Polling is not a shortcut here; it is the only option the architecture permits. |

## Approach

### Why two signals, not one

The obvious single-signal designs each fail in one direction.

A pure **unread** badge — count rows newer than your last visit, zero it on open — reads like a
real notification but hides backlog: forty untouched applications become invisible the moment
anyone glances at the page, which is exactly when they most need to be visible.

A pure **unhandled** badge is honest about backlog but never says *new*. A queue holding a
steady twelve looks identical whether or not anything arrived this morning, and a number that
never changes becomes wallpaper.

So: **the number is unhandled, the dot is unseen.** The number answers "how much work is
waiting" and only a status change moves it. The dot answers "has anything landed since I
looked" and only opening the bell clears it. Opening the bell deliberately does **not** touch
the counts.

That split is also what keeps the schema change to one column. Counts are derived entirely from
data that already exists, on columns that are already indexed
(`applications_status_idx`, `complaints_status_idx`, `appointments_status_idx`,
`assistance_requests_status_idx`, `inquiries_status_created_idx`,
`feedback_status_created_idx`). Only the dot needs persistence.

### The queue registry

`src/lib/notifications.ts` owns one table that every other piece reads:

| key | table | "new" status | nav href | permission | deep link |
| --- | --- | --- | --- | --- | --- |
| `applications` | `applications` | `pending` | `/admin/applications` | `process-applications` | `?review=<id>` |
| `complaints` | `complaints` | `received` | `/admin/complaints` | `handle-complaints` | `?review=<id>` |
| `appointments` | `appointments` | `pending` | `/admin/appointments` | `process-appointments` | `?review=<id>` |
| `assistance` | `assistance_requests` | `pending` | `/admin/assistance` | `handle-assistance` | `?review=<id>` |
| `inquiries` | `inquiries` | `new` | `/admin/inquiries` | `handle-inquiries` | `?review=<id>` |
| `feedback` | `feedback` | `new` | `/admin/inquiries` | `handle-inquiries` | `?tab=feedback&review=<id>` |

**Six queues, five nav rows.** Inquiries and Feedback are separate tables behind one nav entry
and one permission, so the badge on that row is their sum while the dropdown lists them
separately and links each to its own tab.

The initial statuses are not uniform (`pending`, `received`, `new`) and the deep-link
parameters are not either. Both live in this table so no consumer has to know.

### Why this is not merged into `search-modules.ts`

`search-modules.ts` already holds a module → permission map and an `hrefForHit` builder, and
reusing them was the first thing considered. It does not fit: **neither registry contains the
other.** Search covers news, announcements, events, officials, services, legislative, documents
and projects — none of which are notified — and omits `inquiries` entirely, which must be. Only
five of the six queues could be served by `hrefForHit`, with the sixth special-cased.

Merging them would mean one registry answering two unrelated questions ("what is full-text
searchable" and "what is an inbound public queue"), so they stay separate. To stop them
drifting, `tests/unit/notifications.test.ts` asserts that for the five keys both registries
define, the permission and the href agree. A change to one that contradicts the other fails the
test instead of shipping.

(Noted while investigating, not fixed here: `inquiries` being absent from `SEARCH_MODULES` looks
like a genuine gap in global search. It needs a change to the `admin_global_search` SQL
function, so it is its own piece of work.)

### Permission gating

Counts are computed **only for queues the viewer's permissions allow**, and the badge and
dropdown render only those. This is a disclosure rule, not a tidiness one: a count beside a
module the viewer cannot open tells them it exists, which is the exact leak the portal's 404
gating and `adminPageTitle`'s deliberate permission check exist to prevent.

The gate reuses `canSeeNavItem`'s inputs (`{ isSuperAdmin, permissions }`) rather than a fresh
predicate, so there is one gating rule in the portal, not two.

## Data model

Migration `0026_notification_seen.sql`:

```sql
alter table public.profiles add column notifications_seen_at timestamptz;
```

Nullable, no default. **Null means "never looked"**, so every outstanding item counts as unseen
for a new account and the bell is lit on first login — correct, because they have in fact never
seen any of it.

It lives on `profiles` rather than in a `notification_reads` table because it is exactly one
scalar per user. A row-per-user-per-queue table would let the dot be per-queue, but the dot is
per-bell, so that table would only ever hold one meaningful value per user.

`supabase/baseline/0000_baseline_2026-07-23.sql` gains the column too. That file's header says
it squashes "0001–0024" but it already carries `0025`'s `avatar_src`; the header is corrected to
`0001–0026` as part of this change so the next reader is not misled.

**Applying it:** `0026` must be applied manually, and `0012`–`0025` are still pending on
production per CLAUDE.md. The feature degrades safely if it is missed — a missing column makes
the seen-stamp read fail, which is handled as "never seen" — but the dot will then never clear.

## Components and data flow

```
portal layout (server)
  ├─ getSessionUser()  ──►  gate { isSuperAdmin, permissions }
  ├─ getNotificationSnapshot(gate)   ── six count queries + recent items + seen_at
  └─ <NotificationProvider initial={snapshot}>
        ├─ AdminShell
        │    ├─ AdminSidebar     ──► useNotifications() ──► <NavCountBadge>
        │    │    └─ AdminMobileNav (in top bar) ──► same
        │    └─ AdminTopBar      ──► <NotificationBell>
        └─ (polls GET /api/admin/notifications every 60s)
```

**`NotificationProvider`** is the single source of client state. Seeded from the server so the
first paint already has correct numbers — no flash of empty badges — then it owns the one poll.
Three surfaces read the same context, so there is one request per interval, not three.

**`getNotificationSnapshot`** returns counts per queue, the recent-item list, and the viewer's
`notifications_seen_at`. Six `count: "exact", head: true` queries plus the recent fetch, in one
`Promise.all`, through the service-role client — the callers have already gone through
`getSessionUser` / the permission gate, per the project's standing rule.

**`/api/admin/notifications`** is a GET route handler returning the same snapshot as JSON. It
sits under `/api/`, outside the middleware matcher, so it gates itself with `getSessionUser()`
and 401s otherwise. Middleware covers page GETs only; this is the same reason `getSessionUser`
re-checks idle for Server Action POSTs.

**`markNotificationsSeen`** is a Server Action stamping `notifications_seen_at = now()` for the
current user. Called when the dropdown opens. It clears the dot and nothing else.

### Interaction with the idle timeout

The 60s poll **must not** refresh `sf-activity`. That cookie exists iff the user interacted in
the last 30 minutes, and its absence is the entire idle signal — a background request that
renewed it would mean a logged-in tab left open all weekend never times out.

This holds by construction: `sf-activity` is written by the client heartbeat on real
interaction, and a `fetch` performs no interaction. The consequence to handle is the other
direction — once the cookie expires the endpoint starts returning 401. **The provider treats
401 as "stop polling, silently."** It does not redirect and does not toast: `<IdleTimeout />`
owns the warning dialog and the sign-out, and a second component reacting to the same condition
would race it.

## UI

### Nav badges

The collapsed rail sets the constraint. CLAUDE.md's rule that nothing in the rail may move,
resize or re-align between states is load-bearing, because a peek opens *under the pointer* —
anything that shifts takes the row you were aiming at out from under you.

- **Expanded (256px):** a count pill at the row's right edge, after the label.
- **Collapsed (72px):** the pill is replaced by a small dot **absolutely positioned** on the
  icon's top-right corner.

Absolute positioning is the point: the dot contributes no layout, so the 40px row geometry is
identical in both states and a peek moves nothing. Following the same reasoning as the label
span, this is one element whose classes change rather than two swapped elements, so the peek
never remounts anything.

The mobile card has no collapsed state and takes the pill directly.

`NavCountBadge` is a new component rather than the existing `Badge`, whose `rounded-full px-3
py-1 uppercase tracking-wider` shape is a status chip and far too large for a nav row. Counts
above 99 render as `99+`; a zero count renders nothing at all, not a `0`.

### The bell

Sits in the top bar to the left of the global search, before the divider. Its dot appears when
anything unhandled is newer than `notifications_seen_at` — or when anything is unhandled at all
and that column is null.

The dropdown lists the eight newest unhandled items across permitted queues, merged and sorted
by `created_at` descending. Each row carries the queue's own nav icon, the ticket number or
subject, the submitter's name, a relative timestamp, and a link built from the registry.
Feedback rows show subject and category, since feedback is anonymous and has no name to show.

Empty state: *"You're all caught up."*

The dropdown **portals to `document.body`**. The top bar carries `backdrop-blur-md`, which
makes it a containing block for fixed-position descendants exactly as a transform would —
rendered in place, a fixed overlay would resolve against the bar's own box. `AdminMobileNav`
documents the same trap, and `RowActions` portals for the same class of reason.

Escape closes it, focus returns to the bell, and an outside click dismisses. It follows
`ConfirmDialog`'s existing handling rather than inventing its own.

## Testing

**Unit (`tests/unit/notifications.test.ts`)** — the pure layer only, matching why `admin-nav.ts`
is the portal's only other unit-tested module:

- `permittedQueues` returns exactly the queues a gate allows; a SuperAdmin gets all six; an
  empty permission set gets none.
- Inquiries and feedback both map to the `handle-inquiries` row and their counts sum.
- `hasUnseen` — null `seenAt` with outstanding work is unseen; null with no work is not; a
  `latestAt` older than `seenAt` is not.
- `mergeRecent` orders across queues by recency and honours the limit.
- The drift check against `search-modules.ts` for the five shared keys.

**Playwright (`public` project unaffected; `admin` project)** — the badge renders on a seeded
queue, the collapsed rail shows a dot with no layout shift, and opening the bell clears the dot
while leaving the counts unchanged.

Not tested: the poll interval itself. Fake-timing a 60s interval tests the test harness.

## Out of scope

- Email or push notification. The bell is in-portal only; 2D email (Resend) is separate work.
- Per-queue mute or notification preferences. Nobody has asked, and five queues is not enough to
  need managing.
- Content awaiting review, per the decision table above.
- Adding `inquiries` to global search, per the note above.
