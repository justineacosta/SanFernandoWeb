# Ordinances & Resolutions Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two collapsible document tables — Ordinances and Resolutions — to `/transparency`, below Latest Uploads, where each row expands to show the document's summary and links to its (placeholder) file.

**Architecture:** One new server section component (`LegislativeSection`) renders two instances of a new client table component (`LegislativeTable`). The table mirrors the shared `DataTable` styling but adds per-row expand/collapse via the existing `useDisclosure` hook. Data is a new `LegislativeDocument` type with placeholder rows in the transparency feature's `data.ts`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-12-legislative-tables-design.md`

## Global Constraints

- **No test framework exists** in this repo (scripts: `dev`, `build`, `lint`, `typecheck`). Verification is `npm run typecheck`, `npm run lint`, and loading `http://localhost:3000/transparency` in a browser. Do NOT add a test framework.
- **Amber + ink design system**: use only `ink-*` / `brand-*` Tailwind tokens already used by neighboring components. No blue tokens.
- **`fileUrl` stays `"#"`** — real file upload is future backend work.
- **Pages stay thin**: `src/app/(public)/transparency/page.tsx` only composes feature sections.
- **The Download anchor must never be nested inside the toggle button** (invalid HTML).
- Windows environment; dev server is typically already running at `http://localhost:3000`.

---

### Task 1: `LegislativeDocument` type + placeholder data

**Files:**
- Modify: `src/types/index.ts` (Transparency block, after `TransparencyDocument`, ~line 127)
- Modify: `src/features/transparency/data.ts` (append at end)

**Interfaces:**
- Consumes: nothing new.
- Produces: `LegislativeDocument` interface (fields: `number: string`, `title: string`, `date: string`, `summary: string`, `fileUrl: string`) exported from `@/types`; `ORDINANCES: LegislativeDocument[]` and `RESOLUTIONS: LegislativeDocument[]` exported from `@/features/transparency/data`.

- [ ] **Step 1: Add the type**

In `src/types/index.ts`, inside the `/* Transparency */` block, directly after the `TransparencyDocument` interface (before `ProjectStatus`), add:

```ts
export interface LegislativeDocument {
  /** e.g. "Ordinance No. 05-2024" */
  number: string;
  title: string;
  /** ISO date approved */
  date: string;
  /** Content shown when the row is expanded. Placeholder until CMS/backend. */
  summary: string;
  /** Link to the uploaded PDF/raw file. "#" placeholder until backend upload exists. */
  fileUrl: string;
}
```

- [ ] **Step 2: Add placeholder data**

In `src/features/transparency/data.ts`:

1. Extend the type-only import to include the new type:

```ts
import type { LegislativeDocument, ProjectStatus, TransparencyDocument } from "@/types";
```

2. Append at the end of the file:

```ts
export const ORDINANCES: LegislativeDocument[] = [
  {
    number: "Ordinance No. 05-2024",
    title: "Comprehensive Solid Waste Management Program",
    date: "2024-09-28",
    summary:
      "An ordinance institutionalizing waste segregation at source in all households and establishments within Barangay Sampaguita, prescribing collection schedules per purok, designating materials recovery facilities, and providing penalties of ₱500 to ₱2,500 for non-compliance. Enacted pursuant to RA 9003 (Ecological Solid Waste Management Act).",
    fileUrl: "#",
  },
  {
    number: "Ordinance No. 03-2024",
    title: "Curfew Hours for Minors",
    date: "2024-06-14",
    summary:
      "An ordinance setting curfew hours for minors below 18 years of age from 10:00 PM to 4:00 AM daily, defining exemptions for work, school, and emergencies, and directing barangay tanods to escort apprehended minors to their parents or guardians. First offense carries a written warning; succeeding offenses require parental conference with the Lupon.",
    fileUrl: "#",
  },
  {
    number: "Ordinance No. 11-2023",
    title: "Anti-Illegal Parking on Barangay Roads",
    date: "2023-11-08",
    summary:
      "An ordinance prohibiting the parking of motor vehicles on designated barangay road sections that obstruct traffic flow or emergency access, establishing towing and impounding procedures in coordination with the city traffic office, and imposing graduated fines starting at ₱1,000.",
    fileUrl: "#",
  },
];

export const RESOLUTIONS: LegislativeDocument[] = [
  {
    number: "Resolution No. 12-2024",
    title: "Adopting the Annual Budget for Fiscal Year 2025",
    date: "2024-10-05",
    summary:
      "A resolution adopting the proposed annual budget of Barangay Sampaguita for fiscal year 2025 amounting to ₱8,450,000, allocating 20% to the Barangay Development Fund, 10% to the Sangguniang Kabataan fund, and 5% to the Barangay Disaster Risk Reduction and Management Fund, as reviewed by the Barangay Development Council.",
    fileUrl: "#",
  },
  {
    number: "Resolution No. 09-2024",
    title: "Authorizing a Memorandum of Agreement for the Feeding Program",
    date: "2024-07-19",
    summary:
      "A resolution authorizing the Punong Barangay to enter into a memorandum of agreement with the City Social Welfare and Development Office for the implementation of a six-month supplemental feeding program benefiting 120 undernourished children in the barangay day care centers.",
    fileUrl: "#",
  },
  {
    number: "Resolution No. 04-2024",
    title: "Requesting Streetlight Installation Along Sampaguita Extension",
    date: "2024-03-22",
    summary:
      "A resolution respectfully requesting the City Engineering Office to install fifteen (15) LED streetlights along Sampaguita Extension from Purok 3 to Purok 5, citing recorded safety incidents and the results of the barangay assembly consultation held February 2024.",
    fileUrl: "#",
  },
];
```

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck`
Expected: exits 0, no output errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/features/transparency/data.ts
git commit -m "feat: add LegislativeDocument type and placeholder ordinance/resolution data"
```

---

### Task 2: `LegislativeTable` client component

**Files:**
- Create: `src/features/transparency/components/legislative-table.tsx`

**Interfaces:**
- Consumes: `LegislativeDocument` from `@/types` (Task 1); `useDisclosure()` from `@/hooks/use-disclosure` (returns `{ isOpen: boolean; toggle: () => void }` among others); `formatDate(iso: string)` from `@/lib/format`; `cn()` from `@/lib/utils`.
- Produces: `export function LegislativeTable({ caption, documents }: { caption: string; documents: LegislativeDocument[] })` — a client component.

- [ ] **Step 1: Create the component**

Create `src/features/transparency/components/legislative-table.tsx` with exactly:

```tsx
"use client";

import { Fragment, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useDisclosure } from "@/hooks/use-disclosure";
import type { LegislativeDocument } from "@/types";

interface LegislativeTableProps {
  /** Screen-reader caption describing the table. */
  caption: string;
  documents: LegislativeDocument[];
}

/** Legislative document table where each row expands to show the document summary. */
export function LegislativeTable({ caption, documents }: LegislativeTableProps) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-ink-200/70 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
            <th scope="col" className="w-12 px-4 py-4">
              <span className="sr-only">Expand</span>
            </th>
            <th scope="col" className="px-6 py-4">
              Number
            </th>
            <th scope="col" className="px-6 py-4">
              Title
            </th>
            <th scope="col" className="px-6 py-4">
              Date Approved
            </th>
            <th scope="col" className="px-6 py-4 text-right">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200/70">
          {documents.map((doc) => (
            <LegislativeRow key={doc.number} doc={doc} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One document: a summary row plus a toggleable full-width detail row. */
function LegislativeRow({ doc }: { doc: LegislativeDocument }) {
  const { isOpen, toggle } = useDisclosure();
  const panelId = useId();

  return (
    <Fragment>
      <tr className="transition-colors hover:bg-ink-50">
        <td className="px-4 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform duration-300", isOpen && "rotate-180")}
              aria-hidden="true"
            />
            <span className="sr-only">
              {isOpen ? "Hide" : "Show"} summary of {doc.number}
            </span>
          </button>
        </td>
        <td className="whitespace-nowrap px-6 py-4 font-medium text-ink-900">{doc.number}</td>
        <td className="px-6 py-4 text-ink-900">{doc.title}</td>
        <td className="whitespace-nowrap px-6 py-4 text-ink-600">{formatDate(doc.date)}</td>
        <td className="px-6 py-4 text-right">
          <a href={doc.fileUrl} className="font-semibold uppercase text-ink-900 hover:underline">
            Download
          </a>
        </td>
      </tr>
      <tr id={panelId} hidden={!isOpen} className="bg-ink-50/60">
        <td colSpan={5} className="px-6 py-5">
          <p className="max-w-3xl leading-relaxed text-ink-600">{doc.summary}</p>
        </td>
      </tr>
    </Fragment>
  );
}
```

Notes for the implementer:
- The detail `<tr>` stays mounted and toggles the `hidden` attribute so the toggle button's `aria-controls` always points at a real element (same accessibility contract as `src/components/ui/accordion.tsx`).
- The Download `<a>` is its own cell — do not move it inside the toggle `<button>`.

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: exits 0.

(The component is not rendered anywhere yet — that's Task 3. Unused-export lint rules are not configured here, so lint stays clean.)

- [ ] **Step 3: Commit**

```bash
git add src/features/transparency/components/legislative-table.tsx
git commit -m "feat: add LegislativeTable client component with collapsible rows"
```

---

### Task 3: `LegislativeSection` + page wiring + browser verification

**Files:**
- Create: `src/features/transparency/components/legislative-section.tsx`
- Modify: `src/features/transparency/index.ts`
- Modify: `src/app/(public)/transparency/page.tsx`

**Interfaces:**
- Consumes: `LegislativeTable` (Task 2); `ORDINANCES`, `RESOLUTIONS` (Task 1); `Section` (`tone`, `className` props) and `SectionHeading` (`title`, `description` props) from `@/components/ui`.
- Produces: `export function LegislativeSection()` re-exported from `@/features/transparency`.

- [ ] **Step 1: Create the section component**

Create `src/features/transparency/components/legislative-section.tsx` with exactly:

```tsx
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { LegislativeTable } from "@/features/transparency/components/legislative-table";
import { ORDINANCES, RESOLUTIONS } from "@/features/transparency/data";

/** Ordinances and resolutions of the Sangguniang Barangay, each row expandable to its summary. */
export function LegislativeSection() {
  return (
    <Section tone="white" className="border-t border-ink-200">
      <SectionHeading
        title="Ordinances & Resolutions"
        description="Enacted legislation of the Sangguniang Barangay. Expand a row to read the document summary."
      />
      <div className="space-y-10">
        <div>
          <h3 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Ordinances
          </h3>
          <LegislativeTable caption="Barangay ordinances" documents={ORDINANCES} />
        </div>
        <div>
          <h3 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Resolutions
          </h3>
          <LegislativeTable caption="Barangay resolutions" documents={RESOLUTIONS} />
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Export it from the feature barrel**

In `src/features/transparency/index.ts`, add after the `LatestUploadsSection` line:

```ts
export { LegislativeSection } from "./components/legislative-section";
```

- [ ] **Step 3: Render it on the page**

In `src/app/(public)/transparency/page.tsx`, add `LegislativeSection` to the import list from `@/features/transparency` (keep alphabetical order):

```tsx
import {
  DisclosureGrid,
  FoiSection,
  LatestUploadsSection,
  LegislativeSection,
  TransparencyHero,
} from "@/features/transparency";
```

and render it between `LatestUploadsSection` and `FoiSection`:

```tsx
      <LatestUploadsSection />
      <LegislativeSection />
      <FoiSection />
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 5: Verify in the browser**

With the dev server running (`npm run dev` if not already), load `http://localhost:3000/transparency` and confirm:

1. The "Ordinances & Resolutions" section appears below "Latest Uploads" and above the FOI section.
2. Both tables render: 3 ordinances, 3 resolutions, columns Number · Title · Date Approved · Action.
3. Clicking a chevron expands the summary row beneath that document; clicking again collapses it; multiple rows can be open at once.
4. Each row has a Download link (currently `#`).
5. Styling matches the Latest Uploads table (rounded card, ink-50 header band).

- [ ] **Step 6: Commit**

```bash
git add src/features/transparency/components/legislative-section.tsx src/features/transparency/index.ts "src/app/(public)/transparency/page.tsx"
git commit -m "feat: add ordinances and resolutions tables to transparency page"
```

---

### Task 4: Backend handoff doc updates

**Files:**
- Modify: `docs/BACKEND_HANDOFF.md` (four spots: page composition table ~line 37, entity table ~line 93, mock-data inventory ~line 111, transparency work item ~line 140, API surface ~line 186)

**Interfaces:**
- Consumes: names introduced in Tasks 1–3 (`LegislativeSection`, `LegislativeDocument`, `ORDINANCES`, `RESOLUTIONS`).
- Produces: documentation only.

- [ ] **Step 1: Update the page composition row**

Change the `/transparency` row to:

```markdown
| `/transparency` | Transparency portal | `TransparencyHero`, `DisclosureGrid`, `LatestUploadsSection`, `LegislativeSection`, `FoiSection` |
```

- [ ] **Step 2: Add the entity row**

In the Data Model table, after the `TransparencyDocument` row, add:

```markdown
| `LegislativeDocument` | Ordinances & resolutions tables | Needs real `fileUrl` from file upload; `summary` (expanded row content) comes from CMS |
```

- [ ] **Step 3: Update the mock-data inventory row**

Change the transparency data row to:

```markdown
| `src/features/transparency/data.ts` | Budget docs, 2 projects, 4 latest uploads, 3 ordinances + 3 resolutions |
```

- [ ] **Step 4: Update work item C.2 and the API surface**

Change work item C.2 to:

```markdown
2. **Transparency documents** (changes monthly) — document entity with real file storage
   (S3-style bucket), categories, and the ordinance **search** endpoint
   (`disclosure-grid.tsx` has a search form pointing at `#`). Ordinances/resolutions
   (`LegislativeDocument`) additionally carry a `summary` shown in the expandable table rows.
```

In the Suggested API Surface block, after the `GET /api/documents` line, add:

```
GET  /api/legislative?type=ordinance|resolution → LegislativeDocument[] (drives collapsible tables)
```

- [ ] **Step 5: Commit**

```bash
git add docs/BACKEND_HANDOFF.md
git commit -m "docs: record legislative tables in backend handoff"
```
