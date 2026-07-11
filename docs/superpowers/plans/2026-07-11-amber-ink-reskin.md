# Amber + Ink Full Re-skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the entire Barangay Sampaguita site (public pages + admin shell) to the ConstructEng reference design — amber "brand" accent, near-black "ink" neutrals, Space Grotesk display type, floating pill navbar, dark footer — with zero content/route/data changes.

**Architecture:** Token-first re-theme. Task 1 swaps the `@theme` palette and adds *transitional aliases* for the old token names, so the whole site immediately renders in the new palette without touching components. Tasks 2–5 rewrite the UI primitives and chrome (navbar/footer/heroes) with complete code. Tasks 6–10 are mechanical sweeps over feature/admin components using the Global Class Mapping. Task 11 deletes the transitional aliases and proves nothing references them.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind CSS v4 (`@theme` in `src/app/globals.css`), `next/font/google`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-11-amber-ink-reskin-design.md`

## Global Constraints

- **No test framework exists.** Every task's test cycle is: `npm run typecheck` (must exit 0) → `npm run build` (must exit 0, all routes prerender `○ (Static)`) → the task's stated grep checks. Run them exactly as written.
- **Content is frozen.** Never change user-visible strings, `data.ts` files, `src/types/index.ts`, routes, or `src/constants/site.ts` (its values are consumed differently, never edited).
- **No raw hex in components.** Colors come only from `@theme` tokens (Tailwind palette classes like `text-white`, `border-white/10`, `bg-ink-900/[0.06]` and arbitrary rgba **shadows** are allowed — shadows are the one sanctioned rgba use, matching the reference).
- **Client islands:** only `nav-link.tsx`, `mobile-nav.tsx`, `accordion.tsx`, `inquiry-form.tsx`, `newsletter-form.tsx`, `use-disclosure.ts` and (new in Task 3) `site-header.tsx` may have `"use client"`. Do not add it elsewhere.
- **Commit after every task** with the exact message given in the task's final step.
- Path alias `@/*` → `src/*`. Windows/PowerShell environment — but all commands below work in Git Bash too.

### Global Class Mapping (applies to every sweep task, 6–10)

Apply these substitutions verbatim wherever they appear in the files a task lists. They are exhaustive for colors; shape/type rules follow the table.

| Old class | New class |
| --- | --- |
| `text-primary` | `text-ink-900` |
| `text-primary-strong` | `text-ink-950` |
| `bg-primary` | `bg-ink-900` |
| `bg-primary-strong` | `bg-ink-950` |
| `border-primary` / `hover:border-primary` | `border-ink-900` / `hover:border-ink-900` |
| `hover:bg-primary-strong` | `hover:bg-ink-800` |
| `hover:text-primary` | `hover:text-ink-900` |
| `ring-primary` | `ring-ink-900` |
| `text-secondary` / `hover:text-secondary` | `text-brand-700` / `hover:text-brand-700` |
| `border-secondary` / `hover:border-secondary` | `border-ink-300` / `hover:border-ink-400` |
| `hover:bg-secondary` | `hover:bg-ink-800` |
| `ring-secondary` / `outline-secondary` | `ring-brand-400/30` / `outline-brand-500` |
| `text-accent` / `hover:text-accent` | `text-brand-500` / `hover:text-brand-600` |
| `bg-accent` | `bg-brand-500` |
| `border-accent` | `border-brand-400` |
| `bg-accent-soft` / `hover:bg-accent-soft` | `bg-brand-100` / `hover:bg-brand-100` |
| `text-accent-muted` | `text-brand-300` |
| `ring-accent-soft` / `ring-accent-muted` / `ring-accent` | `ring-brand-400/20` / `ring-brand-300` / `ring-brand-400` |
| `bg-surface` | `bg-white` |
| `bg-surface-low` / `hover:bg-surface-low` | `bg-ink-50` / `hover:bg-ink-50` |
| `bg-surface-mid` | `bg-ink-100` |
| `bg-surface-high` / `hover:bg-surface-high` | `bg-ink-100` / `hover:bg-ink-100` |
| `bg-surface-highest` / `hover:bg-surface-highest` | `bg-ink-200` / `hover:bg-ink-200` |
| `border-surface-high` / `border-surface-highest` | `border-ink-200` |
| `border-line` / `hover:border-line` | `border-ink-200` / `hover:border-ink-300` |
| `divide-line` | `divide-ink-200` |
| `bg-line` | `bg-ink-200` |
| `text-line` | `text-ink-300` |
| `text-ink` (exact, not `text-ink-*`) | `text-ink-900` |
| `text-ink-muted` | `text-ink-600` |
| `text-outline` | `text-ink-500` |
| `text-blue-100` / `text-blue-200` | `text-ink-300` |
| `text-blue-300` | `text-ink-400` |
| `bg-blue-50` | `bg-brand-100` (pair its `text-secondary` sibling → `text-brand-700`) |
| `border-yellow-400` | `border-brand-400` |
| `danger`, `danger-deep`, `danger-soft`, `danger-soft-fg` classes | **unchanged** (tokens re-tuned in Task 1) |

**Shape rules (sweeps):** container/card `rounded` / `rounded-md` / `rounded-lg` → `rounded-3xl`; `rounded-xl` → `rounded-3xl`; small inner chips/thumbnails/inputs `rounded`/`rounded-lg` → `rounded-2xl`; standalone icon buttons/pills → `rounded-full`. Panels that are full-width dark bands become contained `rounded-[2rem]` panels only where a task says so (CtaBanner in Task 5 handles most).

**Type rules (sweeps):** on headings (`h1–h6` and elements styled as headings): `font-bold`/`font-extrabold` → `font-semibold tracking-tight`, and **remove `uppercase`** from headings. Keep `uppercase` on eyebrow labels, badges, table headers, and tiny meta labels. Body copy on dark surfaces: `text-blue-*` per table; muted dark-surface copy is `text-ink-300`.

**Dark-panel accent (sweeps):** any surviving dark (`bg-ink-900`/`bg-ink-950`) panel gets, as its first child:
```tsx
<div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl" />
```
and needs `relative overflow-hidden` on the panel plus `relative` on its content wrapper.

---

### Task 1: Theme tokens, fonts, signature utilities

**Files:**
- Modify: `src/app/globals.css` (full rewrite below)
- Modify: `src/app/layout.tsx` (font swap)

**Interfaces:**
- Produces: token classes `brand-100..800`, `ink-50..950`, re-tuned `danger*`, `--font-display` = Space Grotesk; utility classes `grid-bg`, `bg-radial-fade`, `text-gradient-brand`; transitional aliases (`primary`, `primary-strong`, `secondary`, `accent`, `accent-soft`, `accent-muted`, `surface*`, `line`, `outline`, `ink`, `ink-muted`) mapped onto the new palette so unmodified components keep compiling and immediately render amber/ink. All later tasks consume these.

- [ ] **Step 1: Rewrite `src/app/globals.css`**

Replace the entire file with:

```css
@import "tailwindcss";

/*
 * Amber + Ink design tokens
 * Derived from docs/superpowers/specs/2026-07-11-amber-ink-reskin-design.md
 * (reference: constructioneng.vercel.app) — single source of truth for
 * color, typography, radius, elevation, and signature utilities.
 */
@theme {
  /* Brand — amber */
  --color-brand-100: #fef3c7;
  --color-brand-200: #fde68a;
  --color-brand-300: #fcd34d;
  --color-brand-400: #fbbf24;
  --color-brand-500: #f59e0b;
  --color-brand-600: #d97706;
  --color-brand-700: #b45309;
  --color-brand-800: #92400e;

  /* Ink — neutrals */
  --color-ink-50: #f7f7f8;
  --color-ink-100: #eeeef0;
  --color-ink-200: #d8d8dd;
  --color-ink-300: #b6b6bf;
  --color-ink-400: #8e8e9b;
  --color-ink-500: #71717f;
  --color-ink-600: #5b5b67;
  --color-ink-700: #4a4a55;
  --color-ink-800: #3f3f47;
  --color-ink-900: #1a1a1f;
  --color-ink-950: #0d0d10;

  /* Emergency red — re-tuned for the new neutrals */
  --color-danger: #dc2626;
  --color-danger-deep: #991b1b;
  --color-danger-soft: #fee2e2;
  --color-danger-soft-fg: #b91c1c;
  --color-danger-bright: #f87171; /* red accents on dark ink surfaces */

  /*
   * TRANSITIONAL ALIASES — legacy token names remapped onto the new
   * palette so untouched components render correctly mid-migration.
   * Removed in the final cleanup task; do not add new usages.
   */
  --color-primary: #1a1a1f;
  --color-primary-strong: #0d0d10;
  --color-secondary: #b45309;
  --color-accent: #f59e0b;
  --color-accent-soft: #fef3c7;
  --color-accent-muted: #fcd34d;
  --color-surface: #ffffff;
  --color-surface-low: #f7f7f8;
  --color-surface-mid: #eeeef0;
  --color-surface-high: #eeeef0;
  --color-surface-highest: #d8d8dd;
  --color-line: #d8d8dd;
  --color-outline: #71717f;
  --color-ink: #1a1a1f;
  --color-ink-muted: #5b5b67;

  /* Typography */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif;

  /* Elevation */
  --shadow-ambient: 0px 8px 30px rgb(0 0 0 / 0.06);

  /* Layout */
  --container-page: 80rem;

  /* Motion */
  --animate-fade-up: fade-up 0.6s ease-out both;

  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(1rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}

@utility grid-bg {
  background-image:
    linear-gradient(to right, rgb(26 26 31 / 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(26 26 31 / 0.05) 1px, transparent 1px);
  background-size: 44px 44px;
}

@utility bg-radial-fade {
  background: radial-gradient(closest-side, rgb(245 158 11 / 0.14), transparent);
}

@utility text-gradient-brand {
  background-image: linear-gradient(to bottom right, #fbbf24, #d97706);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

@layer base {
  body {
    @apply bg-white text-ink-900 font-sans antialiased;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    @apply font-display;
  }

  ::selection {
    @apply bg-brand-100 text-brand-800;
  }
}
```

- [ ] **Step 2: Swap Montserrat → Space Grotesk in `src/app/layout.tsx`**

Replace lines 1–14 (imports + font consts) so the file starts:

```tsx
import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { SITE } from "@/constants/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});
```

And in the body tag replace `${montserrat.variable}` with `${spaceGrotesk.variable}`:

```tsx
      <body className={`${inter.variable} ${spaceGrotesk.variable} min-h-screen`}>
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0; build output lists all routes as static. The site now renders in amber/ink everywhere (old shapes, new colors).

Run: `grep -rn "montserrat" src`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: amber + ink theme tokens, Space Grotesk, signature utilities"
```

---

### Task 2: UI primitives

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/icon-circle.tsx`
- Modify: `src/components/ui/section.tsx`
- Modify: `src/components/ui/section-heading.tsx`
- Modify: `src/components/ui/form.tsx`
- Modify: `src/components/ui/accordion.tsx`
- Modify: `src/components/ui/data-table.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces (exact, later tasks rely on these):
  - `Button` — same props; variant keys unchanged: `primary` (amber gradient), `accent` (solid ink-900), `outline`, `white`, `outline-white`, `outline-danger`, `ghost`; sizes `sm|md|lg|xl` now fixed-height pills.
  - `Badge` — same variant keys; now a pill that can contain a leading icon (`inline-flex items-center gap-1.5`).
  - `SectionHeading` — **prop change:** `underline?: boolean` REMOVED, `eyebrow?: string` ADDED. Signature: `{ title, description?, eyebrow?, action?, align?, className? }`.
  - `Section` — same tone keys (`default|white|muted|raised|primary`), new values.
  - `Field`/`Input`/`Select`/`Textarea`/`Checkbox`, `Accordion`, `DataTable`, `IconCircle`, `CardHeader` — same props, restyled.

- [ ] **Step 1: Rewrite `src/components/ui/button.tsx` variant/size/base classes**

Replace the `variants`, `sizes` consts and the `cn(...)` base string (keep everything else — props, Link/button branching — exactly as is):

```tsx
const variants = {
  primary:
    "bg-gradient-to-br from-brand-400 to-brand-600 text-ink-900 shadow-[0_8px_24px_rgba(245,158,11,0.35)] hover:shadow-[0_14px_38px_rgba(245,158,11,0.5)] hover:brightness-110",
  accent:
    "bg-ink-900 text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] hover:bg-ink-800 hover:shadow-[0_12px_32px_rgba(0,0,0,0.24)]",
  outline:
    "border border-ink-200 bg-white/70 text-ink-900 backdrop-blur hover:border-ink-300 hover:bg-white",
  white: "bg-white text-ink-900 shadow-[0_8px_24px_rgba(0,0,0,0.12)] hover:bg-ink-50",
  "outline-white": "border border-white/25 bg-white/5 text-white backdrop-blur hover:bg-white/15",
  "outline-danger":
    "border border-danger text-danger hover:bg-danger-soft hover:text-danger-soft-fg",
  ghost: "text-ink-900 hover:bg-ink-900/5",
} as const;

const sizes = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-12 px-7 text-base",
  xl: "h-14 px-9 text-base",
} as const;
```

Base classes (inside `cn(`):

```tsx
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60",
```

(Note: `uppercase tracking-wide` is gone; pills are sentence-case per the reference.)

- [ ] **Step 2: Rewrite `src/components/ui/badge.tsx` variants + base**

```tsx
const variants = {
  accent: "border-transparent bg-brand-500 text-ink-900",
  urgent: "border-transparent bg-danger-soft text-danger-soft-fg",
  new: "border-transparent bg-danger text-white",
  soft: "border-brand-200 bg-brand-100 text-brand-800",
  inverse: "border-white/15 bg-white/5 text-brand-300",
  neutral: "border-ink-200 bg-ink-50 text-ink-600",
} as const;
```

Base classes in the `<span>`:

```tsx
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
```

- [ ] **Step 3: Rewrite `src/components/ui/card.tsx` surfaces**

`Card` div classes:

```tsx
        "rounded-3xl border border-ink-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]",
        interactive &&
          "transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.18)]",
```

`CardHeader` — border + title styling:

```tsx
    <div
      className={cn("mb-6 flex items-center justify-between border-b border-ink-200/70 pb-4", className)}
      {...props}
    >
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink-900">
        {icon}
        {title}
      </h3>
      {action}
    </div>
```

- [ ] **Step 4: Rewrite `src/components/ui/icon-circle.tsx` tones**

```tsx
const tones = {
  primary: "bg-brand-100 text-brand-700",
  secondary: "bg-ink-100 text-ink-700",
  danger: "bg-danger-soft text-danger",
  white: "bg-white text-brand-700 border border-ink-200",
  inverse: "bg-white/10 text-brand-300",
} as const;
```

Also change `square ? "rounded-lg"` → `square ? "rounded-2xl"`.

- [ ] **Step 5: Rewrite `src/components/ui/section.tsx` tones**

```tsx
const tones = {
  default: "bg-white",
  white: "bg-white",
  muted: "bg-ink-50",
  raised: "bg-ink-100",
  primary: "bg-ink-950 text-white",
} as const;
```

Keep `py-12 md:py-16` and the rest unchanged.

- [ ] **Step 6: Rewrite `src/components/ui/section-heading.tsx`**

Full new file (drops `underline`, adds `eyebrow`):

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface SectionHeadingProps {
  title: string;
  description?: string;
  /** Small uppercase pill rendered above the title. */
  eyebrow?: string;
  /** Optional "view all" style link rendered on the right. */
  action?: { label: string; href: string };
  align?: "left" | "center";
  className?: string;
}

/** Standard section title row with optional eyebrow pill, description, and action link. */
export function SectionHeading({
  title,
  description,
  eyebrow,
  action,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "mb-8 md:mb-12",
        align === "center"
          ? "text-center"
          : "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        {eyebrow ? (
          <Badge variant="soft" className="mb-4">
            {eyebrow}
          </Badge>
        ) : null}
        <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className={cn("mt-3 text-ink-600", align === "center" && "mx-auto max-w-2xl")}>
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:border-ink-300 hover:bg-ink-50"
        >
          {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
```

Then fix its call sites that pass `underline`:
Run: `grep -rln "underline" src/features src/components --include='*.tsx'`
In each match that is a `<SectionHeading ... underline ... />` usage, delete the `underline` prop (leave text-decoration `underline`/`hover:underline` utility classes alone).

- [ ] **Step 7: Rewrite `src/components/ui/form.tsx` field styling**

```tsx
const fieldClasses =
  "w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 shadow-sm transition-colors placeholder:text-ink-400 focus:outline-none focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-400/20 focus:border-brand-400 focus:ring-4 focus:ring-brand-400/20";
```

`Field` label classes → `"text-sm font-medium text-ink-700"` (drop uppercase).
`Checkbox` classes → `"h-5 w-5 rounded-md border-ink-300 text-brand-500 focus:ring-brand-400/30"`.

- [ ] **Step 8: Restyle `src/components/ui/accordion.tsx` + `src/components/ui/data-table.tsx`**

Accordion — only the trigger base classes change (keep `"use client"`, logic, chevron):

```tsx
          "flex w-full items-center justify-between gap-2 text-left font-display text-sm font-semibold tracking-tight",
```

and the ChevronDown gains `text-brand-500`:

```tsx
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-brand-500 transition-transform duration-300", isOpen && "rotate-180")}
          aria-hidden="true"
        />
```

DataTable — wrapper and header row:

```tsx
    <div className={cn("overflow-x-auto rounded-3xl border border-ink-200/70 bg-white", className)}>
```

```tsx
          <tr className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
```

body divider `divide-line` → `divide-ink-200/70`; row hover `hover:bg-surface-low` → `hover:bg-ink-50`.

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run build`
Expected: exit 0. (If typecheck fails on `underline`, a call site was missed — fix per Step 6.)

Run: `grep -rn "underline={" src; grep -rn "underline$" src/components/ui/section-heading.tsx`
Expected: no `<SectionHeading>` underline props remain.

- [ ] **Step 10: Commit**

```bash
git add src/components/ui src/features src/components
git commit -m "feat: restyle UI primitives to amber + ink pill/rounded language"
```

---

### Task 3: Floating pill navbar (header, nav, TopBar removal)

**Files:**
- Modify: `src/components/layout/site-header.tsx` (full rewrite, becomes client)
- Modify: `src/components/navigation/desktop-nav.tsx` (full rewrite)
- Modify: `src/components/navigation/mobile-nav.tsx` (full rewrite)
- Delete: `src/components/layout/top-bar.tsx`
- Modify: `src/components/layout/public-shell.tsx`

**Interfaces:**
- Consumes: `Button` (Task 2), `NavLink` (unchanged), `NAV_ITEMS`/`SITE` from `@/constants/site`.
- Produces: header is now `fixed` (out of flow). **Every page's first section must supply `pt-32`-class top padding — Tasks 5–10 handle that via heroes.** `NavLink` component is NOT modified.

- [ ] **Step 1: Rewrite `src/components/layout/site-header.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SITE } from "@/constants/site";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { DesktopNav } from "@/components/navigation/desktop-nav";
import { MobileNav } from "@/components/navigation/mobile-nav";

/** Fixed floating pill header: seal + wordmark, pill nav, contact CTA. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 py-4 md:py-5">
      <Container>
        <div
          className={cn(
            "flex items-center justify-between rounded-full border px-3 py-2 transition-all duration-300 sm:px-5",
            scrolled
              ? "border-ink-200/70 bg-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md"
              : "border-transparent bg-white/40 backdrop-blur-md",
          )}
        >
          <Link href="/" className="flex items-center gap-2.5" aria-label={SITE.name}>
            <Image
              src={SITE.sealImage}
              alt={`${SITE.name} seal`}
              width={36}
              height={36}
              className="size-9 rounded-full border border-brand-400 object-cover"
            />
            <span className="text-base font-semibold tracking-tight text-ink-900">
              {SITE.name}
            </span>
          </Link>
          <DesktopNav />
          <div className="flex items-center gap-2">
            <Button href="/contact" variant="accent" size="sm" className="hidden lg:inline-flex">
              Contact Us <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <MobileNav />
          </div>
        </div>
      </Container>
    </header>
  );
}
```

- [ ] **Step 2: Rewrite `src/components/navigation/desktop-nav.tsx`**

```tsx
import { NAV_ITEMS } from "@/constants/site";
import { NavLink } from "@/components/navigation/nav-link";

/** Pill-style primary navigation shown on large screens. */
export function DesktopNav() {
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          className="rounded-full px-4 py-2 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900"
          activeClassName="bg-ink-900/[0.06] text-ink-900"
        />
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Rewrite `src/components/navigation/mobile-nav.tsx`**

```tsx
"use client";

import { Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/constants/site";
import { NavLink } from "@/components/navigation/nav-link";
import { useDisclosure } from "@/hooks/use-disclosure";

/** Round glassy burger toggle and floating card menu for small screens. */
export function MobileNav() {
  const { isOpen, toggle, close } = useDisclosure();

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        className="inline-flex size-10 items-center justify-center rounded-full border border-ink-200/80 bg-white/80 text-ink-900 backdrop-blur"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {isOpen ? (
        <nav
          id="mobile-menu"
          aria-label="Primary"
          className="fixed inset-x-4 top-20 rounded-3xl border border-ink-200/70 bg-white/95 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)] backdrop-blur-xl"
        >
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  onNavigate={close}
                  className="block rounded-full px-4 py-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
                  activeClassName="bg-ink-900/[0.06] text-ink-900"
                />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Delete TopBar and update the shell**

Delete `src/components/layout/top-bar.tsx`. Rewrite `src/components/layout/public-shell.tsx`:

```tsx
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/** Public-site chrome: floating header, content area, and footer. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-grow">{children}</main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: exit 0.
Run: `grep -rn "top-bar\|TopBar" src`
Expected: no matches.
Note: pages will sit under the fixed header until their heroes gain top padding (Tasks 5–9). That interim overlap is expected.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/layout src/components/navigation
git commit -m "feat: floating glassy pill navbar; remove TopBar"
```

---

### Task 4: Dark footer with newsletter panel

**Files:**
- Modify: `src/features/announcements/components/newsletter-form.tsx` (add `variant` prop)
- Modify: `src/components/layout/site-footer.tsx` (full rewrite)

**Interfaces:**
- Consumes: `SITE`, `NAV_ITEMS`, `GOVERNMENT_LINKS`, `LEGAL_LINKS`, `SOCIAL_LINKS`, `EMERGENCY_HOTLINES` from `@/constants/site`; `Badge`, `Button`; `toTelHref` from `@/lib/format`.
- Produces: `NewsletterForm` gains prop `variant?: "card" | "inline"` (default `"card"` keeps the sidebar behavior; `"inline"` renders only the input + submit row for the footer panel).

- [ ] **Step 1: Add `variant` prop to `NewsletterForm`**

Rewrite `src/features/announcements/components/newsletter-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NewsletterFormProps {
  /** "card" = self-contained dark card (news sidebar); "inline" = bare form row (footer panel). */
  variant?: "card" | "inline";
}

/** SMS/email alert signup widget (client-side confirmation only). */
export function NewsletterForm({ variant = "card" }: NewsletterFormProps) {
  const [subscribed, setSubscribed] = useState(false);

  const form = subscribed ? (
    <p className="flex items-center gap-2 rounded-2xl bg-white/10 p-3 text-sm font-semibold text-white">
      <CheckCircle2 className="h-5 w-5 text-brand-400" aria-hidden="true" />
      You&apos;re subscribed. Salamat po!
    </p>
  ) : (
    <form
      className={cn(variant === "card" ? "space-y-4" : "flex flex-col gap-3 sm:flex-row")}
      onSubmit={(event) => {
        event.preventDefault();
        setSubscribed(true);
      }}
    >
      <label htmlFor={`newsletter-mobile-${variant}`} className="sr-only">
        Mobile number
      </label>
      <input
        id={`newsletter-mobile-${variant}`}
        type="tel"
        required
        placeholder="Mobile Number"
        className="h-12 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-white outline-none transition-colors placeholder:text-ink-400 focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-400/20"
      />
      <Button type="submit" variant="primary" className={cn(variant === "card" && "w-full")}>
        Join Channel
      </Button>
    </form>
  );

  if (variant === "inline") {
    return form;
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900 p-6 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand-500/30 blur-3xl"
      />
      <div className="relative">
        <h3 className="mb-4 font-display text-xl font-semibold tracking-tight">Stay Notified</h3>
        <p className="mb-6 text-sm text-ink-300">
          Receive weekly news summaries and urgent alerts directly to your phone via SMS or Email.
        </p>
        {form}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `src/components/layout/site-footer.tsx`**

```tsx
import Image from "next/image";
import Link from "next/link";
import {
  BellRing,
  ChevronRight,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Siren,
} from "lucide-react";
import {
  EMERGENCY_HOTLINES,
  GOVERNMENT_LINKS,
  LEGAL_LINKS,
  NAV_ITEMS,
  SITE,
  SOCIAL_LINKS,
} from "@/constants/site";
import { toTelHref } from "@/lib/format";
import { Container } from "@/components/ui/container";
import { NewsletterForm } from "@/features/announcements";

function FooterHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-6 text-xs font-semibold uppercase tracking-wider text-brand-300">
      {children}
    </h3>
  );
}

/** Dark site-wide footer: newsletter panel, link columns, contact + hotline, legal. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  const hotline = EMERGENCY_HOTLINES[0];

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-ink-950 text-ink-100">
      <div
        aria-hidden="true"
        className="bg-radial-fade pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60"
      />
      <Container className="relative pt-16 md:pt-20">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-ink-900 via-ink-900 to-ink-800 p-8 sm:p-10 md:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
          />
          <div className="relative grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-10">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-300">
                <BellRing className="size-3.5" aria-hidden="true" />
                Stay Notified
              </span>
              <h3 className="mt-4 font-display text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">
                Receive weekly news summaries and urgent alerts.
              </h3>
              <p className="mt-3 text-sm text-ink-300 sm:text-base">
                Directly to your phone via SMS or Email. No spam, unsubscribe anytime.
              </p>
            </div>
            <div className="lg:col-span-5">
              <NewsletterForm variant="inline" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-12 py-14 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <Image
                src={SITE.sealImage}
                alt={`${SITE.name} seal`}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full border border-brand-400 object-cover"
              />
              <div>
                <p className="font-display text-lg font-semibold leading-tight tracking-tight text-white">
                  {SITE.name}
                </p>
                <p className="text-xs text-ink-400">{SITE.locality}</p>
              </div>
            </div>
            <p className="mb-6 text-sm leading-relaxed text-ink-300">
              We are committed to transparency, accountability, and excellent public service for
              every resident.
            </p>
            <div className="flex gap-3">
              {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="rounded-full border border-white/10 bg-white/5 p-2.5 text-ink-200 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          <nav aria-label="Quick links">
            <FooterHeading>Quick Links</FooterHeading>
            <ul className="space-y-3 text-sm text-ink-300">
              {NAV_ITEMS.filter((item) => item.href !== "/").map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <ChevronRight className="h-3 w-3 text-brand-400" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Government links">
            <FooterHeading>Government Links</FooterHeading>
            <ul className="space-y-3 text-sm text-ink-300">
              {GOVERNMENT_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <ExternalLink className="h-3 w-3 text-brand-400" aria-hidden="true" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <FooterHeading>Contact Us</FooterHeading>
            <ul className="space-y-4 text-sm text-ink-300">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                <span>
                  {SITE.addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                {SITE.phone}
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                {SITE.email}
              </li>
              <li className="flex items-center gap-3">
                <Clock className="h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                {SITE.officeHours}
              </li>
              <li className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <Siren className="h-5 w-5 shrink-0 text-danger-bright" aria-hidden="true" />
                <span>
                  <span className="block text-xs uppercase tracking-wider text-ink-400">
                    {hotline.label}
                  </span>
                  <a
                    href={toTelHref(hotline.number)}
                    className="font-semibold text-white hover:text-brand-300"
                  >
                    {hotline.number}
                  </a>
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-8 text-sm text-ink-400 md:flex-row">
          <p>
            © {year} {SITE.name}, {SITE.locality}. All Rights Reserved. {SITE.republic}.
          </p>
          <div className="flex gap-4">
            {LEGAL_LINKS.map((link, index) => (
              <span key={link.label} className="flex items-center gap-4">
                {index > 0 ? <span aria-hidden="true">|</span> : null}
                <Link href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              </span>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
```

Note: if `NewsletterForm` is not exported from `src/features/announcements/index.ts`, add `export { NewsletterForm } from "./components/newsletter-form";` there.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: exit 0.
Run: `grep -rn "blue-" src/components/layout`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/site-footer.tsx src/features/announcements
git commit -m "feat: dark ink footer with newsletter panel and relocated hotline/hours"
```

---

### Task 5: Heroes, CtaBanner, EmergencyHotlinesCard

**Files:**
- Modify: `src/features/home/components/home-hero.tsx` (full rewrite)
- Modify: `src/components/sections/page-hero.tsx` (full rewrite)
- Modify: `src/components/sections/cta-banner.tsx` (full rewrite)
- Modify: `src/components/shared/emergency-hotlines-card.tsx` (full rewrite)

**Interfaces:**
- Consumes: Tasks 1–2 tokens/primitives; `HERO_IMAGE` from `@/features/home/data`.
- Produces: `PageHero` — same props (`title, description?, eyebrow?, align?, children?`) but now a **light** hero with `pt-32 md:pt-44` (clears the fixed header). `CtaBanner` — same props, now a contained dark `rounded-[2rem]` panel. `EmergencyHotlinesCard` — same props, now a dark glassy card. All CTA children previously styled for dark heroes (variant `white`/`outline-white` inside `PageHero` children) must flip to `primary`/`outline` — done in sweeps (Tasks 6–9).

- [ ] **Step 1: Rewrite `src/components/shared/emergency-hotlines-card.tsx`**

```tsx
import { Siren } from "lucide-react";
import { EMERGENCY_HOTLINES } from "@/constants/site";
import { toTelHref } from "@/lib/format";
import { IconCircle } from "@/components/ui/icon-circle";
import type { Hotline } from "@/types";

interface EmergencyHotlinesCardProps {
  hotlines?: Hotline[];
}

/** Dark glassy emergency hotline directory; used on the home hero and side rails. */
export function EmergencyHotlinesCard({ hotlines = EMERGENCY_HOTLINES }: EmergencyHotlinesCardProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-ink-900 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-6 py-4">
        <Siren className="h-5 w-5 text-danger-bright" aria-hidden="true" />
        <h3 className="font-display text-lg font-semibold tracking-tight">Emergency Hotlines</h3>
      </div>
      <ul className="space-y-5 p-6">
        {hotlines.map((hotline) => (
          <li key={hotline.label} className="flex items-start gap-4">
            <IconCircle icon={hotline.icon} tone="inverse" size="sm" />
            <div>
              <p className="text-sm text-ink-300">{hotline.label}</p>
              <a
                href={toTelHref(hotline.number)}
                className="font-semibold text-white transition-colors hover:text-brand-300"
              >
                {hotline.number}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `src/features/home/components/home-hero.tsx`**

```tsx
import Image from "next/image";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { SITE } from "@/constants/site";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmergencyHotlinesCard } from "@/components/shared/emergency-hotlines-card";
import { HERO_IMAGE } from "@/features/home/data";

/** Light hero with gradient headline, dual CTAs, and the emergency hotline rail. */
export function HomeHero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-32 md:pb-24 md:pt-44">
      <div
        aria-hidden="true"
        className="grid-bg pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="bg-radial-fade pointer-events-none absolute -top-32 left-1/2 -z-10 h-[600px] w-[1100px] -translate-x-1/2 rounded-full blur-2xl"
      />
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <Badge variant="soft" className="mb-5">
              <Sparkles className="size-3.5 text-brand-500" aria-hidden="true" />
              Welcome To
            </Badge>
            <h1 className="text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl md:text-6xl">
              Barangay{" "}
              <span className="relative whitespace-nowrap">
                <span className="text-gradient-brand">San Fernando</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 300 14"
                  className="absolute -bottom-2 left-0 h-2 w-full text-brand-400"
                  fill="none"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 11C57 4 130 4 187 9C229 12 269 11 298 6"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="mt-6 text-lg font-medium text-ink-700 md:text-xl">{SITE.tagline}</p>
            <p className="mt-3 max-w-2xl text-balance text-base leading-relaxed text-ink-600 md:text-lg">
              {SITE.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/about" size="lg">
                About Our Barangay <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button href="/contact" variant="outline" size="lg">
                Contact Us
              </Button>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="overflow-hidden rounded-[2rem] border border-ink-200/70 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.3)]">
              <Image
                src={HERO_IMAGE}
                alt={`${SITE.name} community`}
                width={640}
                height={420}
                className="h-52 w-full object-cover sm:h-64"
                priority
              />
            </div>
            <div className="relative z-10 -mt-12 px-4 sm:px-6">
              <EmergencyHotlinesCard />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 3: Rewrite `src/components/sections/page-hero.tsx`**

```tsx
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";

interface PageHeroProps {
  title: string;
  description?: string;
  eyebrow?: string;
  align?: "left" | "center";
  children?: React.ReactNode;
}

/**
 * Light page banner used by every inner page.
 * Renders a blueprint-grid texture, optional eyebrow pill, and optional actions.
 * Provides the top padding that clears the fixed floating header.
 */
export function PageHero({ title, description, eyebrow, align = "left", children }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden pb-14 pt-32 md:pb-20 md:pt-44">
      <div
        aria-hidden="true"
        className="grid-bg pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="bg-radial-fade pointer-events-none absolute -top-32 left-1/2 -z-10 h-[480px] w-[900px] -translate-x-1/2 rounded-full blur-2xl"
      />
      <Container className={cn("relative", align === "center" && "text-center")}>
        <div className={cn("max-w-3xl", align === "center" && "mx-auto")}>
          {eyebrow ? (
            <Badge variant="soft" className="mb-5">
              {eyebrow}
            </Badge>
          ) : null}
          <h1 className="text-balance font-display text-4xl font-semibold leading-[1.1] tracking-tight text-ink-900 md:text-5xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-5 text-lg leading-relaxed text-ink-600 md:text-xl">{description}</p>
          ) : null}
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 4: Rewrite `src/components/sections/cta-banner.tsx`**

```tsx
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";

interface CtaBannerProps {
  title: React.ReactNode;
  description: string;
  actions: React.ReactNode;
  /** Extra content rendered beside the copy (e.g. an icon grid). */
  aside?: React.ReactNode;
  /** Optional photo rendered behind a dark ink overlay. */
  backgroundImage?: string;
  className?: string;
}

/** Contained dark call-to-action panel with amber glow, title, copy, and actions. */
export function CtaBanner({
  title,
  description,
  actions,
  aside,
  backgroundImage,
  className,
}: CtaBannerProps) {
  return (
    <section className={cn("py-12 md:py-16", className)}>
      <Container>
        <div
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-ink-900 via-ink-900 to-ink-800 bg-cover bg-center px-6 py-12 text-white sm:px-10 md:px-14 md:py-16"
          style={
            backgroundImage
              ? {
                  backgroundImage: `linear-gradient(rgba(13, 13, 16, 0.88), rgba(13, 13, 16, 0.88)), url(${backgroundImage})`,
                }
              : undefined
          }
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
          />
          <div
            className={cn(
              "relative flex flex-col items-center gap-8 text-center",
              aside ? "md:flex-row md:justify-between md:text-left" : "md:text-center",
            )}
          >
            <div className={cn(aside && "md:w-1/2")}>
              <h2 className="mb-4 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
                {title}
              </h2>
              <p className={cn("mb-8 text-lg text-ink-300", aside ? "max-w-lg" : "mx-auto max-w-2xl")}>
                {description}
              </p>
              <div
                className={cn(
                  "flex flex-col justify-center gap-4 sm:flex-row",
                  aside && "md:justify-start",
                )}
              >
                {actions}
              </div>
            </div>
            {aside ? <div className="md:w-1/2">{aside}</div> : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: exit 0.
Run: `npm run dev` (background) and load `/` — hero clears the fixed navbar, gradient headline renders, hotlines card is dark. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/features/home/components/home-hero.tsx src/components/sections src/components/shared/emergency-hotlines-card.tsx
git commit -m "feat: light grid-bg heroes, dark CTA panels, dark hotlines card"
```

---

### Task 6: Sweep — home feature + shared components

**Files (Modify, applying the Global Class Mapping + shape/type rules to each):**
- `src/features/home/components/quick-services-section.tsx`
- `src/features/home/components/community-pulse-section.tsx`
- `src/features/home/components/get-involved-section.tsx`
- `src/components/shared/announcement-card.tsx`
- `src/components/shared/event-card.tsx`
- `src/components/shared/stat-card.tsx`
- `src/components/shared/document-link.tsx`
- `src/components/shared/divider-heading.tsx`

**Interfaces:**
- Consumes: Tasks 1–5 primitives (`Button` variants `primary|accent|outline|white|outline-white|outline-danger|ghost`; `SectionHeading` with `eyebrow`; `Badge` pill; dark-panel accent snippet from Global Constraints).
- Produces: no API changes — props of every component stay identical.

- [ ] **Step 1: Apply the Global Class Mapping to all eight files**

Open each file, apply the color table, shape rules, and type rules mechanically. Specific required outcomes:

- `stat-card.tsx`: the stat value becomes `font-display text-4xl font-semibold tracking-tight text-ink-900`; the label `text-xs font-semibold uppercase tracking-wider text-ink-500`.
- `get-involved-section.tsx` (dark band, if it uses `bg-primary`/`bg-primary-strong`): keep it a dark section but add the dark-panel accent snippet and `relative overflow-hidden`; buttons inside switch to `variant="primary"` (amber) + `variant="outline-white"`.
- `quick-services-section.tsx`: service tiles become `rounded-3xl` cards with `IconCircle tone="primary"` (amber); hover ring `hover:border-brand-300`.
- Any `<SectionHeading>` in these sections gains an `eyebrow` string matching its existing context — reuse the section's existing eyebrow/badge text if one exists; otherwise do NOT invent copy (leave eyebrow off).

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build`
Expected: exit 0.
Run: `grep -rnE "(text|bg|border|ring|divide)-(primary|secondary|accent|surface|line)\b|text-ink\b|text-ink-muted|text-outline|blue-[0-9]|yellow-[0-9]" src/features/home src/components/shared --include='*.tsx'`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/features/home src/components/shared
git commit -m "feat: re-skin home sections and shared cards to amber + ink"
```

---

### Task 7: Sweep — about + officials features

**Files (Modify, same mapping/rules):**
- `src/features/about/components/mission-vision-section.tsx`
- `src/features/about/components/captain-message-section.tsx`
- `src/features/about/components/history-section.tsx`
- `src/features/about/components/milestones-section.tsx`
- `src/features/about/components/join-community-section.tsx`
- `src/features/officials/components/leadership-directory.tsx`
- `src/features/officials/components/action-center-banner.tsx`
- `src/components/shared/official-card.tsx`
- Check: `src/app/(public)/about/page.tsx`, `src/app/(public)/officials/page.tsx` (PageHero children CTAs)

**Interfaces:**
- Consumes: Tasks 1–5. `PageHero` is now light: any `Button variant="white"` or `"outline-white"` rendered inside `PageHero` children in these pages/sections must become `variant="primary"` / `variant="outline"`.
- Produces: no API changes.

- [ ] **Step 1: Apply the Global Class Mapping to all files listed**

Specific required outcomes:

- `official-card.tsx`: portrait card → `rounded-3xl` with `rounded-2xl` inner photo; name `font-display font-semibold tracking-tight text-ink-900`; role label `text-xs font-semibold uppercase tracking-wider text-brand-700`; contact icons `text-ink-400 hover:text-brand-600`.
- `captain-message-section.tsx`: portrait framed `rounded-[2rem] border border-ink-200/70` with soft shadow; pull-quote text `text-ink-700`.
- `history-section.tsx` timeline: markers `border-brand-400 bg-brand-100`, connecting line `bg-ink-200`.
- `action-center-banner.tsx` / `join-community-section.tsx` (dark bands): dark-panel accent snippet + `relative overflow-hidden`; primary action = amber `variant="primary"`, secondary = `variant="outline-white"`.
- In the two page files: fix any on-dark button variants inside `<PageHero>` children per Interfaces above.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build`
Expected: exit 0.
Run: `grep -rnE "(text|bg|border|ring|divide)-(primary|secondary|accent|surface|line)\b|text-ink\b|text-ink-muted|text-outline|blue-[0-9]|yellow-[0-9]" src/features/about src/features/officials "src/app/(public)/about" "src/app/(public)/officials" --include='*.tsx'`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/features/about src/features/officials src/components/shared/official-card.tsx "src/app/(public)/about" "src/app/(public)/officials"
git commit -m "feat: re-skin about and officials pages to amber + ink"
```

---

### Task 8: Sweep — services + announcements features

**Files (Modify, same mapping/rules):**
- `src/features/services/components/service-card.tsx`
- `src/features/services/components/services-grid.tsx`
- `src/features/services/components/help-section.tsx`
- `src/features/announcements/components/news-card.tsx`
- `src/features/announcements/components/news-feed.tsx`
- `src/features/announcements/components/news-sidebar.tsx`
- Check: `src/app/(public)/services/page.tsx`, `src/app/(public)/announcements/page.tsx` (PageHero children CTAs)

**Interfaces:**
- Consumes: Tasks 1–5; `NewsletterForm` default (`variant="card"`) already restyled in Task 4 — the sidebar usage needs no prop change.
- Produces: no API changes.

- [ ] **Step 1: Apply the Global Class Mapping to all files listed**

Specific required outcomes:

- `service-card.tsx`: card `rounded-3xl`; `tone: "danger"` services keep red accents (danger tokens); requirements accordion panel list markers `text-brand-500`; "Apply Online" style CTAs use `variant="primary"` (or `outline-danger` where the card is the danger tone and already uses it).
- `help-section.tsx` (emergency assistance block): dark or danger panel → contained `rounded-[2rem]` panel; if dark, add the accent-orb snippet; red iconography keeps `text-danger-bright` on dark / `text-danger` on light.
- `news-card.tsx`: image corners `rounded-2xl`; category/date chips use `Badge` variants (`soft`/`neutral`/`urgent`) — do not restyle chips ad hoc.
- `news-feed.tsx`: "LOAD MORE NEWS" button keeps its text but uses `variant="outline"` `size="lg"`.
- `news-sidebar.tsx`: sidebar cards `rounded-3xl`; sidebar hotlines reuse `EmergencyHotlinesCard` styling as-is (it's already dark from Task 5 — no local overrides).

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build`
Expected: exit 0.
Run: `grep -rnE "(text|bg|border|ring|divide)-(primary|secondary|accent|surface|line)\b|text-ink\b|text-ink-muted|text-outline|blue-[0-9]|yellow-[0-9]" src/features/services src/features/announcements "src/app/(public)/services" "src/app/(public)/announcements" --include='*.tsx'`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/features/services src/features/announcements "src/app/(public)/services" "src/app/(public)/announcements"
git commit -m "feat: re-skin services and announcements pages to amber + ink"
```

---

### Task 9: Sweep — transparency + contact features, not-found

**Files (Modify, same mapping/rules):**
- `src/features/transparency/components/transparency-hero.tsx`
- `src/features/transparency/components/disclosure-grid.tsx`
- `src/features/transparency/components/latest-uploads-section.tsx`
- `src/features/transparency/components/foi-section.tsx`
- `src/features/contact/components/contact-details.tsx`
- `src/features/contact/components/inquiry-form.tsx`
- `src/features/contact/components/map-section.tsx`
- `src/app/not-found.tsx`
- Check: `src/app/(public)/transparency/page.tsx`, `src/app/(public)/contact/page.tsx`

**Interfaces:**
- Consumes: Tasks 1–5. `transparency-hero.tsx` is a page-level hero: if it does not use `PageHero`, it must itself provide `pt-32 md:pt-44` top padding (fixed header) and adopt the light grid-bg treatment copied from `page-hero.tsx`.
- Produces: no API changes.

- [ ] **Step 1: Apply the Global Class Mapping to all files listed**

Specific required outcomes:

- `transparency-hero.tsx`: light hero — grid-bg + radial-fade backdrops exactly as in `page-hero.tsx` Step 3 of Task 5, `pt-32 md:pt-44`; search/stat chips become pill badges.
- `disclosure-grid.tsx`: document table is `DataTable` (already restyled); ordinance search input uses the Task 2 `Input`; search submit `variant="accent"`.
- `foi-section.tsx` (dark band): contained `rounded-[2rem]` dark panel + accent orb; CTAs `variant="primary"` + `variant="outline-white"`.
- `inquiry-form.tsx`: uses `Field/Input/Select/Textarea/Checkbox` (already restyled) — only surrounding card/section classes need the mapping; submit button `variant="primary" size="lg"`; success state `rounded-2xl bg-brand-100 text-brand-800`.
- `map-section.tsx`: map image framed `rounded-[2rem] border border-ink-200/70` with soft shadow; "Get Directions" `variant="accent"`.
- `not-found.tsx`: apply mapping; if it lacks a hero, give its outer wrapper `pt-32` so content clears the fixed header; primary action `variant="primary"`.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build`
Expected: exit 0.
Run: `grep -rnE "(text|bg|border|ring|divide)-(primary|secondary|accent|surface|line)\b|text-ink\b|text-ink-muted|text-outline|blue-[0-9]|yellow-[0-9]" src/features/transparency src/features/contact src/app/not-found.tsx --include='*.tsx'`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/features/transparency src/features/contact src/app/not-found.tsx "src/app/(public)/transparency" "src/app/(public)/contact"
git commit -m "feat: re-skin transparency, contact, and not-found to amber + ink"
```

---

### Task 10: Sweep — admin shell

**Files (Modify, same mapping/rules):**
- `src/app/admin/layout.tsx`
- `src/features/admin/components/admin-sidebar.tsx`
- `src/features/admin/components/admin-topbar.tsx`
- `src/features/admin/components/admin-mobile-nav.tsx`
- `src/features/admin/components/admin-page-header.tsx`
- `src/features/admin/components/content-hub.tsx`
- `src/features/admin/components/content-type-card.tsx`
- `src/features/admin/components/recent-drafts.tsx`
- `src/features/admin/components/publishing-activity.tsx`
- `src/features/admin/components/admin-placeholder.tsx`

**Interfaces:**
- Consumes: Tasks 1–2 (admin does not use the public chrome, so header/footer tasks don't apply).
- Produces: no API changes; admin keeps its own sidebar + app bar layout (NOT converted to a floating pill — it's an app shell, not a marketing page).

- [ ] **Step 1: Apply the Global Class Mapping to all ten files**

Specific required outcomes:

- Sidebar: `bg-ink-950 text-ink-300`; active nav item `rounded-full bg-white/10 text-white` with a `text-brand-400` icon; hover `hover:bg-white/5 hover:text-white`.
- Topbar: white with `border-b border-ink-200/70`; avatar ring `ring-brand-400`.
- `content-type-card.tsx`: `rounded-3xl` interactive cards, `IconCircle tone="primary"`.
- `recent-drafts.tsx` / `publishing-activity.tsx`: status chips use `Badge` variants (`soft` for draft, `neutral` for in-review — keep existing label text).
- `admin-placeholder.tsx`: `rounded-3xl border border-dashed border-ink-300 bg-ink-50 text-ink-500`.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build`
Expected: exit 0.
Run: `grep -rnE "(text|bg|border|ring|divide)-(primary|secondary|accent|surface|line)\b|text-ink\b|text-ink-muted|text-outline|blue-[0-9]|yellow-[0-9]" src/features/admin src/app/admin --include='*.tsx'`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin src/app/admin
git commit -m "feat: re-skin admin shell to amber + ink"
```

---

### Task 11: Remove transitional aliases + final verification

**Files:**
- Modify: `src/app/globals.css` (delete the TRANSITIONAL ALIASES block)

**Interfaces:**
- Consumes: Tasks 6–10 must be complete (no component references the alias tokens).
- Produces: final token surface = `brand-*`, `ink-50..950`, `danger*` only.

- [ ] **Step 1: Prove aliases are unused**

Run: `grep -rnE "[\"'\`: ](text|bg|border|ring|divide|outline|from|to|via|placeholder|fill|stroke)-(primary|secondary|accent|surface|line|outline)(-[a-z]+)?[\"'/ ]" src --include='*.tsx'`
Expected: no matches. If any appear, fix them per the Global Class Mapping before proceeding.

Run: `grep -rnE "text-ink[\"' ]|text-ink-muted|blue-[0-9]|yellow-[0-9]" src --include='*.tsx'`
Expected: no matches.

- [ ] **Step 2: Delete the alias block from `src/app/globals.css`**

Remove the entire section from the `/* TRANSITIONAL ALIASES ... */` comment through `--color-ink-muted: #5b5b67;` (15 custom properties). Keep `danger*` tokens — they are permanent.

- [ ] **Step 3: Full verification**

Run: `npm run typecheck && npm run build`
Expected: exit 0; all routes `○ (Static)`.

Run: `npm run dev` in the background and visually check every route: `/`, `/about`, `/officials`, `/services`, `/announcements`, `/transparency`, `/contact`, a bogus URL (not-found), `/admin`, `/admin/services`, `/admin/events`, `/admin/news`, `/admin/settings`. Confirm: navbar floats and gains a border on scroll; mobile menu opens as a floating card; footer newsletter form shows the subscribed state on submit; no visual remnants of blue anywhere. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "chore: remove transitional legacy color aliases"
```
