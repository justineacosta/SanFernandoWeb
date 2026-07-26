# Request Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin portal's five request nav rows a count of unhandled submissions, and give the top bar a bell whose dot shows whether anything has arrived since the viewer last looked.

**Architecture:** A single pure registry (`src/lib/notifications.ts`) maps six DB queues (five nav rows — Inquiries & Feedback shares one) to their table, "untouched" status, permission and deep link. A server query reads six indexed counts plus a merged recent-items list, seeds a client `NotificationProvider` on first paint, and that provider polls a same-shape API route every 60s to feed the sidebar badges, the mobile nav badges, and the bell — one poll, three consumers. The bell's dot is the one piece of state that needs persistence (`profiles.notifications_seen_at`, migration `0026`); the counts need no schema change at all, since every status column notifications read is already indexed.

**Tech Stack:** Next.js 16 App Router (Server Components + Route Handler), Supabase (Postgres via service-role client), Zod not needed here (no form input), Vitest for the one pure module, Playwright for the one end-to-end check, `motion/react` + portal pattern copied from `RowActions`.

## Global Constraints

- Path alias `@/*` → `src/*`.
- All tables have RLS enabled with zero policies — the service-role client behind an explicit
  code check is the entire auth gate. Every server read here MUST follow a `getSessionUser()` /
  permission check, never trust the caller.
- Server Actions never throw or redirect — they return `{ error: string | null }`, using
  `getSessionUser()`/`checkPermission()`/`checkSuperAdmin()`, never `requireSessionUser()` (which
  calls `redirect()`, fine for a page load, wrong for a POST).
- Route Handlers under `/api/` are **outside** `src/middleware.ts`'s matcher
  (`/admin/:path*`) — they must call `getSessionUser()` themselves or they are unauthenticated.
- Supabase Realtime is not available — RLS has zero policies, so a browser subscription receives
  nothing. Freshness comes only from server-rendered initial state plus client polling.
- Design tokens only: `brand-*`, `ink-*`, `danger*` from `src/app/globals.css`'s `@theme`. No
  blue tokens.
- Vitest (`tests/unit/**/*.test.ts`) covers pure functions only — no jsdom, no React renderer.
  Component behaviour is not unit-tested in this codebase; it is verified in the browser
  (Playwright, `tests/e2e/**/*.spec.ts`).
- zod is v4, not used in this feature (no user input to validate).
- Migrations are applied manually by the project owner. `0026` must never be assumed applied.

---

### Task 1: Migration `0026` and the baseline squash

**Files:**
- Create: `supabase/migrations/0026_notification_seen.sql`
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:3` (header range)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:17` (header range)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:31` (header range)
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:190` (profiles table — add column)

**Interfaces:**
- Produces: `public.profiles.notifications_seen_at` (nullable `timestamptz`), consumed by Task 3's `getNotificationSnapshot` (read) and Task 3's `markNotificationsSeen` (write).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0026_notification_seen.sql`:

```sql
-- Request notifications: a bell's "have I looked?" signal.
--
-- Unhandled counts on the request nav rows need no schema change — every
-- status column notifications reads is already indexed
-- (applications_status_idx, complaints_status_idx, appointments_status_idx,
-- assistance_requests_status_idx, inquiries_status_created_idx,
-- feedback_status_created_idx). Only the bell's dot needs persistence:
-- whether this user has looked since something last arrived.
--
-- Null means "never looked", so a new account's bell is lit on first login —
-- correct, since they genuinely have not seen any of it yet.

alter table public.profiles add column notifications_seen_at timestamptz;

comment on column public.profiles.notifications_seen_at is
  'Stamped by markNotificationsSeen() when the bell dropdown opens. Null means never opened; drives only the bell''s unseen dot, never the nav badge counts.';
```

- [ ] **Step 2: Fold the column into the baseline squash**

The baseline (`supabase/baseline/0000_baseline_2026-07-23.sql`) already contains `0025`'s
`avatar_src` column despite its header claiming to squash only through `0024` — that header was
already stale before this change. Fix both while here.

Edit line 3:
```sql
-- Squash of migrations 0001–0024, as of 2026-07-23.
```
→
```sql
-- Squash of migrations 0001–0026, as of 2026-07-23.
```

Edit line 17:
```sql
--   • NOT for an environment that already has any of 0001–0024 applied. This
```
→
```sql
--   • NOT for an environment that already has any of 0001–0026 applied. This
```

Edit line 31:
```sql
-- HOW IT DIFFERS FROM RUNNING 0001–0024 IN SEQUENCE
```
→
```sql
-- HOW IT DIFFERS FROM RUNNING 0001–0026 IN SEQUENCE
```

Edit the `profiles` table definition around line 187-192 — currently:
```sql
  -- Cellphone, editable by the account owner in Settings.              [0003]
  phone text,
  -- Profile picture: public-media path, or null for initials.          [0025]
  avatar_src text,
  -- Staff email uniqueness enforced at the database layer.             [0002]
  constraint profiles_email_unique unique (email)
);
```
→
```sql
  -- Cellphone, editable by the account owner in Settings.              [0003]
  phone text,
  -- Profile picture: public-media path, or null for initials.          [0025]
  avatar_src text,
  -- Bell "have I looked?" stamp. Null means never opened.              [0026]
  notifications_seen_at timestamptz,
  -- Staff email uniqueness enforced at the database layer.             [0002]
  constraint profiles_email_unique unique (email)
);
```

- [ ] **Step 3: Verify the SQL is well-formed**

Run: `node -e "require('fs').readFileSync('supabase/migrations/0026_notification_seen.sql','utf8')"` to confirm the file is readable, then read both files back to confirm the edits landed cleanly (no orphaned commas, both files still valid SQL by eye — there is no local Postgres to run this against; the project applies migrations manually against Supabase staging/production per CLAUDE.md).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0026_notification_seen.sql supabase/baseline/0000_baseline_2026-07-23.sql
git commit -m "feat(db): add profiles.notifications_seen_at (migration 0026)"
```

---

### Task 2: `src/lib/notifications.ts` — the queue registry and pure helpers

**Files:**
- Create: `src/lib/notifications.ts`
- Test: `tests/unit/notifications.test.ts`

**Interfaces:**
- Consumes: `NavGate` from `@/lib/admin-nav` (`{ isSuperAdmin: boolean; permissions: Permission[] }`); `Permission` from `@/types`; `MODULE_PERMISSION`, `MODULE_META` from `@/features/admin/search-modules` (test only, for the drift check).
- Produces (consumed by Tasks 3–6):
  - `NOTIFICATION_QUEUE_ORDER: readonly ["applications","complaints","appointments","assistance","inquiries","feedback"]`
  - `type NotificationQueueKey = (typeof NOTIFICATION_QUEUE_ORDER)[number]`
  - `interface NotificationQueueDef { table: string; newStatus: string; navHref: string; permission: Permission; buildHref: (id: string) => string }`
  - `NOTIFICATION_QUEUES: Record<NotificationQueueKey, NotificationQueueDef>`
  - `type NotificationCounts = Record<NotificationQueueKey, number>`
  - `EMPTY_NOTIFICATION_COUNTS: NotificationCounts` (all zero)
  - `interface NotificationItem { queue: NotificationQueueKey; id: string; label: string; sublabel: string; createdAt: string; href: string }`
  - `interface NotificationSnapshot { counts: NotificationCounts; recent: NotificationItem[]; seenAt: string | null }`
  - `permittedQueues(gate: NavGate): NotificationQueueKey[]`
  - `countForNavHref(counts: NotificationCounts, permitted: NotificationQueueKey[], href: string): number`
  - `totalUnhandled(counts: NotificationCounts, permitted: NotificationQueueKey[]): number`
  - `hasUnseen(recent: NotificationItem[], seenAt: string | null): boolean`
  - `mergeRecent(perQueue: NotificationItem[][], limit: number): NotificationItem[]`
  - `formatRelativeTime(iso: string, now?: Date): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/notifications.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { Permission } from "@/types";
import { MODULE_META, MODULE_PERMISSION } from "@/features/admin/search-modules";
import {
  NOTIFICATION_QUEUES,
  countForNavHref,
  formatRelativeTime,
  hasUnseen,
  mergeRecent,
  permittedQueues,
  type NotificationCounts,
  type NotificationItem,
} from "@/lib/notifications";

/**
 * The request-notifications registry (2026-07-25). Mirrors why admin-nav.ts
 * is unit-tested: this is the portal's other pure gating/derivation layer,
 * and getting the gate wrong silently leaks which modules exist.
 */

const superAdmin = { isSuperAdmin: true, permissions: [] as Permission[] };
const inquiriesOnly = { isSuperAdmin: false, permissions: ["handle-inquiries"] as Permission[] };
const nobody = { isSuperAdmin: false, permissions: [] as Permission[] };

describe("permittedQueues", () => {
  it("gives a SuperAdmin every queue", () => {
    expect(permittedQueues(superAdmin)).toHaveLength(6);
  });

  it("gives an inquiries handler both inquiries and feedback, nothing else", () => {
    expect(permittedQueues(inquiriesOnly)).toEqual(["inquiries", "feedback"]);
  });

  it("gives someone with no permissions nothing", () => {
    expect(permittedQueues(nobody)).toEqual([]);
  });
});

describe("countForNavHref", () => {
  const counts: NotificationCounts = {
    applications: 12,
    complaints: 3,
    appointments: 5,
    assistance: 1,
    inquiries: 6,
    feedback: 2,
  };

  it("sums inquiries and feedback under their shared nav row", () => {
    expect(countForNavHref(counts, permittedQueues(superAdmin), "/admin/inquiries")).toBe(8);
  });

  it("returns a single queue's count for a row with only one queue", () => {
    expect(countForNavHref(counts, permittedQueues(superAdmin), "/admin/applications")).toBe(12);
  });

  it("excludes a queue the viewer cannot see", () => {
    expect(countForNavHref(counts, permittedQueues(inquiriesOnly), "/admin/applications")).toBe(0);
  });
});

describe("hasUnseen", () => {
  const item = (createdAt: string): NotificationItem => ({
    queue: "applications",
    id: "1",
    label: "APP-0001",
    sublabel: "Barangay Clearance",
    createdAt,
    href: "/admin/applications?review=1",
  });

  it("is false with nothing outstanding", () => {
    expect(hasUnseen([], null)).toBe(false);
  });

  it("is true when never seen and something is outstanding", () => {
    expect(hasUnseen([item("2026-07-25T10:00:00Z")], null)).toBe(true);
  });

  it("is false when the newest item is older than the last look", () => {
    expect(hasUnseen([item("2026-07-25T10:00:00Z")], "2026-07-25T12:00:00Z")).toBe(false);
  });

  it("is true when something arrived after the last look", () => {
    expect(hasUnseen([item("2026-07-25T13:00:00Z")], "2026-07-25T12:00:00Z")).toBe(true);
  });
});

describe("mergeRecent", () => {
  const item = (id: string, createdAt: string): NotificationItem => ({
    queue: "applications",
    id,
    label: id,
    sublabel: "",
    createdAt,
    href: "",
  });

  it("orders across queues by recency", () => {
    const a = [item("a", "2026-07-25T09:00:00Z")];
    const b = [item("b", "2026-07-25T11:00:00Z"), item("c", "2026-07-25T08:00:00Z")];
    expect(mergeRecent([a, b], 10).map((entry) => entry.id)).toEqual(["b", "a", "c"]);
  });

  it("honours the limit", () => {
    const a = [item("a", "2026-07-25T09:00:00Z"), item("b", "2026-07-25T10:00:00Z")];
    expect(mergeRecent([a], 1).map((entry) => entry.id)).toEqual(["b"]);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-25T12:00:00Z");

  it("reads as just now under a minute", () => {
    expect(formatRelativeTime("2026-07-25T11:59:30Z", now)).toBe("just now");
  });

  it("reads in minutes under an hour", () => {
    expect(formatRelativeTime("2026-07-25T11:45:00Z", now)).toBe("15m ago");
  });

  it("reads in hours under a day", () => {
    expect(formatRelativeTime("2026-07-25T09:00:00Z", now)).toBe("3h ago");
  });

  it("reads in days beyond that", () => {
    expect(formatRelativeTime("2026-07-22T12:00:00Z", now)).toBe("3d ago");
  });
});

describe("registry agreement with search-modules", () => {
  // `inquiries` has no search-modules entry, and four search modules
  // (news, officials, ...) carry no notification — only these five keys are
  // defined in both registries, so only these five can drift against each
  // other. See src/lib/notifications.ts's file comment for why the two
  // registries are not merged into one.
  const shared = ["applications", "appointments", "complaints", "assistance", "feedback"] as const;

  it("agrees with search-modules on permission and href for every shared key", () => {
    for (const key of shared) {
      expect(NOTIFICATION_QUEUES[key].permission).toBe(MODULE_PERMISSION[key]);
      expect(NOTIFICATION_QUEUES[key].navHref).toBe(MODULE_META[key].href);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- notifications`
Expected: FAIL — `Cannot find module '@/lib/notifications'` (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/notifications.ts`:

```typescript
import type { NavGate } from "@/lib/admin-nav";
import type { Permission } from "@/types";

/**
 * The six public-inbox queues that earn a notification badge, and the one
 * thing every consumer (nav badges, the bell, the server query) needs to
 * know about each: its table, its "untouched" status, the nav row it rolls
 * up under, the permission that gates it, and how to link to one record.
 *
 * Deliberately not merged into `src/features/admin/search-modules.ts`.
 * Neither registry contains the other: search covers eight modules that are
 * never notified (news, officials, transparency, ...) and omits `inquiries`
 * entirely, which must be notified. `tests/unit/notifications.test.ts`
 * checks the two agree on permission and href for the five keys they share,
 * so they cannot silently drift apart instead.
 */
export const NOTIFICATION_QUEUE_ORDER = [
  "applications",
  "complaints",
  "appointments",
  "assistance",
  "inquiries",
  "feedback",
] as const;

export type NotificationQueueKey = (typeof NOTIFICATION_QUEUE_ORDER)[number];

export interface NotificationQueueDef {
  table: string;
  /** The status value a fresh, untouched row carries. Not uniform across tables. */
  newStatus: string;
  /** The ADMIN_NAV_ITEMS href this queue rolls up under. Inquiries and feedback share one. */
  navHref: string;
  permission: Permission;
  /** Deep link to one record. Not uniform: feedback needs `?tab=feedback&review=`. */
  buildHref: (id: string) => string;
}

export const NOTIFICATION_QUEUES: Record<NotificationQueueKey, NotificationQueueDef> = {
  applications: {
    table: "applications",
    newStatus: "pending",
    navHref: "/admin/applications",
    permission: "process-applications",
    buildHref: (id) => `/admin/applications?review=${id}`,
  },
  complaints: {
    table: "complaints",
    newStatus: "received",
    navHref: "/admin/complaints",
    permission: "handle-complaints",
    buildHref: (id) => `/admin/complaints?review=${id}`,
  },
  appointments: {
    table: "appointments",
    newStatus: "pending",
    navHref: "/admin/appointments",
    permission: "process-appointments",
    buildHref: (id) => `/admin/appointments?review=${id}`,
  },
  assistance: {
    table: "assistance_requests",
    newStatus: "pending",
    navHref: "/admin/assistance",
    permission: "handle-assistance",
    buildHref: (id) => `/admin/assistance?review=${id}`,
  },
  inquiries: {
    table: "inquiries",
    newStatus: "new",
    navHref: "/admin/inquiries",
    permission: "handle-inquiries",
    buildHref: (id) => `/admin/inquiries?review=${id}`,
  },
  feedback: {
    table: "feedback",
    newStatus: "new",
    navHref: "/admin/inquiries",
    permission: "handle-inquiries",
    buildHref: (id) => `/admin/inquiries?tab=feedback&review=${id}`,
  },
};

export type NotificationCounts = Record<NotificationQueueKey, number>;

export const EMPTY_NOTIFICATION_COUNTS: NotificationCounts = {
  applications: 0,
  complaints: 0,
  appointments: 0,
  assistance: 0,
  inquiries: 0,
  feedback: 0,
};

export interface NotificationItem {
  queue: NotificationQueueKey;
  id: string;
  label: string;
  sublabel: string;
  /** ISO timestamp. Compared lexicographically — always UTC from Postgres, never reformatted. */
  createdAt: string;
  href: string;
}

export interface NotificationSnapshot {
  counts: NotificationCounts;
  recent: NotificationItem[];
  /** profiles.notifications_seen_at. Null means never opened. */
  seenAt: string | null;
}

/** Which queues a viewer's permissions unlock. SuperAdmins get all six. */
export function permittedQueues(gate: NavGate): NotificationQueueKey[] {
  return NOTIFICATION_QUEUE_ORDER.filter((key) => {
    if (gate.isSuperAdmin) return true;
    return gate.permissions.includes(NOTIFICATION_QUEUES[key].permission);
  });
}

/**
 * The number for one nav row. Sums every permitted queue that rolls up under
 * `href` — Inquiries & Feedback is two queues behind one row, everything
 * else is one queue behind one row.
 */
export function countForNavHref(
  counts: NotificationCounts,
  permitted: NotificationQueueKey[],
  href: string,
): number {
  const permittedSet = new Set(permitted);
  return NOTIFICATION_QUEUE_ORDER.filter(
    (key) => permittedSet.has(key) && NOTIFICATION_QUEUES[key].navHref === href,
  ).reduce((sum, key) => sum + counts[key], 0);
}

/** Total unhandled work across every permitted queue, for the bell's aria-label. */
export function totalUnhandled(counts: NotificationCounts, permitted: NotificationQueueKey[]): number {
  return permitted.reduce((sum, key) => sum + counts[key], 0);
}

/**
 * Whether the bell's dot should show. Null `seenAt` means "never looked" —
 * unseen iff there is anything outstanding at all. Otherwise unseen iff the
 * newest permitted item arrived after the last look.
 */
export function hasUnseen(recent: NotificationItem[], seenAt: string | null): boolean {
  if (recent.length === 0) return false;
  if (seenAt === null) return true;
  return recent.some((item) => item.createdAt > seenAt);
}

/** Newest-first across every queue's own recent list, capped at `limit`. */
export function mergeRecent(perQueue: NotificationItem[][], limit: number): NotificationItem[] {
  return perQueue
    .flat()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, limit);
}

/** Compact relative time for the bell dropdown, e.g. "15m ago". Deterministic via `now`. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- notifications`
Expected: PASS — all describe blocks green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications.ts tests/unit/notifications.test.ts
git commit -m "feat(admin): add the request-notifications queue registry"
```

---

### Task 3: Server data layer — query, action, and the polled route

**Files:**
- Create: `src/features/admin/queries/notifications.ts`
- Create: `src/features/admin/actions/notifications.ts`
- Create: `src/app/api/admin/notifications/route.ts`

**Interfaces:**
- Consumes (from Task 2): `NOTIFICATION_QUEUE_ORDER`, `NOTIFICATION_QUEUES`, `permittedQueues`, `mergeRecent`, `NotificationQueueKey`, `NotificationCounts`, `NotificationItem`, `NotificationSnapshot` from `@/lib/notifications`.
- Consumes: `SessionUser` from `@/types`; `getSessionUser`, `NOT_FOUND` from `@/lib/auth`; `createSupabaseAdminClient` from `@/lib/supabase/admin`; `feedbackCategoryLabel` from `@/features/feedback/data`.
- Produces (consumed by Task 4):
  - `getNotificationSnapshot(user: SessionUser): Promise<NotificationSnapshot>`
  - `markNotificationsSeen(): Promise<{ error: string | null }>` (Server Action)
  - `GET /api/admin/notifications` → `200 NotificationSnapshot` JSON, or `401` with no body.

- [ ] **Step 1: Write the query**

Create `src/features/admin/queries/notifications.ts`:

```typescript
import type { SessionUser } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { feedbackCategoryLabel } from "@/features/feedback/data";
import {
  NOTIFICATION_QUEUE_ORDER,
  NOTIFICATION_QUEUES,
  mergeRecent,
  permittedQueues,
  type NotificationCounts,
  type NotificationItem,
  type NotificationQueueKey,
  type NotificationSnapshot,
} from "@/lib/notifications";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

/** Per queue, for the bell's recent-items list. Kept small — this is a dropdown, not a table. */
const RECENT_PER_QUEUE = 5;
/** Across all queues, after merging. */
const RECENT_LIMIT = 8;

async function countQueue(admin: SupabaseAdmin, key: NotificationQueueKey): Promise<number> {
  const def = NOTIFICATION_QUEUES[key];
  const { count, error } = await admin
    .from(def.table)
    .select("id", { count: "exact", head: true })
    .eq("status", def.newStatus);
  if (error) {
    console.error(`getNotificationSnapshot count failed (${key}):`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function recentApplications(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.applications;
  const { data, error } = await admin
    .from("applications")
    .select("id, ticket_no, first_name, last_name, purpose, created_at")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (applications):", error.message);
    return [];
  }
  return data.map((row) => ({
    queue: "applications" as const,
    id: row.id,
    label: `${row.ticket_no} — ${row.first_name} ${row.last_name}`,
    sublabel: row.purpose,
    createdAt: row.created_at,
    href: def.buildHref(row.id),
  }));
}

async function recentComplaints(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.complaints;
  const { data, error } = await admin
    .from("complaints")
    .select("id, ticket_no, first_name, last_name, location, created_at")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (complaints):", error.message);
    return [];
  }
  return data.map((row) => ({
    queue: "complaints" as const,
    id: row.id,
    label: `${row.ticket_no} — ${row.first_name} ${row.last_name}`,
    sublabel: row.location,
    createdAt: row.created_at,
    href: def.buildHref(row.id),
  }));
}

async function recentAppointments(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.appointments;
  const { data, error } = await admin
    .from("appointments")
    .select("id, ticket_no, first_name, last_name, purpose, created_at")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (appointments):", error.message);
    return [];
  }
  return data.map((row) => ({
    queue: "appointments" as const,
    id: row.id,
    label: `${row.ticket_no} — ${row.first_name} ${row.last_name}`,
    sublabel: row.purpose,
    createdAt: row.created_at,
    href: def.buildHref(row.id),
  }));
}

async function recentAssistance(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.assistance;
  const { data, error } = await admin
    .from("assistance_requests")
    .select("id, ticket_no, first_name, last_name, created_at, assistance_categories (label)")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (assistance):", error.message);
    return [];
  }
  return data.map((row) => {
    const category = row.assistance_categories as unknown as { label: string } | null;
    return {
      queue: "assistance" as const,
      id: row.id,
      label: `${row.ticket_no} — ${row.first_name} ${row.last_name}`,
      sublabel: category?.label ?? "Assistance",
      createdAt: row.created_at,
      href: def.buildHref(row.id),
    };
  });
}

async function recentInquiries(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.inquiries;
  const { data, error } = await admin
    .from("inquiries")
    .select("id, first_name, last_name, subject, created_at")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (inquiries):", error.message);
    return [];
  }
  return data.map((row) => ({
    queue: "inquiries" as const,
    id: row.id,
    label: `${row.first_name} ${row.last_name}`,
    sublabel: row.subject,
    createdAt: row.created_at,
    href: def.buildHref(row.id),
  }));
}

async function recentFeedback(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.feedback;
  const { data, error } = await admin
    .from("feedback")
    .select("id, subject, category, created_at")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (feedback):", error.message);
    return [];
  }
  return data.map((row) => ({
    queue: "feedback" as const,
    id: row.id,
    label: row.subject,
    sublabel: feedbackCategoryLabel(row.category),
    createdAt: row.created_at,
    href: def.buildHref(row.id),
  }));
}

const RECENT_FETCHERS: Record<NotificationQueueKey, (admin: SupabaseAdmin) => Promise<NotificationItem[]>> = {
  applications: recentApplications,
  complaints: recentComplaints,
  appointments: recentAppointments,
  assistance: recentAssistance,
  inquiries: recentInquiries,
  feedback: recentFeedback,
};

/**
 * Counts, recent items and the viewer's last-seen stamp — everything the nav
 * badges and the bell need, scoped to what this viewer's permissions allow.
 * A count or a recent item for a queue the viewer cannot see would disclose
 * that the queue exists, the same leak `adminPageTitle` guards against for
 * page titles.
 *
 * Takes the already-resolved `user` rather than calling `getSessionUser()`
 * itself: both call sites (the portal layout, the polled route) have already
 * paid for that lookup, and `getSessionUser` is `cache()`d per request but
 * this function is also called from a route handler outside that request
 * scope.
 */
export async function getNotificationSnapshot(user: SessionUser): Promise<NotificationSnapshot> {
  const admin = createSupabaseAdminClient();
  const permitted = new Set(permittedQueues(user));

  const counts = {} as NotificationCounts;
  const recentLists = await Promise.all(
    NOTIFICATION_QUEUE_ORDER.map(async (key) => {
      if (!permitted.has(key)) {
        counts[key] = 0;
        return [] as NotificationItem[];
      }
      const [count, recent] = await Promise.all([countQueue(admin, key), RECENT_FETCHERS[key](admin)]);
      counts[key] = count;
      return recent;
    }),
  );

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("notifications_seen_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("getNotificationSnapshot seen-at lookup failed:", profileError.message);
  }

  return {
    counts,
    recent: mergeRecent(recentLists, RECENT_LIMIT),
    seenAt: profile?.notifications_seen_at ?? null,
  };
}
```

- [ ] **Step 2: Write the action**

Create `src/features/admin/actions/notifications.ts`:

```typescript
"use server";

import { NOT_FOUND, getSessionUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

/**
 * Stamps `profiles.notifications_seen_at` for the caller. Clears the bell's
 * dot and nothing else — the nav badges are unhandled-work counts and only
 * move when a record's own status changes, never on a read.
 *
 * `getSessionUser`, not `requirePermission`: this is a personal preference
 * write, not gated by any module permission — every signed-in staff member
 * may clear their own bell.
 */
export async function markNotificationsSeen(): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: "Could not update notifications." };
  return { error: null };
}
```

- [ ] **Step 3: Write the polled route**

Create `src/app/api/admin/notifications/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getNotificationSnapshot } from "@/features/admin/queries/notifications";

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
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const snapshot = await getNotificationSnapshot(user);
  return NextResponse.json(snapshot);
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors. If `assistance_categories` or another embedded-relation select reports a
type mismatch, compare against the identical pattern in
`src/features/admin/queries/assistance.ts:23-24` (the existing `listAssistanceRequests`), which
casts the same way.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/queries/notifications.ts src/features/admin/actions/notifications.ts src/app/api/admin/notifications/route.ts
git commit -m "feat(admin): add the notification snapshot query, action, and polled route"
```

---

### Task 4: `NotificationProvider` and portal layout wiring

**Files:**
- Create: `src/features/admin/components/notification-provider.tsx`
- Modify: `src/app/admin/(portal)/layout.tsx`

**Interfaces:**
- Consumes (from Task 2): `NotificationSnapshot`, `EMPTY_NOTIFICATION_COUNTS` from `@/lib/notifications`.
- Consumes (from Task 3): `getNotificationSnapshot` from `@/features/admin/queries/notifications`; `markNotificationsSeen` from `@/features/admin/actions/notifications`.
- Produces (consumed by Tasks 5–6): `<NotificationProvider initial={NotificationSnapshot}>` and `useNotifications(): NotificationSnapshot & { markSeen: () => void }`, both exported from `@/features/admin/components/notification-provider`.

- [ ] **Step 1: Write the provider**

Create `src/features/admin/components/notification-provider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { EMPTY_NOTIFICATION_COUNTS, type NotificationSnapshot } from "@/lib/notifications";
import { markNotificationsSeen } from "@/features/admin/actions/notifications";

const POLL_MS = 60_000;

interface NotificationContextValue extends NotificationSnapshot {
  /** Optimistically clears the dot and stamps the server in the background. */
  markSeen: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Single source of notification state for the sidebar badges, the mobile
 * nav card and the bell — one 60s poll feeds all three, not three separate
 * polls.
 *
 * Seeded from a server-rendered snapshot (the portal layout's
 * `getNotificationSnapshot` call) so first paint already has correct
 * numbers, the same reason `AdminShell`'s collapsed state is seeded from a
 * cookie rather than read in an effect after paint.
 *
 * Realtime is not available (every table has RLS enabled with zero
 * policies, so a browser subscription would receive nothing) — polling is
 * not a shortcut here, it is the only option.
 *
 * A 401 (idle timeout or signed out) stops the poll silently.
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
      // the next 60s tick or focus event retries.
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refetch, POLL_MS);
    window.addEventListener("focus", refetch);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refetch);
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

- [ ] **Step 2: Wire it into the portal layout**

Read the current file first — `src/app/admin/(portal)/layout.tsx` — to confirm line numbers still
match (Task 1–3 did not touch this file, so they should).

Modify `src/app/admin/(portal)/layout.tsx`:

```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getNotificationSnapshot } from "@/features/admin/queries/notifications";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { AdminUserProvider } from "@/features/admin/components/admin-user-context";
import { NotificationProvider } from "@/features/admin/components/notification-provider";
import { IdleTimeout } from "@/features/admin/components/idle-timeout";

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  // Seeds AdminShell's initial state so a collapsed sidebar renders collapsed
  // on first paint rather than snapping shut after hydration.
  const cookieStore = await cookies();
  const collapsed = cookieStore.get("sf-admin-sidebar")?.value === "collapsed";
  const notifications = await getNotificationSnapshot(user);

  return (
    <AdminUserProvider userId={user.id}>
      <NotificationProvider initial={notifications}>
        <AdminShell user={user} defaultCollapsed={collapsed}>
          {children}
        </AdminShell>
        {/* Sibling of AdminShell, not a child: a fixed overlay inside the
            backdrop-filter chrome would be positioned against it, not the
            viewport. NotificationProvider renders no DOM of its own, so
            nesting IdleTimeout inside it changes nothing about that. */}
        <IdleTimeout />
      </NotificationProvider>
    </AdminUserProvider>
  );
}
```

This is a full-file replacement — the only changes from the original are the two new imports and
wrapping the existing `<AdminShell>` / `<IdleTimeout />` pair in `<NotificationProvider>`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (`AdminSidebar`/`AdminTopBar` do not yet call `useNotifications()` — that is
Tasks 5–6 — so this compiles even though the provider has no real consumer yet.)

- [ ] **Step 4: Manually verify the layout still renders**

Run the dev server (check first whether one is already running on `http://localhost:3000` per
CLAUDE.md's Commands section before starting a second):

```bash
npm run dev
```

Sign in to `/admin/login` and confirm `/admin` still redirects to the first permitted module with
no console error. `NotificationProvider` has no visible output yet, so the page should look
byte-identical to before this task.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/components/notification-provider.tsx "src/app/admin/(portal)/layout.tsx"
git commit -m "feat(admin): add NotificationProvider and seed it from the portal layout"
```

---

### Task 5: Nav count badges — sidebar and mobile nav

**Files:**
- Create: `src/features/admin/components/nav-count-badge.tsx`
- Modify: `src/features/admin/components/admin-sidebar.tsx`
- Modify: `src/features/admin/components/admin-mobile-nav.tsx`

**Interfaces:**
- Consumes (from Task 2): `countForNavHref`, `permittedQueues` from `@/lib/notifications`.
- Consumes (from Task 4): `useNotifications` from `./notification-provider`.
- Produces: `<NavCountBadge count={number} collapsed?: boolean className?: string>`, exported from `@/features/admin/components/nav-count-badge`.

- [ ] **Step 1: Write `NavCountBadge`**

Create `src/features/admin/components/nav-count-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

interface NavCountBadgeProps {
  count: number;
  /**
   * True inside the collapsed 72px rail: renders an absolutely-positioned
   * dot instead of a pill, so it adds zero layout. The rail's peek must not
   * move or resize anything — a peek opens under the pointer, and anything
   * that shifts takes the row you were aiming at out from under you.
   */
  collapsed?: boolean;
  className?: string;
}

/**
 * Unhandled-work count for a request nav row.
 *
 * Not `Badge` (`src/components/ui/badge.tsx`) — that is a large uppercase
 * status chip (`rounded-full px-3 py-1 uppercase tracking-wider`), sized for
 * a table cell, not a 40px-tall nav row.
 *
 * Renders nothing for a zero count: an empty queue should look exactly like
 * a module with no notifications feature at all, not like a "0" nobody
 * asked to see.
 */
export function NavCountBadge({ count, collapsed, className }: NavCountBadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);

  if (collapsed) {
    return (
      <>
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-ink-950",
            className,
          )}
        />
        <span className="sr-only">, {count} unhandled</span>
      </>
    );
  }

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-[0.7rem] font-semibold tabular-nums text-white",
          className,
        )}
      >
        {label}
      </span>
      <span className="sr-only">, {count} unhandled</span>
    </>
  );
}
```

- [ ] **Step 2: Wire it into `AdminSidebar`**

Read `src/features/admin/components/admin-sidebar.tsx` first to reconfirm line numbers (no prior
task touches this file).

Modify the imports (currently lines 1-15):

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { SPRING_INDICATOR } from "@/lib/motion";
import { SITE } from "@/constants/site";
import { groupNavItems } from "@/lib/admin-nav";
import { countForNavHref, permittedQueues } from "@/lib/notifications";
import { Tooltip } from "@/components/ui/tooltip";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";
import { useNotifications } from "./notification-provider";
import { NavCountBadge } from "./nav-count-badge";
```

Inside `AdminSidebar`, right after `const groups = groupNavItems(...)` (currently line 69), add:

```tsx
  const { counts } = useNotifications();
  const permitted = permittedQueues({ isSuperAdmin, permissions });
```

Replace the icon + label rendering block. Currently (lines 246-259):

```tsx
                          <Icon
                            className={cn(
                              "relative h-5 w-5 shrink-0",
                              isActive && "text-brand-400",
                            )}
                            aria-hidden="true"
                          />
                          {/* One span whose class changes, never two spans
                              swapped: see the li below for why identity here
                              is worth protecting. */}
                          <span className={expanded ? "relative truncate" : "sr-only"}>
                            {item.label}
                          </span>
```

Replace with:

```tsx
                          <span className="relative shrink-0">
                            <Icon
                              className={cn("h-5 w-5", isActive && "text-brand-400")}
                              aria-hidden="true"
                            />
                            {!expanded ? (
                              <NavCountBadge
                                count={countForNavHref(counts, permitted, item.href)}
                                collapsed
                              />
                            ) : null}
                          </span>
                          {/* One span whose class changes, never two spans
                              swapped: see the li below for why identity here
                              is worth protecting. */}
                          <span className={expanded ? "relative truncate" : "sr-only"}>
                            {item.label}
                          </span>
                          {expanded ? (
                            <NavCountBadge count={countForNavHref(counts, permitted, item.href)} />
                          ) : null}
```

This wraps the icon in a `relative shrink-0` span so the collapsed dot has something to anchor
to without joining the row's own flex flow (the dot is `absolute`, contributing no layout), and
appends the expanded pill after the label span only when `expanded` is true — the label span's
own markup is untouched, so nothing about its collapsed `sr-only` state changes.

- [ ] **Step 3: Wire it into `AdminMobileNav`**

Read `src/features/admin/components/admin-mobile-nav.tsx` first to reconfirm line numbers.

Modify the imports (currently lines 1-14):

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { FADE_QUICK, POP } from "@/lib/motion";
import { groupNavItems } from "@/lib/admin-nav";
import { countForNavHref, permittedQueues } from "@/lib/notifications";
import { useDisclosure } from "@/hooks/use-disclosure";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";
import { useNotifications } from "./notification-provider";
import { NavCountBadge } from "./nav-count-badge";
```

Inside `AdminMobileNav`, right after `const groups = groupNavItems(...)` (currently line 49), add:

```tsx
  const { counts } = useNotifications();
  const permitted = permittedQueues({ isSuperAdmin, permissions });
```

Replace the row rendering. Currently (lines 161-170):

```tsx
                                <Icon
                                  className={cn(
                                    "h-5 w-5 shrink-0",
                                    isActive
                                      ? "text-brand-600"
                                      : "text-ink-400",
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="truncate">{item.label}</span>
```

Replace with:

```tsx
                                <Icon
                                  className={cn(
                                    "h-5 w-5 shrink-0",
                                    isActive
                                      ? "text-brand-600"
                                      : "text-ink-400",
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="truncate">{item.label}</span>
                                <NavCountBadge count={countForNavHref(counts, permitted, item.href)} />
```

The mobile card has no collapsed state, so it always takes the expanded (pill) variant, and
`NavCountBadge` already renders nothing for a zero count — no conditional needed here.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manually verify**

With the dev server running, sign in and check:
- Desktop rail expanded: any request module with outstanding work shows a pill after its label.
- Desktop rail collapsed (click the toggle): the same modules show a small dot on the icon's
  corner instead, and hovering the rail to peek it open does not shift any row.
- Mobile width (or resize the browser below the `md` breakpoint) and open the hamburger menu: the
  same pills appear in the card.
- A module with zero outstanding work shows no badge at all in any state.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/nav-count-badge.tsx src/features/admin/components/admin-sidebar.tsx src/features/admin/components/admin-mobile-nav.tsx
git commit -m "feat(admin): add unhandled-work count badges to the request nav rows"
```

---

### Task 6: The notification bell

**Files:**
- Create: `src/features/admin/components/notification-bell.tsx`
- Modify: `src/features/admin/components/admin-topbar.tsx`

**Interfaces:**
- Consumes (from Task 2): `NOTIFICATION_QUEUES`, `permittedQueues`, `hasUnseen`, `totalUnhandled`, `formatRelativeTime` from `@/lib/notifications`.
- Consumes (from Task 4): `useNotifications` from `./notification-provider`.
- Consumes: `ADMIN_NAV_ITEMS` from `@/features/admin/data` (icon lookup by href); `useAnchorRect` from `@/hooks/use-anchor-rect`; `POP` from `@/lib/motion`.
- Produces: `<NotificationBell isSuperAdmin={boolean} permissions={Permission[]}>`, exported from `@/features/admin/components/notification-bell`.

- [ ] **Step 1: Write `NotificationBell`**

Create `src/features/admin/components/notification-bell.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MotionConfig, motion } from "motion/react";
import { Bell } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { POP } from "@/lib/motion";
import { useAnchorRect } from "@/hooks/use-anchor-rect";
import {
  NOTIFICATION_QUEUES,
  formatRelativeTime,
  hasUnseen,
  permittedQueues,
  totalUnhandled,
} from "@/lib/notifications";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";
import { useNotifications } from "./notification-provider";

const PANEL_WIDTH = 360;
const GAP = 10;

/** The icon for a notification row, matched off the queue's own nav entry — one icon source, not two. */
function iconForHref(href: string) {
  return ADMIN_NAV_ITEMS.find((item) => item.href === href)?.icon ?? Bell;
}

interface NotificationBellProps {
  isSuperAdmin: boolean;
  permissions: Permission[];
}

/**
 * Bell in the top bar: a dot for "something arrived since you last looked",
 * and a dropdown of the newest unhandled items across every queue this
 * viewer may see.
 *
 * The portal/outside-click/Escape mechanics are copied from `RowActions`
 * (`src/components/ui/row-actions.tsx`) rather than reinvented — the same
 * `overflow-x-auto` and top-bar `backdrop-blur-md` containing-block traps
 * apply to any floating panel anchored in this portal.
 */
export function NotificationBell({ isSuperAdmin, permissions }: NotificationBellProps) {
  const { counts, recent, seenAt, markSeen } = useNotifications();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const { rect, measure } = useAnchorRect(
    triggerRef,
    open,
    useCallback(() => close(false), [close]),
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, close]);

  const permitted = permittedQueues({ isSuperAdmin, permissions });
  const permittedSet = new Set(permitted);
  const permittedRecent = recent.filter((item) => permittedSet.has(item.queue));
  const unseen = hasUnseen(permittedRecent, seenAt);
  const unhandled = totalUnhandled(counts, permitted);

  const openPanel = () => {
    measure();
    setOpen(true);
    markSeen();
  };

  let panel: React.ReactNode = null;
  if (open && rect) {
    const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
    panel = createPortal(
      <MotionConfig reducedMotion="user">
        <motion.div
          ref={panelRef}
          id={panelId}
          role="menu"
          aria-label="Notifications"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
          initial={{ opacity: 0, scale: 0.95, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={POP}
          style={{ top: rect.bottom + GAP, left, width: PANEL_WIDTH, transformOrigin: "top right" }}
          className="fixed z-70 max-h-[70vh] overflow-y-auto rounded-2xl border border-ink-200/70 bg-white p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)]"
        >
          <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-500">
            New requests
          </p>
          {permittedRecent.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-500">You&apos;re all caught up.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {permittedRecent.map((item) => {
                const Icon = iconForHref(NOTIFICATION_QUEUES[item.queue].navHref);
                return (
                  <li key={`${item.queue}-${item.id}`}>
                    <Link
                      href={item.href}
                      role="menuitem"
                      onClick={() => close(false)}
                      className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-ink-50"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-900">{item.label}</span>
                        <span className="block truncate text-xs text-ink-500">{item.sublabel}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-ink-400">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.div>
      </MotionConfig>,
      document.body,
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unhandled > 0 ? `Notifications, ${unhandled} unhandled` : "Notifications"}
        onClick={() => (open ? close() : openPanel())}
        className={cn(
          "relative rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900",
          open && "bg-ink-50 text-ink-900",
        )}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unseen ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-white"
          />
        ) : null}
      </button>
      {panel}
    </>
  );
}
```

- [ ] **Step 2: Wire it into `AdminTopBar`**

Read `src/features/admin/components/admin-topbar.tsx` first to reconfirm line numbers (Task 1-5
did not touch this file).

Modify the imports (currently lines 1-14):

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import type { SessionUser } from "@/types";
import { cn } from "@/lib/utils";
import { POP } from "@/lib/motion";
import { adminPageTitle } from "@/lib/admin-nav";
import { Avatar } from "@/components/ui/avatar";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";
import { AdminGlobalSearch } from "@/features/admin/components/admin-global-search";
import { AdminMobileNav } from "@/features/admin/components/admin-mobile-nav";
import { NotificationBell } from "@/features/admin/components/notification-bell";
import { SignOutButton } from "@/features/admin/components/sign-out-button";
```

Update the file's doc comment, which is no longer accurate for Notifications. Currently (line 29):

```tsx
 * Notifications and Help used to sit here. Both were stubs wired to nothing.
```

Replace with:

```tsx
 * Notifications lives here again, wired to the real request queues (see
 * NotificationBell). Help remains removed — it was a stub wired to nothing.
```

Modify the right-hand cluster. Currently (lines 73-75):

```tsx
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <AdminGlobalSearch />
            <span aria-hidden="true" className="hidden h-6 w-px bg-ink-200 sm:block" />
```

Replace with:

```tsx
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <NotificationBell isSuperAdmin={user.isSuperAdmin} permissions={user.permissions} />
            <AdminGlobalSearch />
            <span aria-hidden="true" className="hidden h-6 w-px bg-ink-200 sm:block" />
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify**

With the dev server running and signed in:
- The bell renders left of the search bar. Click it: a panel opens listing the newest unhandled
  items across every queue you can see, each row linking to the right manager page with the
  ticket/subject and a relative time.
- If the panel is empty, it reads "You're all caught up."
- Click a row: it navigates to the manager page and opens that record's review drawer (confirms
  the `?review=`/`?tab=feedback&review=` deep link matches what `useEditDeepLink` expects — check
  against `src/features/admin/components/applications-manager.tsx:94` and
  `src/features/admin/components/feedback-panel.tsx:92` for the two link shapes).
- Escape closes the panel and returns focus to the bell button. Clicking outside the panel closes
  it without moving focus.
- If anything was unseen, the dot disappears as soon as the panel opens and stays gone on a
  second open.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/components/notification-bell.tsx src/features/admin/components/admin-topbar.tsx
git commit -m "feat(admin): add the notification bell to the top bar"
```

---

### Task 7: CLAUDE.md, end-to-end test, and final verification

**Files:**
- Modify: `CLAUDE.md:143` (insert a new architecture bullet)
- Create: `tests/e2e/admin/notifications.spec.ts`

**Interfaces:**
- Consumes: nothing new — this task documents and verifies Tasks 1-6.

- [ ] **Step 1: Add the CLAUDE.md bullet**

Read `CLAUDE.md` around line 143 first to reconfirm it still ends the idle-timeout bullet with
`swallows the key from capture, where \`stopImmediatePropagation()\` still comes first.` and is
immediately followed by the `**Home and About are database-backed content...**` bullet — no
earlier task touches this file, so it should be unchanged.

Insert a new bullet between them:

```markdown
- **Request notifications are two signals, not one.** The five `requests` nav rows (six queues —
  Inquiries & Feedback sums two) get a count badge for unhandled work (rows still in their
  initial status — `pending`, `received`, or `new`, depending on the table) and the top bar's
  bell gets a dot for "something arrived since you last looked." The count only moves on a status
  change; the dot only clears when the bell is opened (`markNotificationsSeen` stamps
  `profiles.notifications_seen_at`, migration `0026` — manual on production, like every migration
  since `0012`). One registry, `src/lib/notifications.ts`, owns each queue's table, status,
  permission and deep link — deliberately **not** merged into `search-modules.ts`: neither list
  contains the other (search omits `inquiries`; not all six queues are searchable), so a unit
  test checks the two agree on the five keys they share rather than merging them.
  `NotificationProvider` runs the one 60s poll (`GET /api/admin/notifications`, outside
  `src/middleware.ts`'s matcher, so it re-checks `getSessionUser` itself) that feeds the sidebar
  badges, the mobile nav card and the bell — one poll, three consumers. A 401 stops it silently;
  `<IdleTimeout />` alone owns the sign-out UI. Counts and recent items are computed only for
  queues the viewer's permissions allow, the same disclosure rule `adminPageTitle` follows for
  page titles.
```

- [ ] **Step 2: Write the end-to-end test**

Create `tests/e2e/admin/notifications.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

/**
 * The notification bell and nav count badges. Real unhandled counts depend
 * on live queue data (this suite reuses the same seeded admin session as
 * every other `admin` project spec), so these assert structure and
 * behaviour rather than exact numbers — a badge that reads "0" would be a
 * bug (NavCountBadge must render nothing instead), and that is what is
 * actually checked.
 */

test("the bell opens a panel and Escape closes it", async ({ page }) => {
  await page.goto("/admin");
  const bell = page.getByRole("button", { name: /Notifications/ });
  await bell.click();

  const panel = page.getByRole("menu", { name: "Notifications" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("New requests")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(bell).toBeFocused();
});

test("a nav count badge, if shown, never reads zero", async ({ page }) => {
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin navigation" });
  const badges = nav.locator("a[href^='/admin/'] span", { hasText: /^\d+\+?$/ });
  const count = await badges.count();
  for (let i = 0; i < count; i += 1) {
    await expect(badges.nth(i)).not.toHaveText("0");
  }
});
```

- [ ] **Step 3: Run the full verification suite**

Run, in order:

```bash
npm run typecheck
npm run lint
npm run test:unit
```

Expected: all three pass with no errors. `test:unit` should show the new
`tests/unit/notifications.test.ts` suite passing alongside the existing `admin-nav.test.ts` and
`motion.test.ts` suites.

- [ ] **Step 4: Run the Playwright admin suite**

The `admin` project skips entirely unless `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` are set in
`.env.local` (per CLAUDE.md's Commands section). If they are set:

```bash
npm run test:e2e -- --project=admin
```

Expected: `notifications.spec.ts` passes alongside the existing `global-search.spec.ts` and
`inbox-tabs.spec.ts`. If the credentials are not configured, note this explicitly rather than
claiming the suite passed — this matches the project's standing rule (CLAUDE.md: "For UI or
frontend changes ... if you can't test the UI, say so explicitly rather than claiming success").

- [ ] **Step 5: Manual smoke pass with the `verify` skill**

Follow `.claude/skills/verify/SKILL.md`'s recipe once over the whole feature: sign in, confirm the
badges and bell on desktop (expanded and collapsed rail) and mobile widths, confirm a bell click
clears the dot and a row click lands on the right record's review drawer, and confirm the portal
still loads correctly for a non-SuperAdmin account with only some request permissions (that
account should see badges only for its permitted queues, exactly as
`countForNavHref`/`permittedQueues` were unit-tested to do in Task 2).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md tests/e2e/admin/notifications.spec.ts
git commit -m "docs: document request notifications in CLAUDE.md; add e2e coverage"
```
