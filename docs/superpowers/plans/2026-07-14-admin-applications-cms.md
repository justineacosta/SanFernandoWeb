# Admin Applications CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Certificate Applications manager to the admin portal — staff review incoming certificate requests (approve/reject with remarks) and encode walk-in applications — as an interactive mock whose typed shapes are the future backend contract.

**Architecture:** New first-class transactional entity `AdminApplicationRecord` (references the public services catalog by `serviceId` FK — *not* an envelope around public content), seed data in `features/admin/data.ts`, and a client `ApplicationsManager` (session-state records, computed stats, filterable table) with two drawers: a review drawer (approve/reject mutates session state) and a create form (prepends a pending record). New `/admin/applications` route + sidebar item.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 tokens. Reuses existing primitives: `Drawer`, `Toast`, `StatusChip`, `AdminStatCard`, `AdminFilterBar`, `AdminPagination`, `AdminEmptyState`, `AdminPageHeader`, `Card`/`CardHeader`, `Button`, `Field`/`Input`/`Select`/`Textarea`, `formatDate`.

**Spec:** `docs/superpowers/specs/2026-07-14-admin-applications-cms-design.md`

**Spec refinements locked here** (discovered while planning; these govern):
1. The admin layout already applies a title template `%s | Barangay Admin`, so the page metadata is `title: "Applications"` (spec §2's full-string example predates checking the template; siblings all use short titles).
2. The create form's submit button label is `Save` (spec §7 says "footer buttons Cancel / Save").

## Global Constraints

- **No test framework exists and none may be added.** Verification = `npm run typecheck` + `npm run lint` + `npm run build` + the runtime browser drive in Task 3.
- Design tokens only: `brand-*`, `ink-*`, `danger*` Tailwind classes. No raw hex, no blue tokens, no green (there is none — "approved" uses the brand tone).
- Toast copy is exactly: `Saved — demo only, backend pending.`
- Identity: San Fernando (never "Sampaguita"), "Municipal …" never "City …", area code (077). Contact data placeholder-shaped.
- No `LucideIcon` fields on data types; icons live inside components. Client managers import seed data directly (icon components are not serializable across the server→client boundary).
- Pages stay thin: metadata + one manager component, imported from the `@/features/admin` barrel.
- Certificate types are exactly the three certificate-issuing `Service.id`s: `barangay-clearance`, `business-permit`, `certificate-of-indigency` (`blotter-complaints` excluded; Certificate of Residency deliberately not added).
- Table/queue behavior: client-side filtering (search matches `applicantName` **and** `referenceNo`, case-insensitive), page size 6, page resets to 1 on any filter change, `AdminEmptyState` when nothing matches.
- Review rules: remarks **required to Reject**, optional to Approve; reviewed rows are read-only (no re-review). Review/create mutate React session state only (refresh resets — intended).
- Work on branch `feature/admin-applications-cms` (create from `main` before Task 1).

---

### Task 1: Contracts, StatusChip entries, seed data, nav item

**Files:**
- Modify: `src/types/index.ts` (three insertions around lines 203–313)
- Modify: `src/features/admin/components/status-chip.tsx` (extend `LABELS`/`TONES`)
- Modify: `src/features/admin/data.ts` (imports, nav item, appended seed block)

**Interfaces:**
- Consumes: existing `Service` type and `SERVICES` from `@/features/services/data`; existing `AdminStatus` union.
- Produces (Task 2 relies on these exact names): types `ApplicationStatus`, `AdminApplicationRecord`, `ApplicationFormValues`, `ApplicationReviewValues` from `@/types`; data exports `ADMIN_APPLICATIONS: AdminApplicationRecord[]`, `CERTIFICATE_SERVICES: { id: string; title: string }[]`, `certificateTitle(serviceId: string): string` from `@/features/admin/data`; `StatusChip` accepting `"pending" | "approved" | "rejected"`.

- [ ] **Step 1: Add the status + record types to `src/types/index.ts`**

Three edits. First, directly below the line `export type AdminEventStatus = "published" | "planning";` (before `export type EventCategory`), add:

```ts
export type ApplicationStatus = "pending" | "approved" | "rejected";
```

Second, extend the `AdminStatus` union. Replace:

```ts
export type AdminStatus =
  | AdminContentStatus
  | AdminServiceStatus
  | AdminLegislativeStatus
  | AdminEventStatus;
```

with:

```ts
export type AdminStatus =
  | AdminContentStatus
  | AdminServiceStatus
  | AdminLegislativeStatus
  | AdminEventStatus
  | ApplicationStatus;
```

Third, immediately after the closing brace of `AdminLegislativeRecord` (before `export type TeamRole`), add:

```ts
/**
 * A resident's certificate/clearance request — a first-class transactional record
 * (not an envelope around public content). References the services catalog by id.
 */
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

- [ ] **Step 2: Add the form/action contracts to `src/types/index.ts`**

Immediately after the closing brace of `LegislativeFormValues` (before the `/* --- About --- */` divider), add:

```ts
export interface ApplicationFormValues {
  applicantName: string;
  contactNumber: string;
  email?: string;
  address: string;
  /** FK to `Service.id`. */
  serviceId: string;
  purpose: string;
}

/** The future review-action (PATCH) body. */
export interface ApplicationReviewValues {
  status: "approved" | "rejected";
  /** Required when rejecting; optional when approving. */
  remarks: string;
}
```

- [ ] **Step 3: Extend `StatusChip` maps in `src/features/admin/components/status-chip.tsx`**

Replace the two map literals with:

```ts
const LABELS: Record<AdminStatus, string> = {
  published: "Published",
  scheduled: "Scheduled",
  draft: "Draft",
  "in-review": "In Review",
  active: "Active",
  inactive: "Inactive",
  "under-review": "Under Review",
  archived: "Archived",
  planning: "Planning",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const TONES: Record<AdminStatus, string> = {
  published: "bg-brand-100 text-brand-800",
  active: "bg-brand-100 text-brand-800",
  approved: "bg-brand-100 text-brand-800",
  scheduled: "bg-ink-100 text-ink-700",
  pending: "bg-ink-100 text-ink-700",
  draft: "bg-ink-100 text-ink-600",
  planning: "bg-ink-100 text-ink-600",
  "in-review": "bg-danger-soft text-danger-soft-fg",
  "under-review": "bg-danger-soft text-danger-soft-fg",
  rejected: "bg-danger-soft text-danger-soft-fg",
  inactive: "bg-ink-100 text-ink-500",
  archived: "bg-ink-100 text-ink-500",
};
```

- [ ] **Step 4: Update `src/features/admin/data.ts` — imports and nav**

In the `lucide-react` import list, add `Inbox,` after `IdCard,` (keep alphabetical order).

In the `import type { … } from "@/types"` list, add `AdminApplicationRecord,` as the first entry (alphabetical).

In `ADMIN_NAV_ITEMS`, insert a third item between "Services Management" and "Ordinance & Resolution":

```ts
  { label: "Applications", href: "/admin/applications", icon: Inbox },
```

Final nav order: Dashboard Overview, Services Management, Applications, Ordinance & Resolution, Event Calendar, News & Announcements, Settings.

- [ ] **Step 5: Append the certificate-services helpers and seed data to `src/features/admin/data.ts`**

Append at the end of the file (after `ADMIN_TEAM`):

```ts
/* ------------------------- Certificate applications ------------------------- */

const CERTIFICATE_SERVICE_IDS = new Set([
  "barangay-clearance",
  "business-permit",
  "certificate-of-indigency",
]);

/** Certificate-issuing subset of the public catalog — select options + display titles. */
export const CERTIFICATE_SERVICES: { id: string; title: string }[] = SERVICES.filter(
  (service) => CERTIFICATE_SERVICE_IDS.has(service.id),
).map((service) => ({ id: service.id, title: service.title }));

/** Display title for an application's serviceId; falls back to the raw id. */
export function certificateTitle(serviceId: string): string {
  return CERTIFICATE_SERVICES.find((service) => service.id === serviceId)?.title ?? serviceId;
}

/**
 * Fictional applicants (names distinct from the admin team and real officials);
 * ordered newest-first. 4 pending / 3 approved / 2 rejected.
 */
export const ADMIN_APPLICATIONS: AdminApplicationRecord[] = [
  {
    id: "app-0148",
    referenceNo: "APP-2025-0148",
    applicantName: "Erlinda Buenaventura",
    contactNumber: "(077) 600-4181",
    email: "e.buenaventura@example.com",
    address: "Purok 2, Barangay San Fernando",
    serviceId: "barangay-clearance",
    purpose: "Employment requirement for a job application in Laoag City.",
    dateApplied: "2025-06-14",
    status: "pending",
  },
  {
    id: "app-0147",
    referenceNo: "APP-2025-0147",
    applicantName: "Marco Villanueva",
    contactNumber: "(077) 600-4172",
    address: "Purok 5, Barangay San Fernando",
    serviceId: "business-permit",
    purpose: "Renewal recommendation for an existing sari-sari store permit.",
    dateApplied: "2025-06-13",
    status: "pending",
  },
  {
    id: "app-0146",
    referenceNo: "APP-2025-0146",
    applicantName: "Cristina Agbayani",
    contactNumber: "(077) 600-4163",
    email: "cagbayani@example.com",
    address: "Purok 1, Barangay San Fernando",
    serviceId: "certificate-of-indigency",
    purpose:
      "Medical assistance application with the Municipal Social Welfare and Development Office.",
    dateApplied: "2025-06-11",
    status: "pending",
  },
  {
    id: "app-0145",
    referenceNo: "APP-2025-0145",
    applicantName: "Ferdinand Salazar",
    contactNumber: "(077) 600-4154",
    address: "Purok 7, Barangay San Fernando",
    serviceId: "barangay-clearance",
    purpose: "Requirement for opening a bank account.",
    dateApplied: "2025-06-09",
    status: "pending",
  },
  {
    id: "app-0144",
    referenceNo: "APP-2025-0144",
    applicantName: "Teresita Manuel",
    contactNumber: "(077) 600-4145",
    email: "t.manuel@example.com",
    address: "Purok 4, Barangay San Fernando",
    serviceId: "certificate-of-indigency",
    purpose: "Scholarship application for her daughter's college tuition assistance.",
    dateApplied: "2025-06-05",
    status: "approved",
    remarks: "Household verified in the RBI; indigency confirmed.",
    reviewedBy: "Maria Santos",
    reviewedAt: "2025-06-06",
  },
  {
    id: "app-0143",
    referenceNo: "APP-2025-0143",
    applicantName: "Rolando Pascua",
    contactNumber: "(077) 600-4136",
    address: "Purok 6, Barangay San Fernando",
    serviceId: "business-permit",
    purpose: "New barbershop business registration with the municipal licensing office.",
    dateApplied: "2025-06-02",
    status: "rejected",
    remarks:
      "Proposed site is within a residential-only zone; applicant advised to secure a zoning clearance first.",
    reviewedBy: "Maria Santos",
    reviewedAt: "2025-06-03",
  },
  {
    id: "app-0142",
    referenceNo: "APP-2025-0142",
    applicantName: "Josefina Alcantara",
    contactNumber: "(077) 600-4127",
    email: "jalcantara@example.com",
    address: "Purok 3, Barangay San Fernando",
    serviceId: "barangay-clearance",
    purpose: "Police clearance prerequisite for overseas employment processing.",
    dateApplied: "2025-05-28",
    status: "approved",
    reviewedBy: "Maria Santos",
    reviewedAt: "2025-05-29",
  },
  {
    id: "app-0141",
    referenceNo: "APP-2025-0141",
    applicantName: "Benjamin Corpuz",
    contactNumber: "(077) 600-4118",
    address: "Purok 5, Barangay San Fernando",
    serviceId: "certificate-of-indigency",
    purpose: "Tuition fee discount application at Ilocos Norte National High School.",
    dateApplied: "2025-05-22",
    status: "rejected",
    remarks: "Applicant's household income exceeds the indigency threshold per CBMS 2024 records.",
    reviewedBy: "Maria Santos",
    reviewedAt: "2025-05-24",
  },
  {
    id: "app-0140",
    referenceNo: "APP-2025-0140",
    applicantName: "Lourdes Domingo",
    contactNumber: "(077) 600-4109",
    email: "l.domingo@example.com",
    address: "Purok 1, Barangay San Fernando",
    serviceId: "business-permit",
    purpose: "Business permit recommendation for a home-based bakery.",
    dateApplied: "2025-05-19",
    status: "approved",
    remarks: "Sanitary permit already on file; endorsed to the municipal licensing office.",
    reviewedBy: "Maria Santos",
    reviewedAt: "2025-05-20",
  },
];
```

Note: `app-0142` (approved) deliberately has no `remarks` — it exercises the em-dash branch in the review summary (Task 2).

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: exit 0, no output.

Run: `npm run lint`
Expected: exit 0 (no warnings/errors).

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/features/admin/components/status-chip.tsx src/features/admin/data.ts
git commit -m "feat(admin): application contracts, statuses, seed data, nav item"
```

---

### Task 2: ApplicationsManager, review drawer, create form, route

**Files:**
- Create: `src/features/admin/components/applications-manager.tsx`
- Create: `src/features/admin/components/application-review-drawer.tsx`
- Create: `src/features/admin/components/application-form.tsx`
- Create: `src/app/admin/applications/page.tsx`
- Modify: `src/features/admin/index.ts` (barrel export)

**Interfaces:**
- Consumes (from Task 1): `AdminApplicationRecord`, `ApplicationFormValues`, `ApplicationReviewValues` from `@/types`; `ADMIN_APPLICATIONS`, `ADMIN_USER`, `CERTIFICATE_SERVICES`, `certificateTitle` from `@/features/admin/data`; `StatusChip` (statuses `pending`/`approved`/`rejected`). Existing primitives: `Drawer({open, onClose, title, children})`, `Toast({message, onDismiss})`, `AdminPageHeader({title, description, action})`, `AdminStatCard({icon, label, value, tone?})`, `AdminFilterBar({search?, selects?})`, `AdminPagination({page, pageSize, total, onPageChange, className?})`, `AdminEmptyState({message, onClear})`, `Button` (variants `primary`, `ghost`, `outline-danger`; defaults to `type="button"`), `Field`/`Input`/`Select`/`Textarea` from `@/components/ui/form`, `formatDate` from `@/lib/format`.
- Produces: `ApplicationsManager` exported from the `@/features/admin` barrel; route `/admin/applications`.

- [ ] **Step 1: Create `src/features/admin/components/application-review-drawer.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { AdminApplicationRecord, ApplicationReviewValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { certificateTitle } from "@/features/admin/data";
import { StatusChip } from "./status-chip";

interface ApplicationReviewDrawerProps {
  record: AdminApplicationRecord;
  onReview: (id: string, values: ApplicationReviewValues) => void;
  onCancel: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{value}</dd>
    </div>
  );
}

/** Full application submission; approve/reject with remarks on pending rows (mock review). */
export function ApplicationReviewDrawer({
  record,
  onReview,
  onCancel,
}: ApplicationReviewDrawerProps) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ApplicationReviewValues["status"] | null>(null);

  const submit = (status: ApplicationReviewValues["status"]) => {
    if (status === "rejected" && !remarks.trim()) {
      setError("Remarks are required when rejecting an application.");
      return;
    }
    setError(null);
    setSaving(status);
    setTimeout(() => {
      setSaving(null);
      onReview(record.id, { status, remarks: remarks.trim() });
    }, 600);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink-900">{record.referenceNo}</p>
          <StatusChip status={record.status} />
        </div>
        <dl className="space-y-4">
          <DetailRow label="Applicant" value={record.applicantName} />
          <DetailRow label="Contact Number" value={record.contactNumber} />
          {record.email ? <DetailRow label="Email" value={record.email} /> : null}
          <DetailRow label="Address" value={record.address} />
          <DetailRow label="Certificate Type" value={certificateTitle(record.serviceId)} />
          <DetailRow label="Purpose" value={record.purpose} />
          <DetailRow label="Date Applied" value={formatDate(record.dateApplied)} />
        </dl>
        {record.status === "pending" ? (
          <Field label="Remarks" htmlFor="application-remarks">
            <Textarea
              id="application-remarks"
              rows={4}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional for approval; required when rejecting."
              aria-invalid={Boolean(error)}
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </Field>
        ) : (
          <div className="rounded-2xl border border-ink-200/70 bg-ink-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Review Summary
            </p>
            <p className="mt-2 text-sm text-ink-900">{record.remarks ?? "—"}</p>
            {record.reviewedBy && record.reviewedAt ? (
              <p className="mt-2 text-sm text-ink-600">
                Reviewed by {record.reviewedBy} on {formatDate(record.reviewedAt)}
              </p>
            ) : null}
          </div>
        )}
      </div>
      {record.status === "pending" ? (
        <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
          <Button
            variant="outline-danger"
            onClick={() => submit("rejected")}
            disabled={saving !== null}
          >
            {saving === "rejected" ? "Rejecting…" : "Reject"}
          </Button>
          <Button onClick={() => submit("approved")} disabled={saving !== null}>
            {saving === "approved" ? "Approving…" : "Approve"}
          </Button>
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

- [ ] **Step 2: Create `src/features/admin/components/application-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { ApplicationFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { CERTIFICATE_SERVICES } from "@/features/admin/data";

interface ApplicationFormProps {
  onSubmit: (values: ApplicationFormValues) => void;
  onCancel: () => void;
}

/** Walk-in application encoding form. Validates, then fake-saves as a pending record. */
export function ApplicationForm({ onSubmit, onCancel }: ApplicationFormProps) {
  const [values, setValues] = useState<ApplicationFormValues>({
    applicantName: "",
    contactNumber: "",
    email: "",
    address: "",
    serviceId: CERTIFICATE_SERVICES[0]?.id ?? "",
    purpose: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ApplicationFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ApplicationFormValues>(key: K, value: ApplicationFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.applicantName.trim()) nextErrors.applicantName = "Applicant name is required.";
    if (!values.contactNumber.trim()) nextErrors.contactNumber = "Contact number is required.";
    if (values.email?.trim() && !/^\S+@\S+\.\S+$/.test(values.email.trim()))
      nextErrors.email = "Enter a valid email address.";
    if (!values.address.trim()) nextErrors.address = "Address is required.";
    if (!values.purpose.trim()) nextErrors.purpose = "Purpose is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onSubmit(values);
    }, 600);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Applicant Name" htmlFor="application-name">
          <Input
            id="application-name"
            value={values.applicantName}
            onChange={(event) => set("applicantName", event.target.value)}
            aria-invalid={Boolean(errors.applicantName)}
          />
          {errors.applicantName ? (
            <p className="text-sm text-danger">{errors.applicantName}</p>
          ) : null}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact Number" htmlFor="application-contact">
            <Input
              id="application-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
              aria-invalid={Boolean(errors.contactNumber)}
            />
            {errors.contactNumber ? (
              <p className="text-sm text-danger">{errors.contactNumber}</p>
            ) : null}
          </Field>
          <Field label="Email (optional)" htmlFor="application-email">
            <Input
              id="application-email"
              type="email"
              value={values.email ?? ""}
              onChange={(event) => set("email", event.target.value)}
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email ? <p className="text-sm text-danger">{errors.email}</p> : null}
          </Field>
        </div>
        <Field label="Address" htmlFor="application-address">
          <Input
            id="application-address"
            placeholder="Purok 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
            aria-invalid={Boolean(errors.address)}
          />
          {errors.address ? <p className="text-sm text-danger">{errors.address}</p> : null}
        </Field>
        <Field label="Certificate Type" htmlFor="application-service">
          <Select
            id="application-service"
            value={values.serviceId}
            onChange={(event) => set("serviceId", event.target.value)}
          >
            {CERTIFICATE_SERVICES.map((service) => (
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
            aria-invalid={Boolean(errors.purpose)}
          />
          {errors.purpose ? <p className="text-sm text-danger">{errors.purpose}</p> : null}
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create `src/features/admin/components/applications-manager.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, FileText, Plus } from "lucide-react";
import type {
  AdminApplicationRecord,
  ApplicationFormValues,
  ApplicationReviewValues,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  ADMIN_APPLICATIONS,
  ADMIN_USER,
  CERTIFICATE_SERVICES,
  certificateTitle,
} from "@/features/admin/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { ApplicationForm } from "./application-form";
import { ApplicationReviewDrawer } from "./application-review-drawer";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

/** Today's date as a local ISO string (YYYY-MM-DD). */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Certificate application queue: computed stats, filterable table, review + create
 * drawers. Records live in session state only — approvals/rejections and new
 * applications mutate React state and reset on refresh (mock; backend pending).
 */
export function ApplicationsManager() {
  const [records, setRecords] = useState<AdminApplicationRecord[]>(ADMIN_APPLICATIONS);
  const [search, setSearch] = useState("");
  const [serviceId, setServiceId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const totalCount = records.length;
  const pendingCount = records.filter((record) => record.status === "pending").length;
  const approvedCount = records.filter((record) => record.status === "approved").length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter(
      (record) =>
        (query === "" ||
          record.applicantName.toLowerCase().includes(query) ||
          record.referenceNo.toLowerCase().includes(query)) &&
        (serviceId === "all" || record.serviceId === serviceId) &&
        (status === "all" || record.status === status),
    );
  }, [records, search, serviceId, status]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reviewing = reviewingId
    ? (records.find((record) => record.id === reviewingId) ?? null)
    : null;

  const openReview = (record: AdminApplicationRecord) => {
    setReviewingId(record.id);
    setReviewOpen(true);
  };

  const handleReview = (id: string, values: ApplicationReviewValues) => {
    setRecords((prev) =>
      prev.map((record) =>
        record.id === id
          ? {
              ...record,
              status: values.status,
              remarks: values.remarks || undefined,
              reviewedBy: ADMIN_USER.name,
              reviewedAt: todayIso(),
            }
          : record,
      ),
    );
    setReviewOpen(false);
    setToast("Saved — demo only, backend pending.");
  };

  const handleCreate = (values: ApplicationFormValues) => {
    const nextSequence =
      Math.max(...records.map((record) => Number(record.referenceNo.slice(-4)) || 0)) + 1;
    const sequence = String(nextSequence).padStart(4, "0");
    const record: AdminApplicationRecord = {
      id: `app-${sequence}`,
      referenceNo: `APP-${new Date().getFullYear()}-${sequence}`,
      applicantName: values.applicantName,
      contactNumber: values.contactNumber,
      email: values.email?.trim() ? values.email.trim() : undefined,
      address: values.address,
      serviceId: values.serviceId,
      purpose: values.purpose,
      dateApplied: todayIso(),
      status: "pending",
    };
    setRecords((prev) => [record, ...prev]);
    setCreateOpen(false);
    setPage(1);
    setToast("Saved — demo only, backend pending.");
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
          <Button onClick={() => setCreateOpen(true)}>
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
          label="Approved"
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
                placeholder: "Search applicant name…",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
              selects={[
                {
                  id: "application-service-filter",
                  label: "Certificate type",
                  value: serviceId,
                  options: [
                    { value: "all", label: "All Certificate Types" },
                    ...CERTIFICATE_SERVICES.map((service) => ({
                      value: service.id,
                      label: service.title,
                    })),
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
          <AdminEmptyState message="No applications match your filters." onClear={clearFilters} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th scope="col" className="px-6 py-4">Applicant</th>
                    <th scope="col" className="px-6 py-4">Certificate Type</th>
                    <th scope="col" className="px-6 py-4">Date Applied</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-ink-900">{record.applicantName}</p>
                        <p className="text-xs text-ink-500">{record.referenceNo}</p>
                      </td>
                      <td className="px-6 py-4 text-ink-600">
                        {certificateTitle(record.serviceId)}
                      </td>
                      <td className="px-6 py-4 text-ink-600">{formatDate(record.dateApplied)}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openReview(record)}
                          aria-label={`Review ${record.referenceNo}`}
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
      <Drawer
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Application Details"
      >
        {reviewOpen && reviewing ? (
          <ApplicationReviewDrawer
            key={reviewing.id}
            record={reviewing}
            onReview={handleReview}
            onCancel={() => setReviewOpen(false)}
          />
        ) : null}
      </Drawer>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New Application">
        {createOpen ? (
          <ApplicationForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
```

- [ ] **Step 4: Add the barrel export**

In `src/features/admin/index.ts`, add after the `ServicesManager` line:

```ts
export { ApplicationsManager } from "./components/applications-manager";
```

- [ ] **Step 5: Create `src/app/admin/applications/page.tsx`**

```tsx
import type { Metadata } from "next";
import { ApplicationsManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "Applications",
};

export default function AdminApplicationsPage() {
  return <ApplicationsManager />;
}
```

(The admin layout's title template `%s | Barangay Admin` completes the browser title.)

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run lint`
Expected: exit 0.

Run: `npm run build`
Expected: success; the route list includes `○ /admin/applications` (static) — 17 static routes total.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/components/applications-manager.tsx src/features/admin/components/application-review-drawer.tsx src/features/admin/components/application-form.tsx src/features/admin/index.ts src/app/admin/applications/page.tsx
git commit -m "feat(admin): certificate applications manager with review + create drawers"
```

---

### Task 3: Runtime verification

**Files:**
- Read: `.claude/skills/verify/SKILL.md` (the runtime-verification recipe — follow it to drive system Chrome via playwright-core against the dev server)
- Write: screenshots to `.superpowers/sdd/shots/` (filenames prefixed `applications-`)

**Interfaces:**
- Consumes: the running app (dev server on `http://localhost:3000` — check whether it is already running before starting another) with Tasks 1–2 merged in the working tree.
- Produces: a pass/fail report per check below; screenshots as evidence. Any failing check is a defect in Task 1/2 code — report it, do not silently patch unrelated files.

- [ ] **Step 1: Read the verify skill and confirm the dev server serves `/admin/applications`**

- [ ] **Step 2: Desktop checks (1280×800)** — all against `http://localhost:3000/admin/applications`:

1. Page renders: header "Certificate Applications", sidebar shows "Applications" as the third item, highlighted active.
2. Stat cards read Total Applications **9**, Pending Review **4** (danger tone), Approved **3**.
3. Table shows 6 rows (page 1 of 9), newest first: Erlinda Buenaventura (APP-2025-0148, Pending) at top.
4. Pagination: "Showing 1 to 6 of 9 entries"; page 2 shows the remaining 3.
5. Search `erlinda` → 1 row. Clear, search `APP-2025-0140` → 1 row (Lourdes Domingo).
6. Certificate-type filter "Certificate of Indigency" → 3 rows; status filter "Rejected" (type back to all) → 2 rows. Combined nonsense filters → empty state with working "Clear filters".
7. Review a pending row (Ferdinand Salazar): drawer "Application Details" shows all fields; click **Reject** with empty remarks → inline error "Remarks are required when rejecting an application."; type remarks, click **Approve** → drawer closes, toast `Saved — demo only, backend pending.`, row chip becomes Approved, stats now 9 / 3 / 4.
8. Open an already-approved row without remarks (Josefina Alcantara, APP-2025-0142): read-only Review Summary shows "—" and "Reviewed by Maria Santos on May 29, 2025"; only a Close button. Open a rejected row (Rolando Pascua) and confirm its remarks text shows.
9. New Application: submit empty → per-field errors; fill valid values → drawer closes, toast, new Pending row appears at the top of page 1, Total Applications 10, reference `APP-<current year>-0149`.
10. Esc closes an open drawer; focus returns to the page.

- [ ] **Step 3: Mobile checks (390×844)**

1. Stat cards stack vertically; the filter bar wraps; the table scrolls horizontally inside its card (no page-level horizontal scroll).
2. Both drawers are usable at 390px.

- [ ] **Step 4: Save screenshots** of: the default page (both widths), the review drawer (pending + reviewed), the rejection-validation error, the create form with errors, and the post-approval table state, into `.superpowers/sdd/shots/`.

- [ ] **Step 5: Commit** (only if fixes were needed and made; screenshots and ledger are git-ignored scratch — otherwise nothing to commit).

---

### Task 4: Documentation follow-through

**Files:**
- Modify: `docs/BACKEND_HANDOFF.md` (changelog, routes table, §2 type table, §3E, §4 API surface, §5 client islands)
- Modify: `CLAUDE.md` (admin-portal bullet)

**Interfaces:**
- Consumes: the shipped feature from Tasks 1–2 (names as produced there).
- Produces: docs that describe the six-section admin portal accurately.

- [ ] **Step 1: `docs/BACKEND_HANDOFF.md` — changelog**

The header changelog's last entry is a blockquote beginning `> **Updated 2026-07-13 (admin buildout):**` and ending `…auth remains work item E1.`. Directly after that blockquote (before the `---`), add:

```markdown
>
> **Updated 2026-07-14 (applications CMS):** new **Certificate Applications** section at
> `/admin/applications` (spec: `docs/superpowers/specs/2026-07-14-admin-applications-cms-design.md`).
> Unlike the other managers it introduces a first-class transactional entity —
> `AdminApplicationRecord` in `src/types/index.ts`, referencing the public services catalog
> by `serviceId` FK — plus `ApplicationFormValues` (submission POST body) and
> `ApplicationReviewValues` (approve/reject PATCH body). Approve/reject and walk-in
> encoding mutate **React session state only** (a refresh resets them); saves are
> toast-faked like the rest of the portal.
```

- [ ] **Step 2: `docs/BACKEND_HANDOFF.md` — admin routes table**

In the admin routes table (§1), add directly after the `/admin/services` row:

```markdown
| `/admin/applications` | Certificate Applications | `ApplicationsManager` (stat cards + queue + review/create drawers) |
```

- [ ] **Step 3: `docs/BACKEND_HANDOFF.md` — §2 type table**

Add a row directly after the `AdminServiceRecord`, … `*FormValues` row:

```markdown
| `AdminApplicationRecord`, `ApplicationStatus`, `ApplicationFormValues`, `ApplicationReviewValues` | Admin applications queue | First-class transactional entity (not an envelope): references `Service` by `serviceId` FK; status flow `pending → approved \| rejected`; form values = submission POST body, review values = review PATCH body |
```

- [ ] **Step 4: `docs/BACKEND_HANDOFF.md` — §3E**

Replace the sentence fragment:

```markdown
The admin **UI now exists in full** (`/admin` content hub + interactive mock screens for services, ordinances & resolutions, events, news, and settings), but it is unprotected and shows mock data.
```

with:

```markdown
The admin **UI now exists in full** (`/admin` content hub + interactive mock screens for services, certificate applications, ordinances & resolutions, events, news, and settings), but it is unprotected and shows mock data.
```

Then add a fifth numbered item after item 4 ("**Editors** — …building forms from scratch."):

```markdown
5. **Application processing** — `/admin/applications` models the certificate-request
   queue end-to-end: `POST /api/applications` (`ApplicationFormValues`) for walk-in or
   citizen submissions and `PATCH /api/applications/:id/review`
   (`ApplicationReviewValues`) for approve/reject with remarks (remarks required on
   rejection). Status flow: `pending → approved | rejected`. The mock mutates session
   state only; the reviewer identity comes from `ADMIN_USER` pending real auth (item 1).
```

- [ ] **Step 5: `docs/BACKEND_HANDOFF.md` — §4 API surface**

Inside the §4 code block, after the `GET  /api/settings` line and before the `POST /api/inquiries` line, add:

```
GET  /api/admin/applications?status=&serviceId=&q=&page= → AdminApplicationRecord[]
POST /api/applications                    → ApplicationFormValues (new pending application)
PATCH /api/admin/applications/:id/review  → ApplicationReviewValues (approve/reject)
```

- [ ] **Step 6: `docs/BACKEND_HANDOFF.md` — §5 client islands**

In the §5 "Client islands only when interactive" bullet, two single-line replacements:

Replace the line fragment:
```
the five section managers, their
```
with:
```
the six section managers, their
```

Replace the line fragment:
```
  drawer forms, `MiniCalendar`, `ToggleSwitch`,
```
with:
```
  drawer forms and the application review drawer, `MiniCalendar`, `ToggleSwitch`,
```

- [ ] **Step 7: `CLAUDE.md` — admin-portal bullet**

In the Architecture section's first bullet, two replacements (Read the file first to confirm exact line wrapping):

Replace:
```
five sections over typed seed data in
```
with:
```
six sections over typed seed data in
```

Replace the fragment containing `that wraps the public content; drawer editors fake-save` with:
```
— mostly wrapping the public content; applications are first-class records keyed by `serviceId`; drawer editors fake-save
```
so the bullet ends: `…typed seed data in `features/admin/data.ts` — mostly wrapping the public content; applications are first-class records keyed by `serviceId`; drawer editors fake-save).`

- [ ] **Step 8: Verify**

Run: `npm run lint`
Expected: exit 0 (docs are not linted, but confirms nothing else broke).

Skim the rendered diffs: no remaining claim of "five sections" or a services/legislative/events/news/settings-only enumeration in either file. Run: `git grep -n "five section" docs/ CLAUDE.md` → no matches.

- [ ] **Step 9: Commit**

```bash
git add docs/BACKEND_HANDOFF.md CLAUDE.md
git commit -m "docs: record applications CMS in backend handoff and CLAUDE.md"
```
