# Admin Dashboard Buildout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four `/admin` placeholder stubs with interactive mock screens (Services, Events, News, Settings) plus a new Ordinance & Resolution section, locking in the typed admin data contracts for the future backend.

**Architecture:** Each admin section is a `"use client"` "manager" component in `src/features/admin/components/` that imports typed seed data directly from `features/admin/data.ts` (seed data wraps the *same records the public site renders* in admin envelope types; managers import rather than receive props because the wrapped entities carry `LucideIcon` components, which are not serializable across the server→client boundary). Pages stay thin Server Components. Shared primitives (`StatusChip`, `AdminFilterBar`, `AdminPagination`, `AdminStatCard`, `AdminEmptyState`, `Drawer`, `Toast`) are built once. Create/edit forms live in a reusable right slide-over `Drawer`, validate, and fake-save (600 ms delay → toast → close; no list mutation).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4 (amber+ink `@theme` tokens), lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-13-admin-dashboard-buildout-design.md`. Two plan-time refinements to the spec: (1) `EventCategory` values are `"town-hall" | "health-drive" | "festival" | "youth" | "environment" | "community"` (fits the real seeded events better than the spec's illustrative `sports`/`livelihood`); (2) managers import seed data directly instead of receiving it as props (icon serialization, above).

## Global Constraints

- **No test framework** (CLAUDE.md). Per-task verification = `npm run typecheck` + `npm run lint`, both exit 0. Final task adds `npm run build` + runtime drive via the `verify` skill (`.claude/skills/verify/SKILL.md`).
- **Design tokens only**: `brand-*`, `ink-*`, `danger*` classes — no raw hex, no blue tokens.
- Identity is **San Fernando** ("Sampaguita" is a regression); "Municipal …" never "City …"; phones use the (077) area code and are placeholder-shaped.
- Pages in `src/app/` stay thin (metadata + one feature component). Content lives in `data.ts`, never hardcoded in components.
- New type fields must not carry `LucideIcon` (wrapped public entities that already do are grandfathered); icon lookups live in components.
- `"use client"` only on genuinely interactive files.
- Path alias `@/*` → `src/*`. Dates are ISO strings formatted via `src/lib/format.ts`.
- Copy for every fake-save toast: exactly `Saved — demo only, backend pending.`
- Commit after each task.

## File Structure

```
src/types/index.ts                                    # MODIFY: admin envelope + form-value types
src/lib/format.ts                                     # MODIFY: add formatCount()
src/features/admin/data.ts                            # MODIFY: seed data, nav item, ADMIN_USER contact
src/features/admin/index.ts                           # MODIFY: barrel exports per task
src/features/admin/components/
  status-chip.tsx            # CREATE (server-safe)   admin-stat-card.tsx        # CREATE (server-safe)
  admin-filter-bar.tsx       # CREATE                 admin-pagination.tsx       # CREATE
  admin-empty-state.tsx      # CREATE                 services-manager.tsx       # CREATE (client)
  service-form.tsx           # CREATE (client)        legislative-manager.tsx    # CREATE (client)
  legislative-form.tsx       # CREATE (client)        news-manager.tsx           # CREATE (client)
  news-form.tsx              # CREATE (client)        events-manager.tsx         # CREATE (client)
  event-form.tsx             # CREATE (client)        mini-calendar.tsx          # CREATE (client)
  settings-panel.tsx         # CREATE (client)        toggle-switch.tsx          # CREATE (client)
  admin-topbar.tsx           # MODIFY (rename)        admin-placeholder.tsx      # DELETE (Task 9)
src/components/ui/drawer.tsx                          # CREATE (client)
src/components/ui/toast.tsx                           # CREATE (client)
src/app/admin/services/page.tsx                       # MODIFY
src/app/admin/legislative/page.tsx                    # CREATE
src/app/admin/news/page.tsx                           # MODIFY
src/app/admin/events/page.tsx                         # MODIFY
src/app/admin/settings/page.tsx                       # MODIFY
docs/BACKEND_HANDOFF.md, CLAUDE.md                    # MODIFY (Task 9)
```

---

### Task 1: Admin types and seed data

**Files:**
- Modify: `src/types/index.ts` (append to the `/* Admin */` section, after `ContentTypeAction`)
- Modify: `src/features/admin/data.ts`

**Interfaces:**
- Consumes: existing `Service`, `CommunityEvent`, `NewsArticle`, `LegislativeDocument` types; `SERVICES` (features/services/data.ts), `UPCOMING_EVENTS` (features/home/data.ts), `FEATURED_ARTICLE`/`NEWS_ARTICLES` (features/announcements/data.ts), `ORDINANCES`/`RESOLUTIONS` (features/transparency/data.ts).
- Produces: all `Admin*` types and `*FormValues` below; seed arrays `ADMIN_SERVICES`, `ADMIN_EVENTS`, `ADMIN_NEWS`, `ADMIN_LEGISLATIVE`, `ADMIN_TEAM`; label maps `EVENT_CATEGORY_LABELS`, `TEAM_ROLE_LABELS`; `ADMIN_USER` gains `email` + `phone`.

- [ ] **Step 1: Add admin types to `src/types/index.ts`**

Append inside the Admin section (after `ContentTypeAction`, before the About section):

```ts
/* ----------------------- Admin content management (mock CMS) --------------------- */
/* Envelope types wrapping the public entities the admin portal manages. These are    */
/* the de-facto write-side contract for the future backend (see BACKEND_HANDOFF §3E). */

export type AdminContentStatus = "published" | "scheduled" | "draft" | "in-review";
export type AdminServiceStatus = "active" | "inactive";
export type AdminLegislativeStatus = "active" | "under-review" | "archived";
export type AdminEventStatus = "published" | "planning";
export type EventCategory =
  | "town-hall"
  | "health-drive"
  | "festival"
  | "youth"
  | "environment"
  | "community";

/** Every status a StatusChip can render. */
export type AdminStatus =
  | AdminContentStatus
  | AdminServiceStatus
  | AdminLegislativeStatus
  | AdminEventStatus;

export interface AdminServiceRecord {
  /** `Service.id` for real rows; `mock-*` for demo-only extras. */
  id: string;
  service: Service;
  department: string;
  status: AdminServiceStatus;
  /** ISO date of the last edit. */
  updatedAt: string;
}

export interface AdminEventRecord {
  id: string;
  /** The public entity has no id — the envelope provides it. */
  event: CommunityEvent;
  category: EventCategory;
  status: AdminEventStatus;
  registered?: number;
  capacity?: number;
  volunteers?: number;
  /** Free-form footnote for planning-stage events, e.g. "Registration opens August 1st". */
  note?: string;
}

export interface AdminNewsRecord {
  id: string;
  article: NewsArticle;
  status: AdminContentStatus;
  /** Published posts only. */
  views?: number;
  /** ISO datetime; scheduled posts only. */
  scheduledFor?: string;
  /** ISO date of the last edit. */
  updatedAt: string;
}

export interface AdminLegislativeRecord {
  id: string;
  document: LegislativeDocument;
  /** The public data splits by array; the envelope makes the type explicit. */
  type: "ordinance" | "resolution";
  status: AdminLegislativeStatus;
}

export type TeamRole = "super-admin" | "editor" | "viewer";

export interface AdminTeamMember {
  name: string;
  role: TeamRole;
  initials: string;
  isCurrentUser?: boolean;
}

/* Drawer-form value shapes — the future POST/PUT body contracts. */

export interface ServiceFormValues {
  title: string;
  description: string;
  department: string;
  /** Newline-separated list in the mock UI. */
  requirements: string;
  status: AdminServiceStatus;
}

export interface EventFormValues {
  title: string;
  category: EventCategory;
  /** ISO date. */
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  capacity?: number;
  description: string;
}

export interface NewsPostFormValues {
  title: string;
  category: string;
  excerpt: string;
  body: string;
  status: AdminContentStatus;
  /** Required when status is "scheduled". */
  scheduledFor?: string;
}

export interface LegislativeFormValues {
  type: "ordinance" | "resolution";
  /** e.g. "Ordinance No. 05-2024". */
  number: string;
  title: string;
  /** ISO date. */
  datePassed: string;
  summary: string;
  status: AdminLegislativeStatus;
}
```

- [ ] **Step 2: Extend `src/features/admin/data.ts` with seed data**

Replace the import block at the top of the file with:

```ts
import {
  CalendarDays,
  Gavel,
  IdCard,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  PartyPopper,
  ScrollText,
  Settings,
} from "lucide-react";
import type {
  AdminEventRecord,
  AdminLegislativeRecord,
  AdminNewsRecord,
  AdminServiceRecord,
  AdminTeamMember,
  ContentDraft,
  ContentTypeAction,
  EventCategory,
  IconNavItem,
  PublishingActivityEntry,
  TeamRole,
} from "@/types";
import { SERVICES } from "@/features/services/data";
import { UPCOMING_EVENTS } from "@/features/home/data";
import { FEATURED_ARTICLE, NEWS_ARTICLES } from "@/features/announcements/data";
import { ORDINANCES, RESOLUTIONS } from "@/features/transparency/data";
```

Replace `ADMIN_USER` with (placeholder-shaped contact data, same tier as the rest of the site):

```ts
export const ADMIN_USER = {
  name: "Maria Santos",
  role: "Content Administrator",
  email: "m.santos@brgy-sanfernando.gov.ph",
  phone: "(077) 600-2345",
  avatar:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDywk9wpYtcWnNA0FWF88gUK3yo2MwAu2MWoBwHgoVtz2CbRQYsTGOP_slCwmRy9aeVnKX2Rf8gaBoZvaT9gXXdU8X2t1_Y8sraK7l6O7WswP_znAxgeJc9gJUxf22BMQckTxHodBglkQIBVboh0ZV720NsiTReQ8DsYiuuxNvX_1E4L6spfUG03Rx-24rhC3h52XJINUNPbjja_RqzXNIYhhtN4x49W-SmbkeKUfUPU0_7uigGsoiMstStrNKmgYP6Vzwc8Lnn3cw",
};
```

Then append the seed data at the end of the file:

```ts
/* ------------------- Section seed data (wraps real public content) ------------------ */

/** Mock-only services demonstrating extra table states (not shown on the public site). */
const MOCK_SERVICES: AdminServiceRecord[] = [
  {
    id: "mock-senior-citizen-id",
    service: {
      id: "mock-senior-citizen-id",
      title: "Senior Citizen ID Assistance",
      description:
        "Assistance with OSCA ID registration and issuance for residents aged 60 and above.",
      icon: IdCard,
      tone: "primary",
      requirementsLabel: "View Requirements",
      requirements: [
        "Birth certificate or valid government ID",
        "Recent 1x1 ID picture",
        "Proof of residency",
      ],
      ctaLabel: "Registration and ID issuance",
    },
    department: "Office of Senior Citizens Affairs (OSCA)",
    status: "inactive",
    updatedAt: "2025-04-02",
  },
  {
    id: "mock-cedula",
    service: {
      id: "mock-cedula",
      title: "Community Tax Certificate (Cedula)",
      description:
        "Issuance of community tax certificates for employment, business, and legal transactions.",
      icon: ScrollText,
      tone: "primary",
      requirementsLabel: "View Requirements",
      requirements: [
        "Valid government ID",
        "Accomplished CTC form",
        "Basic community tax: ₱5.00 plus additional levies",
      ],
      ctaLabel: "Same-day issuance",
    },
    department: "Office of the Barangay Treasurer",
    status: "active",
    updatedAt: "2025-05-10",
  },
];

const SERVICE_DEPARTMENTS: Record<string, string> = {
  "barangay-clearance": "Office of the Barangay Secretary",
  "business-permit": "Office of the Barangay Treasurer",
  "certificate-of-indigency": "Barangay Social Welfare Desk",
  "blotter-complaints": "Lupong Tagapamayapa",
};

const SERVICE_UPDATED_AT: Record<string, string> = {
  "barangay-clearance": "2025-05-12",
  "business-permit": "2025-04-28",
  "certificate-of-indigency": "2025-03-15",
  "blotter-complaints": "2025-05-01",
};

export const ADMIN_SERVICES: AdminServiceRecord[] = [
  ...SERVICES.map((service) => ({
    id: service.id,
    service,
    department: SERVICE_DEPARTMENTS[service.id] ?? "Office of the Barangay Secretary",
    status: "active" as const,
    updatedAt: SERVICE_UPDATED_AT[service.id] ?? "2025-05-01",
  })),
  ...MOCK_SERVICES,
];

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  "town-hall": "Town Hall",
  "health-drive": "Health Drive",
  festival: "Festival",
  youth: "Youth",
  environment: "Environment",
  community: "Community",
};

const EVENT_META: Record<
  string,
  Pick<AdminEventRecord, "category" | "registered" | "capacity" | "volunteers">
> = {
  "Medical & Dental Mission": { category: "health-drive", registered: 120, capacity: 200 },
  "Youth Leadership Seminar": { category: "youth", registered: 45, capacity: 60 },
  "Environment Clean-up Drive": { category: "environment", volunteers: 30 },
  "Senior Citizens Gathering": { category: "community", registered: 80, capacity: 100 },
};

export const ADMIN_EVENTS: AdminEventRecord[] = [
  ...UPCOMING_EVENTS.map((event, index) => ({
    id: `evt-${index + 1}`,
    event,
    status: "published" as const,
    ...(EVENT_META[event.title] ?? { category: "community" as const }),
  })),
  {
    id: "evt-fiesta-2025",
    event: {
      title: "San Fernando Grand Fiesta 2025",
      date: "2025-08-28",
      time: "All Day",
      venue: "Entire Barangay Jurisdiction",
    },
    category: "festival",
    status: "planning",
    note: "Registration opens August 1st",
  },
];

export const ADMIN_NEWS: AdminNewsRecord[] = [
  {
    id: "news-health-mission",
    article: FEATURED_ARTICLE,
    status: "published",
    views: 3400,
    updatedAt: "2024-10-24",
  },
  {
    id: "news-q4-town-hall",
    article: NEWS_ARTICLES[0],
    status: "published",
    views: 1200,
    updatedAt: "2024-10-22",
  },
  {
    id: "news-tree-planting",
    article: NEWS_ARTICLES[1],
    status: "published",
    views: 860,
    updatedAt: "2024-10-20",
  },
  {
    id: "news-fiesta-schedule-draft",
    article: {
      title: "Annual Barangay Fiesta Schedule and Guidelines",
      category: "Events",
      excerpt: "",
      image: "",
      imageAlt: "",
      dateLabel: "",
    },
    status: "draft",
    updatedAt: "2024-10-25",
  },
  {
    id: "news-anti-rabies-drive",
    article: {
      title: "Free Anti-Rabies Vaccination Drive for Pets",
      category: "Public Health",
      excerpt:
        "Details regarding the upcoming free anti-rabies vaccination drive for dogs and cats, in coordination with the Municipal Agriculture Office.",
      image:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuBQMEWS1CFwllE8d9raqgMitrZe3lxxzWXQ3Bcl2I1HXP7eHqHEK-hqYJgyWkH3UD0brZRExGSa6WZnAViKeIXMh8s0B4saCQjR7DrQUVlkYtWz7hleSkf5wufO4vDDEmqkDlv8z6bMCyl0t04YwZws14Lx0jGXLoOWgFmGq-2O9kHlhu5ab9-ojY4N96RIQVx5QlNdldjOaujdC7lDoqUfEQxtEysVrhbjng7EVEHi9Z_d91NIpXXDZFAILNbLfieTKvuefXZDugY",
      imageAlt: "Health workers preparing vaccines at an outdoor station",
      dateLabel: "Oct 26, 2024",
    },
    status: "scheduled",
    scheduledFor: "2024-10-26T08:00:00",
    updatedAt: "2024-10-23",
  },
];

export const ADMIN_LEGISLATIVE: AdminLegislativeRecord[] = [
  ...ORDINANCES.map((document, index) => ({
    id: `ord-${index + 1}`,
    document,
    type: "ordinance" as const,
    status: "active" as const,
  })),
  ...RESOLUTIONS.map((document, index) => ({
    id: `res-${index + 1}`,
    document,
    type: "resolution" as const,
    status: "active" as const,
  })),
  {
    id: "ord-draft-anti-littering",
    document: {
      number: "Ordinance No. 01-2025",
      title: "Barangay Anti-Littering and Public Cleanliness Code",
      date: "2025-02-10",
      summary:
        "Draft ordinance consolidating anti-littering rules, sidewalk obstruction penalties, and purok-level cleanliness inspections into a single code. Under committee review.",
      fileUrl: "#",
    },
    type: "ordinance",
    status: "under-review",
  },
  {
    id: "res-old-traffic-routing",
    document: {
      number: "Resolution No. 02-2019",
      title: "Old Traffic Routing Scheme for Fiesta Season",
      date: "2019-01-15",
      summary:
        "Previous one-way routing scheme for the fiesta season, superseded by Resolution No. 04-2024.",
      fileUrl: "#",
    },
    type: "resolution",
    status: "archived",
  },
];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  "super-admin": "Super Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const ADMIN_TEAM: AdminTeamMember[] = [
  { name: "Maria Santos", role: "super-admin", initials: "MS", isCurrentUser: true },
  { name: "Juan Dela Cruz", role: "editor", initials: "JD" },
  { name: "Ana Reyes", role: "viewer", initials: "AR" },
];
```

Note: `ADMIN_NAV_ITEMS` and `CONTENT_TYPE_ACTIONS` are **not** touched in this task — the new nav item and the `/admin/legislative` href fix land in Task 5, together with the route they point at (no dead links mid-plan).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output. (If `IdCard` is not exported by the installed lucide-react version, swap it for `Contact` in both the import and `MOCK_SERVICES`.)

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/features/admin/data.ts
git commit -m "feat(admin): typed admin envelopes, form contracts, and seed data"
```

---
### Task 2: List primitives — StatusChip, AdminStatCard, AdminFilterBar, AdminPagination, AdminEmptyState, formatCount

**Files:**
- Create: `src/features/admin/components/status-chip.tsx`
- Create: `src/features/admin/components/admin-stat-card.tsx`
- Create: `src/features/admin/components/admin-filter-bar.tsx`
- Create: `src/features/admin/components/admin-pagination.tsx`
- Create: `src/features/admin/components/admin-empty-state.tsx`
- Modify: `src/lib/format.ts` (append `formatCount`)

**Interfaces:**
- Consumes: `AdminStatus` (Task 1), `cn` from `@/lib/utils`, `Card`, `IconCircle`, `Button`, `Select` from `@/components/ui/*`.
- Produces: `StatusChip({ status: AdminStatus, className? })`; `AdminStatCard({ icon: LucideIcon, label: string, value: string | number, tone?: "primary" | "secondary" | "danger" })`; `AdminFilterBar({ search?: { value, placeholder, onChange }, selects?: FilterSelectConfig[], date?: { label, value, onChange }, className? })` + exported `FilterSelectConfig`; `AdminPagination({ page, pageSize, total, onPageChange, className? })`; `AdminEmptyState({ message: string, onClear: () => void })`; `formatCount(n: number): string` ("1.2k").

These files carry **no** `"use client"` directive — they take callbacks, so they'll be compiled into whichever client manager imports them; none is imported from a server component.

- [ ] **Step 1: Create `status-chip.tsx`**

```tsx
import type { AdminStatus } from "@/types";
import { cn } from "@/lib/utils";

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
};

const TONES: Record<AdminStatus, string> = {
  published: "bg-brand-100 text-brand-800",
  active: "bg-brand-100 text-brand-800",
  scheduled: "bg-ink-100 text-ink-700",
  draft: "bg-ink-100 text-ink-600",
  planning: "bg-ink-100 text-ink-600",
  "in-review": "bg-danger-soft text-danger-soft-fg",
  "under-review": "bg-danger-soft text-danger-soft-fg",
  inactive: "bg-ink-100 text-ink-500",
  archived: "bg-ink-100 text-ink-500",
};

interface StatusChipProps {
  status: AdminStatus;
  className?: string;
}

/** Soft tinted status pill with a leading dot; one tone map for every admin status. */
export function StatusChip({ status, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold",
        TONES[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: Create `admin-stat-card.tsx`**

```tsx
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";

interface AdminStatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "primary" | "secondary" | "danger";
}

/** Compact metric card: icon housing, uppercase label, display-font value. */
export function AdminStatCard({ icon, label, value, tone = "primary" }: AdminStatCardProps) {
  return (
    <Card className="flex items-center gap-4 p-6">
      <IconCircle icon={icon} tone={tone} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</p>
        <p className="font-display text-3xl font-bold text-ink-900">{value}</p>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Create `admin-filter-bar.tsx`**

```tsx
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/form";

export interface FilterSelectConfig {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

interface AdminFilterBarProps {
  search?: { value: string; placeholder: string; onChange: (value: string) => void };
  selects?: FilterSelectConfig[];
  date?: { label: string; value: string; onChange: (value: string) => void };
  className?: string;
}

/** Wrapping row of list filters: optional search, selects, and date input. */
export function AdminFilterBar({ search, selects, date, className }: AdminFilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {search ? (
        <div className="relative min-w-56 flex-1">
          <Search
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <label htmlFor="admin-filter-search" className="sr-only">
            {search.placeholder}
          </label>
          <input
            id="admin-filter-search"
            type="search"
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder}
            className="w-full rounded-full border border-ink-200 bg-white py-2.5 pl-10 pr-4 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-400/20"
          />
        </div>
      ) : null}
      {selects?.map((select) => (
        <div key={select.id}>
          <label htmlFor={select.id} className="sr-only">
            {select.label}
          </label>
          <Select
            id={select.id}
            value={select.value}
            onChange={(event) => select.onChange(event.target.value)}
            className="w-auto rounded-full py-2.5 text-sm"
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
      {date ? (
        <div>
          <label htmlFor="admin-filter-date" className="sr-only">
            {date.label}
          </label>
          <input
            id="admin-filter-date"
            type="date"
            value={date.value}
            onChange={(event) => date.onChange(event.target.value)}
            className="rounded-full border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-600 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-400/20"
          />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create `admin-pagination.tsx`**

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** "Showing X to Y of Z entries" footer with numbered page controls. */
export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: AdminPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)}>
      <p className="text-sm text-ink-600">
        Showing <span className="font-semibold text-ink-900">{start}</span> to{" "}
        <span className="font-semibold text-ink-900">{end}</span> of{" "}
        <span className="font-semibold text-ink-900">{total}</span> entries
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`Page ${n}`}
            aria-current={n === page ? "page" : undefined}
            onClick={() => onPageChange(n)}
            className={cn(
              "h-8 w-8 rounded-full text-sm font-semibold transition-colors",
              n === page ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
            )}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          aria-label="Next page"
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `admin-empty-state.tsx`**

```tsx
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminEmptyStateProps {
  message: string;
  onClear: () => void;
}

/** Shown inside list cards when active filters match no records. */
export function AdminEmptyState({ message, onClear }: AdminEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
      <SearchX className="h-10 w-10 text-ink-400" aria-hidden="true" />
      <p className="text-ink-600">{message}</p>
      <Button variant="ghost" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Append `formatCount` to `src/lib/format.ts`**

```ts
/** Compact count for view totals, e.g. 3400 → "3.4k". */
export function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}
```

- [ ] **Step 7: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0 (new components are exported but not yet imported — that's fine).

- [ ] **Step 8: Commit**

```bash
git add src/features/admin/components/status-chip.tsx src/features/admin/components/admin-stat-card.tsx src/features/admin/components/admin-filter-bar.tsx src/features/admin/components/admin-pagination.tsx src/features/admin/components/admin-empty-state.tsx src/lib/format.ts
git commit -m "feat(admin): shared list primitives (status chip, filters, pagination, stat card, empty state)"
```

---

### Task 3: Drawer and Toast UI primitives

**Files:**
- Create: `src/components/ui/drawer.tsx`
- Create: `src/components/ui/toast.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `Drawer({ open: boolean, onClose: () => void, title: string, children })` — always mounted, `inert` + off-screen when closed (slide transition), focus trap, Esc/overlay close, body scroll lock; `Toast({ message: string, onDismiss: () => void })` — auto-dismisses after 3 s. Drawer children get a `flex-1 overflow-hidden` region: forms inside should use `flex h-full flex-col` with their own scrollable body.

- [ ] **Step 1: Create `src/components/ui/drawer.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/** Right slide-over panel for admin editors: focus trap, Esc/overlay close, scroll lock. */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className={cn("fixed inset-0 z-50", !open && "pointer-events-none")} inert={!open}>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink-950/40 transition-opacity duration-300 motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-ink-200/70 px-6 py-5">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink-900">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
```

Note: `inert` is a first-class boolean prop in React 19 — it removes the closed drawer from the a11y tree and tab order. Managers render the form as `{drawerOpen ? <SomeForm key={...} /> : null}` inside `Drawer`, so form state resets on every open.

- [ ] **Step 2: Create `src/components/ui/toast.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

/** Transient bottom-right notice; auto-dismisses after 3 seconds. */
export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-60 flex items-center gap-2.5 rounded-2xl bg-ink-900 px-5 py-3.5 text-sm font-medium text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.4)]"
    >
      <CheckCircle2 className="h-5 w-5 text-brand-400" aria-hidden="true" />
      {message}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/drawer.tsx src/components/ui/toast.tsx
git commit -m "feat(ui): Drawer slide-over and Toast primitives"
```

---
### Task 4: Services Management screen

**Files:**
- Create: `src/features/admin/components/service-form.tsx`
- Create: `src/features/admin/components/services-manager.tsx`
- Modify: `src/features/admin/index.ts` (add export)
- Modify: `src/app/admin/services/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `ADMIN_SERVICES` (Task 1), `StatusChip`/`AdminFilterBar`/`AdminPagination`/`AdminEmptyState` (Task 2), `Drawer`/`Toast` (Task 3), `AdminPageHeader`, `Card`, `Button`, `IconCircle`, `Field`/`Input`/`Select`/`Textarea`, `formatDate`.
- Produces: `ServicesManager()` (no props); `ServiceForm({ record: AdminServiceRecord | null, onSaved: () => void, onCancel: () => void })`.

- [ ] **Step 1: Create `service-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { AdminServiceRecord, ServiceFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

const DEPARTMENTS = [
  "Office of the Barangay Secretary",
  "Office of the Barangay Treasurer",
  "Barangay Social Welfare Desk",
  "Lupong Tagapamayapa",
  "Barangay Health Center",
  "Office of Senior Citizens Affairs (OSCA)",
];

interface ServiceFormProps {
  record: AdminServiceRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

/** Create/edit form for a citizen service. Validates, then fake-saves (no persistence). */
export function ServiceForm({ record, onSaved, onCancel }: ServiceFormProps) {
  const [values, setValues] = useState<ServiceFormValues>({
    title: record?.service.title ?? "",
    description: record?.service.description ?? "",
    department: record?.department ?? DEPARTMENTS[0],
    requirements: record?.service.requirements.join("\n") ?? "",
    status: record?.status ?? "active",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ServiceFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.title.trim()) nextErrors.title = "Service name is required.";
    if (!values.description.trim()) nextErrors.description = "Description is required.";
    if (!values.requirements.trim()) nextErrors.requirements = "List at least one requirement.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onSaved();
    }, 600);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Service Name" htmlFor="service-title">
          <Input
            id="service-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title ? <p className="text-sm text-danger">{errors.title}</p> : null}
        </Field>
        <Field label="Description" htmlFor="service-description">
          <Textarea
            id="service-description"
            rows={3}
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
            aria-invalid={Boolean(errors.description)}
          />
          {errors.description ? <p className="text-sm text-danger">{errors.description}</p> : null}
        </Field>
        <Field label="Department" htmlFor="service-department">
          <Select
            id="service-department"
            value={values.department}
            onChange={(event) => set("department", event.target.value)}
          >
            {DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Requirements (one per line)" htmlFor="service-requirements">
          <Textarea
            id="service-requirements"
            rows={4}
            value={values.requirements}
            onChange={(event) => set("requirements", event.target.value)}
            aria-invalid={Boolean(errors.requirements)}
          />
          {errors.requirements ? (
            <p className="text-sm text-danger">{errors.requirements}</p>
          ) : null}
        </Field>
        <Field label="Status" htmlFor="service-status">
          <Select
            id="service-status"
            value={values.status}
            onChange={(event) => set("status", event.target.value as ServiceFormValues["status"])}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : record ? "Save Changes" : "Add Service"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create `services-manager.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { AdminServiceRecord } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { IconCircle } from "@/components/ui/icon-circle";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { ADMIN_SERVICES } from "@/features/admin/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { ServiceForm } from "./service-form";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

/** Interactive services table: search, status filter, pagination, drawer editor (mock). */
export function ServicesManager() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminServiceRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ADMIN_SERVICES.filter(
      (record) =>
        (status === "all" || record.status === status) &&
        (q === "" ||
          record.service.title.toLowerCase().includes(q) ||
          record.department.toLowerCase().includes(q)),
    );
  }, [search, status]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (record: AdminServiceRecord) => {
    setEditing(record);
    setDrawerOpen(true);
  };
  const handleSaved = () => {
    setDrawerOpen(false);
    setToast("Saved — demo only, backend pending.");
  };
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Services Management"
        description="Manage and configure public services available in the portal."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Add New Service
          </Button>
        }
      />
      <Card>
        <AdminFilterBar
          className="border-b border-ink-200/70 p-5"
          search={{
            value: search,
            placeholder: "Search services...",
            onChange: (value) => {
              setSearch(value);
              setPage(1);
            },
          }}
          selects={[
            {
              id: "service-status-filter",
              label: "Status",
              value: status,
              options: [
                { value: "all", label: "All Statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
              onChange: (value) => {
                setStatus(value);
                setPage(1);
              },
            },
          ]}
        />
        {filtered.length === 0 ? (
          <AdminEmptyState message="No services match your filters." onClear={clearFilters} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th scope="col" className="px-6 py-4">Service Name</th>
                    <th scope="col" className="px-6 py-4">Department</th>
                    <th scope="col" className="px-6 py-4">Last Updated</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <IconCircle icon={record.service.icon} tone="primary" size="sm" square />
                          <div>
                            <p className="font-semibold text-ink-900">{record.service.title}</p>
                            <p className="text-ink-500">{record.service.ctaLabel}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-ink-600">{record.department}</td>
                      <td className="px-6 py-4 text-ink-600">{formatDate(record.updatedAt)}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          aria-label={`Edit ${record.service.title}`}
                          className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
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
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Service" : "Add New Service"}
      >
        {drawerOpen ? (
          <ServiceForm
            key={editing?.id ?? "new"}
            record={editing}
            onSaved={handleSaved}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
```

- [ ] **Step 3: Add barrel export in `src/features/admin/index.ts`**

```ts
export { ServicesManager } from "./components/services-manager";
```

- [ ] **Step 4: Replace `src/app/admin/services/page.tsx`**

```tsx
import type { Metadata } from "next";
import { ServicesManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "Services Management",
};

export default function AdminServicesPage() {
  return <ServicesManager />;
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/service-form.tsx src/features/admin/components/services-manager.tsx src/features/admin/index.ts src/app/admin/services/page.tsx
git commit -m "feat(admin): interactive Services Management screen"
```

---
### Task 5: Ordinance & Resolution screen (new route + nav item)

**Files:**
- Create: `src/features/admin/components/legislative-form.tsx`
- Create: `src/features/admin/components/legislative-manager.tsx`
- Create: `src/app/admin/legislative/page.tsx`
- Modify: `src/features/admin/data.ts` (nav item + ContentHub href fix)
- Modify: `src/features/admin/index.ts` (add export)

**Interfaces:**
- Consumes: `ADMIN_LEGISLATIVE` (Task 1), Task 2 primitives incl. `AdminStatCard`, `Drawer`/`Toast` (Task 3), `Badge`, `formatDate`.
- Produces: `LegislativeManager()` (no props); `LegislativeForm({ record: AdminLegislativeRecord | null, onSaved, onCancel })`; sidebar gains the `/admin/legislative` item.

- [ ] **Step 1: Add nav item and fix ContentHub href in `src/features/admin/data.ts`**

Add `Scale` to the lucide-react import. Replace `ADMIN_NAV_ITEMS` with:

```ts
export const ADMIN_NAV_ITEMS: IconNavItem[] = [
  { label: "Dashboard Overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Services Management", href: "/admin/services", icon: Landmark },
  { label: "Ordinance & Resolution", href: "/admin/legislative", icon: Scale },
  { label: "Event Calendar", href: "/admin/events", icon: CalendarDays },
  { label: "News & Announcements", href: "/admin/news", icon: Megaphone },
  { label: "User Settings", href: "/admin/settings", icon: Settings },
];
```

In `CONTENT_TYPE_ACTIONS`, change the first entry's href from `"/admin/news"` to `"/admin/legislative"`.

- [ ] **Step 2: Create `legislative-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { AdminLegislativeRecord, LegislativeFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

interface LegislativeFormProps {
  record: AdminLegislativeRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

/** Create/edit form for an ordinance or resolution. Validates, then fake-saves. */
export function LegislativeForm({ record, onSaved, onCancel }: LegislativeFormProps) {
  const [values, setValues] = useState<LegislativeFormValues>({
    type: record?.type ?? "ordinance",
    number: record?.document.number ?? "",
    title: record?.document.title ?? "",
    datePassed: record?.document.date ?? "",
    summary: record?.document.summary ?? "",
    status: record?.status ?? "under-review",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof LegislativeFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof LegislativeFormValues>(key: K, value: LegislativeFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.number.trim()) nextErrors.number = "Document number is required.";
    if (!values.title.trim()) nextErrors.title = "Title is required.";
    if (!values.datePassed) nextErrors.datePassed = "Date passed is required.";
    if (!values.summary.trim()) nextErrors.summary = "Summary is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onSaved();
    }, 600);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Type" htmlFor="legislative-type">
            <Select
              id="legislative-type"
              value={values.type}
              onChange={(event) => set("type", event.target.value as LegislativeFormValues["type"])}
            >
              <option value="ordinance">Ordinance</option>
              <option value="resolution">Resolution</option>
            </Select>
          </Field>
          <Field label="Status" htmlFor="legislative-status">
            <Select
              id="legislative-status"
              value={values.status}
              onChange={(event) =>
                set("status", event.target.value as LegislativeFormValues["status"])
              }
            >
              <option value="active">Active</option>
              <option value="under-review">Under Review</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        </div>
        <Field label="Document Number" htmlFor="legislative-number">
          <Input
            id="legislative-number"
            placeholder="e.g. Ordinance No. 01-2025"
            value={values.number}
            onChange={(event) => set("number", event.target.value)}
            aria-invalid={Boolean(errors.number)}
          />
          {errors.number ? <p className="text-sm text-danger">{errors.number}</p> : null}
        </Field>
        <Field label="Title" htmlFor="legislative-title">
          <Input
            id="legislative-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title ? <p className="text-sm text-danger">{errors.title}</p> : null}
        </Field>
        <Field label="Date Passed" htmlFor="legislative-date">
          <Input
            id="legislative-date"
            type="date"
            value={values.datePassed}
            onChange={(event) => set("datePassed", event.target.value)}
            aria-invalid={Boolean(errors.datePassed)}
          />
          {errors.datePassed ? <p className="text-sm text-danger">{errors.datePassed}</p> : null}
        </Field>
        <Field label="Summary" htmlFor="legislative-summary">
          <Textarea
            id="legislative-summary"
            rows={5}
            value={values.summary}
            onChange={(event) => set("summary", event.target.value)}
            aria-invalid={Boolean(errors.summary)}
          />
          {errors.summary ? <p className="text-sm text-danger">{errors.summary}</p> : null}
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : record ? "Save Changes" : "Add Document"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create `legislative-manager.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Eye, FileClock, FileText, Pencil, Plus, ScrollText } from "lucide-react";
import type { AdminLegislativeRecord } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { ADMIN_LEGISLATIVE } from "@/features/admin/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { LegislativeForm } from "./legislative-form";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 6;

/** Ordinance & resolution directory: stat cards, filterable table, drawer editor (mock). */
export function LegislativeManager() {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminLegislativeRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Directory numbers stay stable regardless of active filters.
  const indexById = useMemo(
    () => new Map(ADMIN_LEGISLATIVE.map((record, index) => [record.id, index + 1])),
    [],
  );

  const totalOrdinances = ADMIN_LEGISLATIVE.filter((r) => r.type === "ordinance").length;
  const totalResolutions = ADMIN_LEGISLATIVE.filter((r) => r.type === "resolution").length;
  const underReview = ADMIN_LEGISLATIVE.filter((r) => r.status === "under-review").length;

  const filtered = useMemo(
    () =>
      ADMIN_LEGISLATIVE.filter(
        (record) =>
          (type === "all" || record.type === type) &&
          (status === "all" || record.status === status),
      ),
    [type, status],
  );

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (record: AdminLegislativeRecord) => {
    setEditing(record);
    setDrawerOpen(true);
  };
  const handleSaved = () => {
    setDrawerOpen(false);
    setToast("Saved — demo only, backend pending.");
  };
  const clearFilters = () => {
    setType("all");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="Ordinance & Resolution"
        description="Manage and publish official local laws and policy documents."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Add New Document
          </Button>
        }
      />
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={FileText} label="Total Ordinances" value={totalOrdinances} />
        <AdminStatCard
          icon={ScrollText}
          label="Total Resolutions"
          value={totalResolutions}
          tone="secondary"
        />
        <AdminStatCard icon={FileClock} label="Under Review" value={underReview} tone="danger" />
      </div>
      <Card>
        <CardHeader
          title="Document Directory"
          className="mb-0 px-6 pt-6"
          action={
            <AdminFilterBar
              selects={[
                {
                  id: "legislative-type-filter",
                  label: "Type",
                  value: type,
                  options: [
                    { value: "all", label: "All Types" },
                    { value: "ordinance", label: "Ordinances" },
                    { value: "resolution", label: "Resolutions" },
                  ],
                  onChange: (value) => {
                    setType(value);
                    setPage(1);
                  },
                },
                {
                  id: "legislative-status-filter",
                  label: "Status",
                  value: status,
                  options: [
                    { value: "all", label: "All Status" },
                    { value: "active", label: "Active" },
                    { value: "under-review", label: "Under Review" },
                    { value: "archived", label: "Archived" },
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
          <AdminEmptyState message="No documents match your filters." onClear={clearFilters} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th scope="col" className="px-6 py-4">#</th>
                    <th scope="col" className="px-6 py-4">Title / Description</th>
                    <th scope="col" className="px-6 py-4">Type</th>
                    <th scope="col" className="px-6 py-4">Date Passed</th>
                    <th scope="col" className="px-6 py-4">Status</th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4 font-semibold text-ink-500">
                        {String(indexById.get(record.id)).padStart(3, "0")}
                      </td>
                      <td className="max-w-90 px-6 py-4">
                        <p className="font-semibold text-ink-900">{record.document.title}</p>
                        <p className="truncate text-ink-500">{record.document.summary}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={record.type === "ordinance" ? "soft" : "neutral"}>
                          {record.type === "ordinance" ? "Ordinance" : "Resolution"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-ink-600">
                        {record.status === "under-review"
                          ? "Pending"
                          : formatDate(record.document.date)}
                      </td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          aria-label={`${record.status === "archived" ? "View" : "Edit"} ${record.document.number}`}
                          className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
                        >
                          {record.status === "archived" ? (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          )}
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
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Document" : "Add New Document"}
      >
        {drawerOpen ? (
          <LegislativeForm
            key={editing?.id ?? "new"}
            record={editing}
            onSaved={handleSaved}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
```

- [ ] **Step 4: Add barrel export and create the route**

In `src/features/admin/index.ts`:

```ts
export { LegislativeManager } from "./components/legislative-manager";
```

Create `src/app/admin/legislative/page.tsx`:

```tsx
import type { Metadata } from "next";
import { LegislativeManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "Ordinance & Resolution",
};

export default function AdminLegislativePage() {
  return <LegislativeManager />;
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/legislative-form.tsx src/features/admin/components/legislative-manager.tsx src/app/admin/legislative/page.tsx src/features/admin/data.ts src/features/admin/index.ts
git commit -m "feat(admin): Ordinance & Resolution management section"
```

---
### Task 6: News & Announcements screen

**Files:**
- Create: `src/features/admin/components/news-form.tsx`
- Create: `src/features/admin/components/news-manager.tsx`
- Modify: `src/features/admin/index.ts` (add export)
- Modify: `src/app/admin/news/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `ADMIN_NEWS` (Task 1), Task 2 primitives, `Drawer`/`Toast` (Task 3), `formatCount` + `formatDate` (`@/lib/format`), `next/image`.
- Produces: `NewsManager()` (no props); `NewsForm({ record: AdminNewsRecord | null, onSaved, onCancel })`.

- [ ] **Step 1: Create `news-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { AdminNewsRecord, NewsPostFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

const NEWS_CATEGORIES = [
  "Governance",
  "Environment",
  "Health & Wellness",
  "Public Health",
  "Events",
  "Advisory",
  "Infrastructure",
];

interface NewsFormProps {
  record: AdminNewsRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

/** Create/edit form for a news post or announcement. Validates, then fake-saves. */
export function NewsForm({ record, onSaved, onCancel }: NewsFormProps) {
  const [values, setValues] = useState<NewsPostFormValues>({
    title: record?.article.title ?? "",
    category: record?.article.category ?? NEWS_CATEGORIES[0],
    excerpt: record?.article.excerpt ?? "",
    body: "",
    status: record?.status ?? "draft",
    scheduledFor: record?.scheduledFor ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof NewsPostFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof NewsPostFormValues>(key: K, value: NewsPostFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.title.trim()) nextErrors.title = "Title is required.";
    if (values.status !== "draft" && !values.excerpt.trim())
      nextErrors.excerpt = "An excerpt is required before publishing.";
    if (values.status === "scheduled" && !values.scheduledFor)
      nextErrors.scheduledFor = "Pick a publish date and time.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onSaved();
    }, 600);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Title" htmlFor="news-title">
          <Input
            id="news-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title ? <p className="text-sm text-danger">{errors.title}</p> : null}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="news-category">
            <Select
              id="news-category"
              value={values.category}
              onChange={(event) => set("category", event.target.value)}
            >
              {NEWS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="news-status">
            <Select
              id="news-status"
              value={values.status}
              onChange={(event) =>
                set("status", event.target.value as NewsPostFormValues["status"])
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
            </Select>
          </Field>
        </div>
        {values.status === "scheduled" ? (
          <Field label="Publish On" htmlFor="news-scheduled-for">
            <Input
              id="news-scheduled-for"
              type="datetime-local"
              value={values.scheduledFor}
              onChange={(event) => set("scheduledFor", event.target.value)}
              aria-invalid={Boolean(errors.scheduledFor)}
            />
            {errors.scheduledFor ? (
              <p className="text-sm text-danger">{errors.scheduledFor}</p>
            ) : null}
          </Field>
        ) : null}
        <Field label="Excerpt" htmlFor="news-excerpt">
          <Textarea
            id="news-excerpt"
            rows={3}
            value={values.excerpt}
            onChange={(event) => set("excerpt", event.target.value)}
            aria-invalid={Boolean(errors.excerpt)}
          />
          {errors.excerpt ? <p className="text-sm text-danger">{errors.excerpt}</p> : null}
        </Field>
        <Field label="Body" htmlFor="news-body">
          <Textarea
            id="news-body"
            rows={8}
            placeholder="Write the full post content…"
            value={values.body}
            onChange={(event) => set("body", event.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : record ? "Save Changes" : "Create Post"}
        </Button>
      </div>
    </form>
  );
}
```

Note: the public `NewsArticle` has no `body` field yet — the form still collects it because the future backend entity needs one (BACKEND_HANDOFF §6 item 4, article detail pages). It starts empty even in edit mode.

- [ ] **Step 2: Create `news-manager.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Eye, ImageIcon, Pencil, Plus } from "lucide-react";
import type { AdminNewsRecord } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import { formatCount, formatDate } from "@/lib/format";
import { ADMIN_NEWS } from "@/features/admin/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";
import { NewsForm } from "./news-form";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 8;

function metaDate(record: AdminNewsRecord): string {
  if (record.status === "draft") return `Last edited ${formatDate(record.updatedAt)}`;
  if (record.status === "scheduled" && record.scheduledFor)
    return `Scheduled ${formatDate(record.scheduledFor.slice(0, 10))}`;
  return record.article.dateLabel;
}

/** News & announcements card grid: search, category/status/date filters, drawer editor. */
export function NewsManager() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminNewsRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(ADMIN_NEWS.map((record) => record.article.category))),
    [],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ADMIN_NEWS.filter(
      (record) =>
        (category === "all" || record.article.category === category) &&
        (status === "all" || record.status === status) &&
        // Date filter: posts updated on or after the chosen day (ISO strings compare safely).
        (date === "" || record.updatedAt >= date) &&
        (q === "" || record.article.title.toLowerCase().includes(q)),
    );
  }, [search, category, status, date]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetPage = () => setPage(1);
  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (record: AdminNewsRecord) => {
    setEditing(record);
    setDrawerOpen(true);
  };
  const handleSaved = () => {
    setDrawerOpen(false);
    setToast("Saved — demo only, backend pending.");
  };
  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setStatus("all");
    setDate("");
    setPage(1);
  };

  return (
    <>
      <AdminPageHeader
        title="News & Announcements"
        description="Manage public updates, advisories, and local news bulletins."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            New Post
          </Button>
        }
      />
      <Card className="mb-6 p-5">
        <AdminFilterBar
          search={{
            value: search,
            placeholder: "Search posts...",
            onChange: (value) => {
              setSearch(value);
              resetPage();
            },
          }}
          selects={[
            {
              id: "news-category-filter",
              label: "Category",
              value: category,
              options: [
                { value: "all", label: "All Categories" },
                ...categories.map((value) => ({ value, label: value })),
              ],
              onChange: (value) => {
                setCategory(value);
                resetPage();
              },
            },
            {
              id: "news-status-filter",
              label: "Status",
              value: status,
              options: [
                { value: "all", label: "All Statuses" },
                { value: "published", label: "Published" },
                { value: "scheduled", label: "Scheduled" },
                { value: "draft", label: "Draft" },
              ],
              onChange: (value) => {
                setStatus(value);
                resetPage();
              },
            },
          ]}
          date={{
            label: "Updated on or after",
            value: date,
            onChange: (value) => {
              setDate(value);
              resetPage();
            },
          }}
        />
      </Card>
      {filtered.length === 0 ? (
        <Card>
          <AdminEmptyState message="No posts match your filters." onClear={clearFilters} />
        </Card>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {pageItems.map((record) => (
              <Card key={record.id} className="flex flex-col overflow-hidden">
                <div className="relative aspect-4/3 bg-ink-100">
                  {record.article.image ? (
                    <Image
                      src={record.article.image}
                      alt={record.article.imageAlt}
                      fill
                      sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink-400">
                      <ImageIcon className="h-10 w-10" aria-hidden="true" />
                    </div>
                  )}
                  <StatusChip
                    status={record.status}
                    className="absolute right-3 top-3 shadow-sm"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-ink-500">
                      {record.article.category}
                    </span>
                    <span className="text-ink-500">{metaDate(record)}</span>
                  </div>
                  <h3 className="mb-2 line-clamp-2 font-display text-lg font-semibold tracking-tight text-ink-900">
                    {record.article.title}
                  </h3>
                  {record.article.excerpt ? (
                    <p className="line-clamp-3 text-sm text-ink-600">{record.article.excerpt}</p>
                  ) : (
                    <p className="text-sm italic text-ink-400">
                      No excerpt available yet. Finish drafting to see a preview.
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-4">
                    {record.status === "published" && record.views != null ? (
                      <span className="flex items-center gap-1.5 text-sm text-ink-500">
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        {formatCount(record.views)} Views
                      </span>
                    ) : record.status === "scheduled" ? (
                      <span className="text-sm text-ink-500">Awaiting publish</span>
                    ) : (
                      <span className="text-sm italic text-ink-400">Unpublished</span>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(record)}
                      aria-label={`Edit ${record.article.title}`}
                      className="rounded-full p-2 text-brand-700 transition-colors hover:bg-brand-50"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <AdminPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
            className="mt-6"
          />
        </>
      )}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Post" : "New Post"}
      >
        {drawerOpen ? (
          <NewsForm
            key={editing?.id ?? "new"}
            record={editing}
            onSaved={handleSaved}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
```

Note: lucide-react exports `ImageIcon` (aliased from `Image`) — use it to avoid clashing with `next/image`. `brand-50` exists in the token scale; if typecheck/build flags it missing from `@theme`, use `bg-brand-100` instead.

- [ ] **Step 3: Barrel export + page**

In `src/features/admin/index.ts`:

```ts
export { NewsManager } from "./components/news-manager";
```

Replace `src/app/admin/news/page.tsx`:

```tsx
import type { Metadata } from "next";
import { NewsManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "News & Announcements",
};

export default function AdminNewsPage() {
  return <NewsManager />;
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/components/news-form.tsx src/features/admin/components/news-manager.tsx src/features/admin/index.ts src/app/admin/news/page.tsx
git commit -m "feat(admin): News & Announcements card-grid manager"
```

---
### Task 7: Event Calendar screen

**Files:**
- Create: `src/features/admin/components/event-form.tsx`
- Create: `src/features/admin/components/mini-calendar.tsx`
- Create: `src/features/admin/components/events-manager.tsx`
- Modify: `src/features/admin/index.ts` (add export)
- Modify: `src/app/admin/events/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `ADMIN_EVENTS`, `EVENT_CATEGORY_LABELS` (Task 1), Task 2 primitives, `Drawer`/`Toast` (Task 3), `toCalendarParts` (`@/lib/format`), `Badge`.
- Produces: `EventsManager()` (no props); `EventForm({ record: AdminEventRecord | null, onSaved, onCancel })`; `MiniCalendar({ eventDates: string[] })` — ISO dates, first entry seeds the initial month.

- [ ] **Step 1: Create `event-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { AdminEventRecord, EventFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EVENT_CATEGORY_LABELS } from "@/features/admin/data";

interface EventFormProps {
  record: AdminEventRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

/** Create/edit form for a community event. Validates, then fake-saves. */
export function EventForm({ record, onSaved, onCancel }: EventFormProps) {
  // Public CommunityEvent stores time as a display string ("8:00 AM - 3:00 PM").
  const timeParts = record?.event.time.split(" - ") ?? [];
  const [values, setValues] = useState<EventFormValues>({
    title: record?.event.title ?? "",
    category: record?.category ?? "community",
    date: record?.event.date ?? "",
    startTime: timeParts[0] ?? "",
    endTime: timeParts[1] ?? "",
    venue: record?.event.venue ?? "",
    capacity: record?.capacity,
    description: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EventFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.title.trim()) nextErrors.title = "Event title is required.";
    if (!values.date) nextErrors.date = "Event date is required.";
    if (!values.startTime.trim()) nextErrors.startTime = "Start time is required.";
    if (!values.venue.trim()) nextErrors.venue = "Venue is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onSaved();
    }, 600);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Event Title" htmlFor="event-title">
          <Input
            id="event-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title ? <p className="text-sm text-danger">{errors.title}</p> : null}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="event-category">
            <Select
              id="event-category"
              value={values.category}
              onChange={(event) =>
                set("category", event.target.value as EventFormValues["category"])
              }
            >
              {Object.entries(EVENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="event-date">
            <Input
              id="event-date"
              type="date"
              value={values.date}
              onChange={(event) => set("date", event.target.value)}
              aria-invalid={Boolean(errors.date)}
            />
            {errors.date ? <p className="text-sm text-danger">{errors.date}</p> : null}
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Start Time" htmlFor="event-start">
            <Input
              id="event-start"
              placeholder="8:00 AM"
              value={values.startTime}
              onChange={(event) => set("startTime", event.target.value)}
              aria-invalid={Boolean(errors.startTime)}
            />
            {errors.startTime ? <p className="text-sm text-danger">{errors.startTime}</p> : null}
          </Field>
          <Field label="End Time" htmlFor="event-end">
            <Input
              id="event-end"
              placeholder="3:00 PM"
              value={values.endTime}
              onChange={(event) => set("endTime", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Venue" htmlFor="event-venue">
          <Input
            id="event-venue"
            value={values.venue}
            onChange={(event) => set("venue", event.target.value)}
            aria-invalid={Boolean(errors.venue)}
          />
          {errors.venue ? <p className="text-sm text-danger">{errors.venue}</p> : null}
        </Field>
        <Field label="Capacity (optional)" htmlFor="event-capacity">
          <Input
            id="event-capacity"
            type="number"
            min={1}
            value={values.capacity ?? ""}
            onChange={(event) =>
              set("capacity", event.target.value === "" ? undefined : Number(event.target.value))
            }
          />
        </Field>
        <Field label="Description" htmlFor="event-description">
          <Textarea
            id="event-description"
            rows={4}
            placeholder="What should residents know about this event?"
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : record ? "Save Changes" : "Create Event"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create `mini-calendar.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface MiniCalendarProps {
  /** ISO dates ("YYYY-MM-DD") to highlight. The first entry seeds the initial month. */
  eventDates: string[];
}

/** Month grid with event-day highlights and prev/next month navigation. */
export function MiniCalendar({ eventDates }: MiniCalendarProps) {
  const [month, setMonth] = useState(() => {
    const seed = eventDates.length > 0 ? new Date(`${eventDates[0]}T00:00:00`) : new Date();
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });

  const marked = new Set(eventDates);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingBlanks = month.getDay();
  const label = month.toLocaleDateString("en-PH", { month: "long", year: "numeric" });

  const toIso = (day: number) =>
    `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const shiftMonth = (delta: number) =>
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-ink-900">{label}</h3>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
            className="rounded-full p-1.5 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
            className="rounded-full p-1.5 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {WEEKDAYS.map((day) => (
          <span key={day} className="pb-1 text-xs font-semibold uppercase text-ink-400">
            {day}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
          <span
            key={day}
            className={cn(
              "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-ink-700",
              marked.has(toIso(day)) && "bg-brand-500 font-bold text-ink-900",
            )}
          >
            {day}
          </span>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Create `events-manager.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Clock, HeartHandshake, MapPin, Plus, TrendingUp, Users } from "lucide-react";
import type { AdminEventRecord } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { IconCircle } from "@/components/ui/icon-circle";
import { Toast } from "@/components/ui/toast";
import { toCalendarParts } from "@/lib/format";
import { ADMIN_EVENTS, EVENT_CATEGORY_LABELS } from "@/features/admin/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { EventForm } from "./event-form";
import { MiniCalendar } from "./mini-calendar";
import { StatusChip } from "./status-chip";

/** Event schedule with category filter, mini calendar, engagement panel, drawer editor. */
export function EventsManager() {
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<AdminEventRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(
    () => ADMIN_EVENTS.filter((record) => category === "all" || record.category === category),
    [category],
  );

  const totalRegistered = ADMIN_EVENTS.reduce((sum, r) => sum + (r.registered ?? 0), 0);
  const totalCapacity = ADMIN_EVENTS.reduce((sum, r) => sum + (r.capacity ?? 0), 0);
  const fillPct =
    totalCapacity > 0 ? Math.min(100, Math.round((totalRegistered / totalCapacity) * 100)) : 0;

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (record: AdminEventRecord) => {
    setEditing(record);
    setDrawerOpen(true);
  };
  const handleSaved = () => {
    setDrawerOpen(false);
    setToast("Saved — demo only, backend pending.");
  };

  return (
    <>
      <AdminPageHeader
        title="Event Calendar"
        description="Manage upcoming civic engagements, town halls, and community festivals."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Create Event
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink-900">
              Upcoming Schedule
            </h3>
            <AdminFilterBar
              selects={[
                {
                  id: "event-category-filter",
                  label: "Category",
                  value: category,
                  options: [
                    { value: "all", label: "All Categories" },
                    ...Object.entries(EVENT_CATEGORY_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  ],
                  onChange: setCategory,
                },
              ]}
            />
          </div>
          {filtered.length === 0 ? (
            <Card>
              <AdminEmptyState
                message="No events in this category."
                onClear={() => setCategory("all")}
              />
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((record) => {
                const { month, day } = toCalendarParts(record.event.date);
                return (
                  <Card key={record.id} className="p-6">
                    <div className="flex gap-5">
                      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-100">
                        <p className="text-xs font-bold uppercase text-brand-800">{month}</p>
                        <p className="font-display text-2xl font-bold leading-none text-ink-900">
                          {day}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <Badge variant="neutral">
                            {EVENT_CATEGORY_LABELS[record.category]}
                          </Badge>
                          {record.status === "planning" ? (
                            <StatusChip status="planning" />
                          ) : null}
                          <span className="flex items-center gap-1 text-sm text-ink-500">
                            <Clock className="h-4 w-4" aria-hidden="true" />
                            {record.event.time}
                          </span>
                        </div>
                        <h4 className="mb-1 font-display text-lg font-semibold tracking-tight text-ink-900">
                          {record.event.title}
                        </h4>
                        <p className="flex items-center gap-1 text-sm text-ink-600">
                          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {record.event.venue}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 pt-4">
                      <div className="flex flex-wrap items-center gap-4">
                        {record.registered != null ? (
                          <span className="flex items-center gap-1.5 text-sm text-ink-600">
                            <Users className="h-4 w-4" aria-hidden="true" />
                            {record.registered} Registered
                          </span>
                        ) : null}
                        {record.capacity != null ? (
                          <span className="text-sm text-ink-600">Cap: {record.capacity}</span>
                        ) : null}
                        {record.volunteers != null ? (
                          <span className="flex items-center gap-1.5 text-sm text-ink-600">
                            <HeartHandshake className="h-4 w-4" aria-hidden="true" />
                            {record.volunteers} Volunteers
                          </span>
                        ) : null}
                        {record.note ? (
                          <span className="text-sm italic text-ink-500">{record.note}</span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(record)}
                        className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
                      >
                        {record.status === "planning" ? "Edit Details" : "Manage"}
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-6">
          <MiniCalendar eventDates={ADMIN_EVENTS.map((record) => record.event.date)} />
          <Card className="p-6">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tight text-ink-900">
              Engagement Overview
            </h3>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <p className="text-sm text-ink-600">Total Event Registrations (YTD)</p>
              <p className="font-display text-xl font-bold text-brand-700">
                {totalRegistered.toLocaleString("en-PH")}
              </p>
            </div>
            <div className="mb-6 h-2 rounded-full bg-ink-100">
              <div
                className="h-2 rounded-full bg-brand-500"
                style={{ width: `${fillPct}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="flex items-center gap-3">
              <IconCircle icon={TrendingUp} tone="primary" size="sm" />
              <div>
                <p className="text-sm font-semibold text-ink-900">Attendance Rate</p>
                <p className="text-sm text-ink-600">
                  88% <span className="font-medium text-brand-700">+2% from last year</span>
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Event" : "Create Event"}
      >
        {drawerOpen ? (
          <EventForm
            key={editing?.id ?? "new"}
            record={editing}
            onSaved={handleSaved}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
```

Note: the attendance-rate figures are display strings per the spec (no source data to compute from).

- [ ] **Step 4: Barrel export + page**

In `src/features/admin/index.ts`:

```ts
export { EventsManager } from "./components/events-manager";
```

Replace `src/app/admin/events/page.tsx`:

```tsx
import type { Metadata } from "next";
import { EventsManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "Event Calendar",
};

export default function AdminEventsPage() {
  return <EventsManager />;
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/event-form.tsx src/features/admin/components/mini-calendar.tsx src/features/admin/components/events-manager.tsx src/features/admin/index.ts src/app/admin/events/page.tsx
git commit -m "feat(admin): Event Calendar with mini calendar and engagement panel"
```

---
### Task 8: Settings screen

**Files:**
- Create: `src/features/admin/components/toggle-switch.tsx`
- Create: `src/features/admin/components/settings-panel.tsx`
- Modify: `src/features/admin/index.ts` (add export)
- Modify: `src/app/admin/settings/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `ADMIN_USER`, `ADMIN_TEAM`, `TEAM_ROLE_LABELS` (Task 1), `Toast` (Task 3), `Card`, `Button`, `Field`/`Input`/`Select`, `next/image`.
- Produces: `SettingsPanel()` (no props); `ToggleSwitch({ label: string, checked: boolean, onChange: (checked: boolean) => void })`.

- [ ] **Step 1: Create `toggle-switch.tsx`**

```tsx
"use client";

import { cn } from "@/lib/utils";

interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Accessible switch button, brand-amber when on. */
export function ToggleSwitch({ label, checked, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        checked ? "bg-brand-500" : "bg-ink-200",
      )}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-5.5",
        )}
      />
    </button>
  );
}
```

- [ ] **Step 2: Create `settings-panel.tsx`**

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ADMIN_TEAM, ADMIN_USER, TEAM_ROLE_LABELS } from "@/features/admin/data";
import { AdminPageHeader } from "./admin-page-header";
import { ToggleSwitch } from "./toggle-switch";

const SAVE_TOAST = "Saved — demo only, backend pending.";

/** Account settings: profile, security, preferences, team roles. All saves are mock. */
export function SettingsPanel() {
  const [profile, setProfile] = useState({
    name: ADMIN_USER.name,
    email: ADMIN_USER.email,
    phone: ADMIN_USER.phone,
  });
  const [profileErrors, setProfileErrors] = useState<{ name?: string; email?: string }>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [twoFactor, setTwoFactor] = useState(true);

  const [language, setLanguage] = useState("en-US");
  const [prefs, setPrefs] = useState({ emailAlerts: true, browserPush: false, weeklyDigest: true });

  const [toast, setToast] = useState<string | null>(null);

  const handleProfileSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof profileErrors = {};
    if (!profile.name.trim()) nextErrors.name = "Full name is required.";
    if (!profile.email.trim()) nextErrors.email = "Email address is required.";
    setProfileErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSavingProfile(true);
    setTimeout(() => {
      setSavingProfile(false);
      setToast(SAVE_TOAST);
    }, 600);
  };

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwords.current || !passwords.next) {
      setPasswordError("Enter your current password and a new password.");
      return;
    }
    setPasswordError(null);
    setSavingPassword(true);
    setTimeout(() => {
      setSavingPassword(false);
      setPasswords({ current: "", next: "" });
      setToast(SAVE_TOAST);
    }, 600);
  };

  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="Manage your account preferences and system configuration."
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="p-8">
            <h3 className="font-display text-xl font-semibold tracking-tight text-ink-900">
              Profile Information
            </h3>
            <p className="mb-6 text-sm text-ink-600">
              Update your personal details and public profile.
            </p>
            <div className="flex flex-col gap-6 border-t border-ink-200/70 pt-6 sm:flex-row">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <Image
                  src={ADMIN_USER.avatar}
                  alt={`${ADMIN_USER.name} — ${ADMIN_USER.role}`}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setToast(SAVE_TOAST)}
                  className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
                >
                  Change Photo
                </button>
              </div>
              <form onSubmit={handleProfileSubmit} noValidate className="flex-1 space-y-4">
                <Field label="Full Name" htmlFor="settings-name">
                  <Input
                    id="settings-name"
                    value={profile.name}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, name: event.target.value }))
                    }
                    aria-invalid={Boolean(profileErrors.name)}
                  />
                  {profileErrors.name ? (
                    <p className="text-sm text-danger">{profileErrors.name}</p>
                  ) : null}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email Address" htmlFor="settings-email">
                    <Input
                      id="settings-email"
                      type="email"
                      value={profile.email}
                      onChange={(event) =>
                        setProfile((prev) => ({ ...prev, email: event.target.value }))
                      }
                      aria-invalid={Boolean(profileErrors.email)}
                    />
                    {profileErrors.email ? (
                      <p className="text-sm text-danger">{profileErrors.email}</p>
                    ) : null}
                  </Field>
                  <Field label="Contact Number" htmlFor="settings-phone">
                    <Input
                      id="settings-phone"
                      type="tel"
                      value={profile.phone}
                      onChange={(event) =>
                        setProfile((prev) => ({ ...prev, phone: event.target.value }))
                      }
                    />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingProfile}>
                    {savingProfile ? "Saving…" : "Save Profile"}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
          <Card className="p-8">
            <h3 className="font-display text-xl font-semibold tracking-tight text-ink-900">
              Account Security
            </h3>
            <p className="mb-6 text-sm text-ink-600">
              Manage your password and authentication settings.
            </p>
            <form
              onSubmit={handlePasswordSubmit}
              noValidate
              className="space-y-4 border-t border-ink-200/70 pt-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Current Password" htmlFor="settings-current-password">
                  <Input
                    id="settings-current-password"
                    type="password"
                    autoComplete="current-password"
                    value={passwords.current}
                    onChange={(event) =>
                      setPasswords((prev) => ({ ...prev, current: event.target.value }))
                    }
                  />
                </Field>
                <Field label="New Password" htmlFor="settings-new-password">
                  <Input
                    id="settings-new-password"
                    type="password"
                    autoComplete="new-password"
                    value={passwords.next}
                    onChange={(event) =>
                      setPasswords((prev) => ({ ...prev, next: event.target.value }))
                    }
                  />
                </Field>
              </div>
              {passwordError ? <p className="text-sm text-danger">{passwordError}</p> : null}
              <div className="flex justify-end">
                <Button variant="outline" type="submit" disabled={savingPassword}>
                  {savingPassword ? "Updating…" : "Update Password"}
                </Button>
              </div>
            </form>
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-ink-200/70 pt-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-brand-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    Two-Factor Authentication (2FA)
                  </p>
                  <p className="text-sm text-ink-600">
                    Add an extra layer of security to your account.
                  </p>
                </div>
              </div>
              <ToggleSwitch
                label="Two-Factor Authentication"
                checked={twoFactor}
                onChange={setTwoFactor}
              />
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tight text-ink-900">
              Preferences
            </h3>
            <Field label="Language" htmlFor="settings-language" className="mb-6">
              <Select
                id="settings-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="en-US">English (US)</option>
                <option value="fil">Filipino</option>
                <option value="ilo">Ilocano</option>
              </Select>
            </Field>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Notifications
            </p>
            <div className="space-y-4">
              {(
                [
                  ["emailAlerts", "Email Alerts"],
                  ["browserPush", "Browser Push"],
                  ["weeklyDigest", "Weekly Digest"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-ink-700">{label}</span>
                  <ToggleSwitch
                    label={label}
                    checked={prefs[key]}
                    onChange={(checked) => setPrefs((prev) => ({ ...prev, [key]: checked }))}
                  />
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink-900">
                Team Roles
              </h3>
              <button
                type="button"
                aria-label="Invite team member"
                onClick={() => setToast(SAVE_TOAST)}
                className="rounded-full p-2 text-brand-700 transition-colors hover:bg-brand-100"
              >
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <ul className="space-y-4 border-t border-ink-200/70 pt-4">
              {ADMIN_TEAM.map((member) => (
                <li key={member.name} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-sm font-semibold text-ink-700">
                      {member.initials}
                    </span>
                    <p className="text-sm font-medium text-ink-900">
                      {member.name}
                      {member.isCurrentUser ? (
                        <span className="text-ink-500"> (You)</span>
                      ) : null}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wider",
                      member.role === "super-admin"
                        ? "bg-brand-100 text-brand-800"
                        : "bg-ink-100 text-ink-600",
                    )}
                  >
                    {TEAM_ROLE_LABELS[member.role]}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-ink-200/70 pt-4 text-center">
              <a
                href="#"
                className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
              >
                View All Team Members
              </a>
            </div>
          </Card>
        </div>
      </div>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
```

- [ ] **Step 3: Barrel export + page**

In `src/features/admin/index.ts`:

```ts
export { SettingsPanel } from "./components/settings-panel";
```

Replace `src/app/admin/settings/page.tsx`:

```tsx
import type { Metadata } from "next";
import { SettingsPanel } from "@/features/admin";

export const metadata: Metadata = {
  title: "Settings",
};

export default function AdminSettingsPage() {
  return <SettingsPanel />;
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/components/toggle-switch.tsx src/features/admin/components/settings-panel.tsx src/features/admin/index.ts src/app/admin/settings/page.tsx
git commit -m "feat(admin): Settings screen with profile, security, preferences, team roles"
```

---

### Task 9: Cleanup, docs, and full verification

**Files:**
- Modify: `src/features/admin/components/admin-topbar.tsx` (rename heading)
- Delete: `src/features/admin/components/admin-placeholder.tsx`
- Modify: `src/features/admin/index.ts` (drop `AdminPlaceholder` export)
- Modify: `docs/BACKEND_HANDOFF.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: final verified state; no component contracts change.

- [ ] **Step 1: Rename the topbar heading**

In `admin-topbar.tsx`, change the `<h1>` text `Civic Horizon Admin` → `San Fernando Admin` (drops leaked design-tool branding).

- [ ] **Step 2: Delete the placeholder**

Delete `src/features/admin/components/admin-placeholder.tsx` and remove its line from `src/features/admin/index.ts`. Confirm nothing else imports it:

Run: `rg "AdminPlaceholder" src`
Expected: no matches.

- [ ] **Step 3: Update `docs/BACKEND_HANDOFF.md`**

1. Append a changelog entry after the existing "Updated 2026-07-13 (evening)" block:

```markdown
> **Updated 2026-07-13 (admin buildout):** the four `/admin` placeholder stubs became
> interactive mock screens (spec: `docs/superpowers/specs/2026-07-13-admin-dashboard-buildout-design.md`),
> plus a new **Ordinance & Resolution** section at `/admin/legislative`. Each section is a
> client "manager" over typed seed data in `features/admin/data.ts` that **wraps the same
> records the public site renders** (services, home events, news articles, transparency
> ordinances/resolutions) in admin envelope types — `AdminServiceRecord`, `AdminEventRecord`,
> `AdminNewsRecord`, `AdminLegislativeRecord` in `src/types/index.ts` — alongside
> `*FormValues` types that define the future POST/PUT body shapes. Search, filters,
> pagination, and drawer create/edit forms all work client-side; saves are faked (toast, no
> persistence). Still unprotected + `noindex` — auth remains work item E1.
```

2. In the §1 admin routes table, replace the four `AdminPlaceholder` rows with the real components and add the new route:

```markdown
| `/admin/services` | Services Management | `ServicesManager` (table + drawer editor) |
| `/admin/legislative` | Ordinance & Resolution | `LegislativeManager` (stat cards + directory + drawer) |
| `/admin/events` | Event Calendar | `EventsManager` (schedule + `MiniCalendar` + engagement) |
| `/admin/news` | News & Announcements | `NewsManager` (card grid + filters + drawer) |
| `/admin/settings` | Settings | `SettingsPanel` (profile, security, preferences, team) |
```

3. In §2, add a row to the type table:

```markdown
| `AdminServiceRecord`, `AdminEventRecord`, `AdminNewsRecord`, `AdminLegislativeRecord`, `AdminTeamMember`, `*FormValues` | Admin portal sections | Envelope types wrapping the public entities + drawer-form body shapes — the write-side API contract; statuses (`AdminContentStatus`, `AdminServiceStatus`, `AdminLegislativeStatus`, `AdminEventStatus`) map to content-workflow columns |
```

4. In §3E, update item 4 ("Editors") to note the create/edit forms now exist as drawer UIs with typed `*FormValues` contracts — the backend wires them to real endpoints instead of building forms from scratch.

- [ ] **Step 4: Update `CLAUDE.md`**

In the Architecture bullet describing the admin portal, change "(sidebar chrome, `noindex`, currently unprotected mock UI)" to "(sidebar chrome, `noindex`, unprotected interactive mock — five sections over typed seed data in `features/admin/data.ts` that wraps the public content; drawer editors fake-save)".

- [ ] **Step 5: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all exit 0; build output shows every route (including `/admin/legislative`) prerendered `○ (Static)`.

- [ ] **Step 6: Runtime verification (verify skill)**

Use the `verify` skill (`.claude/skills/verify/SKILL.md`) to drive the running app at desktop (1280px) and mobile (390px) widths:

1. `/admin` — sidebar shows 6 items; "Ordinance / Resolution" card links to `/admin/legislative`; topbar reads "San Fernando Admin".
2. `/admin/services` — 6 rows; search "clearance" filters to 1; status filter "Inactive" shows 1; empty state + "Clear filters" works with a nonsense search; "Add New Service" opens drawer, empty submit shows errors, valid submit toasts and closes; edit pencil prefills.
3. `/admin/legislative` — stat cards read 4 / 4 / 1; type + status filters work; under-review row shows "Pending" date; archived row shows eye icon; drawer create/edit fake-saves.
4. `/admin/news` — 5 cards with correct chips (3 Published, 1 Draft with placeholder image + italic copy, 1 Scheduled); category/status/date filters work; "New Post" drawer: status Scheduled reveals "Publish On", validation fires, save toasts.
5. `/admin/events` — 5 cards (fiesta shows Planning chip + note + "Edit Details"); category filter works; mini calendar opens on May 2025 with the 25th and 30th highlighted, month nav to June highlights 5 and 12; engagement shows 245 total registrations; "Create Event"/"Manage" drawer validates + fake-saves.
6. `/admin/settings` — profile prefilled from `ADMIN_USER`; clearing name and saving shows error; valid save toasts; password update validates both fields; 2FA + notification toggles flip; team list shows 3 members with role chips.
7. Drawer a11y — Esc closes, overlay click closes, focus lands on the close button when opened.
8. Public site spot-check — `/`, `/services`, `/transparency` render unchanged (seed data wraps their exports without mutating them).

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/components/admin-topbar.tsx src/features/admin/index.ts docs/BACKEND_HANDOFF.md CLAUDE.md
git rm src/features/admin/components/admin-placeholder.tsx
git commit -m "chore(admin): retire placeholder, rename topbar, refresh handoff docs"
```

---

## Post-plan checklist

- All 9 tasks committed; `git log --oneline -9` shows the feature commits.
- `npm run build` clean; all routes static.
- Runtime verification (Task 9 Step 6) passed at both widths.
- Hand back for visual review — Justine judges visually; expect a tweak loop after the first pass.






