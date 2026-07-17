# Ticketing Flows 2C — Appointments, Complaints & Assistance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the ticketing system by adding the three remaining resident flows — appointments, complaints and assistance requests — each with a public form, a staff queue with walk-in encoding, and `/track` integration behind a shared `tickets_view`.

**Architecture:** Mirrors plan 2B (`docs/superpowers/plans/2026-07-16-applications-flow.md`) exactly, which is merged and proven in production. Three new independent, fully-typed tables reuse the existing `public.next_ticket_number()` generator with the `APT-`/`CMP-`/`AST-` prefixes. All four tables carry RLS-with-no-policies; every read and write goes through the service-role client after an explicit check in code. A new `tickets_view` unions the common fields so `/track` resolves any ticket number through one query, then fetches type-specific extras from the single owning table.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Supabase (Postgres + Auth), Zod v4, Server Actions.

## Global Constraints

- **Design tokens only.** `brand-*` (amber), `ink-*` (neutrals), `danger*`. The brand scale is
  **100–800** — `brand-50` and `brand-900` DO NOT EXIST and Tailwind v4 silently drops utilities
  naming undeclared steps (typecheck and lint are both blind to this). **There is no green/success
  token**; terminal success is `bg-brand-200 text-brand-800`.
- **Identity:** "Barangay San Fernando, San Nicolas, Ilocos Norte". San Nicolas is a
  **municipality** — write "Municipal …", never "City …". Area code is **(077)**. Any
  "Sampaguita" in `src/` is a regression.
- **RSC boundary:** `icon: LucideIcon` is a React *component*. Passing one into a `"use client"`
  component throws at runtime and **TypeScript does not catch it**. Icons cross as name strings
  and are resolved by `src/lib/icon-map.ts`.
- **Zod v4**, not v3. Repo idiom: `z.string().email("…")`, `z.string().trim().min(n, "…")`,
  and `.refine(fn, { error: "…", path: ["field"] })`.
- **Server Components by default.** `"use client"` only for real interactivity.
- **Path alias** `@/*` → `src/*`.
- **Never `git add -A`.** The repo has intentionally-untracked `proposal/`,
  `stitch_tabbed_content_manager/` and a `.zip` at root. Always `git add` explicit paths.
- **No test framework exists and none may be added.** Verification is `npm run typecheck`,
  `npm run lint`, `npm run build`, plus the runtime sweep in Task 16.
- Postgres `now()` is UTC; the barangay is UTC+8 (Asia/Manila). Calendar dates shown to humans
  must be converted with `toManilaDate()` from `src/lib/format.ts`.
- Content lives in typed data files, never hardcoded in components.

---

## Design decisions locked for this plan

Read these before any task. They resolve questions the task text assumes settled.

1. **`tickets_view` MUST be created `with (security_invoker = true)`.** This is the single
   highest-risk line in the plan. A Postgres view defaults to running with its **owner's**
   privileges, and the owner (`postgres`) bypasses RLS. A default view over the four
   RLS-protected ticket tables would therefore expose **every ticket in the barangay to
   anonymous PostgREST reads** — inverting the entire security posture 2B established. With
   `security_invoker = true` the view runs as the querying role, so the underlying
   RLS-with-no-policies denies anon and authenticated alike, and only the service-role client
   (which bypasses RLS) can read it. The migration also explicitly revokes the view from
   `anon` and `authenticated` as defense in depth.

2. **Three-step timelines, uniform across all four kinds.** Every flow is
   `Received → (stage 1 decision) → (stage 2 terminal)`. This maps onto the existing
   `TicketTimeline` shape without inventing a new one:

   | Kind | Stage 1 (`reviewed_at`) | Stage 2 (`closed_at`) | Negative |
   | --- | --- | --- | --- |
   | Application | approved / rejected | released | rejected |
   | Appointment | confirmed / declined | completed | declined |
   | Complaint | under-review / dismissed | resolved / dismissed | dismissed |
   | Assistance | under-review / declined | granted / declined | declined |

3. **Negative outcomes can land at either stage for complaints and assistance.** A complaint may
   be dismissed on receipt (frivolous, out of jurisdiction) or after mediation (parties did not
   settle). Disambiguate by `closedAt`: a negative status with `closedAt === null` was decided at
   stage 1 (the timeline ends there); with `closedAt` set it was decided at stage 2 (stage 1
   renders as completed, stage 3 renders as the failure). Applications and appointments can only
   go negative at stage 1 — their stage-2 actions guard on the positive stage-1 status.

4. **Stage-2 attribution columns are named per domain**, not genericised:
   `applications.released_*`, `appointments.completed_*`, `complaints.closed_*`,
   `assistance_requests.decided_*`. `tickets_view` aliases all four to `closed_at`. The tables
   stay independently readable; only the view normalises.

5. **`under-review` reuses its existing `StatusChip` tone** (`bg-danger-soft text-danger-soft-fg`,
   already mapped for the legislative flow). In this design system soft-danger means "open, needs
   staff attention", which is exactly what an under-review complaint is. Residents never see this
   chip — `/track` renders `TicketTimeline`, not `StatusChip`. Do not change the legislative tone.

6. **Complaints are gated by the `blotter-complaints` service's `is_available` toggle.** The
   complaint table has no service FK (the spec models complaints as standalone), but that toggle
   is the barangay's only "we are not taking these online" switch, and leaving it decorative would
   make the admin UI lie. `/complaints/new` therefore checks it exactly the way
   `/services/apply/[slug]` checks its own service. Appointments and assistance have no service
   row and therefore no toggle.

7. **Assistance categories are their own SuperAdmin-managed table**, retired via `is_active` and
   **never hard-deleted** — `assistance_requests.category_id` references them, and a delete would
   orphan a resident's record. `assistance_categories` is public reference data (the anon-readable
   `select` policy mirrors `services`); the three ticket tables are not.

8. **Client-side pagination is retained deliberately.** The three new managers copy
   `ApplicationsManager`'s in-memory filter + `PAGE_SIZE = 6` shape. 2B's final review flagged
   `listApplications()` as unbounded and said 2C "should not copy the shape". That finding is
   **accepted and deferred to its own plan** on this reasoning: the new queues are low-volume
   (complaints/assistance ≈ 10–40 rows/month vs. applications' ≈ 200), so they are safe unbounded
   for years; and converting four *identical* queues in one focused pass is strictly easier and
   lower-risk than inventing a server-side pattern while simultaneously inventing three flows.
   Deliberate consistency here is what makes that later plan cheap. **Do not flag this as a
   defect; do flag any *new* divergence between the four managers.**

9. **Walk-in encoding exists for all four queues** (spec §3: "one queue, online and office
   together"). Walk-in actions skip availability checks — a flow toggled off online must still be
   encodable at the counter; that is the point of the toggle.

10. **Every negative decision requires remarks** (spec §3), enforced server-side in the action,
    with the client-side check only as fast feedback.

---

## File structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/0006_ticketing_flows.sql` | 3 ticket tables + categories + seed + `tickets_view` |
| `src/features/appointments/actions.ts` | Public `submitAppointment` |
| `src/features/appointments/components/appointment-form.tsx` | Public form (client) |
| `src/features/appointments/index.ts` | Barrel |
| `src/features/complaints/actions.ts` | Public `submitComplaint` |
| `src/features/complaints/components/complaint-form.tsx` | Public form (client) |
| `src/features/complaints/queries.ts` | `getComplaintAvailability` |
| `src/features/complaints/index.ts` | Barrel |
| `src/features/assistance/actions.ts` | Public `submitAssistance` |
| `src/features/assistance/components/assistance-form.tsx` | Public form (client) |
| `src/features/assistance/queries.ts` | `listActiveAssistanceCategories` |
| `src/features/assistance/index.ts` | Barrel |
| `src/app/(public)/appointments/new/page.tsx` | Route |
| `src/app/(public)/complaints/new/page.tsx` | Route |
| `src/app/(public)/assistance/new/page.tsx` | Route |
| `src/features/admin/queries/appointments.ts` | `listAppointments` |
| `src/features/admin/queries/complaints.ts` | `listComplaints` |
| `src/features/admin/queries/assistance.ts` | `listAssistanceRequests`, `listAssistanceCategories` |
| `src/features/admin/actions/appointments.ts` | `reviewAppointment`, `completeAppointment`, `createWalkInAppointment` |
| `src/features/admin/actions/complaints.ts` | `reviewComplaint`, `closeComplaint`, `createWalkInComplaint` |
| `src/features/admin/actions/assistance.ts` | `reviewAssistance`, `decideAssistance`, `createWalkInAssistance` |
| `src/features/admin/actions/assistance-categories.ts` | SuperAdmin category CRUD |
| `src/features/admin/components/appointments-manager.tsx` + `appointment-review-drawer.tsx` + `appointment-form.tsx` | Appointment queue |
| `src/features/admin/components/complaints-manager.tsx` + `complaint-review-drawer.tsx` + `complaint-form.tsx` | Complaint queue |
| `src/features/admin/components/assistance-manager.tsx` + `assistance-review-drawer.tsx` + `assistance-form.tsx` | Assistance queue |
| `src/features/admin/components/assistance-categories-panel.tsx` | SuperAdmin category editor |
| `src/app/admin/(portal)/appointments/page.tsx` | Route |
| `src/app/admin/(portal)/complaints/page.tsx` | Route |
| `src/app/admin/(portal)/assistance/page.tsx` | Route |

**Modified:** `src/types/index.ts`, `src/features/admin/components/status-chip.tsx`,
`src/features/admin/data.ts` (nav), `src/features/admin/index.ts`,
`src/features/track/actions.ts`, `src/features/track/components/ticket-timeline.tsx`,
`src/features/services/components/service-card.tsx`, `src/features/home/data.ts`,
`src/features/officials/components/action-center-banner.tsx`,
`src/app/admin/(portal)/services/page.tsx`, `src/features/admin/components/services-manager.tsx`,
`docs/BACKEND_HANDOFF.md`.

---

## Task 1: Migration — three ticket tables, categories, and `tickets_view`

**Files:**
- Create: `supabase/migrations/0006_ticketing_flows.sql`

**Interfaces:**
- Consumes: `public.next_ticket_number(text)`, `public.set_updated_at()`, `public.services`
  (all from migrations 0001/0004/0005 — already applied to the live project).
- Produces: tables `appointments`, `complaints`, `assistance_requests`,
  `assistance_categories`; view `tickets_view`. Every later task depends on these exact
  column names.

**Context:** Read `supabase/migrations/0005_applications.sql` first — this file mirrors its
structure, comment voice, and RLS posture exactly. This migration is **not applied by any
agent**; Justine applies it by hand (Task 16 is blocked on that).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_ticketing_flows.sql` with exactly this content:

```sql
-- Ticketing flows 2C: appointments, complaints, assistance (spec §3).
--
-- Mirrors 0005_applications.sql: per-year sequential ticket numbers from the
-- shared public.next_ticket_number() (the counter table is generic — APT-, CMP-
-- and AST- need no new plumbing), RLS with no policies, set_updated_at triggers.
--
-- RLS: enabled with NO policies on the three ticket tables, deliberately.
-- Neither anon nor authenticated may touch them. Every read and write goes
-- through the service-role client after an explicit check in code, so the
-- privacy gate lives in one reviewable place rather than in a row policy.
-- assistance_categories is the exception: it is public reference data.

-- ── Assistance categories ───────────────────────────────────────────────────
-- SuperAdmin-editable list backing the assistance form's picker. Rows are
-- retired via is_active and never deleted: assistance_requests reference them,
-- and a hard delete would orphan a resident's record.

create table public.assistance_categories (
  id text primary key,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index assistance_categories_sort_order_idx on public.assistance_categories (sort_order);

alter table public.assistance_categories enable row level security;

create policy "assistance categories readable by anyone"
  on public.assistance_categories for select using (true);

create trigger assistance_categories_updated_at
  before update on public.assistance_categories
  for each row execute function public.set_updated_at();

insert into public.assistance_categories (id, label, sort_order) values
  ('medical', 'Medical Assistance', 1),
  ('financial', 'Financial Assistance', 2),
  ('burial', 'Burial Assistance', 3),
  ('calamity', 'Calamity Assistance', 4),
  ('other', 'Other Assistance', 5);

-- ── Appointments ────────────────────────────────────────────────────────────
-- Spec §1: the resident asks for a preferred date + AM/PM; staff confirm that
-- slot, confirm a different one, or decline. There is no slot calendar, so
-- confirmed_date/confirmed_period are free staff choices, not a booking system.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default public.next_ticket_number('APT'),
  first_name text not null,
  last_name text not null,
  address text not null,
  contact_number text not null,
  email text,
  purpose text not null,
  preferred_date date not null,
  preferred_period text not null check (preferred_period in ('am', 'pm')),
  confirmed_date date,
  confirmed_period text check (confirmed_period in ('am', 'pm')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'declined')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  completed_by_name text,
  completed_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  -- Data Privacy Act consent, persisted (spec §3). Walk-ins consent in person.
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_created_at_idx on public.appointments (created_at desc);
create index appointments_status_idx on public.appointments (status);

alter table public.appointments enable row level security;

create trigger appointments_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ── Complaints ──────────────────────────────────────────────────────────────
-- The barangay's highest-privacy record: narrative and respondent NEVER leave
-- the admin queue. /track shows a complaint's status only (spec §3).
-- respondent is nullable — a resident may report an incident without naming
-- anyone. Dismissal may happen on receipt or after mediation, so closed_at is
-- set only by the stage-2 action; a dismissal at stage 1 leaves it null.

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default public.next_ticket_number('CMP'),
  first_name text not null,
  last_name text not null,
  address text not null,
  contact_number text not null,
  email text,
  respondent text,
  incident_date date not null,
  location text not null,
  narrative text not null,
  status text not null default 'received'
    check (status in ('received', 'under-review', 'resolved', 'dismissed')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  closed_by_name text,
  closed_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index complaints_created_at_idx on public.complaints (created_at desc);
create index complaints_status_idx on public.complaints (status);

alter table public.complaints enable row level security;

create trigger complaints_updated_at
  before update on public.complaints
  for each row execute function public.set_updated_at();

-- ── Assistance requests ─────────────────────────────────────────────────────

create table public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default public.next_ticket_number('AST'),
  first_name text not null,
  last_name text not null,
  address text not null,
  contact_number text not null,
  email text,
  category_id text not null references public.assistance_categories (id),
  details text not null,
  status text not null default 'pending'
    check (status in ('pending', 'under-review', 'granted', 'declined')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistance_requests_created_at_idx on public.assistance_requests (created_at desc);
create index assistance_requests_status_idx on public.assistance_requests (status);

alter table public.assistance_requests enable row level security;

create trigger assistance_requests_updated_at
  before update on public.assistance_requests
  for each row execute function public.set_updated_at();

-- ── tickets_view ────────────────────────────────────────────────────────────
-- Common fields across all four kinds, for /track's lookup + privacy gate and
-- (later) dashboard stats. Type-specific columns are deliberately absent:
-- /track reads `kind` from here, then fetches the extras it needs from the one
-- owning table. A complaint's narrative therefore cannot leak through the view
-- even if a future caller selects *.
--
-- security_invoker = true is LOAD-BEARING. A Postgres view runs with its
-- OWNER's privileges by default, and the owner bypasses RLS — a default view
-- over these tables would serve every ticket in the barangay to anonymous
-- PostgREST reads, inverting the whole posture above. With security_invoker the
-- view runs as the querying role, so the underlying no-policy RLS denies anon
-- and authenticated, and only the service-role client can read it. The revoke
-- below is belt-and-braces on top of that.

create view public.tickets_view with (security_invoker = true) as
  select ticket_no,
         'application'::text as kind,
         first_name,
         last_name,
         status,
         remarks,
         created_at,
         reviewed_at,
         released_at as closed_at
    from public.applications
  union all
  select ticket_no, 'appointment'::text, first_name, last_name, status,
         remarks, created_at, reviewed_at, completed_at
    from public.appointments
  union all
  select ticket_no, 'complaint'::text, first_name, last_name, status,
         remarks, created_at, reviewed_at, closed_at
    from public.complaints
  union all
  select ticket_no, 'assistance'::text, first_name, last_name, status,
         remarks, created_at, reviewed_at, decided_at
    from public.assistance_requests;

revoke all on public.tickets_view from anon, authenticated;
```

- [ ] **Step 2: Verify it parses and nothing else changed**

Run: `npm run typecheck && npm run lint`
Expected: both clean (this task adds no TypeScript).

There is no local Postgres. **Do not attempt to apply this migration** — it is a human step.
Re-read the file once against `0005_applications.sql` and confirm by eye:
- every `create table` has a matching `enable row level security` and `updated_at` trigger;
- no `create policy` exists on `appointments`, `complaints`, or `assistance_requests`;
- `tickets_view` carries `with (security_invoker = true)`;
- the four `union all` branches select the same number of columns in the same order.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_ticketing_flows.sql
git commit -m "feat(db): appointments, complaints, assistance tables + tickets_view"
```

---

## Task 2: Types and status chips

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/features/admin/components/status-chip.tsx`

**Interfaces:**
- Consumes: the column names from Task 1.
- Produces: every type below. Tasks 3–15 import these and must not redefine them.

**Context:** `src/types/index.ts` is the single source of entity interfaces and the de-facto API
contract. Read the "Applications flow (backend plan 2B)" section near the end — the new types sit
directly after it and mirror its shape and comment voice.

- [ ] **Step 1: Widen the status unions**

In `src/types/index.ts`, directly below the existing `ApplicationStatus` line, add:

```ts
/** Spec §3 flow: pending → confirmed (final date/time) → completed, or declined. */
export type AppointmentStatus = "pending" | "confirmed" | "completed" | "declined";
/** Spec §3 flow: received → under review → resolved, or dismissed. */
export type ComplaintStatus = "received" | "under-review" | "resolved" | "dismissed";
/** Spec §3 flow: pending → under review → granted, or declined. */
export type AssistanceStatus = "pending" | "under-review" | "granted" | "declined";
/** Any status a ticket of any kind can hold. */
export type TicketStatus =
  | ApplicationStatus
  | AppointmentStatus
  | ComplaintStatus
  | AssistanceStatus;
/** Which table a ticket number belongs to. Matches `tickets_view.kind`. */
export type TicketKind = "application" | "appointment" | "complaint" | "assistance";
```

Then extend the `AdminStatus` union — it currently ends `| ApplicationStatus;`. Replace that
line with:

```ts
  | ApplicationStatus
  | AppointmentStatus
  | ComplaintStatus
  | AssistanceStatus;
```

- [ ] **Step 2: Add the flow types**

Append to the end of `src/types/index.ts`:

```ts
/* ── Ticketing flows 2C: appointments, complaints, assistance ─────────── */

/** Fields every public ticket form collects (spec §3 "common form fields"). */
export interface PublicTicketValues {
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string;
  /** Data Privacy Act consent — must be true to submit (persisted). */
  consent: boolean;
}

export type AppointmentPeriod = "am" | "pm";

export interface PublicAppointmentValues extends PublicTicketValues {
  purpose: string;
  /** Manila calendar date (YYYY-MM-DD) from a native date input. */
  preferredDate: string;
  preferredPeriod: AppointmentPeriod;
}
export type WalkInAppointmentValues = PublicAppointmentValues;

export interface PublicComplaintValues extends PublicTicketValues {
  /** Optional — a resident may report an incident without naming anyone. */
  respondent: string;
  incidentDate: string;
  location: string;
  narrative: string;
}
export type WalkInComplaintValues = PublicComplaintValues;

export interface PublicAssistanceValues extends PublicTicketValues {
  categoryId: string;
  details: string;
}
export type WalkInAssistanceValues = PublicAssistanceValues;

/** Every public ticket action returns this. Mirrors SubmitApplicationResult. */
export interface SubmitTicketResult {
  error: string | null;
  /** e.g. "CMP-2026-00001" — present only on success. */
  ticketNo: string | null;
}

/** Queue row for the appointments manager: flat and serializable. */
export interface AppointmentRow {
  id: string;
  ticketNo: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string | null;
  purpose: string;
  /** Manila calendar dates (YYYY-MM-DD). */
  preferredDate: string;
  preferredPeriod: AppointmentPeriod;
  confirmedDate: string | null;
  confirmedPeriod: AppointmentPeriod | null;
  status: AppointmentStatus;
  remarks: string | null;
  reviewedByName: string | null;
  completedByName: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
  source: "online" | "walk-in";
}

/** Queue row for the complaints manager. Staff-only: carries the narrative. */
export interface ComplaintRow {
  id: string;
  ticketNo: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string | null;
  respondent: string | null;
  incidentDate: string;
  location: string;
  narrative: string;
  status: ComplaintStatus;
  remarks: string | null;
  reviewedByName: string | null;
  closedByName: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  closedAt: string | null;
  source: "online" | "walk-in";
}

/** Queue row for the assistance manager. */
export interface AssistanceRow {
  id: string;
  ticketNo: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string | null;
  categoryId: string;
  categoryLabel: string;
  details: string;
  status: AssistanceStatus;
  remarks: string | null;
  reviewedByName: string | null;
  decidedByName: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  decidedAt: string | null;
  source: "online" | "walk-in";
}

/** Staff decision bodies. Remarks are required on every negative outcome. */
export interface AppointmentReviewValues {
  status: "confirmed" | "declined";
  /**
   * Required when confirming, "" when declining — staff may confirm a slot other
   * than the one the resident asked for. The action nulls both columns on a
   * decline, so a declined row never carries a phantom schedule.
   */
  confirmedDate: string;
  confirmedPeriod: AppointmentPeriod | "";
  remarks: string;
}
export interface ComplaintReviewValues {
  status: "under-review" | "dismissed";
  remarks: string;
}
export interface ComplaintCloseValues {
  status: "resolved" | "dismissed";
  remarks: string;
}
export interface AssistanceReviewValues {
  status: "under-review" | "declined";
  remarks: string;
}
export interface AssistanceDecisionValues {
  status: "granted" | "declined";
  remarks: string;
}

/** SuperAdmin-managed picker list backing the assistance form. */
export interface AssistanceCategoryRow {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}
export interface AssistanceCategoryValues {
  label: string;
}
```

- [ ] **Step 3: Replace `TicketLookupResult`**

`/track` now resolves any of the four kinds. Replace the whole existing `TicketLookupResult`
interface (and its doc comment) with:

```ts
/**
 * A resident-visible ticket, normalized across all four kinds. Everything here
 * is safe to render publicly — in particular a complaint's narrative and
 * respondent are NEVER loaded into this shape (spec §3: complaints show status
 * only). `closedAt` is the stage-2 timestamp under whatever each table calls it
 * (released_at / completed_at / closed_at / decided_at).
 */
export interface TicketLookupResult {
  kind: TicketKind;
  ticketNo: string;
  /** Human label for the ticket kind, e.g. "Certificate Application". */
  type: string;
  /** The service, category, or flow name shown under the ticket number. */
  serviceTitle: string;
  /** Applications only — "bring these when you claim". Empty for other kinds. */
  requirements: string[];
  applicantName: string;
  status: TicketStatus;
  /** Manila calendar dates (YYYY-MM-DD). */
  submittedAt: string;
  reviewedAt: string | null;
  closedAt: string | null;
  remarks: string | null;
  /** Appointments only: the confirmed schedule once staff set it, e.g. "20 July 2026, morning". */
  scheduleNote: string | null;
}
```

- [ ] **Step 4: Add the new status chips**

In `src/features/admin/components/status-chip.tsx`, add to `LABELS` (keep the existing entries):

```ts
  confirmed: "Confirmed",
  completed: "Completed",
  declined: "Declined",
  received: "Received",
  resolved: "Resolved",
  dismissed: "Dismissed",
  granted: "Granted",
```

And to `TONES`, grouped with the tonally-matching entries already there:

```ts
  // Stage-1 positives sit with `approved`; terminal successes are the deeper
  // amber `released` already uses (there is no green token).
  confirmed: "bg-brand-100 text-brand-800",
  completed: "bg-brand-200 text-brand-800",
  resolved: "bg-brand-200 text-brand-800",
  granted: "bg-brand-200 text-brand-800",
  // Untouched intake, like `pending`.
  received: "bg-ink-100 text-ink-700",
  declined: "bg-danger-soft text-danger-soft-fg",
  dismissed: "bg-danger-soft text-danger-soft-fg",
```

Do **not** add or change `under-review` — it is already mapped and its tone is deliberate
(decision 5).

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both clean. `AdminStatus` is a `Record` key in `status-chip.tsx`, so if any new status
is missing from `LABELS` or `TONES`, typecheck fails here — that is the intended safety net.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/features/admin/components/status-chip.tsx
git commit -m "feat(types): appointment, complaint and assistance ticket shapes"
```

---

## Task 3: Complaints — public form, action, and route

**Files:**
- Modify: `src/lib/format.ts`
- Create: `src/features/complaints/actions.ts`
- Create: `src/features/complaints/queries.ts`
- Create: `src/features/complaints/components/complaint-form.tsx`
- Create: `src/features/complaints/index.ts`
- Create: `src/app/(public)/complaints/new/page.tsx`

**Interfaces:**
- Consumes: `PublicComplaintValues`, `SubmitTicketResult` (Task 2); `complaints` table (Task 1);
  `checkRateLimit`/`requestIp` from `src/lib/rate-limit.ts`; `toManilaDate` from `src/lib/format.ts`.
- Produces: `manilaToday(): string` in `src/lib/format.ts` (Tasks 4, 6 and 9 reuse it);
  `COMPLAINT_SERVICE_ID` and `isComplaintFlowAvailable()` in `src/features/complaints/queries.ts`;
  `submitComplaint(values)` in `src/features/complaints/actions.ts`.

**Context:** This is the resident-facing complaint intake — the flow whose "File Incident Report"
button currently renders disabled with a "file this in person" note. Read
`src/features/services/actions.ts` and `src/features/services/components/apply-form.tsx` first:
this task mirrors both. The action is **unauthenticated and uses the service-role client** — it IS
the security gate, which is why every bound below is exact and non-negotiable.

- [ ] **Step 1: Add the Manila "today" helper**

Append to `src/lib/format.ts`:

```ts
/**
 * Today's calendar date in Manila (YYYY-MM-DD). Postgres and the Node runtime
 * are both UTC; a complaint filed at 7am Manila must not be read as yesterday,
 * and an appointment for "today" must not be rejected as past.
 */
export function manilaToday(): string {
  return toManilaDate(new Date().toISOString());
}
```

- [ ] **Step 2: Write the availability query**

Create `src/features/complaints/queries.ts`:

```ts
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The catalog row representing the complaint flow. Complaints have no service
 * FK (spec §3 models them standalone), but this row's `is_available` toggle is
 * the barangay's only "we are not taking these online" switch, so the form
 * honours it exactly the way /services/apply/[slug] honours its own service.
 */
export const COMPLAINT_SERVICE_ID = "blotter-complaints";

/**
 * Cached per request: the page body and metadata both ask.
 * Fails CLOSED — if the row is missing or the read errors, the form is closed
 * rather than silently accepting reports the barangay did not advertise.
 */
export const isComplaintFlowAvailable = cache(async (): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("is_available")
    .eq("id", COMPLAINT_SERVICE_ID)
    .maybeSingle();
  if (error) {
    console.error("isComplaintFlowAvailable failed:", error.message);
    return false;
  }
  return data?.is_available ?? false;
});
```

- [ ] **Step 3: Write the public action**

Create `src/features/complaints/actions.ts`:

```ts
"use server";

import { z } from "zod";
import type { PublicComplaintValues, SubmitTicketResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { manilaToday } from "@/lib/format";
import { COMPLAINT_SERVICE_ID } from "./queries";

// Upper bounds matter here in a way they don't on the admin forms: this is an
// unauthenticated endpoint writing to unconstrained `text` columns, so every
// free-text field is capped at a length a real resident would never exceed. The
// narrative is the one field allowed to be long — it is the point of the record
// — but it is still capped.
const complaintSchema = z.object({
  firstName: z.string().trim().min(2, "Enter your first name.").max(80, "First name is too long."),
  lastName: z.string().trim().min(2, "Enter your last name.").max(80, "Last name is too long."),
  address: z
    .string()
    .trim()
    .min(4, "Enter your purok or street address.")
    .max(200, "Address is too long."),
  contactNumber: z
    .string()
    .trim()
    .min(7, "Enter a contact number we can reach you on.")
    .max(30, "Contact number is too long.")
    // Digits anywhere, not consecutively: "(077) 600-0000" is the local shape.
    .refine(
      (value) => (value.match(/\d/g) ?? []).length >= 7,
      "Enter a contact number we can reach you on.",
    ),
  // Optional. Whitespace-only means "not given", same as empty.
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([
      z.literal(""),
      z.string().email("Enter a valid email address.").max(254, "Email address is too long."),
    ]),
  ),
  // Optional: a resident may report an incident without naming anyone.
  respondent: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([z.literal(""), z.string().max(120, "That name is too long.")]),
  ),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date the incident happened.")
    .refine((value) => value <= manilaToday(), "The incident date cannot be in the future.")
    .refine((value) => value >= "1900-01-01", "Enter the date the incident happened."),
  location: z
    .string()
    .trim()
    .min(4, "Where did this happen?")
    .max(200, "Please keep the location short."),
  narrative: z
    .string()
    .trim()
    .min(20, "Please describe what happened in a little more detail.")
    .max(4000, "Please keep the account under 4000 characters."),
  consent: z.boolean().refine((value) => value === true, "Please agree to the data privacy notice."),
});

/** Tighter than /apply: a complaint is a heavier record and far rarer per household. */
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A resident's public complaint. No auth — the service-role client is used
 * because `complaints` has no RLS policies at all; this action IS the gate, so
 * everything it touches is validated first and nothing is read back out beyond
 * the new ticket number.
 */
export async function submitComplaint(values: PublicComplaintValues): Promise<SubmitTicketResult> {
  const ip = await requestIp();
  if (!checkRateLimit(`complaint:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
    return {
      error:
        "Too many reports from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
    };
  }

  const parsed = complaintSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
      ticketNo: null,
    };
  }

  const admin = createSupabaseAdminClient();

  // Re-check the toggle server-side: the page render is not a gate, and a stale
  // tab must not file a report after the barangay closed online intake.
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("is_available")
    .eq("id", COMPLAINT_SERVICE_ID)
    .maybeSingle();
  if (serviceError) {
    console.error("submitComplaint service lookup failed:", serviceError.message);
    return { error: "Something went wrong. Please try again.", ticketNo: null };
  }
  if (!service?.is_available) {
    return {
      error: "Online incident reports are temporarily unavailable. Please visit the barangay hall.",
      ticketNo: null,
    };
  }

  const { data, error } = await admin
    .from("complaints")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      respondent: parsed.data.respondent || null,
      incident_date: parsed.data.incidentDate,
      location: parsed.data.location,
      narrative: parsed.data.narrative,
      source: "online",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("submitComplaint failed:", error?.message);
    return { error: "We could not file your report. Please try again.", ticketNo: null };
  }

  return { error: null, ticketNo: data.ticket_no };
}
```

- [ ] **Step 4: Write the public form**

Create `src/features/complaints/components/complaint-form.tsx` as a `"use client"` component.

**Mirror `src/features/services/components/apply-form.tsx` exactly** — read it and copy its
structure, its success-receipt panel, its ref-based double-submit guard (the guard must be set
**before the first `await`**; `disabled={isPending}` only lands after React commits, so two clicks
in one tick would otherwise file two tickets), its copy-to-clipboard button with the cleared timer
and `aria-live="polite"`, and its token usage. These deltas apply:

| Aspect | apply-form.tsx | complaint-form.tsx |
| --- | --- | --- |
| Props | `{ serviceId, serviceTitle, requirements }` | none |
| Action | `submitApplication(serviceId, values)` | `submitComplaint(values)` |
| Values type | `PublicApplicationValues` | `PublicComplaintValues` |
| Fields after Address | `purpose` (Textarea) | `respondent` (Input, optional), `incidentDate` (Input `type="date"`, `max={manilaToday()}`), `location` (Input), `narrative` (Textarea, `rows={6}`) |
| Requirements panel | lists `requirements` | **omit entirely** |
| Submit label | "Submit application" | "Submit report" |
| Receipt heading | "Application filed" | "Report filed" |
| Field id prefix | `apply-` | `complaint-` |

Field labels and placeholders, in order — **match `apply-form.tsx`'s existing order and its
sentence-case labels exactly**; the two public forms sit one click apart and must not differ in
casing or field order: "First name", "Last name" (side-by-side grid), "Purok / street address"
(`placeholder="Purok 1, Barangay San Fernando"`), then a grid of "Contact number" (`type="tel"`,
`placeholder="(077) 600-0000"`) and "Email (optional)". Then the complaint-specific fields: "Person
complained about (optional)" (`placeholder="Leave blank if you would rather not say"`), "Date of
incident", "Where it happened" (`placeholder="e.g. Purok 2 basketball court"`), "What happened"
(`placeholder="Describe the incident in your own words."`).

Note the address sits **between** the name grid and the contact grid — that is `apply-form.tsx`'s
real layout. (An earlier draft of this plan took the order from the *admin* walk-in form, which
differs; the public form is the one to mirror.)

`apply-form.tsx`'s receipt also carries a "What happens next" numbered list. Mirror the block, but
**not** its wording — its steps are about pickup and requirements, which do not exist for a
complaint. Use:

```
1. Barangay staff log and review your report.
2. The Lupong Tagapamayapa may contact you to arrange mediation.
3. Track your ticket number anytime to see its status.
```

Consent checkbox copy:

```
I agree to the barangay recording these details to act on this report (Data Privacy Act of 2012).
```

The receipt panel carries this note under the ticket number, which the application receipt has no
equivalent of:

```tsx
<p className="mt-4 text-sm text-ink-600">
  Keep this number safe. Tracking a report shows its status only — never the
  details you wrote here.
</p>
```

`manilaToday()` is imported from `@/lib/format` for the date input's `max`. Client-side
convenience only; Step 3's schema is the real check.

- [ ] **Step 5: Barrel and route**

Create `src/features/complaints/index.ts`:

```ts
export { ComplaintForm } from "./components/complaint-form";
```

Create `src/app/(public)/complaints/new/page.tsx`, mirroring
`src/app/(public)/services/apply/[slug]/page.tsx` and reusing
`src/features/services/components/apply-unavailable.tsx` for the closed state:

```tsx
import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { ApplyUnavailable } from "@/features/services/components/apply-unavailable";
import { ComplaintForm } from "@/features/complaints";
import { isComplaintFlowAvailable } from "@/features/complaints/queries";

export const metadata: Metadata = {
  title: "File an Incident Report",
  description:
    "Report a neighborhood dispute, peace and order issue, or grievance to Barangay San Fernando for mediation.",
};

export default async function NewComplaintPage() {
  const available = await isComplaintFlowAvailable();

  return (
    <>
      <PageHero
        title="File an Incident Report"
        description="Tell us what happened. The Lupong Tagapamayapa reviews every report and will contact you about mediation."
      />
      {available ? (
        <Section>
          <div className="mx-auto max-w-3xl">
            <ComplaintForm />
          </div>
        </Section>
      ) : (
        <ApplyUnavailable title="Incident reports" />
      )}
    </>
  );
}
```

Open `apply-unavailable.tsx` first and check its props — if it takes anything beyond `title`, pass
what it needs and note the adaptation in your report.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean, and the build output lists `/complaints/new`.

Then, with the dev server up (check `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
first — it is usually already running):

```bash
curl -s http://localhost:3000/complaints/new | grep -c "What happened"
```
Expected: `1` or more. The DB is **not yet migrated**, so do not attempt a submission — the insert
would fail. Rendering is the check here; Task 16 sweeps the real path.

- [ ] **Step 7: Commit**

```bash
git add src/lib/format.ts src/features/complaints src/app/\(public\)/complaints
git commit -m "feat(complaints): public incident report form, action and route"
```

---

## Task 4: Complaints — admin queries and actions

**Files:**
- Create: `src/features/admin/queries/complaints.ts`
- Create: `src/features/admin/actions/complaints.ts`

**Interfaces:**
- Consumes: `ComplaintRow`, `ComplaintReviewValues`, `ComplaintCloseValues`, `WalkInComplaintValues`
  (Task 2); `complaints` table (Task 1); `requirePermission` from `src/lib/auth.ts`;
  `recordActivity` from `src/lib/audit.ts`; `manilaToday` from `src/lib/format.ts`.
- Produces: `listComplaints()`; `reviewComplaint(id, values)`, `closeComplaint(id, values)`,
  `createWalkInComplaint(values)` — all returning `ActionResult` (`{ error: string | null }`).

**Context:** Read `src/features/admin/queries/applications.ts` and
`src/features/admin/actions/applications.ts` first — this task mirrors both. Two non-negotiables
carried from 2B's review: `requirePermission` must be the **literal first statement** of every
action (it `redirect()`s, which throws, so no path continues unauthorized), and every state
transition must be guarded **inside the UPDATE's WHERE** (`.eq("status", …)`), never check-then-act
— two staff clicking at once must not both win.

- [ ] **Step 1: Write the query**

Create `src/features/admin/queries/complaints.ts`:

```ts
import type { ComplaintRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";

/**
 * The full complaints queue, newest first. Uses the service-role client because
 * `complaints` has no RLS policies — callers MUST have checked
 * `requirePermission("handle-complaints")` first (the page does).
 *
 * This is the only place the narrative and respondent are read. They must never
 * reach /track (spec §3: complaints show status only).
 */
export async function listComplaints(): Promise<ComplaintRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("complaints")
    .select(
      "id, ticket_no, first_name, last_name, address, contact_number, email, respondent, incident_date, location, narrative, status, remarks, reviewed_by_name, reviewed_at, closed_by_name, closed_at, source, created_at",
    )
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listComplaints failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    ticketNo: row.ticket_no,
    firstName: row.first_name,
    lastName: row.last_name,
    address: row.address,
    contactNumber: row.contact_number,
    email: row.email,
    respondent: row.respondent,
    incidentDate: row.incident_date,
    location: row.location,
    narrative: row.narrative,
    status: row.status as ComplaintRow["status"],
    remarks: row.remarks,
    reviewedByName: row.reviewed_by_name,
    closedByName: row.closed_by_name,
    submittedAt: toManilaDate(row.created_at),
    reviewedAt: row.reviewed_at ? toManilaDate(row.reviewed_at) : null,
    closedAt: row.closed_at ? toManilaDate(row.closed_at) : null,
    source: row.source as ComplaintRow["source"],
  }));
}
```

`incident_date` is a Postgres `date`, not a `timestamptz` — it arrives as `YYYY-MM-DD` already and
must **not** be passed through `toManilaDate()`, which would shift it.

- [ ] **Step 2: Check the audit entity type**

`recordActivity(actor, action, entity, key, note?)` is called below with `entity: "complaint"`.
Open `src/lib/audit.ts` and read the `entity` parameter's type. If it is a union that lacks
`"complaint"`, widen it to also include `"appointment"` and `"assistance"` now (Tasks 7 and 10 need
those) and say so in your report. If it is `string`, change nothing.

- [ ] **Step 3: Write the actions**

Create `src/features/admin/actions/complaints.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ComplaintCloseValues, ComplaintReviewValues, WalkInComplaintValues } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { manilaToday } from "@/lib/format";

export interface ActionResult {
  error: string | null;
}

// Spec §3: every negative decision must carry a reason the resident can read.
const reviewSchema = z
  .object({
    status: z.enum(["under-review", "dismissed"]),
    remarks: z.string().trim().max(1000, "Please keep the remarks short."),
  })
  .refine((value) => value.status !== "dismissed" || value.remarks.length > 0, {
    error: "Remarks are required when dismissing a report.",
    path: ["remarks"],
  });

const closeSchema = z
  .object({
    status: z.enum(["resolved", "dismissed"]),
    remarks: z.string().trim().max(1000, "Please keep the remarks short."),
  })
  .refine((value) => value.status !== "dismissed" || value.remarks.length > 0, {
    error: "Remarks are required when dismissing a report.",
    path: ["remarks"],
  });

// Same field bounds as the public schema in `src/features/complaints/actions.ts`
// — a walk-in row and an online row must be constrained identically.
const walkInSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "Enter the complainant's first name.")
    .max(80, "First name is too long."),
  lastName: z
    .string()
    .trim()
    .min(2, "Enter the complainant's last name.")
    .max(80, "Last name is too long."),
  address: z
    .string()
    .trim()
    .min(4, "Enter the complainant's purok or address.")
    .max(200, "Address is too long."),
  contactNumber: z
    .string()
    .trim()
    .min(7, "Enter a contact number.")
    .max(30, "Contact number is too long.")
    .refine((value) => (value.match(/\d/g) ?? []).length >= 7, "Enter a contact number."),
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([
      z.literal(""),
      z.string().email("Enter a valid email address.").max(254, "Email address is too long."),
    ]),
  ),
  respondent: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([z.literal(""), z.string().max(120, "That name is too long.")]),
  ),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of the incident.")
    .refine((value) => value <= manilaToday(), "The incident date cannot be in the future.")
    .refine((value) => value >= "1900-01-01", "Enter the date of the incident."),
  location: z
    .string()
    .trim()
    .min(4, "Enter where it happened.")
    .max(200, "Please keep the location short."),
  narrative: z
    .string()
    .trim()
    .min(20, "Enter the incident narrative.")
    .max(4000, "Please keep the account under 4000 characters."),
  consent: z.boolean().refine((value) => value === true, "Confirm the complainant gave consent."),
});

/** Take a received report up for mediation, or dismiss it outright. */
export async function reviewComplaint(
  id: string,
  values: ComplaintReviewValues,
): Promise<ActionResult> {
  const actor = await requirePermission("handle-complaints");
  const parsed = reviewSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid review." };
  }

  const admin = createSupabaseAdminClient();
  // Guard the transition in the WHERE clause: a stale tab must not re-review a
  // decided report, and two staff clicking at once must not both win.
  const { data, error } = await admin
    .from("complaints")
    .update({
      status: parsed.data.status,
      remarks: parsed.data.remarks || null,
      reviewed_by: actor.id,
      reviewed_by_name: actor.fullName,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "received")
    .select("ticket_no")
    .maybeSingle();
  if (error) return { error: "Could not save the review." };
  if (!data) return { error: "That report was already reviewed. Refresh to see its status." };

  await recordActivity(
    actor,
    parsed.data.status === "dismissed" ? "dismissed complaint" : "took up complaint",
    "complaint",
    data.ticket_no,
    parsed.data.remarks || undefined,
  );
  revalidatePath("/admin/complaints");
  return { error: null };
}

/** Close a report that is under review — settled, or dismissed after mediation. */
export async function closeComplaint(
  id: string,
  values: ComplaintCloseValues,
): Promise<ActionResult> {
  const actor = await requirePermission("handle-complaints");
  const parsed = closeSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid decision." };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("complaints")
    .update({
      status: parsed.data.status,
      remarks: parsed.data.remarks || null,
      closed_by: actor.id,
      closed_by_name: actor.fullName,
      closed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "under-review")
    .select("ticket_no")
    .maybeSingle();
  if (error) return { error: "Could not close the report." };
  if (!data) {
    return { error: "Only reports under review can be closed. Refresh to see its status." };
  }

  await recordActivity(
    actor,
    parsed.data.status === "resolved" ? "resolved complaint" : "dismissed complaint",
    "complaint",
    data.ticket_no,
    parsed.data.remarks || undefined,
  );
  revalidatePath("/admin/complaints");
  return { error: null };
}

/** Encode a walk-in complainant into the same queue (spec §3: one queue, online + office). */
export async function createWalkInComplaint(values: WalkInComplaintValues): Promise<ActionResult> {
  const actor = await requirePermission("handle-complaints");
  const parsed = walkInSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  // Availability is NOT checked: online intake toggled off must still be
  // encodable at the counter — that is the point of the toggle.
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("complaints")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      respondent: parsed.data.respondent || null,
      incident_date: parsed.data.incidentDate,
      location: parsed.data.location,
      narrative: parsed.data.narrative,
      source: "walk-in",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("createWalkInComplaint failed:", error?.message);
    return { error: "Could not encode the report." };
  }

  await recordActivity(actor, "encoded walk-in complaint", "complaint", data.ticket_no);
  revalidatePath("/admin/complaints");
  return { error: null };
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

Re-read your own diff and confirm explicitly in the report:
- `requirePermission("handle-complaints")` is the literal first statement of all three actions;
- both transition guards sit inside the UPDATE (`.eq("status", "received")` and
  `.eq("status", "under-review")`), not in a preceding SELECT;
- every column name you wrote exists in `supabase/migrations/0006_ticketing_flows.sql`.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/queries/complaints.ts src/features/admin/actions/complaints.ts
git commit -m "feat(admin): complaints queue queries and staff actions"
```

---

## Task 5: Complaints — admin queue screen

**Files:**
- Create: `src/features/admin/components/complaints-manager.tsx`
- Create: `src/features/admin/components/complaint-review-drawer.tsx`
- Create: `src/features/admin/components/complaint-form.tsx`
- Create: `src/app/admin/(portal)/complaints/page.tsx`
- Modify: `src/features/admin/index.ts`
- Modify: `src/features/admin/data.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 and 4.
- Produces: `ComplaintsManager` (exported from the admin barrel); the `/admin/complaints` route; a
  new `ADMIN_NAV_ITEMS` entry.

**Context:** Read `src/features/admin/components/applications-manager.tsx`,
`application-review-drawer.tsx` and `application-form.tsx` — this task mirrors all three. Keep the
client-side filter + `PAGE_SIZE = 6` shape exactly: divergence from the applications manager is the
defect here, not the shared shape (see decision 8 in the plan header).

- [ ] **Step 1: Write the manager**

Create `complaints-manager.tsx` mirroring `applications-manager.tsx` with these deltas:

| Aspect | applications-manager | complaints-manager |
| --- | --- | --- |
| Props | `{ applications, services }` | `{ complaints }` — no service picker |
| Header title | "Certificate Applications" | "Incident Reports" |
| Header description | — | "Review, mediate and close reports filed by residents." |
| New button | "New Application" | "New Report" |
| Stat cards | Total / Pending Review / Ready for Pickup | Total Reports (`FileText`) · Awaiting Review (`ClipboardList`, counts `status === "received"`, `tone` danger when > 0) · Under Mediation (`Scale`, counts `status === "under-review"`, `tone="secondary"`) |
| Card title | "Application Queue" | "Report Queue" |
| Filter selects | document type + status | **status only** — id `complaint-status-filter`, options All Statuses / Received / Under Review / Resolved / Dismissed (values `all`, `received`, `under-review`, `resolved`, `dismissed`) |
| Table columns | Applicant / Document Type / Date Applied / Status / Actions | Complainant / Where It Happened / Date Filed / Status / Actions |
| Empty (no rows) | "No applications yet…" | "No reports yet. Residents' online reports land here." |
| Empty (filtered) | "No applications match your filters." | "No reports match your filters." |
| Actions | `reviewApplication` / `releaseApplication` / `createWalkInApplication` | `reviewComplaint` / `closeComplaint` / `createWalkInComplaint` |

The search box keeps its placeholder ("Search name or ticket no…") and its name-or-ticket predicate
unchanged. The two decision handlers replace `handleReview`/`handleRelease`:

```tsx
const handleReview = (id: string, values: ComplaintReviewValues) => {
  setFormError(null);
  startTransition(async () => {
    const result = await reviewComplaint(id, values);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    closeReview();
    setToast(
      values.status === "under-review" ? "Report taken up for mediation." : "Report dismissed.",
    );
  });
};

const handleClose = (id: string, values: ComplaintCloseValues) => {
  setFormError(null);
  startTransition(async () => {
    const result = await closeComplaint(id, values);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    closeReview();
    setToast(values.status === "resolved" ? "Report resolved." : "Report dismissed.");
  });
};
```

Walk-in toast: "Walk-in report encoded."

Keep the 2B invariants verbatim: the manager holds **zero local copies of row data** (props only,
plus the actions' `revalidatePath`), and `closeReview()` runs **before** `setToast` so no stale row
can sit in an open drawer. Import `Scale` from `lucide-react` for the new stat icon.

- [ ] **Step 2: Write the review drawer**

Create `complaint-review-drawer.tsx` mirroring `application-review-drawer.tsx`. Props:

```tsx
interface ComplaintReviewDrawerProps {
  record: ComplaintRow;
  onReview: (id: string, values: ComplaintReviewValues) => void;
  onClose: (id: string, values: ComplaintCloseValues) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}
```

`DetailRow` rows, in order: Complainant (`${firstName} ${lastName}`), Contact Number, Email (only
when present), Address, Person Complained About (`record.respondent ?? "Not named"`), Date of
Incident (`formatDate(record.incidentDate)`), Where It Happened (`record.location`), Date Filed
(`formatDate(record.submittedAt)`), Filed
(`record.source === "walk-in" ? "Walk-in (encoded)" : "Online"`).

The narrative is long-form and does not belong in a `DetailRow`. Render it after the `<dl>`:

```tsx
<div>
  <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">What Happened</p>
  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{record.narrative}</p>
</div>
```

Footer, by status — three cases, mirroring the application drawer's structure:
- `received` → Remarks `Textarea` (id `complaint-remarks`, placeholder "Optional when taking it up;
  required when dismissing.") + **Dismiss** (`variant="outline-danger"`, `onReview` with
  `dismissed`) and **Take up for mediation** (`onReview` with `under-review`).
- `under-review` → same Remarks field (placeholder "Optional when resolving; required when
  dismissing.") + **Dismiss** (`variant="outline-danger"`, `onClose` with `dismissed`) and **Mark
  resolved** (`onClose` with `resolved`).
- `resolved` / `dismissed` → the read-only "Review Summary" panel + a **Close** button, exactly as
  the application drawer does for its terminal states. The summary shows `record.remarks ?? "—"`,
  then "Reviewed by {reviewedByName} on {formatDate(reviewedAt)}" and "Closed by {closedByName} on
  {formatDate(closedAt)}" when each is present.

Client-side guard before calling either handler (fast feedback only — Task 4's schema is the real
enforcement):

```tsx
if (status === "dismissed" && !remarks.trim()) {
  setLocalError("Remarks are required when dismissing a report.");
  return;
}
```

- [ ] **Step 3: Write the walk-in form**

Create `complaint-form.tsx` mirroring `application-form.tsx`. Props drop `services`; the values type
is `WalkInComplaintValues`, initialised to:

```tsx
{
  firstName: "",
  lastName: "",
  address: "",
  contactNumber: "",
  email: "",
  respondent: "",
  incidentDate: manilaToday(),
  location: "",
  narrative: "",
  consent: false,
}
```

Fields mirror Task 3 Step 4's public form (same labels, same order, id prefix
`complaint-walkin-`), with the date input carrying `max={manilaToday()}`. Consent copy:

```
The complainant consented to the barangay recording these details for this report (Data Privacy Act of 2012).
```

Submit button label: "Encode report".

- [ ] **Step 4: Route, barrel and nav**

Create `src/app/admin/(portal)/complaints/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { ComplaintsManager } from "@/features/admin";
import { listComplaints } from "@/features/admin/queries/complaints";

export const metadata: Metadata = {
  title: "Incident Reports",
};

export default async function AdminComplaintsPage() {
  await requirePermission("handle-complaints");
  const complaints = await listComplaints();
  return <ComplaintsManager complaints={complaints} />;
}
```

The `requirePermission` call before the query is **the** gate — `listComplaints` has no internal
check by design, exactly as `listApplications` has none.

Add `ComplaintsManager` to `src/features/admin/index.ts` in page order (after
`ApplicationsManager`).

In `src/features/admin/data.ts`, add to `ADMIN_NAV_ITEMS` directly after the Applications entry:

```ts
  { label: "Incident Reports", href: "/admin/complaints", icon: Scale, permission: "handle-complaints" },
```

`Scale` is **already imported** in that file (the legislative entry uses it) — do not duplicate the
import. The `permission` key drives the sidebar filter added in 2B: a user without
`handle-complaints` will not see the link, and `requirePermission` bounces them if they guess the
URL.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean; the build lists `/admin/complaints`.

Confirm in your report that **no Lucide component crosses the client boundary**: `ADMIN_NAV_ITEMS`
carries `icon: LucideIcon`, and `AdminSidebar` is a Server Component that renders `<Icon />` as
children. Never pass `item.icon` into a `"use client"` component — it throws at runtime and
TypeScript will not catch it.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/complaints-manager.tsx src/features/admin/components/complaint-review-drawer.tsx src/features/admin/components/complaint-form.tsx src/features/admin/index.ts src/features/admin/data.ts src/app/admin/\(portal\)/complaints
git commit -m "feat(admin): incident report queue with mediation flow and walk-in encoding"
```

---

## Task 6: Appointments — public form, action, and route

**Files:**
- Modify: `src/lib/format.ts`
- Create: `src/features/appointments/actions.ts`
- Create: `src/features/appointments/components/appointment-form.tsx`
- Create: `src/features/appointments/index.ts`
- Create: `src/app/(public)/appointments/new/page.tsx`

**Interfaces:**
- Consumes: `PublicAppointmentValues`, `AppointmentPeriod`, `SubmitTicketResult` (Task 2);
  `appointments` table (Task 1); `manilaToday` from `src/lib/format.ts` (Task 3).
- Produces: `manilaTodayNextYear()` in `src/lib/format.ts` (Task 7 reuses it);
  `submitAppointment(values)`.

**Context:** Spec §1: the resident asks for a preferred date and AM/PM; staff confirm that slot,
confirm a different one, or decline. **There is no slot calendar** — do not build availability
checking, capacity, or conflict detection. Read `src/features/complaints/actions.ts` and
`src/features/complaints/components/complaint-form.tsx` (Task 3) — this task mirrors both, and the
common field block is identical.

Appointments have no service catalog row and therefore **no availability toggle** — there is
nothing to gate on, so this route has no unavailable state.

- [ ] **Step 1: Write the public action**

Create `src/features/appointments/actions.ts`. The common fields (`firstName`, `lastName`,
`address`, `contactNumber`, `email`, `consent`) are **byte-identical** to the complaint schema in
`src/features/complaints/actions.ts` — copy them exactly, then add:

```ts
  purpose: z
    .string()
    .trim()
    .min(4, "Tell us what the appointment is about.")
    .max(500, "Please keep the purpose short."),
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date for your appointment.")
    .refine((value) => value >= manilaToday(), "Pick a date that has not passed.")
    // A year out is already generous for a barangay hall visit; beyond that is
    // almost certainly a typo or a script.
    .refine((value) => value <= manilaTodayNextYear(), "Please pick a date within the next year."),
  preferredPeriod: z.enum(["am", "pm"], { error: "Pick morning or afternoon." }),
```

This needs a far bound to pair with `manilaToday()`. Add it to `src/lib/format.ts` directly below
`manilaToday` — **not** to this file: `actions.ts` is `"use server"`, and such a module may only
export async functions, so a helper defined here could never be shared with
`src/features/admin/actions/appointments.ts` (Task 7), which needs the identical bound for walk-ins.

```ts
/** One year from today in Manila (YYYY-MM-DD) — the far bound for a requested date. */
export function manilaTodayNextYear(): string {
  const [year, month, day] = manilaToday().split("-");
  return `${Number(year) + 1}-${month}-${day}`;
}
```

Rate limit (appointments are more routine than complaints but less than certificate applications):

```ts
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
```

The action body mirrors `submitComplaint` exactly, with these differences: the rate-limit key is
`appointment:${ip}`; the rate-limit message is "Too many appointment requests from this connection.
Please try again later or visit the barangay hall."; **there is no service lookup at all** (no
toggle exists — delete that whole block rather than adapting it); the insert is

```ts
    .from("appointments")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      purpose: parsed.data.purpose,
      preferred_date: parsed.data.preferredDate,
      preferred_period: parsed.data.preferredPeriod,
      source: "online",
    })
```

and the failure message is "We could not file your request. Please try again." The doc comment
mirrors `submitComplaint`'s, naming `appointments` as the table with no RLS policies.

- [ ] **Step 2: Write the public form**

Create `src/features/appointments/components/appointment-form.tsx`, mirroring
`src/features/complaints/components/complaint-form.tsx` (Task 3) — same structure, same
double-submit ref guard, same receipt panel and copy button. Deltas:

| Aspect | complaint-form | appointment-form |
| --- | --- | --- |
| Action | `submitComplaint` | `submitAppointment` |
| Values type | `PublicComplaintValues` | `PublicAppointmentValues` |
| Fields after Address | respondent / incidentDate / location / narrative | `purpose` (Textarea, `rows={4}`), `preferredDate` (Input `type="date"`, `min={manilaToday()}`), `preferredPeriod` (Select) |
| Submit label | "Submit report" | "Request appointment" |
| Receipt heading | "Report filed" | "Appointment requested" |
| Field id prefix | `complaint-` | `appointment-` |
| Privacy note on receipt | complaint-specific note | **omit** |

Labels: "What is the appointment about?"
(`placeholder="e.g. Consultation with the Punong Barangay"`), "Preferred Date", "Preferred Time".
The period `Select` has exactly two options: `am` → "Morning (8:00 AM – 12:00 NN)", `pm` →
"Afternoon (1:00 PM – 5:00 PM)". Initial values: `preferredDate: manilaToday()`,
`preferredPeriod: "am"`.

Add this line under the receipt's ticket number, replacing the complaint form's privacy note:

```tsx
<p className="mt-4 text-sm text-ink-600">
  Barangay staff will confirm your schedule — the date and time you picked are a
  request, not a booking. Track this number to see the confirmed slot.
</p>
```

That sentence is load-bearing: without it a resident reads a filed request as a confirmed
appointment and turns up to a closed office.

Consent checkbox copy:

```
I agree to the barangay recording these details to arrange this appointment (Data Privacy Act of 2012).
```

- [ ] **Step 3: Barrel and route**

`src/features/appointments/index.ts`:

```ts
export { AppointmentForm } from "./components/appointment-form";
```

Create `src/app/(public)/appointments/new/page.tsx` mirroring the complaint route, minus the
availability branch (there is no toggle — always render the form):

```tsx
import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { AppointmentForm } from "@/features/appointments";

export const metadata: Metadata = {
  title: "Set an Appointment",
  description:
    "Request an appointment with the officials and staff of Barangay San Fernando, San Nicolas, Ilocos Norte.",
};

export default function NewAppointmentPage() {
  return (
    <>
      <PageHero
        title="Set an Appointment"
        description="Tell us when you would like to visit and what you need. Staff will confirm your schedule before you come."
      />
      <Section>
        <div className="mx-auto max-w-3xl">
          <AppointmentForm />
        </div>
      </Section>
    </>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean; the build lists `/appointments/new`.

```bash
curl -s http://localhost:3000/appointments/new | grep -c "Preferred Date"
```
Expected: `1` or more. Do not submit — the DB is not migrated yet.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/features/appointments src/app/\(public\)/appointments
git commit -m "feat(appointments): public appointment request form, action and route"
```

---

## Task 7: Appointments — admin queries and actions

**Files:**
- Create: `src/features/admin/queries/appointments.ts`
- Create: `src/features/admin/actions/appointments.ts`

**Interfaces:**
- Consumes: `AppointmentRow`, `AppointmentReviewValues`, `WalkInAppointmentValues` (Task 2);
  `appointments` table (Task 1).
- Produces: `listAppointments()`; `reviewAppointment(id, values)`, `completeAppointment(id)`,
  `createWalkInAppointment(values)` — all returning `ActionResult`.

**Context:** Read `src/features/admin/queries/complaints.ts` and
`src/features/admin/actions/complaints.ts` (Task 4) — this task mirrors both exactly. The same two
non-negotiables apply: `requirePermission("process-appointments")` is the literal first statement of
every action, and transitions are guarded inside the UPDATE's WHERE.

- [ ] **Step 1: Write the query**

Create `src/features/admin/queries/appointments.ts` mirroring `queries/complaints.ts`. Select:

```
id, ticket_no, first_name, last_name, address, contact_number, email, purpose, preferred_date, preferred_period, confirmed_date, confirmed_period, status, remarks, reviewed_by_name, reviewed_at, completed_by_name, completed_at, source, created_at
```

ordered `created_at` descending, mapped to `AppointmentRow`. `preferred_date`, `confirmed_date` and
`incident`-style `date` columns arrive as `YYYY-MM-DD` already — pass them straight through and do
**not** run them through `toManilaDate()`, which would shift them. Only `created_at`, `reviewed_at`
and `completed_at` are `timestamptz` and need converting. The doc comment names
`requirePermission("process-appointments")` as the caller's obligation.

- [ ] **Step 2: Write the actions**

Create `src/features/admin/actions/appointments.ts`. The review schema carries the plan's one piece
of conditional cross-field validation — read it carefully:

```ts
// Spec §3: every negative decision must carry a reason the resident can read.
// Confirming additionally requires a concrete slot: staff may confirm the
// requested date or propose a different one, but never a blank one.
const reviewSchema = z
  .object({
    status: z.enum(["confirmed", "declined"]),
    confirmedDate: z.union([
      z.literal(""),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the confirmed date."),
    ]),
    confirmedPeriod: z.union([z.literal(""), z.enum(["am", "pm"])]),
    remarks: z.string().trim().max(1000, "Please keep the remarks short."),
  })
  .refine((value) => value.status !== "declined" || value.remarks.length > 0, {
    error: "Remarks are required when declining an appointment.",
    path: ["remarks"],
  })
  .refine((value) => value.status !== "confirmed" || value.confirmedDate !== "", {
    error: "Pick the date you are confirming.",
    path: ["confirmedDate"],
  })
  .refine((value) => value.status !== "confirmed" || value.confirmedPeriod !== "", {
    error: "Pick morning or afternoon.",
    path: ["confirmedPeriod"],
  });
```

`reviewAppointment(id, values)` mirrors `reviewComplaint`, guarding `.eq("status", "pending")`, and
writes:

```ts
    .update({
      status: parsed.data.status,
      // Declining leaves the slot columns null: there is no confirmed schedule.
      confirmed_date: parsed.data.status === "confirmed" ? parsed.data.confirmedDate : null,
      confirmed_period: parsed.data.status === "confirmed" ? parsed.data.confirmedPeriod : null,
      remarks: parsed.data.remarks || null,
      reviewed_by: actor.id,
      reviewed_by_name: actor.fullName,
      reviewed_at: new Date().toISOString(),
    })
```

Failure messages: "Could not save the review." / "That appointment was already reviewed. Refresh to
see its status." Audit actions: `"confirmed appointment"` / `"declined appointment"`, entity
`"appointment"`. Revalidate `/admin/appointments`.

`completeAppointment(id)` mirrors `releaseApplication` exactly — no schema, guard
`.eq("status", "confirmed")`, set `status: "completed"`, `completed_by`, `completed_by_name`,
`completed_at`. Failure messages: "Could not mark it completed." / "Only confirmed appointments can
be completed. Refresh to see its status." Audit action `"completed appointment"`.

`createWalkInAppointment(values)` mirrors `createWalkInComplaint`. Its schema is the walk-in common
block from `actions/complaints.ts` (identical bounds, staff-voice messages) plus `purpose`,
`preferredDate` and `preferredPeriod` copied from Task 6's public schema — **including both date
bounds**; a walk-in row and an online row must be constrained identically. Import `manilaToday` and
`manilaTodayNextYear` from `@/lib/format` for those bounds rather than re-deriving them. It inserts
with `source: "walk-in"`; audit action `"encoded walk-in appointment"`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

Confirm in your report, explicitly: `requirePermission("process-appointments")` is the literal first
statement of all three actions; the guards are `.eq("status", "pending")` and
`.eq("status", "confirmed")` inside their UPDATEs; declining nulls both slot columns; every column
name exists in `0006_ticketing_flows.sql`.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/queries/appointments.ts src/features/admin/actions/appointments.ts
git commit -m "feat(admin): appointments queue queries and staff actions"
```

---

## Task 8: Appointments — admin queue screen

**Files:**
- Create: `src/features/admin/components/appointments-manager.tsx`
- Create: `src/features/admin/components/appointment-review-drawer.tsx`
- Create: `src/features/admin/components/appointment-form.tsx`
- Create: `src/app/admin/(portal)/appointments/page.tsx`
- Modify: `src/features/admin/index.ts`, `src/features/admin/data.ts`

**Context:** Mirror the complaints queue from Task 5 (`complaints-manager.tsx`,
`complaint-review-drawer.tsx`, `complaint-form.tsx`, `src/app/admin/(portal)/complaints/page.tsx`)
— read all four. Keep the client-side filter + `PAGE_SIZE = 6` shape (decision 8).

- [ ] **Step 1: Manager**

Deltas from `complaints-manager.tsx`:

| Aspect | complaints-manager | appointments-manager |
| --- | --- | --- |
| Props | `{ complaints }` | `{ appointments }` |
| Header title / description | "Incident Reports" | "Appointments" / "Confirm, reschedule or decline resident appointment requests." |
| New button | "New Report" | "New Appointment" |
| Stat cards | Total / Awaiting Review / Under Mediation | Total Requests (`CalendarDays`) · Awaiting Confirmation (`ClipboardList`, `status === "pending"`, danger tone when > 0) · Confirmed (`CheckCircle2`, `status === "confirmed"`, `tone="secondary"`) |
| Card title | "Report Queue" | "Appointment Queue" |
| Status filter | id `complaint-status-filter` | id `appointment-status-filter`; All Statuses / Pending / Confirmed / Completed / Declined |
| Table columns | Complainant / Where It Happened / Date Filed / Status / Actions | Resident / Requested Schedule / Date Filed / Status / Actions |
| Empty (no rows) | "No reports yet…" | "No appointment requests yet. Residents' online requests land here." |
| Empty (filtered) | "No reports match your filters." | "No appointments match your filters." |
| Handlers | `handleReview` / `handleClose` | `handleReview` (`reviewAppointment`) / `handleComplete` (`completeAppointment`, mirrors 2B's `handleRelease` — takes only `id`) |
| Toasts | mediation copy | `confirmed` → "Appointment confirmed." · `declined` → "Appointment declined." · complete → "Marked as completed." · walk-in → "Walk-in appointment encoded." |

The "Requested Schedule" cell shows the confirmed slot once one exists, otherwise the requested one,
so staff scanning the queue see what is actually agreed:

```tsx
<td className="px-6 py-4 text-ink-600">
  {record.confirmedDate
    ? `${formatDate(record.confirmedDate)} · ${record.confirmedPeriod === "am" ? "Morning" : "Afternoon"}`
    : `${formatDate(record.preferredDate)} · ${record.preferredPeriod === "am" ? "Morning" : "Afternoon"} (requested)`}
</td>
```

- [ ] **Step 2: Review drawer**

Props mirror the complaint drawer with `onReview: (id, values: AppointmentReviewValues) => void` and
`onComplete: (id: string) => void`.

`DetailRow` rows: Resident, Contact Number, Email (when present), Address, Purpose, Requested
Schedule (`${formatDate(record.preferredDate)} · ${record.preferredPeriod === "am" ? "Morning" : "Afternoon"}`),
Date Filed, Filed.

The `pending` footer is the one place this drawer is genuinely more than a copy: staff pick the slot
they are confirming, pre-filled with what the resident asked for.

```tsx
const [confirmedDate, setConfirmedDate] = useState(record.preferredDate);
const [confirmedPeriod, setConfirmedPeriod] = useState<AppointmentPeriod>(record.preferredPeriod);
```

Render, above the Remarks field, when `record.status === "pending"`: a "Confirm this schedule"
`Field` pair — an `Input type="date"` (id `appointment-confirmed-date`, `min={manilaToday()}`) and a
`Select` (id `appointment-confirmed-period`) with the same two AM/PM options as the public form,
plus this hint:

```tsx
<p className="text-xs text-ink-500">
  Pre-filled with what the resident asked for. Change it to propose a different slot.
</p>
```

Buttons: **Decline** (`variant="outline-danger"` → `onReview(record.id, { status: "declined", confirmedDate: "", confirmedPeriod: "", remarks })` — a declined appointment carries no schedule, and Task 7's action nulls both columns) and **Confirm** (→ `onReview(record.id, { status: "confirmed", confirmedDate, confirmedPeriod, remarks })`).

Client-side guard: `if (status === "declined" && !remarks.trim())` → "Remarks are required when
declining an appointment."

`confirmed` footer: mirrors the application drawer's `approved` case — a "Confirmed for
{formatDate(record.confirmedDate)} · {morning/afternoon}." hint on the left, then **Close** and
**Mark as completed** (`onComplete(record.id)`).

`completed` / `declined` footer: the read-only summary panel + **Close**, with "Reviewed by … on …"
and "Completed by … on …" lines.

- [ ] **Step 3: Walk-in form**

Mirror `complaint-form.tsx` (Task 5 Step 3) with `WalkInAppointmentValues`, id prefix
`appointment-walkin-`, fields Purpose / Preferred Date (`min={manilaToday()}`) / Preferred Time, and
initial values `preferredDate: manilaToday()`, `preferredPeriod: "am"`. Consent copy: "The resident
consented to the barangay recording these details for this appointment (Data Privacy Act of 2012)."
Submit label: "Encode appointment".

- [ ] **Step 4: Route, barrel, nav**

`src/app/admin/(portal)/appointments/page.tsx` mirrors the complaints page:
`requirePermission("process-appointments")`, then `listAppointments()`, then
`<AppointmentsManager appointments={appointments} />`. Metadata title "Appointments".

Export `AppointmentsManager` from the admin barrel in page order. Add to `ADMIN_NAV_ITEMS` after the
Incident Reports entry:

```ts
  { label: "Appointments", href: "/admin/appointments", icon: CalendarClock, permission: "process-appointments" },
```

`CalendarDays` is already imported and already used by the Event Calendar entry — import
`CalendarClock` alongside it so the two nav rows stay visually distinct.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean; the build lists `/admin/appointments`.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/appointments-manager.tsx src/features/admin/components/appointment-review-drawer.tsx src/features/admin/components/appointment-form.tsx src/features/admin/index.ts src/features/admin/data.ts src/app/admin/\(portal\)/appointments
git commit -m "feat(admin): appointment queue with schedule confirmation and walk-in encoding"
```

---

## Task 9: Assistance — public form, action, and route

**Files:**
- Create: `src/features/assistance/actions.ts`, `queries.ts`, `index.ts`,
  `components/assistance-form.tsx`
- Create: `src/app/(public)/assistance/new/page.tsx`

**Interfaces:**
- Consumes: `PublicAssistanceValues`, `SubmitTicketResult`, `AssistanceCategoryRow` (Task 2);
  `assistance_requests` + `assistance_categories` (Task 1).
- Produces: `listActiveAssistanceCategories()`; `submitAssistance(values)`.

**Context:** Mirror `src/features/complaints/*` (Task 3). The one new idea is the category picker,
which is backed by the SuperAdmin-managed `assistance_categories` table rather than a hardcoded list.

- [ ] **Step 1: Categories query**

Create `src/features/assistance/queries.ts`:

```ts
import { cache } from "react";
import type { AssistanceCategoryRow } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The picker list for the public assistance form. Retired categories
 * (`is_active = false`) are hidden here but still resolve on existing requests —
 * that is why they are retired rather than deleted.
 *
 * Cached per request: the page body and the form's empty-state check both ask.
 */
export const listActiveAssistanceCategories = cache(async (): Promise<AssistanceCategoryRow[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("assistance_categories")
    .select("id, label, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listActiveAssistanceCategories failed:", error.message);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
});
```

- [ ] **Step 2: Public action**

Create `src/features/assistance/actions.ts` mirroring `src/features/complaints/actions.ts`. Common
fields byte-identical; flow fields:

```ts
  categoryId: z.string().trim().min(1, "Pick the kind of assistance you need."),
  details: z
    .string()
    .trim()
    .min(20, "Please tell us a little more about what you need.")
    .max(2000, "Please keep the details under 2000 characters."),
```

Rate limit: key `assistance:${ip}`, `SUBMIT_LIMIT = 5`, one hour. Message: "Too many requests from
this connection. Please try again later or visit the barangay hall."

Replace the complaint action's service-availability block with a category check. Never trust the
`categoryId` from the client — it must exist and be active:

```ts
  const { data: category, error: categoryError } = await admin
    .from("assistance_categories")
    .select("id, is_active")
    .eq("id", parsed.data.categoryId)
    .maybeSingle();
  if (categoryError) {
    console.error("submitAssistance category lookup failed:", categoryError.message);
    return { error: "Something went wrong. Please try again.", ticketNo: null };
  }
  // A retired category is withdrawn for good, unlike a service's temporary
  // availability toggle — so unlike walk-in encoding elsewhere, nothing may
  // write one, online or at the counter.
  if (!category?.is_active) {
    return { error: "Pick the kind of assistance you need.", ticketNo: null };
  }
```

Insert into `assistance_requests` with `category_id: category.id`, `details`, `source: "online"`.
Failure message: "We could not file your request. Please try again."

- [ ] **Step 3: Public form**

Create `src/features/assistance/components/assistance-form.tsx` mirroring
`complaint-form.tsx`. Props: `{ categories }: { categories: AssistanceCategoryRow[] }` —
`AssistanceCategoryRow` is a plain serializable object, so it crosses the client boundary safely
(no icons anywhere near it). Deltas: fields after Address are `categoryId` (Select, options from
`categories`, initial `categories[0]?.id ?? ""`) and `details` (Textarea, `rows={5}`); submit label
"Submit request"; receipt heading "Request filed"; id prefix `assistance-`; no privacy note.

Labels: "What kind of assistance?" and "Tell us about your situation"
(`placeholder="Explain what you need and why, in your own words."`). Consent copy: "I agree to the
barangay recording these details to assess this request (Data Privacy Act of 2012)."

- [ ] **Step 4: Barrel and route**

`src/features/assistance/index.ts` exports `AssistanceForm`.

Create `src/app/(public)/assistance/new/page.tsx`. Categories are loaded server-side and passed
down. An empty list means the SuperAdmin retired every category — the form cannot function, so
render the unavailable notice rather than a picker with no options:

```tsx
import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { ApplyUnavailable } from "@/features/services/components/apply-unavailable";
import { AssistanceForm } from "@/features/assistance";
import { listActiveAssistanceCategories } from "@/features/assistance/queries";

export const metadata: Metadata = {
  title: "Request Assistance",
  description:
    "Request medical, financial, burial or calamity assistance from Barangay San Fernando, San Nicolas, Ilocos Norte.",
};

export default async function NewAssistancePage() {
  const categories = await listActiveAssistanceCategories();

  return (
    <>
      <PageHero
        title="Request Assistance"
        description="Tell us what you need. The Barangay Social Welfare Desk reviews every request and will contact you."
      />
      {categories.length > 0 ? (
        <Section>
          <div className="mx-auto max-w-3xl">
            <AssistanceForm categories={categories} />
          </div>
        </Section>
      ) : (
        <ApplyUnavailable title="Assistance requests" />
      )}
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean; the build lists `/assistance/new`.

The DB is not migrated, so `assistance_categories` does not exist yet and the query returns `[]` —
the page will render the unavailable notice. That is correct behaviour, not a bug; confirm it does
**not** crash:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/assistance/new
```
Expected: `200`.

- [ ] **Step 6: Commit**

```bash
git add src/features/assistance src/app/\(public\)/assistance
git commit -m "feat(assistance): public assistance request form, action and route"
```

---

## Task 10: Assistance — admin queries and actions

**Files:**
- Create: `src/features/admin/queries/assistance.ts`
- Create: `src/features/admin/actions/assistance.ts`

**Context:** Mirror `src/features/admin/queries/complaints.ts` and
`src/features/admin/actions/complaints.ts` (Task 4). Permission: `handle-assistance`.

- [ ] **Step 1: Queries**

Create `src/features/admin/queries/assistance.ts` with two exports.

`listAssistanceRequests(): Promise<AssistanceRow[]>` mirrors `listComplaints`, selecting:

```
id, ticket_no, first_name, last_name, address, contact_number, email, category_id, details, status, remarks, reviewed_by_name, reviewed_at, decided_by_name, decided_at, source, created_at, assistance_categories (label)
```

The joined label is read exactly the way `listApplications` reads its `services (title)` join:

```ts
    const category = row.assistance_categories as unknown as { label: string } | null;
    // …
      categoryId: row.category_id,
      categoryLabel: category?.label ?? row.category_id,
```

`listAssistanceCategories(): Promise<AssistanceCategoryRow[]>` returns **all** categories (active
and retired) ordered by `sort_order`, for the queue's filter dropdown — a retired category still has
historical rows that staff must be able to filter to. It uses the service-role client, like every
other admin query in this folder.

- [ ] **Step 2: Actions**

Create `src/features/admin/actions/assistance.ts` with three actions, each opening with
`requirePermission("handle-assistance")`.

`reviewAssistance(id, values: AssistanceReviewValues)` — schema `z.enum(["under-review", "declined"])`
+ remarks (max 1000), refined so `declined` requires remarks ("Remarks are required when declining a
request."). Guard `.eq("status", "pending")`. Writes `status`, `remarks`, `reviewed_by`,
`reviewed_by_name`, `reviewed_at`. Audit: `"took up assistance request"` / `"declined assistance
request"`, entity `"assistance"`. Failure: "Could not save the review." / "That request was already
reviewed. Refresh to see its status."

`decideAssistance(id, values: AssistanceDecisionValues)` — schema `z.enum(["granted", "declined"])` +
remarks, same refine. Guard `.eq("status", "under-review")`. Writes `status`, `remarks`,
`decided_by`, `decided_by_name`, `decided_at`. Audit: `"granted assistance request"` / `"declined
assistance request"`. Failure: "Could not save the decision." / "Only requests under review can be
decided. Refresh to see its status."

`createWalkInAssistance(values: WalkInAssistanceValues)` mirrors `createWalkInComplaint`: the
walk-in common block plus `categoryId` and `details` bounded exactly as Task 9's public schema. It
**must repeat Task 9's category existence-and-active check** before inserting — a retired category is
withdrawn for good and must not be encodable at the counter either. Insert with `source: "walk-in"`;
audit `"encoded walk-in assistance request"`. All three revalidate `/admin/assistance`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both clean. Confirm in the report: `requirePermission("handle-assistance")` first in all
three; guards `.eq("status", "pending")` / `.eq("status", "under-review")` inside the UPDATEs; the
walk-in category check present; column names match `0006_ticketing_flows.sql`.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/queries/assistance.ts src/features/admin/actions/assistance.ts
git commit -m "feat(admin): assistance queue queries and staff actions"
```

---

## Task 11: Assistance — admin queue screen

**Files:**
- Create: `src/features/admin/components/assistance-manager.tsx`,
  `assistance-review-drawer.tsx`, `assistance-form.tsx`
- Create: `src/app/admin/(portal)/assistance/page.tsx`
- Modify: `src/features/admin/index.ts`, `src/features/admin/data.ts`

**Context:** Mirror the complaints queue (Task 5). This one has two filter selects, like the
applications manager — category as well as status.

- [ ] **Step 1: Manager**

Deltas from `complaints-manager.tsx`:

| Aspect | complaints-manager | assistance-manager |
| --- | --- | --- |
| Props | `{ complaints }` | `{ requests, categories }` (`categories: AssistanceCategoryRow[]`) |
| Header title / description | "Incident Reports" | "Assistance Requests" / "Review and decide social service assistance requests." |
| New button | "New Report" | "New Request" |
| Stat cards | Total / Awaiting Review / Under Mediation | Total Requests (`HeartHandshake`) · Awaiting Review (`ClipboardList`, `status === "pending"`, danger tone when > 0) · Under Review (`FileText`, `status === "under-review"`, `tone="secondary"`) |
| Card title | "Report Queue" | "Request Queue" |
| Filters | status only | category (id `assistance-category-filter`, "All Categories" + every category incl. retired) **and** status (id `assistance-status-filter`: All Statuses / Pending / Under Review / Granted / Declined) — mirror the applications manager's two-select `AdminFilterBar` usage |
| Table columns | Complainant / Where It Happened / Date Filed / Status / Actions | Resident / Category / Date Filed / Status / Actions |
| Empty (no rows) | "No reports yet…" | "No assistance requests yet. Residents' online requests land here." |
| Empty (filtered) | "No reports match your filters." | "No requests match your filters." |
| Handlers | `handleReview` / `handleClose` | `handleReview` (`reviewAssistance`) / `handleDecide` (`decideAssistance`) |
| Toasts | mediation copy | `under-review` → "Request taken up for review." · `declined` → "Request declined." · `granted` → "Request granted." · walk-in → "Walk-in request encoded." |

`clearFilters` resets category as well as search and status.

- [ ] **Step 2: Review drawer**

Mirror `complaint-review-drawer.tsx`. Props take `onReview: (id, values: AssistanceReviewValues)` and
`onDecide: (id, values: AssistanceDecisionValues)`.

`DetailRow` rows: Resident, Contact Number, Email (when present), Address, Category
(`record.categoryLabel`), Date Filed, Filed. The details text is long-form — render it after the
`<dl>` exactly as the complaint drawer renders its narrative, headed "Their Situation".

Footer by status:
- `pending` → Remarks (placeholder "Optional when taking it up; required when declining.") +
  **Decline** (`outline-danger`, `onReview` `declined`) and **Take up for review** (`onReview`
  `under-review`).
- `under-review` → Remarks (placeholder "Optional when granting; required when declining.") +
  **Decline** (`outline-danger`, `onDecide` `declined`) and **Grant request** (`onDecide` `granted`).
- `granted` / `declined` → read-only summary + **Close**, with "Reviewed by … on …" and "Decided by
  … on …" lines.

Client-side guard: `declined` without remarks → "Remarks are required when declining a request."

- [ ] **Step 3: Walk-in form**

Mirror `complaint-form.tsx`. `WalkInAssistanceValues`, id prefix `assistance-walkin-`, fields
Category (Select — **active categories only**; the manager filters `categories.filter((c) => c.isActive)`
before passing them to the form, because Task 10's action rejects retired ones) and Details.
Initial `categoryId: activeCategories[0]?.id ?? ""`. Consent copy: "The resident consented to the
barangay recording these details for this request (Data Privacy Act of 2012)." Submit label: "Encode
request".

- [ ] **Step 4: Route, barrel, nav**

`src/app/admin/(portal)/assistance/page.tsx`: `requirePermission("handle-assistance")`, then

```tsx
  const [requests, categories] = await Promise.all([
    listAssistanceRequests(),
    listAssistanceCategories(),
  ]);
  return <AssistanceManager requests={requests} categories={categories} />;
```

Metadata title "Assistance Requests". Export `AssistanceManager` from the barrel in page order. Add
to `ADMIN_NAV_ITEMS` after the Appointments entry:

```ts
  { label: "Assistance Requests", href: "/admin/assistance", icon: HeartHandshake, permission: "handle-assistance" },
```

Import `HeartHandshake` from `lucide-react` in `data.ts`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean; the build lists `/admin/assistance`.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/assistance-manager.tsx src/features/admin/components/assistance-review-drawer.tsx src/features/admin/components/assistance-form.tsx src/features/admin/index.ts src/features/admin/data.ts src/app/admin/\(portal\)/assistance
git commit -m "feat(admin): assistance request queue with decision flow and walk-in encoding"
```

---

## Task 12: Assistance categories — SuperAdmin editor

**Files:**
- Create: `src/features/admin/actions/assistance-categories.ts`
- Create: `src/features/admin/components/assistance-categories-panel.tsx`
- Modify: `src/app/admin/(portal)/services/page.tsx`

**Interfaces:**
- Consumes: `AssistanceCategoryRow`, `AssistanceCategoryValues` (Task 2);
  `listAssistanceCategories()` (Task 10); `assistance_categories` (Task 1).
- Produces: `createAssistanceCategory`, `renameAssistanceCategory`, `setAssistanceCategoryActive`,
  `moveAssistanceCategory`; the panel component.

**Context:** Spec §3 puts this list "alongside the service catalog", so it lives at the bottom of the
SuperAdmin-only `/admin/services` page — which already calls `requireSuperAdmin()`. Read
`src/features/admin/actions/services.ts` first: `createService` already solves slug-from-title +
dedupe + `sort_order = max + 1`, and this task reuses that approach. Also read
`src/features/admin/components/services-manager.tsx` for the `ToggleSwitch` + `Toast` +
`useTransition` idiom.

**Categories are retired, never deleted** — `assistance_requests.category_id` references them and a
hard delete would orphan a resident's record. There is deliberately **no delete action**; do not add
one.

- [ ] **Step 1: Write the actions**

Create `src/features/admin/actions/assistance-categories.ts`. Every action opens with
`const actor = await requireSuperAdmin();`, records activity with entity `"assistance category"`,
and ends with `revalidatePath("/admin/services")` **and** `revalidatePath("/assistance/new")` — the
public picker is a cached server read and must not go stale.

```ts
const categorySchema = z.object({
  label: z
    .string()
    .trim()
    .min(3, "Enter a category name.")
    .max(60, "Please keep the category name short."),
});
```

`createAssistanceCategory(values: AssistanceCategoryValues)`:
- parse; derive the id by slugifying the label the same way `createService` slugifies its title —
  read that function and reuse its exact approach (lowercase, non-alphanumerics to hyphens, trimmed
  hyphens). If `createService` factors the slug logic into a helper, import it; if it is inline,
  mirror it rather than refactoring `services.ts` in this task.
- read `id, sort_order` from `assistance_categories`; `sort_order = max + 1`; if the derived id
  already exists, return `{ error: "A category with that name already exists." }`.
- insert `{ id, label, sort_order }`. Audit `"added assistance category"`.

`renameAssistanceCategory(id: string, values: AssistanceCategoryValues)`: parse, update `label` where
`id`, audit `"renamed assistance category"`. The id (and therefore existing rows' `category_id`)
never changes — renaming is cosmetic by design.

`setAssistanceCategoryActive(id: string, isActive: boolean)`: update `is_active`, audit
`"retired assistance category"` / `"restored assistance category"`.

`moveAssistanceCategory(id: string, direction: "up" | "down")`: read all categories ordered by
`sort_order`; find the row and its neighbour in `direction`; if there is no neighbour return
`{ error: null }` (a no-op at the ends is not an error); otherwise swap the two `sort_order` values
with two updates. Audit `"reordered assistance categories"`.

Two updates are not atomic, and that is accepted here: the rows are a 5-item display list edited by
one SuperAdmin, and the worst case of an interleaved swap is a duplicated `sort_order`, which
`order by sort_order` still renders deterministically enough to fix with another click. Say so in a
comment on the function so the next reader knows it was weighed.

- [ ] **Step 2: Write the panel**

Create `src/features/admin/components/assistance-categories-panel.tsx` (`"use client"`), taking
`{ categories }: { categories: AssistanceCategoryRow[] }`.

Render a `Card` titled "Assistance Categories" with the description "The list residents pick from
when requesting assistance. Retiring a category hides it from the form; past requests keep it." Each
row shows the label, a `ToggleSwitch` bound to `setAssistanceCategoryActive`, `ChevronUp` /
`ChevronDown` icon buttons wired to `moveAssistanceCategory` (the first row's up and last row's down
are `disabled`), and a `Pencil` button that swaps the label into an inline `Input` with Save /
Cancel. A "New Category" `Button` with a `Plus` icon reveals a single `Input` + Save / Cancel at the
bottom.

Every mutation goes through `startTransition`, surfaces `result.error` in a
`<p role="alert" className="text-sm font-medium text-danger">`, and shows a `Toast` on success
("Category added." / "Category renamed." / "Category retired." / "Category restored." /
"Categories reordered."). Hold **no local copy of the category rows** — render from props and let
`revalidatePath` refresh them, exactly as the queue managers do.

Give each icon button an `aria-label` (e.g. `Move ${category.label} up`, `Rename ${category.label}`)
— they have no text.

- [ ] **Step 3: Mount it**

In `src/app/admin/(portal)/services/page.tsx`, load both lists and render the panel under the
services manager:

```tsx
export default async function AdminServicesPage() {
  await requireSuperAdmin();
  const [services, categories] = await Promise.all([
    listServiceCatalog(),
    listAssistanceCategories(),
  ]);
  return (
    <>
      <ServicesManager services={services} />
      <div className="mt-8">
        <AssistanceCategoriesPanel categories={categories} />
      </div>
    </>
  );
}
```

`listAssistanceCategories` comes from `@/features/admin/queries/assistance` (Task 10) and returns
retired categories too — the panel needs them to offer "restore".

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions/assistance-categories.ts src/features/admin/components/assistance-categories-panel.tsx src/app/admin/\(portal\)/services/page.tsx
git commit -m "feat(admin): SuperAdmin editor for assistance categories"
```

---

## Task 13: `/track` — all four kinds behind `tickets_view`

**Files:**
- Modify: `src/features/track/actions.ts`
- Modify: `src/features/track/components/ticket-timeline.tsx`
- Modify: `src/features/track/components/track-lookup.tsx`

**Interfaces:**
- Consumes: `tickets_view` (Task 1); `TicketLookupResult`, `TicketKind`, `TicketStatus` (Task 2).
- Produces: a `lookupTicket` that resolves any of the four kinds.

**Context:** This is the highest-privacy surface in the project. Read `src/features/track/actions.ts`
in full before touching it, **including its comments** — they record a Critical bug fixed in 2B and
the reasons the code looks the way it does. Two invariants are non-negotiable:

1. **The last name is never sent to Postgres.** It is compared in JS after an exact `ticket_no`
   fetch. `ilike` would read it as a LIKE pattern, so a lone `%` (or `*`, which PostgREST rewrites to
   `%`) would match every surname and turn a guessed sequential ticket number into a data leak. Keep
   `sameSurname()` and its NFC normalisation exactly as they are — "Peña" and "Nuñez" are ordinary
   Ilocano surnames and a decomposed ñ must still match.
2. **"No such ticket" and "wrong name" return the identical message.** Never confirm a ticket exists
   to someone who cannot name its owner.

New this task: **a complaint's narrative, respondent and location must never enter
`TicketLookupResult`** (spec §3: complaints show status only). The complaint branch below issues no
follow-up query at all — that is the enforcement, and it is why the extras are fetched per-kind
rather than joined into `tickets_view`.

- [ ] **Step 1: Rewrite the lookup**

In `src/features/track/actions.ts`, keep the file's existing top matter (`LOOKUP_LIMIT`,
`LOOKUP_WINDOW_MS`, `NOT_FOUND`, `sameSurname`, the rate-limit and empty-input guards) **unchanged**.
Replace the query and result-building with:

```ts
  const admin = createSupabaseAdminClient();
  // Resolve the ticket through the union view: the prefix already tells the kinds
  // apart, and this keeps one round-trip for the privacy gate regardless of type.
  // Fetch by ticket number alone (it is unique), then match the last name here —
  // see the note above sameSurname for why the name never goes into the query.
  const { data, error } = await admin
    .from("tickets_view")
    .select("ticket_no, kind, first_name, last_name, status, remarks, created_at, reviewed_at, closed_at")
    .eq("ticket_no", ticket)
    .maybeSingle();

  if (error) {
    console.error("lookupTicket failed:", error.message);
    return { error: "Something went wrong. Please try again.", ticket: null };
  }
  // One message for "no such ticket" and "wrong name" alike.
  if (!data || !sameSurname(data.last_name, surname)) {
    return { error: NOT_FOUND, ticket: null };
  }

  const kind = data.kind as TicketKind;
  const base = {
    kind,
    ticketNo: data.ticket_no,
    applicantName: `${data.first_name} ${data.last_name}`,
    status: data.status as TicketStatus,
    submittedAt: toManilaDate(data.created_at),
    reviewedAt: data.reviewed_at ? toManilaDate(data.reviewed_at) : null,
    closedAt: data.closed_at ? toManilaDate(data.closed_at) : null,
    remarks: data.remarks,
    requirements: [] as string[],
    scheduleNote: null as string | null,
  };

  const extras = await loadExtras(admin, kind, ticket);
  return { error: null, ticket: { ...base, ...extras } };
```

Add this helper below `lookupTicket`. It is the only place kind-specific data is read, and the
complaint branch is deliberately empty:

```ts
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Per-kind extras for a ticket that has already passed the surname gate.
 * Complaints get NOTHING beyond their label: the narrative, respondent and
 * location must never reach a public page (spec §3 — complaints show status
 * only). That is enforced by this function not asking for them.
 */
async function loadExtras(
  admin: AdminClient,
  kind: TicketKind,
  ticketNo: string,
): Promise<Pick<TicketLookupResult, "type" | "serviceTitle" | "requirements" | "scheduleNote">> {
  if (kind === "complaint") {
    return {
      type: "Incident Report",
      serviceTitle: "Incident report",
      requirements: [],
      scheduleNote: null,
    };
  }

  if (kind === "appointment") {
    const { data } = await admin
      .from("appointments")
      .select("purpose, confirmed_date, confirmed_period")
      .eq("ticket_no", ticketNo)
      .maybeSingle();
    return {
      type: "Appointment",
      serviceTitle: data?.purpose ?? "Appointment",
      requirements: [],
      scheduleNote:
        data?.confirmed_date && data.confirmed_period
          ? `${formatDate(data.confirmed_date)} · ${data.confirmed_period === "am" ? "Morning (8:00 AM – 12:00 NN)" : "Afternoon (1:00 PM – 5:00 PM)"}`
          : null,
    };
  }

  if (kind === "assistance") {
    const { data } = await admin
      .from("assistance_requests")
      .select("assistance_categories (label)")
      .eq("ticket_no", ticketNo)
      .maybeSingle();
    const category = data?.assistance_categories as unknown as { label: string } | null;
    return {
      type: "Assistance Request",
      serviceTitle: category?.label ?? "Assistance request",
      requirements: [],
      scheduleNote: null,
    };
  }

  const { data } = await admin
    .from("applications")
    .select("services (title, requirements)")
    .eq("ticket_no", ticketNo)
    .maybeSingle();
  const service = data?.services as unknown as { title: string; requirements: string[] } | null;
  return {
    type: "Certificate Application",
    serviceTitle: service?.title ?? "Barangay document",
    requirements: service?.requirements ?? [],
    scheduleNote: null,
  };
}
```

Import `formatDate` alongside `toManilaDate` from `@/lib/format`, and the new types from `@/types`.
Update the file's header comment: the "Plan 2C: query the tickets_view union here instead and widen
`type`" note is now done — replace it with a line saying the view is queried and each kind's extras
are loaded separately so complaints cannot leak.

- [ ] **Step 2: Rewrite the timeline**

Replace the body of `src/features/track/components/ticket-timeline.tsx` above the `TicketTimeline`
component (keep the component's JSX, its icon/tone mapping and the `Step` interface exactly as they
are — only `buildSteps` and its copy tables change):

```tsx
const NEGATIVE_STATUSES: TicketStatus[] = ["rejected", "declined", "dismissed"];
const INITIAL_STATUSES: TicketStatus[] = ["pending", "received"];
const FINAL_STATUSES: TicketStatus[] = ["released", "completed", "resolved", "granted"];

interface StageCopy {
  title: string;
  failedTitle: string;
  doneDetail: string;
  failedDetail: string;
  /** Shown while this stage is still ahead of the ticket. */
  waitingDetail: string;
}

/** Every flow is Received → stage 1 → stage 2; only the words differ. */
const COPY: Record<TicketKind, { stage1: StageCopy; stage2: StageCopy }> = {
  application: {
    stage1: {
      title: "Reviewed",
      failedTitle: "Not approved",
      doneDetail: "Approved by barangay staff.",
      failedDetail: "This request was not approved.",
      waitingDetail: "Barangay staff are reviewing your request.",
    },
    stage2: {
      title: "Released",
      failedTitle: "Closed",
      doneDetail: "Claimed at the barangay hall.",
      failedDetail: "This request was closed.",
      waitingDetail: "Bring a valid ID to the barangay hall to claim your document.",
    },
  },
  appointment: {
    stage1: {
      title: "Confirmed",
      failedTitle: "Declined",
      doneDetail: "Barangay staff confirmed your schedule.",
      failedDetail: "This appointment was not granted.",
      waitingDetail: "Barangay staff are checking the schedule you asked for.",
    },
    stage2: {
      title: "Completed",
      failedTitle: "Closed",
      doneDetail: "Thank you for coming in.",
      failedDetail: "This appointment was closed.",
      waitingDetail: "Once confirmed, come to the barangay hall at your scheduled time.",
    },
  },
  complaint: {
    stage1: {
      title: "Under review",
      failedTitle: "Dismissed",
      doneDetail: "The Lupong Tagapamayapa is looking into your report.",
      failedDetail: "This report was not taken up.",
      waitingDetail: "Your report is waiting for review.",
    },
    stage2: {
      title: "Resolved",
      failedTitle: "Dismissed",
      doneDetail: "This report has been settled.",
      failedDetail: "This report was closed without a settlement.",
      waitingDetail: "Barangay staff will contact you about mediation.",
    },
  },
  assistance: {
    stage1: {
      title: "Under review",
      failedTitle: "Declined",
      doneDetail: "The Barangay Social Welfare Desk is assessing your request.",
      failedDetail: "This request was not granted.",
      waitingDetail: "Your request is waiting for review.",
    },
    stage2: {
      title: "Granted",
      failedTitle: "Declined",
      doneDetail: "Your request was granted — barangay staff will contact you.",
      failedDetail: "This request was not granted.",
      waitingDetail: "The Barangay Social Welfare Desk will contact you with a decision.",
    },
  },
};

function buildSteps(ticket: TicketLookupResult): Step[] {
  const copy = COPY[ticket.kind];
  const negative = NEGATIVE_STATUSES.includes(ticket.status);
  const initial = INITIAL_STATUSES.includes(ticket.status);
  const final = FINAL_STATUSES.includes(ticket.status);
  // Complaints and assistance can go negative at either stage; closedAt is what
  // tells them apart. Applications and appointments only ever fail at stage 1,
  // where their stage-2 actions guard on the positive stage-1 status.
  const failedAtStage1 = negative && ticket.closedAt === null;
  const failedAtStage2 = negative && ticket.closedAt !== null;

  const steps: Step[] = [
    {
      title: "Received",
      detail: "Your request reached the barangay office.",
      date: ticket.submittedAt,
      state: "done",
    },
    {
      title: failedAtStage1 ? copy.stage1.failedTitle : copy.stage1.title,
      detail: failedAtStage1
        ? (ticket.remarks ?? copy.stage1.failedDetail)
        : initial
          ? copy.stage1.waitingDetail
          : copy.stage1.doneDetail,
      date: ticket.reviewedAt,
      state: failedAtStage1 ? "failed" : initial ? "current" : "done",
    },
  ];

  // A ticket rejected on receipt has no third step — there is nothing ahead.
  if (failedAtStage1) return steps;

  steps.push({
    title: failedAtStage2 ? copy.stage2.failedTitle : copy.stage2.title,
    detail: failedAtStage2
      ? (ticket.remarks ?? copy.stage2.failedDetail)
      : final
        ? copy.stage2.doneDetail
        : copy.stage2.waitingDetail,
    date: ticket.closedAt,
    state: failedAtStage2 ? "failed" : final ? "done" : "todo",
  });

  return steps;
}
```

- [ ] **Step 3: Surface the confirmed schedule**

Read `src/features/track/components/track-lookup.tsx`. It currently renders the ticket header, the
timeline, and the requirements checklist. Two changes:

- Wherever it labels the ticket, it should now use `ticket.type` and `ticket.serviceTitle` from the
  result rather than assuming an application. If it already does, change nothing.
- When `ticket.scheduleNote` is present, render this panel directly above the timeline:

```tsx
{ticket.scheduleNote ? (
  <div className="mb-6 rounded-2xl bg-brand-100/50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
      Your confirmed schedule
    </p>
    <p className="mt-1 font-semibold text-ink-900">{ticket.scheduleNote}</p>
  </div>
) : null}
```

`bg-brand-100/50` is deliberate — **`bg-brand-50` does not exist** and Tailwind v4 drops it
silently, leaving the panel unfilled.

The requirements checklist must stay gated so it only shows when there is something to bring: keep
its existing condition and add `ticket.requirements.length > 0` if that is not already what gates it.
Non-application kinds always carry `requirements: []`, so they will never render it.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean. `COPY` is a `Record<TicketKind, …>`, so a missing kind fails typecheck here.

The DB is not migrated, so a live lookup cannot be tested — Task 16 does that. Confirm the page still
renders: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/track` → `200`.

- [ ] **Step 5: Commit**

```bash
git add src/features/track
git commit -m "feat(track): resolve appointments, complaints and assistance through tickets_view"
```

---

## Task 14: Wire the entry points

**Files:**
- Modify: `src/features/services/components/service-card.tsx`
- Modify: `src/features/home/data.ts`
- Modify: `src/features/officials/components/action-center-banner.tsx`

**Context:** Every flow built above is currently unreachable. 2B shipped `/track` linked from
nowhere and only caught it in the final review — the forms are worthless if no resident can find
them. These three files hold the CTAs that have been pointing at `/services` and `/contact` as
placeholders since the design phase.

- [ ] **Step 1: Un-inert the complaint card**

In `src/features/services/components/service-card.tsx`, the `isDanger && service.isAvailable` branch
currently renders a **disabled** button with "Please file this in person at the barangay hall."
Replace that whole branch with a real link:

```tsx
          isDanger ? (
            <Button href="/complaints/new" variant="outline-danger" className="mt-6 w-full">
              {service.ctaLabel}
            </Button>
          ) : (
```

Delete the two-line comment above it that says the complaint flow lands in plan 2C. The
`!service.isAvailable` branch below is untouched: a disabled button plus "Temporarily unavailable —
please visit the barangay hall." is still exactly right, and it is now backed by a real check —
`/complaints/new` reads the same toggle server-side (Task 3).

- [ ] **Step 2: Point the home quick actions at the real forms**

In `src/features/home/data.ts`, `QUICK_SERVICES` currently sends three cards to `/services` or
`/contact`. Update exactly these three entries:

```ts
  { title: "Set an Appointment", ctaLabel: "Book Now", href: "/appointments/new", icon: CalendarDays },
  { title: "File a Complaint", ctaLabel: "Submit Online", href: "/complaints/new", icon: FileEdit },
  {
    title: "Social Services Assistance",
    ctaLabel: "Request Now",
    href: "/assistance/new",
    icon: HeartHandshake,
  },
```

The assistance `ctaLabel` changes from "Learn More" to "Request Now": it now files a request rather
than explaining one, and "Learn More" would misdescribe where the button goes.

Leave the other three entries ("Barangay Clearance", "Certificate Requests", "Business Permit" →
`/services`) exactly as they are. They point at the services directory, where each card's own "Apply
Online" button routes to the right slug — that is correct, not a placeholder.

- [ ] **Step 3: Point the officials banner at the assistance form**

In `src/features/officials/components/action-center-banner.tsx`, change the "Request Assistance"
button's `href` from `/contact` to `/assistance/new`. Leave the emergency hotline button alone.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean.

Then prove every new route is reachable from a page a resident actually lands on:

```bash
curl -s http://localhost:3000/ | grep -Eo '/(appointments|complaints|assistance)/new' | sort -u
curl -s http://localhost:3000/services | grep -c '/complaints/new'
curl -s http://localhost:3000/officials | grep -c '/assistance/new'
```
Expected: the first prints all three routes; the second and third print `1` or more.

- [ ] **Step 5: Commit**

```bash
git add src/features/services/components/service-card.tsx src/features/home/data.ts src/features/officials/components/action-center-banner.tsx
git commit -m "feat(public): link the appointment, complaint and assistance forms from their CTAs"
```

---

## Task 15: Documentation

**Files:**
- Modify: `docs/BACKEND_HANDOFF.md`

**Context:** `docs/BACKEND_HANDOFF.md` is the authoritative brief for the backend integration. Read
its 2026-07-17 changelog entry (added by 2B) and match its voice and structure exactly. Do **not**
retro-edit dated spec or plan files under `docs/superpowers/` — they are historical records.

- [ ] **Step 1: Update the handoff**

Make these edits:

1. **Changelog:** add an entry for this branch — the three new tables, `assistance_categories`,
   `tickets_view` (noting `security_invoker = true` and why), the three public routes, the three
   admin queues, the SuperAdmin category editor, and `/track` now resolving all four kinds with
   complaints limited to status only.
2. **Route table:** add `/appointments/new`, `/complaints/new`, `/assistance/new`,
   `/admin/appointments`, `/admin/complaints`, `/admin/assistance`.
3. **"Dangling CTAs that imply future endpoints":** "Set an Appointment", "File a Complaint" and
   "Social Services Assistance"/"Request Assistance" are now live — strike them through and date
   them **2026-07-17**, exactly as the 2B entry struck through "Apply Online". Leave "Subscribe to
   Alerts", "Register as Resident", "Submit FOI Request", "Download All Forms" and per-article "Read
   More" listed: they are still dangling.
4. **Work items:** mark the ticketing work item done; if the item covering the four flows is
   partially complete, reword it to name what remains rather than ticking it whole.
5. **Mock-data inventory:** if it still lists appointments/complaints/assistance as mock or absent,
   correct it — all three are DB-backed now.

- [ ] **Step 2: Verify**

Re-read your diff. Every claim must be true of the code on this branch — a handoff doc that
overstates is worse than one that is silent. In particular: email notifications are **not** built
(plan 2D, blocked on a Resend account), so nothing may imply a resident is emailed their ticket
number.

- [ ] **Step 3: Commit**

```bash
git add docs/BACKEND_HANDOFF.md
git commit -m "docs: record the appointment, complaint and assistance flows"
```

---

## Task 16: Runtime sweep

> **BLOCKED ON A HUMAN STEP.** `supabase/migrations/0006_ticketing_flows.sql` must be applied to the
> live Supabase project before this task can run. Do not attempt it before then, and do not merge
> this branch before it passes: 2B's Critical `/track` bug and 2A's Critical RSC bug were both
> caught here and by nothing else.

**Context:** There is no test framework and none may be added. This is the verification. The recipe
is in `.claude/skills/verify/SKILL.md`: `npm i playwright-core` in the session scratchpad, launch
system Chrome headless, drive with role-based locators.

**Test-data rules (carried from 2B, non-negotiable):**
- Create temporary accounts on `@brgysf-test.ph` only. **Never touch Justine's or Sharah Mae's live
  accounts.**
- Tear down every row created, scoped by exact markers, and reset the `APT`/`CMP`/`AST` counters so
  the barangay's first real tickets are `-00001`.
- Leave `blotter-complaints` **enabled** at the end (Justine's own setting was disabled before 2B's
  sweep; check its state first and restore whatever you found).

**Sweep gotchas (learned the hard way in 2B):**
- `getByLabel(/password/i)` is a strict-mode violation — it matches the input *and* the "Show
  password" eye toggle. Use `#login-email` / `#login-password`.
- Scope drawer actions with `getByRole("dialog")` — action buttons exist in both the drawer and the
  page.
- The rate limiter is **in-memory and persists across script runs** in one dev server (5 submits/hr
  per flow here). Split the sweep and reuse tickets rather than re-running the public path.

- [ ] **Step 1: Confirm the migration landed**

Query the live project (`NODE_PATH` pointing at the repo's `node_modules` so
`@supabase/supabase-js` resolves from the scratchpad). Verify: all four new tables exist;
`next_ticket_number('CMP')` returns the exact `CMP-YYYY-NNNNN` shape; `assistance_categories` holds
the five seeded rows; and `tickets_view` returns rows through the service-role client.

**Then verify the security-critical property directly** — with an **anon-key** client, select from
`tickets_view` and from each of `appointments`, `complaints`, `assistance_requests`. Every one must
return zero rows or an error. If `tickets_view` returns data to anon, `security_invoker` did not
take effect: **stop, report it, and do not proceed** — that is the whole posture broken.

- [ ] **Step 2: Public paths (per flow)**

For each of complaints, appointments and assistance:
1. The form renders and the consent checkbox is refused when unticked.
2. A valid submission returns the expected first ticket (`CMP-2026-00001`, `APT-2026-00001`,
   `AST-2026-00001`) and a second increments it.
3. `/track` finds the ticket with the right last name and shows the correct three-step timeline.
4. `/track` with the **wrong** surname reveals nothing, and a lone `%` as the surname is **blocked**
   (the 2B Critical, re-verified against the new view — this is the single most important check in
   the sweep).

Flow-specific: an appointment for a **past** date is rejected; a complaint with a **future**
incident date is rejected; an assistance request naming a category id that is not in the list is
rejected.

- [ ] **Step 3: Staff paths (per flow)**

Log in as a temp account holding the matching permission and verify: the ticket appears in its
queue; a negative decision with **empty remarks is blocked**; a negative decision with remarks
succeeds; the positive stage-1 then stage-2 transitions both work and land the right status; a
walk-in encodes and is tagged `walk-in` with the correct **Manila** date; and the audit log
attributes every action to the actor.

Appointments specifically: confirming a **different** slot than requested persists that slot, and
`/track` shows the confirmed schedule panel — not the requested one.

- [ ] **Step 4: The complaint privacy gate**

File a complaint whose narrative contains a unique marker string. Take it up for mediation, then
resolve it. At **every** status, fetch `/track` for that ticket and assert the marker, the
respondent's name, and the location appear **nowhere** in the response body. This is spec §3's
central promise; a failure here is Critical.

- [ ] **Step 5: Permissions**

Verify a user with **none** of `handle-complaints` / `process-appointments` / `handle-assistance`
sees no nav link for those queues and is bounced to `/admin` on guessing each URL. Verify a
non-SuperAdmin cannot reach the assistance category editor.

- [ ] **Step 6: Categories**

As SuperAdmin: add a category, rename it, reorder it, retire it. Confirm a retired category
disappears from `/assistance/new` but that an existing request still shows its label in the queue.
Restore it. Delete the temporary category directly in SQL during teardown.

- [ ] **Step 7: Teardown and report**

Delete every sweep row and audit entry created, scoped by exact marker. Reset the `APT`, `CMP` and
`AST` counters. Delete the `@brgysf-test.ph` accounts. **Verify** Justine's and Sharah Mae's accounts
are intact and that `blotter-complaints` is in the state you found it.

Report the full pass/fail table. Any failure blocks the merge.

---

## Carried forward (deliberately not fixed in this plan)

1. **Unbounded queues, now four of them.** `listApplications`, `listComplaints`,
   `listAppointments` and `listAssistanceRequests` each select their whole table and hand every row
   to a client manager that paginates at 6. This is decision 8 — accepted for now because the three
   new queues are low-volume, and deferred to a dedicated plan that converts all four to
   server-side pagination in one pass. That plan is the next one to write once these flows are
   proven in use.
2. **Rate-limit thresholds vs. Philippine CGNAT.** Every public ticket action keys its limit on the
   client IP (`apply:` 10/hr; `complaint:`, `appointment:`, `assistance:` 5/hr each; `track:`
   10/10min), assuming one IP ≈ one household. Globe/Smart mobile CGNAT puts thousands of
   subscribers behind one public IP, and that is how most residents here reach the site. The
   in-memory store masks this today — it will start biting exactly when the hardening plan makes the
   store durable. **That plan must revisit the thresholds, not just the storage.**
3. **`tickets_view` is not yet used for dashboard stats.** Spec §3 names it for "/track and
   dashboard stats"; only `/track` reads it here. The admin dashboard is still mock data and gets
   its own plan.
4. **`moveAssistanceCategory` swaps two `sort_order` values non-atomically** (Task 12). Weighed and
   accepted: a 5-item list edited by one SuperAdmin, worst case a duplicate `sort_order` fixable
   with another click.

## Handoff to plan 2D

2D is the notification module (spec §8) — **blocked on Justine setting up a Resend account and the
domain**. Every table built here already carries the optional `email` column it needs, and every
status transition already runs through a single Server Action per flow, which is where the send
belongs. No schema change should be required.

