# Transparency Tables, Kebab Actions & Production Baseline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every transparency table numbered pagination and a kebab action menu, remove the `/services` Emergency Assistance banner and its invented hotline numbers, and regenerate the production baseline to cover migrations `0001`–`0023` without demo seeds.

**Architecture:** One pure page-window helper (`src/lib/pagination.ts`, unit-tested) under one presentational `Pagination` primitive that works in *both* callback mode (client, local state) and link mode (server, URL state). The existing `RowActions` kebab is taught to hold `<a>` items so one component serves admin and public. A thin `RecordActions` client wrapper adapts it to transparency rows with serializable props only, so Server Components can render it.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 `@theme` tokens, `motion/react`, Vitest (pure functions), Playwright (`public` project needs no login), Supabase Postgres.

## Global Constraints

- Path alias `@/*` → `src/*`.
- Design tokens only: `brand-*`, `ink-*`, `danger*`. **Blue tokens must not reappear.** There is no `brand-900`.
- Barangay identity is **San Fernando**. Any "Sampaguita" in `src/` is a regression.
- Server Components by default. `"use client"` only for real interactivity.
- A module with **no** `"use client"` directive works in both graphs. `Pagination` deliberately has no directive — link mode is rendered by Server Components (a function prop like `hrefFor` cannot cross the server→client boundary), callback mode is rendered inside components that are already client.
- Component-level tests are deliberately not a thing here. Vitest covers **pure functions only**; behaviour is verified in the browser and with Playwright.
- Never expose the service-role key to the client. All tables are RLS-enabled with zero policies.
- Migrations are applied **manually by the owner**. Never claim one is applied.
- Commit after every task. Do not push.

---

### Task 1: Remove the Emergency Assistance banner from /services

Fully independent of every other task. The card's numbers (`911-SANFERNANDO`, `8-123-4567`) are invented placeholders on a live public page. The **real** hotline `(077) 600 1082` continues to reach residents through `EMERGENCY_HOTLINES` on the footer, contact page, officials page and announcements sidebar — nothing is lost by deleting this.

**Files:**
- Modify: `src/features/services/components/services-grid.tsx`
- Modify: `src/features/services/data.ts:67-75`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `EMERGENCY_ASSISTANCE` ceases to exist.

- [ ] **Step 1: Replace `services-grid.tsx` in full**

```tsx
import { Section } from "@/components/ui/section";
import { ServiceCard } from "@/features/services/components/service-card";
import { listServices } from "@/features/services/queries";

/** Directory grid of citizen services. */
export async function ServicesGrid() {
  const services = await listServices();
  return (
    <Section>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 2: Delete the dead constant from `src/features/services/data.ts`**

Remove these exact lines (they sit between the `SERVICES` array and `WASTE_SCHEDULE`):

```ts
export const EMERGENCY_ASSISTANCE = {
  title: "Emergency Assistance",
  description:
    "In case of fire, medical emergencies, or urgent security threats, contact our 24/7 Response Team immediately.",
  hotlines: [
    { label: "Hotline", number: "911-SANFERNANDO" },
    { label: "Ambulance", number: "8-123-4567" },
  ],
};
```

- [ ] **Step 3: Verify nothing else referenced it**

Run: `npx tsc --noEmit`
Expected: PASS, no output. (A leftover import would surface as `Cannot find name 'EMERGENCY_ASSISTANCE'`.)

Run: `npm run lint`
Expected: PASS. The `PhoneCall`, `Stethoscope` and `TriangleAlert` imports were removed with the JSX; an unused-import error here means Step 1 was applied partially.

- [ ] **Step 4: Commit**

```bash
git add src/features/services/components/services-grid.tsx src/features/services/data.ts
git commit -m "fix(services): drop the Emergency Assistance banner and its invented hotlines"
```

---

### Task 2: The shared pagination primitive

**Files:**
- Create: `src/lib/pagination.ts`
- Create: `tests/unit/pagination.test.ts`
- Create: `src/components/ui/pagination.tsx`
- Modify: `src/features/admin/components/admin-pagination.tsx` (full replacement)

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces:
  - `type PageSlot = number | "gap"`
  - `PAGE_SLOTS: number` (7)
  - `pageWindow(page: number, totalPages: number, slots?: number): PageSlot[]`
  - `<Pagination page pageSize total onPageChange? hrefFor? label? className? />` from `@/components/ui/pagination`. Exactly one of `onPageChange: (page: number) => void` and `hrefFor: (page: number) => string`.
  - `AdminPagination` keeps its existing prop signature exactly: `{ page, pageSize, total, onPageChange, className? }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pagination.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PAGE_SLOTS, pageWindow } from "@/lib/pagination";

/**
 * The page window (transparency table pass, 2026-07-23).
 *
 * The admin managers previously rendered one circle per page, which is fine at
 * four pages and absurd at forty. This helper is the only pure logic in the
 * pagination control, so it is the only part with unit tests — the component
 * around it is verified in the browser.
 *
 * The invariant that matters is constant width: the control must not grow and
 * shrink as the reader pages through it, or the layout jitters under the
 * cursor.
 */

describe("pageWindow", () => {
  it("lists every page when they all fit", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns nothing when there are no pages", () => {
    expect(pageWindow(1, 0)).toEqual([]);
  });

  it("keeps a constant width once windowing kicks in", () => {
    for (let page = 1; page <= 40; page += 1) {
      expect(pageWindow(page, 40)).toHaveLength(PAGE_SLOTS);
    }
  });

  it("always keeps the first page, the last page and the current page reachable", () => {
    for (let page = 1; page <= 40; page += 1) {
      const slots = pageWindow(page, 40);
      expect(slots).toContain(1);
      expect(slots).toContain(40);
      expect(slots).toContain(page);
    }
  });

  it("elides only on the far side near the start", () => {
    expect(pageWindow(1, 40)).toEqual([1, 2, 3, 4, 5, "gap", 40]);
    expect(pageWindow(4, 40)).toEqual([1, 2, 3, 4, 5, "gap", 40]);
  });

  it("elides only on the near side at the end", () => {
    expect(pageWindow(40, 40)).toEqual([1, "gap", 36, 37, 38, 39, 40]);
    expect(pageWindow(37, 40)).toEqual([1, "gap", 36, 37, 38, 39, 40]);
  });

  it("elides both sides in the middle", () => {
    expect(pageWindow(20, 40)).toEqual([1, "gap", 19, 20, 21, "gap", 40]);
  });

  it("clamps a page outside the range instead of producing a hole", () => {
    expect(pageWindow(0, 40)).toEqual(pageWindow(1, 40));
    expect(pageWindow(99, 40)).toEqual(pageWindow(40, 40));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- pagination`
Expected: FAIL — `Failed to resolve import "@/lib/pagination"`.

- [ ] **Step 3: Write `src/lib/pagination.ts`**

```ts
/** A rendered slot in the page control: a page number, or an elided run. */
export type PageSlot = number | "gap";

/**
 * How many slots the control renders once it starts eliding. Seven is the
 * smallest odd count that fits the first page, the last page, the current page
 * with a neighbour either side, and a gap marker on both sides.
 */
export const PAGE_SLOTS = 7;

/**
 * The page numbers to render, with "gap" marking an elided run.
 *
 * Once windowing kicks in the result is always exactly `slots` long, so the
 * control keeps a constant width instead of jittering under the cursor as the
 * reader pages through. `page` is clamped rather than trusted: it arrives from
 * a URL on the public archives.
 */
export function pageWindow(page: number, totalPages: number, slots: number = PAGE_SLOTS): PageSlot[] {
  if (totalPages <= 0) return [];
  if (totalPages <= slots) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const current = Math.min(Math.max(Math.floor(page), 1), totalPages);
  // The first and last page always occupy a slot; `interior` is what is left
  // for the run around the current page, gap markers included.
  const interior = slots - 2;

  // Near the front: one gap, on the far side only.
  if (current <= interior - 1) {
    const head = Array.from({ length: interior - 1 }, (_, index) => index + 2);
    return [1, ...head, "gap", totalPages];
  }

  // Near the end: one gap, on the near side only.
  if (current >= totalPages - (interior - 2)) {
    const tail = Array.from(
      { length: interior - 1 },
      (_, index) => totalPages - interior + 1 + index,
    );
    return [1, "gap", ...tail, totalPages];
  }

  return [1, "gap", current - 1, current, current + 1, "gap", totalPages];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- pagination`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write `src/components/ui/pagination.tsx`**

No `"use client"` directive — see Global Constraints.

```tsx
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { pageWindow } from "@/lib/pagination";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Callback mode: the parent holds `page` in local state. */
  onPageChange?: (page: number) => void;
  /** Link mode: `page` is URL state and every slot is a real <Link>. */
  hrefFor?: (page: number) => string;
  /** Names the <nav> for screen readers, e.g. "Ordinances". */
  label?: string;
  className?: string;
}

interface SlotProps {
  target: number;
  ariaLabel: string;
  isCurrent?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  onPageChange?: (page: number) => void;
  hrefFor?: (page: number) => string;
}

/**
 * One clickable slot.
 *
 * Link mode renders a real <a> so middle-click and open-in-new-tab work on the
 * public archives, where a page is a URL. Both modes live here so they cannot
 * drift apart visually.
 */
function Slot({
  target,
  ariaLabel,
  isCurrent,
  disabled,
  className,
  children,
  onPageChange,
  hrefFor,
}: SlotProps) {
  if (disabled) {
    return (
      <span aria-hidden="true" className={cn(className, "pointer-events-none opacity-40")}>
        {children}
      </span>
    );
  }
  if (hrefFor) {
    return (
      <Link
        href={hrefFor(target)}
        aria-label={ariaLabel}
        aria-current={isCurrent ? "page" : undefined}
        className={className}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-current={isCurrent ? "page" : undefined}
      onClick={() => onPageChange?.(target)}
      className={className}
    >
      {children}
    </button>
  );
}

const SLOT_BASE = "flex h-8 w-8 items-center justify-center rounded-full transition-colors";
const ARROW = cn(SLOT_BASE, "text-ink-500 hover:bg-ink-50 hover:text-ink-900");
const NUMBER = cn(SLOT_BASE, "text-sm font-semibold");

/** "Showing X to Y of Z entries" footer with windowed numbered page controls. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  hrefFor,
  label = "results",
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), totalPages);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  const mode = { onPageChange, hrefFor };

  return (
    <nav
      aria-label={`${label} pagination`}
      className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)}
    >
      <p className="text-sm text-ink-600">
        Showing <span className="font-semibold text-ink-900">{start}</span> to{" "}
        <span className="font-semibold text-ink-900">{end}</span> of{" "}
        <span className="font-semibold text-ink-900">{total}</span> entries
      </p>
      <div className="flex items-center gap-1">
        <Slot
          {...mode}
          target={current - 1}
          ariaLabel="Previous page"
          disabled={current === 1}
          className={ARROW}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Slot>
        {pageWindow(current, totalPages).map((slot, index) =>
          slot === "gap" ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-ink-500">
              &hellip;
            </span>
          ) : (
            <Slot
              key={slot}
              {...mode}
              target={slot}
              ariaLabel={`Page ${slot}`}
              isCurrent={slot === current}
              className={cn(
                NUMBER,
                slot === current
                  ? "bg-brand-500 text-ink-900"
                  : "text-ink-600 hover:bg-ink-50",
              )}
            >
              {slot}
            </Slot>
          ),
        )}
        <Slot
          {...mode}
          target={current + 1}
          ariaLabel="Next page"
          disabled={current === totalPages}
          className={ARROW}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Slot>
      </div>
    </nav>
  );
}
```

- [ ] **Step 6: Replace `src/features/admin/components/admin-pagination.tsx` in full**

```tsx
import { Pagination } from "@/components/ui/pagination";

interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * The admin managers' pagination footer.
 *
 * Kept as a named wrapper so eleven managers keep one unchanged import, while
 * the markup and the page windowing live in the shared primitive — the public
 * transparency archives render the same control in link mode.
 */
export function AdminPagination(props: AdminPaginationProps) {
  return <Pagination {...props} label="records" />;
}
```

- [ ] **Step 7: Verify the admin managers still compile and the build is clean**

Run: `npm run typecheck && npm run lint`
Expected: both PASS. The eleven `AdminPagination` call sites are unchanged, so any error here means the prop signature drifted.

Run: `npm run test:unit`
Expected: PASS, all suites.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pagination.ts tests/unit/pagination.test.ts src/components/ui/pagination.tsx src/features/admin/components/admin-pagination.tsx
git commit -m "feat(ui): add a shared, windowed Pagination usable in link or callback mode"
```

---

### Task 3: Teach the kebab to hold links

**Files:**
- Modify: `src/components/ui/row-actions.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RowAction` gains `href?: string` and `newTab?: boolean`; `onSelect` becomes optional. Every existing admin call site passing `{ label, icon, onSelect, tone?, disabled? }` keeps working unchanged.

- [ ] **Step 1: Widen the `RowAction` interface**

Replace the existing interface at the top of the file:

```ts
export interface RowAction {
  label: string;
  icon: LucideIcon;
  /** Callback items (the admin managers). Supply exactly one of this and `href`. */
  onSelect?: () => void;
  /**
   * Link items (the public transparency tables). Rendered as a real <a>: a
   * Download that is a <button> silently breaks middle-click, open-in-new-tab
   * and right-click-save, which is most of how people take a file.
   */
  href?: string;
  /** Links only. */
  newTab?: boolean;
  /** Destructive items are separated and coloured. */
  tone?: "default" | "danger";
  disabled?: boolean;
}
```

- [ ] **Step 2: Cap the menu height**

A record can carry more files than fit on screen, and the flip calculation trusts `items × ITEM_HEIGHT`. Add the constant beside the existing ones:

```ts
const MENU_WIDTH = 208; // w-52
const ITEM_HEIGHT = 40;
const MENU_PADDING = 8;
const GAP = 6;
// A document can carry more files than fit on screen. Past this the menu
// scrolls internally, and the flip calculation must not trust the raw count.
const MENU_MAX_HEIGHT = 320;
```

Then change the height line inside the `if (open && rect && enabled.length > 0)` block from:

```ts
    const height = enabled.length * ITEM_HEIGHT + MENU_PADDING * 2;
```

to:

```ts
    const height = Math.min(
      enabled.length * ITEM_HEIGHT + MENU_PADDING * 2,
      MENU_MAX_HEIGHT,
    );
```

and add `maxHeight` + scrolling to the `motion.div`'s `style` object, which becomes:

```tsx
          style={{
            top,
            left,
            width: MENU_WIDTH,
            maxHeight: MENU_MAX_HEIGHT,
            overflowY: "auto",
            transformOrigin: flip ? "bottom right" : "top right",
          }}
```

- [ ] **Step 3: Render link items as anchors**

Replace the whole `{enabled.map(...)}` block inside the `motion.div` with:

```tsx
          {enabled.map((action, index) => {
            const Icon = action.icon;
            const danger = action.tone === "danger";
            const firstDanger = danger && enabled[index - 1]?.tone !== "danger" && index > 0;
            const itemClass = cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
              danger
                ? "text-danger hover:bg-danger-soft"
                : "text-ink-700 hover:bg-ink-50 hover:text-ink-900",
              firstDanger && "mt-2 border-t border-ink-200/70 pt-3",
            );
            const content = (
              <>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{action.label}</span>
              </>
            );
            // Two files can share a label, so the label alone is not a key.
            const key = `${index}-${action.label}`;

            return action.href ? (
              <a
                key={key}
                role="menuitem"
                href={action.href}
                target={action.newTab ? "_blank" : undefined}
                rel={action.newTab ? "noopener noreferrer" : undefined}
                tabIndex={index === activeIndex ? 0 : -1}
                // Navigation is the anchor's job; this only tidies the menu up
                // behind it, without stealing focus from wherever the link went.
                onClick={() => close(false)}
                className={itemClass}
              >
                {content}
              </a>
            ) : (
              <button
                key={key}
                type="button"
                role="menuitem"
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => select(action)}
                className={itemClass}
              >
                {content}
              </button>
            );
          })}
```

- [ ] **Step 4: Make the focus and select helpers anchor-aware**

`onSelect` is now optional, and menu items are no longer all buttons. Change the roving-focus effect's generic from `HTMLButtonElement` to `HTMLElement`:

```ts
  // Move DOM focus with the roving index so the menu is genuinely keyboard-driven.
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[activeIndex]?.focus();
  }, [open, activeIndex]);
```

and make `select` tolerate a link item:

```ts
  const select = (action: RowAction) => {
    close();
    action.onSelect?.();
  };
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both PASS. Every admin call site supplies `onSelect`, so making it optional widens the type without breaking anyone.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/row-actions.tsx
git commit -m "feat(ui): let RowActions carry link items, and cap the menu height"
```

---

### Task 4: The public transparency kebab

**Files:**
- Create: `src/features/transparency/components/record-actions.tsx`
- Modify: `src/features/transparency/index.ts`

**Interfaces:**
- Consumes: `RowActions`, `RowAction` from `@/components/ui/row-actions`; `TransparencyFile` from `@/types`.
- Produces: `<RecordActions label={string} viewHref={string | null | undefined} files={TransparencyFile[]} className?={string} />`. **Returns `null` when there is nothing to offer** — callers must render the "At the barangay hall" note themselves in that case.

- [ ] **Step 1: Create `src/features/transparency/components/record-actions.tsx`**

```tsx
"use client";

import { Download, Eye } from "lucide-react";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import type { TransparencyFile } from "@/types";

interface RecordActionsProps {
  /** Named in the trigger's accessible label, e.g. "Ordinance No. 05-2024". */
  label: string;
  /** Detail-page link, or null for records with no page of their own. */
  viewHref?: string | null;
  files: TransparencyFile[];
  className?: string;
}

/**
 * The row kebab for the public transparency tables.
 *
 * A thin client wrapper over RowActions taking only serializable props, so a
 * Server Component can render it: the Lucide icons are imported here rather
 * than handed down, which is what keeps the RSC icon boundary intact.
 *
 * Every file gets its own entry rather than hiding behind a "3 files"
 * disclosure — the menu is already a second click, and a third to reach the
 * actual PDF is one too many.
 *
 * Returns null when there is nothing to offer. The caller renders the
 * "At the barangay hall" note instead; an empty kebab makes the reader hunt
 * for a menu that says nothing.
 */
export function RecordActions({ label, viewHref, files, className }: RecordActionsProps) {
  const actions: RowAction[] = [];

  if (viewHref) {
    actions.push({ label: "View record", icon: Eye, href: viewHref });
  }

  files.forEach((file, index) => {
    actions.push({
      label: file.label || `File ${index + 1}`,
      icon: Download,
      href: file.url,
      newTab: true,
    });
  });

  if (actions.length === 0) return null;

  return <RowActions label={label} actions={actions} className={className} />;
}
```

- [ ] **Step 2: Export it from the barrel**

In `src/features/transparency/index.ts`, add the line directly after the `FileDownloads` export so the barrel stays in page order:

```ts
export { RecordActions } from "./components/record-actions";
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/transparency/components/record-actions.tsx src/features/transparency/index.ts
git commit -m "feat(transparency): add the public row kebab, one entry per file"
```

---

### Task 5: Rework `LegislativeTable` for two paging owners

The `/transparency` previews page themselves; the archive page pages on the server. One table component serves both.

**Files:**
- Modify: `src/features/transparency/components/legislative-table.tsx` (full replacement)

**Interfaces:**
- Consumes: `Pagination` (Task 2), `RecordActions` (Task 4).
- Produces: `<LegislativeTable caption={string} documents={LegislativeDetail[]} previewPageSize?={number} sort?={"client" | "none"} />`. `previewPageSize` set ⇒ the table pages itself and renders its own footer. `sort` defaults to `"client"`.

- [ ] **Step 1: Replace `src/features/transparency/components/legislative-table.tsx` in full**

```tsx
"use client";

import { Fragment, useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateApproved } from "@/lib/format";
import { useDisclosure } from "@/hooks/use-disclosure";
import { useTableSort } from "@/components/ui/use-table-sort";
import { SortableTh } from "@/components/ui/sortable-th";
import { Pagination } from "@/components/ui/pagination";
import { RecordActions } from "./record-actions";
import type { LegislativeDetail, TransparencyFile } from "@/types";

interface LegislativeTableProps {
  /** Screen-reader caption describing the table. */
  caption: string;
  documents: LegislativeDetail[];
  /**
   * Set on the /transparency previews: the table pages itself over the rows it
   * was handed and renders its own footer. Omitted on the archive page, which
   * pages on the server and supplies the footer itself.
   */
  previewPageSize?: number;
  /**
   * "none" on the archive page: its order comes from the server, so sorting
   * one page of four would quietly lie about the other three.
   */
  sort?: "client" | "none";
}

type Accessors = Record<string, (row: LegislativeDetail) => string | number | null>;

// Hoisted out of the render: useTableSort memoises on the accessors object, so
// a fresh literal every render would re-sort every render.
const SORT_ACCESSORS: Accessors = {
  number: (doc) => doc.number,
  title: (doc) => doc.title,
  date: (doc) => doc.dateApproved,
};

// useTableSort returns rows untouched when it finds no accessor for the key,
// which is exactly what the archive wants: the server already chose the order.
const NO_ACCESSORS: Accessors = {};

/** The single PDF a legislative document may carry, in the shape the kebab wants. */
function filesFor(doc: LegislativeDetail): TransparencyFile[] {
  if (!doc.fileUrl) return [];
  return [
    {
      id: doc.id,
      url: doc.fileUrl,
      label: "Download PDF",
      mime: "application/pdf",
      sizeBytes: doc.fileSizeBytes ?? 0,
    },
  ];
}

/** Legislative document table where each row expands to show the document summary. */
export function LegislativeTable({
  caption,
  documents,
  previewPageSize,
  sort = "client",
}: LegislativeTableProps) {
  const sortable = sort === "client";
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    documents,
    { key: sortable ? "date" : "", dir: "desc" },
    sortable ? SORT_ACCESSORS : NO_ACCESSORS,
  );

  const [page, setPage] = useState(1);
  // A new sort re-orders every row, so whatever page the reader was on no
  // longer points at the same records.
  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir]);

  const lastPage = previewPageSize
    ? Math.max(1, Math.ceil(sorted.length / previewPageSize))
    : 1;
  const safePage = Math.min(Math.max(page, 1), lastPage);
  const rows = previewPageSize
    ? sorted.slice((safePage - 1) * previewPageSize, safePage * previewPageSize)
    : sorted;

  const empty = sorted.length === 0;

  return (
    <>
      {/*
        Below md the table becomes stacked cards carrying the same data and the
        same expandable summary. Five columns cannot fit a phone, and a table
        that scrolls sideways inside the page reads as the page itself sliding.
        Sorting controls are omitted on mobile: the rows arrive newest-first,
        which is the useful order, and a sort bar would cost more room than it
        earns. Only one of the two renderings is ever in the a11y tree.
      */}
      <ul className="space-y-3 md:hidden">
        {empty ? (
          <li className="rounded-2xl border border-ink-200/70 bg-white px-4 py-10 text-center text-ink-600">
            No documents have been published yet.
          </li>
        ) : (
          rows.map((doc) => <LegislativeCard key={doc.id} doc={doc} />)
        )}
      </ul>
      <div className="relative hidden overflow-x-auto rounded-3xl border border-ink-200/70 bg-white md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
              <th scope="col" className="w-12 px-4 py-4">
                <span className="sr-only">Expand</span>
              </th>
              {sortable ? (
                <>
                  <SortableTh
                    label="Number"
                    sortKey="number"
                    activeKey={sortKey}
                    dir={sortDir}
                    onToggle={toggle}
                  />
                  <SortableTh
                    label="Title"
                    sortKey="title"
                    activeKey={sortKey}
                    dir={sortDir}
                    onToggle={toggle}
                  />
                  <SortableTh
                    label="Date Approved"
                    sortKey="date"
                    activeKey={sortKey}
                    dir={sortDir}
                    onToggle={toggle}
                  />
                </>
              ) : (
                <>
                  <th scope="col" className="px-6 py-4">
                    Number
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Title
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Date Approved
                  </th>
                </>
              )}
              <th scope="col" className="px-6 py-4 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/70">
            {empty ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-ink-600">
                  No documents have been published yet.
                </td>
              </tr>
            ) : (
              rows.map((doc) => <LegislativeRow key={doc.id} doc={doc} />)
            )}
          </tbody>
        </table>
      </div>
      {previewPageSize && sorted.length > previewPageSize ? (
        <Pagination
          className="mt-4"
          page={safePage}
          pageSize={previewPageSize}
          total={sorted.length}
          onPageChange={setPage}
          label={caption}
        />
      ) : null}
    </>
  );
}

/** Phone-width equivalent of one LegislativeRow, summary and all. */
function LegislativeCard({ doc }: { doc: LegislativeDetail }) {
  const { isOpen, toggle } = useDisclosure();
  const panelId = useId();
  const files = filesFor(doc);

  return (
    <li className="rounded-2xl border border-ink-200/70 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium tabular-nums text-ink-900">{doc.number}</p>
        <RecordActions
          label={doc.number}
          viewHref={`/transparency/legislative/${doc.slug}`}
          files={files}
          className="-mr-2 -mt-1"
        />
      </div>
      <p className="mt-1 text-sm text-ink-900">{doc.title}</p>
      <p className="mt-2 text-sm tabular-nums text-ink-600">
        {formatDateApproved(doc.dateApproved)}
      </p>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-ink-900 hover:underline"
      >
        {isOpen ? "Hide" : "Show"} summary
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-300",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
        <span className="sr-only"> of {doc.number}</span>
      </button>
      <p
        id={panelId}
        hidden={!isOpen}
        className="mt-2 text-sm leading-relaxed text-ink-600"
      >
        {doc.summary}
      </p>
      {files.length === 0 ? (
        <p className="mt-3 border-t border-ink-200/70 pt-3 text-sm text-ink-500">
          At the barangay hall
        </p>
      ) : null}
    </li>
  );
}

/** One document: a summary row plus a toggleable full-width detail row. */
function LegislativeRow({ doc }: { doc: LegislativeDetail }) {
  const { isOpen, toggle } = useDisclosure();
  const panelId = useId();
  const files = filesFor(doc);

  return (
    <Fragment>
      <tr className="transition-colors duration-(--duration-quick) hover:bg-ink-50">
        <td className="px-4 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-300",
                isOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
            <span className="sr-only">
              {isOpen ? "Hide" : "Show"} summary of {doc.number}
            </span>
          </button>
        </td>
        <td className="whitespace-nowrap px-6 py-4 font-medium tabular-nums text-ink-900">
          {doc.number}
        </td>
        <td className="px-6 py-4 text-ink-900">{doc.title}</td>
        <td className="whitespace-nowrap px-6 py-4 tabular-nums text-ink-600">
          {formatDateApproved(doc.dateApproved)}
        </td>
        <td className="px-6 py-4 text-right">
          <span className="flex items-center justify-end gap-2">
            {files.length === 0 ? (
              <span className="text-sm text-ink-500">At the barangay hall</span>
            ) : null}
            <RecordActions
              label={doc.number}
              viewHref={`/transparency/legislative/${doc.slug}`}
              files={files}
            />
          </span>
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

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/transparency/components/legislative-table.tsx
git commit -m "feat(transparency): page the legislative table in place and move actions to the kebab"
```

---

### Task 6: The /transparency preview tables

Raise both preview fetches from 5 rows to 25 (five pages of five), split `LatestUploadsSection` into a Server Component that fetches and a client table that pages, and put the kebab in both.

**Files:**
- Modify: `src/features/transparency/queries.ts` (the `listLatestUploads` doc comment only)
- Modify: `src/features/transparency/components/legislative-section.tsx`
- Create: `src/features/transparency/components/uploads-preview-table.tsx`
- Modify: `src/features/transparency/components/latest-uploads-section.tsx` (full replacement)

**Interfaces:**
- Consumes: `LegislativeTable` with `previewPageSize` (Task 5), `RecordActions` (Task 4), `Pagination` (Task 2).
- Produces: `<UploadsPreviewTable items={UploadBrowseItem[]} pageSize={number} />`. `UploadBrowseItem` is plain JSON (`key`/`type`/`title`/`date`/`href`/`files`/`progress`), so it crosses the RSC boundary as a prop.
- `PREVIEW_LIMIT = 25` is declared locally in each section; it is not a shared export.

- [ ] **Step 1: Correct the stale doc comment in `src/features/transparency/queries.ts`**

The `limit` default already exists; only the comment claims "5". Change:

```ts
/** Most recent 5 uploads across all three sources — the /transparency preview. */
export async function listLatestUploads(limit = 5): Promise<UploadBrowseItem[]> {
```

to:

```ts
/** Most recent uploads across all three sources — the /transparency preview. */
export async function listLatestUploads(limit = 5): Promise<UploadBrowseItem[]> {
```

- [ ] **Step 2: Replace `src/features/transparency/components/legislative-section.tsx` in full**

```tsx
import Link from "next/link";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { LegislativeTable } from "@/features/transparency/components/legislative-table";
import { listRecentLegislative } from "@/features/transparency/queries";

// Five pages of five. The section is still a preview — the archive link below
// is the route to everything — but a single screenful was too little to be
// worth the trip for most readers.
const PREVIEW_LIMIT = 25;
const PREVIEW_PAGE_SIZE = 5;

/** Ordinances and resolutions of the Sangguniang Barangay, each row expandable to its summary. */
export async function LegislativeSection() {
  const [ordinances, resolutions] = await Promise.all([
    listRecentLegislative("ordinance", PREVIEW_LIMIT),
    listRecentLegislative("resolution", PREVIEW_LIMIT),
  ]);

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
          <LegislativeTable
            caption="Barangay ordinances"
            documents={ordinances}
            previewPageSize={PREVIEW_PAGE_SIZE}
          />
        </div>
        <div>
          <h3 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Resolutions
          </h3>
          <LegislativeTable
            caption="Barangay resolutions"
            documents={resolutions}
            previewPageSize={PREVIEW_PAGE_SIZE}
          />
        </div>
      </div>
      <p className="mt-8 text-center">
        <Link href="/transparency/legislative" className="font-semibold text-ink-900 hover:underline">
          Browse and search the full archive →
        </Link>
      </p>
    </Section>
  );
}
```

- [ ] **Step 3: Create `src/features/transparency/components/uploads-preview-table.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { UploadBrowseItem, UploadBrowseType } from "@/types";
import { formatOptionalDate } from "@/lib/format";
import { Pagination } from "@/components/ui/pagination";
import { RecordActions } from "./record-actions";

const TYPE_LABELS: Record<UploadBrowseType, string> = {
  legislative: "Legislative",
  document: "Document",
  project: "Project",
};

interface UploadsPreviewTableProps {
  items: UploadBrowseItem[];
  pageSize: number;
}

/**
 * The /transparency Latest Uploads table.
 *
 * Client-side because paging here is local state, not URL state: three
 * paginated tables share this page, and three competing `?page=` params would
 * be unreadable and would reload the whole route on every click. The archive
 * pages, where a page genuinely is an address, use link mode instead.
 */
export function UploadsPreviewTable({ items, pageSize }: UploadsPreviewTableProps) {
  const [page, setPage] = useState(1);
  const lastPage = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), lastPage);
  const rows = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      {/*
        Below md the table becomes stacked cards. Four columns cannot fit a
        phone, and a table that scrolls sideways inside the page reads as the
        page itself sliding. The two lists render the same rows, so only one is
        ever in the accessibility tree.
      */}
      <ul className="space-y-3 md:hidden">
        {rows.map((item) => (
          <li
            key={item.key}
            className="rounded-2xl border border-ink-200/70 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-ink-900">
                {item.title}
                {item.progress !== null ? (
                  <span className="ml-2 text-xs font-normal text-ink-500">
                    ({item.progress}%)
                  </span>
                ) : null}
              </p>
              <RecordActions
                label={item.title}
                viewHref={item.href}
                files={item.files}
                className="-mr-2 -mt-1"
              />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-500">Type</dt>
                <dd className="text-ink-900">{TYPE_LABELS[item.type]}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-500">Date</dt>
                <dd className="tabular-nums text-ink-900">{formatOptionalDate(item.date)}</dd>
              </div>
            </dl>
            {item.files.length === 0 && !item.href ? (
              <p className="mt-3 border-t border-ink-200/70 pt-3 text-sm text-ink-500">
                At the barangay hall
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-3xl border border-ink-200/70 bg-white md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Latest documents uploaded to the transparency portal
          </caption>
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
              <th scope="col" className="px-6 py-4">
                Title
              </th>
              <th scope="col" className="px-6 py-4">
                Type
              </th>
              <th scope="col" className="px-6 py-4">
                Date
              </th>
              <th scope="col" className="px-6 py-4 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/70">
            {rows.map((item) => (
              <tr
                key={item.key}
                className="transition-colors duration-(--duration-quick) hover:bg-ink-50"
              >
                <td className="px-6 py-4 font-medium text-ink-900">
                  {item.title}
                  {item.progress !== null ? (
                    <span className="ml-2 text-xs font-normal text-ink-500">
                      ({item.progress}%)
                    </span>
                  ) : null}
                </td>
                <td className="px-6 py-4 text-ink-600">{TYPE_LABELS[item.type]}</td>
                <td className="px-6 py-4 tabular-nums text-ink-600">
                  {formatOptionalDate(item.date)}
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="flex items-center justify-end gap-2">
                    {item.files.length === 0 && !item.href ? (
                      <span className="text-sm text-ink-500">At the barangay hall</span>
                    ) : null}
                    <RecordActions
                      label={item.title}
                      viewHref={item.href}
                      files={item.files}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > pageSize ? (
        <Pagination
          className="mt-4"
          page={safePage}
          pageSize={pageSize}
          total={items.length}
          onPageChange={setPage}
          label="Latest uploads"
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Replace `src/features/transparency/components/latest-uploads-section.tsx` in full**

```tsx
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { listLatestUploads } from "@/features/transparency/queries";
import { UploadsPreviewTable } from "./uploads-preview-table";

// Five pages of five. "Browse all uploads" remains the route to everything;
// this is a cap on the preview, not the archive.
const PREVIEW_LIMIT = 25;
const PREVIEW_PAGE_SIZE = 5;

/** Short preview of the most recent uploads across legislative, documents, and projects. */
export async function LatestUploadsSection() {
  const uploads = await listLatestUploads(PREVIEW_LIMIT);
  return (
    <Section id="latest-uploads" tone="white" className="border-t border-ink-200">
      <SectionHeading
        title="Latest Uploads"
        description="Recent documents, legislation, and projects added to the transparency portal."
        action={{ label: "Browse all uploads", href: "/transparency/uploads" }}
      />
      {uploads.length === 0 ? (
        <p className="rounded-2xl bg-ink-50 p-8 text-center text-ink-600">
          No uploads published yet.
        </p>
      ) : (
        <UploadsPreviewTable items={uploads} pageSize={PREVIEW_PAGE_SIZE} />
      )}
    </Section>
  );
}
```

- [ ] **Step 5: Leave the barrel alone**

`UploadsPreviewTable` is an internal split of `LatestUploadsSection`, not a page-level
section, so it is **not** added to `src/features/transparency/index.ts`. The barrel is
what pages import, kept in page order; adding leaf components to it grows the surface
through which a client component could accidentally reach `queries.ts`, which is
`server-only`. `latest-uploads-section.tsx` imports it relatively.

No edit in this step — it exists so a reader does not "fix" the omission.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. The build matters here specifically — passing `items` from a Server Component into a `"use client"` table is where a non-serializable prop would surface.

- [ ] **Step 7: Commit**

```bash
git add src/features/transparency/queries.ts src/features/transparency/components/legislative-section.tsx src/features/transparency/components/uploads-preview-table.tsx src/features/transparency/components/latest-uploads-section.tsx
git commit -m "feat(transparency): paginate the three preview tables in place at 5 per page"
```

---

### Task 7: /transparency/legislative — cards become a table

**Files:**
- Modify: `src/features/transparency/components/legislative-archive.tsx` (full replacement)

**Interfaces:**
- Consumes: `LegislativeTable` with `sort="none"` and no `previewPageSize` (Task 5); `Pagination` in link mode (Task 2).
- Produces: nothing new. The `?q` / `?type` / `?page` params are unchanged, so `src/app/(public)/transparency/legislative/page.tsx` needs no edit.

- [ ] **Step 1: Replace `src/features/transparency/components/legislative-archive.tsx` in full**

```tsx
import Link from "next/link";
import { Search } from "lucide-react";
import type { LegislativeType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Section } from "@/components/ui/section";
import { Pagination } from "@/components/ui/pagination";
import { LegislativeTable } from "./legislative-table";
import { searchLegislative } from "@/features/transparency/queries";

const TYPE_TABS: { value: LegislativeType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ordinance", label: "Ordinances" },
  { value: "resolution", label: "Resolutions" },
];

function hrefFor(q: string, docType: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (docType !== "all") params.set("type", docType);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/transparency/legislative?${qs}` : "/transparency/legislative";
}

export async function LegislativeArchive({
  q,
  docType,
  page,
}: {
  q: string;
  docType: LegislativeType | "all";
  page: number;
}) {
  const { items, total, pageSize } = await searchLegislative({ q, docType, page });
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), lastPage);

  return (
    <Section tone="white">
      <form action="/transparency/legislative" method="get" className="mb-8 flex flex-col gap-4 md:flex-row">
        {docType !== "all" ? <input type="hidden" name="type" value={docType} /> : null}
        <div className="relative w-full">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <label htmlFor="archive-search" className="sr-only">
            Search ordinances and resolutions
          </label>
          <Input
            id="archive-search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search by number, title, or keyword..."
            className="pl-12"
          />
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full whitespace-nowrap md:w-auto">
          Search
        </Button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {TYPE_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={hrefFor(q, tab.value, 1)}
            aria-current={docType === tab.value ? "page" : undefined}
            className={
              docType === tab.value
                ? "rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 hover:border-brand-400"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <p className="mb-4 text-sm text-ink-500">
        {total === 0
          ? "No documents found."
          : `${total} document${total === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}.`}
      </p>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-ink-50 p-8 text-center text-ink-600">
          No ordinances or resolutions match that search. Try a different number or keyword.
        </p>
      ) : (
        // sort="none": the order comes from the RPC, so client sorting would
        // reorder one page of several and quietly misrepresent the rest. No
        // previewPageSize either — the paging below is URL state.
        <LegislativeTable
          caption="Published ordinances and resolutions"
          documents={items}
          sort="none"
        />
      )}

      {lastPage > 1 ? (
        <Pagination
          className="mt-8"
          page={safePage}
          pageSize={pageSize}
          total={total}
          hrefFor={(target) => hrefFor(q, docType, target)}
          label="Legislative archive"
        />
      ) : null}
    </Section>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all PASS. `hrefFor` is a function prop, but `LegislativeArchive`, `Pagination` and `Slot` are all Server Components here — the build failing with a serialization error would mean a stray `"use client"` reached `pagination.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/features/transparency/components/legislative-archive.tsx
git commit -m "feat(transparency): render the legislative archive as a table with numbered paging"
```

---

### Task 8: /transparency/uploads — kebab and the shared control

**Files:**
- Modify: `src/features/transparency/components/uploads-browse.tsx`

**Interfaces:**
- Consumes: `RecordActions` (Task 4), `Pagination` in link mode (Task 2).
- Produces: nothing new. `?q` / `?type` / `?sort` / `?dir` / `?page` are unchanged, so the route file needs no edit.

- [ ] **Step 1: Swap the imports**

At the top of `src/features/transparency/components/uploads-browse.tsx`, replace:

```tsx
import { searchUploads } from "@/features/transparency/queries";
import { FileDownloads } from "./file-downloads";
```

with:

```tsx
import { searchUploads } from "@/features/transparency/queries";
import { Pagination } from "@/components/ui/pagination";
import { RecordActions } from "./record-actions";
```

- [ ] **Step 2: Replace the mobile card's action footer**

Replace this block inside the `<ul className="space-y-3 md:hidden">` map:

```tsx
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-ink-200/70 pt-3 text-sm">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="font-semibold uppercase text-ink-900 hover:underline"
                    >
                      View
                      <span className="sr-only"> {item.title}</span>
                    </Link>
                  ) : null}
                  <FileDownloads files={item.files} recordTitle={item.title} align="left" />
                </div>
```

with:

```tsx
                {item.files.length === 0 && !item.href ? (
                  <p className="mt-3 border-t border-ink-200/70 pt-3 text-sm text-ink-500">
                    At the barangay hall
                  </p>
                ) : null}
```

and put the kebab beside the title by replacing the card's title line:

```tsx
                <p className="font-medium text-ink-900">{item.title}</p>
```

with:

```tsx
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-ink-900">{item.title}</p>
                  <RecordActions
                    label={item.title}
                    viewHref={item.href}
                    files={item.files}
                    className="-mr-2 -mt-1"
                  />
                </div>
```

- [ ] **Step 3: Rename the last column and replace its cell**

Replace the final header cell:

```tsx
                <th scope="col" className="px-6 py-4 text-right">
                  Files
                </th>
```

with:

```tsx
                <th scope="col" className="px-6 py-4 text-right">
                  Actions
                </th>
```

and replace the final body cell:

```tsx
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end gap-1">
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="text-sm font-semibold uppercase text-ink-900 hover:underline"
                        >
                          View
                        </Link>
                      ) : null}
                      <FileDownloads files={item.files} recordTitle={item.title} align="right" />
                    </div>
                  </td>
```

with:

```tsx
                  <td className="px-6 py-4 text-right">
                    <span className="flex items-center justify-end gap-2">
                      {item.files.length === 0 && !item.href ? (
                        <span className="text-sm text-ink-500">At the barangay hall</span>
                      ) : null}
                      <RecordActions
                        label={item.title}
                        viewHref={item.href}
                        files={item.files}
                      />
                    </span>
                  </td>
```

- [ ] **Step 4: Replace the pagination nav**

Replace the whole trailing block:

```tsx
      {lastPage > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-4">
          {safePage > 1 ? (
            <Link
              href={hrefFor(q, type, sort, dir, safePage - 1)}
              className="font-semibold text-ink-900 hover:underline"
            >
              ← Previous
            </Link>
          ) : null}
          <span className="text-sm text-ink-500">
            Page {safePage} of {lastPage}
          </span>
          {safePage < lastPage ? (
            <Link
              href={hrefFor(q, type, sort, dir, safePage + 1)}
              className="font-semibold text-ink-900 hover:underline"
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
```

with:

```tsx
      {lastPage > 1 ? (
        <Pagination
          className="mt-8"
          page={safePage}
          pageSize={first.pageSize}
          total={total}
          hrefFor={(target) => hrefFor(q, type, sort, dir, target)}
          label="Transparency uploads"
        />
      ) : null}
```

- [ ] **Step 5: Verify the `Link` import is still used**

`Link` is still used by the type tabs and the sortable column headers, so the import stays. Confirm:

Run: `npm run lint`
Expected: PASS. An `'Link' is defined but never used` error means a tab or header edit went too far.

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/transparency/components/uploads-browse.tsx
git commit -m "feat(transparency): move uploads actions to the kebab and use the shared pager"
```

---

### Task 9: Regenerate the production baseline for 0001–0023

The file at `supabase/baseline/0000_baseline_2026-07-23.sql` currently squashes `0001`–`0022` and is **untracked**. It gains `0023_feedback` and loses its demo seeds.

**Read first:** `supabase/migrations/0023_feedback.sql` in full. Everything folded in below comes from it verbatim.

**Files:**
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql`

**Interfaces:**
- Consumes: nothing in `src/`.
- Produces: a single-transaction DDL file for an empty `public` schema.

- [ ] **Step 1: Update the header scope and section map**

In the header block, change every statement of scope from `0001–0022` / `0022` to `0001–0023` / `0023`. Specifically the title line `-- Squash of migrations 0001–0022, as of 2026-07-23.`, the `WHAT THIS IS` paragraph, the `WHEN TO USE IT` bullet, and the `HOW IT DIFFERS` heading.

In the `SECTION MAP`, change line `--   9. Inquiries & alert subscribers` to:

```
--   9. Inquiries, feedback & alert subscribers
```

and delete the line `--  14. Seed — demo content (safe to delete before applying)`, renumbering `15` to `14`:

```
--  13. Seed — reference data & real content (required)
--  14. Audit-log immutability (applied last, on purpose)
```

- [ ] **Step 2: Add the two feedback enums to §3**

Append to the end of §3 (`3. ENUMS`), after the `site_block` enum, and update the section's migration tag from `[0007, 0009, 0012, 0014, 0019, 0021, 0022]` to `[0007, 0009, 0012, 0014, 0019, 0021, 0022, 0023]`:

```sql
create type public.feedback_category as enum ('general', 'bug', 'feature', 'complaint', 'praise');

-- Deliberately NOT the inquiry_status enum. 'answered' would be a lie on a row
-- nobody can answer, because site feedback is anonymous and carries no reply
-- address. These four values are already carried by StatusChip's label and tone
-- maps, so the admin chip needs no edit.
create type public.feedback_status as enum ('new', 'in_progress', 'resolved', 'dismissed');
```

- [ ] **Step 3: Add the `feedback` table to §9**

Rename the section heading and tag:

```sql
-- 9. INQUIRIES, FEEDBACK & ALERT SUBSCRIBERS                       [0019, 0023]
```

Then insert this **between** the `inquiries_updated_at` trigger and the `create table public.alert_subscribers` statement:

```sql
-- ── Site feedback ───────────────────────────────────────────────────────────
-- /contact is for barangay business: it demands a name, an email and a Data
-- Privacy Act consent tick. A resident with a note about a dead download link
-- had no channel that fit. This is that channel.
--
-- Anonymous by design: no name, no email, no account link, and the caller's IP
-- is used to rate-limit but never stored. That removes the DPA consent question
-- entirely — there is no personal data here to consent to the processing of.
-- The accepted cost is that staff can never follow up on a report.
--
-- Reads go through requirePermission("handle-inquiries") — the same gate as the
-- inquiry inbox, because the same people work both queues.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  category public.feedback_category not null default 'general',
  subject text not null,
  message text not null,
  -- Null means "not given". The rating is optional, and storing 0 for
  -- "unrated" would drag every average down.
  rating smallint check (rating between 1 and 5),
  -- The page the resident was on when they opened the widget. Path only, never
  -- the query string: a path is context, a query string can carry a token or
  -- something the resident typed into a search box.
  page_path text not null default '',
  -- `feedback/<uuid>.<ext>` in the private feedback-media bucket, or null.
  screenshot_path text,
  status public.feedback_status not null default 'new',
  -- Internal triage note. Never sent anywhere — there is no address to send to.
  staff_note text not null default '',
  -- Nullable, ON DELETE SET NULL: deleting a staff account must not delete the
  -- report. The audit log holds the durable record of who did what.
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The queue is worked newest-first and filtered by status, which is this index.
create index feedback_status_created_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

create trigger feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();
```

- [ ] **Step 4: Add the private bucket to §11**

Change the section tag to `[0007, 0009, 0023]` and replace the opening comment's first line — `-- Two public buckets.` — with this fuller note, keeping the rest of the existing paragraph intact:

```sql
-- Three buckets: two public, one private. The public pair are separate because
-- the limits differ — 2MB for images vs 10MB for PDFs (MAX_PDF_BYTES /
-- MAX_DOC_FILE_BYTES in src/lib/storage.ts) — and holding both in one bucket's
-- upload actions invited applying the wrong one.
--
--   public-media      images: news photos, announcement/event covers,
--                     officials/ portraits, achievements/<id>/ photos,
--                     site/ home & About imagery. JPEG/PNG/WebP, 2MB.
--   public-documents  PDFs and document images, 10MB.
--   feedback-media    PRIVATE. Screenshots attached to anonymous site feedback.
```

Then add the bucket insert after the `public-documents` insert:

```sql
-- PRIVATE, unlike the two above. A screenshot of the page a resident was
-- looking at can contain their own account page, their ticket, or their name; a
-- public bucket would leave that readable by anyone holding the URL, forever.
-- There is deliberately NO read policy below: the service-role client is the
-- only reader and it mints a short-lived signed URL per page load.
insert into storage.buckets (id, name, public)
  values ('feedback-media', 'feedback-media', false)
  on conflict (id) do nothing;
```

Leave the two `create policy "public read …"` statements exactly as they are, and add **no** policy for `feedback-media`.

- [ ] **Step 5: Bring `search_admin_global` up to 0023**

Change the §12 tag to `[0015, 0016, 0017, 0018, 0023]`.

The baseline's `search_admin_global` (from line ~1316) is 0018's version. Append the feedback branch to it: the function body's final union member currently ends with the `assistance` block and a closing `);`. Change that block's terminator from `);` to `)` and append:

```sql
  union all
  -- Feedback has no ticket number and no name: the subject is the label and the
  -- category is the sublabel.
  ( select 'feedback'::text, f.id::text, f.subject, f.category::text, f.status::text
    from public.feedback f
    where 'feedback' = any (p_modules)
      and public.fuzzy_match(f.subject || ' ' || f.message, p_q)
    order by f.created_at desc
    limit greatest(p_limit, 1) );
```

The `revoke execute on function public.search_admin_global(text, text[], int)` line at the end of §12 already exists and needs no change.

- [ ] **Step 6: Delete §14 entirely**

Delete everything from the line:

```
-- ════════════════════════════════════════════════════════════════════════════
-- 14. SEED — DEMO CONTENT (safe to delete before applying)
```

down to and including the last demo insert:

```sql
insert into public.transparency_projects (name, progress, sort_order, status, published_at) values
  ('Barangay Hall Renovation', 100, 1, 'published', now()),
  ('Main Road Lighting Phase II', 65, 2, 'published', now());
```

That removes the seeded news articles and their photos, announcements, events, legislative documents, transparency documents and monitored projects. **Everything in §13 stays** — services, the assistance/news/transparency category tables, the 12 officials, and the `site_blocks` + `site_items` rows behind the Home and About pages.

Renumber the following section heading from `15.` to `14.`:

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- 14. AUDIT-LOG IMMUTABILITY                                             [0014]
```

- [ ] **Step 7: Add the empty-feeds note to §13**

Append to the end of §13's opening comment (after `-- verified real barangay content. Do not skip it.`):

```sql
--
-- There is deliberately NO demo content. A freshly baselined site comes up with
-- no news articles, no announcements, no events, no legislative documents, no
-- transparency documents and no monitored projects; those sections render their
-- empty states until staff publish through the admin portal. That is intended —
-- launching with placeholder posts is worse than launching with empty feeds.
```

- [ ] **Step 8: Update the post-apply checklist**

Replace the `POST-APPLY CHECKLIST` items 4 and 5 at the foot of the file:

```
--   4. Confirm all three Storage buckets exist: public-media and
--      public-documents PUBLIC, feedback-media PRIVATE. A public
--      feedback-media would expose residents' screenshots to anyone holding a
--      URL.
--   5. Smoke-test: /, /about, /officials, /services, /transparency,
--      /announcements, the feedback widget, and an /admin login. The content
--      sections will be empty — that is expected, see §13.
```

In the same block, delete the stale gap line `--   • search_admin_global does not cover inquiries.` → replace with:

```
--   • search_admin_global covers feedback but still does not cover inquiries.
```

- [ ] **Step 9: Structural audit**

There is no production database to apply against, and migrations are applied manually by the owner — so this step is a read, not an execution. Confirm each of the following:

Run: `grep -c "^create type public\." supabase/baseline/0000_baseline_2026-07-23.sql`
Expected: `9` — content_status, event_category, legislative_type, official_group, audit_action, inquiry_status, site_block, feedback_category, feedback_status.

Run: `grep -n "search_admin_global\|create table public.feedback\|feedback-media" supabase/baseline/0000_baseline_2026-07-23.sql`
Expected: `search_admin_global` appears exactly twice (one `create or replace function`, one `revoke`), `create table public.feedback` once, `feedback-media` twice (the bucket insert plus the §11 comment).

Run: `grep -n "insert into public.news_articles\|insert into public.announcements\|insert into public.events\|insert into public.legislative_documents\|insert into public.transparency_documents\|insert into public.transparency_projects" supabase/baseline/0000_baseline_2026-07-23.sql`
Expected: **no output.** Any hit means §14 was only partly removed.

Run: `grep -n "0022\b" supabase/baseline/0000_baseline_2026-07-23.sql`
Expected: only references to migration `0022` as a *source* (the `official_group` and `site_block` notes and section tags) — no surviving claim that the file's scope ends at 0022.

Also confirm by eye that `begin;` appears once near the top and `commit;` once near the bottom, and that `public.feedback` is created **after** `public.profiles` (§4) since it references it.

- [ ] **Step 10: Commit**

```bash
git add supabase/baseline/
git commit -m "feat(db): regenerate the production baseline for 0001-0023, without demo seeds"
```

---

### Task 10: Browser verification and a public e2e guard

**Files:**
- Modify: `tests/e2e/public/site.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Full static verification**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run build`
Expected: all four PASS. Record the actual output; do not claim success without it.

- [ ] **Step 2: Add a public e2e guard for the kebab**

Append to `tests/e2e/public/site.spec.ts`. This runs under the `public` project and needs no login. It is written to pass on an empty database too — an environment with no published documents renders no kebabs, and asserting rows exist would make the suite depend on seed data.

```ts
test.describe("transparency row actions", () => {
  test("a row kebab opens a menu of links, and Escape closes it", async ({ page }) => {
    await page.goto("/transparency");
    await expect(page.getByRole("main")).toBeVisible();

    const kebabs = page.getByRole("button", { name: /^Actions for / });
    const count = await kebabs.count();
    // An environment with nothing published renders no kebabs. That is a valid
    // state, not a failure — the baseline ships without demo content.
    test.skip(count === 0, "no published transparency records in this environment");

    const kebab = kebabs.first();
    await kebab.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Every item is a link: View goes to a detail page, each Download to a file.
    await expect(menu.getByRole("menuitem").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(kebab).toBeFocused();
  });
});
```

- [ ] **Step 3: Run the public e2e suite**

Run: `npm run test:e2e -- --project=public`
Expected: PASS (the new test may report as skipped if the local database has no published transparency records — that is an acceptable outcome, but say so rather than calling it a pass).

- [ ] **Step 4: Drive the pages by hand**

Follow `.claude/skills/verify/SKILL.md`. Check, and report what you actually saw:

1. `/services` — the Emergency Assistance card is gone; the grid reflows with no hole; no `911-SANFERNANDO` anywhere in the page source.
2. `/transparency` — all three tables show `Showing 1 to 5 of N entries` when N > 5, and no footer at all when N ≤ 5. Paging one table does not move the other two and does not change the URL. Changing a sort returns the table to page 1.
3. `/transparency/legislative` — renders as a table with an expand chevron, no sort arrows in the headers, and the numbered control below. Page 2 is a real URL (`?page=2`) that survives a reload. A search resets to page 1.
4. `/transparency/uploads` — the last column is `Actions`; the column sort links still work and preserve `q`/`type` through a page change.
5. The kebab: arrow keys move focus, `Home`/`End` jump, `Escape` closes and returns focus to the trigger, `Tab` dismisses without leaving an orphan menu. A kebab on the **last** row near the viewport bottom flips its menu upward. Middle-clicking a Download opens the PDF in a new tab.
6. At 375px width: all four pages, no horizontal scroll on `<body>`; the kebab sits beside each card's title.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/public/site.spec.ts
git commit -m "test(e2e): guard the transparency row kebab's menu and keyboard dismissal"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| A. One pagination primitive | 2 |
| B. One kebab, taught to hold links | 3 (`RowActions`), 4 (`RecordActions`) |
| C. `/transparency` previews, 5/page over 25 | 5 (legislative), 6 (uploads + fetch limits) |
| D. `/transparency/legislative` cards → table | 5 (`sort`/`previewPageSize` props), 7 |
| E. `/transparency/uploads` | 8 |
| F. `/services` banner removed | 1 |
| G. Baseline for 0001–0023 | 9 |
| Testing & verification | 2 (unit), 10 (build, e2e, browser) |

Spec item covered but worth calling out: the spec says `FileDownloads` is **not** deleted. It survives — `disclosure-grid.tsx` still imports it, and no task touches that file.

**Type consistency check:** `previewPageSize` and `sort` are named identically in Tasks 5, 6 and 7. `RecordActions` takes `label` / `viewHref` / `files` / `className` in Tasks 4, 5, 6 and 8 alike. `Pagination`'s props (`page` / `pageSize` / `total` / `onPageChange` / `hrefFor` / `label` / `className`) match across Tasks 2, 5, 6, 7 and 8. `pageWindow(page, totalPages, slots?)` is used only inside `Pagination` and the unit test.

**Known ordering constraint:** Tasks 5–8 all depend on Tasks 2, 3 and 4. Task 1 and Task 9 are independent of everything and of each other.
