# UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the presentational UI/UX overhaul specified in `docs/superpowers/specs/2026-07-23-uiux-overhaul-design.md` — demo-credibility polish across the public site and admin CMS with zero behavior change.

**Architecture:** Phase 0 upgrades the shared design-language layer (tokens, `SectionHeading`, `Section`, new `BrandStroke` + `Reveal` components, elevation migration); later phases apply it page-by-page along the demo walkthrough (home → public inner pages → forms → admin). All diffs live in JSX structure, class names, and `globals.css`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4 (`@theme` tokens in `src/app/globals.css`), existing Vitest + Playwright suites as the behavioral contract.

## Global Constraints

Copied from the spec — every task implicitly includes these:

- **No behavior change.** Never touch Server Actions, query functions, Zod schemas, hook logic, handlers, routing, or data shapes.
- **Tests are the contract.** `npm run typecheck`, `npm run lint`, `npm run test:unit` green after every task; Playwright (`npm run test:e2e`) green at every phase boundary, **tests unmodified**. If a visual change breaks a test, the change is wrong, not the test.
- **Color token additions capped at exactly three:** `--color-brand-50: #fffbeb`, `--color-success: #15803d`, `--color-success-soft: #dcfce7`. No other new colors; no blue anywhere.
- **No new dependencies.** Motion is CSS + one small IntersectionObserver component.
- **Interface text changes only where a task explicitly says so** (admin empty states). Everything else verbatim — Playwright selectors depend on it.
- **Reduced motion**: every animation covered by the single `prefers-reduced-motion` block added in Task 1.
- **Contrast floor:** amber-on-white text is only ever `brand-600`+; status dots always pair with a text label.
- **Verification model (overrides the default TDD step shape):** this codebase deliberately has no component tests (CLAUDE.md). Presentational tasks verify by: typecheck + lint + unit suite, targeted Playwright at phase boundaries, and **visual verification** — drive the dev server per `.claude/skills/verify/SKILL.md` and screenshot affected pages at 1440 / 1024 / 768 / 390 widths. "Visual check" steps below mean exactly that.
- The dev server is often already running on :3000 — check before starting another.
- **Branch:** create `feature/uiux-overhaul` off the current branch before Task 1 (per superpowers:using-git-worktrees if isolating).
- Never `git add -A` (untracked `proposal/` and `stitch_tabbed_content_manager/` must stay untracked). Stage files by name.

---

## Phase 0 — Design-language foundation

### Task 1: Tokens and motion foundation in `globals.css`

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces (used by all later tasks): color utilities `bg-brand-50`, `bg-success-soft`, `text-success`; shadow utilities `shadow-raised`, `shadow-floating`, `shadow-brand-glow`, `shadow-brand-glow-lg`; easing utility `ease-out-soft`; CSS vars `--duration-quick`, `--duration-reveal` (consumed via `duration-(--duration-quick)` / `duration-(--duration-reveal)`); classes `reveal-pending`, `reveal-in`, `hero-seq`, `hero-seq-1`…`hero-seq-4`; keyframes `stroke-draw`.

- [ ] **Step 1: Add tokens to the `@theme` block**

Inside the existing `@theme` block in `src/app/globals.css`, add after the brand colors:

```css
  --color-brand-50: #fffbeb;

  /* Semantic success — StatusChip's "there is no green token" comment retires */
  --color-success: #15803d;
  --color-success-soft: #dcfce7;
```

After `--shadow-ambient`, add:

```css
  --shadow-raised: 0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.08);
  --shadow-floating: 0 24px 60px -20px rgb(0 0 0 / 0.18);
  --shadow-brand-glow: 0 8px 24px rgb(245 158 11 / 0.35);
  --shadow-brand-glow-lg: 0 14px 38px rgb(245 158 11 / 0.5);
  --ease-out-soft: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-quick: 150ms;
  --duration-reveal: 600ms;
```

(`--ease-*` is a real Tailwind v4 theme namespace, so `ease-out-soft` becomes a utility. The durations are plain vars consumed with the `duration-(--duration-quick)` arbitrary-var syntax. If in doubt, confirm namespaces against the Tailwind v4 docs via context7 — do not invent new namespaces.)

- [ ] **Step 2: Add the reveal + hero-sequence classes and the reduced-motion block**

Append to the end of `globals.css` (after the `@layer base` block):

```css
/*
 * Motion system (spec §5). Three patterns only:
 * 1. hero-seq — the home hero's one page-load orchestration (pure CSS delays)
 * 2. reveal-pending/reveal-in — scroll reveals, driven by <Reveal> (public only)
 * 3. micro-interactions — plain transitions using --duration-quick
 */
@layer components {
  .reveal-pending {
    opacity: 0;
    transform: translateY(1rem);
  }
  .reveal-in {
    opacity: 1;
    transform: translateY(0);
    transition:
      opacity var(--duration-reveal) var(--ease-out-soft),
      transform var(--duration-reveal) var(--ease-out-soft);
    transition-delay: var(--reveal-delay, 0ms);
  }

  .hero-seq {
    animation: fade-up 0.6s var(--ease-out-soft) both;
    animation-delay: var(--seq-delay, 0ms);
  }
  .hero-seq-1 { --seq-delay: 0ms; }
  .hero-seq-2 { --seq-delay: 120ms; }
  .hero-seq-3 { --seq-delay: 280ms; }
  .hero-seq-4 { --seq-delay: 420ms; }

  .stroke-draw {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: stroke-draw 0.6s var(--ease-out-soft) 550ms forwards;
  }
}

@keyframes stroke-draw {
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reveal-pending {
    opacity: 1;
    transform: none;
  }
  .reveal-in {
    transition: none;
  }
  .hero-seq {
    animation: none;
  }
  .stroke-draw {
    animation: none;
    stroke-dashoffset: 0;
  }
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass; build compiles the new CSS without warnings about unknown at-rules.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): elevation, success, and motion tokens for the overhaul"
```

---

### Task 2: `BrandStroke` — the signature mark, extracted

**Files:**
- Create: `src/components/ui/brand-stroke.tsx`
- Modify: `src/features/home/components/home-hero.tsx` (replace the inline SVG, lines 32–48)

**Interfaces:**
- Produces: `BrandStroke({ children, draw?, className? })` — wraps a word/phrase, renders the hand-drawn amber underline beneath it. `draw` adds the `stroke-draw` dash animation (home hero only). Used later by `PageHero` call sites (Task 8), the ticket success moment (Task 13), and the login card (Task 18).

- [ ] **Step 1: Create the component**

```tsx
// src/components/ui/brand-stroke.tsx
import { cn } from "@/lib/utils";

interface BrandStrokeProps {
  children: React.ReactNode;
  /** Animate the stroke drawing itself in (home hero only). */
  draw?: boolean;
  className?: string;
}

/**
 * The site's signature mark: a hand-drawn amber underline beneath one key
 * word. Used sparingly by design (spec §2) — home hero, PageHero keywords,
 * the ticket success moment, and the login card. Do not reach for it
 * elsewhere.
 */
export function BrandStroke({ children, draw = false, className }: BrandStrokeProps) {
  return (
    <span className={cn("relative whitespace-nowrap", className)}>
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 300 14"
        className="absolute -bottom-2 left-0 h-2 w-full text-brand-400"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M2 11C57 4 130 4 187 9C229 12 269 11 298 6"
          pathLength={1}
          className={cn(draw && "stroke-draw")}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
```

- [ ] **Step 2: Use it in the home hero**

In `home-hero.tsx`, replace the whole inline `<span className="relative whitespace-nowrap">…</span>` block (the one wrapping the gradient text + SVG) with:

```tsx
<BrandStroke draw>
  <span className="text-gradient-brand">San Fernando</span>
</BrandStroke>
```

and add the import: `import { BrandStroke } from "@/components/ui/brand-stroke";`

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Visual check: home page hero at 1440/390 — the underline renders identically to before, and (new) draws in ~0.55s after load. With reduced motion emulated, it is simply present.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/brand-stroke.tsx src/features/home/components/home-hero.tsx
git commit -m "feat(design): extract BrandStroke signature mark from the home hero"
```

---

### Task 3: `Reveal` — the scroll-reveal wrapper

**Files:**
- Create: `src/components/ui/reveal.tsx`

**Interfaces:**
- Produces: `Reveal({ children, delay?, className? })` — client component; wraps a public page section. Children render server-side untouched; the wrapper only toggles classes. `delay` (ms) staggers card grids. Consumed by Tasks 7 and 10–12.

- [ ] **Step 1: Create the component**

```tsx
// src/components/ui/reveal.tsx
"use client";

import { useEffect, useRef } from "react";

interface RevealProps {
  children: React.ReactNode;
  /** Stagger offset in ms, for card grids. */
  delay?: number;
  className?: string;
}

/**
 * Scroll-reveal wrapper (spec §5 pattern 2). Renders children visible in the
 * server HTML — no-JS users and crawlers never see hidden content. On mount,
 * anything still below the fold is set to `reveal-pending` (invisible because
 * it is off-screen anyway, so hiding after paint cannot flash) and observed;
 * on first intersection it gets `reveal-in` and the observer disconnects.
 * Content already in the viewport at load is left alone — no entrance
 * animation on the first screenful.
 *
 * Public pages only. The admin portal deliberately gets no scroll reveals.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.classList.add("reveal-pending");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        el.classList.add("reveal-in");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: pass. (The component is exercised visually from Task 7 on.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/reveal.tsx
git commit -m "feat(design): Reveal scroll-entrance wrapper for public sections"
```

---

### Task 4: Editorial eyebrow + section rhythm

**Files:**
- Create: `src/components/ui/eyebrow.tsx`
- Modify: `src/components/ui/section-heading.tsx` (replace the `Badge` eyebrow)
- Modify: `src/components/sections/page-hero.tsx` (same replacement; also widen `title` to `React.ReactNode` and step the type scale up)
- Modify: `src/components/ui/section.tsx` (add `spacing` prop)

**Interfaces:**
- Produces: `Eyebrow({ children, tone?, className? })` where `tone` is `"light" | "dark"` (dark for `ink-950` surfaces). `Section` gains `spacing?: "normal" | "spacious"` (default `"normal"` — current rhythm, so no page shifts until a page opts in). `PageHero`'s `title` becomes `React.ReactNode` (existing string call sites unaffected).

- [ ] **Step 1: Create `Eyebrow`**

```tsx
// src/components/ui/eyebrow.tsx
import { cn } from "@/lib/utils";

const tones = {
  light: "text-ink-500 before:bg-brand-500",
  dark: "text-ink-400 before:bg-brand-400",
} as const;

/**
 * Editorial section label (spec §2): a short amber rule + letterspaced
 * uppercase text. Replaces the pill Badge as the eyebrow treatment; Badge
 * remains for genuine statuses.
 */
export function Eyebrow({
  children,
  tone = "light",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em]",
        "before:h-px before:w-6 before:shrink-0 before:content-['']",
        tones[tone],
        className,
      )}
    >
      {children}
    </p>
  );
}
```

- [ ] **Step 2: Swap it into `SectionHeading`**

In `section-heading.tsx`: remove the `Badge` import; import `Eyebrow`; replace

```tsx
<Badge variant="soft" className="mb-4">
  {eyebrow}
</Badge>
```

with

```tsx
<Eyebrow className={cn("mb-4", align === "center" && "justify-center")}>{eyebrow}</Eyebrow>
```

- [ ] **Step 3: Upgrade `PageHero`**

In `page-hero.tsx`: change `title: string` to `title: React.ReactNode`; replace the `Badge` eyebrow the same way as Step 2 (`<Eyebrow className="mb-5">{eyebrow}</Eyebrow>`, with `justify-center` added when `align === "center"`); and step the heading scale up from `text-4xl … md:text-5xl` to:

```tsx
<h1 className="text-balance font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink-900 md:text-6xl">
```

(The home hero keeps its own larger scale; this lifts every inner page's opening moment.)

- [ ] **Step 4: Add `spacing` to `Section`**

In `section.tsx`:

```tsx
const spacings = {
  normal: "py-12 md:py-16",
  spacious: "py-16 md:py-24",
} as const;
```

Add `spacing?: keyof typeof spacings` to the props (default `"normal"`) and change the `<section>` class to `cn(spacings[spacing], tones[tone], className)`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Visual check: home + services + about at 1440/768/390 — every eyebrow now renders as rule-and-label (no pills except true statuses); inner-page H1s are larger; nothing overlaps at 390.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/eyebrow.tsx src/components/ui/section-heading.tsx src/components/sections/page-hero.tsx src/components/ui/section.tsx
git commit -m "feat(design): editorial eyebrow, larger page heroes, section spacing prop"
```

---

### Task 5: Elevation migration — shadows become tokens

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/toast.tsx`

**Interfaces:**
- Consumes: shadow utilities from Task 1. No API changes anywhere.

- [ ] **Step 1: Button**

In `button.tsx` `variants`:
- `primary`: `shadow-[0_8px_24px_rgba(245,158,11,0.35)]` → `shadow-brand-glow`; `hover:shadow-[0_14px_38px_rgba(245,158,11,0.5)]` → `hover:shadow-brand-glow-lg`
- `accent`: `shadow-[0_8px_24px_rgba(0,0,0,0.18)]` → `shadow-raised`; `hover:shadow-[0_12px_32px_rgba(0,0,0,0.24)]` → `hover:shadow-floating`
- `white`: `shadow-[0_8px_24px_rgba(0,0,0,0.12)]` → `shadow-raised`

Also in the shared class string: `transition-all duration-300` → `transition-all duration-(--duration-quick) ease-out-soft`.

- [ ] **Step 2: Card**

In `card.tsx`: base `shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]` → `shadow-raised`; interactive hover `hover:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.18)]` → `hover:shadow-floating`, and `transition-all duration-300` → `transition-all duration-(--duration-quick) ease-out-soft`.

- [ ] **Step 3: Toast**

In `toast.tsx`: `shadow-[0_16px_40px_-12px_rgba(0,0,0,0.4)]` → `shadow-floating`, and add the entrance by appending the existing `animate-fade-up` utility (from the `--animate-fade-up` token) to the toast's class list.

- [ ] **Step 4: Phase-0 boundary verification**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Run: `npm run test:e2e -- --project=public` (and `--project=admin` if `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` are set in `.env.local`)
Expected: all green, zero test edits.
Visual check: buttons/cards/toast look unchanged (the tokens replicate the old literals by design — Task 1 defined them from these exact values).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/card.tsx src/components/ui/toast.tsx
git commit -m "refactor(design): migrate ad-hoc shadows to elevation tokens"
```

---

## Phase 1 — Home page

### Task 6: Hero orchestration + carousel frame

**Files:**
- Modify: `src/features/home/components/home-hero.tsx`
- Modify: `src/features/home/components/hero-carousel.tsx`

**Interfaces:**
- Consumes: `hero-seq`/`hero-seq-N` classes (Task 1), `BrandStroke draw` (Task 2).

- [ ] **Step 1: Stagger the hero**

In `home-hero.tsx`, add sequence classes to the four content blocks (presentation only — no structural moves):
- the `Badge` "Welcome To" → add `hero-seq hero-seq-1`
- the `<h1>` → `hero-seq hero-seq-2` (the `BrandStroke draw` from Task 2 already starts at 550ms, landing right after the headline settles)
- the tagline `<p>` and description `<p>` → `hero-seq hero-seq-3`
- the buttons row → `hero-seq hero-seq-4`

Also step the headline scale up one notch: `sm:text-5xl md:text-6xl` → `sm:text-6xl md:text-7xl` (keep `text-4xl` base for 390px).

- [ ] **Step 2: Carousel frame**

In `hero-carousel.tsx`, find the outermost frame element (the container that clips the slide images) and add: `shadow-raised ring-1 ring-brand-500/15`. Touch nothing about slide logic, timing, or controls.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Visual check at 1440/1024/768/390: load the home page — eyebrow, headline, stroke draw-in, tagline, CTAs land as one ~1s sequence; with reduced motion emulated everything is simply present; carousel behaves exactly as before.

- [ ] **Step 4: Commit**

```bash
git add src/features/home/components/home-hero.tsx src/features/home/components/hero-carousel.tsx
git commit -m "feat(home): orchestrated hero entrance and framed carousel"
```

---

### Task 7: Home sections — reveals and Quick Services hover

**Files:**
- Modify: `src/app/(public)/page.tsx` (wrap section components in `Reveal`)
- Modify: `src/features/home/components/quick-services-section.tsx`
- Modify: `src/features/home/components/community-pulse-section.tsx`
- Modify: `src/features/home/components/get-involved-section.tsx`

**Interfaces:**
- Consumes: `Reveal` (Task 3), `Eyebrow` via `SectionHeading` (already inherited).

- [ ] **Step 1: Wrap sections**

In `page.tsx`, wrap each below-the-fold section component: `<Reveal><QuickServicesSection /></Reveal>` etc. (`Reveal` renders Server-Component children untouched — they stay server components.) Do not wrap the hero.

- [ ] **Step 2: Quick Services cards**

Read `quick-services-section.tsx` first. Apply this hover recipe to each service card's outer element (merging with its existing classes): `transition-all duration-(--duration-quick) ease-out-soft hover:-translate-y-1 hover:shadow-floating` and on the card's icon element `transition-colors duration-(--duration-quick) group-hover:text-brand-600` (add `group` to the card if not present). If the cards use `Card interactive`, the Task 5 tokens already cover the lift — then only add the icon tint.

- [ ] **Step 3: Community Pulse & Get Involved**

Read each file; where a section renders a card grid, wrap each grid item in `Reveal` with a stagger: `delay={Math.min(index, 4) * 80}` (capped so long grids don't crawl). Apply `spacing="spacious"` to the Get Involved `Section` if it is the page's closing moment.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Visual check at all four widths: scroll the full home page — sections rise in once, cards stagger, nothing re-animates on scroll-up, reduced motion shows everything statically.

- [ ] **Step 5: Commit**

```bash
git add src/app/(public)/page.tsx src/features/home/components/quick-services-section.tsx src/features/home/components/community-pulse-section.tsx src/features/home/components/get-involved-section.tsx
git commit -m "feat(home): scroll reveals and quick-services hover moments"
```

---

## Phase 2 — Public inner pages

### Task 8: `PageHero` keyword strokes across pages

**Files:**
- Modify (call sites passing `title` — confirm the list first with `grep -rl "PageHero" src/app src/features`): `src/app/(public)/about/page.tsx`, `src/app/(public)/services/page.tsx`, `src/app/(public)/announcements/page.tsx`, `src/app/(public)/transparency/legislative/page.tsx`, `src/app/(public)/transparency/uploads/page.tsx`, plus the transparency/officials/contact heroes if they render `PageHero` via feature sections (follow the grep).

**Interfaces:**
- Consumes: `PageHero` `title: React.ReactNode` (Task 4), `BrandStroke` (Task 2, no `draw` here).

- [ ] **Step 1: Apply per page**

For each call site, wrap the single most characteristic word of the existing title — **the title text itself does not change**. Example pattern:

```tsx
<PageHero
  title={<>Our <BrandStroke>Services</BrandStroke></>}
  ...
/>
```

One stroke per page, on the keyword (e.g. "Services", "Transparency", "Announcements", the About page's "San Fernando"). Skip pages whose hero is a custom section rather than `PageHero`.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Visual check: each modified page at 1440/390 — stroke sits under the keyword, no wrapping artifacts at 390 (the stroke span is `whitespace-nowrap`; if a long keyword forces overflow at 390, stroke a shorter word instead).

- [ ] **Step 3: Commit**

```bash
git add -u src/app src/features
git commit -m "feat(public): BrandStroke keywords on page heroes"
```

---

### Task 9: Services catalog affordance

**Files:**
- Modify: the services catalog card component (find via `grep -rl "Apply" src/features/services/components --include=*.tsx`; it renders the catalog grid on `/services`)

**Interfaces:**
- Consumes: `Card interactive` recipe, `duration-(--duration-quick)`.

- [ ] **Step 1: Read the card component, then apply**

Each service card, keeping all existing content and links: ensure the whole card is the hover group (`group` class); style the existing "Apply" affordance's arrow icon with `transition-transform duration-(--duration-quick) group-hover:translate-x-1`. Requirements count and fee, if present in the card's data, get `tabular-nums` and a metadata style: `text-xs font-medium uppercase tracking-wider text-ink-500`. Do not add data that the card's props don't already carry.

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck && npm run lint`
Visual check: `/services` at four widths; hover a card — lift + arrow nudge.

```bash
git add -u src/features
git commit -m "feat(services): catalog card affordance polish"
```

---

### Task 10: Transparency — quiet precision

**Files:**
- Modify: `src/features/transparency/components/` table/section components (locate with `ls src/features/transparency/components`), including `LegislativeTable`.

**Interfaces:**
- Consumes: nothing new; class-level only.

- [ ] **Step 1: Apply the table recipe**

In each transparency table/list: add `tabular-nums` to every date/number cell class; unify file-type badges to `Badge variant="neutral"`; ensure row hover is `hover:bg-ink-50 transition-colors duration-(--duration-quick)`. No reveals inside tables; wrap only whole sections in `Reveal` at the page level.

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck && npm run lint && npm run test:e2e -- --project=public`
Visual check: `/transparency`, `/transparency/legislative`, `/transparency/uploads` at 1440/390 — dates align vertically, downloads unchanged.

```bash
git add -u src/features
git commit -m "feat(transparency): tabular alignment and quiet row treatment"
```

---

### Task 11: News / announcements / events cards

**Files:**
- Modify: news + announcements + events card components under `src/features/` (locate by reading the announcements page's imports and `src/features/news`).

**Interfaces:**
- Consumes: `Card` tokens; existing image components.

- [ ] **Step 1: Apply the media-card recipe**

Every card image container: a fixed aspect ratio (`aspect-[4/3]` for grid cards, keep any existing hero ratios), `overflow-hidden`, and on the `<img>`/`<Image>`: `transition-transform duration-(--duration-reveal) ease-out-soft group-hover:scale-[1.03]` with `group` on the card root. Category chips stay `Badge` (they are genuine statuses). Card titles: ensure `font-display tracking-tight`.

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck && npm run lint`
Visual check: `/announcements` and the news sections at four widths — uniform crops, gentle zoom, no layout shift.

```bash
git add -u src/features
git commit -m "feat(news): uniform crops and hover zoom on media cards"
```

---

### Task 12: Officials, About, Contact

**Files:**
- Modify: `src/features/officials/components/` (portrait cards + Action Center panel), `src/features/about/components/` (history timeline + stats section), `src/features/contact/components/` (rhythm only).

**Interfaces:**
- Consumes: `Eyebrow` `tone="dark"` (for the `ink-950` Action Center), `Section spacing="spacious"`.

- [ ] **Step 1: Officials**

Portrait cards: uniform `aspect-[3/4]` image frames, `object-cover`, `Card` recipe. The 24/7 Action Center panel becomes the page's `ink-950` anchor: `bg-ink-950 text-white` surface (if not already), `Eyebrow tone="dark"` label, hotline number in `font-display text-3xl tabular-nums text-brand-400`. The dial link and number text stay exactly as they are (real hotline, `(077) 600 1082`).

- [ ] **Step 2: About**

History timeline: render the existing entries along a visible connected line — left rule (`border-l-2 border-brand-200`) with amber node dots (`size-3 rounded-full bg-brand-500 ring-4 ring-brand-100`) per entry; years in `font-display tabular-nums`. Content and order untouched. Stats section: `spacing="spacious"`, stat numbers `font-display text-5xl tabular-nums`.

- [ ] **Step 3: Contact**

Only alignment/rhythm: field spacing via the existing `Field` component, the map card (`MAP_IMAGE`) gets `shadow-raised`. The "Get Directions" `#` stub stays a stub.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm run lint`
Visual check: `/officials`, `/about`, `/contact` at four widths.

```bash
git add -u src/features
git commit -m "feat(public): officials anchor moment, about timeline, contact rhythm"
```

---

## Phase 3 — Forms, ticket flows, track

### Task 13: Ticket-flow shell and the success moment

**Files:**
- Create: `src/components/ui/form-section-label.tsx`
- Modify: the four flow pages/sections — `src/app/(public)/services/apply/[slug]/page.tsx`, `src/app/(public)/appointments/new/page.tsx`, `src/app/(public)/complaints/new/page.tsx`, `src/app/(public)/assistance/new/page.tsx` — and their feature form components (read each; the forms live under `src/features/`).

**Interfaces:**
- Produces: `FormSectionLabel({ children })` — editorial group label inside forms; reused by admin drawers in Task 17.
- Consumes: `BrandStroke`, `Eyebrow`. **All fields, steps, actions, validation, and submit logic stay byte-identical.**

- [ ] **Step 1: Create `FormSectionLabel`**

```tsx
// src/components/ui/form-section-label.tsx
/**
 * Group label inside long forms (public ticket flows and admin drawers):
 * an editorial rule-and-label that chunks fields without changing them.
 */
export function FormSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 border-t border-ink-200/70 pt-6 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">
      <span aria-hidden="true" className="h-px w-6 shrink-0 bg-brand-500" />
      {children}
    </p>
  );
}
```

- [ ] **Step 2: Apply the shell recipe to each flow**

Read each form component first. Then, purely additively: insert `FormSectionLabel` rows between the form's existing logical field groups (personal details / request details / etc. — follow the groupings the markup already implies); above the form, if the page lacks a "what happens next" note, add a short one-line `<p className="text-sm text-ink-500">` describing the existing flow's next step (e.g. "You'll get a reference number to track this request." — a new sentence, allowed: it describes behavior, changes none).

- [ ] **Step 3: The success moment**

Find each flow's success/confirmation render (the branch showing the reference number). Recipe, adapted to what's there without changing the reference number's own markup/logic:

```tsx
<div className="mx-auto max-w-lg text-center">
  <Eyebrow className="mb-4 justify-center">Request received</Eyebrow>
  <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900">
    ...existing heading text, with one word wrapped in <BrandStroke>...
  </h2>
  <p className="mt-6 font-display text-4xl font-semibold tabular-nums tracking-tight text-brand-600">
    {referenceNumber}
  </p>
  ...existing copy/actions unchanged...
</div>
```

If a flow's success heading text is asserted by a Playwright test, keep that exact text as the heading — stroke a word inside it rather than introducing new heading copy.

- [ ] **Step 4: Track page timeline**

In `src/app/(public)/track/page.tsx` (and its feature components): render the existing status history as a connected timeline — same left-rule + node recipe as the About timeline (Task 12 Step 2), with the current status node in `bg-brand-500` and prior nodes in `bg-ink-300`. Status labels and data untouched.

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck && npm run lint && npm run test:e2e -- --project=public`
Expected: all ticket-flow e2e specs green with zero edits — this is the task most at risk of breaking selectors; if one fails, revert the offending text/markup change.
Visual check: all four flows + `/track` at four widths, including one full manual submission on the dev server.

```bash
git add src/components/ui/form-section-label.tsx
git add -u src
git commit -m "feat(flows): form section labels, success moment, track timeline"
```

---

## Phase 4 — Admin CMS

### Task 14: `StatusChip` success tones + admin table polish

**Files:**
- Modify: `src/features/admin/components/status-chip.tsx`
- Modify: `src/components/ui/data-table.tsx` (`tabular-nums` on cells only — no copy change)
- Modify: `src/features/admin/components/admin-stat-card.tsx` (numbers `tabular-nums font-display`)

**Interfaces:**
- Consumes: `--color-success` / `--color-success-soft` (Task 1).

- [ ] **Step 1: Retune the `TONES` map**

In `status-chip.tsx`, the two comments saying "there is no green token" retire. New tone assignments (labels, dot markup, and every status key stay identical):

```tsx
const TONES: Record<AdminStatus, string> = {
  // Live / positive-terminal → green (the new success pair)
  published: "bg-success-soft text-success",
  active: "bg-success-soft text-success",
  released: "bg-success-soft text-success",
  completed: "bg-success-soft text-success",
  resolved: "bg-success-soft text-success",
  granted: "bg-success-soft text-success",
  answered: "bg-success-soft text-success",
  // Stage-1 positives → amber (approved-but-not-terminal)
  approved: "bg-brand-100 text-brand-800",
  confirmed: "bg-brand-100 text-brand-800",
  // Attention states → amber, not red: review is workflow, not danger
  "in-review": "bg-brand-100 text-brand-800",
  "under-review": "bg-brand-100 text-brand-800",
  in_progress: "bg-brand-100 text-brand-800",
  // True negatives keep danger
  rejected: "bg-danger-soft text-danger-soft-fg",
  declined: "bg-danger-soft text-danger-soft-fg",
  dismissed: "bg-danger-soft text-danger-soft-fg",
  // Neutral / intake / dormant → ink, unchanged
  scheduled: "bg-ink-100 text-ink-700",
  pending: "bg-ink-100 text-ink-700",
  received: "bg-ink-100 text-ink-700",
  new: "bg-ink-100 text-ink-700",
  draft: "bg-ink-100 text-ink-600",
  planning: "bg-ink-100 text-ink-600",
  inactive: "bg-ink-100 text-ink-500",
  archived: "bg-ink-100 text-ink-500",
  closed: "bg-ink-100 text-ink-500",
};
```

(Spec §4: draft = ink, in-review = amber, published = green. `#15803d` on `#dcfce7` meets AA for the chip's `text-xs font-semibold`.)

- [ ] **Step 2: Table numerics**

In `data-table.tsx`, add `tabular-nums` to the `<td>` base classes. In `admin-stat-card.tsx`, the stat value gets `font-display tabular-nums`.

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Visual check (needs admin login): any two managers — published rows now read green, review states amber, archived stays muted; dots+labels everywhere (never color alone).

```bash
git add src/features/admin/components/status-chip.tsx src/components/ui/data-table.tsx src/features/admin/components/admin-stat-card.tsx
git commit -m "feat(admin): green success statuses and tabular numerics"
```

---

### Task 15: Admin empty states — invitations to act

**Files:**
- Modify: `src/features/admin/components/admin-empty-state.tsx` (visual only)
- Modify: manager call sites' `message` strings (locate with `grep -rn "AdminEmptyState" src/features/admin/components`)

**Interfaces:**
- The `AdminEmptyState` API is unchanged. **This is the one sanctioned interface-text task.**

- [ ] **Step 1: Visual**

In `admin-empty-state.tsx`: the icon gets a soft brand circle — replace the bare `SearchX` with:

```tsx
<span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
  <SearchX className="h-6 w-6" aria-hidden="true" />
</span>
```

- [ ] **Step 2: Copy**

At each call site with a no-records (not filtered-empty) message, rewrite to the invitation pattern: "No announcements yet — create the first one." / "No services yet — add the first one." Filtered-empty messages ("No results match…") keep their clear-filters framing. **Check first** that no Playwright admin spec asserts the old strings: `grep -rn "No records\|No .* yet" tests/e2e` — any asserted string stays verbatim.

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint` and, if creds present, `npm run test:e2e -- --project=admin`

```bash
git add -u src/features/admin
git commit -m "feat(admin): empty states invite the first record"
```

---

### Task 16: Admin shell refinements

**Files:**
- Modify: `src/features/admin/components/admin-sidebar.tsx`

**Interfaces:**
- No API changes. The active-item amber edge, topbar float/blur, and cookie-collapse already exist (built in recent commits) — this task is deliberately small; do not re-do them.

- [ ] **Step 1: Group labels + depth**

Group heading `<p>` class becomes the editorial style: `mb-1.5 flex items-center gap-2 px-3 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-ink-500 before:h-px before:w-4 before:bg-white/15 before:content-['']`. On the `<aside>`, add depth separation from the content column: append `shadow-[4px_0_24px_rgb(0_0_0/0.25)]` — a one-off literal is acceptable here (dark-on-dark; the token scale is tuned for light surfaces).

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit` (admin-nav tests must stay green — nothing here touches the nav module)
Visual check: expanded + collapsed rail, mobile drawer.

```bash
git add src/features/admin/components/admin-sidebar.tsx
git commit -m "feat(admin): editorial nav group labels and rail depth"
```

---

### Task 17: Drawers, dialogs, and drawer form grouping

**Files:**
- Modify: `src/components/ui/drawer.tsx` (header polish only — it already sits outside the scroll area)
- Modify: `src/components/ui/confirm-dialog.tsx` (surface language)
- Modify: drawer form components' internal grouping (the seven draft-capable editors; locate with `grep -rln "useFormDraft" src/features/admin/components`)

**Interfaces:**
- Consumes: `FormSectionLabel` (Task 13). Drawer/dialog behavior (focus trap, Esc, inert, Cancel-first focus) untouched.

- [ ] **Step 1: Drawer header**

In `drawer.tsx`: header bar gains `bg-white/95 backdrop-blur` (reads as a plane when the body scrolls under it). Panel `shadow-2xl` → `shadow-floating`.

- [ ] **Step 2: Form grouping + sticky actions**

In each of the draft-capable editors: insert `FormSectionLabel` between existing field groups (as in Task 13 — additive only). Where the form's action row is the last element of a scrollable body, make it sticky: `sticky bottom-0 -mx-6 border-t border-ink-200/70 bg-white px-6 py-4` (adjust the negative margin to the form's actual padding — read each file). The `draft-recovery-bar.tsx` status line restyles as a quiet timestamp row: `text-xs text-ink-500` — its "Recovery copy saved on this device" wording is load-bearing (spec + sub-project 8) and must not change.

- [ ] **Step 3: ConfirmDialog**

Surface alignment only: panel gets `rounded-3xl shadow-floating`; destructive confirm button keeps its existing variant and focus behavior.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm run lint` and admin e2e if creds present.
Visual check: open two drawer editors (one create, one edit-published), scroll — actions stay visible; run one archive → ConfirmDialog.

```bash
git add -u src/components/ui src/features/admin/components
git commit -m "feat(admin): drawer plane polish, grouped fields, sticky actions"
```

---

### Task 18: Login card

**Files:**
- Modify: `src/features/admin/components/login-form.tsx` and the login page that frames it

**Interfaces:**
- Consumes: `BrandStroke`, `Eyebrow`, `Card` tokens. Auth logic, field names, error copy untouched.

- [ ] **Step 1: Apply**

Frame the form in the portal's card language: seal image (`SITE.sealImage`, rendered as the sidebar renders it) above an `Eyebrow` ("Barangay Portal") and a `font-display` heading with `<BrandStroke>San Fernando</BrandStroke>`; card surface `rounded-3xl border border-ink-200/70 bg-white shadow-raised`. Submit button stays the existing `Button` primary.

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck && npm run lint`; admin e2e if creds present (`auth.setup.ts` signs in through this form — its selectors must still match; do not rename fields or button text).
Visual check: the admin login page at 1440/390.

```bash
git add -u src/features/admin src/app/admin
git commit -m "feat(admin): login card joins the design language"
```

---

## Phase 5 — Walkthrough

### Task 19: Full demo-route verification

**Files:** none planned — fix-only.

- [ ] **Step 1: Full suites**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e`
Expected: everything green, `git diff tests/` empty.

- [ ] **Step 2: Demo walkthrough at four widths**

Drive the dev server through the demo route — home → services → apply flow (one real submission) → transparency → announcements → officials → about → contact → `/track` → admin login → two managers → one drawer edit → archive/restore — at 1440, 1024, 768, 390. Screenshot each stop. Check against the spec: reveals fire once, reduced motion clean, no horizontal scroll at 390, eyebrows/strokes/status colors consistent.

- [ ] **Step 3: Fix list**

File and fix findings as individual commits (`fix(overhaul): <finding>`), re-running the affected checks per fix.

- [ ] **Step 4: Handoff**

Then follow superpowers:finishing-a-development-branch.
