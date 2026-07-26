# Notification delivery: Realtime broadcast instead of a 60s poll

**Date:** 2026-07-26
**Scope:** new `supabase/migrations/0027_notification_broadcast.sql`; new
`src/lib/supabase/browser.ts`; `src/features/admin/components/notification-provider.tsx`;
`src/app/api/admin/notifications/route.ts`; `src/lib/notifications.ts` (doc comment only);
`tests/e2e/admin/notifications.spec.ts` (comment only); `CLAUDE.md`
**Status:** design approved

## Problem

`NotificationProvider` polls `GET /api/admin/notifications` every 60 seconds, unconditionally,
for as long as any admin tab is open — regardless of whether anything has actually changed. The
2026-07-25 design for the notification feature (`2026-07-25-request-notifications-design.md`)
explicitly chose this and ruled out Realtime, with the reasoning recorded in that spec and
echoed in a comment in the code itself: *"Realtime is not available (every table has RLS enabled
with zero policies, so a browser subscription would receive nothing) — polling is not a
shortcut here, it is the only option."*

That reasoning is correct for the mechanism it was evaluating — **Postgres Changes**, Supabase's
row-level replication feed, which is authorized against the source table's own RLS. Since the
six queue tables have RLS enabled with zero policies, a client subscribed that way would indeed
see nothing (or need those tables opened up, which is a much larger change this project has
deliberately avoided).

It is not the only Realtime mechanism, though. **Broadcast from Database** (`realtime.send()`
called from a trigger) does not read table rows via replication at all — it sends whatever
payload the trigger function constructs, authorized separately via RLS on `realtime.messages`, a
system table this project doesn't otherwise touch. Given a payload that carries no row data, this
sidesteps the original objection entirely: nothing about the six tables' zero-policy model needs
to change.

The goal of this change is purely delivery: replace the unconditional 60s HTTP poll with a
push-triggered one, without changing anything about what counts as unhandled, what the dot
means, or who can see what. `src/lib/notifications.ts`'s permission-gated snapshot computation is
untouched.

## Decisions taken before design

| Question | Answer |
| --- | --- |
| Broadcast trigger location | A DB trigger on the six queue tables, not a call added to each Server Action. Catches every write path (including ones not yet written) with no per-call-site risk of forgetting to ping — the same reasoning behind `guardDelete()` being a server-side gate rather than a UI convention. |
| Payload content | Content-free: `{table, op}`, nothing from `NEW`/`OLD`. The client's job on receiving one is only "refetch," so there is nothing to gate per-row and no reason to widen what leaves the database. |
| Channel shape | One shared private channel, `admin:notifications`, for all six tables. The client can't act on *which* queue changed any more precisely than "refetch the snapshot," so splitting by table would add channels without adding capability. |
| Fallback | A safety-net poll stays, widened from 60s to 5 minutes, plus refetch on window focus and on channel reconnect. Realtime does the real-time work; the slow poll bounds the worst case if a socket dies unnoticed. |
| Realtime Postgres Changes (CDC) | Still not used, and still correctly ruled out by the 2026-07-25 spec for the reason given there. This design does not reopen that. |

## Approach

### Why Broadcast from Database, not app-layer broadcast

Two ways to trigger a push were considered:

**A. DB trigger + `realtime.send()`** — attached once, at the table level, in a migration.
Fires no matter which code path performs the write: an admin status change, a public ticket
submission, a future bulk-action button, a one-off SQL fix run by hand. Consistent with this
project's existing preference for gates that live in one place and cannot be bypassed by a
call site that forgot (`guardDelete()`, the `canSeeNavItem` nav gate, `useFormDraft`'s
DB-write ban).

**B. App-layer broadcast** — calling `supabase.channel(...).send()` inside each Server Action
after a successful write. No new SQL objects, but this codebase has well over ten call sites
that change a queue row's status or insert a new one (six managers' status-change actions, plus
the four public ticket flows, plus inquiries and feedback submission). Each one would need to
remember to fire the broadcast, and a missed one reintroduces exactly the staleness this change
sets out to fix — silently, since nothing would look broken until someone noticed a badge lagging.

**A** is the design. The trigger function is generic (`TG_TABLE_NAME`, `TG_OP`) so it attaches
identically to all six tables rather than six near-duplicate bodies.

### Why the payload carries no row data

The client-side handler for a broadcast event does exactly one thing: call the existing
`refetch()`, which hits `/api/admin/notifications` and gets back a snapshot already filtered by
the viewer's permissions. Nothing about *which* row changed ever needs to reach the browser —
only *that* something did. Keeping the payload to `{table, op}` means the RLS policy on
`realtime.messages` only has to answer "is this an authenticated admin session," not "may this
specific user see this specific row" — a much simpler policy, and one that can't drift out of
sync with the six queues' own permission rules in `src/lib/notifications.ts`, because it never
duplicates them.

### Authorization

`realtime.messages` gets one policy: `select` `to authenticated`. Every user who ever mounts
`NotificationProvider` is already signed in via Supabase Auth (the same session
`src/lib/supabase/server.ts`'s cookie-bound client uses) — public-site visitors never load the
admin bundle at all, so `to authenticated` is sufficient without needing per-permission
granularity. This mirrors why the payload is content-free: there is nothing behind this gate
worth restricting further.

### The browser client

`src/lib/supabase/browser.ts` is new: `createBrowserClient(url, anonKey)` from `@supabase/ssr`,
mirroring `createSupabaseServerClient` in `server.ts` but for client components. Because both
use `@supabase/ssr`'s cookie-based session storage, the browser client picks up the same signed-in
session the server already established at login — no separate client-side auth step. This file
has exactly one caller, `NotificationProvider`; it is not a general-purpose client-side Supabase
export.

## Data model

Migration `0027_notification_broadcast.sql`:

```sql
create or replace function public.notify_admin_queue_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(
    jsonb_build_object('table', tg_table_name, 'op', tg_op),
    'change',
    'admin:notifications',
    true
  );
  return null;
end;
$$;

create trigger notify_admin_queue_change
  after insert or update on public.applications
  for each row execute function public.notify_admin_queue_change();

-- ...repeated for complaints, appointments, assistance_requests, inquiries, feedback

create policy "authenticated users may receive admin notification broadcasts"
  on realtime.messages for select
  to authenticated
  using (true);
```

(The full file repeats the `create trigger` block for all six tables; shown once here for
brevity.) No new columns, no publication changes — Broadcast from Database is independent of the
`supabase_realtime` publication that Postgres Changes relies on, which is precisely why it
doesn't reopen the RLS question on the app tables themselves.

**Applying it:** manual, staging first, per the project's standing migration rule. The feature
degrades safely if it's missed on an environment: the client's `refetch` call is unconditional on
receiving a broadcast, but if no trigger exists, no broadcast ever arrives — the 5-minute safety
poll still keeps counts eventually correct, just without the push.

## Components and data flow

```
NotificationProvider (mount)
  ├─ browser Supabase client, authenticated via existing session cookies
  ├─ subscribe to private channel "admin:notifications"
  │    ├─ on "change" event  ──► debounce ~500ms ──► refetch()
  │    └─ on reconnect (status → SUBSCRIBED after a drop) ──► refetch()
  ├─ window "focus" ──► refetch()   (unchanged)
  └─ setInterval, 5min ──► refetch()   (widened from 60s; safety net, not primary path)

refetch() ──► GET /api/admin/notifications ──► getNotificationSnapshot(user)   (unchanged)
```

`refetch` itself, the 401-stops-polling handling, and `markSeen` are untouched — this change only
adds *another trigger* for calling `refetch`, alongside the existing focus listener and interval.

The debounce exists because a single admin action can touch several rows at once in the future
(no current UI does today, but nothing prevents it), and because the six triggers could in
principle fire in close succession for unrelated reasons; there's no benefit to issuing a burst of
identical GETs when one, slightly delayed, gets the same end state.

## Error handling

- **Broadcast arrives but the fetch fails or 401s:** identical to today's failure handling in
  `refetch` — a dropped request leaves the last-known snapshot on screen, and a 401 stops the
  provider from reacting further, silently, for the same reason documented in the 2026-07-25
  design (`<IdleTimeout />` owns the sign-out UI; a second component reacting would race it).
- **Socket never connects** (e.g. Realtime disabled on the project, or the migration hasn't been
  applied to this environment yet): the subscription simply never receives events; the 5-minute
  safety poll is the sole path, degrading to "the old behavior, slower" rather than to silence.
- **Socket drops mid-session:** supabase-js retries the websocket automatically; the reconnect
  handler's `refetch()` on returning to `SUBSCRIBED` closes the gap the drop may have left, rather
  than waiting for the next 5-minute tick.

## Testing

No new unit-testable logic — the debounce and reconnect handling are thin glue around an existing,
already-tested `refetch`, consistent with this repo's stance that component-level behavior is
verified in the browser, not in Vitest.

`tests/e2e/admin/notifications.spec.ts` needs no behavioral changes: none of its assertions wait
on the poll interval, they read current DOM state on page load. Its comment referencing "the 60s
notification poll can land mid-test" gets reworded to describe the new mechanism (a broadcast or
the 5-minute safety poll can still land mid-test), since the underlying race the comment explains
is still real, just from a different trigger.

## Out of scope

- Per-queue or per-row broadcast granularity. The client only ever does a full refetch, so finer
  payloads would add complexity with no consumer.
- Removing the safety-net poll entirely. Decided against above — bounding worst-case staleness is
  worth one request per five minutes.
- Reworking `getNotificationSnapshot` or the permission-gating logic. This change is delivery-only.
- Extending Broadcast from Database to any other admin surface (global search, managers' live
  data). Nothing else in the portal currently polls; this is not a general-purpose Realtime
  rollout.
