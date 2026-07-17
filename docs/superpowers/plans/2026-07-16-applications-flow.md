# Applications Flow (Ticketing 2B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A resident can apply online for a certificate/clearance, receive a ticket number, and track it at `/track`; staff process that queue end-to-end (approve → release, or reject) and encode walk-ins into the same queue.

**Architecture:** One Postgres table (`applications`) plus a shared, collision-safe ticket-number generator (`next_ticket_number(prefix)`) that plans 2C reuses for appointments/complaints/assistance. The table has **no RLS policies at all** — anon and authenticated both get nothing; every read and write (including the public `/track` lookup) goes through the service-role client in a Server Action after an explicit code-level check. The public apply page is a server component that loads the service from the DB and renders a client form; submission is a Server Action returning the ticket number. The admin queue replaces the mock `ApplicationsManager` with DB-backed queries + permission-gated Server Actions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (Postgres, service-role client), Zod v4, Server Actions.

## Global Constraints

- **Design tokens only:** `brand-*` (amber), `ink-*` (neutrals), `danger`/`danger-soft`/`danger-soft-fg`/`danger-deep`. **There is no green/success token — never introduce one.** No blue tokens (pre-2026-07 design; a regression if reintroduced).
- **Zod is v4** (`^4.4.3`), not v3. Follow the existing repo idiom: `z.string().email("…")`, `z.string().trim().min(n, "…")`, `z.enum([...])`.
- **Icons never cross the RSC boundary.** Anything passed into a `"use client"` component must be a plain serializable object. Icons travel as name strings and are resolved with `resolveIcon()` from `@/lib/icon-map`.
- **Identity:** "Barangay San Fernando, San Nicolas, Ilocos Norte". San Nicolas is a **municipality** — write "Municipal", never "City". Area code is **(077)**. Any "Sampaguita" in `src/` is a regression.
- **There is no test framework.** Do not add one. Verification per task = `npm run typecheck` + `npm run lint` clean, plus the runtime checks each task names. Task 9 is the full runtime sweep.
- **Path alias:** `@/*` → `src/*`.
- **Server Components by default.** `"use client"` only for real interactivity.
- **Migrations are applied by a human** (Justine, via the Supabase SQL editor). Never assume a migration is live; Task 9 is gated on it.
- **Ticket number format is `APP-2026-00001`** — 5-digit zero-padded sequence, per-year, per-prefix. (The old mock used 4 digits; the spec's 5 wins.)
- **Philippine time.** Postgres `now()` is UTC; the barangay is UTC+8. Every date shown to a human must be the **Asia/Manila** calendar date. Use `toManilaDate()` (Task 2) — never `.slice(0, 10)` on a `timestamptz`.
- **Remarks are required on every negative decision** (spec §3).
- **Never `git add -A`** in this repo — it sweeps in the intentionally-untracked `proposal/` and `stitch_tabbed_content_manager/`. Always `git add <explicit paths>`.

## Design decisions locked for this plan

1. **Which services route to the applications flow:** `tone === "primary"`. `tone === "danger"` (currently only `blotter-complaints`) is the **complaint** flow and lands in 2C — its CTA stays inert here. The codebase already treats `tone` as the service's kind: `labelsForTone()` derives "Apply Online" vs "File Incident Report" from it. No new column, no new admin UI.
2. **No `tickets_view` yet.** The spec's union view exists to serve `/track` across four tables. With one table it would be pure ceremony. `lookupTicket()` queries `applications` directly behind a normalized return type (`TicketLookupResult`); 2C swaps the query body for the view without touching the page.
3. **Rate limiting is best-effort in-process.** `src/lib/rate-limit.ts` is an in-memory sliding window — it survives within a warm serverless instance but not across them. That is a real speed bump against naive enumeration and is honest about its limits in a comment. The hardening plan (spec §12 step 8) replaces it with a durable store.
4. **Status flow:** `pending → approved → released`, or `pending → rejected`. Approve/reject stamps `reviewed_*`; release stamps `released_*`. Both are attributed to the acting user (spec §3).

## File Structure

**Created:**
- `supabase/migrations/0005_applications.sql` — ticket counter + generator function + `applications` table.
- `src/lib/rate-limit.ts` — in-memory sliding-window limiter.
- `src/features/services/actions.ts` — `submitApplication` (public).
- `src/app/(public)/services/apply/[slug]/page.tsx` — apply route.
- `src/features/services/components/apply-form.tsx` — client form + success panel.
- `src/features/services/components/apply-unavailable.tsx` — notice when a service is toggled off.
- `src/app/(public)/track/page.tsx` — track route.
- `src/features/track/` — `index.ts`, `actions.ts` (`lookupTicket`), `components/track-lookup.tsx`, `components/ticket-timeline.tsx`.
- `src/features/admin/queries/applications.ts` — queue + filter-option queries.
- `src/features/admin/actions/applications.ts` — `reviewApplication`, `releaseApplication`, `createWalkInApplication`.

**Modified:**
- `src/types/index.ts` — `ApplicationStatus` gains `"released"`; new row/value/result types; `IconNavItem.permission`.
- `src/lib/format.ts` — `toManilaDate()`.
- `src/features/admin/components/status-chip.tsx` — `"released"` label + tone.
- `src/features/services/queries.ts` — `getApplyService(slug)`.
- `src/features/services/components/service-card.tsx` — CTA becomes a link to the apply page.
- `src/features/services/index.ts` — barrel additions.
- `src/features/admin/components/applications-manager.tsx` — rewritten DB-backed.
- `src/features/admin/components/application-form.tsx` — rewritten for walk-in encoding.
- `src/features/admin/components/application-review-drawer.tsx` — rewritten (approve/reject/release).
- `src/features/admin/components/admin-sidebar.tsx` — permission-based nav filtering.
- `src/features/admin/components/admin-topbar.tsx`, `admin-mobile-nav.tsx` — thread `permissions`.
- `src/app/admin/(portal)/layout.tsx` — pass `permissions`.
- `src/app/admin/(portal)/applications/page.tsx` — permission gate + data load.
- `src/features/admin/data.ts` — delete application mocks (Task 8).
- `docs/BACKEND_HANDOFF.md` — changelog.

---

### Task 1: Migration — ticket generator + applications table

**Files:**
- Create: `supabase/migrations/0005_applications.sql`

**Interfaces:**
- Consumes: `public.services (id)` from `0004_services.sql`; `public.set_updated_at()` from `0001_auth_foundation.sql`; `auth.users (id)`.
- Produces: table `public.applications`; table `public.ticket_counters`; function `public.next_ticket_number(p_prefix text) returns text`. Plans 2C/2D depend on all three.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_applications.sql` with **exactly** this content:

```sql
-- Ticketing foundation + certificate applications (spec §3).
--
-- Ticket numbers are per-prefix, per-year, sequential: APP-2026-00001. The
-- counter row is locked by the INSERT .. ON CONFLICT DO UPDATE, so concurrent
-- inserts serialize instead of colliding. Plans 2C reuse next_ticket_number()
-- for the APT-/CMP-/AST- prefixes.
--
-- The year comes from Asia/Manila, not UTC: a ticket filed at 8am Manila on
-- Jan 1 must read 2027, not 2026.
--
-- RLS: enabled with NO policies, deliberately. Neither anon nor authenticated
-- may touch these tables. The public /track lookup and the admin queue both go
-- through the service-role client after an explicit check in code, so the
-- privacy gate lives in one reviewable place rather than in a row policy.

create table public.ticket_counters (
  prefix text not null,
  year int not null,
  last_number int not null default 0,
  primary key (prefix, year)
);

create or replace function public.next_ticket_number(p_prefix text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
  v_number int;
begin
  insert into public.ticket_counters (prefix, year, last_number)
  values (p_prefix, v_year, 1)
  on conflict (prefix, year)
    do update set last_number = ticket_counters.last_number + 1
  returning last_number into v_number;

  return p_prefix || '-' || v_year::text || '-' || lpad(v_number::text, 5, '0');
end $$;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default public.next_ticket_number('APP'),
  first_name text not null,
  last_name text not null,
  address text not null,
  contact_number text not null,
  email text,
  service_id text not null references public.services (id),
  purpose text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'released', 'rejected')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  released_by uuid references auth.users (id) on delete set null,
  released_by_name text,
  released_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  -- Data Privacy Act consent, persisted (spec §3). Walk-ins consent in person.
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- /track matches ticket number + last name, case-insensitively.
create index applications_lookup_idx on public.applications (ticket_no, lower(last_name));
create index applications_created_at_idx on public.applications (created_at desc);
create index applications_status_idx on public.applications (status);

alter table public.ticket_counters enable row level security;
alter table public.applications enable row level security;

create trigger applications_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Verify the SQL is self-consistent (no DB access needed)**

Re-read the file and confirm each of these by eye:
1. `next_ticket_number` is created **before** `applications` (the column default references it).
2. The `on conflict` update clause says `ticket_counters.last_number` (bare table name — schema-qualifying it inside `ON CONFLICT DO UPDATE` is a syntax error).
3. `status` check values exactly match the four the app uses: `pending`, `approved`, `released`, `rejected`.
4. `service_id` references `public.services (id)` — the same `text` type as that table's PK.
5. `set_updated_at()` exists in `0001_auth_foundation.sql` (it does — do not redefine it).

Do NOT attempt to run this against Supabase. Justine applies migrations by hand; Task 9 is gated on it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_applications.sql
git commit -m "feat(tickets): applications table + collision-safe ticket number generator"
```

---

### Task 2: Shared types, Manila date helper, released status

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/format.ts`
- Modify: `src/features/admin/components/status-chip.tsx`

**Interfaces:**
- Produces: `toManilaDate(timestamp: string): string`; `ApplicationStatus` widened with `"released"`; types `PublicApplicationValues`, `SubmitApplicationResult`, `WalkInApplicationValues`, `ApplicationRow`, `TicketLookupResult`. Tasks 3–8 all consume these.

- [ ] **Step 1: Add the Manila date helper**

In `src/lib/format.ts`, append:

```ts
/**
 * The Asia/Manila calendar date (YYYY-MM-DD) for a UTC timestamp. Postgres
 * timestamptz values are UTC; slicing them would show the wrong day for
 * anything filed after 4pm Manila. Feed the result to formatDate().
 */
export function toManilaDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}
```

(`en-CA` formats as `YYYY-MM-DD`, which is exactly what `formatDate()` expects.)

- [ ] **Step 2: Widen ApplicationStatus and add the new types**

In `src/types/index.ts`, replace this line:

```ts
export type ApplicationStatus = "pending" | "approved" | "rejected";
```

with:

```ts
/** Spec §3 flow: pending → approved (ready for pickup) → released, or rejected. */
export type ApplicationStatus = "pending" | "approved" | "released" | "rejected";
```

Then, at the end of the file, append:

```ts
/* ── Applications flow (backend plan 2B) ─────────────────────────────── */

/** The public apply form's body. `email` is optional — "" means not given. */
export interface PublicApplicationValues {
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string;
  purpose: string;
  /** Data Privacy Act consent — must be true to submit (persisted). */
  consent: boolean;
}

/** Walk-in encoding adds the service the staff member picked in the drawer. */
export interface WalkInApplicationValues extends PublicApplicationValues {
  serviceId: string;
}

export interface SubmitApplicationResult {
  error: string | null;
  /** e.g. "APP-2026-00001" — present only on success. */
  ticketNo: string | null;
}

/** A queue row for the admin manager: flat and serializable. */
export interface ApplicationRow {
  id: string;
  ticketNo: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string | null;
  serviceId: string;
  serviceTitle: string;
  purpose: string;
  status: ApplicationStatus;
  remarks: string | null;
  reviewedByName: string | null;
  releasedByName: string | null;
  /** Manila calendar dates (YYYY-MM-DD). */
  submittedAt: string;
  reviewedAt: string | null;
  releasedAt: string | null;
  source: "online" | "walk-in";
}

/**
 * A resident-visible ticket. Normalized on purpose: plan 2C adds appointments,
 * complaints and assistance behind this same shape (complaints will omit the
 * narrative — /track shows their status only).
 */
export interface TicketLookupResult {
  ticketNo: string;
  /** Human label for the ticket kind, e.g. "Certificate Application". */
  type: string;
  serviceTitle: string;
  /** Shown on approval — "bring these when you claim". */
  requirements: string[];
  applicantName: string;
  status: ApplicationStatus;
  /** Manila calendar dates (YYYY-MM-DD). */
  submittedAt: string;
  reviewedAt: string | null;
  releasedAt: string | null;
  remarks: string | null;
}
```

- [ ] **Step 3: Add the `released` chip**

In `src/features/admin/components/status-chip.tsx`, add one entry to each map (keep the existing entries untouched):

In `LABELS`, after `approved: "Approved",`:
```ts
  released: "Released",
```

In `TONES`, after `approved: "bg-brand-100 text-brand-800",`:
```ts
  // Terminal success — a deeper amber than `approved` (there is no green token).
  released: "bg-brand-200 text-brand-800",
```

The brand scale in `src/app/globals.css` stops at `brand-800` — there is no `brand-900`. A Tailwind v4 utility naming an undeclared theme step is silently not generated, and neither typecheck nor lint catches it.

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: PASS. (`AdminStatus` includes `ApplicationStatus`, so a missing `released` key in either map is a compile error — that's the guard working.)

Run: `npm run lint`
Expected: PASS, no warnings.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/format.ts src/features/admin/components/status-chip.tsx
git commit -m "feat(tickets): application types, Manila date helper, released status chip"
```

---

### Task 3: Rate limiter + public submit action

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `src/features/services/actions.ts`
- Modify: `src/features/services/queries.ts`

**Interfaces:**
- Consumes: `createSupabaseAdminClient()` from `@/lib/supabase/admin`; `createSupabaseServerClient()` from `@/lib/supabase/server`; `resolveIcon()` from `@/lib/icon-map`; types from Task 2.
- Produces: `checkRateLimit(key: string, limit: number, windowMs: number): boolean`; `getApplyService(slug: string): Promise<ServiceRecord | null>`; `submitApplication(serviceId: string, values: PublicApplicationValues): Promise<SubmitApplicationResult>`. Tasks 4 and 5 consume these.

- [ ] **Step 1: Write the rate limiter**

Create `src/lib/rate-limit.ts`:

```ts
/**
 * Best-effort in-memory sliding-window limiter for public endpoints.
 *
 * Deliberately unsophisticated: the map lives in one serverless instance, so a
 * determined attacker spread across cold starts gets more attempts than the
 * limit suggests. It still stops naive scripted enumeration, and it costs
 * nothing. The hardening plan (spec §12 step 8) replaces this with a durable
 * store; keep the call sites, swap the body.
 */
const hits = new Map<string, number[]>();

/** True when the caller is still within budget. Records the attempt. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic sweep so a long-lived instance can't grow the map forever.
  if (hits.size > 5000) {
    for (const [entryKey, times] of hits) {
      if (times.every((at) => now - at >= windowMs)) hits.delete(entryKey);
    }
  }

  return true;
}

/** Caller IP from the proxy headers, or a shared fallback bucket. */
export async function requestIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || store.get("x-real-ip") || "unknown";
}
```

- [ ] **Step 2: Add the apply-service query**

In `src/features/services/queries.ts`, append (keep `listServices` exactly as it is):

```ts
/**
 * One service for the apply page. Returns null when the slug is unknown or the
 * service is a `danger`-toned one — those are the complaint flow (plan 2C), not
 * applications. An unavailable service still resolves; the page renders a
 * "temporarily unavailable" notice rather than a 404, which reads better to a
 * resident who followed a link.
 */
export async function getApplyService(slug: string): Promise<ServiceRecord | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, title, description, icon_name, tone, requirements_label, cta_label, requirements, department, is_available")
    .eq("id", slug)
    .maybeSingle();
  if (error || !data || data.tone !== "primary") {
    if (error) console.error("getApplyService failed:", error.message);
    return null;
  }

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    icon: resolveIcon(data.icon_name),
    tone: data.tone as ServiceRecord["tone"],
    requirementsLabel: data.requirements_label,
    requirements: data.requirements,
    ctaLabel: data.cta_label,
    isAvailable: data.is_available,
  };
}
```

- [ ] **Step 3: Write the submit action**

Create `src/features/services/actions.ts`:

```ts
"use server";

import { z } from "zod";
import type { PublicApplicationValues, SubmitApplicationResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

// Upper bounds matter here in a way they don't on the admin forms: this is an
// unauthenticated endpoint writing to unconstrained `text` columns, so every
// free-text field is capped at a length a real resident would never exceed.
const applicationSchema = z.object({
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
  purpose: z
    .string()
    .trim()
    .min(4, "Tell us what the document is for.")
    .max(500, "Please keep the purpose short."),
  consent: z.boolean().refine((value) => value === true, "Please agree to the data privacy notice."),
});

/** Generous enough for a household on one connection; tight enough to stop a script. */
const SUBMIT_LIMIT = 10;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * A resident's public application. No auth — the service-role client is used
 * because `applications` has no RLS policies at all; this action IS the gate,
 * so everything it touches is validated first and nothing is read back out.
 */
export async function submitApplication(
  serviceId: string,
  values: PublicApplicationValues,
): Promise<SubmitApplicationResult> {
  const ip = await requestIp();
  if (!checkRateLimit(`apply:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
    return {
      error: "Too many applications from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
    };
  }

  const parsed = applicationSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again.", ticketNo: null };
  }

  const admin = createSupabaseAdminClient();

  // Never trust the serviceId from the client: it must exist, be available, and
  // belong to the applications flow (primary tone — danger is the 2C complaint flow).
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, is_available, tone")
    .eq("id", serviceId)
    .maybeSingle();
  if (serviceError) return { error: "Something went wrong. Please try again.", ticketNo: null };
  if (!service || service.tone !== "primary") {
    return { error: "That service is not accepting online applications.", ticketNo: null };
  }
  if (!service.is_available) {
    return {
      error: "This service is temporarily unavailable. Please visit the barangay hall.",
      ticketNo: null,
    };
  }

  const { data, error } = await admin
    .from("applications")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      service_id: service.id,
      purpose: parsed.data.purpose,
      source: "online",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("submitApplication failed:", error?.message);
    return { error: "We could not file your application. Please try again.", ticketNo: null };
  }

  return { error: null, ticketNo: data.ticket_no };
}
```

Note: `ticket_no`, `status`, `consent_at` and `created_at` all come from column defaults — do not send them.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/features/services/actions.ts src/features/services/queries.ts
git commit -m "feat(apply): rate limiter, apply-service query, public submit action"
```

---

### Task 4: Public apply page + form + success panel

**Files:**
- Create: `src/app/(public)/services/apply/[slug]/page.tsx`
- Create: `src/features/services/components/apply-form.tsx`
- Create: `src/features/services/components/apply-unavailable.tsx`
- Modify: `src/features/services/index.ts`
- Modify: `src/features/services/components/service-card.tsx`

**Interfaces:**
- Consumes: `getApplyService(slug)` and `submitApplication(serviceId, values)` from Task 3; `PublicApplicationValues` from Task 2; `PageHero` from `@/components/sections/page-hero`; `Section`, `Card`, `Button`, `Field`, `Input`, `Textarea`, `Checkbox` from the UI kit.
- Produces: route `/services/apply/[slug]`. Task 9 drives it.

- [ ] **Step 1: Write the unavailable notice**

Create `src/features/services/components/apply-unavailable.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";

/** Shown when a service exists but the barangay has toggled it off. */
export function ApplyUnavailable({ title }: { title: string }) {
  return (
    <Section>
      <Card className="mx-auto max-w-2xl rounded-3xl p-8 text-center">
        <h2 className="mb-2 font-display text-2xl font-bold text-ink-900">
          {title} is temporarily unavailable
        </h2>
        <p className="mb-6 text-ink-600">
          Online applications for this document are paused right now. You can still apply in
          person at the barangay hall, or check back here later.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button href="/services" variant="primary">
            Back to services
          </Button>
          <Button href="/contact" variant="ghost">
            Contact the barangay
          </Button>
        </div>
      </Card>
    </Section>
  );
}
```

`Button` already renders a `next/link` when given `href` (see `src/components/ui/button.tsx`) — do not import `Link` here and do not reach for `asChild`, which this Button does not have.

- [ ] **Step 2: Write the apply form**

Create `src/features/services/components/apply-form.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import type { PublicApplicationValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { submitApplication } from "@/features/services/actions";

interface ApplyFormProps {
  serviceId: string;
  serviceTitle: string;
  requirements: string[];
}

const EMPTY: PublicApplicationValues = {
  firstName: "",
  lastName: "",
  address: "",
  contactNumber: "",
  email: "",
  purpose: "",
  consent: false,
};

/** Public application form; swaps to a ticket receipt on success. */
export function ApplyForm({ serviceId, serviceTitle, requirements }: ApplyFormProps) {
  const [values, setValues] = useState<PublicApplicationValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [ticketNo, setTicketNo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  // `isPending` only flips once React commits, so the disabled button alone
  // cannot stop two clicks landing in the same tick — that would file the
  // resident two tickets for one application. This ref closes that window.
  const submitting = useRef(false);

  const set = <K extends keyof PublicApplicationValues>(key: K, value: PublicApplicationValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitApplication(serviceId, values);
        if (result.error || !result.ticketNo) {
          setError(result.error ?? "Something went wrong. Please try again.");
          return;
        }
        setTicketNo(result.ticketNo);
      } finally {
        submitting.current = false;
      }
    });
  }

  async function copyTicket() {
    if (!ticketNo) return;
    try {
      await navigator.clipboard.writeText(ticketNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — the number is on screen to copy by hand.
    }
  }

  if (ticketNo) {
    return (
      <Card className="rounded-3xl p-8">
        <CheckCircle2 className="mb-4 h-12 w-12 text-brand-500" aria-hidden="true" />
        <h2 className="mb-2 font-display text-2xl font-bold text-ink-900">
          Application filed
        </h2>
        <p className="mb-6 text-ink-600">
          Keep this ticket number. You will need it — with your last name — to check your
          status at any time.
        </p>
        <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-100/50 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Your ticket number
          </p>
          <p className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-900">
            {ticketNo}
          </p>
          <button
            type="button"
            onClick={copyTicket}
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copied ? "Copied" : "Copy number"}
          </button>
        </div>
        <div className="mb-6 rounded-2xl border border-ink-200 bg-ink-50 p-6">
          <p className="mb-2 text-sm font-semibold text-ink-900">What happens next</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-600">
            <li>Barangay staff review your request.</li>
            <li>Once approved, your status changes to ready for pickup.</li>
            <li>Bring the requirements and a valid ID to the barangay hall to claim it.</li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/track?ticket=${encodeURIComponent(ticketNo)}`}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            Track this application
          </Link>
          <Link href="/services" className="text-sm font-semibold text-ink-600 hover:underline">
            Back to services
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {requirements.length > 0 ? (
        <Card className="rounded-3xl border-brand-200 bg-brand-100/50 p-6">
          <p className="mb-3 font-semibold text-ink-900">
            Bring these when you claim your {serviceTitle}
          </p>
          <ul className="space-y-2 text-sm text-ink-600">
            {requirements.map((requirement) => (
              <li key={requirement} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="space-y-5 rounded-3xl p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" htmlFor="apply-first-name">
            <Input
              id="apply-first-name"
              value={values.firstName}
              onChange={(event) => set("firstName", event.target.value)}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name" htmlFor="apply-last-name">
            <Input
              id="apply-last-name"
              value={values.lastName}
              onChange={(event) => set("lastName", event.target.value)}
              autoComplete="family-name"
            />
          </Field>
        </div>
        <Field label="Purok / street address" htmlFor="apply-address">
          <Input
            id="apply-address"
            placeholder="Purok 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
            autoComplete="street-address"
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact number" htmlFor="apply-contact">
            <Input
              id="apply-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
              autoComplete="tel"
            />
          </Field>
          <Field label="Email (optional)" htmlFor="apply-email">
            <Input
              id="apply-email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
              autoComplete="email"
            />
          </Field>
        </div>
        <Field label="Purpose" htmlFor="apply-purpose">
          <Textarea
            id="apply-purpose"
            rows={4}
            placeholder="e.g. Employment requirement"
            value={values.purpose}
            onChange={(event) => set("purpose", event.target.value)}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm text-ink-600">
          <Checkbox
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            I allow Barangay San Fernando to collect and process the details above for this
            request, in line with the Data Privacy Act of 2012.
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
          {isPending ? "Filing…" : "Submit application"}
        </Button>
      </Card>
    </form>
  );
}
```

- [ ] **Step 3: Write the page**

Create `src/app/(public)/services/apply/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { ApplyForm } from "@/features/services/components/apply-form";
import { ApplyUnavailable } from "@/features/services/components/apply-unavailable";
import { getApplyService } from "@/features/services/queries";

interface ApplyPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ApplyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = await getApplyService(slug);
  if (!service) return { title: "Apply" };
  return {
    title: `Apply — ${service.title}`,
    description: `File an online request for a ${service.title} from Barangay San Fernando.`,
  };
}

export default async function ApplyPage({ params }: ApplyPageProps) {
  const { slug } = await params;
  const service = await getApplyService(slug);
  if (!service) notFound();

  return (
    <>
      <PageHero title={`Apply for a ${service.title}`} description={service.description} />
      {service.isAvailable ? (
        <Section>
          <div className="mx-auto max-w-3xl">
            <ApplyForm
              serviceId={service.id}
              serviceTitle={service.title}
              requirements={service.requirements}
            />
          </div>
        </Section>
      ) : (
        <ApplyUnavailable title={service.title} />
      )}
    </>
  );
}
```

**Critical:** `service.icon` is a Lucide **component**. Pass `serviceId`, `serviceTitle` and `requirements` individually as shown — never spread `service` into `<ApplyForm>`. Passing the whole object across the client boundary throws "Only plain objects can be passed to Client Components" at runtime and typecheck will NOT catch it. (This exact bug shipped once in plan 2A.)

Check `src/components/sections/page-hero.tsx` for the real prop names before using it; match them.

- [ ] **Step 4: Link the service card CTA**

In `src/features/services/components/service-card.tsx`, the available branch currently renders a dead `<Button>`. Replace **only** that branch so primary-toned services link to their apply page. Danger-toned services (the complaint flow, plan 2C) keep the inert button.

Replace:

```tsx
        {service.isAvailable ? (
          <Button
            variant={isDanger ? "outline-danger" : "primary"}
            className="mt-6 w-full"
          >
            {service.ctaLabel}
          </Button>
        ) : (
```

with:

```tsx
        {service.isAvailable ? (
          isDanger ? (
            // The complaint flow lands in plan 2C; the button stays inert until then.
            <Button variant="outline-danger" className="mt-6 w-full">
              {service.ctaLabel}
            </Button>
          ) : (
            <Button
              href={`/services/apply/${service.id}`}
              variant="primary"
              className="mt-6 w-full"
            >
              {service.ctaLabel}
            </Button>
          )
        ) : (
```

`Button` renders a `next/link` when given `href` — no new import, no new prop, no hand-copied classes.

- [ ] **Step 5: Update the barrel**

In `src/features/services/index.ts`, add the two new components to the existing exports, keeping page order:

```ts
export { ApplyForm } from "./components/apply-form";
export { ApplyUnavailable } from "./components/apply-unavailable";
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/services`
Expected: `200`. (Start the dev server with `npm run dev` first if it isn't running.)

Run: `curl -s http://localhost:3000/services | grep -o '/services/apply/[a-z-]*' | sort -u`
Expected: apply links for the primary services (e.g. `/services/apply/barangay-clearance`), and **no** link for `blotter-complaints`.

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/services/apply/barangay-clearance`
Expected: `200`.

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/services/apply/blotter-complaints`
Expected: `404` (danger tone is not an application).

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/services/apply/not-a-real-service`
Expected: `404`.

Do NOT submit the form yet — migration 0005 is not applied. That is Task 9.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(public)/services/apply" src/features/services/components/apply-form.tsx src/features/services/components/apply-unavailable.tsx src/features/services/index.ts src/features/services/components/service-card.tsx
git commit -m "feat(apply): public application form, ticket receipt, service card links"
```

If Step 4 required touching `src/components/ui/button.tsx`, add that file to the commit too.

---

### Task 5: Track page

**Files:**
- Create: `src/app/(public)/track/page.tsx`
- Create: `src/features/track/actions.ts`
- Create: `src/features/track/components/track-lookup.tsx`
- Create: `src/features/track/components/ticket-timeline.tsx`
- Create: `src/features/track/index.ts`

**Interfaces:**
- Consumes: `TicketLookupResult`, `ApplicationStatus` from Task 2; `toManilaDate`, `formatDate` from `@/lib/format`; `checkRateLimit`, `requestIp` from Task 3.
- Produces: `lookupTicket(ticketNo: string, lastName: string): Promise<{ error: string | null; ticket: TicketLookupResult | null }>`; route `/track`. Plan 2C extends the action to the other three ticket types.

- [ ] **Step 1: Write the lookup action**

Create `src/features/track/actions.ts`:

```ts
"use server";

import type { TicketLookupResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

export interface LookupResult {
  error: string | null;
  ticket: TicketLookupResult | null;
}

/** Ticket numbers are sequential and guessable; the last name is the privacy gate. */
const LOOKUP_LIMIT = 10;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;

/** One message for "wrong number" and "wrong name" alike — never confirm a ticket exists. */
const NOT_FOUND = "We could not find that ticket. Check the number and the last name you used.";

/**
 * Public ticket lookup. Requires the ticket number AND a matching last name
 * (spec §3) — the number alone is guessable. Rate-limited against enumeration.
 * Plan 2C: query the tickets_view union here instead and widen `type`.
 */
export async function lookupTicket(ticketNo: string, lastName: string): Promise<LookupResult> {
  const ip = await requestIp();
  if (!checkRateLimit(`track:${ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW_MS)) {
    return { error: "Too many lookups. Please wait a few minutes and try again.", ticket: null };
  }

  const ticket = ticketNo.trim().toUpperCase();
  const surname = lastName.trim();
  if (!ticket || !surname) {
    return { error: "Enter both your ticket number and last name.", ticket: null };
  }

  const admin = createSupabaseAdminClient();
  // Fetch by ticket number alone (it is unique), then match the last name here.
  // The name deliberately does NOT go into the query: `ilike` would read it as
  // a LIKE pattern, so a lone "%" — or "*", which PostgREST rewrites to "%" —
  // would match every surname and turn a guessed ticket number into a leak.
  // A plain comparison has no pattern semantics to get wrong.
  const { data, error } = await admin
    .from("applications")
    .select(
      "ticket_no, first_name, last_name, status, remarks, created_at, reviewed_at, released_at, services (title, requirements)",
    )
    .eq("ticket_no", ticket)
    .maybeSingle();

  if (error) {
    console.error("lookupTicket failed:", error.message);
    return { error: "Something went wrong. Please try again.", ticket: null };
  }
  // One message for "no such ticket" and "wrong name" alike — never confirm a
  // ticket exists to someone who cannot name its owner.
  if (!data || data.last_name.trim().toLowerCase() !== surname.toLowerCase()) {
    return { error: NOT_FOUND, ticket: null };
  }

  const service = data.services as unknown as { title: string; requirements: string[] } | null;

  return {
    error: null,
    ticket: {
      ticketNo: data.ticket_no,
      type: "Certificate Application",
      serviceTitle: service?.title ?? "Barangay document",
      requirements: service?.requirements ?? [],
      applicantName: `${data.first_name} ${data.last_name}`,
      status: data.status as TicketLookupResult["status"],
      submittedAt: toManilaDate(data.created_at),
      reviewedAt: data.reviewed_at ? toManilaDate(data.reviewed_at) : null,
      releasedAt: data.released_at ? toManilaDate(data.released_at) : null,
      remarks: data.remarks,
    },
  };
}
```

Notes: The last name is matched in JS, never in the query: PostgREST reads `ilike` values as LIKE patterns (and rewrites `*` to `%`), so a lone wildcard would match every surname. Do not select `contact_number`, `email` or `address` — the resident already knows them and returning them turns a guessed ticket number into a data leak.

- [ ] **Step 2: Write the timeline**

Create `src/features/track/components/ticket-timeline.tsx`:

```tsx
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { TicketLookupResult } from "@/types";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

interface Step {
  title: string;
  detail: string;
  date: string | null;
  state: "done" | "current" | "todo" | "failed";
}

function buildSteps(ticket: TicketLookupResult): Step[] {
  const rejected = ticket.status === "rejected";
  const reviewed = ticket.status !== "pending";
  const released = ticket.status === "released";

  return [
    {
      title: "Received",
      detail: "Your request reached the barangay office.",
      date: ticket.submittedAt,
      state: "done",
    },
    {
      title: rejected ? "Not approved" : "Reviewed",
      detail: rejected
        ? (ticket.remarks ?? "This request was not approved.")
        : reviewed
          ? "Approved — your document is ready to claim."
          : "Barangay staff are reviewing your request.",
      date: ticket.reviewedAt,
      state: rejected ? "failed" : reviewed ? "done" : "current",
    },
    ...(rejected
      ? []
      : [
          {
            title: "Released",
            detail: released
              ? "Claimed at the barangay hall."
              : "Bring a valid ID to the barangay hall to claim your document.",
            date: ticket.releasedAt,
            state: released ? ("done" as const) : ("todo" as const),
          },
        ]),
  ];
}

/** Resident-facing status timeline for a ticket. */
export function TicketTimeline({ ticket }: { ticket: TicketLookupResult }) {
  const steps = buildSteps(ticket);

  return (
    <ol className="space-y-6">
      {steps.map((step) => {
        const Icon = step.state === "failed" ? XCircle : step.state === "done" ? CheckCircle2 : Circle;
        return (
          <li key={step.title} className="flex gap-4">
            <Icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                step.state === "failed" && "text-danger",
                step.state === "done" && "text-brand-500",
                step.state === "current" && "text-brand-400",
                step.state === "todo" && "text-ink-300",
              )}
              aria-hidden="true"
            />
            <div>
              <p
                className={cn(
                  "font-semibold",
                  step.state === "todo" ? "text-ink-400" : "text-ink-900",
                )}
              >
                {step.title}
                {step.date ? (
                  <span className="ml-2 text-xs font-medium text-ink-500">
                    {formatDate(step.date)}
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-ink-600">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 3: Write the lookup form**

Create `src/features/track/components/track-lookup.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import type { TicketLookupResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { lookupTicket } from "@/features/track/actions";
import { TicketTimeline } from "./ticket-timeline";

/** Ticket-number + last-name lookup, then the status timeline. */
export function TrackLookup({ initialTicket = "" }: { initialTicket?: string }) {
  const [ticketNo, setTicketNo] = useState(initialTicket);
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketLookupResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await lookupTicket(ticketNo, lastName);
      setTicket(result.ticket);
      setError(result.error);
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Card className="rounded-3xl p-8">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <Field label="Ticket number" htmlFor="track-ticket">
            <Input
              id="track-ticket"
              placeholder="APP-2026-00001"
              value={ticketNo}
              onChange={(event) => setTicketNo(event.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="track-last-name">
            <Input
              id="track-last-name"
              placeholder="As written on your application"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
            <Search className="h-4 w-4" aria-hidden="true" />
            {isPending ? "Checking…" : "Check status"}
          </Button>
        </form>
      </Card>

      {ticket ? (
        <Card className="rounded-3xl p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            {ticket.type}
          </p>
          <h2 className="mb-1 font-display text-2xl font-bold text-ink-900">{ticket.ticketNo}</h2>
          <p className="mb-8 text-ink-600">
            {ticket.serviceTitle} · {ticket.applicantName}
          </p>
          <TicketTimeline ticket={ticket} />
          {ticket.status === "approved" && ticket.requirements.length > 0 ? (
            <div className="mt-8 rounded-2xl border border-brand-200 bg-brand-100/50 p-6">
              <p className="mb-3 text-sm font-semibold text-ink-900">Bring these when you claim</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-600">
                {ticket.requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Write the barrel and the page**

Create `src/features/track/index.ts`:

```ts
export { TrackLookup } from "./components/track-lookup";
export { TicketTimeline } from "./components/ticket-timeline";
```

Create `src/app/(public)/track/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { TrackLookup } from "@/features/track";

export const metadata: Metadata = {
  title: "Track a Request",
  description:
    "Check the status of your Barangay San Fernando application using your ticket number and last name.",
};

interface TrackPageProps {
  searchParams: Promise<{ ticket?: string }>;
}

export default async function TrackPage({ searchParams }: TrackPageProps) {
  const { ticket } = await searchParams;
  return (
    <>
      <PageHero
        title="Track Your Request"
        description="Enter the ticket number from your application together with the last name you filed it under."
      />
      <Section>
        <TrackLookup initialTicket={ticket ?? ""} />
      </Section>
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/track`
Expected: `200`.

Run: `curl -s "http://localhost:3000/track?ticket=APP-2026-00001" | grep -c "APP-2026-00001"`
Expected: at least `1` — the query param pre-fills the input.

Do NOT attempt a real lookup — migration 0005 is not applied. That is Task 9.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(public)/track" src/features/track
git commit -m "feat(track): public ticket lookup with privacy gate and status timeline"
```

---

### Task 6: Admin queue — queries and actions

**Files:**
- Create: `src/features/admin/queries/applications.ts`
- Create: `src/features/admin/actions/applications.ts`

**Interfaces:**
- Consumes: `requirePermission` from `@/lib/auth`; `recordActivity` from `@/lib/audit`; `createSupabaseAdminClient`; `toManilaDate`; `ApplicationRow`, `ApplicationReviewValues`, `WalkInApplicationValues` from Task 2.
- Produces: `listApplications(): Promise<ApplicationRow[]>`; `listApplicationServices(): Promise<{ id: string; title: string }[]>`; `reviewApplication(id, values)`, `releaseApplication(id)`, `createWalkInApplication(values)` — each `Promise<ActionResult>`. Task 7 consumes all five.

- [ ] **Step 1: Write the queries**

Create `src/features/admin/queries/applications.ts`:

```ts
import type { ApplicationRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";

/**
 * The full applications queue, newest first. Uses the service-role client
 * because `applications` has no RLS policies — callers MUST have checked
 * `requirePermission("process-applications")` first (the page does).
 */
export async function listApplications(): Promise<ApplicationRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("applications")
    .select(
      "id, ticket_no, first_name, last_name, address, contact_number, email, service_id, purpose, status, remarks, reviewed_by_name, reviewed_at, released_by_name, released_at, source, created_at, services (title)",
    )
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listApplications failed:", error.message);
    return [];
  }

  return data.map((row) => {
    const service = row.services as unknown as { title: string } | null;
    return {
      id: row.id,
      ticketNo: row.ticket_no,
      firstName: row.first_name,
      lastName: row.last_name,
      address: row.address,
      contactNumber: row.contact_number,
      email: row.email,
      serviceId: row.service_id,
      serviceTitle: service?.title ?? row.service_id,
      purpose: row.purpose,
      status: row.status as ApplicationRow["status"],
      remarks: row.remarks,
      reviewedByName: row.reviewed_by_name,
      releasedByName: row.released_by_name,
      submittedAt: toManilaDate(row.created_at),
      reviewedAt: row.reviewed_at ? toManilaDate(row.reviewed_at) : null,
      releasedAt: row.released_at ? toManilaDate(row.released_at) : null,
      source: row.source as ApplicationRow["source"],
    };
  });
}

/** Application-flow services (primary tone) for the filter and walk-in pickers. */
export async function listApplicationServices(): Promise<{ id: string; title: string }[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, title")
    .eq("tone", "primary")
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listApplicationServices failed:", error.message);
    return [];
  }
  return data;
}
```

- [ ] **Step 2: Write the actions**

Create `src/features/admin/actions/applications.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ApplicationReviewValues, WalkInApplicationValues } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

const reviewSchema = z
  .object({
    status: z.enum(["approved", "rejected"]),
    remarks: z.string().trim(),
  })
  // Spec §3: every negative decision must carry a reason the resident can read.
  .refine((value) => value.status !== "rejected" || value.remarks.length > 0, {
    error: "Remarks are required when rejecting an application.",
    path: ["remarks"],
  });

// Same field bounds as the public schema in `src/features/services/actions.ts` —
// a walk-in row and an online row must be constrained identically.
const walkInSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "Enter the applicant's first name.")
    .max(80, "First name is too long."),
  lastName: z
    .string()
    .trim()
    .min(2, "Enter the applicant's last name.")
    .max(80, "Last name is too long."),
  address: z
    .string()
    .trim()
    .min(4, "Enter the applicant's purok or address.")
    .max(200, "Address is too long."),
  contactNumber: z
    .string()
    .trim()
    .min(7, "Enter a contact number.")
    .max(30, "Contact number is too long.")
    // Digits anywhere, not consecutively: "(077) 600-0000" is the local shape.
    .refine((value) => (value.match(/\d/g) ?? []).length >= 7, "Enter a contact number."),
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([
      z.literal(""),
      z.string().email("Enter a valid email address.").max(254, "Email address is too long."),
    ]),
  ),
  purpose: z.string().trim().min(4, "Enter the purpose.").max(500, "Please keep the purpose short."),
  serviceId: z.string().trim().min(1, "Pick a document type."),
  consent: z.boolean().refine((value) => value === true, "Confirm the applicant gave consent."),
});

/** Approve or reject a pending application. */
export async function reviewApplication(
  id: string,
  values: ApplicationReviewValues,
): Promise<ActionResult> {
  const actor = await requirePermission("process-applications");
  const parsed = reviewSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid review." };
  }

  const admin = createSupabaseAdminClient();
  // Guard the transition in the WHERE clause: a stale tab must not re-review a
  // decided ticket, and two staff clicking at once must not both win.
  const { data, error } = await admin
    .from("applications")
    .update({
      status: parsed.data.status,
      remarks: parsed.data.remarks || null,
      reviewed_by: actor.id,
      reviewed_by_name: actor.fullName,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("ticket_no")
    .maybeSingle();
  if (error) return { error: "Could not save the review." };
  if (!data) return { error: "That application was already reviewed. Refresh to see its status." };

  await recordActivity(
    actor,
    parsed.data.status === "approved" ? "approved application" : "rejected application",
    "application",
    data.ticket_no,
    parsed.data.remarks || undefined,
  );
  revalidatePath("/admin/applications");
  return { error: null };
}

/** Mark an approved application as claimed at the hall. */
export async function releaseApplication(id: string): Promise<ActionResult> {
  const actor = await requirePermission("process-applications");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("applications")
    .update({
      status: "released",
      released_by: actor.id,
      released_by_name: actor.fullName,
      released_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "approved")
    .select("ticket_no")
    .maybeSingle();
  if (error) return { error: "Could not mark it released." };
  if (!data) return { error: "Only approved applications can be released. Refresh to see its status." };

  await recordActivity(actor, "released application", "application", data.ticket_no);
  revalidatePath("/admin/applications");
  return { error: null };
}

/** Encode a walk-in applicant into the same queue (spec §3: one queue, online + office). */
export async function createWalkInApplication(
  values: WalkInApplicationValues,
): Promise<ActionResult> {
  const actor = await requirePermission("process-applications");
  const parsed = walkInSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const admin = createSupabaseAdminClient();
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, tone")
    .eq("id", parsed.data.serviceId)
    .maybeSingle();
  if (serviceError) return { error: "Could not encode the application." };
  if (!service || service.tone !== "primary") return { error: "Pick a valid document type." };

  // Availability is NOT checked: a service toggled off online must still be
  // encodable at the counter — that is the point of the toggle.
  const { data, error } = await admin
    .from("applications")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      service_id: service.id,
      purpose: parsed.data.purpose,
      source: "walk-in",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("createWalkInApplication failed:", error?.message);
    return { error: "Could not encode the application." };
  }

  await recordActivity(actor, "encoded walk-in application", "application", data.ticket_no);
  revalidatePath("/admin/applications");
  return { error: null };
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

Confirm by eye that **every exported action calls `requirePermission("process-applications")` as its first statement**, before parsing or touching the DB. This is the only thing standing between a signed-in editor and the resident data — `applications` has no RLS.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/queries/applications.ts src/features/admin/actions/applications.ts
git commit -m "feat(admin): DB-backed applications queries and review/release/walk-in actions"
```

---

### Task 7: Admin queue UI + permission gating

**Files:**
- Modify: `src/features/admin/components/applications-manager.tsx` (rewrite)
- Modify: `src/features/admin/components/application-form.tsx` (rewrite)
- Modify: `src/features/admin/components/application-review-drawer.tsx` (rewrite)
- Modify: `src/app/admin/(portal)/applications/page.tsx`
- Modify: `src/types/index.ts` (`IconNavItem.permission`)
- Modify: `src/features/admin/data.ts` (nav item)
- Modify: `src/features/admin/components/admin-sidebar.tsx`
- Modify: `src/features/admin/components/admin-topbar.tsx`
- Modify: `src/features/admin/components/admin-mobile-nav.tsx`
- Modify: `src/app/admin/(portal)/layout.tsx`

**Interfaces:**
- Consumes: everything Task 6 produces; `ApplicationRow` from Task 2.
- Produces: a working `/admin/applications`. Task 9 drives it.

- [ ] **Step 1: Gate the nav by permission**

The page will bounce a user without `process-applications` — the nav link must not tease them. This mirrors the `superAdminOnly` flag added for Services Management.

In `src/types/index.ts`, extend `IconNavItem`:

```ts
export interface IconNavItem extends NavItem {
  icon: LucideIcon;
  /** Match the route exactly instead of by prefix. */
  exact?: boolean;
  /** Render only for SuperAdmins (page is SuperAdmin-gated). */
  superAdminOnly?: boolean;
  /** Render only for users holding this permission (page is permission-gated). */
  permission?: Permission;
}
```

`Permission` is declared lower in the same file. If TypeScript complains about use-before-declaration, it won't — `type`/`interface` declarations hoist. Do not reorder the file.

In `src/features/admin/data.ts`, change the Applications nav entry:

```ts
  { label: "Applications", href: "/admin/applications", icon: Inbox, permission: "process-applications" },
```

In `src/features/admin/components/admin-sidebar.tsx`, replace the `isSuperAdmin` prop with the two gating inputs and widen the filter:

```tsx
interface AdminSidebarProps {
  /** Extra classes on the aside — used to control overlay vs. fixed rendering. */
  className?: string;
  /** Gates SuperAdmin-only nav items (e.g. Services Management). */
  isSuperAdmin: boolean;
  /** Gates permission-scoped nav items. Ignored for SuperAdmins, who hold everything. */
  permissions: Permission[];
}

/** Fixed left navigation rail for the admin portal. */
export function AdminSidebar({ className, isSuperAdmin, permissions }: AdminSidebarProps) {
  const navItems = ADMIN_NAV_ITEMS.filter(
    (item) =>
      (!item.superAdminOnly || isSuperAdmin) &&
      (!item.permission || isSuperAdmin || permissions.includes(item.permission)),
  );
```

Add `import type { Permission } from "@/types";` to that file.

Thread `permissions` through exactly where `isSuperAdmin` already travels: `src/app/admin/(portal)/layout.tsx` passes `permissions={user.permissions}` to `<AdminSidebar>` and to `<AdminTopBar>`; `admin-topbar.tsx` passes it to `<AdminMobileNav>`; `admin-mobile-nav.tsx` passes it to `<AdminSidebar>`. **Read each file and follow the existing `isSuperAdmin` prop hop-for-hop** — if `AdminTopBar` already receives the whole `user` object and reads `user.isSuperAdmin`, take `user.permissions` from the same place instead of adding a prop.

- [ ] **Step 2: Rewrite the walk-in form**

Replace `src/features/admin/components/application-form.tsx` entirely:

```tsx
"use client";

import { useState } from "react";
import type { WalkInApplicationValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";

interface ApplicationFormProps {
  services: { id: string; title: string }[];
  onSubmit: (values: WalkInApplicationValues) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

/** Walk-in application encoding. Validation lives in the action; this is the fast feedback. */
export function ApplicationForm({
  services,
  onSubmit,
  onCancel,
  saving,
  error,
}: ApplicationFormProps) {
  const [values, setValues] = useState<WalkInApplicationValues>({
    firstName: "",
    lastName: "",
    address: "",
    contactNumber: "",
    email: "",
    purpose: "",
    serviceId: services[0]?.id ?? "",
    consent: false,
  });

  const set = <K extends keyof WalkInApplicationValues>(
    key: K,
    value: WalkInApplicationValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First Name" htmlFor="application-first-name">
            <Input
              id="application-first-name"
              value={values.firstName}
              onChange={(event) => set("firstName", event.target.value)}
            />
          </Field>
          <Field label="Last Name" htmlFor="application-last-name">
            <Input
              id="application-last-name"
              value={values.lastName}
              onChange={(event) => set("lastName", event.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact Number" htmlFor="application-contact">
            <Input
              id="application-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
            />
          </Field>
          <Field label="Email (optional)" htmlFor="application-email">
            <Input
              id="application-email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Address" htmlFor="application-address">
          <Input
            id="application-address"
            placeholder="Purok 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
          />
        </Field>
        <Field label="Document Type" htmlFor="application-service">
          <Select
            id="application-service"
            value={values.serviceId}
            onChange={(event) => set("serviceId", event.target.value)}
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Purpose" htmlFor="application-purpose">
          <Textarea
            id="application-purpose"
            rows={4}
            value={values.purpose}
            onChange={(event) => set("purpose", event.target.value)}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm text-ink-600">
          <Checkbox
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            The applicant consented to the barangay recording these details for this request
            (Data Privacy Act of 2012).
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Encode application"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Rewrite the review drawer**

Replace `src/features/admin/components/application-review-drawer.tsx` entirely:

```tsx
"use client";

import { useState } from "react";
import type { ApplicationReviewValues, ApplicationRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { StatusChip } from "./status-chip";

interface ApplicationReviewDrawerProps {
  record: ApplicationRow;
  onReview: (id: string, values: ApplicationReviewValues) => void;
  onRelease: (id: string) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{value}</dd>
    </div>
  );
}

/** Full submission; approve/reject a pending row, release an approved one. */
export function ApplicationReviewDrawer({
  record,
  onReview,
  onRelease,
  onCancel,
  saving,
  error,
}: ApplicationReviewDrawerProps) {
  const [remarks, setRemarks] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (status: ApplicationReviewValues["status"]) => {
    if (status === "rejected" && !remarks.trim()) {
      setLocalError("Remarks are required when rejecting an application.");
      return;
    }
    setLocalError(null);
    onReview(record.id, { status, remarks: remarks.trim() });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink-900">{record.ticketNo}</p>
          <StatusChip status={record.status} />
        </div>
        <dl className="space-y-4">
          <DetailRow label="Applicant" value={`${record.firstName} ${record.lastName}`} />
          <DetailRow label="Contact Number" value={record.contactNumber} />
          {record.email ? <DetailRow label="Email" value={record.email} /> : null}
          <DetailRow label="Address" value={record.address} />
          <DetailRow label="Document Type" value={record.serviceTitle} />
          <DetailRow label="Purpose" value={record.purpose} />
          <DetailRow label="Date Applied" value={formatDate(record.submittedAt)} />
          <DetailRow label="Filed" value={record.source === "walk-in" ? "Walk-in (encoded)" : "Online"} />
        </dl>
        {record.status === "pending" ? (
          <Field label="Remarks" htmlFor="application-remarks">
            <Textarea
              id="application-remarks"
              rows={4}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional for approval; required when rejecting."
              aria-invalid={Boolean(localError)}
            />
          </Field>
        ) : (
          <div className="rounded-2xl border border-ink-200/70 bg-ink-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Review Summary
            </p>
            <p className="mt-2 text-sm text-ink-900">{record.remarks ?? "—"}</p>
            {record.reviewedByName && record.reviewedAt ? (
              <p className="mt-2 text-sm text-ink-600">
                Reviewed by {record.reviewedByName} on {formatDate(record.reviewedAt)}
              </p>
            ) : null}
            {record.releasedByName && record.releasedAt ? (
              <p className="mt-1 text-sm text-ink-600">
                Released by {record.releasedByName} on {formatDate(record.releasedAt)}
              </p>
            ) : null}
          </div>
        )}
        {(localError ?? error) ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {localError ?? error}
          </p>
        ) : null}
      </div>
      {record.status === "pending" ? (
        <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
          <Button variant="outline-danger" onClick={() => submit("rejected")} disabled={saving}>
            Reject
          </Button>
          <Button onClick={() => submit("approved")} disabled={saving}>
            {saving ? "Saving…" : "Approve"}
          </Button>
        </div>
      ) : record.status === "approved" ? (
        <div className="flex items-center justify-between gap-3 border-t border-ink-200/70 p-6">
          <p className="text-xs text-ink-500">Ready for pickup.</p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onCancel}>
              Close
            </Button>
            <Button onClick={() => onRelease(record.id)} disabled={saving}>
              {saving ? "Saving…" : "Mark as released"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end border-t border-ink-200/70 p-6">
          <Button variant="ghost" onClick={onCancel}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the manager**

Replace `src/features/admin/components/applications-manager.tsx` entirely:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, ClipboardList, FileText, Plus } from "lucide-react";
import type { ApplicationReviewValues, ApplicationRow, WalkInApplicationValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  createWalkInApplication,
  releaseApplication,
  reviewApplication,
} from "@/features/admin/actions/applications";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { ApplicationForm } from "./application-form";
import { ApplicationReviewDrawer } from "./application-review-drawer";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

interface ApplicationsManagerProps {
  applications: ApplicationRow[];
  services: { id: string; title: string }[];
}

/**
 * Certificate application queue. Rows come from the server; every action is a
 * Server Action that revalidates the page, so the list refreshes from the DB
 * rather than from local state.
 */
export function ApplicationsManager({ applications, services }: ApplicationsManagerProps) {
  const [search, setSearch] = useState("");
  const [serviceId, setServiceId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalCount = applications.length;
  const pendingCount = applications.filter((record) => record.status === "pending").length;
  const approvedCount = applications.filter((record) => record.status === "approved").length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return applications.filter(
      (record) =>
        (query === "" ||
          `${record.firstName} ${record.lastName}`.toLowerCase().includes(query) ||
          record.ticketNo.toLowerCase().includes(query)) &&
        (serviceId === "all" || record.serviceId === serviceId) &&
        (status === "all" || record.status === status),
    );
  }, [applications, search, serviceId, status]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reviewing = reviewingId
    ? (applications.find((record) => record.id === reviewingId) ?? null)
    : null;

  const closeReview = () => {
    setReviewingId(null);
    setFormError(null);
  };

  const handleReview = (id: string, values: ApplicationReviewValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await reviewApplication(id, values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeReview();
      setToast(values.status === "approved" ? "Application approved." : "Application rejected.");
    });
  };

  const handleRelease = (id: string) => {
    setFormError(null);
    startTransition(async () => {
      const result = await releaseApplication(id);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeReview();
      setToast("Marked as released.");
    });
  };

  const handleCreate = (values: WalkInApplicationValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createWalkInApplication(values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setCreateOpen(false);
      setPage(1);
      setToast("Walk-in application encoded.");
    });
  };

  const clearFilters = () => {
    setSearch("");
    setServiceId("all");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Certificate Applications"
        description="Manage and review incoming requests for barangay certificates and clearances."
        action={
          <Button
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            New Application
          </Button>
        }
      />
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={FileText} label="Total Applications" value={totalCount} />
        <AdminStatCard
          icon={ClipboardList}
          label="Pending Review"
          value={pendingCount}
          tone={pendingCount > 0 ? "danger" : "secondary"}
        />
        <AdminStatCard
          icon={CheckCircle2}
          label="Ready for Pickup"
          value={approvedCount}
          tone="secondary"
        />
      </div>
      <Card>
        <CardHeader
          title="Application Queue"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              search={{
                value: search,
                placeholder: "Search name or ticket no…",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
              selects={[
                {
                  id: "application-service-filter",
                  label: "Document type",
                  value: serviceId,
                  options: [
                    { value: "all", label: "All Document Types" },
                    ...services.map((service) => ({ value: service.id, label: service.title })),
                  ],
                  onChange: (value) => {
                    setServiceId(value);
                    setPage(1);
                  },
                },
                {
                  id: "application-status-filter",
                  label: "Status",
                  value: status,
                  options: [
                    { value: "all", label: "All Statuses" },
                    { value: "pending", label: "Pending" },
                    { value: "approved", label: "Approved" },
                    { value: "released", label: "Released" },
                    { value: "rejected", label: "Rejected" },
                  ],
                  onChange: (value) => {
                    setStatus(value);
                    setPage(1);
                  },
                },
              ]}
            />
          }
        />
        {filtered.length === 0 ? (
          <AdminEmptyState
            message={
              applications.length === 0
                ? "No applications yet. Residents' online requests land here."
                : "No applications match your filters."
            }
            onClear={clearFilters}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th scope="col" className="px-6 py-4">Applicant</th>
                    <th scope="col" className="px-6 py-4">Document Type</th>
                    <th scope="col" className="px-6 py-4">Date Applied</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-ink-900">
                          {record.firstName} {record.lastName}
                        </p>
                        <p className="text-xs text-ink-500">
                          {record.ticketNo}
                          {record.source === "walk-in" ? " · walk-in" : ""}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-ink-600">{record.serviceTitle}</td>
                      <td className="px-6 py-4 text-ink-600">{formatDate(record.submittedAt)}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setFormError(null);
                            setReviewingId(record.id);
                          }}
                          aria-label={`Review ${record.ticketNo}`}
                          className="text-sm font-semibold text-brand-700 hover:underline"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
              className="px-6 py-4"
            />
          </>
        )}
      </Card>
      <Drawer open={reviewing !== null} onClose={closeReview} title="Application Details">
        {reviewing ? (
          <ApplicationReviewDrawer
            key={reviewing.id}
            record={reviewing}
            onReview={handleReview}
            onRelease={handleRelease}
            onCancel={closeReview}
            saving={isPending}
            error={formError}
          />
        ) : null}
      </Drawer>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New Application">
        {createOpen ? (
          <ApplicationForm
            services={services}
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            saving={isPending}
            error={formError}
          />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
```

- [ ] **Step 5: Wire the page**

Replace `src/app/admin/(portal)/applications/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { ApplicationsManager } from "@/features/admin";
import { listApplications, listApplicationServices } from "@/features/admin/queries/applications";

export const metadata: Metadata = {
  title: "Applications",
};

export default async function AdminApplicationsPage() {
  await requirePermission("process-applications");
  const [applications, services] = await Promise.all([
    listApplications(),
    listApplicationServices(),
  ]);
  return <ApplicationsManager applications={applications} services={services} />;
}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

Run: `npm run build`
Expected: PASS. `/admin/applications` and `/services/apply/[slug]` will be listed as dynamic (ƒ) — that is correct; they read per-request data.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/components/applications-manager.tsx src/features/admin/components/application-form.tsx src/features/admin/components/application-review-drawer.tsx "src/app/admin/(portal)/applications/page.tsx" "src/app/admin/(portal)/layout.tsx" src/features/admin/components/admin-sidebar.tsx src/features/admin/components/admin-topbar.tsx src/features/admin/components/admin-mobile-nav.tsx src/features/admin/data.ts src/types/index.ts
git commit -m "feat(admin): DB-backed applications queue with release step and permission-gated nav"
```

---

### Task 8: Dead-code cleanup + docs

**Files:**
- Modify: `src/features/admin/data.ts`
- Modify: `src/types/index.ts`
- Modify: `docs/BACKEND_HANDOFF.md`

**Interfaces:**
- Consumes: nothing. Produces: nothing. This task only removes code the DB now owns.

- [ ] **Step 1: Delete the application mocks**

In `src/features/admin/data.ts`, delete:
- `CERTIFICATE_SERVICE_IDS`, `CERTIFICATE_SERVICES`, `certificateTitle()`
- `ADMIN_APPLICATIONS` (the whole array)
- the now-unused `AdminApplicationRecord` import

In `src/types/index.ts`, delete `AdminApplicationRecord` and `ApplicationFormValues` (both are replaced by `ApplicationRow` / `WalkInApplicationValues`). **Keep `ApplicationReviewValues`** — the actions and drawer use it.

- [ ] **Step 2: Delete the plan-2A orphans**

The 2A review flagged these as dead once the services catalog moved to the DB. They are unreferenced now; remove them in the same sweep:
- `src/features/admin/data.ts`: `ADMIN_SERVICES`, `MOCK_SERVICES` (and any import left unused)
- `src/types/index.ts`: `AdminServiceRecord`

**Verify before deleting each one:**

```bash
grep -rn "ADMIN_SERVICES\|MOCK_SERVICES\|AdminServiceRecord\|ADMIN_APPLICATIONS\|AdminApplicationRecord\|ApplicationFormValues\|CERTIFICATE_SERVICES\|certificateTitle" src/
```

Expected after the deletions: **no output**. If a symbol still has a live consumer, leave it and say so in your report — do not break a caller to satisfy this task.

- [ ] **Step 3: Update the handoff doc**

In `docs/BACKEND_HANDOFF.md`, add a changelog entry in the same shape as the existing ones (read them first and match the format exactly). Cover: the `applications` table and `next_ticket_number()`; `/services/apply/[slug]`; `/track`; the DB-backed admin queue with approve → release / reject and walk-in encoding; the tone-based routing rule (primary = application, danger = complaint in 2C); and the note that the in-memory rate limiter is a placeholder for the hardening plan.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all three PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/data.ts src/types/index.ts docs/BACKEND_HANDOFF.md
git commit -m "chore(admin): drop application + service mocks now owned by the DB; document 2B"
```

---

### Task 9: Runtime sweep

**BLOCKED until Justine applies `supabase/migrations/0005_applications.sql` to the live Supabase project.** Do not start this task before then; do not attempt to apply it yourself.

**Files:** none (verification only).

- [ ] **Step 1: Set up the browser driver**

Follow `.claude/skills/verify/SKILL.md`: `npm i playwright-core` in the session scratchpad, launch system Chrome headless via `executablePath`.

- [ ] **Step 2: Drive the resident path**

1. `/services` renders; a primary service's CTA links to `/services/apply/<slug>`.
2. Submit `/services/apply/barangay-clearance` with a test applicant (**use an obviously-fake last name you can delete afterwards, e.g. `Tester-Sweep`**). Expect a ticket number matching `/^APP-\d{4}-\d{5}$/`.
3. Submit with the consent box unticked → the DPA error appears, nothing is filed.
4. `/track` with the ticket + correct last name → timeline shows "Received".
5. `/track` with the ticket + **wrong** last name → the not-found message, and **no applicant details leak**.

- [ ] **Step 3: Drive the staff path**

6. Sign in, open `/admin/applications` → the test ticket is in the queue.
7. Reject a second test ticket with empty remarks → blocked with the remarks error.
8. Approve the first ticket → chip flips to Approved; `/track` now shows "Approved — ready to claim" plus the requirements list.
9. "Mark as released" → chip flips to Released; `/track` shows Released.
10. Encode a walk-in → new ticket appears, tagged `walk-in`, status Pending.
11. Publishing Activity (`/admin`) shows the approve/release/encode entries attributed to the signed-in user.
12. A user **without** `process-applications`: no Applications link in the sidebar, and visiting `/admin/applications` directly redirects to `/admin`.

- [ ] **Step 4: Clean up test data**

Delete every sweep-created application row and its audit entries. Delete any temp `@brgysf-test.ph` account created for step 12.

**Do not touch Justine's own data.** She tests the live admin herself; check the audit log for her activity before assuming a row is yours. Leave `blotter-complaints` disabled — that is her setting, not a bug.

- [ ] **Step 5: Report**

Report pass/fail per numbered check with screenshots. Do not commit anything in this task.

---

## Carried forward (found by the final whole-branch review, deliberately not fixed here)

1. **`listApplications()` is unbounded.** It selects the whole table and passes every row to
   the `"use client"` manager, which paginates client-side at 6. That was right for the
   9-row mock it replaced; it is now the first unbounded table rendered this way. At ~200
   certificates/month that is ~2,400 rows/year of resident PII in the RSC payload on every
   `/admin/applications` load, growing forever. Not a leak (staff are authorized) and fine
   for month one, but it needs server-side pagination before the archive grows. **2C should
   not copy this shape for its three queues.**
2. **Rate-limit thresholds vs. Philippine CGNAT.** `apply:${ip}` at 10/hour and
   `track:${ip}` at 10/10min assume one IP ≈ one household. Globe/Smart mobile CGNAT puts
   thousands of subscribers behind a single public IP, and that is how most residents here
   will reach the site. The in-memory store currently masks this (each instance counts
   separately) — it will start biting exactly when the hardening plan makes the store
   durable. That plan must revisit the **thresholds**, not just the storage.

## Handoff to plan 2C

2C mirrors this structure for appointments, complaints and assistance:
- Reuse `next_ticket_number('APT'|'CMP'|'AST')` — the counter table is already generic.
- Add the three tables with the same RLS-with-no-policies posture.
- Introduce `tickets_view` and swap `lookupTicket`'s query body for it; widen `TicketLookupResult["type"]`.
- Route `tone === "danger"` services to the complaint flow and un-inert that CTA in `service-card.tsx`.
- Complaints show **status only** on `/track` — never the narrative or the respondent.
