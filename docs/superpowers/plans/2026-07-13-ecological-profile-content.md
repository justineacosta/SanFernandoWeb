# Ecological Profile Content (Quick Wins) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fabricated About-page history/milestones with facts from the barangay's official Ecological Profile, add a waste-collection-schedule section to Services, and fix small mission/vision typos.

**Architecture:** Content-only changes in feature `data.ts` files plus one new server component (`WasteScheduleSection`) in the services feature. One shared type (`TimelineEntry.image`) widens to accept bundled static imports; one new shared type (`WasteCollectionSlot`) is added to `src/types/index.ts`.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript strict, Tailwind CSS v4 tokens.

**Spec:** `docs/superpowers/specs/2026-07-13-ecological-profile-content-design.md`

## Global Constraints

- **No test framework exists — do not add one.** Verification = `npm run typecheck` + `npm run lint` + driving the running app (recipe: `.claude/skills/verify/SKILL.md`). The dev server is often already running on http://localhost:3000 — check before starting another.
- Content lives in the feature's `data.ts`, never hardcoded in components.
- Use only amber/ink design tokens (`brand-*`, `ink-*`, `danger*`); never blue.
- The barangay is **San Fernando** (any "Sampaguita" is a regression); San Nicolas is a **municipality** ("Municipal …", never "City …").
- Path alias `@/*` → `src/*`. Pages only compose named feature sections; feature barrels (`index.ts`) re-export components in page order.
- Every statistic shown must carry its source/year (per spec: RBI 2024 / Barangay Development Plan).
- Commit after each task.

---

### Task 1: Honest history timeline (type widening + data + section tweaks)

**Files:**
- Modify: `src/types/index.ts:191-197` (`TimelineEntry`)
- Modify: `src/features/about/data.ts:37-65` (`HISTORY_TIMELINE`) and its imports
- Modify: `src/features/about/components/history-section.tsx`

**Interfaces:**
- Consumes: existing `Section`, `SectionHeading`, `cn`, `next/image`.
- Produces: `TimelineEntry` with `image: string | StaticImageData` and new optional `imageFit?: "cover" | "contain"` — no other task depends on it, but future data entries may use either form.

- [ ] **Step 1: Widen `TimelineEntry` in `src/types/index.ts`**

Add to the top of the file (with the other imports; `LucideIcon` is already imported there):

```ts
import type { StaticImageData } from "next/image";
```

Replace the `TimelineEntry` interface (currently lines 191–197):

```ts
export interface TimelineEntry {
  year: string;
  title: string;
  description: string;
  image: string | StaticImageData;
  /** How the image fills its frame; "contain" suits logos/seals. Defaults to "cover". */
  imageFit?: "cover" | "contain";
  imageAlt: string;
}
```

- [ ] **Step 2: Rewrite `HISTORY_TIMELINE` in `src/features/about/data.ts`**

Add these imports next to the existing `punongBarangayPhoto` import:

```ts
import barangaySeal from "@/images/logo/BarangaySFLogo.png";
import communityPhoto from "@/images/carousel/OrganizationGroupPicture.jpg";
```

Replace the entire `HISTORY_TIMELINE` array (currently three invented entries at lines 37–65) with:

```ts
export const HISTORY_TIMELINE: TimelineEntry[] = [
  {
    year: "1733",
    title: "Founding",
    description:
      "Barangay 11 San Fernando was founded in 1733 — one of the barangays of San Nicolas named after saints, according to the History of San Nicolas by Atty. Manuel F. Aurelio.",
    image: barangaySeal,
    imageFit: "contain",
    imageAlt: "Official seal of Barangay San Fernando, San Nicolas, Ilocos Norte",
  },
  {
    year: "Today",
    title: "An Urban Poblacion Barangay",
    description:
      "San Fernando is one of the 15 urban barangays surrounding the center of San Nicolas — 8.95 hectares and seven sitios that are home to about 1,228 residents. It is bounded by San Ildefonso, San Paulo, San Cayetano, and San Guillermo, just 250 meters from the Municipal Hall along the Manila North Road.",
    image: communityPhoto,
    imageAlt: "Barangay officials and residents gathered for a community group photo",
  },
];
```

- [ ] **Step 3: Update `history-section.tsx` copy and image rendering**

Three changes in `src/features/about/components/history-section.tsx`:

a) The `SectionHeading` description (line 14) claims an agricultural-settlement origin the PDF doesn't support. Replace:

```tsx
        description="Tracing our roots from a small agricultural settlement to a thriving urban center."
```

with:

```tsx
        description="From an eighteenth-century founding to a modern urban barangay at the heart of San Nicolas."
```

b) The first-entry vintage-photo treatment (`index === 0 && "opacity-80 grayscale"`, lines 50–53) would gray out the barangay seal. Also honor the new `imageFit`. Replace the image frame block (lines 44–55):

```tsx
                  <div className="h-48 overflow-hidden rounded-2xl border border-ink-200 bg-brand-50">
                    <Image
                      src={entry.image}
                      alt={entry.imageAlt}
                      width={640}
                      height={192}
                      className={cn(
                        "h-full w-full",
                        entry.imageFit === "contain" ? "object-contain p-4" : "object-cover",
                      )}
                    />
                  </div>
```

(The `bg-brand-50` backdrop only shows behind `contain` images; `cover` images fill the frame. `index` is no longer used inside the frame — the `reversed` logic above still uses it, so keep the `(entry, index)` map signature.)

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/features/about/data.ts src/features/about/components/history-section.tsx
git commit -m "content: replace invented history timeline with verified 1733 founding"
```

---

### Task 2: Real community programs + mission/vision text fixes

**Files:**
- Modify: `src/features/about/data.ts` (`MISSION`, `VISION`, `MILESTONES`, lucide imports)
- Modify: `src/features/about/components/milestones-section.tsx` (heading copy, meta icon)

**Interfaces:**
- Consumes: existing `Milestone` type (unchanged: `icon: LucideIcon; title; description; meta`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Fix mission/vision text in `src/features/about/data.ts`**

In `MISSION` (line 13–14): change `"To promoted people participation"` → `"To promote people participation"`.

In `VISION` (line 16–17): change `"god loving"` → `"God-loving"`.

- [ ] **Step 2: Replace `MILESTONES` with documented programs**

Update the lucide import at the top of `src/features/about/data.ts`: remove `Stethoscope`, `Trophy`, and `Video`; add `Droplets` and `Recycle` (`Leaf` is already imported). Final import:

```ts
import {
  Accessibility,
  Droplets,
  HeartHandshake,
  Leaf,
  Recycle,
  ShieldCheck,
} from "lucide-react";
```

Replace the entire `MILESTONES` array (currently three invented awards at lines 67–89) with:

```ts
export const MILESTONES: Milestone[] = [
  {
    icon: Leaf,
    title: "Weekly Community Clean-Up Drive",
    description:
      "Residents join barangay officials, SK officials, health workers, and tanods in the mandatory weekly clean-up of roads, canals, and vacant lots.",
    meta: "Barangay Development Plan",
  },
  {
    icon: Recycle,
    title: "100% Household Waste Segregation",
    description:
      "All 248 households segregate their garbage and are covered by scheduled barangay-wide collection.",
    meta: "RBI 2024",
  },
  {
    icon: Droplets,
    title: "Flood Mitigation Through Canal Rehabilitation",
    description:
      "As the catch basin of neighboring barangays, San Fernando rehabilitated its canals so typhoon floodwater now subsides quickly.",
    meta: "Barangay Development Plan",
  },
];
```

- [ ] **Step 3: Reword the section for programs instead of awards**

In `src/features/about/components/milestones-section.tsx`:

a) Replace the `SectionHeading` props (lines 12–14):

```tsx
        title="Community Programs"
        description="Ongoing initiatives that keep the barangay clean, safe, and flood-ready."
        action={{ label: "View All Reports", href: "/transparency" }}
```

b) The `meta` line now cites a source document, not a date — swap the `CalendarDays` icon (line 28) for `FileText` (already imported on line 1):

```tsx
              <FileText className="h-4 w-4" aria-hidden="true" />
```

Then remove `CalendarDays` from the lucide import on line 1:

```tsx
import { FileText } from "lucide-react";
```

c) Update the component doc comment (line 7):

```tsx
/** Numbered program cards ("Community Programs"). */
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass. (Lint's `no-unused-vars` would catch any leftover `CalendarDays`/`Trophy`-style imports.)

- [ ] **Step 5: Commit**

```bash
git add src/features/about/data.ts src/features/about/components/milestones-section.tsx
git commit -m "content: real community programs and mission/vision text fixes"
```

---

### Task 3: Waste collection schedule section on Services

**Files:**
- Modify: `src/types/index.ts` (add `WasteCollectionSlot`)
- Modify: `src/features/services/data.ts` (add `WASTE_SCHEDULE`)
- Create: `src/features/services/components/waste-schedule-section.tsx`
- Modify: `src/features/services/index.ts` (barrel, page order)
- Modify: `src/app/(public)/services/page.tsx`

**Interfaces:**
- Consumes: `Section` (`tone="muted"`), `SectionHeading` (props: `title`, `description`, `eyebrow`, `align`), UI tokens.
- Produces: `WasteCollectionSlot { label: string; days: string; note: string; icon: LucideIcon }`; data export `WASTE_SCHEDULE: { title: string; description: string; slots: WasteCollectionSlot[] }`; component export `WasteScheduleSection` (no props).

- [ ] **Step 1: Add the shared type in `src/types/index.ts`**

Add next to the other service-related interfaces (`LucideIcon` is already imported in this file):

```ts
export interface WasteCollectionSlot {
  label: string;
  days: string;
  note: string;
  icon: LucideIcon;
}
```

- [ ] **Step 2: Add `WASTE_SCHEDULE` to `src/features/services/data.ts`**

Extend the lucide import on line 1 with `Leaf` and `Recycle`:

```ts
import { Gavel, HeartHandshake, Leaf, Recycle, ShieldCheck, Store } from "lucide-react";
```

Extend the type import on line 2:

```ts
import type { Service, WasteCollectionSlot } from "@/types";
```

Append at the end of the file:

```ts
export const WASTE_SCHEDULE: {
  title: string;
  description: string;
  slots: WasteCollectionSlot[];
} = {
  title: "Waste Collection Schedule",
  description:
    "Garbage segregation is mandatory for all households. Set out the right bags on collection days for the municipal garbage truck.",
  slots: [
    {
      label: "Perishable & biodegradable waste",
      days: "Wednesday & Sunday",
      note: "Collected in the morning",
      icon: Leaf,
    },
    {
      label: "Non-perishable & residual waste",
      days: "Friday",
      note: "Keep separate from biodegradables",
      icon: Recycle,
    },
  ],
};
```

- [ ] **Step 3: Create `src/features/services/components/waste-schedule-section.tsx`**

Server component (no `"use client"`), matching the visual language of `services-grid.tsx`:

```tsx
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { WASTE_SCHEDULE } from "@/features/services/data";

/** Garbage collection days for segregated household waste. */
export function WasteScheduleSection() {
  return (
    <Section tone="muted">
      <SectionHeading
        eyebrow="Sanitation"
        align="center"
        title={WASTE_SCHEDULE.title}
        description={WASTE_SCHEDULE.description}
      />
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-2">
        {WASTE_SCHEDULE.slots.map(({ icon: Icon, label, days, note }) => (
          <div
            key={label}
            className="flex flex-col items-center rounded-3xl border border-ink-200 bg-white p-8 text-center"
          >
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
              <Icon className="h-7 w-7 text-brand-700" aria-hidden="true" />
            </span>
            <h3 className="mb-1 text-lg font-semibold tracking-tight text-ink-900">{label}</h3>
            <p className="mb-3 font-display text-2xl font-semibold text-brand-700">{days}</p>
            <p className="text-sm text-ink-600">{note}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Barrel + page wiring**

`src/features/services/index.ts` — keep page order (grid, schedule, help):

```ts
export { ServicesGrid } from "./components/services-grid";
export { WasteScheduleSection } from "./components/waste-schedule-section";
export { HelpSection } from "./components/help-section";
```

`src/app/(public)/services/page.tsx` — extend the feature import and slot the section between `ServicesGrid` and `HelpSection`:

```tsx
import { HelpSection, ServicesGrid, WasteScheduleSection } from "@/features/services";
```

```tsx
      <ServicesGrid />
      <WasteScheduleSection />
      <HelpSection />
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/features/services/data.ts src/features/services/components/waste-schedule-section.tsx src/features/services/index.ts "src/app/(public)/services/page.tsx"
git commit -m "feat: waste collection schedule section on services page"
```

---

### Task 4: Handoff note + runtime verification

**Files:**
- Modify: `docs/BACKEND_HANDOFF.md` (§6 Known Gaps / Tech Debt)

**Interfaces:** none.

- [ ] **Step 1: Record the captain-quote debt**

Append as item 6 of the numbered list in `## 6. Known Gaps / Tech Debt`:

```markdown
6. `CAPTAIN.message` on the About page is invented placeholder text presented as direct quotes
   from the real Punong Barangay — replace with his actual message before launch.
```

- [ ] **Step 2: Runtime verification**

Follow `.claude/skills/verify/SKILL.md` (check whether the dev server is already on http://localhost:3000 before starting one) and confirm in the browser:

- `/about`: timeline shows exactly two entries — "1733 / Founding" with the seal displayed whole (contained, not cropped, no grayscale) and "Today" with the community photo; "Community Programs" shows the three program cards with source metas; mission reads "To promote…", vision reads "God-loving".
- `/services`: the Waste Collection Schedule section renders between the services grid and the help strip; two cards show Wednesday & Sunday / Friday; layout holds at mobile width (~375px) and desktop.

Expected: all render correctly with no console errors. Fix anything broken before proceeding.

- [ ] **Step 3: Final checks and commit**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

```bash
git add docs/BACKEND_HANDOFF.md
git commit -m "docs: note placeholder captain quotes in backend handoff"
```
