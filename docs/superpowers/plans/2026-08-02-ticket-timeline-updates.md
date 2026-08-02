# Progressive Ticket Timeline, `awaiting-info`, and Resident Replies — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all four ticketing flows a uniform `under-review`/`awaiting-info` status shape, an append-only `ticket_updates` log that drives the `/track` timeline, staff-authored updates with a visibility choice and an opt-out resident email, and a resident reply path with attachments.

**Architecture:** One new table `ticket_updates` keyed on `ticket_no` (globally unique across the four ticket tables by construction). Every status transition and every staff update writes a row; the public `/track` timeline renders those rows filtered to `visibility = 'public'`, plus one derived trailing "what's next" step. Residents reply only while a ticket is `awaiting-info`, through a Turnstile-gated public Server Action that re-verifies the ticket-number + surname gate before doing anything.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (Postgres + Storage), Zod v4, Vitest (unit), Playwright (e2e), react-email + Resend.

**Design spec:** `docs/superpowers/specs/2026-08-02-ticket-timeline-updates-design.md`

## Global Constraints

- **Server Actions are public HTTP endpoints.** Every write re-validates its input with Zod at runtime and re-checks permission via `checkPermission(...)`. Never trust a client-supplied status, path, or entry type.
- **RLS is enabled with zero policies** on `ticket_updates`, matching every ticket table. All access goes through the service-role client (`createSupabaseAdminClient`) after an explicit code check.
- **Public-form action ordering is fixed:** `verifyTurnstileToken` → `checkRateLimit` → Zod → business logic. A failed challenge must be the cheapest rejection and must never spend rate-limit budget.
- **Emails are fail-open and `await`ed.** Never fire-and-forget, never inspect `sendEmail()`'s return value, always null/`""`-check the resident's `email` column first.
- **Storage rule: delete the DB row before the Storage object, never the reverse.** On a failed row write, compensating-delete the uploaded object.
- **`postTicketUpdate` never writes `reviewed_*`, `closed_*`, `released_*`, `decided_*`, or `remarks`.** Those belong to the decision actions. `remarks` stays live and un-deprecated.
- **Upload ceiling:** 3 files × 2 MB = 6 MB, under the existing `bodySizeLimit: "8mb"` in `next.config.ts`. **Do not raise `bodySizeLimit`** and do not add a public Route Handler.
- **Colours come only from the `brand-*` / `ink-*` / `danger*` / `success*` Tailwind v4 tokens** in `src/app/globals.css`. No blue tokens; no `brand-900` (does not exist).
- **Every `startTransition(async () => {...})` wraps its action call in `try { … } catch { showError(...) }`.** A bare `try`/`finally` falls through to `error.tsx` and crashes the manager.
- **Every migration is applied manually by the owner.** Never assume it has been applied. Migration `0032` must reach an environment **before** this code does.
- Path alias `@/*` → `src/*`.

---

## File Structure

**Create**

| Path | Responsibility |
|---|---|
| `supabase/migrations/0032_ticket_updates.sql` | statuses, `replied_at`, `ticket_updates`, `ticket-media` bucket, backfill |
| `src/lib/ticket-updates.ts` | pure helpers + `recordTicketUpdate()` (shaped like `src/lib/audit.ts`) |
| `src/features/admin/actions/ticket-updates.ts` | `postTicketUpdate` Server Action |
| `src/features/admin/queries/ticket-updates.ts` | `listTicketUpdates` with batched signed attachment URLs |
| `src/features/admin/components/ticket-timeline-panel.tsx` | admin log + composer, shared by all 4 drawers |
| `src/features/track/components/ticket-reply-form.tsx` | public reply composer |
| `src/emails/TicketUpdateEmail.tsx` | resident update / info request |
| `src/emails/TicketReplyStaffNotifyEmail.tsx` | staff notification of a reply |
| `tests/unit/ticket-updates.test.ts` | pure helpers |
| `tests/unit/ticket-timeline.test.ts` | `buildSteps` |
| `tests/unit/ticket-update-emails.test.ts` | both templates |
| `tests/e2e/admin/ticket-updates.spec.ts` | internal-note leak test + reply round trip |

**Modify**

| Path | Change |
|---|---|
| `src/types/index.ts` | 4 status unions, `TicketUpdate*` types, `TicketLookupResult.timeline` |
| `src/lib/storage.ts` | `TICKET_MEDIA_BUCKET`, `MAX_REPLY_FILES`, `MAX_REPLY_FILE_BYTES` |
| `src/lib/media.ts` | `uploadTicketAttachment`, `discardTicketAttachment` |
| `src/features/admin/components/status-chip.tsx` | `awaiting-info` label + tone |
| `src/features/admin/actions/{applications,appointments,complaints,assistance}.ts` | log rows, widened guards |
| `src/features/{services,appointments,complaints,assistance}/actions.ts` | intake log rows |
| 4 review drawers, 4 managers | mount panel, status filter, reply pill |
| `src/features/track/actions.ts` | `loadTimeline`, `submitTicketReply` |
| `src/features/track/components/{ticket-timeline,track-lookup}.tsx` | log rendering, mount reply form |
| `src/lib/notifications.ts` + `src/features/admin/queries/notifications.ts` | `replyColumn` |
| `scripts/report-orphaned-media.mjs` | `ticket-media` case |
| `CLAUDE.md`, `docs/BACKEND_HANDOFF.md` | documentation |

---

## Task 1: Schema, storage constants, and status types

**Files:**
- Create: `supabase/migrations/0032_ticket_updates.sql`
- Modify: `src/types/index.ts`, `src/lib/storage.ts`, `src/features/admin/components/status-chip.tsx`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `TicketUpdateEntryType`, `TicketUpdateVisibility`, `TicketUpdateAuthorKind`, `TicketAttachment`, `TicketUpdateEntry`, `AdminTicketUpdate` types; `TICKET_MEDIA_BUCKET`, `MAX_REPLY_FILES`, `MAX_REPLY_FILE_BYTES` constants; the widened `ApplicationStatus` / `AppointmentStatus` / `ComplaintStatus` / `AssistanceStatus` unions.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0032_ticket_updates.sql`:

```sql
-- Progressive ticket timeline: uniform under-review/awaiting-info statuses, an
-- append-only ticket_updates log, and a private bucket for resident reply
-- attachments (design 2026-08-02-ticket-timeline-updates-design.md).
--
-- DEPLOY ORDER: apply this BEFORE the matching code. The list queries select
-- replied_at and the drawers write ticket_updates; a missing column fails at
-- runtime, not at build time.

-- ── 1. Widen the four status enums ──────────────────────────────────────────
-- Inline column checks are named <table>_<column>_check by Postgres.

alter table public.applications drop constraint applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('pending','under-review','awaiting-info','approved','released','rejected'));

alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('pending','under-review','awaiting-info','confirmed','completed','declined'));

alter table public.complaints drop constraint complaints_status_check;
alter table public.complaints add constraint complaints_status_check
  check (status in ('received','under-review','awaiting-info','resolved','dismissed'));

alter table public.assistance_requests drop constraint assistance_requests_status_check;
alter table public.assistance_requests add constraint assistance_requests_status_check
  check (status in ('pending','under-review','awaiting-info','granted','declined'));

-- ── 2. replied_at ───────────────────────────────────────────────────────────
-- Set when a resident replies, cleared when staff post their next update. A
-- reply flips the ticket to under-review, which is correctly NOT "untouched
-- work" — so without this column the nav badge would never fire for a reply
-- and staff would learn about it only from an email.

alter table public.applications        add column replied_at timestamptz;
alter table public.appointments        add column replied_at timestamptz;
alter table public.complaints          add column replied_at timestamptz;
alter table public.assistance_requests add column replied_at timestamptz;

create index applications_replied_at_idx        on public.applications (replied_at) where replied_at is not null;
create index appointments_replied_at_idx        on public.appointments (replied_at) where replied_at is not null;
create index complaints_replied_at_idx          on public.complaints (replied_at) where replied_at is not null;
create index assistance_requests_replied_at_idx on public.assistance_requests (replied_at) where replied_at is not null;

-- ── 3. ticket_updates ───────────────────────────────────────────────────────
-- Linked by ticket_no, not a uuid FK: there is no Postgres FK to a four-table
-- union, and ticket_no is already globally unique by construction
-- (next_ticket_number counts per (prefix, year); APP/APT/CMP/AST never collide).
-- lookupTicket already depends on this via tickets_view.
--
-- RLS enabled with NO policies, like every ticket table. Neither anon nor
-- authenticated may touch it; the service-role client after an explicit code
-- check is the entire gate.

create table public.ticket_updates (
  id            uuid primary key default gen_random_uuid(),
  ticket_no     text not null,
  ticket_kind   text not null check (ticket_kind in
                  ('application','appointment','complaint','assistance')),
  entry_type    text not null check (entry_type in
                  ('status','staff-note','info-request','resident-reply')),
  -- Set only on entry_type = 'status'; the status the ticket moved TO.
  status        text,
  body          text not null default '',
  -- The ENTIRE privacy gate for internal notes. Filtered in the query layer.
  visibility    text not null check (visibility in ('public','internal')),
  author_kind   text not null check (author_kind in ('staff','resident','system')),
  author_id     uuid references auth.users (id) on delete set null,
  author_name   text,
  -- [{path,name,mime,sizeBytes}] — resident replies only.
  attachments   jsonb not null default '[]',
  -- When a resident email was attempted for this entry.
  notified_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index ticket_updates_ticket_idx
  on public.ticket_updates (ticket_no, created_at);
create index ticket_updates_public_idx
  on public.ticket_updates (ticket_no, created_at) where visibility = 'public';

alter table public.ticket_updates enable row level security;

-- ── 4. ticket-media bucket ──────────────────────────────────────────────────
-- PRIVATE, and no read policy at all. An attachment here is typically a photo
-- of the resident's own ID; Storage's list() rides the same RLS select policy
-- as an individual get(), so a public bucket would make every resident's ID
-- anonymously enumerable. Second private bucket in the project, after
-- feedback-media, for exactly the same reason.

insert into storage.buckets (id, name, public)
  values ('ticket-media', 'ticket-media', false)
  on conflict (id) do nothing;

-- ── 5. Backfill ─────────────────────────────────────────────────────────────
-- So no live ticket renders an empty timeline. Each ticket gets an intake row,
-- a row at reviewed_at where non-null, and a row at its stage-2 timestamp where
-- non-null.
--
-- The status on a historical reviewed_at row must be INFERRED: the column was
-- overwritten, so an application now 'released' was 'approved' back then.
--
-- `remarks` goes on the LATEST row written by an action that sets remarks —
-- for applications/appointments that is the reviewed row (release/complete
-- never write remarks); for complaints/assistance it is the close/decide row
-- when one exists, else the reviewed row. `remarks` itself is NOT emptied: it
-- stays the live "latest decision reason" column.

-- Applications
insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, created_at)
  select ticket_no, 'application', 'status', 'pending', '', 'public', 'system', created_at
    from public.applications;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'application', 'status',
         case when status in ('approved','released') then 'approved'
              when status = 'rejected' then 'rejected'
              else status end,
         coalesce(remarks, ''), 'public', 'system', reviewed_by_name, reviewed_at
    from public.applications where reviewed_at is not null;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'application', 'status', 'released', '', 'public', 'system', released_by_name, released_at
    from public.applications where released_at is not null;

-- Appointments
insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, created_at)
  select ticket_no, 'appointment', 'status', 'pending', '', 'public', 'system', created_at
    from public.appointments;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'appointment', 'status',
         case when status in ('confirmed','completed') then 'confirmed'
              when status = 'declined' then 'declined'
              else status end,
         coalesce(remarks, ''), 'public', 'system', reviewed_by_name, reviewed_at
    from public.appointments where reviewed_at is not null;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'appointment', 'status', 'completed', '', 'public', 'system', completed_by_name, completed_at
    from public.appointments where completed_at is not null;

-- Complaints
insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, created_at)
  select ticket_no, 'complaint', 'status', 'received', '', 'public', 'system', created_at
    from public.complaints;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'complaint', 'status',
         case when status in ('under-review','resolved') then 'under-review'
              when status = 'dismissed' and closed_at is null then 'dismissed'
              else 'under-review' end,
         case when closed_at is null then coalesce(remarks, '') else '' end,
         'public', 'system', reviewed_by_name, reviewed_at
    from public.complaints where reviewed_at is not null;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'complaint', 'status', status, coalesce(remarks, ''), 'public', 'system', closed_by_name, closed_at
    from public.complaints where closed_at is not null;

-- Assistance
insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, created_at)
  select ticket_no, 'assistance', 'status', 'pending', '', 'public', 'system', created_at
    from public.assistance_requests;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'assistance', 'status',
         case when status in ('under-review','granted') then 'under-review'
              when status = 'declined' and decided_at is null then 'declined'
              else 'under-review' end,
         case when decided_at is null then coalesce(remarks, '') else '' end,
         'public', 'system', reviewed_by_name, reviewed_at
    from public.assistance_requests where reviewed_at is not null;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'assistance', 'status', status, coalesce(remarks, ''), 'public', 'system', decided_by_name, decided_at
    from public.assistance_requests where decided_at is not null;
```

- [ ] **Step 2: Add storage constants**

In `src/lib/storage.ts`, after the `FEEDBACK_MEDIA_BUCKET` / `MAX_SCREENSHOT_BYTES` block:

```ts
/**
 * Resident reply attachments. Private for the same reason feedback-media is:
 * an attachment here is typically a photo of the resident's own ID, and
 * Storage's list() rides the same RLS select policy as an individual get().
 */
export const TICKET_MEDIA_BUCKET = "ticket-media";

/**
 * 3 files x 2 MB = 6 MB, deliberately under next.config.ts's
 * bodySizeLimit: "8mb". This is what lets reply bytes ride inside the Server
 * Action instead of needing a Route Handler — and the Plan 3 document handler
 * is authenticated, so a public twin of it would be the largest new attack
 * surface in this feature. Do NOT raise these to fit a 10 MB scan.
 */
export const MAX_REPLY_FILES = 3;
export const MAX_REPLY_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
```

- [ ] **Step 3: Widen the status types and add the update types**

In `src/types/index.ts`, replace the four status unions (currently around lines 502–509):

```ts
/** Spec §3 flow: pending → under review ⇄ awaiting info → approved → released, or rejected. */
export type ApplicationStatus =
  | "pending" | "under-review" | "awaiting-info" | "approved" | "released" | "rejected";
/** Spec §3 flow: pending → under review ⇄ awaiting info → confirmed → completed, or declined. */
export type AppointmentStatus =
  | "pending" | "under-review" | "awaiting-info" | "confirmed" | "completed" | "declined";
/** Spec §3 flow: received → under review ⇄ awaiting info → resolved, or dismissed. */
export type ComplaintStatus =
  | "received" | "under-review" | "awaiting-info" | "resolved" | "dismissed";
/** Spec §3 flow: pending → under review ⇄ awaiting info → granted, or declined. */
export type AssistanceStatus =
  | "pending" | "under-review" | "awaiting-info" | "granted" | "declined";
```

Then append, next to `TicketLookupResult`:

```ts
/* ── Ticket updates: the append-only timeline log (design 2026-08-02) ─────── */

export type TicketUpdateEntryType = "status" | "staff-note" | "info-request" | "resident-reply";
export type TicketUpdateVisibility = "public" | "internal";
export type TicketUpdateAuthorKind = "staff" | "resident" | "system";

/** One resident-uploaded file on a reply. Stored as jsonb, never queried by field. */
export interface TicketAttachment {
  path: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

/**
 * A resident-visible timeline entry. Only ever built from rows where
 * `visibility = 'public'` — internal staff notes never reach this shape.
 * Attachments carry no URL here: a resident's own upload is not re-served to
 * them, so there is nothing to sign.
 */
export interface TicketUpdateEntry {
  id: string;
  entryType: TicketUpdateEntryType;
  status: TicketStatus | null;
  body: string;
  authorKind: TicketUpdateAuthorKind;
  authorName: string | null;
  attachmentCount: number;
  /** Manila calendar date (YYYY-MM-DD). */
  createdAt: string;
}

/** The admin view of the same row: internal notes included, attachments signed. */
export interface AdminTicketUpdate {
  id: string;
  entryType: TicketUpdateEntryType;
  status: TicketStatus | null;
  body: string;
  visibility: TicketUpdateVisibility;
  authorKind: TicketUpdateAuthorKind;
  authorName: string | null;
  attachments: (TicketAttachment & { url: string | null })[];
  notified: boolean;
  createdAt: string;
}

/** Body of `postTicketUpdate`. `setStatus` covers only the two mid-flow moves. */
export interface TicketUpdateValues {
  body: string;
  visibility: TicketUpdateVisibility;
  notify: boolean;
  setStatus: "under-review" | "awaiting-info" | null;
}
```

Do **not** touch `TicketLookupResult` here, and do **not** add `repliedAt` to `ApplicationRow` / `AppointmentRow` / `ComplaintRow` / `AssistanceRow`. Those are required fields on types the four list queries construct, so adding them before the queries select the column breaks `npm run typecheck` for every task in between. They land in Task 7, together with the query change that populates them.

- [ ] **Step 4: Add the status chip entry**

In `src/features/admin/components/status-chip.tsx`, add to `LABELS` (after `"under-review"`):

```ts
  "awaiting-info": "Awaiting Information",
```

and to `TONES`, in the "Attention states are amber" group:

```ts
  // Blocked on the resident. Waiting is workflow, not danger — amber, like review.
  "awaiting-info": "bg-brand-100 text-brand-800",
```

- [ ] **Step 5: Verify the build fails clean, then passes**

Run: `npm run typecheck`

Expected: PASS. `LABELS`/`TONES` are `Record<AdminStatus, string>`, so omitting either entry in Step 4 would have failed here — confirm by temporarily deleting one line, re-running, and seeing the error before restoring it.

- [ ] **Step 6: Ask the owner to apply the migration**

Migrations are applied manually. Post this message and **wait for confirmation before Task 3**:

> Migration `0032_ticket_updates.sql` is ready. Please apply it to staging/dev first, then confirm — the code from Task 3 onward selects `replied_at` and writes `ticket_updates`, so it will fail at runtime against an environment that hasn't had it applied.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0032_ticket_updates.sql src/types/index.ts src/lib/storage.ts src/features/admin/components/status-chip.tsx
git commit -m "feat: add awaiting-info status, ticket_updates schema, and ticket-media bucket"
```

---

## Task 2: `src/lib/ticket-updates.ts` — pure helpers and the log writer

**Files:**
- Create: `src/lib/ticket-updates.ts`
- Test: `tests/unit/ticket-updates.test.ts`

**Interfaces:**
- Consumes: `TicketKind`, `TicketStatus`, `TicketUpdate*` types and `TicketAttachment` from Task 1.
- Produces: `TICKET_INTAKE_STATUS`, `TICKET_TERMINAL_STATUSES`, `canReply()`, `isTerminalStatus()`, `REPLY_RETURN_STATUS`, `statusEntryCopy()`, `recordTicketUpdate()`.

This file mirrors `src/lib/audit.ts`: pure helpers plus one DB writer, in one module, imported only by server code.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ticket-updates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  REPLY_RETURN_STATUS,
  TICKET_INTAKE_STATUS,
  canReply,
  isTerminalStatus,
  statusEntryCopy,
} from "@/lib/ticket-updates";

describe("canReply", () => {
  it("is true only for awaiting-info", () => {
    expect(canReply("awaiting-info")).toBe(true);
    expect(canReply("pending")).toBe(false);
    expect(canReply("under-review")).toBe(false);
    expect(canReply("released")).toBe(false);
    expect(canReply("dismissed")).toBe(false);
  });
});

describe("TICKET_INTAKE_STATUS", () => {
  it("gives each kind its own intake status — complaints are `received`, not `pending`", () => {
    expect(TICKET_INTAKE_STATUS.application).toBe("pending");
    expect(TICKET_INTAKE_STATUS.appointment).toBe("pending");
    expect(TICKET_INTAKE_STATUS.complaint).toBe("received");
    expect(TICKET_INTAKE_STATUS.assistance).toBe("pending");
  });
});

describe("isTerminalStatus", () => {
  it("recognises each kind's own terminal statuses", () => {
    expect(isTerminalStatus("application", "released")).toBe(true);
    expect(isTerminalStatus("application", "rejected")).toBe(true);
    expect(isTerminalStatus("application", "approved")).toBe(false);
    expect(isTerminalStatus("complaint", "resolved")).toBe(true);
    expect(isTerminalStatus("complaint", "under-review")).toBe(false);
    expect(isTerminalStatus("assistance", "granted")).toBe(true);
    expect(isTerminalStatus("appointment", "completed")).toBe(true);
  });

  it("treats awaiting-info as non-terminal for every kind", () => {
    expect(isTerminalStatus("application", "awaiting-info")).toBe(false);
    expect(isTerminalStatus("appointment", "awaiting-info")).toBe(false);
    expect(isTerminalStatus("complaint", "awaiting-info")).toBe(false);
    expect(isTerminalStatus("assistance", "awaiting-info")).toBe(false);
  });
});

describe("REPLY_RETURN_STATUS", () => {
  it("returns a replied ticket to under-review, never to its intake status", () => {
    // A ticket that has been reviewed and replied to is not "Pending".
    expect(REPLY_RETURN_STATUS).toBe("under-review");
  });
});

describe("statusEntryCopy", () => {
  it("gives per-kind wording for the same status word", () => {
    expect(statusEntryCopy("application", "approved").title).toBe("Approved");
    expect(statusEntryCopy("complaint", "under-review").title).toBe("Under review");
    expect(statusEntryCopy("appointment", "confirmed").title).toBe("Confirmed");
  });

  it("words awaiting-info as a request, not a delay", () => {
    const copy = statusEntryCopy("application", "awaiting-info");
    expect(copy.title).toBe("More information needed");
    expect(copy.detail).toContain("need something from you");
  });

  it("falls back rather than throwing on an unmapped status", () => {
    const copy = statusEntryCopy("application", "some-future-status" as never);
    expect(copy.title.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- ticket-updates`
Expected: FAIL — `Failed to resolve import "@/lib/ticket-updates"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/ticket-updates.ts`:

```ts
import type {
  TicketAttachment,
  TicketKind,
  TicketStatus,
  TicketUpdateAuthorKind,
  TicketUpdateEntryType,
  TicketUpdateVisibility,
} from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** The status a freshly-filed ticket of each kind carries. Not uniform. */
export const TICKET_INTAKE_STATUS: Record<TicketKind, TicketStatus> = {
  application: "pending",
  appointment: "pending",
  complaint: "received",
  assistance: "pending",
};

/** Statuses from which no further transition is offered. */
export const TICKET_TERMINAL_STATUSES: Record<TicketKind, readonly TicketStatus[]> = {
  application: ["released", "rejected"],
  appointment: ["completed", "declined"],
  complaint: ["resolved", "dismissed"],
  assistance: ["granted", "declined"],
};

/**
 * Where a resident reply puts the ticket back. Deliberately NOT the intake
 * status: a ticket that has been reviewed and replied to is not "Pending", and
 * a status column should describe reality. The nav badge picks the reply up
 * through `replied_at` instead (see src/lib/notifications.ts).
 */
export const REPLY_RETURN_STATUS = "under-review" as const;

/** A resident may reply only while staff have actually asked for something. */
export function canReply(status: TicketStatus): boolean {
  return status === "awaiting-info";
}

export function isTerminalStatus(kind: TicketKind, status: TicketStatus): boolean {
  return TICKET_TERMINAL_STATUSES[kind].includes(status);
}

export interface StatusEntryCopy {
  title: string;
  detail: string;
}

/**
 * Default resident-facing wording for a machine-written status entry, used when
 * the transition carried no remarks of its own. Per-kind because the same
 * status word means different things: an application is "Approved — ready to
 * claim", an assistance request is "Granted".
 */
const STATUS_COPY: Record<TicketKind, Partial<Record<TicketStatus, StatusEntryCopy>>> = {
  application: {
    pending: { title: "Received", detail: "Your request reached the barangay office." },
    "under-review": { title: "Under review", detail: "Barangay staff are reviewing your request." },
    approved: { title: "Approved", detail: "Your document is ready to claim at the barangay hall." },
    released: { title: "Released", detail: "Claimed at the barangay hall." },
    rejected: { title: "Not approved", detail: "This request was not approved." },
  },
  appointment: {
    pending: { title: "Received", detail: "Your request reached the barangay office." },
    "under-review": { title: "Under review", detail: "Barangay staff are checking the schedule you asked for." },
    confirmed: { title: "Confirmed", detail: "Barangay staff confirmed your schedule." },
    completed: { title: "Completed", detail: "Thank you for coming in." },
    declined: { title: "Declined", detail: "This appointment was not granted." },
  },
  complaint: {
    received: { title: "Received", detail: "Your report reached the barangay office." },
    "under-review": { title: "Under review", detail: "The Lupong Tagapamayapa is looking into your report." },
    resolved: { title: "Resolved", detail: "This report has been settled." },
    dismissed: { title: "Dismissed", detail: "This report was closed without a settlement." },
  },
  assistance: {
    pending: { title: "Received", detail: "Your request reached the barangay office." },
    "under-review": { title: "Under review", detail: "The Barangay Social Welfare Desk is assessing your request." },
    granted: { title: "Granted", detail: "Your request was granted — barangay staff will contact you." },
    declined: { title: "Declined", detail: "This request was not granted." },
  },
};

/** Same for every kind: asking the resident for something reads identically. */
const AWAITING_INFO_COPY: StatusEntryCopy = {
  title: "More information needed",
  detail: "Barangay staff need something from you before this can move forward.",
};

export function statusEntryCopy(kind: TicketKind, status: TicketStatus): StatusEntryCopy {
  if (status === "awaiting-info") return AWAITING_INFO_COPY;
  return (
    STATUS_COPY[kind][status] ?? {
      title: "Updated",
      detail: "This request was updated.",
    }
  );
}

/**
 * One timeline entry. An options object rather than positional arguments, for
 * the same reason `AuditInput` is one: eleven fields is unreadable positionally.
 */
export interface TicketUpdateInput {
  ticketNo: string;
  kind: TicketKind;
  entryType: TicketUpdateEntryType;
  /** Only on entry_type 'status'. The status moved TO. */
  status?: TicketStatus | null;
  body?: string;
  visibility: TicketUpdateVisibility;
  authorKind: TicketUpdateAuthorKind;
  authorId?: string | null;
  authorName?: string | null;
  attachments?: TicketAttachment[];
}

/**
 * Append one row to the timeline log.
 *
 * Returns the new row's id, or null on failure. The status-transition callers
 * ignore the return value and are fire-and-forget by design — an audit-style
 * log failure must never roll back the decision it records. `postTicketUpdate`
 * DOES check it, because writing the row is that action's entire purpose.
 *
 * Deliberately shaped like `recordActivity` in src/lib/audit.ts so the two read
 * as siblings — but they are NOT merged. `audit_log` records staff actions for
 * accountability across every module; this is resident-facing content for one.
 */
export async function recordTicketUpdate(entry: TicketUpdateInput): Promise<string | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("ticket_updates")
      .insert({
        ticket_no: entry.ticketNo,
        ticket_kind: entry.kind,
        entry_type: entry.entryType,
        status: entry.status ?? null,
        body: entry.body ?? "",
        visibility: entry.visibility,
        author_kind: entry.authorKind,
        author_id: entry.authorId ?? null,
        author_name: entry.authorName ?? null,
        attachments: entry.attachments ?? [],
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("recordTicketUpdate failed:", error?.message);
      return null;
    }
    return data.id;
  } catch (cause) {
    console.error("recordTicketUpdate threw:", cause);
    return null;
  }
}

/** Stamp `notified_at` after a resident email was attempted. Best-effort. */
export async function markTicketUpdateNotified(id: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("ticket_updates")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("markTicketUpdateNotified failed:", error.message);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- ticket-updates`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ticket-updates.ts tests/unit/ticket-updates.test.ts
git commit -m "feat: add ticket-updates log helpers and recordTicketUpdate"
```

---

## Task 3: Write log rows from every existing transition and submission

**Files:**
- Modify: `src/features/admin/actions/applications.ts`, `appointments.ts`, `complaints.ts`, `assistance.ts`
- Modify: `src/features/services/actions.ts`, `src/features/appointments/actions.ts`, `src/features/complaints/actions.ts`, `src/features/assistance/actions.ts`

**Interfaces:**
- Consumes: `recordTicketUpdate`, `TICKET_INTAKE_STATUS` (Task 2).
- Produces: every ticket now has a log row per transition; the eight admin transition guards accept the two new statuses.

**Do not** add `revalidatePath` calls beyond those already present, and **do not** change any `remarks`, `reviewed_*`, `closed_*`, `released_*` or `decided_*` write.

- [ ] **Step 1: Widen the four stage-1 transition guards**

In `src/features/admin/actions/applications.ts`, `reviewApplication`:

```ts
    .eq("id", id)
    .in("status", ["pending", "under-review", "awaiting-info"])
```

Apply the identical change to `reviewAppointment` (`appointments.ts`) and `reviewAssistance` (`assistance.ts`). In `complaints.ts`, `reviewComplaint` uses the complaint intake status instead:

```ts
    .eq("id", id)
    .in("status", ["received", "under-review", "awaiting-info"])
```

- [ ] **Step 2: Widen the two stage-2 guards that must accept an unanswered ticket**

Staff must be able to close a ticket the resident never answered. In `complaints.ts`, `closeComplaint`:

```ts
    .eq("id", id)
    .in("status", ["under-review", "awaiting-info"])
```

and in `assistance.ts`, `decideAssistance`:

```ts
    .eq("id", id)
    .in("status", ["under-review", "awaiting-info"])
```

Update their "already decided" error strings to match:

```ts
  if (!data) {
    return { error: "Only reports under review can be closed. Refresh to see its status." };
  }
```
becomes
```ts
  if (!data) {
    return { error: "Only open reports can be closed. Refresh to see its status." };
  }
```
(and the assistance twin: `"Only open requests can be decided. Refresh to see its status."`).

`releaseApplication` (`.eq("status","approved")`) and `completeAppointment` (`.eq("status","confirmed")`) are **unchanged** — a document cannot be released before it is approved.

- [ ] **Step 3: Write a log row from each of the eight transitions**

Each of these already `select`s `ticket_no`. Add the import and one call immediately **after** the `if (!data)` guard and **before** `recordActivity`. `reviewApplication` in `applications.ts`:

```ts
import { recordTicketUpdate } from "@/lib/ticket-updates";
```

```ts
  const approved = parsed.data.status === "approved";
  await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "application",
    entryType: "status",
    status: parsed.data.status,
    body: parsed.data.remarks || "",
    visibility: "public",
    authorKind: "system",
    authorName: actor.fullName,
  });
```

`releaseApplication` — same shape, `status: "released"`, `body: ""`.

Apply the same to: `reviewAppointment` (`kind: "appointment"`, status from `parsed.data.status`), `completeAppointment` (`status: "completed"`, `body: ""`), `reviewComplaint` (`kind: "complaint"`), `closeComplaint` (`kind: "complaint"`), `reviewAssistance` (`kind: "assistance"`), `decideAssistance` (`kind: "assistance"`).

Every one uses `visibility: "public"`, `authorKind: "system"`, `authorName: actor.fullName`.

- [ ] **Step 4: Write an intake log row from all eight submission paths**

The four public actions (`submitApplication` in `src/features/services/actions.ts`, `submitAppointment`, `submitComplaint`, `submitAssistance`) and the four walk-in actions (`createWalkInApplication` etc.) each already `select("ticket_no")` after their insert. Add, immediately after the `if (error || !data)` guard:

```ts
import { TICKET_INTAKE_STATUS, recordTicketUpdate } from "@/lib/ticket-updates";
```

```ts
  await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "application",
    entryType: "status",
    status: TICKET_INTAKE_STATUS.application,
    visibility: "public",
    authorKind: "system",
  });
```

Substitute the right `kind` in each of the eight. The walk-in actions additionally pass `authorName: actor.fullName` — a walk-in row was encoded by a named person.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS both.

Then, with the dev server running and migration `0032` applied, submit one application through `/services` and confirm two things in Supabase:

```sql
select ticket_no, entry_type, status, body, author_kind from public.ticket_updates
  order by created_at desc limit 5;
```

Expected: one `status` / `pending` / `system` row for the new ticket. Then approve it in `/admin/applications` and re-run — expect a second row with `status = 'approved'`.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/actions/ src/features/services/actions.ts src/features/appointments/actions.ts src/features/complaints/actions.ts src/features/assistance/actions.ts
git commit -m "feat: log every ticket transition and submission to ticket_updates"
```

---

## Task 4: Email templates

**Files:**
- Create: `src/emails/TicketUpdateEmail.tsx`, `src/emails/TicketReplyStaffNotifyEmail.tsx`
- Test: `tests/unit/ticket-update-emails.test.ts`

**Interfaces:**
- Consumes: `TicketNotice` / `TicketNoticeProps` from `src/emails/shared/TicketNotice.tsx`, `EmailLayout`, `EMAIL_SITE_URL`.
- Produces: `TicketUpdateEmail({ firstName, ticketNo, kindLabel, body, needsInfo })`, `TicketReplyStaffNotifyEmail({ ticketNo, kindLabel, attachmentCount, adminHref })`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ticket-update-emails.test.ts`:

```ts
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { TicketUpdateEmail } from "@/emails/TicketUpdateEmail";
import { TicketReplyStaffNotifyEmail } from "@/emails/TicketReplyStaffNotifyEmail";

describe("TicketUpdateEmail", () => {
  it("renders a plain update with the staff body and a track link", async () => {
    const html = await render(
      createElement(TicketUpdateEmail, {
        firstName: "Maria",
        ticketNo: "APP-2026-00001",
        kindLabel: "certificate application",
        body: "Your document is being printed.",
        needsInfo: false,
      }),
    );
    expect(html).toContain("Maria");
    expect(html).toContain("APP-2026-00001");
    expect(html).toContain("Your document is being printed.");
    expect(html).toContain("/track?ticket=APP-2026-00001");
    expect(html).toContain("Track this ticket");
  });

  it("switches headline and button copy when information is needed", async () => {
    const html = await render(
      createElement(TicketUpdateEmail, {
        firstName: "Jose",
        ticketNo: "AST-2026-00007",
        kindLabel: "assistance request",
        body: "Please send a photo of your barangay ID.",
        needsInfo: true,
      }),
    );
    expect(html).toContain("Send the information");
    expect(html).toContain("Please send a photo of your barangay ID.");
    expect(html).not.toContain("Track this ticket");
  });
});

describe("TicketReplyStaffNotifyEmail", () => {
  it("names the ticket and the attachment count, and links to the admin queue", async () => {
    const html = await render(
      createElement(TicketReplyStaffNotifyEmail, {
        ticketNo: "CMP-2026-00003",
        kindLabel: "incident report",
        attachmentCount: 2,
        adminHref: "/admin/complaints?review=abc-123",
      }),
    );
    expect(html).toContain("CMP-2026-00003");
    expect(html).toContain("2");
    expect(html).toContain("/admin/complaints?review=abc-123");
  });

  it("never echoes the reply body — a complaint reply can carry incident detail", async () => {
    const html = await render(
      createElement(TicketReplyStaffNotifyEmail, {
        ticketNo: "CMP-2026-00004",
        kindLabel: "incident report",
        attachmentCount: 0,
        adminHref: "/admin/complaints?review=def-456",
      }),
    );
    // The component takes no `body` prop at all — this asserts the shape, not a filter.
    expect(html).not.toContain("undefined");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- ticket-update-emails`
Expected: FAIL — `Failed to resolve import "@/emails/TicketUpdateEmail"`.

- [ ] **Step 3: Add the `trackLabel` prop to `TicketNotice`**

Do this *before* Step 4 — `TicketUpdateEmail` passes `trackLabel`, so writing it first leaves the tree failing `typecheck` in between.

`TicketNotice` currently hardcodes its button copy. In `src/emails/shared/TicketNotice.tsx`, add to `TicketNoticeProps`:

```ts
  /** Button copy. Defaults to the tracking wording; the info-request email overrides it. */
  trackLabel?: string;
```

destructure it with `trackLabel = "Track this ticket"`, and use `{trackLabel}` as the `<Button>`'s child in place of the current literal. Every existing caller keeps the default, so no other template changes.

- [ ] **Step 4: Write `TicketUpdateEmail`**

Create `src/emails/TicketUpdateEmail.tsx`:

```tsx
import { TicketNotice } from "./shared/TicketNotice";

export interface TicketUpdateEmailProps {
  firstName: string;
  ticketNo: string;
  /** e.g. "certificate application", "incident report". Lower-case, mid-sentence. */
  kindLabel: string;
  /** Exactly what staff typed. Never a field read from the ticket row itself. */
  body: string;
  /** True when this update also moved the ticket to `awaiting-info`. */
  needsInfo: boolean;
}

/**
 * One template for both a plain update and an information request, switched by
 * `needsInfo` rather than split into two near-identical files — the same DRY
 * reasoning that produced the shared <TicketNotice>.
 *
 * `body` is the ONLY variable content that reaches the resident. Nothing is read
 * from the ticket row, which is what keeps the "complaints show status only"
 * rule intact by construction rather than by review.
 */
export function TicketUpdateEmail({
  firstName,
  ticketNo,
  kindLabel,
  body,
  needsInfo,
}: TicketUpdateEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={needsInfo ? `We need more information — ${ticketNo}` : `Update on your ${kindLabel}`}
      headline={needsInfo ? "We need more information" : "There's an update on your request"}
      intro={
        needsInfo
          ? `Before we can move your ${kindLabel} forward, barangay staff need something from you.`
          : `Barangay staff have posted an update on your ${kindLabel}.`
      }
      ticketNo={ticketNo}
      remarksLabel={needsInfo ? "What we need" : "Update"}
      remarks={body}
      trackHref={`/track?ticket=${ticketNo}`}
      trackLabel={needsInfo ? "Send the information" : "Track this ticket"}
    />
  );
}
```

- [ ] **Step 5: Write `TicketReplyStaffNotifyEmail`**

Create `src/emails/TicketReplyStaffNotifyEmail.tsx`:

```tsx
import { Button, Text } from "react-email";
import { EmailLayout } from "./EmailLayout";
import { EMAIL_SITE_URL } from "./site-url";

export interface TicketReplyStaffNotifyEmailProps {
  ticketNo: string;
  /** e.g. "incident report". Lower-case, mid-sentence. */
  kindLabel: string;
  attachmentCount: number;
  /** Admin deep link, e.g. "/admin/complaints?review=<id>". */
  adminHref: string;
}

/**
 * Staff-facing: a resident answered an information request.
 *
 * It deliberately takes NO `body` prop. For a complaint, a reply can carry
 * incident detail, and the restraint ComplaintSubmittedEmail already applies —
 * never echoing a narrative, even to the reporter's own inbox — applies here
 * too. Staff read the reply in the admin queue, where it belongs.
 */
export function TicketReplyStaffNotifyEmail({
  ticketNo,
  kindLabel,
  attachmentCount,
  adminHref,
}: TicketReplyStaffNotifyEmailProps) {
  const files =
    attachmentCount === 0
      ? "No files were attached."
      : attachmentCount === 1
        ? "1 file was attached."
        : `${attachmentCount} files were attached.`;

  return (
    <EmailLayout previewText={`Resident reply on ${ticketNo}`}>
      <Text>
        A resident replied to the information request on {kindLabel} <strong>{ticketNo}</strong>.
      </Text>
      <Text>{files}</Text>
      <Button href={`${EMAIL_SITE_URL}${adminHref}`}>Open in the admin portal</Button>
    </EmailLayout>
  );
}
```

Check `src/emails/EmailLayout.tsx` for its actual prop name before writing this — if it takes `preview` rather than `previewText`, match the existing one rather than changing `EmailLayout`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:unit -- ticket-update-emails`
Expected: PASS, 4 tests.

Then run the whole unit suite to confirm the `TicketNotice` change broke nothing:

Run: `npm run test:unit`
Expected: PASS, including the existing `ticket-notice.test.ts` and the four `*-emails.test.ts` files.

- [ ] **Step 7: Commit**

```bash
git add src/emails/ tests/unit/ticket-update-emails.test.ts
git commit -m "feat: add ticket update and reply-notify email templates"
```

---

## Task 5: `postTicketUpdate` Server Action and the admin query

**Files:**
- Create: `src/features/admin/actions/ticket-updates.ts`, `src/features/admin/queries/ticket-updates.ts`
- Modify: `src/lib/media.ts`

**Interfaces:**
- Consumes: `recordTicketUpdate`, `markTicketUpdateNotified`, `isTerminalStatus` (Task 2); `TicketUpdateEmail` (Task 4); `TICKET_MEDIA_BUCKET` (Task 1).
- Produces:
  - `postTicketUpdate(kind: TicketKind, id: string, values: TicketUpdateValues): Promise<ActionResult>`
  - `listTicketUpdates(ticketNo: string): Promise<AdminTicketUpdate[]>`
  - `uploadTicketAttachment(file: File, ticketNo: string): Promise<UploadResult>` and `discardTicketAttachment(path, context)` in `src/lib/media.ts` (used by Task 9, defined here so both tasks share one implementation)

- [ ] **Step 1: Add the storage helpers**

In `src/lib/media.ts`, after `discardFeedbackScreenshot`, add:

```ts
/**
 * Upload one resident reply attachment into the private ticket-media bucket.
 *
 * Separate from `uploadFeedbackScreenshot` because the bucket, the prefix and
 * the allowed types differ — replies accept PDFs, screenshots do not. As with
 * every uploader here, persisting the returned `src` is the caller's job, and
 * so is deleting the object if the row write then fails.
 */
export async function uploadTicketAttachment(
  file: File,
  ticketNo: string,
): Promise<UploadResult> {
  if (file.size === 0) return { error: "Choose a file.", src: null, url: null };
  if (!ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number])) {
    return { error: "Attachments must be JPG, PNG, WebP, or PDF.", src: null, url: null };
  }
  if (file.size > MAX_REPLY_FILE_BYTES) {
    return { error: "Each attachment must be 2 MB or smaller.", src: null, url: null };
  }
  // ticketNo is server-derived (matched against the DB), never client free text.
  const path = `${ticketNo}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(TICKET_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", src: null, url: null };
  return { error: null, src: path, url: null };
}

/** Best-effort cleanup, mirroring `discardFeedbackScreenshot`: logs, never throws. */
export async function discardTicketAttachment(
  path: string | null,
  context: string,
): Promise<void> {
  if (!path) return;
  if (path.split("/").some((segment) => segment === "..")) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(TICKET_MEDIA_BUCKET).remove([path]);
  if (error) console.error(`Orphaned ticket attachment (${context}): ${path}`);
}
```

Extend `extForType` to map `"application/pdf"` → `"pdf"` if it does not already; check the existing implementation before editing. Add `ALLOWED_DOC_FILE_TYPES`, `MAX_REPLY_FILE_BYTES` and `TICKET_MEDIA_BUCKET` to the `@/lib/storage` import list at the top of the file.

- [ ] **Step 2: Write the admin query**

Create `src/features/admin/queries/ticket-updates.ts`:

```ts
import type { AdminTicketUpdate, TicketAttachment, TicketStatus } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";
import { TICKET_MEDIA_BUCKET } from "@/lib/storage";

/** Ten minutes: long enough to open an attachment, short enough to be worthless if leaked. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * The full timeline for one ticket, INCLUDING internal notes. Uses the
 * service-role client because `ticket_updates` has no RLS policies — callers
 * MUST have checked the queue's permission first (postTicketUpdate and the
 * manager pages do).
 *
 * Attachments are signed in ONE batch for the whole timeline rather than per
 * row, the same reasoning `listFeedback` documents: a long thread must not
 * become one round trip per file.
 */
export async function listTicketUpdates(ticketNo: string): Promise<AdminTicketUpdate[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ticket_updates")
    .select(
      "id, entry_type, status, body, visibility, author_kind, author_name, attachments, notified_at, created_at",
    )
    .eq("ticket_no", ticketNo)
    .order("created_at", { ascending: true });
  if (error || !data) {
    if (error) console.error("listTicketUpdates failed:", error.message);
    return [];
  }

  const paths = data.flatMap((row) =>
    ((row.attachments ?? []) as TicketAttachment[]).map((file) => file.path),
  );

  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls, error: signError } = await admin.storage
      .from(TICKET_MEDIA_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    // A signing failure must not empty the timeline — the entry still matters
    // without its file, so the attachment renders with url null.
    if (signError) console.error("listTicketUpdates could not sign attachments:", signError.message);
    for (const entry of urls ?? []) {
      if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
    }
  }

  return data.map((row) => ({
    id: row.id,
    entryType: row.entry_type as AdminTicketUpdate["entryType"],
    status: (row.status as TicketStatus | null) ?? null,
    body: row.body,
    visibility: row.visibility as AdminTicketUpdate["visibility"],
    authorKind: row.author_kind as AdminTicketUpdate["authorKind"],
    authorName: row.author_name,
    attachments: ((row.attachments ?? []) as TicketAttachment[]).map((file) => ({
      ...file,
      url: signed.get(file.path) ?? null,
    })),
    notified: row.notified_at !== null,
    createdAt: toManilaDate(row.created_at),
  }));
}
```

- [ ] **Step 3: Write `postTicketUpdate`**

Create `src/features/admin/actions/ticket-updates.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Permission, TicketKind, TicketStatus, TicketUpdateValues } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { TicketUpdateEmail } from "@/emails/TicketUpdateEmail";
import { isTerminalStatus, markTicketUpdateNotified, recordTicketUpdate } from "@/lib/ticket-updates";

export interface ActionResult {
  error: string | null;
}

/** Per-kind table, permission, manager path and email wording. One registry, four flows. */
const KINDS: Record<
  TicketKind,
  { table: string; permission: Permission; path: string; label: string; entity: string }
> = {
  application: {
    table: "applications",
    permission: "process-applications",
    path: "/admin/applications",
    label: "certificate application",
    entity: "application",
  },
  appointment: {
    table: "appointments",
    permission: "process-appointments",
    path: "/admin/appointments",
    label: "appointment request",
    entity: "appointment",
  },
  complaint: {
    table: "complaints",
    permission: "handle-complaints",
    path: "/admin/complaints",
    label: "incident report",
    entity: "complaint",
  },
  assistance: {
    table: "assistance_requests",
    permission: "handle-assistance",
    path: "/admin/assistance",
    label: "assistance request",
    entity: "assistance",
  },
};

const schema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write the update.")
    .max(2000, "Please keep the update under 2000 characters."),
  visibility: z.enum(["public", "internal"]),
  notify: z.boolean(),
  setStatus: z.union([z.literal("under-review"), z.literal("awaiting-info"), z.null()]),
});

/**
 * Post one staff update to a ticket's timeline, optionally moving it to
 * `under-review` or `awaiting-info` and optionally emailing the resident.
 *
 * It NEVER writes reviewed_*/closed_*/released_*/decided_* or `remarks` —
 * those belong to the decision actions and record who decided what, when.
 * Moving a ticket to `under-review` is not a decision.
 */
export async function postTicketUpdate(
  kind: TicketKind,
  id: string,
  values: TicketUpdateValues,
): Promise<ActionResult> {
  const def = KINDS[kind];
  const actor = await checkPermission(def.permission);
  if (!actor) return { error: NOT_FOUND };

  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid update." };
  }

  // Asking for information the resident cannot see is incoherent. The UI locks
  // the radio; this re-checks rather than trusting the client.
  const visibility =
    parsed.data.setStatus === "awaiting-info" ? "public" : parsed.data.visibility;
  // An internal note has no resident to notify, whatever the client sent.
  const notify = visibility === "public" && parsed.data.notify;

  const admin = createSupabaseAdminClient();
  const { data: ticket, error: loadError } = await admin
    .from(def.table)
    .select("ticket_no, status, email, first_name")
    .eq("id", id)
    .maybeSingle();
  if (loadError) return { error: "Could not load that ticket." };
  if (!ticket) return { error: NOT_FOUND };

  const current = ticket.status as TicketStatus;
  if (isTerminalStatus(kind, current)) {
    return { error: "That ticket is already closed. Refresh to see its status." };
  }

  const entryId = await recordTicketUpdate({
    ticketNo: ticket.ticket_no,
    kind,
    entryType: parsed.data.setStatus === "awaiting-info" ? "info-request" : "staff-note",
    status: null,
    body: parsed.data.body,
    visibility,
    authorKind: "staff",
    authorId: actor.id,
    authorName: actor.fullName,
  });
  if (!entryId) return { error: "Could not save the update." };

  if (parsed.data.setStatus) {
    // Guard the transition in the WHERE clause: a stale tab must not move a
    // ticket someone else has since decided.
    const { error: statusError } = await admin
      .from(def.table)
      .update({ status: parsed.data.setStatus, replied_at: null })
      .eq("id", id)
      .eq("status", current);
    if (statusError) return { error: "Could not update the status." };
    await recordTicketUpdate({
      ticketNo: ticket.ticket_no,
      kind,
      entryType: "status",
      status: parsed.data.setStatus,
      visibility: "public",
      authorKind: "system",
      authorName: actor.fullName,
    });
  } else {
    // Staff have responded; the reply is no longer unread.
    await admin.from(def.table).update({ replied_at: null }).eq("id", id);
  }

  if (notify && ticket.email) {
    await sendEmail({
      to: ticket.email,
      subject:
        parsed.data.setStatus === "awaiting-info"
          ? `We need more information — ${ticket.ticket_no}`
          : `Update on your request — ${ticket.ticket_no}`,
      template: TicketUpdateEmail({
        firstName: ticket.first_name,
        ticketNo: ticket.ticket_no,
        kindLabel: def.label,
        body: parsed.data.body,
        needsInfo: parsed.data.setStatus === "awaiting-info",
      }),
    });
    await markTicketUpdateNotified(entryId);
  }

  await recordActivity(actor, {
    type: "update",
    action:
      parsed.data.setStatus === "awaiting-info"
        ? `requested information on ${def.entity}`
        : `posted ${visibility === "internal" ? "internal note" : "update"} on ${def.entity}`,
    entityType: def.entity,
    entityId: ticket.ticket_no,
    entityLabel: ticket.ticket_no,
  });

  revalidatePath(def.path);
  return { error: null };
}
```

Note the audit entry carries **no `detail`**: an internal note's text must not be duplicated into `audit_log`, which has a different retention and a different audience.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media.ts src/features/admin/actions/ticket-updates.ts src/features/admin/queries/ticket-updates.ts
git commit -m "feat: add postTicketUpdate action, admin timeline query, and ticket attachment storage"
```

---

## Task 6: `TicketTimelinePanel` and the four review drawers

**Files:**
- Create: `src/features/admin/components/ticket-timeline-panel.tsx`
- Modify: `src/features/admin/components/{application,appointment,complaint,assistance}-review-drawer.tsx`
- Modify: the four managers, to load and pass the timeline

**Interfaces:**
- Consumes: `listTicketUpdates` (Task 5), `postTicketUpdate` (Task 5), `AdminTicketUpdate` / `TicketUpdateValues` (Task 1).
- Produces: `<TicketTimelinePanel kind ticketId ticketNo updates hasEmail canPost />`

- [ ] **Step 1: Write the panel**

Create `src/features/admin/components/ticket-timeline-panel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Lock, Paperclip } from "lucide-react";
import type { AdminTicketUpdate, TicketKind, TicketUpdateValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { cn } from "@/lib/utils";
import { postTicketUpdate } from "../actions/ticket-updates";

interface TicketTimelinePanelProps {
  kind: TicketKind;
  ticketId: string;
  updates: AdminTicketUpdate[];
  /** False when the ticket carries no email — the notify toggle is then disabled. */
  hasEmail: boolean;
  /** False once the ticket is closed — the composer is then hidden. */
  canPost: boolean;
  onPosted: () => void;
}

/**
 * The ticket's full timeline plus the staff composer. Shared by all four review
 * drawers — the log, the internal-note treatment and the composer exist once
 * rather than four times.
 *
 * Internal notes are labelled in words, not only by colour: a staff member must
 * never mistake one for something the resident has already seen.
 */
export function TicketTimelinePanel({
  kind,
  ticketId,
  updates,
  hasEmail,
  canPost,
  onPosted,
}: TicketTimelinePanelProps) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<TicketUpdateValues["visibility"]>("public");
  const [notify, setNotify] = useState(true);
  const [setStatus, setSetStatus] = useState<TicketUpdateValues["setStatus"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Asking for information the resident cannot see is incoherent — lock the
  // radio. postTicketUpdate re-checks this server-side rather than trusting it.
  const visibilityLocked = setStatus === "awaiting-info";
  const effectiveVisibility = visibilityLocked ? "public" : visibility;
  const notifyDisabled = !hasEmail || effectiveVisibility === "internal";

  const submit = () => {
    if (!body.trim()) {
      setError("Write the update.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await postTicketUpdate(kind, ticketId, {
          body: body.trim(),
          visibility: effectiveVisibility,
          notify: notifyDisabled ? false : notify,
          setStatus,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        setBody("");
        setSetStatus(null);
        onPosted();
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  };

  return (
    <section className="space-y-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink-500">
        Timeline
      </h3>

      <ol className="space-y-3">
        {updates.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              "rounded-lg border p-3 text-sm",
              entry.visibility === "internal"
                ? "border-ink-200 bg-ink-50"
                : entry.authorKind === "resident"
                  ? "border-brand-200 bg-brand-50"
                  : "border-ink-100 bg-white",
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span className="font-semibold text-ink-700">
                {entry.authorKind === "resident"
                  ? "Resident"
                  : (entry.authorName ?? "Barangay staff")}
              </span>
              <span className="tabular-nums">{entry.createdAt}</span>
              {entry.visibility === "internal" ? (
                <span className="inline-flex items-center gap-1 font-semibold text-ink-600">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Internal — not visible to the resident
                </span>
              ) : null}
              {entry.notified ? <span>Resident notified</span> : null}
            </div>
            {entry.body ? <p className="mt-1 text-ink-900">{entry.body}</p> : null}
            {entry.attachments.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {entry.attachments.map((file) => (
                  <li key={file.path}>
                    {file.url ? (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 underline"
                      >
                        <Paperclip className="h-3 w-3" aria-hidden="true" />
                        {file.name}
                      </a>
                    ) : (
                      <span className="text-xs text-ink-500">{file.name} (unavailable)</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
        {updates.length === 0 ? <li className="text-sm text-ink-500">No updates yet.</li> : null}
      </ol>

      {canPost ? (
        <div className="space-y-3 rounded-lg border border-ink-200 p-3">
          <Field label="Post an update" htmlFor="ticket-update-body">
            <Textarea
              id="ticket-update-body"
              rows={3}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What should be recorded on this ticket?"
            />
          </Field>

          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">Visibility</legend>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="ticket-update-visibility"
                checked={effectiveVisibility === "public"}
                disabled={visibilityLocked}
                onChange={() => setVisibility("public")}
              />
              Resident-visible
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="ticket-update-visibility"
                checked={effectiveVisibility === "internal"}
                disabled={visibilityLocked}
                onChange={() => setVisibility("internal")}
              />
              Internal note
            </label>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!notifyDisabled && notify}
              disabled={notifyDisabled}
              onChange={(event) => setNotify(event.target.checked)}
            />
            Email the resident
            {!hasEmail ? (
              <span className="text-xs text-ink-500">(no email on this ticket)</span>
            ) : null}
          </label>

          <label className="flex flex-wrap items-center gap-2 text-sm">
            Also set status to
            <select
              className="rounded-md border border-ink-200 px-2 py-1"
              value={setStatus ?? ""}
              onChange={(event) =>
                setSetStatus((event.target.value || null) as TicketUpdateValues["setStatus"])
              }
            >
              <option value="">No change</option>
              <option value="under-review">Under Review</option>
              <option value="awaiting-info">Awaiting Information</option>
            </select>
          </label>

          {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}

          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending ? "Posting…" : "Post update"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
```

Check `src/components/ui/form.tsx` for `Field`'s actual prop names before writing this (it may use `htmlFor` or `id`); match the existing signature rather than changing it.

- [ ] **Step 2: Load the timeline in each manager page**

Each of the four manager pages (`src/app/admin/{applications,appointments,complaints,assistance}/page.tsx`) is a Server Component that already loads its rows. Timelines are per-ticket and the drawer opens one at a time, so **do not** load all timelines up front. Instead add a small Server Action wrapper in `src/features/admin/actions/ticket-updates.ts`:

```ts
/** Fetch one ticket's timeline for the drawer. Same permission gate as posting. */
export async function getTicketUpdatesAction(
  kind: TicketKind,
  ticketNo: string,
): Promise<AdminTicketUpdate[]> {
  const actor = await checkPermission(KINDS[kind].permission);
  if (!actor) return [];
  return listTicketUpdates(ticketNo);
}
```

adding `import { listTicketUpdates } from "../queries/ticket-updates";` and `AdminTicketUpdate` to the type imports.

- [ ] **Step 3: Mount the panel in each drawer**

In each of the four review drawers, add to the props interface:

```ts
  updates: AdminTicketUpdate[];
  onPosted: () => void;
```

and render, immediately above the existing decision buttons block:

```tsx
        <TicketTimelinePanel
          kind="complaint"
          ticketId={record.id}
          updates={updates}
          hasEmail={Boolean(record.email)}
          canPost={record.status !== "resolved" && record.status !== "dismissed"}
          onPosted={onPosted}
        />
```

with `kind` and the `canPost` terminal statuses substituted per drawer:

| Drawer | `kind` | terminal statuses |
|---|---|---|
| `application-review-drawer.tsx` | `"application"` | `"released"`, `"rejected"` |
| `appointment-review-drawer.tsx` | `"appointment"` | `"completed"`, `"declined"` |
| `complaint-review-drawer.tsx` | `"complaint"` | `"resolved"`, `"dismissed"` |
| `assistance-review-drawer.tsx` | `"assistance"` | `"granted"`, `"declined"` |

- [ ] **Step 4: Wire each manager to fetch and refresh the timeline**

In each manager, alongside the existing `reviewingId` state:

```tsx
  const [updates, setUpdates] = useState<AdminTicketUpdate[]>([]);

  const loadUpdates = (ticketNo: string) => {
    startTransition(async () => {
      try {
        setUpdates(await getTicketUpdatesAction("complaint", ticketNo));
      } catch {
        showError("Could not load the timeline.");
      }
    });
  };
```

Call `loadUpdates(record.ticketNo)` wherever the manager currently sets `reviewingId` to open the drawer, clear it (`setUpdates([])`) where it closes, and pass `onPosted={() => loadUpdates(record.ticketNo)}` to the drawer. Substitute the right `kind` string and the manager's own existing error mechanism (`showError` toast or a local `setFormError`) per file — match what each already uses rather than standardising.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev` (check whether it is already running first), then follow `.claude/skills/verify/SKILL.md`.

1. Open `/admin/complaints`, open a received report.
2. Post a **resident-visible** update with "Email the resident" off. Confirm it appears in the timeline with no "Internal" label.
3. Post an **internal note**. Confirm the lock icon and the literal text "Internal — not visible to the resident".
4. Select "Awaiting Information" in the status select. Confirm both visibility radios become disabled and the selection snaps to Resident-visible.
5. Post it. Confirm the report's `StatusChip` reads "Awaiting Information".

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/ src/features/admin/actions/ticket-updates.ts
git commit -m "feat: add the admin ticket timeline panel to all four review drawers"
```

---

## Task 7: Manager filters, reply pill, and the notification badge

**Files:**
- Modify: `src/lib/notifications.ts`, `src/features/admin/queries/notifications.ts`
- Modify: the four managers and the four list queries

**Interfaces:**
- Consumes: the `repliedAt` row fields (Task 1).
- Produces: `NotificationQueueDef.replyColumn?: string`; an "Awaiting Information" filter value and a "New reply" pill in each manager.

- [ ] **Step 1: Add `replyColumn` to the registry**

In `src/lib/notifications.ts`, add to `NotificationQueueDef`:

```ts
  /**
   * A timestamp column that also counts as unhandled when non-null. Set on the
   * four ticket queues only: a resident reply flips the ticket to
   * `under-review`, which is correctly NOT "untouched work", so without this
   * the badge would never fire for a reply.
   */
  replyColumn?: string;
```

and add `replyColumn: "replied_at",` to the `applications`, `complaints`, `appointments` and `assistance` entries. `inquiries` and `feedback` leave it undefined.

- [ ] **Step 2: Use it in the count query**

In `src/features/admin/queries/notifications.ts`, replace `countQueue`:

```ts
async function countQueue(admin: SupabaseAdmin, key: NotificationQueueKey): Promise<number> {
  const def = NOTIFICATION_QUEUES[key];
  // PostgREST `or` takes one comma-separated filter string. Both halves are
  // literals from this module's own registry — never user input.
  const filter = def.replyColumn
    ? `status.eq.${def.newStatus},${def.replyColumn}.not.is.null`
    : null;
  const query = admin.from(def.table).select("id", { count: "exact", head: true });
  const { count, error } = filter
    ? await query.or(filter)
    : await query.eq("status", def.newStatus);
  if (error) {
    console.error(`getNotificationSnapshot count failed (${key}):`, error.message);
    return 0;
  }
  return count ?? 0;
}
```

Leave the four `recent*` functions on `.eq("status", def.newStatus)` — the bell's dropdown lists *arrivals*, and a reply is not an arrival.

- [ ] **Step 3: Update the existing notifications unit test**

`tests/unit/notifications.test.ts` checks that `NOTIFICATION_QUEUES` and `search-modules.ts` agree on the five shared keys. Add a case:

```ts
  it("sets replyColumn on exactly the four ticket queues", () => {
    expect(NOTIFICATION_QUEUES.applications.replyColumn).toBe("replied_at");
    expect(NOTIFICATION_QUEUES.appointments.replyColumn).toBe("replied_at");
    expect(NOTIFICATION_QUEUES.complaints.replyColumn).toBe("replied_at");
    expect(NOTIFICATION_QUEUES.assistance.replyColumn).toBe("replied_at");
    expect(NOTIFICATION_QUEUES.inquiries.replyColumn).toBeUndefined();
    expect(NOTIFICATION_QUEUES.feedback.replyColumn).toBeUndefined();
  });
```

- [ ] **Step 4: Add `repliedAt` to the row types and select it in the four list queries**

Do these together — `repliedAt` is a required field, so the type and the query that fills it must land in the same commit or `npm run typecheck` fails in between.

In `src/types/index.ts`, add to `ApplicationRow`, `AppointmentRow`, `ComplaintRow` and `AssistanceRow`, next to `source`:

```ts
  /** Manila calendar date, or null. Non-null means a resident reply is unread. */
  repliedAt: string | null;
```

Then in each list query (`src/features/admin/queries/{applications,appointments,complaints,assistance}.ts`), add `replied_at` to the `.select(...)` string and map it into the row:

```ts
    repliedAt: row.replied_at ? toManilaDate(row.replied_at) : null,
```

- [ ] **Step 5: Add the filter value and the pill**

In each manager, add `"awaiting-info"` to the status filter's options with the label `"Awaiting Information"` (find the existing options array — e.g. `complaints-manager.tsx` around the `id: "complaint-status-filter"` block — and match its shape).

In the table row, next to the `StatusChip`:

```tsx
              {record.repliedAt ? (
                <span className="ml-2 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                  New reply
                </span>
              ) : null}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: PASS all three.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notifications.ts src/features/admin/queries/ src/features/admin/components/ tests/unit/notifications.test.ts
git commit -m "feat: badge resident replies and filter tickets by awaiting-info"
```

---

## Task 8: Public timeline rendering

**Files:**
- Modify: `src/features/track/actions.ts`, `src/features/track/components/ticket-timeline.tsx`
- Test: `tests/unit/ticket-timeline.test.ts`

**Interfaces:**
- Consumes: `TicketUpdateEntry`, `TicketLookupResult.timeline`/`.repliable` (Task 1); `statusEntryCopy`, `canReply` (Task 2).
- Produces: `buildSteps(ticket): Step[]` rewritten over the log; `loadTimeline(ticketNo)`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ticket-timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TicketLookupResult, TicketUpdateEntry } from "@/types";
import { buildSteps } from "@/features/track/components/ticket-timeline";

function entry(over: Partial<TicketUpdateEntry> = {}): TicketUpdateEntry {
  return {
    id: crypto.randomUUID(),
    entryType: "status",
    status: "pending",
    body: "",
    authorKind: "system",
    authorName: null,
    attachmentCount: 0,
    createdAt: "2026-08-01",
    ...over,
  };
}

function ticket(over: Partial<TicketLookupResult> = {}): TicketLookupResult {
  return {
    kind: "application",
    ticketNo: "APP-2026-00001",
    type: "Certificate Application",
    serviceTitle: "Barangay Clearance",
    requirements: [],
    applicantName: "Maria Santos",
    status: "pending",
    submittedAt: "2026-08-01",
    reviewedAt: null,
    closedAt: null,
    remarks: null,
    scheduleNote: null,
    timeline: [entry()],
    repliable: false,
    ...over,
  };
}

describe("buildSteps", () => {
  it("renders one step per log entry, oldest first", () => {
    const steps = buildSteps(
      ticket({
        status: "approved",
        timeline: [
          entry({ status: "pending", createdAt: "2026-08-01" }),
          entry({ status: "approved", createdAt: "2026-08-03" }),
        ],
      }),
    );
    expect(steps[0].date).toBe("2026-08-01");
    expect(steps[1].title).toBe("Approved");
  });

  it("appends exactly one greyed 'what's next' step for a non-terminal ticket", () => {
    const steps = buildSteps(ticket({ status: "approved", timeline: [entry({ status: "approved" })] }));
    const todo = steps.filter((step) => step.state === "todo");
    expect(todo).toHaveLength(1);
    expect(todo[0].title).toBe("Released");
  });

  it("appends no trailing step once the ticket is terminal", () => {
    const steps = buildSteps(ticket({ status: "released", timeline: [entry({ status: "released" })] }));
    expect(steps.every((step) => step.state !== "todo")).toBe(true);
  });

  it("marks a negative outcome as failed", () => {
    const steps = buildSteps(
      ticket({ status: "rejected", timeline: [entry({ status: "rejected", body: "Missing valid ID." })] }),
    );
    expect(steps.at(-1)?.state).toBe("failed");
    expect(steps.at(-1)?.detail).toBe("Missing valid ID.");
  });

  it("uses the staff body when present and the default copy when blank", () => {
    const withBody = buildSteps(ticket({ timeline: [entry({ status: "pending", body: "Queued." })] }));
    expect(withBody[0].detail).toBe("Queued.");
    const withoutBody = buildSteps(ticket({ timeline: [entry({ status: "pending", body: "" })] }));
    expect(withoutBody[0].detail).toBe("Your request reached the barangay office.");
  });

  it("labels a staff note and a resident reply distinctly from a status entry", () => {
    const steps = buildSteps(
      ticket({
        timeline: [
          entry({ entryType: "staff-note", status: null, body: "Printing today." }),
          entry({ entryType: "resident-reply", status: null, authorKind: "resident", body: "Sent it." }),
        ],
      }),
    );
    expect(steps[0].title).toBe("Update from the barangay");
    expect(steps[1].title).toBe("Your reply");
  });

  it("shows an attachment count on a reply that carried files", () => {
    const steps = buildSteps(
      ticket({
        timeline: [
          entry({ entryType: "resident-reply", status: null, authorKind: "resident", body: "Sent.", attachmentCount: 2 }),
        ],
      }),
    );
    expect(steps[0].detail).toContain("2");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- ticket-timeline`
Expected: FAIL — `buildSteps` is not exported.

- [ ] **Step 3: Rewrite `buildSteps` over the log**

In `src/features/track/components/ticket-timeline.tsx`, delete the `StageCopy` interface, the `COPY` map, `INITIAL_STATUSES` and `FINAL_STATUSES`, and replace `buildSteps` with:

```tsx
import type { TicketKind, TicketLookupResult, TicketStatus, TicketUpdateEntry } from "@/types";
import { isTerminalStatus, statusEntryCopy } from "@/lib/ticket-updates";

const NEGATIVE_STATUSES: TicketStatus[] = ["rejected", "declined", "dismissed"];

/** The step still ahead of a non-terminal ticket. Null once nothing is ahead. */
const NEXT_STEP: Record<TicketKind, Partial<Record<TicketStatus, { title: string; detail: string }>>> = {
  application: {
    pending: { title: "Review", detail: "Barangay staff will review your request." },
    "under-review": { title: "Decision", detail: "Barangay staff are reviewing your request." },
    "awaiting-info": { title: "Waiting for you", detail: "Send what the barangay asked for to continue." },
    approved: { title: "Released", detail: "Bring a valid ID to the barangay hall to claim your document." },
  },
  appointment: {
    pending: { title: "Confirmation", detail: "Barangay staff are checking the schedule you asked for." },
    "under-review": { title: "Confirmation", detail: "Barangay staff are checking the schedule you asked for." },
    "awaiting-info": { title: "Waiting for you", detail: "Send what the barangay asked for to continue." },
    confirmed: { title: "Completed", detail: "Come to the barangay hall at your scheduled time." },
  },
  complaint: {
    received: { title: "Review", detail: "Your report is waiting for review." },
    "under-review": { title: "Resolution", detail: "Barangay staff will contact you about mediation." },
    "awaiting-info": { title: "Waiting for you", detail: "Send what the barangay asked for to continue." },
  },
  assistance: {
    pending: { title: "Review", detail: "Your request is waiting for review." },
    "under-review": { title: "Decision", detail: "The Barangay Social Welfare Desk will contact you with a decision." },
    "awaiting-info": { title: "Waiting for you", detail: "Send what the barangay asked for to continue." },
  },
};

function entryStep(kind: TicketKind, item: TicketUpdateEntry): Step {
  if (item.entryType === "resident-reply") {
    const files =
      item.attachmentCount === 0
        ? ""
        : ` (${item.attachmentCount} ${item.attachmentCount === 1 ? "file" : "files"} attached)`;
    return {
      title: "Your reply",
      detail: `${item.body}${files}`,
      date: item.createdAt,
      state: "done",
    };
  }

  if (item.entryType !== "status") {
    return {
      title: "Update from the barangay",
      detail: item.body,
      date: item.createdAt,
      state: "done",
    };
  }

  const copy = statusEntryCopy(kind, item.status ?? "pending");
  const failed = item.status !== null && NEGATIVE_STATUSES.includes(item.status);
  return {
    title: copy.title,
    detail: item.body || copy.detail,
    date: item.createdAt,
    state: failed ? "failed" : "done",
  };
}

/**
 * The timeline: every resident-visible log entry in order, plus at most ONE
 * greyed step for what is still ahead.
 *
 * A pure log would lose the resident's sense of what happens next; the old
 * fixed three-step diagram lost everything that happened in between. One
 * trailing derived step is the smallest thing that keeps both.
 *
 * Exported for tests/unit/ticket-timeline.test.ts — it is the only pure logic
 * on the public tracking page.
 */
export function buildSteps(ticket: TicketLookupResult): Step[] {
  const steps = ticket.timeline.map((item) => entryStep(ticket.kind, item));

  if (!isTerminalStatus(ticket.kind, ticket.status)) {
    const next = NEXT_STEP[ticket.kind][ticket.status];
    if (next) steps.push({ ...next, date: null, state: "todo" });
  }

  return steps;
}
```

Update the `key` on the rendered `<motion.li>` from `step.title` to `` `${step.title}-${index}` `` — two staff updates now legitimately share a title, and duplicate keys would drop one from the DOM.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- ticket-timeline`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the `TicketLookupResult` fields and load the timeline in `lookupTicket`**

Do these together — both fields are required, so the type and the code that fills them must land in the same commit or `npm run typecheck` fails in between. (Task 1 deliberately left `TicketLookupResult` alone for this reason. Do **not** make these optional: `timeline?:` would force a defensive `?? []` on every consumer, and `repliable?:` makes `boolean | undefined` leak into the reply-form gate.)

In `src/types/index.ts`, add to `TicketLookupResult`, after `scheduleNote`:

```ts
  /** Resident-visible log entries, oldest first. Internal notes are never included. */
  timeline: TicketUpdateEntry[];
  /** True iff status is `awaiting-info` — drives whether the reply composer renders. */
  repliable: boolean;
```

Then in `src/features/track/actions.ts`, add:

```ts
/**
 * Resident-visible log entries for a ticket that has already passed the surname
 * gate. The `.eq("visibility","public")` filter is the ENTIRE guarantee that a
 * complaint's internal staff coordination never reaches the reporter — it lives
 * here, in the query, not in the component that renders the result.
 */
async function loadTimeline(admin: AdminClient, ticketNo: string): Promise<TicketUpdateEntry[]> {
  const { data, error } = await admin
    .from("ticket_updates")
    .select("id, entry_type, status, body, author_kind, author_name, attachments, created_at")
    .eq("ticket_no", ticketNo)
    .eq("visibility", "public")
    .order("created_at", { ascending: true });
  if (error || !data) {
    if (error) console.error("loadTimeline failed:", error.message);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    entryType: row.entry_type as TicketUpdateEntry["entryType"],
    status: (row.status as TicketStatus | null) ?? null,
    body: row.body,
    authorKind: row.author_kind as TicketUpdateEntry["authorKind"],
    authorName: row.author_name,
    attachmentCount: Array.isArray(row.attachments) ? row.attachments.length : 0,
    createdAt: toManilaDate(row.created_at),
  }));
}
```

and in `lookupTicket`, replace the single `loadExtras` call with a parallel fetch — neither depends on the other:

```ts
  const [extras, timeline] = await Promise.all([
    loadExtras(admin, kind, ticket),
    loadTimeline(admin, ticket),
  ]);
  return {
    error: null,
    ticket: { ...base, ...extras, timeline, repliable: canReply(base.status) },
  };
```

adding `canReply` to the `@/lib/ticket-updates` import and `TicketUpdateEntry` to the type imports.

- [ ] **Step 6: Verify in the browser**

Look up a ticket on `/track` that has both a public update and an internal note (created in Task 6's verification). Confirm the public update appears and **the internal note's text is absent from the page** — check with the browser's find-in-page, not by eye.

- [ ] **Step 7: Commit**

```bash
git add src/features/track/ tests/unit/ticket-timeline.test.ts
git commit -m "feat: render the /track timeline from the ticket_updates log"
```

---

## Task 9: The resident reply path

**Files:**
- Create: `src/features/track/components/ticket-reply-form.tsx`
- Modify: `src/features/track/actions.ts`, `src/features/track/components/track-lookup.tsx`, `src/features/track/index.ts`

**Interfaces:**
- Consumes: `uploadTicketAttachment` / `discardTicketAttachment` (Task 5); `canReply`, `REPLY_RETURN_STATUS`, `recordTicketUpdate` (Task 2); `TicketReplyStaffNotifyEmail` (Task 4).
- Produces: `submitTicketReply(form: FormData): Promise<{ error: string | null }>`

- [ ] **Step 1: Write the action**

In `src/features/track/actions.ts`, add. Note the ordering — Turnstile first, so a failed challenge never spends rate-limit budget:

```ts
/** Tighter than the lookup budget: this endpoint accepts files from nobody in particular. */
const REPLY_LIMIT = 5;
const REPLY_WINDOW_MS = 60 * 60 * 1000;

/** Per-kind table, permission and admin deep link for the staff notification. */
const REPLY_KINDS: Record<
  TicketKind,
  { table: string; permission: Permission; path: string; label: string }
> = {
  application: { table: "applications", permission: "process-applications", path: "/admin/applications", label: "certificate application" },
  appointment: { table: "appointments", permission: "process-appointments", path: "/admin/appointments", label: "appointment request" },
  complaint: { table: "complaints", permission: "handle-complaints", path: "/admin/complaints", label: "incident report" },
  assistance: { table: "assistance_requests", permission: "handle-assistance", path: "/admin/assistance", label: "assistance request" },
};

const replySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write your reply.")
    .max(2000, "Please keep your reply under 2000 characters."),
});

/**
 * A resident's answer to an information request.
 *
 * `FormData` rather than a values object because Files have to travel. No auth:
 * the ticket number + surname pair IS the gate, and it is re-checked here —
 * a Server Action is a public HTTP endpoint, and having been on the results
 * page proves nothing about the next POST.
 *
 * Every rejection past validation returns the same NOT_FOUND string the lookup
 * uses, so this endpoint cannot confirm that a ticket exists or leak its status.
 */
export async function submitTicketReply(form: FormData): Promise<{ error: string | null }> {
  const ip = await requestIp();
  const token = form.get("turnstileToken");
  if (!(await verifyTurnstileToken(typeof token === "string" ? token : null, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE };
  }

  const ticketNo = String(form.get("ticketNo") ?? "").trim().toUpperCase();
  const surname = String(form.get("lastName") ?? "").trim();

  if (!(await checkRateLimit(`reply:ip:${ip}`, REPLY_LIMIT, REPLY_WINDOW_MS))) {
    return { error: "Too many replies. Please wait a few minutes and try again." };
  }
  if (!(await checkRateLimit(`reply:ticket:${ticketNo}`, REPLY_LIMIT, REPLY_WINDOW_MS))) {
    return { error: "Too many replies. Please wait a few minutes and try again." };
  }

  const parsed = replySchema.safeParse({ body: form.get("body") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid reply." };
  }

  const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length > MAX_REPLY_FILES) {
    return { error: `You can attach up to ${MAX_REPLY_FILES} files.` };
  }

  const admin = createSupabaseAdminClient();
  const { data: view, error: viewError } = await admin
    .from("tickets_view")
    .select("ticket_no, kind, last_name, status")
    .eq("ticket_no", ticketNo)
    .maybeSingle();
  if (viewError) {
    console.error("submitTicketReply lookup failed:", viewError.message);
    return { error: "Something went wrong. Please try again." };
  }
  // One message for "no such ticket", "wrong name" and "not repliable" alike.
  if (!view || !sameSurname(view.last_name, surname) || !canReply(view.status as TicketStatus)) {
    return { error: NOT_FOUND };
  }

  const kind = view.kind as TicketKind;
  const def = REPLY_KINDS[kind];

  const uploaded: TicketAttachment[] = [];
  for (const file of files) {
    const result = await uploadTicketAttachment(file, ticketNo);
    if (result.error || !result.src) {
      // Compensating delete: nothing references these yet.
      for (const done of uploaded) {
        await discardTicketAttachment(done.path, "submitTicketReply upload failed");
      }
      return { error: result.error ?? "Upload failed. Try again." };
    }
    uploaded.push({ path: result.src, name: file.name, mime: file.type, sizeBytes: file.size });
  }

  const entryId = await recordTicketUpdate({
    ticketNo,
    kind,
    entryType: "resident-reply",
    body: parsed.data.body,
    visibility: "public",
    authorKind: "resident",
    attachments: uploaded,
  });
  if (!entryId) {
    for (const done of uploaded) {
      await discardTicketAttachment(done.path, "submitTicketReply insert failed");
    }
    return { error: "We could not send your reply. Please try again." };
  }

  // Past this point nothing rolls the reply back: the row is the resident's
  // evidence that they answered, and losing it is worse than a status left at
  // awaiting-info that staff can move by hand.
  const { data: row, error: statusError } = await admin
    .from(def.table)
    .update({ status: REPLY_RETURN_STATUS, replied_at: new Date().toISOString() })
    .eq("ticket_no", ticketNo)
    .eq("status", "awaiting-info")
    .select("id")
    .maybeSingle();
  if (statusError) console.error("submitTicketReply status update failed:", statusError.message);

  const staffEmails = await staffEmailsFor(def.permission);
  if (staffEmails.length > 0 && row) {
    await sendEmail({
      to: staffEmails,
      subject: `Resident reply — ${ticketNo}`,
      template: TicketReplyStaffNotifyEmail({
        ticketNo,
        kindLabel: def.label,
        attachmentCount: uploaded.length,
        adminHref: `${def.path}?review=${row.id}`,
      }),
    });
  }

  return { error: null };
}
```

Add the imports this needs: `z` from `zod`, `Permission`/`TicketAttachment`/`TicketKind` types, `MAX_REPLY_FILES` from `@/lib/storage`, `uploadTicketAttachment`/`discardTicketAttachment` from `@/lib/media`, `canReply`/`REPLY_RETURN_STATUS`/`recordTicketUpdate` from `@/lib/ticket-updates`, `sendEmail` from `@/lib/email`, `staffEmailsFor` from `@/lib/notifications`, `TicketReplyStaffNotifyEmail` from `@/emails/TicketReplyStaffNotifyEmail`.

- [ ] **Step 2: Write the reply form**

Create `src/features/track/components/ticket-reply-form.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
import { MAX_REPLY_FILES } from "@/lib/storage";
import { submitTicketReply } from "../actions";

interface TicketReplyFormProps {
  ticketNo: string;
  lastName: string;
  onSent: () => void;
}

/**
 * The resident's answer to an information request. Rendered only when the
 * ticket is `awaiting-info` — /track is not a general-purpose inbox, and
 * /contact stays the channel for anything else.
 *
 * The file picker is pure: no network call until submit, matching every other
 * uploader in this codebase.
 */
export function TicketReplyForm({ ticketNo, lastName, onSent }: TicketReplyFormProps) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const turnstile = useRef<TurnstileWidgetHandle>(null);
  const tokenRef = useRef<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (files.length > MAX_REPLY_FILES) {
      setError(`You can attach up to ${MAX_REPLY_FILES} files.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("ticketNo", ticketNo);
        form.set("lastName", lastName);
        form.set("body", body);
        form.set("turnstileToken", tokenRef.current ?? "");
        for (const file of files) form.append("files", file);
        const result = await submitTicketReply(form);
        if (result.error) {
          setError(result.error);
          return;
        }
        setBody("");
        setFiles([]);
        onSent();
      } catch {
        // Never let a throw reach error.tsx — that loses what the resident typed.
        setError("Something went wrong. Please try again.");
      } finally {
        // Turnstile tokens are single-use; reset without remounting the form.
        turnstile.current?.reset();
        tokenRef.current = null;
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5"
    >
      <h3 className="font-display text-base font-bold text-ink-900">
        Send the information the barangay asked for
      </h3>
      <div className="mt-4 space-y-4">
        <Field label="Your reply" htmlFor="ticket-reply-body">
          <Textarea
            id="ticket-reply-body"
            rows={4}
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>

        <div>
          <label
            htmlFor="ticket-reply-files"
            className="text-sm font-semibold text-ink-800"
          >
            Attach files (optional)
          </label>
          <input
            id="ticket-reply-files"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="mt-1 block w-full text-sm"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          <p className="mt-1 text-xs text-ink-500">
            Up to {MAX_REPLY_FILES} files, 2 MB each. JPG, PNG, WebP, or PDF.
          </p>
        </div>

        <TurnstileWidget
          ref={turnstile}
          onVerify={(token) => {
            tokenRef.current = token;
          }}
        />

        {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
```

Check `src/components/shared/turnstile-widget.tsx` for the actual `onVerify` prop name and ref shape, and copy the exact usage from an existing consumer such as `src/features/feedback/components/feedback-panel.tsx` rather than inventing it.

- [ ] **Step 3: Mount it in the lookup result**

In `src/features/track/components/track-lookup.tsx`, below the `<TicketTimeline ticket={...} />` render:

```tsx
        {ticket.repliable ? (
          <TicketReplyForm
            ticketNo={ticket.ticketNo}
            lastName={lastName}
            onSent={() => {
              // Re-run the lookup so the timeline shows the reply and the
              // composer disappears — the status is no longer awaiting-info.
              void runLookup();
            }}
          />
        ) : null}
```

Match `lastName` and `runLookup` to whatever the component already calls its surname state and its lookup handler. Export `TicketReplyForm` from `src/features/track/index.ts` in page order.

- [ ] **Step 4: Verify end to end**

With migration `0032` applied and the dev server running:

1. In `/admin/applications`, open a pending application that has an email, post an update with status "Awaiting Information" and "Email the resident" on.
2. On `/track`, look the ticket up with its number + surname. Confirm the request appears in the timeline and the reply form renders.
3. Attach one image, write a reply, submit.
4. Confirm: the reply appears in the timeline with "(1 file attached)", the form disappears, and the chip in `/admin/applications` reads "Under Review" with a "New reply" pill.
5. In the drawer, confirm the attachment link opens the file.
6. Submit a reply to a ticket that is **not** `awaiting-info` by replaying the request in devtools. Confirm the generic not-found message, not a status-specific one.

- [ ] **Step 5: Commit**

```bash
git add src/features/track/
git commit -m "feat: let residents reply to an information request from /track"
```

---

## Task 10: Orphan report, e2e tests, and documentation

**Files:**
- Modify: `scripts/report-orphaned-media.mjs`, `CLAUDE.md`, `docs/BACKEND_HANDOFF.md`
- Create: `tests/e2e/admin/ticket-updates.spec.ts`

- [ ] **Step 1: Add the `ticket-media` case to the orphan report**

In `scripts/report-orphaned-media.mjs`, alongside the existing single-bucket kinds (`site-media`, `avatars-media`, `feedback-media`), add a `ticket-media` case. Its referenced paths come from a **jsonb array**, so it needs its own extraction rather than the plain-column pattern:

```js
// ticket-media: resident reply attachments, stored as a jsonb array of
// {path,name,mime,sizeBytes} on ticket_updates. Needs its own extraction —
// every other kind reads a plain text column.
async function ticketMediaReferences(supabase) {
  const { data, error } = await supabase.from("ticket_updates").select("attachments");
  if (error) throw new Error(`ticket_updates read failed: ${error.message}`);
  const paths = new Set();
  for (const row of data ?? []) {
    for (const file of row.attachments ?? []) {
      if (file?.path) paths.add(file.path);
    }
  }
  return paths;
}
```

and register it in the script's bucket walk the same way the other single-bucket kinds are registered — read the existing structure and match it. The script stays **read-only**: it prints, it never deletes.

- [ ] **Step 2: Write the e2e test**

Create `tests/e2e/admin/ticket-updates.spec.ts`. This is in the `admin` project (it needs a session) but its second half drives the public `/track` page in the same browser context:

```ts
import { expect, test } from "@playwright/test";

const INTERNAL_NOTE = `internal-only-${Date.now()}`;
const PUBLIC_UPDATE = `public-update-${Date.now()}`;

test.describe("ticket timeline updates", () => {
  test("an internal note never reaches the public /track timeline", async ({ page }) => {
    // 1. Encode a walk-in complaint so the test owns its own ticket.
    await page.goto("/admin/complaints");
    await page.getByRole("button", { name: /encode walk-in|new report/i }).click();
    await page.getByLabel(/first name/i).fill("Testa");
    await page.getByLabel(/last name/i).fill("Reyes");
    await page.getByLabel(/purok|address/i).fill("Purok 1, San Fernando");
    await page.getByLabel(/contact number/i).fill("0917 000 0000");
    await page.getByLabel(/where it happened|location/i).fill("Barangay road");
    await page.getByLabel(/incident date/i).fill("2026-08-01");
    await page.getByLabel(/narrative|account/i).fill("A test incident narrative for the e2e suite.");
    await page.getByLabel(/consent/i).check();
    await page.getByRole("button", { name: /save|encode/i }).click();

    // 2. Open it and capture the ticket number.
    const row = page.getByRole("row").filter({ hasText: "Testa Reyes" }).first();
    await expect(row).toBeVisible();
    const ticketNo = (await row.textContent())?.match(/CMP-\d{4}-\d{5}/)?.[0];
    expect(ticketNo).toBeTruthy();
    await row.click();

    // 3. Post a public update, then an internal note.
    await page.getByLabel(/post an update/i).fill(PUBLIC_UPDATE);
    await page.getByRole("radio", { name: /resident-visible/i }).check();
    await page.getByRole("button", { name: /post update/i }).click();
    await expect(page.getByText(PUBLIC_UPDATE)).toBeVisible();

    await page.getByLabel(/post an update/i).fill(INTERNAL_NOTE);
    await page.getByRole("radio", { name: /internal note/i }).check();
    await page.getByRole("button", { name: /post update/i }).click();
    await expect(page.getByText(/internal — not visible to the resident/i)).toBeVisible();

    // 4. Look the same ticket up publicly.
    await page.goto("/track");
    await page.getByLabel(/ticket number/i).fill(ticketNo!);
    await page.getByLabel(/last name/i).fill("Reyes");
    await page.getByRole("button", { name: /track|look up/i }).click();

    // The public update is there...
    await expect(page.getByText(PUBLIC_UPDATE)).toBeVisible();
    // ...and the internal note is not. This is the assertion the whole feature
    // rests on: `visibility` is filtered in the query, not the component.
    await expect(page.getByText(INTERNAL_NOTE)).toHaveCount(0);
  });
});
```

Before writing the final version, open `tests/e2e/admin/inbox-tabs.spec.ts` and `tests/e2e/public/feedback.spec.ts` and match their locator conventions and any `test.skip` guard for missing `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`. Adjust every `getByLabel` above to the walk-in form's real labels rather than assuming these regexes match.

- [ ] **Step 3: Run the tests**

Run: `npm run test:unit`
Expected: PASS, all suites.

Run: `npm run test:e2e -- --project=admin --grep "internal note"`
Expected: PASS.

- [ ] **Step 4: Update `CLAUDE.md`**

This is required by the standing rule at the top of `CLAUDE.md` — same session, not a follow-up.

Add a new Architecture bullet after the Resend bullet covering: the uniform `under-review`/`awaiting-info` shape and that `under-review` is optional; `ticket_updates` keyed on `ticket_no` and why (no FK to a union; already globally unique; `lookupTicket` depends on it); that `visibility` is filtered in the **query layer** and is the only thing keeping internal notes off `/track`; `replied_at` and why the badge needs it; that `postTicketUpdate` never writes the decision columns or `remarks`; the private `ticket-media` bucket and the 3 × 2 MB cap chosen to stay under `bodySizeLimit` rather than raise it; and the migration `0032` deploy-order hazard.

Add to the **Commands** section, alongside the existing two non-idempotent suites:

> `tests/e2e/admin/ticket-updates.spec.ts` spends a `reply:ip:*` budget (`REPLY_LIMIT` = 5 per hour) per run, so a repeated run inside that window can fail on the reply step. A failure there shortly after a previous run is a rate-limit collision, not a regression.

- [ ] **Step 5: Update `docs/BACKEND_HANDOFF.md`**

The §2D notes currently say the ticketing flows have no mid-flow resident email. Annotate them: mid-flow updates and information requests now email the resident through `postTicketUpdate`; the remaining open piece of the original Resend design is Plan 3 (delivery monitoring via `email_log` + the Resend webhook), unchanged by this work.

- [ ] **Step 6: Final verification**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run build`
Expected: PASS all four.

- [ ] **Step 7: Commit**

```bash
git add scripts/report-orphaned-media.mjs tests/e2e/admin/ticket-updates.spec.ts CLAUDE.md docs/BACKEND_HANDOFF.md
git commit -m "test: cover the internal-note privacy boundary; document the timeline feature"
```

---

## Deploy checklist

Run in this order, staging first, and confirm each before the next:

1. Apply `supabase/migrations/0032_ticket_updates.sql` to staging/dev.
2. Verify the backfill: `select count(*) from public.ticket_updates;` should be non-zero and roughly one row per ticket plus one per completed transition.
3. Verify the bucket exists and is private: `select id, public from storage.buckets where id = 'ticket-media';` → `public = false`.
4. Deploy this branch to staging. Walk Task 9 Step 4's six checks.
5. Apply `0032` to production.
6. Deploy to production.
7. Run `node scripts/report-orphaned-media.mjs` once against each environment and confirm it reports the `ticket-media` bucket rather than skipping it.

**Deploying the code before the migration** leaves `/admin/{applications,appointments,complaints,assistance}` selecting a `replied_at` column that does not exist and every update write failing — the same failure mode migration `0031` documented.
