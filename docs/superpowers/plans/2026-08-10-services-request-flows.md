# Assistance and Appointments on the Services page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Social Services Assistance and Set an Appointment in the `/services` directory, and close the quality gap between those two forms and the apply flow beside them.

**Architecture:** One additive migration (`0035`) adds a CHECK-constrained `services.flow` column and two `assistance_categories` content columns. Routing moves off `tone` (visual) onto `flow` (behavioural) via a pure, exhaustively-typed `serviceHref`. The two forms then gain guidance cards, a weekend rule, purpose presets, a server-rendered demand hint, per-category requirements, and submission-time attachments that reuse the existing `ticket-media` bucket and `ticket_updates.attachments` column.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (Postgres + Storage), zod v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-10-services-request-flows-design.md`

## Global Constraints

- **Migration `0035` must be applied to staging and production BEFORE any Stage 1+ code is deployed.** `listServices` selects `flow`; a missing column fails at runtime, not at build. The owner applies migrations manually — never assume one is applied without explicit confirmation.
- **`0035` is folded into `supabase/baseline/0000_baseline_2026-07-23.sql` in the same task that creates it.** The baseline is contiguous through `0034`; keep the streak.
- **Do not retro-edit migrations `0004`, `0007`, `0009`, `0021`.** They are historical records.
- **Tailwind tokens only**: `brand-*`, `ink-*`, `danger*`. No blue tokens. No `brand-900` (does not exist).
- **Copy rules**: "Sitio" never "Purok"; "San Fernando" never "Sampaguita"; San Nicolas is a **municipality**; area code (077).
- **Vitest covers pure functions only.** No jsdom, no React renderer, no component tests.
- **Every `startTransition(async …)` wraps its action call in `try`/`catch`** with a user-visible error. Never wrap `signIn`/`signOut` — not relevant here, but the rule stands.
- **Error banners use `<InlineAlert>`** (dismissible), except field-level validation, which stays plain `role="alert"` text.
- **CLAUDE.md is updated in the same session as the code** — each Stage ends with a docs task. Not optional, not deferred.
- **`npm run typecheck` and `npm run lint` must pass before every commit.**

---

# Stage 1 — Services page placement

Independently shippable: at the end of Stage 1 both flows appear in the directory and route correctly, with no changes to either form.

---

### Task 1: Migration 0035 and baseline fold-in

**Files:**
- Create: `supabase/migrations/0035_service_flow_and_category_guidance.sql`
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql`

**Interfaces:**
- Produces: `services.flow` (text, not null, default `'apply'`, CHECK in `apply|complaint|assistance|appointment`); `assistance_categories.description` (text, not null, default `''`); `assistance_categories.requirements` (text[], not null, default `'{}'`); two new `services` rows with ids `social-services-assistance` and `set-an-appointment`.

The `assistance_categories` columns land here even though nothing reads them until Stage 3. One manual apply is less error-prone for the owner than two, and both columns are `not null default`, so they are inert until Stage 3 wires them.

- [ ] **Step 1: Write the migration**

```sql
-- 0035_service_flow_and_category_guidance.sql
--
-- Two independent additions, one apply:
--
-- 1. services.flow — routing for a service card was inferred from `tone`
--    ('danger' meant the complaint form, anything else meant the apply form),
--    which conflated a visual property with a behavioural one and had no room
--    for a third destination. `flow` names the destination; `tone` reverts to
--    meaning only what it looks like.
--
--    It names a flow rather than storing an href on purpose: a free-text URL
--    column would let a staff member point a card at a typo, an external site,
--    or a dead route. A CHECK-constrained name can only ever be one of four
--    values the code already knows how to route.
--
--    `not null default` also keeps it out of the `text || null` = NULL trap
--    that made every purpose-less application vanish from admin global search
--    in 0033. search_admin_global's services branch selects title/department
--    only, so it needs no redefinition here.
--
-- 2. assistance_categories.description / .requirements — per-category "what to
--    prepare" guidance on the public assistance form. Both default empty, so
--    every existing category stays valid with no backfill and the form looks
--    exactly as it does today until staff fill them in.

alter table public.services
  add column flow text not null default 'apply'
    check (flow in ('apply', 'complaint', 'assistance', 'appointment'));

update public.services set flow = 'complaint' where tone = 'danger';

alter table public.assistance_categories
  add column description text not null default '',
  add column requirements text[] not null default '{}';

-- The two request flows join the directory. requirements_label and cta_label
-- match labelsForFlow() in src/features/admin/actions/services.ts exactly, so a
-- SuperAdmin save is a no-op rather than a rewrite.
insert into public.services
  (id, title, description, icon_name, tone, requirements_label, cta_label,
   requirements, department, sort_order, flow)
values
  ('social-services-assistance', 'Social Services Assistance',
   'Medical, burial, financial and calamity aid for residents in need. The Barangay Social Welfare Desk reviews every request.',
   'hand-heart', 'primary', 'What to prepare', 'Request Now',
   array['Valid ID of the person needing help',
         'Barangay Certificate of Indigency, if you already have one',
         'Documents supporting your case (medical abstract, death certificate, damage photos)'],
   'Barangay Social Welfare Desk', 5, 'assistance'),
  ('set-an-appointment', 'Set an Appointment',
   'Reserve a time to meet an official or follow up on a transaction, so you are not waiting at the hall.',
   'calendar-days', 'primary', 'How it works', 'Book Now',
   array['Pick a weekday — the hall is closed on weekends',
         'Tell us what the visit is about',
         'Staff confirm your slot before you come',
         'Bring a valid ID on the day'],
   'Office of the Barangay Secretary', 6, 'appointment');
```

`hand-heart` and not `heart-handshake`: the latter is already `certificate-of-indigency`'s icon, and two identical icons in one six-card grid reads as a bug. Both are in `ICON_OPTIONS`.

- [ ] **Step 2: Fold into the baseline**

In `supabase/baseline/0000_baseline_2026-07-23.sql`:

1. Add `flow text not null default 'apply' check (flow in ('apply', 'complaint', 'assistance', 'appointment')),` to the `create table public.services` block, after the `tone` line.
2. Add `description text not null default '',` and `requirements text[] not null default '{}',` to the `create table public.assistance_categories` block, after the `label` line.
3. Add `flow` to the existing services seed `insert` column list, and a flow value to each of the four existing rows: `'apply'` for `barangay-clearance`, `business-permit`, `certificate-of-indigency`; `'complaint'` for `blotter-complaints`.
4. Append the two new rows from Step 1 to that same seed insert.
5. Update the file's header comment: it names the migration range it squashes — change `0001`–`0034` to `0001`–`0035`.

The two new rows **do** belong in the baseline, unlike the demo news and transparency content it deliberately omits: these are real directory entries, not placeholder content.

- [ ] **Step 3: Verify the SQL parses**

There is no local Postgres in this project. Verify by reading: confirm every statement ends in `;`, every `array[…]` literal has matching brackets, and every single quote inside a string is doubled (`voter''s`). The new rows contain no apostrophes, so none need doubling — confirm that is still true if you reworded anything.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0035_service_flow_and_category_guidance.sql supabase/baseline/0000_baseline_2026-07-23.sql
git commit -m "feat: migration 0035 — service flow column and category guidance"
```

- [ ] **Step 5: STOP — hand the migration to the owner**

Do not start Task 3. Tell the owner:

> `0035` is ready. Apply it to **staging** first, verify `/services` still renders, then apply to **production**. Tasks 3+ read the new columns and will fail at runtime against an environment that has not had it applied. Tell me when staging is done.

Task 2 is pure TypeScript with no DB dependency and **may** proceed while waiting.

---

### Task 2: `ServiceFlow` type and `serviceHref`

**Files:**
- Create: `src/features/services/flow.ts`
- Create: `tests/unit/service-flow.test.ts`
- Modify: `src/types/index.ts:61` (beside `ServiceTone`)

**Interfaces:**
- Produces: `type ServiceFlow = "apply" | "complaint" | "assistance" | "appointment"` (exported from `@/types`); `serviceHref(service: Pick<Service, "id" | "flow">): string` (exported from `@/features/services/flow`).
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/service-flow.test.ts
import { describe, expect, it } from "vitest";
import { serviceHref } from "@/features/services/flow";

describe("serviceHref", () => {
  it("routes an apply flow to the service's own apply page", () => {
    expect(serviceHref({ id: "barangay-clearance", flow: "apply" })).toBe(
      "/services/apply/barangay-clearance",
    );
  });

  it("routes a complaint flow to the complaint form", () => {
    // The id is deliberately ignored here: there is one complaint form, not
    // one per service row.
    expect(serviceHref({ id: "blotter-complaints", flow: "complaint" })).toBe("/complaints/new");
  });

  it("routes an assistance flow to the assistance form", () => {
    expect(serviceHref({ id: "social-services-assistance", flow: "assistance" })).toBe(
      "/assistance/new",
    );
  });

  it("routes an appointment flow to the appointment form", () => {
    expect(serviceHref({ id: "set-an-appointment", flow: "appointment" })).toBe(
      "/appointments/new",
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:unit -- service-flow`
Expected: FAIL — cannot resolve `@/features/services/flow`.

- [ ] **Step 3: Add the type**

In `src/types/index.ts`, directly under `export type ServiceTone = "primary" | "danger";`:

```ts
/**
 * Which form a service card sends a resident to. Separate from `ServiceTone`,
 * which is purely visual: routing used to be inferred from tone ('danger' meant
 * the complaint form), which had no room for a third destination.
 *
 * A flow *name*, not an href — see migration 0035's header for why the route
 * itself stays in code.
 */
export type ServiceFlow = "apply" | "complaint" | "assistance" | "appointment";
```

Then add `flow: ServiceFlow;` to `interface Service` (after `tone`), and `flow: ServiceFlow;` to `interface AdminServiceRow` (after `tone`).

Typecheck will now fail in several places. That is expected and Task 3 fixes it — do not chase the errors yet.

- [ ] **Step 4: Write the implementation**

```ts
// src/features/services/flow.ts
import type { Service } from "@/types";

/**
 * The public route a service card's CTA points at.
 *
 * The `switch` is exhaustive over `ServiceFlow` with no `default`, so adding a
 * fifth flow to the union without adding its route here is a compile error
 * rather than a silent fallthrough to the apply page.
 */
export function serviceHref(service: Pick<Service, "id" | "flow">): string {
  switch (service.flow) {
    case "complaint":
      return "/complaints/new";
    case "assistance":
      return "/assistance/new";
    case "appointment":
      return "/appointments/new";
    case "apply":
      return `/services/apply/${service.id}`;
  }
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npm run test:unit -- service-flow`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/features/services/flow.ts tests/unit/service-flow.test.ts
git commit -m "feat: add ServiceFlow and serviceHref"
```

---

### Task 3: Wire the public side

**Blocked on:** Task 1 applied to staging (confirmed by the owner), and Task 2.

**Files:**
- Modify: `src/features/services/queries.ts` (both functions)
- Modify: `src/features/services/components/service-card.tsx:49-62`
- Modify: `src/features/admin/queries/services.ts`
- Modify: `src/features/services/data.ts` (delete `SERVICES`)

**Interfaces:**
- Consumes: `serviceHref` from Task 2; `services.flow` from Task 1.
- Produces: `ServiceRecord.flow` and `AdminServiceRow.flow` populated from the DB.

- [ ] **Step 1: Select `flow` in all three queries**

In `src/features/services/queries.ts`, add `flow` to both `.select(...)` strings (in `listServices` and `getApplyService`), and add to both row mappers:

```ts
flow: row.flow as ServiceRecord["flow"],
```

In `src/features/admin/queries/services.ts`, add `flow` to the `.select(...)` string and to the mapper:

```ts
flow: row.flow as AdminServiceRow["flow"],
```

- [ ] **Step 2: Fix the apply-page guard**

In `getApplyService`, change:

```ts
if (error || !data || data.tone !== "primary") {
```

to:

```ts
// flow, not tone: the two request-flow rows are tone 'primary' and would pass
// a tone check, rendering a full document-application form against a row with
// no application table behind it.
if (error || !data || data.flow !== "apply") {
```

- [ ] **Step 3: Route the card through `serviceHref`**

In `service-card.tsx`, replace the nested ternary at lines 49-62 with a single `Button` whose `href` is `serviceHref(service)` and whose `variant` still keys on `tone`:

```tsx
{service.isAvailable ? (
  <Button
    href={serviceHref(service)}
    variant={isDanger ? "outline-danger" : "primary"}
    className="mt-6 w-full"
  >
    {service.ctaLabel}
  </Button>
) : (
```

Add `import { serviceHref } from "@/features/services/flow";` at the top. The disabled-state branch below is unchanged.

- [ ] **Step 4: Delete the dead `SERVICES` mock**

In `src/features/services/data.ts`, delete the entire `export const SERVICES: Service[] = [...]` array and drop `Service` plus the now-unused icon imports (`Gavel`, `HeartHandshake`, `ShieldCheck`, `Store`) from the import lines. Keep `WASTE_SCHEDULE`, `Leaf`, `Recycle`, and `WasteCollectionSlot` — that half of the file is live.

Nothing imports `SERVICES` (verified: its only occurrence in `src/` is its own declaration). It is a pre-backend mock that would otherwise need a `flow` field added to four entries for no reason.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean. The `Service.flow` errors introduced in Task 2 Step 3 should all be resolved by now.

- [ ] **Step 6: Verify in the browser**

Follow `.claude/skills/verify/SKILL.md`. Load `/services` and confirm:
- Six cards render, the last two being Social Services Assistance and Set an Appointment.
- Their CTAs read "Request Now" and "Book Now" and land on `/assistance/new` and `/appointments/new`.
- Blotter & Complaints still lands on `/complaints/new`.
- The three document cards still land on `/services/apply/<id>`.
- `/services/apply/social-services-assistance` does **not** render an application form.

- [ ] **Step 7: Commit**

```bash
git add src/features/services src/features/admin/queries/services.ts
git commit -m "feat: route service cards by flow, add both request flows to the directory"
```

---

### Task 4: Admin — flow is editable, labels derive from it

**Files:**
- Modify: `src/features/admin/actions/services.ts:15-34` (schema + `labelsForTone`)
- Modify: `src/features/admin/components/service-form.tsx`
- Modify: `src/types/index.ts` (`ServiceFormValues`)

**Interfaces:**
- Consumes: `ServiceFlow` from Task 2.
- Produces: `labelsForFlow(flow: ServiceFlow): { requirementsLabel: string; ctaLabel: string }`; `ServiceFormValues.flow`.

- [ ] **Step 1: Add `flow` to `ServiceFormValues`**

In `src/types/index.ts`, add to `interface ServiceFormValues`, after `tone`:

```ts
flow: ServiceFlow;
```

- [ ] **Step 2: Replace `labelsForTone` with `labelsForFlow`**

In `src/features/admin/actions/services.ts`, replace the function at lines 29-34:

```ts
/**
 * The public card's two labels are derived, not stored edits — so they must be
 * derived from the same thing that decides where the CTA goes. Deriving from
 * `tone` (as this did before migration 0035) would reset the two request-flow
 * rows to "View Requirements"/"Apply Online" on the first SuperAdmin save,
 * days after anyone touched the seed data.
 *
 * These four pairs match 0035's seed values exactly, so saving an untouched
 * row is a no-op.
 */
function labelsForFlow(flow: ServiceFlow): { requirementsLabel: string; ctaLabel: string } {
  switch (flow) {
    case "complaint":
      return { requirementsLabel: "View Process", ctaLabel: "File Incident Report" };
    case "assistance":
      return { requirementsLabel: "What to prepare", ctaLabel: "Request Now" };
    case "appointment":
      return { requirementsLabel: "How it works", ctaLabel: "Book Now" };
    case "apply":
      return { requirementsLabel: "View Requirements", ctaLabel: "Apply Online" };
  }
}
```

Change the import on line 5 from `ServiceTone` to `ServiceFlow`.

- [ ] **Step 3: Validate and persist `flow`**

In `serviceSchema` (line 15), add after `tone`:

```ts
flow: z.enum(["apply", "complaint", "assistance", "appointment"]),
```

In `updateService`, change `const labels = labelsForTone(parsed.data.tone);` to `labelsForFlow(parsed.data.flow)` and add `flow: parsed.data.flow,` to the `.update({...})` object.

In `createService`, make the same two changes to its `labelsForTone` call and its `.insert({...})` object.

- [ ] **Step 4: Add the Destination select**

In `service-form.tsx`, add `flow: record?.flow ?? "apply",` to the `useState` initialiser. Then, inside the existing `grid gap-5 sm:grid-cols-2` that holds Icon and Type, the row becomes three fields — change it to `sm:grid-cols-3` and add:

```tsx
<Field label="Destination" htmlFor="service-flow">
  <Select
    id="service-flow"
    value={values.flow}
    onChange={(event) => set("flow", event.target.value as ServiceFormValues["flow"])}
  >
    <option value="apply">Apply form</option>
    <option value="complaint">Complaint form</option>
    <option value="assistance">Assistance form</option>
    <option value="appointment">Appointment form</option>
  </Select>
</Field>
```

Also retitle the two existing Type options — they carry CTA hints that are no longer true now that destination is a separate field:

```tsx
<option value="primary">Standard</option>
<option value="danger">Urgent / Report</option>
```

- [ ] **Step 5: Typecheck, lint, verify**

Run: `npm run typecheck && npm run lint`

Then in the browser as a SuperAdmin: open `/admin/services`, edit **Social Services Assistance**, change nothing, save. Reload `/services` and confirm the card still reads "What to prepare" and "Request Now". That is the regression Step 2 exists to prevent — confirm it directly rather than assuming.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/features/admin/actions/services.ts src/features/admin/components/service-form.tsx
git commit -m "feat: make service destination editable, derive card labels from flow"
```

---

### Task 5: e2e coverage for placement

**Files:**
- Create: `tests/e2e/public/services-directory.spec.ts`

**Interfaces:**
- Consumes: the deployed Stage 1 behaviour. Runs in the `public` project — no login required.

- [ ] **Step 1: Write the tests**

```ts
// tests/e2e/public/services-directory.spec.ts
import { expect, test } from "@playwright/test";

test.describe("services directory", () => {
  test("both request flows are listed and route to their forms", async ({ page }) => {
    await page.goto("/services");

    const assistance = page.getByRole("link", { name: "Request Now" });
    await expect(assistance).toBeVisible();
    await expect(assistance).toHaveAttribute("href", "/assistance/new");

    const appointment = page.getByRole("link", { name: "Book Now" });
    await expect(appointment).toBeVisible();
    await expect(appointment).toHaveAttribute("href", "/appointments/new");
  });

  test("a request flow cannot be opened as a document application", async ({ page }) => {
    // getApplyService guards on `flow`, not `tone`. Both new rows are tone
    // 'primary', so the pre-0035 tone check would have passed them straight
    // through to a full application form for a row with no application table
    // behind it. Verified to fail with the guard reverted to `tone`.
    await page.goto("/services/apply/social-services-assistance");

    await expect(page.getByLabel("First name")).toHaveCount(0);
  });
});
```

The CTA buttons render as `<a>` because `Button` with an `href` is a link — hence `getByRole("link")`, not `"button"`.

- [ ] **Step 2: Run them**

Run: `npm run test:e2e -- --project=public services-directory`
Expected: both PASS.

This spec submits nothing, so it spends **no** rate-limit budget and is safe to re-run.

- [ ] **Step 3: Prove the second test is a real guard**

Temporarily revert `getApplyService`'s check to `data.tone !== "primary"`, re-run, and confirm the second test FAILS. Then restore the `flow` check and confirm it passes again.

A guard that has never been seen to fail is not a guard — this repo's standing rule.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/public/services-directory.spec.ts
git commit -m "test: cover the services directory's two request flows"
```

---

### Task 6: Stage 1 documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add an Architecture bullet**

Add a bullet covering, in the voice of the surrounding bullets (state the trap, not just the change):

- `services.flow` (migration `0035`) decides a card's destination; `tone` is now purely visual. Routing used to be inferred from `tone`.
- The column names a **flow**, not an href — a free-text URL column would let staff point a card at a typo or a dead route, which is the same reasoning that pulled `QUICK_SERVICES` out of the CMS in `0022`. Copy is CMS-editable, the route is not.
- `serviceHref` (`src/features/services/flow.ts`, unit-tested) is an exhaustive switch with no `default`, so a fifth flow without a route is a compile error.
- **`getApplyService` guards on `flow`, not `tone`** — both new rows are `tone: 'primary'` and would pass a tone check, rendering a document-application form against a row with no application table behind it.
- **`labelsForFlow` replaced `labelsForTone`**: `requirements_label`/`cta_label` are derived on every save, not stored edits, so deriving them from `tone` would have reset both new rows' labels on the first SuperAdmin save.
- `SERVICES` in `src/features/services/data.ts` is deleted (dead pre-backend mock); `WASTE_SCHEDULE` in the same file stays.
- Deploy-order hazard: `0035` before the code, staging first.

- [ ] **Step 2: Update the "Placeholder reality" bullet**

Note that the two new service rows are **real** directory content, not placeholder — the same distinction that bullet already draws for the hotline versus the placeholder emails.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the service flow column and its traps"
```

---

# Stage 2 — Appointments

Independently shippable. Depends on nothing in Stage 1 except that `0035` is applied.

---

### Task 7: Block closed days

**Files:**
- Create: `src/lib/office-days.ts`
- Create: `tests/unit/office-days.test.ts`
- Modify: `src/features/appointments/schema.ts`

**Interfaces:**
- Produces: `isClosedDay(iso: string): boolean` from `@/lib/office-days`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/office-days.test.ts
import { describe, expect, it } from "vitest";
import { isClosedDay } from "@/lib/office-days";

describe("isClosedDay", () => {
  it("is true for a Saturday", () => {
    expect(isClosedDay("2026-08-15")).toBe(true);
  });

  it("is true for a Sunday", () => {
    expect(isClosedDay("2026-08-16")).toBe(true);
  });

  it("is false for every weekday", () => {
    // Mon 2026-08-10 through Fri 2026-08-14.
    for (const iso of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]) {
      expect(isClosedDay(iso)).toBe(false);
    }
  });

  it("reads the calendar day, not the viewer's local day", () => {
    // "2026-08-16" parses as UTC midnight. In Manila (UTC+8) that is still
    // Sunday, but getDay() in a UTC-5 test runner would report Saturday for
    // 2026-08-17 and shift every answer by one. This asserts the UTC reading
    // that makes the function timezone-independent.
    expect(new Date("2026-08-16").getUTCDay()).toBe(0);
    expect(isClosedDay("2026-08-17")).toBe(false); // Monday, everywhere
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:unit -- office-days`
Expected: FAIL — cannot resolve `@/lib/office-days`.

- [ ] **Step 3: Implement**

```ts
// src/lib/office-days.ts

/**
 * Whether the barangay hall is closed on a given YYYY-MM-DD date.
 *
 * Weekends only. Public holidays are deliberately out of scope: there is no
 * holiday table in this project and building one is its own feature.
 *
 * Reads the day via getUTCDay(). "2026-08-16" parses as UTC midnight, so the
 * UTC weekday IS the calendar weekday of that date, wherever the server or the
 * browser happens to be; getDay() would shift by one for half the world. Same
 * class of trap that keeps complaintSchema.incidentDate and
 * applicationSchema.birthDate on lexicographic string comparison rather than
 * parsed Dates.
 */
export function isClosedDay(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm run test:unit -- office-days`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the schema rule**

In `src/features/appointments/schema.ts`, add `isClosedDay` to the imports and a third `.refine()` on `preferredDate`, after the existing next-year bound:

```ts
    .refine(
      (value) => !isClosedDay(value),
      "The barangay hall is closed on weekends. Please pick a weekday.",
    ),
```

Because `appointmentSchema` is shared by `appointment-form.tsx` and `submitAppointment`, this is enforced on the client and the server from one declaration.

**Do not** add this rule to `walkInSchema` in `src/features/admin/actions/appointments.ts`, or to the review drawer's propose-a-different-date field. Staff scheduling a weekend special session know something the rule does not; the rule exists to stop a *resident* filing a request that will certainly be declined.

- [ ] **Step 6: Verify in the browser**

Load `/appointments/new`, pick the next Saturday, submit, and confirm the inline message names the reason. Native date inputs cannot disable weekends, so this message is the resident's only feedback — confirm it reads as an explanation, not "invalid date".

- [ ] **Step 7: Commit**

```bash
git add src/lib/office-days.ts tests/unit/office-days.test.ts src/features/appointments/schema.ts
git commit -m "feat: reject weekend appointment dates"
```

---

### Task 8: "Before you book" card

**Files:**
- Modify: `src/features/appointments/components/appointment-form.tsx`

**Interfaces:**
- Consumes: `SITE.officeHours` from `@/constants/site`.

- [ ] **Step 1: Add the card above the form's main Card**

Inside the returned `<form>`, before the existing `<Card className="space-y-5 rounded-3xl p-8">`:

```tsx
<Card className="rounded-3xl border-brand-200 bg-brand-100/50 p-6">
  <p className="mb-3 font-semibold text-ink-900">Before you book</p>
  <ul className="space-y-2 text-sm text-ink-600">
    {[
      `Office hours are ${SITE.officeHours.replace("Mon - Fri:", "Monday to Friday,")}`,
      "Bring a valid ID on the day of your visit.",
      "The date you pick is a request — staff confirm your slot before you come.",
    ].map((line) => (
      <li key={line} className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
        <span>{line}</span>
      </li>
    ))}
  </ul>
</Card>
```

Add `import { SITE } from "@/constants/site";`. `CheckCircle2` and `Card` are already imported.

The markup mirrors `apply-form.tsx:153-167` exactly — same radius, border, tint, and bullet icon — so the two flows read as one family.

Office hours come from `SITE.officeHours`, never a second hardcoded copy of that string. The `.replace(...)` matches how `help-section.tsx:12` already reflows the same constant into a sentence.

The third line already appears on the success receipt (`appointment-form.tsx:119-122`). Saying it *before* submitting is the point — a resident who learns it only afterwards has already formed the wrong expectation.

- [ ] **Step 2: Verify**

Load `/appointments/new`. The card sits above the fields, tinted, with the real office hours. Check at 390px that it does not crowd the form.

- [ ] **Step 3: Commit**

```bash
git add src/features/appointments/components/appointment-form.tsx
git commit -m "feat: add a 'before you book' card to the appointment form"
```

---

### Task 9: Purpose quick-picks

**Files:**
- Modify: `src/features/appointments/components/appointment-form.tsx`

- [ ] **Step 1: Add the presets constant**

Near the existing `EMPTY` constant at the top of the file:

```ts
/**
 * Starting points for the purpose field. Residents who freeze at a blank box
 * get a first sentence to edit, and staff get more routable text than "meeting".
 */
const PURPOSE_PRESETS = [
  "Consultation with an official",
  "Document follow-up",
  "Complaint mediation",
  "Business inquiry",
] as const;
```

- [ ] **Step 2: Add the click handler**

Inside the component, beside `set`:

```ts
function applyPreset(preset: string) {
  // Fill when empty, append on a new line otherwise. Never destructive — a
  // resident who has typed three sentences and taps a chip out of curiosity
  // does not lose them — and never inert, which a fill-only-when-empty rule
  // would make it once they had typed anything.
  set("purpose", values.purpose.trim() ? `${values.purpose.trimEnd()}\n${preset}` : preset);
}
```

- [ ] **Step 3: Render the chips**

Directly above the purpose `<Textarea>`, inside its `<Field>`:

```tsx
<div className="mb-2 flex flex-wrap gap-2">
  {PURPOSE_PRESETS.map((preset) => (
    <button
      key={preset}
      type="button"
      onClick={() => applyPreset(preset)}
      className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-600 transition-colors duration-(--duration-quick) hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
    >
      {preset}
    </button>
  ))}
</div>
```

`type="button"` matters — inside a `<form>`, a bare `<button>` submits. No `aria-pressed`: these are insert actions, not toggles, and nothing about them persists as state.

Every preset comfortably clears `purpose`'s `.min(4)`.

- [ ] **Step 4: Verify**

Load `/appointments/new`. Click a chip into an empty box — it fills. Type a sentence, click another chip — it appends on a new line and the typed text survives. Confirm clicking a chip does **not** submit the form.

- [ ] **Step 5: Commit**

```bash
git add src/features/appointments/components/appointment-form.tsx
git commit -m "feat: add purpose quick-picks to the appointment form"
```

---

### Task 10: Server-rendered demand hint

**Files:**
- Create: `src/features/appointments/demand.ts` (pure — `demandLabel`)
- Create: `src/features/appointments/queries.ts` (DB — `loadAppointmentDemand`)
- Create: `tests/unit/appointment-demand.test.ts`
- Modify: `src/types/index.ts` (add `AppointmentDemand`)
- Modify: `src/app/(public)/appointments/new/page.tsx`
- Modify: `src/features/appointments/components/appointment-form.tsx`

**Interfaces:**
- Produces: `type AppointmentDemand = Record<string, { am: number; pm: number }>`; `loadAppointmentDemand(): Promise<AppointmentDemand>`; `demandLabel(count: number): "Light" | "Moderate" | "Busy"`.
- `AppointmentForm` gains a required `demand: AppointmentDemand` prop.

The shape here is deliberate. A client-side lookup that re-queries as the date changes would need a new public Server Action reading `appointments` — a table with zero public read paths today — plus its own rate-limit budget and a decision about Turnstile on a call that fires on every date keystroke. All of that is new attack surface for a hint. The page is already a Server Component, so it loads the counts once at render instead.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/appointment-demand.test.ts
import { describe, expect, it } from "vitest";
import { demandLabel } from "@/features/appointments/demand";

describe("demandLabel", () => {
  it("calls a quiet slot Light", () => {
    expect(demandLabel(0)).toBe("Light");
    expect(demandLabel(2)).toBe("Light");
  });

  it("calls the moderate threshold Moderate", () => {
    expect(demandLabel(3)).toBe("Moderate");
    expect(demandLabel(5)).toBe("Moderate");
  });

  it("calls the busy threshold Busy", () => {
    expect(demandLabel(6)).toBe("Busy");
    expect(demandLabel(40)).toBe("Busy");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:unit -- appointment-demand`
Expected: FAIL — cannot resolve `@/features/appointments/demand`.

- [ ] **Step 3: Implement the pure half**

```ts
// src/features/appointments/demand.ts

/**
 * Where "Light" becomes "Moderate" and "Moderate" becomes "Busy". Named
 * constants rather than inline numbers so a later tuning pass has something
 * deliberate to change.
 */
const MODERATE_AT = 3;
const BUSY_AT = 6;

/**
 * A coarse label for how many requests already exist for a date and half-day.
 *
 * Coarse on purpose. Showing "4 requests" invites a resident to read 4 as a
 * limit when there is no capacity model behind it, and publishes the barangay's
 * raw operational volume to anyone who loads the page. The label carries the
 * same actionable information — pick a different slot — without either problem.
 */
export function demandLabel(count: number): "Light" | "Moderate" | "Busy" {
  if (count >= BUSY_AT) return "Busy";
  if (count >= MODERATE_AT) return "Moderate";
  return "Light";
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npm run test:unit -- appointment-demand`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the type**

In `src/types/index.ts`, beside the other appointment types:

```ts
/**
 * How many appointment requests already exist per date and half-day, keyed
 * YYYY-MM-DD. A date absent from the map has none — the form renders no hint
 * at all for it rather than "Light", since absence of data and genuine quiet
 * look identical and only one of them is a claim worth making.
 */
export type AppointmentDemand = Record<string, { am: number; pm: number }>;
```

- [ ] **Step 6: Write the query**

```ts
// src/features/appointments/queries.ts
import type { AppointmentDemand } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { manilaToday } from "@/lib/format";

/** How far ahead the form offers a demand hint. */
const HORIZON_DAYS = 60;

/**
 * Aggregate request counts for the next HORIZON_DAYS, for the appointment
 * form's busyness hint.
 *
 * Counts only — no names, no ticket numbers, no row identity ever leaves the
 * server. Declined and completed requests are excluded: neither occupies staff
 * time on the day any more.
 *
 * Tallied in JS rather than via an RPC because 60 days of barangay appointments
 * is a small result set and this needs no new database function to maintain.
 */
export async function loadAppointmentDemand(): Promise<AppointmentDemand> {
  const from = manilaToday();
  const until = new Date(`${from}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + HORIZON_DAYS);
  const to = until.toISOString().slice(0, 10);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("preferred_date, preferred_period")
    .gte("preferred_date", from)
    .lte("preferred_date", to)
    .not("status", "in", "(declined,completed)");
  if (error || !data) {
    // A hint is not worth failing the page over — the form renders without it.
    if (error) console.error("loadAppointmentDemand failed:", error.message);
    return {};
  }

  const demand: AppointmentDemand = {};
  for (const row of data) {
    const slot = (demand[row.preferred_date] ??= { am: 0, pm: 0 });
    if (row.preferred_period === "am") slot.am += 1;
    else slot.pm += 1;
  }
  return demand;
}
```

- [ ] **Step 7: Pass it through the page**

In `src/app/(public)/appointments/new/page.tsx`, make the component `async`, load the demand, and pass it down:

```tsx
export default async function NewAppointmentPage() {
  const demand = await loadAppointmentDemand();
  …
  <AppointmentForm demand={demand} />
```

Add the import. This makes the route **dynamic** (a DB read at render); `/assistance/new` already is, for the same reason.

- [ ] **Step 8: Render the hint**

In `appointment-form.tsx`, change the signature to `export function AppointmentForm({ demand }: { demand: AppointmentDemand })`, and add beside the other derived values:

```ts
const slotCount = demand[values.preferredDate]?.[values.preferredPeriod];
```

Then directly under the preferred-time `<Field>`, inside the same grid's closing area:

```tsx
{slotCount === undefined ? null : (
  <p className="text-xs text-ink-500 sm:col-span-2">
    {DEMAND_BLURB[demandLabel(slotCount)]}
  </p>
)}
```

with, near `PURPOSE_PRESETS`:

```ts
const DEMAND_BLURB: Record<ReturnType<typeof demandLabel>, string> = {
  Light: "Light — few requests for this slot so far.",
  Moderate: "Moderate — a few requests already for this slot.",
  Busy: "Busy — consider another day, or the other half of this one.",
};
```

The `=== undefined` check is load-bearing: a date with no entry must render nothing at all, not "Light".

- [ ] **Step 9: Typecheck, lint, verify**

Run: `npm run typecheck && npm run lint`

In the browser: file two or three appointment requests for the same date and half-day, reload `/appointments/new`, and confirm the hint appears and escalates. Change the date to one with no requests and confirm the hint disappears entirely.

- [ ] **Step 10: Commit**

```bash
git add src/features/appointments src/types/index.ts "src/app/(public)/appointments/new/page.tsx" tests/unit/appointment-demand.test.ts
git commit -m "feat: show a coarse demand hint on the appointment form"
```

---

### Task 11: Stage 2 tests and documentation

**Files:**
- Create: `tests/e2e/public/appointment-form.spec.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the e2e test**

```ts
// tests/e2e/public/appointment-form.spec.ts
import { expect, test } from "@playwright/test";

test("a weekend date is refused with the reason", async ({ page }) => {
  await page.goto("/appointments/new");

  await page.getByLabel("First name").fill("Testa");
  await page.getByLabel("Last name").fill("Reyes");
  await page.getByLabel("Sitio / street address").fill("Sitio 1, Barangay San Fernando");
  await page.getByLabel("Contact number").fill("(077) 600-0000");
  await page.getByLabel("What is the appointment about?").fill("Consultation with an official");

  // 2026-08-15 is a Saturday.
  await page.getByLabel("Preferred date").fill("2026-08-15");
  await page.getByRole("button", { name: "Request appointment" }).click();

  await expect(page.getByText("The barangay hall is closed on weekends.")).toBeVisible();
});
```

The date is hardcoded rather than computed so the test asserts a known Saturday. If this date falls outside `manilaTodayNextYear()` by the time you read this, pick the next Saturday that is in range and update the comment.

Client-side validation rejects before any network call, so this test **submits nothing** and spends no rate-limit budget.

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- --project=public appointment-form`
Expected: PASS.

- [ ] **Step 3: Prove it is a real guard**

Comment out the `isClosedDay` refine in `src/features/appointments/schema.ts`, re-run, confirm FAIL. Restore it, confirm PASS.

- [ ] **Step 4: Update CLAUDE.md**

Add an Architecture bullet covering:
- The weekend rule lives in `appointmentSchema`, so client and server enforce it from one declaration; `isClosedDay` uses `getUTCDay()` and why `getDay()` is wrong.
- **The rule is deliberately not applied to the walk-in path or the review drawer** — staff may schedule a weekend special session.
- Public holidays are out of scope; there is no holiday table.
- The demand hint is **server-rendered at page load**, not a live lookup, and why: a client lookup would need a new public read path on `appointments` plus its own rate limiting. Consequences: the route is now dynamic, and the numbers are as of page load.
- The hint is coarse (`Light`/`Moderate`/`Busy`) on purpose, and a date absent from the map renders **no** hint rather than "Light".

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/public/appointment-form.spec.ts CLAUDE.md
git commit -m "test: cover the weekend rule; docs: record the appointment changes"
```

---

# Stage 3 — Assistance

Independently shippable. Depends on `0035` being applied (Task 1).

---

### Task 12: Per-category guidance — data and admin

**Files:**
- Modify: `src/types/index.ts` (`AssistanceCategoryRow`, `AssistanceCategoryValues`)
- Modify: `src/features/assistance/queries.ts`
- Modify: `src/features/admin/actions/assistance-categories.ts`
- Modify: `src/features/admin/components/assistance-categories-panel.tsx`

**Interfaces:**
- Produces: `AssistanceCategoryRow.description: string`, `.requirements: string[]`; `updateAssistanceCategory(id, values: AssistanceCategoryValues)` replacing `renameAssistanceCategory`.

- [ ] **Step 1: Widen the types**

In `src/types/index.ts`:

```ts
export interface AssistanceCategoryRow {
  id: string;
  label: string;
  /** Optional one-line explanation shown under the picker. "" means none. */
  description: string;
  /** "What to prepare" bullets. Empty means the guidance card is not rendered. */
  requirements: string[];
  sortOrder: number;
  isActive: boolean;
}

export interface AssistanceCategoryValues {
  label: string;
  description: string;
  requirements: string[];
}

/**
 * Creating a category takes a label only — the inline "New Category" row has no
 * room for the other two, and they are filled in afterwards through the editor.
 * A separate type rather than optional fields, so the editor's own call site
 * cannot silently omit them and blank a category's guidance on save.
 */
export type AssistanceCategoryCreateValues = Pick<AssistanceCategoryValues, "label">;
```

- [ ] **Step 2: Select the new columns**

In `src/features/assistance/queries.ts`, add `description, requirements` to the `.select(...)` string and to the mapper:

```ts
description: row.description,
requirements: row.requirements,
```

- [ ] **Step 3: Rename and widen the update action**

In `src/features/admin/actions/assistance-categories.ts`:

Widen `categorySchema`:

```ts
const categorySchema = z.object({
  label: z
    .string()
    .trim()
    .min(3, "Enter a category name.")
    .max(60, "Please keep the category name short."),
  description: z.string().trim().max(300, "Please keep the description short."),
  requirements: z.array(z.string().trim().min(1)).max(8, "Please list at most 8 items."),
});
```

Rename `renameAssistanceCategory` to `updateAssistanceCategory` — it no longer only renames, and a name that says otherwise would mislead the next reader. Its `.update({...})` becomes:

```ts
.update({
  label: parsed.data.label,
  description: parsed.data.description,
  requirements: parsed.data.requirements,
})
```

and its audit entry's `action` becomes `"updated assistance category"`.

`createAssistanceCategory`'s parameter type becomes `AssistanceCategoryCreateValues` and it validates against `categorySchema.pick({ label: true })`. Its insert is unchanged — the two new columns take their defaults. Leaving its parameter as the widened `AssistanceCategoryValues` would be a compile error at the panel's `createAssistanceCategory({ label: newBuffer })` call site, which is the point of the separate type.

- [ ] **Step 4: Grow the panel's inline editor**

In `assistance-categories-panel.tsx`:

- Replace the single `editBuffer` string state with `useState<AssistanceCategoryValues>` holding all three fields, initialised in `startEdit` from the category.
- In the `editingId === category.id` branch (line 151), replace the single flex row with a stacked editor: the existing label `Input`, a description `Input` (`placeholder="One line shown under the picker (optional)"`), and a `Textarea` for requirements labelled "What to prepare (one per line)" — the same one-per-line convention `service-form.tsx` already uses for the same kind of list. Keep the existing Save/Cancel buttons.
- `saveEdit` calls `updateAssistanceCategory(id, { label, description, requirements: splitLines(requirementsBuffer) })` where `splitLines` splits on `\n`, trims, and drops empties — mirroring `splitRequirements` in `services.ts`.
- Toast copy becomes `"Category saved."`.
- Import `Textarea` from `@/components/ui/form`.

Growing the existing expand-in-place mechanic is a smaller change than introducing a `Drawer` to a panel that has never had one, and keeps rename/reorder/retire working unchanged.

- [ ] **Step 5: Typecheck, lint, verify**

Run: `npm run typecheck && npm run lint`

In the browser as a SuperAdmin: edit a category on `/admin/services`, add a description and three requirement lines, save, reopen, and confirm all three persisted.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/features/assistance/queries.ts src/features/admin/actions/assistance-categories.ts src/features/admin/components/assistance-categories-panel.tsx
git commit -m "feat: give assistance categories description and requirements"
```

---

### Task 13: Category guidance and "before you file" on the public form

**Files:**
- Modify: `src/features/assistance/components/assistance-form.tsx`

**Interfaces:**
- Consumes: `AssistanceCategoryRow.description` / `.requirements` from Task 12.

- [ ] **Step 1: Add the "Before you file" card**

Inside the `<form>`, before the main `<Card>`, using the identical markup Task 8 used for appointments (same radius, border, tint, `CheckCircle2` bullets), with these three lines:

- "Every request is reviewed by the Barangay Social Welfare Desk."
- "A staff visit or follow-up call may follow."
- "This is a request for assessment, not cash released on the spot."

- [ ] **Step 2: Add the per-category guidance card**

Beside the other derived values:

```ts
const selected = categories.find((category) => category.id === values.categoryId);
```

Directly below the category `<Field>`:

```tsx
{selected && (selected.description || selected.requirements.length > 0) ? (
  <Card className="rounded-3xl border-brand-200 bg-brand-100/50 p-6">
    <p className="mb-3 font-semibold text-ink-900">What to prepare</p>
    {selected.description ? (
      <p className="mb-3 text-sm text-ink-600">{selected.description}</p>
    ) : null}
    <ul className="space-y-2 text-sm text-ink-600">
      {selected.requirements.map((requirement, index) => (
        <li key={`${index}-${requirement}`} className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
          <span>{requirement}</span>
        </li>
      ))}
    </ul>
  </Card>
) : null}
```

An empty category renders **nothing** — no card, no empty heading. That is the project's existing "an empty block hides its section" rule, and it is what lets Stage 3 ship without content: every category starts empty, the form looks exactly as it does today, and each lights up as staff fill it in.

- [ ] **Step 3: Add the character counter**

Directly under the details `<Textarea>`, inside its `<Field>`:

```tsx
<p className="text-right text-xs text-ink-500" aria-live="polite">
  {values.details.trim().length < 20
    ? `${values.details.trim().length} / 20 characters minimum`
    : `${values.details.trim().length} / 2000`}
</p>
```

`assistanceSchema.details` enforces `.min(20)` on the trimmed value, which is currently invisible until the resident submits and is turned away.

- [ ] **Step 4: Verify**

Load `/assistance/new`. With a category that has requirements, the card appears on selection and swaps when the category changes. With an empty category, nothing renders. Type into details and watch the counter cross 20.

- [ ] **Step 5: Commit**

```bash
git add src/features/assistance/components/assistance-form.tsx
git commit -m "feat: add category guidance, a pre-filing card, and a counter to the assistance form"
```

---

### Task 14: Rename the shared ticket-file constants

**Files:**
- Modify: `src/lib/storage.ts:193-194`
- Modify: `src/lib/media.ts:11,232`
- Modify: `src/features/track/actions.ts:17,315,316`
- Modify: `src/features/track/components/ticket-reply-form.tsx:9,40,41,45,65,66,139`

Mechanical and self-contained, done before Task 15 so that task has the right names to import.

- [ ] **Step 1: Rename**

`MAX_REPLY_FILES` → `MAX_TICKET_FILES`, `MAX_REPLY_FILE_BYTES` → `MAX_TICKET_FILE_BYTES`, at every site listed above. Two flows share them after Task 15 and the `REPLY` names would be actively misleading at the new call site.

Update the doc comment above them in `storage.ts` — it currently describes the reply path specifically; it now covers any resident-supplied ticket attachment. Keep its "Do NOT raise these to fit a 10 MB scan" warning verbatim.

- [ ] **Step 2: Confirm nothing was missed**

Run: `grep -rn "MAX_REPLY_FILE" src/`
Expected: no output.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage.ts src/lib/media.ts src/features/track
git commit -m "refactor: rename MAX_REPLY_FILE* to MAX_TICKET_FILE*"
```

---

### Task 15: Attachments at filing

**Files:**
- Modify: `src/types/index.ts` (add `SubmitAssistanceResult`)
- Modify: `src/features/assistance/actions.ts`
- Modify: `src/features/assistance/components/assistance-form.tsx`

**Interfaces:**
- Consumes: `MAX_TICKET_FILES` / `MAX_TICKET_FILE_BYTES` / `ALLOWED_DOC_FILE_TYPES` from `@/lib/storage` (Task 14); `uploadTicketAttachment` / `discardTicketAttachment` from `@/lib/media`; `recordTicketUpdate`'s existing `attachments` field.
- Produces: `submitAssistance(values, files: File[], turnstileToken)` returning `SubmitAssistanceResult`.

No new column, no new bucket, no change to `scripts/report-orphaned-media.mjs`: `submitAssistance` already calls `recordTicketUpdate`, that helper already accepts `attachments`, `discardTicketAttachment`'s path allow-list already covers the `AST-` prefix, and the orphan script already reads `ticket_updates.attachments` for the `ticket-media` bucket.

- [ ] **Step 1: Add the result type**

In `src/types/index.ts`, after `SubmitTicketResult`:

```ts
/**
 * Assistance is the one public submission that also carries files. Its upload
 * happens after the row insert (the storage path is prefixed with the ticket
 * number, which does not exist until then), so a storage failure can leave a
 * real ticket with no attachments — a case `SubmitTicketResult` cannot express,
 * since a non-null `error` there means no ticket was filed.
 *
 * Extending rather than widening the shared type, for the reason
 * `SignInFormState extends AuthFormState` does: the base must not carry a field
 * that is inert for its four other callers.
 */
export interface SubmitAssistanceResult extends SubmitTicketResult {
  /** Non-null only alongside a successful ticketNo: the ticket filed, the files did not. */
  attachmentWarning: string | null;
}
```

- [ ] **Step 2: Widen the action**

In `src/features/assistance/actions.ts`, change the signature to:

```ts
export async function submitAssistance(
  values: PublicAssistanceValues,
  files: File[],
  turnstileToken: string | null,
): Promise<SubmitAssistanceResult> {
```

Every existing `return` gains `attachmentWarning: null`.

`File[]` as a plain Server Action argument has precedent at `src/features/admin/actions/news.ts:102`. `submitTicketReply` uses `FormData` instead, but only because it also carries a ticket number and surname as form fields, which this action does not.

- [ ] **Step 3: Pre-check the files before the insert**

Immediately after the Zod `safeParse` block and **before** the category lookup:

```ts
  // Everything the resident can fix is rejected here, before any row exists —
  // so the attachmentWarning path below is reserved for genuine storage
  // failures they had no part in.
  if (files.length > MAX_TICKET_FILES) {
    return {
      error: `You can attach up to ${MAX_TICKET_FILES} files.`,
      ticketNo: null,
      attachmentWarning: null,
    };
  }
  for (const file of files) {
    if (!ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number])) {
      return {
        error: "Attachments must be JPG, PNG, WebP, or PDF.",
        ticketNo: null,
        attachmentWarning: null,
      };
    }
    if (file.size > MAX_TICKET_FILE_BYTES) {
      return {
        error: "Each attachment must be 2 MB or smaller.",
        ticketNo: null,
        attachmentWarning: null,
      };
    }
  }
```

3 × 2 MB = 6 MB plus form fields, under the existing `"8mb"` `bodySizeLimit`. Sized to fit that ceiling rather than raise it — raising it widens the limit for every public form at once.

- [ ] **Step 4: Upload after the insert, then attach**

Replace the `recordTicketUpdate` call (currently lines 88-95) with:

```ts
  const uploaded: TicketAttachment[] = [];
  let attachmentWarning: string | null = null;
  for (const file of files) {
    const result = await uploadTicketAttachment(file, data.ticket_no);
    if (result.error || !result.src) {
      // The ticket is already filed and is the resident's. Failing the whole
      // submission here would have them refile and collect a second number, so
      // drop the attachments instead and say so.
      for (const done of uploaded) {
        await discardTicketAttachment(done.path, "submitAssistance upload failed");
      }
      uploaded.length = 0;
      attachmentWarning =
        "We could not attach your files. Your request is filed — you can add them by replying on the Track page.";
      break;
    }
    uploaded.push({ path: result.src, name: file.name, mime: file.type, sizeBytes: file.size });
  }

  const entryId = await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "assistance",
    entryType: "status",
    status: TICKET_INTAKE_STATUS.assistance,
    visibility: "public",
    authorKind: "system",
    attachments: uploaded,
  });
```

`data.ticket_no` is the DB-resolved value, never a client string — it becomes a storage path prefix. Add imports for `TicketAttachment`, `uploadTicketAttachment`, `discardTicketAttachment`, and the three storage constants.

The final `return` becomes `{ error: null, ticketNo: data.ticket_no, attachmentWarning }`.

- [ ] **Step 5: Add the client file picker**

In `assistance-form.tsx`, add `const [files, setFiles] = useState<File[]>([]);` and
`const [fileError, setFileError] = useState<string | null>(null);`, then this block below
the details field:

```tsx
<div className="space-y-2">
  <label htmlFor="assistance-files" className="text-sm font-semibold text-ink-800">
    Supporting documents (optional)
  </label>
  <input
    id="assistance-files"
    type="file"
    multiple
    accept="image/jpeg,image/png,image/webp,application/pdf"
    onChange={(event) => {
      const picked = Array.from(event.target.files ?? []);
      if (picked.length > MAX_TICKET_FILES) {
        setFileError(`You can attach up to ${MAX_TICKET_FILES} files.`);
        return;
      }
      if (picked.some((file) => file.size > MAX_TICKET_FILE_BYTES)) {
        setFileError("Each attachment must be 2 MB or smaller.");
        return;
      }
      setFileError(null);
      setFiles(picked);
    }}
    className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
  />
  <p className="text-xs text-ink-500">
    Up to {MAX_TICKET_FILES} files, 2 MB each. JPG, PNG, WebP, or PDF.
  </p>
  {fileError ? (
    <p role="alert" className="text-sm font-medium text-danger">
      {fileError}
    </p>
  ) : null}
</div>
```

`fileError` stays plain `role="alert"` text rather than an `<InlineAlert>`: it is
field-level validation that clears itself on the next valid pick, and a close button on it
would have nothing to dismiss to. That is the same split `feedback-panel.tsx`'s own
`fileError` already follows.

Pass `files` as the new second argument: `await submitAssistance(values, files, turnstileToken)`.

Import `MAX_TICKET_FILES` and `MAX_TICKET_FILE_BYTES` from `@/lib/storage` — never redefine
them locally.

- [ ] **Step 6: Surface the warning on the receipt**

Add `const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null);`, set it from the result alongside `setTicketNo`, and render it in the success branch above the "What happens next" block:

```tsx
{attachmentWarning ? (
  <InlineAlert message={attachmentWarning} onDismiss={() => setAttachmentWarning(null)} className="mb-6 text-left" />
) : null}
```

- [ ] **Step 7: Typecheck, lint, verify end to end**

Run: `npm run typecheck && npm run lint`

In the browser: file an assistance request with two files attached. Confirm the ticket number returns, then open the ticket in `/admin/assistance` and confirm both attachments are listed on the timeline entry and open correctly through their signed URLs.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/features/assistance
git commit -m "feat: accept supporting documents when filing an assistance request"
```

---

### Task 16: Stage 3 tests and documentation

**Files:**
- Create: `tests/e2e/public/assistance-form.spec.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the e2e test**

```ts
// tests/e2e/public/assistance-form.spec.ts
import { expect, test } from "@playwright/test";

test("a request with a supporting document is filed and returns a ticket", async ({ page }) => {
  await page.goto("/assistance/new");

  await page.getByLabel("First name").fill("Testc");
  await page.getByLabel("Last name").fill(`Aquino${Date.now()}`);
  await page.getByLabel("Sitio / street address").fill("Sitio 1, Barangay San Fernando");
  await page.getByLabel("Contact number").fill("(077) 600-0000");
  await page
    .getByLabel("Tell us about your situation")
    .fill("We need help with hospital bills after an accident last week.");

  await page.getByLabel("Supporting documents (optional)").setInputFiles({
    name: "abstract.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 test"),
  });

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(page.getByText("Request filed")).toBeVisible();
  await expect(page.getByText(/AST-\d{4}-\d{5}/)).toBeVisible();
});
```

Uses a `Date.now()`-suffixed surname, following the rule `ticket-updates.spec.ts` established: a fixed surname ties with rows previous runs left behind, and `toBeVisible()` can resolve against a stale list.

**The spec's fourth e2e case — category guidance appearing on pick — is deliberately not
automated.** It asserts on `assistance_categories.description`/`.requirements`, which are
empty in every environment by default (Task 12) and only ever filled in by hand through the
admin panel. A test asserting the card appears would fail on a fresh checkout and on CI;
one asserting it does *not* appear would pass for the wrong reason the moment staff added
content. The e2e suite must not depend on hand-entered CMS data. It is covered instead by
Task 13 Step 4's browser verification, which checks both the populated and empty cases
against data the verifier controls.

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- --project=public assistance-form`
Expected: PASS.

Needs Turnstile keys that solve headlessly — Cloudflare's always-pass test keys, documented in `.env.example`. The site key is inlined at **build** time, so switching keys needs the dev server restarted.

- [ ] **Step 3: Record the rate-limit cost**

This spec spends one `assistance:<ip>` hit against `SUBMIT_LIMIT` = **5 per hour**. Roughly 5 runs an hour before it fails on the limiter rather than on a regression.

Add it to CLAUDE.md's Commands section alongside `login.spec.ts`, `feedback.spec.ts` and `ticket-updates.spec.ts`, with the same framing those carry: **a failure here shortly after a recent run is a rate-limit collision, not a regression.**

- [ ] **Step 4: Update CLAUDE.md**

Add an Architecture bullet covering:
- Per-category guidance columns (`0035`), and that an empty category renders nothing — the "empty block hides its section" rule is what let this ship with no content.
- `renameAssistanceCategory` → `updateAssistanceCategory`, and why the rename mattered.
- **Attachments at filing needed no new schema**: the submission already wrote a `ticket_updates` row and that table already had `attachments`. Name the four things that already existed so nobody rebuilds them.
- The upload happens **after** the insert because the path is prefixed with the ticket number, and therefore `SubmitAssistanceResult` carries an `attachmentWarning` — with the rule that every resident-fixable rejection happens **before** the insert, so the warning path is only ever a genuine storage failure.
- The 3 × 2 MB cap is sized to fit the existing `"8mb"` `bodySizeLimit`, deliberately not a raise.
- The `MAX_REPLY_FILE*` → `MAX_TICKET_FILE*` rename.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/public/assistance-form.spec.ts CLAUDE.md
git commit -m "test: cover assistance attachments; docs: record the assistance changes"
```

---

## Final verification

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npm run test:unit` — all pass, including the three new suites (`service-flow`, `office-days`, `appointment-demand`)
- [ ] `npm run test:e2e -- --project=public` — all pass (mind the per-suite rate-limit budgets; if two submitting suites ran in the same window, wait rather than debugging a phantom regression)
- [ ] `npm run build` — succeeds
- [ ] Migration `0035` applied to **both** staging and production, confirmed by the owner
- [ ] CLAUDE.md carries all three stages' bullets
