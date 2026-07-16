# Services Catalog DB + Management — Implementation Plan (Ticketing Plan 2A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public services directory database-backed, with SuperAdmin management of each service's availability (on/off) and requirements, and a "temporarily unavailable" state on the public apply button.

**Architecture:** New Supabase `services` table (seeded with the 4 real services), a server-side `iconName → LucideIcon` map (the DB stores an icon name string; the frontend resolves it), a public read query feeding the existing `ServiceCard`, and a SuperAdmin-gated Server Action wiring the existing `ServicesManager`/`ServiceForm` to real saves.

**Tech Stack:** Next.js 16 App Router, React 19, TS strict, Supabase (`@supabase/ssr` + service-role admin client), Zod v4, Tailwind v4 tokens, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-15-backend-integration-design.md` §3 (service catalog manager: availability toggle + editable requirements, SuperAdmin-only). This is the foundation for the Applications apply/track flow (Plan 2B), which will FK `applications.service_id → services.id`.

## Global Constraints

- **No test framework** (CLAUDE.md). Per-task verification = `npm run typecheck` + `npm run lint` + `npm run build`. Runtime drive happens in the final task against the live Supabase staging project (dev server usually already at http://localhost:3000).
- TypeScript strict; path alias `@/*` → `src/*`; shared shapes in `src/types/index.ts`.
- Design tokens only (`brand-*`, `ink-*`, `danger*`); no raw hex, no blue tokens. Space Grotesk = `font-display`.
- Identity: "San Fernando", "Municipal", area code (077); any "Sampaguita" is a regression.
- **Icon caveat** (CLAUDE.md): data carries `icon: LucideIcon`. The DB stores an icon **name string**; a frontend map resolves it. Never store components.
- Server Components by default; fetches in server components/actions, never client. Service management is **SuperAdmin-only** (spec §3) — actions call `requireSuperAdmin()`; the page also gates with it.
- `services.id` doubles as the URL slug and is the stable FK target for Plan 2B — do not change it after seeding.
- Existing reusable pieces: `Service`/`AdminServiceRecord`/`ServiceFormValues` in `@/types`; `ServiceCard` (`src/features/services/components/service-card.tsx`); `ServicesManager`/`ServiceForm` under `src/features/admin/components/`; `createSupabaseServerClient`/`createSupabaseAdminClient`; `requireSuperAdmin` (`@/lib/auth`); `recordActivity` (`@/lib/audit`); `formatDate` (`@/lib/format`).
- Commit after every task. Never commit `.env.local`.

---

### Task 1: Migration 0004 — services table, seed, RLS

**Files:**
- Create: `supabase/migrations/0004_services.sql`

**Interfaces:**
- Produces the `public.services` table with columns: `id text pk`, `title text`, `description text`, `icon_name text`, `tone text` (`primary|danger`), `requirements_label text`, `cta_label text`, `requirements text[]`, `department text`, `is_available boolean`, `sort_order int`, `updated_at timestamptz`. Later tasks read/write these exact names.

(0003 was the last applied migration, so this is 0004. It reuses the `public.set_updated_at()` trigger function created in migration 0001.)

- [ ] **Step 1: Write `supabase/migrations/0004_services.sql`**

```sql
-- Public services catalog. id doubles as the URL slug and is the FK target
-- for applications (ticketing plan 2B). icon_name is resolved to a component
-- on the frontend (never store components). Writes go through the service-role
-- client after a SuperAdmin check in code; anon may only read.

create table public.services (
  id text primary key,
  title text not null,
  description text not null,
  icon_name text not null,
  tone text not null default 'primary' check (tone in ('primary', 'danger')),
  requirements_label text not null,
  cta_label text not null,
  requirements text[] not null default '{}',
  department text not null,
  is_available boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create index services_sort_order_idx on public.services (sort_order);

alter table public.services enable row level security;

create policy "services readable by anyone"
  on public.services for select using (true);

create trigger services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

insert into public.services
  (id, title, description, icon_name, tone, requirements_label, cta_label, requirements, department, sort_order)
values
  ('barangay-clearance', 'Barangay Clearance',
   'An official document required for various transactions such as employment, business permits, and legal identification.',
   'shield-check', 'primary', 'View Requirements', 'Apply Online',
   array['Latest Community Tax Certificate (Cedula)', 'Recent 2x2 colored ID picture (white background)', 'Application fee: ₱50.00'],
   'Office of the Barangay Secretary', 1),
  ('business-permit', 'Business Permit Recommendation',
   'Necessary for local entrepreneurs to operate legally within the barangay jurisdiction, ensuring compliance with local zoning.',
   'store', 'primary', 'View Requirements', 'Apply Online',
   array['DTI / SEC Registration Papers', 'Contract of Lease or Land Title', 'Locational Clearance'],
   'Office of the Barangay Treasurer', 2),
  ('certificate-of-indigency', 'Certificate of Indigency',
   'Provided to residents needing social welfare assistance, medical aid, or scholarship applications.',
   'heart-handshake', 'primary', 'View Requirements', 'Apply Online',
   array['Voter''s ID or Certification', 'Affidavit of Low Income', 'Referral from DSWD (if applicable)'],
   'Barangay Social Welfare Desk', 3),
  ('blotter-complaints', 'Blotter & Complaints',
   'For reporting neighborhood disputes, peace and order issues, or filing formal grievances for mediation.',
   'gavel', 'danger', 'View Process', 'File Incident Report',
   array['Personal appearance of the complainant', 'Valid Government ID', 'Incident narrative and supporting evidence'],
   'Lupong Tagapamayapa', 4);
```

- [ ] **Step 2: Commit** (application to the live DB is a HUMAN step in Task 6 — file only here)

```bash
git add supabase/migrations/0004_services.sql
git commit -m "feat(db): services catalog table with seed + RLS"
```

---

### Task 2: ServiceRecord type + icon-name map

**Files:**
- Modify: `src/types/index.ts` (append after the `Service` interface region)
- Create: `src/lib/icon-map.ts`

**Interfaces:**
- Produces: `interface ServiceRecord extends Service { isAvailable: boolean }` in `@/types`; `resolveIcon(name: string): LucideIcon` from `@/lib/icon-map`. Tasks 3–5 consume both.

- [ ] **Step 1: Add `ServiceRecord` to `src/types/index.ts`** — directly after the existing `Service` interface (around line 69):

```ts
/** A service row as stored in the DB and rendered publicly. `id` is the slug. */
export interface ServiceRecord extends Service {
  isAvailable: boolean;
}
```

- [ ] **Step 2: Create `src/lib/icon-map.ts`**

```ts
import {
  Gavel,
  HeartHandshake,
  ShieldCheck,
  Store,
  FileText,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps stored icon-name strings to Lucide components. The DB (and any future
 * API) stores names, never components — resolve them here on the frontend.
 * Extend this map as new services introduce new icons.
 */
const ICONS: Record<string, LucideIcon> = {
  "shield-check": ShieldCheck,
  store: Store,
  "heart-handshake": HeartHandshake,
  gavel: Gavel,
  "file-text": FileText,
};

/** Resolve an icon name to a component, falling back to a neutral document icon. */
export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? FileText;
}
```

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` && `npm run lint` — expected clean.

```bash
git add src/types/index.ts src/lib/icon-map.ts
git commit -m "feat(services): ServiceRecord type + icon-name resolver"
```

---

### Task 3: Public services read from the DB + availability gating

**Files:**
- Create: `src/features/services/queries.ts`
- Modify: `src/features/services/components/services-grid.tsx`
- Modify: `src/features/services/components/service-card.tsx`

**Interfaces:**
- Consumes: `ServiceRecord`, `resolveIcon`, `createSupabaseServerClient`.
- Produces: `listServices(): Promise<ServiceRecord[]>` from `@/features/services/queries`; `ServiceCard` gains an `isAvailable` behavior driven by the passed record.

- [ ] **Step 1: Create `src/features/services/queries.ts`**

```ts
import type { ServiceRecord } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveIcon } from "@/lib/icon-map";

/** All services for the public directory, ordered for display. */
export async function listServices(): Promise<ServiceRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, title, description, icon_name, tone, requirements_label, cta_label, requirements, department, is_available")
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listServices failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    icon: resolveIcon(row.icon_name),
    tone: row.tone as ServiceRecord["tone"],
    requirementsLabel: row.requirements_label,
    requirements: row.requirements,
    ctaLabel: row.cta_label,
    isAvailable: row.is_available,
  }));
}
```

- [ ] **Step 2: Update `service-card.tsx`** to take a `ServiceRecord` and disable the CTA when unavailable. Replace the file with:

```tsx
import { CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import type { ServiceRecord } from "@/types";

interface ServiceCardProps {
  service: ServiceRecord;
}

/** Service directory card with an expandable requirements checklist. */
export function ServiceCard({ service }: ServiceCardProps) {
  const isDanger = service.tone === "danger";
  const RequirementIcon = isDanger ? Info : CheckCircle2;

  return (
    <Card interactive className="flex h-full flex-col rounded-3xl p-8">
      <IconCircle icon={service.icon} tone={isDanger ? "danger" : "primary"} className="mb-4" />
      <h3 className="mb-2 text-xl font-semibold">{service.title}</h3>
      <p className="mb-8 flex-grow text-ink-600">{service.description}</p>
      <Accordion
        className="border-t border-ink-200 pt-4"
        trigger={<span>{service.requirementsLabel}</span>}
        triggerClassName={isDanger ? "text-danger" : "text-ink-900"}
      >
        <ul className="space-y-2 text-sm text-ink-600">
          {service.requirements.map((requirement) => (
            <li key={requirement} className="flex items-start gap-2">
              <RequirementIcon
                className={cn("mt-0.5 h-4 w-4 shrink-0", isDanger ? "text-danger" : "text-brand-500")}
                aria-hidden="true"
              />
              <span>{requirement}</span>
            </li>
          ))}
        </ul>
        {service.isAvailable ? (
          <Button variant={isDanger ? "outline-danger" : "primary"} className="mt-6 w-full">
            {service.ctaLabel}
          </Button>
        ) : (
          <div className="mt-6">
            <Button variant={isDanger ? "outline-danger" : "primary"} className="w-full" disabled>
              {service.ctaLabel}
            </Button>
            <p className="mt-2 text-center text-xs font-medium text-ink-500">
              Temporarily unavailable — please visit the barangay hall.
            </p>
          </div>
        )}
      </Accordion>
    </Card>
  );
}
```

(The apply button still does not navigate anywhere — the apply form is Plan 2B. Task 3 only adds the availability state.)

- [ ] **Step 3: Make `services-grid.tsx` read from the DB.** Replace its data source and make it async. Change the imports + signature; keep the emergency-assistance block exactly as-is:

```tsx
import { PhoneCall, Stethoscope, TriangleAlert } from "lucide-react";
import { Section } from "@/components/ui/section";
import { ServiceCard } from "@/features/services/components/service-card";
import { EMERGENCY_ASSISTANCE } from "@/features/services/data";
import { listServices } from "@/features/services/queries";

/** Directory grid of citizen services plus the emergency assistance card. */
export async function ServicesGrid() {
  const services = await listServices();
  return (
    <Section>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
        {/* …keep the existing EMERGENCY_ASSISTANCE block unchanged… */}
      </div>
    </Section>
  );
}
```

(Keep the emergency-assistance `<div>` block from the current file verbatim after the map. `SERVICES` is no longer imported here; leave `SERVICES` in `data.ts` for now — it is still the source of the seed and harmless.)

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck` && `npm run lint` && `npm run build` — the `/services` route makes `ServicesGrid` a Server Component that awaits a query, so `/services` will become dynamic (`ƒ`); that is expected and acceptable for this route. Confirm nothing else regresses.

```bash
git add src/features/services/queries.ts src/features/services/components/services-grid.tsx src/features/services/components/service-card.tsx
git commit -m "feat(services): public directory reads from DB with availability gating"
```

---

### Task 4: Admin service catalog query + update action

**Files:**
- Create: `src/features/admin/queries/services.ts`
- Create: `src/features/admin/actions/services.ts`

**Interfaces:**
- Consumes: `AdminServiceRecord`, `ServiceFormValues` (`@/types`); `resolveIcon`; `requireSuperAdmin`; `recordActivity`; `createSupabaseServerClient`/`createSupabaseAdminClient`.
- Produces: `listServiceCatalog(): Promise<AdminServiceRecord[]>` from `@/features/admin/queries/services`; from `@/features/admin/actions/services`: `updateService(id: string, input: ServiceFormValues): Promise<ActionResult>` and `setServiceAvailable(id: string, isAvailable: boolean): Promise<ActionResult>`, with `interface ActionResult { error: string | null }`.

- [ ] **Step 1: Create `src/features/admin/queries/services.ts`**

```ts
import type { AdminServiceRecord } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveIcon } from "@/lib/icon-map";

/** Services for the admin manager, mapped into the existing AdminServiceRecord shape. */
export async function listServiceCatalog(): Promise<AdminServiceRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, title, description, icon_name, tone, requirements_label, cta_label, requirements, department, is_available, updated_at")
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listServiceCatalog failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    service: {
      id: row.id,
      title: row.title,
      description: row.description,
      icon: resolveIcon(row.icon_name),
      tone: row.tone as AdminServiceRecord["service"]["tone"],
      requirementsLabel: row.requirements_label,
      requirements: row.requirements,
      ctaLabel: row.cta_label,
    },
    department: row.department,
    status: row.is_available ? "active" : "inactive",
    updatedAt: row.updated_at,
  }));
}
```

- [ ] **Step 2: Create `src/features/admin/actions/services.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ServiceFormValues } from "@/types";
import { requireSuperAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

const serviceSchema = z.object({
  title: z.string().trim().min(2, "Title is too short."),
  description: z.string().trim().min(2, "Description is too short."),
  department: z.string().trim().min(2, "Department is required."),
  requirements: z.string(),
  status: z.enum(["active", "inactive"]),
});

/** Update a service's editable fields (title/description/department/requirements/availability). */
export async function updateService(id: string, input: ServiceFormValues): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const requirements = parsed.data.requirements
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("services")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      department: parsed.data.department,
      requirements,
      is_available: parsed.data.status === "active",
    })
    .eq("id", id);
  if (error) return { error: "Could not save the service." };

  await recordActivity(actor, "updated service", "service", id, parsed.data.title);
  revalidatePath("/admin/services");
  revalidatePath("/services");
  return { error: null };
}

/** Toggle availability directly (the on/off switch), without opening the editor. */
export async function setServiceAvailable(id: string, isAvailable: boolean): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("services").update({ is_available: isAvailable }).eq("id", id);
  if (error) return { error: "Could not update availability." };

  await recordActivity(actor, isAvailable ? "enabled service" : "disabled service", "service", id);
  revalidatePath("/admin/services");
  revalidatePath("/services");
  return { error: null };
}
```

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` && `npm run lint` — expected clean.

```bash
git add src/features/admin/queries/services.ts src/features/admin/actions/services.ts
git commit -m "feat(admin): service catalog query + update/availability actions"
```

---

### Task 5: Wire ServicesManager + ServiceForm + page to the DB

**Files:**
- Modify: `src/app/admin/(portal)/services/page.tsx`
- Modify: `src/features/admin/components/services-manager.tsx`
- Modify: `src/features/admin/components/service-form.tsx`

**Interfaces:**
- Consumes: `listServiceCatalog`, `updateService`, `setServiceAvailable` (Task 4); `requireSuperAdmin`.
- Produces: `ServicesManager({ services }: { services: AdminServiceRecord[] })`; `ServiceForm` calls the real `updateService`.

- [ ] **Step 1: `services/page.tsx` — gate to SuperAdmin, fetch from DB.** Read the current file, keep its metadata, and make it:

```tsx
import { requireSuperAdmin } from "@/lib/auth";
import { listServiceCatalog } from "@/features/admin/queries/services";
import { ServicesManager } from "@/features/admin/components/services-manager";

export default async function AdminServicesPage() {
  await requireSuperAdmin();
  const services = await listServiceCatalog();
  return <ServicesManager services={services} />;
}
```

(Keep any existing `metadata` export. `requireSuperAdmin` bounces non-SuperAdmins to `/admin`, matching spec §3.)

- [ ] **Step 2: `services-manager.tsx` — take `services` prop, drop the mock import, remove the create button, add a real availability toggle per row, and make edit-save go through the action.** Read the current file first. Make these changes:
  - Change the signature to `export function ServicesManager({ services }: { services: AdminServiceRecord[] })` and delete `import { ADMIN_SERVICES } from "@/features/admin/data";`. Replace every `ADMIN_SERVICES` reference with `services`.
  - Remove the `AdminPageHeader` `action` (the "Add New Service" button) and the `openCreate` handler — creating services is out of scope for 2A (the catalog is seeded; SuperAdmin edits existing services). Keep the header title/description.
  - Wrap row actions with a `useTransition`; add an **Enable/Disable** button in the Actions cell calling `setServiceAvailable(record.id, record.status !== "active")` and surfacing the result via the existing `toast` (`setToast(result.error ?? "Availability updated.")`).
  - `handleSaved` no longer fakes: the drawer's `ServiceForm` now performs the real save and calls `onSaved()` on success; keep `handleSaved` closing the drawer and toasting "Service updated." Remove the "demo only" toast string.

- [ ] **Step 3: `service-form.tsx` — perform the real update.** Read the current file. It already renders `ServiceFormValues` fields (title, description, department, requirements textarea, status). Change its submit path so that instead of a `setTimeout` fake it:
  - accepts the same props it has now plus the record id (it receives `record: AdminServiceRecord | null`; use `record.id`),
  - on submit calls `await updateService(record.id, values)` inside a `useTransition`,
  - on `{ error }` truthy shows the error inline; on success calls `onSaved()`.
  - Since create is out of scope, when `record` is null the form should not render a create path — but `ServicesManager` no longer opens create, so `record` is always non-null here. Keep a guard: if `!record`, render nothing.
  Follow the existing drawer-form patterns (the account/team forms) for the `useTransition` + inline error shape.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck` && `npm run lint` && `npm run build` — expected clean.

```bash
git add "src/app/admin/(portal)/services/page.tsx" src/features/admin/components/services-manager.tsx src/features/admin/components/service-form.tsx
git commit -m "feat(admin): services manager reads DB, real availability toggle + edit save"
```

---

### Task 6: Apply migration + runtime verification

**Files:** none new — verification only.

- [ ] **Step 1 (HUMAN, coordinated by controller): apply migration 0004.** Run its full contents in the Supabase SQL editor (staging). Expected: "Success. No rows returned." The controller confirms via a REST read that `services` returns the 4 seeded rows before driving the sweep.

- [ ] **Step 2: Full gate.** `npm run typecheck` && `npm run lint` && `npm run build` — all clean.

- [ ] **Step 3: Runtime drive** (controller, playwright-core against the live project; SuperAdmin + non-SuperAdmin temp users created via the admin API and cleaned up after):
  1. Public `/services` renders the 4 seeded services from the DB (titles/requirements match).
  2. As SuperAdmin, `/admin/services` lists the 4 services; toggling one to Disabled succeeds (toast).
  3. Public `/services` now shows that service's apply button disabled with "Temporarily unavailable"; re-enable restores it.
  4. Editing a service's requirements in the drawer saves and reflects on the public page after revalidation.
  5. A non-SuperAdmin visiting `/admin/services` is bounced to `/admin`.
  6. Public site otherwise unaffected (`/`, `/about`); no "Sampaguita".

- [ ] **Step 4: Update handoff doc + commit.** Append a short note to the changelog block atop `docs/BACKEND_HANDOFF.md`: the services directory is now DB-backed (migration 0004 `services` table), SuperAdmins manage availability + requirements at `/admin/services`, and the public apply button shows a "temporarily unavailable" state — the foundation for the Applications apply/track flow (Plan 2B).

```bash
git add docs/BACKEND_HANDOFF.md
git commit -m "docs: record services catalog DB in backend handoff"
```

---

## Self-review notes

- **Spec coverage (§3 service catalog):** availability on/off ✅ (T1 column, T4 `setServiceAvailable`, T5 toggle); editable requirements ✅ (T4 `updateService`, T5 form); SuperAdmin-only ✅ (T4 actions + T5 page `requireSuperAdmin`); public "temporarily unavailable" ✅ (T3 card); DB-backed catalog + stable slug/FK target for 2B ✅ (T1). Icon-as-name-string ✅ (T2 map).
- **Type consistency:** `ServiceRecord` (T2) used by T3; `AdminServiceRecord`/`ServiceFormValues` reused from existing types by T4/T5; `ActionResult` matches the shape used elsewhere; column names in T1 match every select/update in T3–T4.
- **Deliberately deferred:** creating brand-new services (catalog is seeded; edit-only for now), icon/tone editing in the form, and the apply button's navigation target (Plan 2B builds the apply form + `/services/apply/[slug]`).
- **Migration numbering:** `0004` follows the applied `0003`; reuses the `set_updated_at()` trigger from `0001`.
