# Notification Realtime Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `NotificationProvider`'s unconditional 60-second HTTP poll with a Supabase Realtime push, so the admin bell/badges refresh the moment a queue row actually changes instead of on a fixed timer.

**Architecture:** A Postgres trigger on the six queue tables (`applications`, `complaints`, `appointments`, `assistance_requests`, `inquiries`, `feedback`) calls `realtime.send()` on insert/update, broadcasting a content-free `{table, op}` payload on the private channel `admin:notifications`. A new browser Supabase client subscribes to that channel from `NotificationProvider`; any broadcast (debounced) triggers the existing `refetch()` against the unchanged, permission-filtered `/api/admin/notifications` route. A widened 5-minute safety-net poll plus the existing window-focus refetch stay in place in case a socket drops unnoticed. This uses Broadcast from Database, not Postgres Changes (row replication) — the 2026-07-25 notification design correctly ruled out Postgres Changes because the six tables have RLS enabled with zero policies; Broadcast from Database never reads those tables at all, so it needs only a new RLS policy on the separate `realtime.messages` system table.

**Tech Stack:** Next.js 16 App Router (Client Component, Route Handler unchanged), Supabase Postgres (trigger + `realtime.send()`), `@supabase/ssr` (^0.12.3, already a dependency) for the browser client, `@supabase/supabase-js` (^2.110.5, already a dependency) Realtime channel API.

## Global Constraints

- Path alias `@/*` → `src/*`.
- All six queue tables (`applications`, `complaints`, `appointments`, `assistance_requests`,
  `inquiries`, `feedback`) keep RLS enabled with **zero policies** — nothing in this plan changes
  that. The only new RLS policy is on `realtime.messages`, a Supabase system table, not an app
  table.
- Route Handlers under `/api/` are outside `src/middleware.ts`'s matcher (`/admin/:path*`) — they
  must call `getSessionUser()` themselves. `/api/admin/notifications/route.ts` already does; no
  change to that logic in this plan.
- Migrations are applied manually by the project owner against Supabase staging, then later
  production. `0027` must never be assumed applied. The feature must degrade safely if it isn't:
  no broadcast ever arrives, and the 5-minute safety poll is the sole path to freshness.
- Per `supabase/migrations/README.md`, any migration `0024` or later must be folded into
  `supabase/baseline/0000_baseline_2026-07-23.sql` in the **same commit**, in its final form,
  under the right `§` section — never appended as a "run after" step.
- No local Postgres/Supabase CLI is set up in this repo (confirmed: no `supabase/config.toml`).
  SQL changes are verified by careful reading, not by running them, exactly as the `0026` plan
  did for the same reason.
- Vitest (`tests/unit/**/*.test.ts`) covers pure functions only. This plan adds no new pure
  logic (the debounce/reconnect glue is thin glue around an already-tested `refetch`), so it adds
  no new unit tests — consistent with the project's stance that component behavior is verified in
  the browser, not in Vitest.
- `@supabase/ssr` and `@supabase/supabase-js` are already dependencies at the versions above — do
  not add new packages.

---

### Task 1: Migration `0027` — broadcast trigger, and the baseline squash

**Files:**
- Create: `supabase/migrations/0027_notification_broadcast.sql`
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:3` (header range)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:17` (header range)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:31` (header range)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:92-101` (§2 shared trigger function —
  add the broadcast function + the `realtime.messages` policy)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:387-389` (applications trigger)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:454-456` (appointments trigger)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:497-499` (complaints trigger)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:534-536` (assistance_requests trigger)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:955-957` (inquiries trigger)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:1001-1003` (feedback trigger)

(Line numbers are current positions in the baseline file as of this plan being written; later
steps in this task shift later line numbers, but every edit below is shown as an old/new text
block, matched by content, not by number.)

**Interfaces:**
- Produces: a private Realtime channel `admin:notifications`, broadcasting event name `"change"`
  with payload `{ table: string, op: "INSERT" | "UPDATE" }`. Consumed by Task 3's
  `NotificationProvider` subscription. The payload's exact shape is not relied on by the
  client beyond "a message arrived" — Task 3 does not need to read `table` or `op`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0027_notification_broadcast.sql`:

```sql
-- Push notifications: replace NotificationProvider's fixed-interval poll
-- with a broadcast ping.
--
-- The 2026-07-25 notification design (migration 0026) correctly ruled out
-- Realtime for this feature — but that ruling was about Postgres Changes,
-- Realtime's row-replication feed, which is authorized against each table's
-- own RLS. The six queue tables below have RLS enabled with zero policies,
-- so a raw Postgres Changes subscription would see nothing.
--
-- Broadcast from Database is a different mechanism: realtime.send() sends
-- an explicit payload built by this trigger, never reading table rows
-- through replication. Authorization is via RLS on realtime.messages, a
-- system table this project does not otherwise touch — the six queue
-- tables' zero-policy model is untouched by this migration.
--
-- The payload is deliberately content-free ({table, op}, nothing from
-- NEW/OLD): the client's only reaction to receiving one is to refetch the
-- already permission-filtered /api/admin/notifications snapshot, so there
-- is nothing row-specific worth sending, and nothing row-specific for the
-- RLS policy below to have to gate.
--
-- See docs/superpowers/specs/2026-07-26-notification-realtime-push-design.md.

create or replace function public.notify_admin_queue_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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

comment on function public.notify_admin_queue_change() is
  'Broadcasts a content-free {table, op} ping on the private admin:notifications channel. security definer because realtime.send() needs privileges the row-writing role (service_role, via the app''s Server Actions) may not itself hold.';

create trigger applications_notify_change
  after insert or update on public.applications
  for each row execute function public.notify_admin_queue_change();

create trigger complaints_notify_change
  after insert or update on public.complaints
  for each row execute function public.notify_admin_queue_change();

create trigger appointments_notify_change
  after insert or update on public.appointments
  for each row execute function public.notify_admin_queue_change();

create trigger assistance_requests_notify_change
  after insert or update on public.assistance_requests
  for each row execute function public.notify_admin_queue_change();

create trigger inquiries_notify_change
  after insert or update on public.inquiries
  for each row execute function public.notify_admin_queue_change();

create trigger feedback_notify_change
  after insert or update on public.feedback
  for each row execute function public.notify_admin_queue_change();

create policy "authenticated users may receive admin notification broadcasts"
  on realtime.messages for select
  to authenticated
  using (true);
```

- [ ] **Step 2: Fold the header ranges into the baseline squash**

Edit `supabase/baseline/0000_baseline_2026-07-23.sql` line 3:
```sql
-- Squash of migrations 0001–0026, as of 2026-07-23.
```
→
```sql
-- Squash of migrations 0001–0027, as of 2026-07-23.
```

Edit line 17:
```sql
--   • NOT for an environment that already has any of 0001–0026 applied. This
```
→
```sql
--   • NOT for an environment that already has any of 0001–0027 applied. This
```

Edit line 31:
```sql
-- HOW IT DIFFERS FROM RUNNING 0001–0026 IN SEQUENCE
```
→
```sql
-- HOW IT DIFFERS FROM RUNNING 0001–0027 IN SEQUENCE
```

- [ ] **Step 3: Fold the broadcast function and the `realtime.messages` policy into §2**

Edit the shared-trigger-function block (baseline lines ~92-101) — currently:
```sql
-- ════════════════════════════════════════════════════════════════════════════
-- 2. SHARED TRIGGER FUNCTION                                             [0001]
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
```
→
```sql
-- ════════════════════════════════════════════════════════════════════════════
-- 2. SHARED TRIGGER FUNCTIONS                                    [0001, 0027]
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Broadcast from Database (§9's inquiries/feedback and §5's four ticket
-- tables all attach this below, next to each table's own _updated_at
-- trigger). Content-free payload; see 0027's own migration comment for why.
create or replace function public.notify_admin_queue_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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

create policy "authenticated users may receive admin notification broadcasts"
  on realtime.messages for select
  to authenticated
  using (true);
```

- [ ] **Step 4: Add the six per-table triggers into the baseline**

Edit the applications trigger block — currently:
```sql
create trigger applications_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ── Assistance categories ───────────────────────────────────────────────────
```
→
```sql
create trigger applications_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

create trigger applications_notify_change
  after insert or update on public.applications
  for each row execute function public.notify_admin_queue_change();

-- ── Assistance categories ───────────────────────────────────────────────────
```

Edit the appointments trigger block — currently:
```sql
create trigger appointments_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ── Complaints ──────────────────────────────────────────────────────────────
```
→
```sql
create trigger appointments_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create trigger appointments_notify_change
  after insert or update on public.appointments
  for each row execute function public.notify_admin_queue_change();

-- ── Complaints ──────────────────────────────────────────────────────────────
```

Edit the complaints trigger block — currently:
```sql
create trigger complaints_updated_at
  before update on public.complaints
  for each row execute function public.set_updated_at();

-- ── Assistance requests ─────────────────────────────────────────────────────
```
→
```sql
create trigger complaints_updated_at
  before update on public.complaints
  for each row execute function public.set_updated_at();

create trigger complaints_notify_change
  after insert or update on public.complaints
  for each row execute function public.notify_admin_queue_change();

-- ── Assistance requests ─────────────────────────────────────────────────────
```

Edit the assistance_requests trigger block — currently:
```sql
create trigger assistance_requests_updated_at
  before update on public.assistance_requests
  for each row execute function public.set_updated_at();

-- ── tickets_view ────────────────────────────────────────────────────────────
```
→
```sql
create trigger assistance_requests_updated_at
  before update on public.assistance_requests
  for each row execute function public.set_updated_at();

create trigger assistance_requests_notify_change
  after insert or update on public.assistance_requests
  for each row execute function public.notify_admin_queue_change();

-- ── tickets_view ────────────────────────────────────────────────────────────
```

Edit the inquiries trigger block — currently:
```sql
create trigger inquiries_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

-- ── Site feedback ───────────────────────────────────────────────────────────
```
→
```sql
create trigger inquiries_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

create trigger inquiries_notify_change
  after insert or update on public.inquiries
  for each row execute function public.notify_admin_queue_change();

-- ── Site feedback ───────────────────────────────────────────────────────────
```

Edit the feedback trigger block — currently:
```sql
create trigger feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();
```
→
```sql
create trigger feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

create trigger feedback_notify_change
  after insert or update on public.feedback
  for each row execute function public.notify_admin_queue_change();
```

- [ ] **Step 5: Verify the SQL is well-formed**

There is no local Postgres to run this against (same constraint the `0026` plan hit). Run:

```bash
node -e "require('fs').readFileSync('supabase/migrations/0027_notification_broadcast.sql','utf8')"
```

to confirm the new file is readable, then read both files back in full. Check specifically: every
`create trigger` names a unique trigger name per table (Postgres scopes trigger names per table,
so `applications_notify_change` and `feedback_notify_change` are distinct even though they share
the `notify_admin_queue_change` function), every `$$...$$` block is closed, and the baseline's
six new trigger blocks each landed immediately after the matching `_updated_at` trigger and before
the next section comment — not accidentally nested inside a `create table` statement.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0027_notification_broadcast.sql supabase/baseline/0000_baseline_2026-07-23.sql
git commit -m "feat(db): broadcast admin queue changes for realtime notifications (migration 0027)"
```

---

### Task 2: Browser Supabase client

**Files:**
- Create: `src/lib/supabase/browser.ts`

**Interfaces:**
- Produces: `createSupabaseBrowserClient(): SupabaseClient`, consumed by Task 3's
  `NotificationProvider`.
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already set — the same
  two env vars `src/lib/supabase/server.ts` reads).

- [ ] **Step 1: Write the browser client**

Create `src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

/**
 * Cookie-bound Supabase client for Client Components. Mirrors
 * `createSupabaseServerClient` (`server.ts`) but for the browser — both use
 * `@supabase/ssr`'s cookie-based session storage, so a signed-in admin's
 * session carries over automatically with no separate client-side login
 * step.
 *
 * One caller: `NotificationProvider`'s Realtime subscription. Not a
 * general-purpose client-side Supabase export — if a second real use case
 * shows up, that's fine, but don't add one speculatively.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run typecheck`
Expected: no new errors. This file has no test of its own — it is a thin wrapper with no pure
logic, consistent with `server.ts` (its mirror) also having no unit test.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/browser.ts
git commit -m "feat: add browser Supabase client for admin Realtime subscriptions"
```

---

### Task 3: `NotificationProvider` — subscribe instead of poll

**Files:**
- Modify: `src/features/admin/components/notification-provider.tsx` (full rewrite of the polling
  logic and its doc comment)
- Modify: `src/app/api/admin/notifications/route.ts:6-15` (doc comment only — describes who calls
  it and why)

**Interfaces:**
- Consumes: `createSupabaseBrowserClient` from Task 2; the channel name `"admin:notifications"`
  and event name `"change"` from Task 1.
- Produces: no change to `useNotifications()`'s return shape (`NotificationContextValue`) or to
  `NotificationProvider`'s props (`{ initial, children }`) — every consumer (`AdminSidebar`,
  `AdminMobileNav`, `AdminTopBar`/`NotificationBell`) is unaffected.

- [ ] **Step 1: Rewrite `notification-provider.tsx`**

Replace the full contents of `src/features/admin/components/notification-provider.tsx` with:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { EMPTY_NOTIFICATION_COUNTS, type NotificationSnapshot } from "@/lib/notifications";
import { markNotificationsSeen } from "@/features/admin/actions/notifications";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Safety net only — real freshness comes from the Realtime broadcast below. */
const SAFETY_POLL_MS = 5 * 60_000;
/** Coalesces bursts of near-simultaneous table changes into one refetch. */
const DEBOUNCE_MS = 500;

interface NotificationContextValue extends NotificationSnapshot {
  /** Optimistically clears the dot and stamps the server in the background. */
  markSeen: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Single source of notification state for the sidebar badges, the mobile
 * nav card and the bell — one Realtime subscription feeds all three, not
 * three separate ones.
 *
 * Seeded from a server-rendered snapshot (the portal layout's
 * `getNotificationSnapshot` call) so first paint already has correct
 * numbers, the same reason `AdminShell`'s collapsed state is seeded from a
 * cookie rather than read in an effect after paint.
 *
 * Freshness comes from Broadcast from Database (migration `0027`): a
 * trigger on the six queue tables calls `realtime.send()` with a
 * content-free `{table, op}` payload on the private `admin:notifications`
 * channel, and any received broadcast (debounced) triggers a `refetch()` of
 * the same permission-filtered snapshot the initial render used. This does
 * not reopen the "Realtime unavailable" call the 2026-07-25 design made —
 * that ruled out Postgres Changes, which reads row data through each
 * table's own RLS (zero policies there, so a raw subscription sees
 * nothing). Broadcast from Database never reads the tables at all, so it
 * only needs a blanket "authenticated" policy on the separate
 * `realtime.messages` system table. See
 * docs/superpowers/specs/2026-07-26-notification-realtime-push-design.md.
 *
 * A slow safety-net poll (`SAFETY_POLL_MS`) and a window-focus refetch stay
 * alongside the subscription, so a socket that drops without the client
 * noticing still bounds staleness to a few minutes instead of forever.
 *
 * A 401 (idle timeout or signed out) stops all refetching silently.
 * `<IdleTimeout />` owns the warning dialog and the sign-out redirect; a
 * second component reacting to the same condition with its own toast or
 * redirect would race it.
 */
export function NotificationProvider({
  initial,
  children,
}: {
  initial: NotificationSnapshot;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<NotificationSnapshot>(initial);
  const stoppedRef = useRef(false);

  const refetch = useCallback(async () => {
    if (stoppedRef.current) return;
    try {
      const response = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (response.status === 401) {
        stoppedRef.current = true;
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as NotificationSnapshot;
      setSnapshot(data);
    } catch {
      // A dropped network request leaves the last-known snapshot on screen;
      // the next broadcast, safety-poll tick, or focus event retries.
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refetch, SAFETY_POLL_MS);
    window.addEventListener("focus", refetch);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refetch);
    };
  }, [refetch]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel("admin:notifications", { config: { private: true } });
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refetch, DEBOUNCE_MS);
    };

    channel
      .on("broadcast", { event: "change" }, scheduleRefetch)
      .subscribe((status) => {
        // Fires on the initial connect and again on any reconnect after a
        // drop — either way, one refetch closes whatever gap the client
        // might have missed while unsubscribed.
        if (status === "SUBSCRIBED") refetch();
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const markSeen = useCallback(() => {
    setSnapshot((current) => ({ ...current, seenAt: new Date().toISOString() }));
    void markNotificationsSeen().catch(() => {});
  }, []);

  return (
    <NotificationContext.Provider value={{ ...snapshot, markSeen }}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Falls back to an all-empty snapshot outside the provider rather than
 * throwing: every real consumer is mounted inside the portal layout, but a
 * badge or the bell rendering as "nothing pending" in a misuse case is a far
 * cheaper failure than a crashed page.
 */
export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  return (
    context ?? {
      counts: EMPTY_NOTIFICATION_COUNTS,
      recent: [],
      seenAt: null,
      markSeen: () => {},
    }
  );
}
```

- [ ] **Step 2: Update the route handler's doc comment**

Edit `src/app/api/admin/notifications/route.ts` — currently:
```ts
/**
 * Polled every 60s by NotificationProvider. Sits under `/api/`, outside
 * `src/middleware.ts`'s matcher (`/admin/:path*`), so it re-checks the
 * session itself — including the idle timeout, since `getSessionUser` is the
 * second of the project's two idle gates and middleware only covers page
 * GETs.
 *
 * 401 with no body on no session. The provider treats 401 as "stop polling,
 * silently" — `<IdleTimeout />` owns the warning dialog and the sign-out
 * redirect, and a second component reacting to the same condition here would
 * race it.
 */
```
→
```ts
/**
 * Called by NotificationProvider on every Realtime broadcast (migration
 * `0027`), on a 5-minute safety-net interval, and on window focus. Sits
 * under `/api/`, outside `src/middleware.ts`'s matcher (`/admin/:path*`), so
 * it re-checks the session itself — including the idle timeout, since
 * `getSessionUser` is the second of the project's two idle gates and
 * middleware only covers page GETs.
 *
 * 401 with no body on no session. The provider treats 401 as "stop
 * refetching, silently" — `<IdleTimeout />` owns the warning dialog and the
 * sign-out redirect, and a second component reacting to the same condition
 * here would race it.
 */
```

- [ ] **Step 3: Run typecheck and lint**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: both pass with no new errors. `supabase.channel(...).on("broadcast", ...)` and
`.subscribe((status) => ...)` are both part of `@supabase/supabase-js`'s public types (already a
dependency), so no new type declarations are needed.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/components/notification-provider.tsx src/app/api/admin/notifications/route.ts
git commit -m "feat(admin): subscribe to Realtime broadcasts instead of polling every 60s"
```

---

### Task 4: Docs, test comment, and final verification

**Files:**
- Modify: `CLAUDE.md` (the existing "Request notifications are two signals, not one." bullet)
- Modify: `tests/e2e/admin/notifications.spec.ts:64-68` (comment only)

**Interfaces:**
- Consumes: nothing new — this task documents and verifies Tasks 1-3.

- [ ] **Step 1: Update the CLAUDE.md bullet**

Read `CLAUDE.md` first to reconfirm the "Request notifications are two signals, not one." bullet
still reads as quoted below — no earlier task in this plan touches this file, so it should be
unchanged since this plan was written.

Edit the sentence inside that bullet — currently:
```markdown
  `NotificationProvider` runs the one 60s poll (`GET /api/admin/notifications`, outside
  `src/middleware.ts`'s matcher, so it re-checks `getSessionUser` itself) that feeds the sidebar
  badges, the mobile nav card and the bell — one poll, three consumers. A 401 stops it silently;
  `<IdleTimeout />` alone owns the sign-out UI.
```
→
```markdown
  `NotificationProvider` gets pushed fresh data via Supabase Realtime Broadcast from Database
  (migration `0027`): a trigger on the six queue tables calls `realtime.send()` with a
  content-free `{table, op}` payload on the private `admin:notifications` channel, authorized by
  a blanket `authenticated` RLS policy on `realtime.messages` — a system table, not the app
  tables, which stay at zero policies. This does not reopen the earlier "Realtime unavailable"
  call: that ruled out Postgres Changes (row replication gated by each table's own RLS), which is
  a different mechanism from Broadcast from Database (an explicit, content-free payload sent from
  a trigger). A 5-minute safety-net poll and a window-focus refetch still call
  `GET /api/admin/notifications` (outside `src/middleware.ts`'s matcher, so it re-checks
  `getSessionUser` itself) in case a socket drops unnoticed. One subscription feeds the sidebar
  badges, the mobile nav card and the bell. A 401 stops all refetching silently; `<IdleTimeout />`
  alone owns the sign-out UI.
```

- [ ] **Step 2: Update the e2e test comment**

Edit `tests/e2e/admin/notifications.spec.ts` — currently:
```ts
  // Read every badge and the bell's aria-label in one synchronous DOM pass.
  // The 60s notification poll can land mid-test and change live counts —
  // reading badges and the bell as separate sequential Playwright calls
  // leaves a window for a re-render to land between them and desync an
  // otherwise-correct sum from the bell text it's compared against.
```
→
```ts
  // Read every badge and the bell's aria-label in one synchronous DOM pass.
  // A Realtime broadcast or the 5-minute safety-net poll can land mid-test
  // and change live counts — reading badges and the bell as separate
  // sequential Playwright calls leaves a window for a re-render to land
  // between them and desync an otherwise-correct sum from the bell text
  // it's compared against.
```

- [ ] **Step 3: Run the full verification suite**

Run, in order:
```bash
npm run typecheck
npm run lint
npm run test:unit
```
Expected: all three pass with no errors, identical results to before this plan (no unit tests
changed).

- [ ] **Step 4: Run the Playwright admin suite**

The `admin` project skips entirely unless `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` are set in
`.env.local`. If they are set:
```bash
npm run test:e2e -- --project=admin
```
Expected: `notifications.spec.ts` still passes. If credentials are not configured, say so
explicitly rather than claiming the suite passed, per CLAUDE.md's standing rule.

- [ ] **Step 5: Manual smoke pass — requires migration `0027` applied to staging first**

This is the one step in this plan that needs a real Realtime connection, which needs migration
`0027` applied. Confirm with the project owner that it has been applied to staging before this
step (per the standing rule: never assume a migration is applied).

Once confirmed applied:
1. Sign into `/admin` in two browser windows (or one normal + one incognito) as the same or
   different admin accounts.
2. In window A, open DevTools → Network → WS and confirm a websocket connection to the Supabase
   Realtime endpoint shows status `101 Switching Protocols` and receives a `phx_reply` with
   `"status":"ok"` shortly after page load (confirms the private-channel subscription
   authorized correctly).
3. In window B (or via a direct DB update / submitting a real ticket through the public site),
   change the status of one seeded application/complaint/appointment/assistance/inquiry/feedback
   row, or submit a new one.
4. In window A, confirm the relevant nav badge count and the bell's dot update within roughly a
   second, without a manual page refresh.
5. Close window A's network tab, put the tab in the background for a few minutes, then bring it
   back to the foreground — confirm the window-focus refetch still fires (existing behavior,
   unchanged by this plan).
6. If a websocket connection cannot be established (e.g. an `error` reply instead of `ok`), the
   likely cause is `realtime.messages`' RLS policy — recheck Task 1's migration was applied, and
   that the signed-in session used by the browser client is genuinely authenticated (not just a
   service-role-backed page load).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md tests/e2e/admin/notifications.spec.ts
git commit -m "docs: document the Realtime notification push in CLAUDE.md; update test comment"
```
