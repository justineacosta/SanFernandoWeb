# System-Wide Motion (Framer Motion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Motion (framer-motion) animation language — introduced in the admin chrome on 2026-07-23 — to every surface where CSS alone cannot do the job: exit animations, springs, and data-driven staggers, on both the public site and the admin portal.

**Architecture:** A single presets module (`src/lib/motion.ts`) is the only place springs, easings, and durations are defined; every animated component imports from it. Motion is used **only** where CSS cannot: exiting elements (`AnimatePresence`), shared-element indicators (already shipped in the sidebar), and mount-time staggers over data. The existing CSS three-pattern system (hero-seq, `.reveal-*`, `--duration-quick` micro-interactions) stays exactly as it is.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, `motion` v12 (framer-motion's current package name, already installed — import from `"motion/react"`), Vitest for the one pure-data test.

## Global Constraints

- **Strictly presentational.** No Server Action, query, schema, hook-logic, or handler changes. No test file may be modified except the one new unit test this plan adds.
- Import Motion from `"motion/react"` (the package is `motion`, already in package.json — do NOT install `framer-motion`).
- Every Motion surface is wrapped in `<MotionConfig reducedMotion="user">` — no exceptions.
- All transition values come from `src/lib/motion.ts` (Task 1). Never inline a spring or duration in a component.
- **Do not convert existing CSS animations to Motion.** Already animated and out of scope: `Reveal` / `.reveal-*` scroll reveals, `.hero-seq`, the admin `Drawer` (CSS translate — it also keeps children mounted while closed, which `AnimatePresence` would break, resetting form state), the `Accordion` (CSS `grid-rows` height trick), `Toast` (enter-only CSS; exit would force `AnimatePresence` into every manager call site for negligible gain), and the sidebar collapse width (CSS).
- **No `y`/`scale` transforms on wrappers that contain `position: fixed` descendants.** The admin `Drawer` renders in place (not portaled) with `fixed inset-0`; a transformed ancestor becomes its containing block and breaks it. This is why the route templates in Task 7 are opacity-only.
- Design tokens only (`brand-*`, `ink-*`, `danger*`, `success*`); the site is amber + ink.
- Verification per task: `npm run typecheck && npm run lint && npm run test:unit` (expect 6 files / 82 tests passing after Task 1 adds one). Public e2e (`npm run test:e2e -- --project=public`, 3 tests) runs in Tasks 4–8 where public behavior is touched. Admin e2e needs `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` in `.env.local` and **fails (not skips) without them** — do not run it unless those are set; admin surfaces are otherwise verified by build + code review + a manual click-through by Justine.
- Stage files **by name** — never `git add -A` (untracked `proposal/` and `stitch_tabbed_content_manager/` must stay untracked).
- The dev server is often already running on :3000 — check before starting another.

---

### Task 1: Motion presets module (+ budget test, + refactor admin chrome onto it)

**Files:**
- Create: `src/lib/motion.ts`
- Create: `tests/unit/motion.test.ts`
- Modify: `src/features/admin/components/admin-sidebar.tsx` (inline spring → preset)
- Modify: `src/features/admin/components/admin-mobile-nav.tsx` (inline spring/fade → presets)
- Modify: `src/features/admin/components/admin-topbar.tsx` (inline title transition → preset)

**Interfaces:**
- Consumes: nothing.
- Produces: `EASE_OUT_SOFT: [number, number, number, number]`, `SPRING_PANEL: Transition`, `SPRING_INDICATOR: Transition`, `FADE_QUICK: Transition`, `POP: Transition`, `RISE: Transition`, `riseVariants: Variants`, `staggerContainer(stagger?: number): Variants`. Every later task imports from `@/lib/motion`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/motion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EASE_OUT_SOFT,
  FADE_QUICK,
  POP,
  RISE,
  SPRING_INDICATOR,
  SPRING_PANEL,
  riseVariants,
  staggerContainer,
} from "@/lib/motion";

/**
 * The motion budget: nothing in the preset module may drift slow or bouncy.
 * These are the same ceilings the 2026-07-23 UI/UX spec set for CSS motion.
 */
describe("motion presets", () => {
  it("matches --ease-out-soft in globals.css", () => {
    expect(EASE_OUT_SOFT).toEqual([0.16, 1, 0.3, 1]);
  });

  it("keeps every duration-based preset at 300ms or under", () => {
    for (const preset of [FADE_QUICK, POP, RISE]) {
      expect(preset.duration).toBeDefined();
      expect(preset.duration!).toBeLessThanOrEqual(0.3);
    }
  });

  it("keeps springs firmly damped so panels never visibly bounce", () => {
    for (const spring of [SPRING_PANEL, SPRING_INDICATOR]) {
      expect(spring.type).toBe("spring");
      expect(spring.damping).toBeGreaterThanOrEqual(30);
    }
  });

  it("staggers gently and rises from a short distance", () => {
    const container = staggerContainer();
    expect(container.visible).toMatchObject({
      transition: { staggerChildren: 0.08 },
    });
    expect(riseVariants.hidden).toMatchObject({ opacity: 0, y: 16 });
    expect(riseVariants.visible).toMatchObject({ opacity: 1, y: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/motion.test.ts`
Expected: FAIL — cannot resolve `@/lib/motion`.

- [ ] **Step 3: Write the module**

Create `src/lib/motion.ts` (no `"use client"` — it is pure data, importable anywhere):

```ts
import type { Transition, Variants } from "motion/react";

/**
 * The only place springs, easings, and durations live. Components import
 * these; they never inline their own. Ceilings are enforced by
 * tests/unit/motion.test.ts.
 */

/** Matches --ease-out-soft in globals.css. */
export const EASE_OUT_SOFT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Panels and drawers: settles fast, no visible bounce. */
export const SPRING_PANEL: Transition = { type: "spring", stiffness: 380, damping: 40 };

/** Small shared-element indicators (the sidebar's active pill): a touch livelier. */
export const SPRING_INDICATOR: Transition = { type: "spring", stiffness: 420, damping: 34 };

/** Scrims and other pure fades. */
export const FADE_QUICK: Transition = { duration: 0.2 };

/** Menus and dialogs popping into place. */
export const POP: Transition = { duration: 0.15, ease: EASE_OUT_SOFT };

/** Entrances that rise into position (receipts, staggered list items). */
export const RISE: Transition = { duration: 0.3, ease: EASE_OUT_SOFT };

/** Pair with staggerContainer(): item side of a mount-time stagger. */
export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: RISE },
};

/** Parent side of a mount-time stagger over data (e.g. timeline steps). */
export const staggerContainer = (stagger = 0.08): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger } },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/motion.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Point the admin chrome at the presets**

In `src/features/admin/components/admin-sidebar.tsx`:
- Add import: `import { SPRING_INDICATOR } from "@/lib/motion";`
- Replace `transition={{ type: "spring", stiffness: 420, damping: 34 }}` (on the `motion.span` with `layoutId="active-nav"`) with `transition={SPRING_INDICATOR}`.

In `src/features/admin/components/admin-mobile-nav.tsx`:
- Add import: `import { FADE_QUICK, SPRING_PANEL } from "@/lib/motion";`
- Replace `transition={{ duration: 0.2 }}` (scrim `motion.button`) with `transition={FADE_QUICK}`.
- Replace `transition={{ type: "spring", stiffness: 380, damping: 40 }}` (panel `motion.div`) with `transition={SPRING_PANEL}`.

In `src/features/admin/components/admin-topbar.tsx`:
- Add import: `import { POP } from "@/lib/motion";`
- Replace `transition={{ duration: 0.15, ease: "easeOut" }}` (on the `motion.h1`) with `transition={POP}`.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all green, 82 unit tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/motion.ts tests/unit/motion.test.ts src/features/admin/components/admin-sidebar.tsx src/features/admin/components/admin-mobile-nav.tsx src/features/admin/components/admin-topbar.tsx
git commit -m "feat: motion presets module; admin chrome consumes it"
```

---

### Task 2: ConfirmDialog — animated enter and exit

**Files:**
- Modify: `src/components/ui/confirm-dialog.tsx`

**Interfaces:**
- Consumes: `FADE_QUICK`, `POP` from `@/lib/motion` (Task 1).
- Produces: no API change — `ConfirmDialogProps` is untouched; every manager keeps rendering `<ConfirmDialog open={...} ... />` exactly as today.

- [ ] **Step 1: Restructure the render around AnimatePresence**

In `src/components/ui/confirm-dialog.tsx`:

Add imports after the existing ones:

```tsx
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { FADE_QUICK, POP } from "@/lib/motion";
```

Delete the early return line:

```tsx
  if (!open) return null;
```

(All hooks sit above it, so removing it is hook-safe. The component must now always return the `AnimatePresence` wrapper so the exit animation has somewhere to run.)

Replace the entire `return (...)` block with:

```tsx
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open ? (
          <motion.div key="confirm" className="fixed inset-0 z-70 flex items-center justify-center p-4">
            <motion.div
              aria-hidden="true"
              onClick={() => (pending ? undefined : onCancel())}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_QUICK}
              className="absolute inset-0 bg-ink-950/50"
            />
            <motion.div
              ref={panelRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-body"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={POP}
              className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-floating"
            >
              <div className="flex gap-4">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                    tone === "danger" ? "bg-danger-soft text-danger" : "bg-brand-100 text-brand-700",
                  )}
                >
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2
                    id="confirm-dialog-title"
                    className="font-display text-lg font-semibold tracking-tight text-ink-900"
                  >
                    {title}
                  </h2>
                  <div id="confirm-dialog-body" className="mt-2 text-sm text-ink-600">
                    {body}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  ref={cancelRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={onCancel}
                >
                  {cancelLabel}
                </Button>
                <Button
                  type="button"
                  variant={tone === "danger" ? "outline-danger" : "primary"}
                  size="sm"
                  disabled={pending}
                  onClick={onConfirm}
                >
                  {pending ? "Working…" : confirmLabel}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
```

Notes for the implementer:
- The old panel class had `animate-fade-up` — it is gone; Motion owns the entrance now.
- The `key="confirm"` wrapper is a bare `motion.div` with no animation props: `AnimatePresence` waits for the exiting `motion` descendants (scrim and panel) before unmounting the tree.
- Focus restore in the cleanup effect still fires the instant `open` flips false, while the exit plays — that is correct and unchanged.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all green. There is no browser check available for admin without `E2E_ADMIN_*` credentials — Justine verifies the dialog by archiving a record manually.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/confirm-dialog.tsx
git commit -m "feat(admin): ConfirmDialog animates in and out"
```

---

### Task 3: RowActions kebab menu — pop-in

**Files:**
- Modify: `src/components/ui/row-actions.tsx`

**Interfaces:**
- Consumes: `POP` from `@/lib/motion`.
- Produces: no API change (`RowAction`, `RowActionsProps` untouched).

Enter-only by design: menus that vanish instantly on dismiss are correct desktop behavior, and an exit animation would force `AnimatePresence` around a `createPortal` conditional for no visible benefit.

- [ ] **Step 1: Animate the portal menu**

In `src/components/ui/row-actions.tsx`:

Add imports:

```tsx
import { MotionConfig, motion } from "motion/react";
import { POP } from "@/lib/motion";
```

In the `menu = createPortal(...)` block, change the outer `<div ... >` (the one with `ref={menuRef}` and `role="menu"`) to a `motion.div`, keeping every existing prop, and add the animation props plus a transform origin that respects the flip:

```tsx
    menu = createPortal(
      <MotionConfig reducedMotion="user">
        <motion.div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Actions for ${label}`}
          onKeyDown={handleMenuKeyDown}
          initial={{ opacity: 0, scale: 0.95, y: flip ? 6 : -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={POP}
          style={{
            top,
            left,
            width: MENU_WIDTH,
            transformOrigin: flip ? "bottom right" : "top right",
          }}
          className="fixed z-70 rounded-2xl border border-ink-200/70 bg-white p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)]"
        >
          {/* ...the enabled.map(...) buttons stay byte-for-byte identical... */}
        </motion.div>
      </MotionConfig>,
      document.body,
    );
```

The `enabled.map` content inside is unchanged — only the wrapper element and its new props change. The closing tag becomes `</motion.div>` followed by `</MotionConfig>`.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all green. Keyboard behavior is unchanged (focus effects key off `open`/`activeIndex`, not the animation).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/row-actions.tsx
git commit -m "feat(admin): row kebab menu pops in from its trigger"
```

---

### Task 4: Public mobile nav — animated open and close

**Files:**
- Modify: `src/components/navigation/mobile-nav.tsx`

**Interfaces:**
- Consumes: `FADE_QUICK`, `POP` from `@/lib/motion`.
- Produces: no API change.

- [ ] **Step 1: Wrap the floating card in AnimatePresence**

Replace the full contents of `src/components/navigation/mobile-nav.tsx` with:

```tsx
"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { FADE_QUICK, POP } from "@/lib/motion";
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
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {isOpen ? (
            <motion.nav
              key="mobile-menu"
              id="mobile-menu"
              aria-label="Primary"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, transition: FADE_QUICK }}
              transition={POP}
              style={{ transformOrigin: "top center" }}
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
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
```

(The transform sits on the fixed element itself, not on an ancestor of one — safe.)

- [ ] **Step 2: Verify in the browser**

With the dev server on :3000, use Playwright MCP: resize to 390×844, navigate to `http://localhost:3000`, click the menu button, confirm the card pops in and nav links are clickable; click the X and confirm it fades out (screenshot before/after). Then run:

`npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e -- --project=public`
Expected: all green (3 e2e tests).

- [ ] **Step 3: Commit**

```bash
git add src/components/navigation/mobile-nav.tsx
git commit -m "feat: public mobile menu pops open and fades closed"
```

---

### Task 5: SwapReveal — animated form → receipt handoff in all four ticket flows

**Files:**
- Create: `src/components/ui/swap-reveal.tsx`
- Modify: `src/features/services/components/apply-form.tsx:85` (receipt return) and its final form return
- Modify: `src/features/appointments/components/appointment-form.tsx:81` (same shape)
- Modify: `src/features/complaints/components/complaint-form.tsx:84` (same shape)
- Modify: `src/features/assistance/components/assistance-form.tsx:77` (same shape)

**Interfaces:**
- Consumes: `EASE_OUT_SOFT`, `RISE` from `@/lib/motion`.
- Produces: `SwapReveal({ face, children }: { face: string; children: React.ReactNode })` — a crossfade-and-rise container; changing `face` animates the old face out and the new one in.

- [ ] **Step 1: Create the primitive**

Create `src/components/ui/swap-reveal.tsx`:

```tsx
"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { RISE } from "@/lib/motion";

interface SwapRevealProps {
  /** Key for the face currently shown — change it to animate the swap. */
  face: string;
  children: React.ReactNode;
}

/**
 * Crossfade-and-rise between the faces of a flow (form → success receipt).
 *
 * Each face renders its own <SwapReveal> at the same position in the tree, so
 * React reuses the AnimatePresence instance across the swap and only the keyed
 * child changes — which is exactly what makes the exit/enter pair run.
 * Opacity and a short rise only; nothing inside a face is individually staggered.
 */
export function SwapReveal({ face, children }: SwapRevealProps) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={face}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
          transition={RISE}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
```

- [ ] **Step 2: Wire it into apply-form**

In `src/features/services/components/apply-form.tsx`:

Add import: `import { SwapReveal } from "@/components/ui/swap-reveal";`

The receipt branch currently reads:

```tsx
  if (ticketNo) {
    return (
      <Card className="rounded-3xl p-8 text-center">
```

Change it to (only the wrapper lines are new — the `<Card>…</Card>` receipt JSX between them moves in verbatim, unmodified):

```tsx
  if (ticketNo) {
    return (
      <SwapReveal face="receipt">
        <Card className="rounded-3xl p-8 text-center">
          {/* …existing receipt content, unchanged… */}
        </Card>
      </SwapReveal>
    );
  }
```

And the final return, currently:

```tsx
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
```

becomes (again, everything inside `<form>…</form>` is untouched):

```tsx
  return (
    <SwapReveal face="form">
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        {/* …existing form content, unchanged… */}
      </form>
    </SwapReveal>
  );
```

Re-indent the moved JSX one level; change nothing else in the file.

- [ ] **Step 3: Wire it into the other three forms**

Apply the identical two-wrapper edit to each of:
- `src/features/appointments/components/appointment-form.tsx` (receipt branch at the `if (ticketNo) {` on line 81)
- `src/features/complaints/components/complaint-form.tsx` (line 84)
- `src/features/assistance/components/assistance-form.tsx` (line 77)

In each file: add the `SwapReveal` import, wrap the receipt branch's returned JSX in `<SwapReveal face="receipt">…</SwapReveal>`, and wrap the final `return (<form …>…</form>)` in `<SwapReveal face="form">…</SwapReveal>`. The JSX inside each wrapper moves verbatim — these three forms have the same two-return shape as apply-form, and nothing about their fields, handlers, or receipt content changes.

- [ ] **Step 4: Verify in the browser (real submission)**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all green.

Then with Playwright MCP at 1440×900: submit the application form at `/services/apply/barangay-clearance` with first name `Demo`, last name `Walkthrough`, and purpose `Motion verification test — safe to reject`. Confirm the form lifts out and the receipt rises in with a ticket number. (This files one more disposable staging ticket — tell Justine its number so they can reject it.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/swap-reveal.tsx src/features/services/components/apply-form.tsx src/features/appointments/components/appointment-form.tsx src/features/complaints/components/complaint-form.tsx src/features/assistance/components/assistance-form.tsx
git commit -m "feat: ticket forms hand off to their receipts with a rise"
```

---

### Task 6: Track timeline — staggered arrival

**Files:**
- Modify: `src/features/track/components/ticket-timeline.tsx`
- Modify: `src/features/track/components/track-lookup.tsx:80`

**Interfaces:**
- Consumes: `riseVariants`, `staggerContainer` from `@/lib/motion`.
- Produces: no API change (`TicketTimeline({ ticket })` as before), but the component becomes a client component.

- [ ] **Step 1: Stagger the steps**

In `src/features/track/components/ticket-timeline.tsx`:

Add `"use client";` as line 1 (the component is pure props-to-JSX; nothing else about it changes semantically), and add imports:

```tsx
import { MotionConfig, motion } from "motion/react";
import { riseVariants, staggerContainer } from "@/lib/motion";
```

Replace the `return (<ol> … </ol>)` in `TicketTimeline` so the list and items are Motion elements (all classNames, the connector span, icon, and text blocks stay identical):

```tsx
  return (
    <MotionConfig reducedMotion="user">
      <motion.ol variants={staggerContainer(0.12)} initial="hidden" animate="visible">
        {steps.map((step, index) => {
          const Icon = step.state === "failed" ? XCircle : step.state === "done" ? CheckCircle2 : Circle;
          const isLast = index === steps.length - 1;
          return (
            <motion.li
              key={step.title}
              variants={riseVariants}
              className={cn("relative flex gap-4", !isLast && "pb-6")}
            >
              {/* …existing connector span, Icon, and text block, unchanged… */}
            </motion.li>
          );
        })}
      </motion.ol>
    </MotionConfig>
  );
```

The `<li>` closing tag becomes `</motion.li>`; the interior of each list item is byte-for-byte what it is today.

- [ ] **Step 2: Key the timeline by ticket so a new lookup replays the stagger**

In `src/features/track/components/track-lookup.tsx` line 80, change:

```tsx
          <TicketTimeline ticket={ticket} />
```

to:

```tsx
          <TicketTimeline key={ticket.ticketNo} ticket={ticket} />
```

(Without the key, looking up a second ticket updates the mounted component and the mount-time stagger never replays.)

- [ ] **Step 3: Verify in the browser**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all green.

Playwright MCP: navigate to `/track`, look up the staging ticket `APP-2026-00003` with last name `Walkthrough`, confirm the three steps rise in sequence. Re-run the lookup with the Task 5 ticket and confirm the stagger replays.

- [ ] **Step 4: Commit**

```bash
git add src/features/track/components/ticket-timeline.tsx src/features/track/components/track-lookup.tsx
git commit -m "feat: track timeline steps arrive in sequence"
```

---

### Task 7: Route-content fade (public + admin templates)

**Files:**
- Create: `src/app/(public)/template.tsx`
- Create: `src/app/admin/template.tsx`

**Interfaces:**
- Consumes: `FADE_QUICK` from `@/lib/motion`.
- Produces: nothing consumed by later tasks.

Next.js remounts a `template.tsx` on every navigation within its segment — that remount is what replays the entrance. **Opacity only, deliberately:** a transform here would become the containing block for every `position: fixed` overlay rendered inside page content (the admin `Drawer` renders in place, not in a portal), silently pinning it to the wrapper instead of the viewport.

- [ ] **Step 1: Create both templates**

Create `src/app/(public)/template.tsx`:

```tsx
"use client";

import { MotionConfig, motion } from "motion/react";
import { FADE_QUICK } from "@/lib/motion";

/**
 * Fades each public page in on navigation. Opacity only — a transform here
 * would become the containing block for fixed-position overlays rendered
 * inside page content.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE_QUICK}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}
```

Create `src/app/admin/template.tsx` with identical contents (same constraint, same code — the comment's first line reads "Fades each admin page in on navigation." instead).

- [ ] **Step 2: Verify in the browser, including the one behavior risk**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e -- --project=public`
Expected: all green — the e2e run is the check that the fade breaks no public flow.

Playwright MCP at 1440×900: click through Home → Services → Transparency and confirm each page fades in; confirm the home hero-seq still plays beneath the fade; confirm in-page anchors and the sticky public header still behave.

**Acceptance gate:** if any public e2e test fails or the sticky header/scroll behavior regresses, delete both template files and skip this task (commit nothing) — the plan's other tasks do not depend on it.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/template.tsx" src/app/admin/template.tsx
git commit -m "feat: pages fade in on navigation (opacity-only templates)"
```

---

### Task 8: Documentation + full-suite verification

**Files:**
- Modify: `CLAUDE.md` (Architecture section)

**Interfaces:**
- Consumes: everything above.
- Produces: the written motion doctrine future sessions will follow.

- [ ] **Step 1: Record the doctrine in CLAUDE.md**

In `CLAUDE.md`, in the `## Architecture` section, insert this bullet directly after the **Design system: amber + ink** bullet:

```markdown
- **Motion (framer-motion, imported from `"motion/react"`) is for what CSS cannot do** —
  exit animations (`AnimatePresence`), shared-element indicators (the admin sidebar's
  `layoutId` pill), and mount-time staggers over data. The CSS three-pattern system
  (hero-seq, `.reveal-*`, `--duration-quick` micro-interactions) stays CSS; never port it
  to Motion. All springs/durations come from `src/lib/motion.ts` (budget-tested in
  `tests/unit/motion.test.ts`) — never inline them. Every Motion surface wraps in
  `<MotionConfig reducedMotion="user">`. Never put a transform on a wrapper containing
  `position: fixed` descendants — the admin `Drawer` renders in place, which is why the
  route templates animate opacity only, and why the Drawer itself stays CSS (converting
  it to `AnimatePresence` would also unmount closed editors and reset their form state).
```

- [ ] **Step 2: Full verification**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run test:e2e -- --project=public`
Expected: everything green; build compiles all routes.

Reduced-motion check via Playwright MCP: emulate `prefers-reduced-motion: reduce`, open the public mobile menu and a form receipt — both must appear without translation or scale.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: motion doctrine — where Motion is used and where CSS stays"
```

---

## Self-Review Notes

- **Coverage:** presets (1), admin dialogs/menus (2–3), public nav (4), the four ticket flows (5), track payoff (6), route transitions (7), doctrine + suite (8). Deliberately excluded, with reasons in Global Constraints: Drawer, Accordion, Toast, Reveal/hero-seq, sidebar width, table-row layout animations (server refetch replaces rows, so continuity is impossible anyway).
- **Type consistency:** `SwapReveal({ face, children })`, `staggerContainer(stagger?)`, `riseVariants`, and the six transition presets are named identically everywhere they appear.
- **Order:** Tasks 2–7 all depend only on Task 1; execute in the listed order so the admin surfaces (unverifiable in-browser) land while public surfaces (fully verifiable) close the plan out with e2e evidence.
