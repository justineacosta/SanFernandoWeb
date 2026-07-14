# Admin Applications CMS — Design Spec

**Date:** 2026-07-14
**Source design:** `stitch_tabbed_content_manager/application_services_management/` (screen.png + code.html + DESIGN.md — reference only, re-skinned into the amber+ink system)
**Builds on:** `docs/superpowers/specs/2026-07-13-admin-dashboard-buildout-design.md` (admin shell, primitives, envelope/contract patterns)

## 1. Goal

Add a **Certificate Applications** manager to the admin portal: barangay staff review
incoming requests for certificates and clearances (approve/reject with remarks) and can
encode walk-in applications. Like the rest of the admin portal this is an **interactive
mock** — client-side search/filter/pagination, validated drawer forms, fake-save toasts,
no persistence — whose typed data shapes are the future backend contract.

Unlike the five existing managers, an application is **not a wrapper around public-site
content**; it is a new first-class transactional entity that **references a service by
`serviceId` foreign key** (the shape a real database and API will have). The manager
resolves service titles for display.

## 2. Route and navigation

- New route `src/app/admin/applications/page.tsx` — thin page: metadata
  (`title: "Applications — San Fernando Admin"`) + `<ApplicationsManager />`.
- New sidebar item in `ADMIN_NAV_ITEMS`, third position (right after Services
  Management, its transactional counterpart):
  `{ label: "Applications", href: "/admin/applications", icon: Inbox }`.
  Nav order becomes: Dashboard Overview, Services Management, **Applications**,
  Ordinance & Resolution, Event Calendar, News & Announcements, Settings.

## 3. Data model (`src/types/index.ts`)

```ts
export type ApplicationStatus = "pending" | "approved" | "rejected";
```

`ApplicationStatus` joins the `AdminStatus` union. `StatusChip` gains three entries:

| Status   | Label    | Tone                              |
| -------- | -------- | --------------------------------- |
| pending  | Pending  | `bg-ink-100 text-ink-700`         |
| approved | Approved | `bg-brand-100 text-brand-800`     |
| rejected | Rejected | `bg-danger-soft text-danger-soft-fg` |

(No green exists in the token system; "approved" uses the same brand tone as the other
positive statuses, published/active.)

```ts
export interface AdminApplicationRecord {
  id: string;
  /** Human-facing reference, e.g. "APP-2025-0148". */
  referenceNo: string;
  applicantName: string;
  /** Placeholder-shaped, (077) area code. */
  contactNumber: string;
  email?: string;
  /** Street/purok address within the barangay. */
  address: string;
  /** FK to `Service.id` — certificate-issuing services only. */
  serviceId: string;
  /** Why the applicant needs the certificate. */
  purpose: string;
  /** ISO date. */
  dateApplied: string;
  status: ApplicationStatus;
  /** Reviewer remarks; set when approved or rejected. */
  remarks?: string;
  /** Reviewer name; set when approved or rejected. */
  reviewedBy?: string;
  /** ISO date; set when approved or rejected. */
  reviewedAt?: string;
}
```

Form/action contracts (future POST and PATCH bodies):

```ts
export interface ApplicationFormValues {
  applicantName: string;
  contactNumber: string;
  email?: string;
  address: string;
  serviceId: string;
  purpose: string;
}

export interface ApplicationReviewValues {
  status: "approved" | "rejected";
  remarks: string;
}
```

### Certificate types

Applications reference only the **certificate-issuing** entries of the real public
`SERVICES` catalog (`src/features/services/data.ts`):

- `barangay-clearance` — Barangay Clearance
- `business-permit` — Business Permit Recommendation
- `certificate-of-indigency` — Certificate of Indigency

`blotter-complaints` is excluded (a service, not a certificate). Certificate of
Residency is deliberately **not** included — it is not in the public catalog; adding it
there first is the prerequisite if the barangay wants it offered.

The manager defines `CERTIFICATE_SERVICE_IDS` (the three ids above) in
`features/admin/data.ts` and derives select options / display titles from `SERVICES`,
so a catalog rename propagates automatically.

## 4. Seed data (`src/features/admin/data.ts`)

`ADMIN_APPLICATIONS: AdminApplicationRecord[]` — 9 fictional applications:

- Status spread: 4 pending, 3 approved, 2 rejected.
- All three certificate types represented at least twice.
- Filipino applicant names **distinct from `ADMIN_TEAM` and `ADMIN_USER`** (fully
  fictional residents; the stitch export's reuse of "Maria Santos" is not carried over).
- `dateApplied` values in mid-2025, consistent with the rest of the mock content
  timeline; `reviewedAt` ≥ `dateApplied` on reviewed rows.
- Contact data placeholder-shaped: `(077) 600-xxxx` phones, `@example.com`-style or
  omitted emails; addresses are "Purok N, Barangay San Fernando" shaped.
- Reference numbers sequential-ish: `APP-2025-0140` … `APP-2025-0148`.
- `reviewedBy` on reviewed rows: real admin persona names (e.g. "Maria Santos"), since
  staff reviews are done by staff.

## 5. Screen composition (`ApplicationsManager`, client component)

Mirrors the export's layout in amber+ink; same page rhythm as the legislative manager.

1. **Header row** — `<h2>` "Certificate Applications" + subtitle "Manage and review
   incoming requests for barangay certificates and clearances." + primary Button
   "New Application" (Plus icon) opening the create drawer.
2. **Stat cards** — three `AdminStatCard`s **computed from current session state**
   (not hardcoded):
   - Total Applications (`FileText` icon, primary tone) — all rows.
   - Pending Review (`ClipboardList` icon, `danger` tone when count > 0, `secondary`
     when 0) — rows with status `pending`.
   - Approved (`CheckCircle2` icon, secondary tone) — rows with status `approved`.
     (The export's "last 7 days" framing is dropped: seed dates are mid-2025, so a
     rolling window would read 0; a plain count stays truthful and reacts to demo
     approvals.)
3. **Directory card** — Card with wrapping header (title "Application Queue") holding
   an `AdminFilterBar`:
   - search: "Search applicant name…" (matches `applicantName`, case-insensitive; also
     matches `referenceNo` so staff can paste a reference)
   - select: All Certificate Types + one option per certificate service
   - select: All Statuses + Pending / Approved / Rejected
4. **Table** — `DataTable`-style columns: Applicant Name (+ reference number as a
   muted second line), Certificate Type, Date Applied, Status (`StatusChip`),
   Actions ("Review" text button opening the review drawer).
   - Client-side filtering, then `AdminPagination` (page size 6, reset to page 1 on
     any filter change).
   - `AdminEmptyState` when no rows match.

### Session-state mutability (new vs existing managers)

`ApplicationsManager` holds records in `useState(ADMIN_APPLICATIONS)`. Review actions
and new-application submissions **update that state**, so the table, stat cards, and
chips visibly react — the review workflow is demonstrable end-to-end. State is
session-only and resets on refresh; this is correct for a mock and is documented in
`BACKEND_HANDOFF.md`.

## 6. Review drawer (`ApplicationReviewDrawer`)

Opens from a row's "Review" action inside the shared `Drawer` primitive; title
"Application Details".

**Always shown:** reference number + `StatusChip`; applicant block (name, contact
number, email if present, address); request block (certificate type title, purpose,
date applied — formatted with the existing `formatDate` helper).

**Pending applications** additionally show a review form:

- Remarks textarea (label "Remarks", required for **Reject**, optional for **Approve** —
  a rejection without a reason is not actionable for the resident).
- Footer buttons: **Approve** (Button `variant="primary"`) and **Reject** (Button
  `variant="outline-danger"`).
- Submitting either: validates, updates the record in session state
  (`status`, `remarks`, `reviewedBy: ADMIN_USER.name`, `reviewedAt: today`), closes the
  drawer, shows the standard toast `Saved — demo only, backend pending.`

**Reviewed applications** (approved/rejected) instead show a read-only review summary:
decision chip, remarks (or an em-dash when empty), "Reviewed by {name} on {date}".
No actions — re-review is out of scope for the mock.

## 7. New Application drawer (`ApplicationForm`)

Same drawer-form pattern as the existing managers (labels, error text, footer buttons
Cancel / Save):

- Fields: Applicant Name (required), Contact Number (required), Email (optional,
  basic shape check), Address (required), Certificate Type (required select over the
  three certificate services), Purpose (required textarea).
- On valid submit: prepends a new record to session state with `id`/`referenceNo`
  generated from the current maximum sequence, `status: "pending"`,
  `dateApplied: today`; closes; standard toast.

## 8. Components and client boundaries

New files, all in `src/features/admin/components/`:

- `applications-manager.tsx` — `"use client"`; owns session state, filters, pagination,
  drawer open-state.
- `application-review-drawer.tsx` — presentational + review form; receives the record
  and an `onReview(id, values: ApplicationReviewValues)` callback.
- `application-form.tsx` — create form; receives `onSubmit(values: ApplicationFormValues)`.

Reused as-is: `Drawer`, `Toast`, `StatusChip`, `AdminStatCard`, `AdminFilterBar`,
`AdminPagination`, `AdminEmptyState`, `Card`, `Button`, form primitives, `formatDate`.
No new UI primitives. No `LucideIcon` fields on the new data types (icons stay inside
components); the manager imports seed data directly, per the established pattern.

## 9. Accessibility

Same bar as the existing managers: labelled inputs (visible or `sr-only`), drawer focus
trap / Esc / focus restore from the shared primitive, `role="status"` toast, status
conveyed by chip text not color alone, table headers as proper `<th>`. The review
decision buttons are real `<button>`s with visible text labels.

## 10. Verification

- `npm run typecheck`, `npm run lint`, `npm run build` (all routes must stay
  statically prerendered, now 17).
- Runtime drive per `.claude/skills/verify/SKILL.md` at 1280px and 390px:
  navigate to `/admin/applications`; verify stat counts match seed data; search,
  type filter, status filter, pagination; open review drawer on a pending row,
  reject without remarks (error), approve with remarks (row chip updates, stats
  update, toast); open a reviewed row (read-only summary); create a new application
  (validation errors, then successful save prepends a pending row).

## 11. Documentation follow-through

- `docs/BACKEND_HANDOFF.md`: changelog entry; routes table row for
  `/admin/applications`; new entity + `ApplicationFormValues`/`ApplicationReviewValues`
  rows in the type table; note the `serviceId` FK and the session-state-only mutation;
  work-item list updated (application submission/review endpoints join the API surface).
- `CLAUDE.md`: admin-portal bullet updated from five sections to six; client-components
  list gains the applications manager.
