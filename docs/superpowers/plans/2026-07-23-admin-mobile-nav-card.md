# Admin Mobile Nav Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin portal's full-height dark slide-in drawer with a floating white card menu shaped like the public site's mobile menu.

**Architecture:** One component is rewritten in place — `AdminMobileNav` stops rendering `AdminSidebar` and grows its own markup, modelled on `src/components/navigation/mobile-nav.tsx` but sourcing permission-gated, grouped, icon-bearing rows from `groupNavItems`. Two comments in `admin-sidebar.tsx` describe the relationship this change ends and are corrected in the same commit. Nothing else moves.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4 (`@theme` tokens), Motion (`motion/react`), Lucide icons.

**Spec:** `docs/superpowers/specs/2026-07-23-admin-mobile-nav-card-design.md`

## Global Constraints

- Colors/radii/fonts come only from the `@theme` tokens in `src/app/globals.css`. The brand scale is `brand-50`…`brand-800` — **`brand-900` does not exist** and renders as nothing. No blue tokens. No green/success token.
- Springs, easings and durations come only from `src/lib/motion.ts` — never inlined. This change uses `POP` and `FADE_QUICK`, both already exported.
- Every Motion surface wraps in `<MotionConfig reducedMotion="user">`.
- Never put a transform on a wrapper containing `position: fixed` descendants.
- **No new test files.** This repo deliberately has no component-level tests — "behaviour is verified in the browser" (CLAUDE.md). The only pure logic here, `groupNavItems`, is already covered by `tests/unit/admin-nav.test.ts`. Do not add a jsdom renderer to satisfy a TDD habit.
- **Never `git add -A`.** `proposal/`, `.playwright-mcp/` and `stitch_tabbed_content_manager/` are intentionally untracked. Always `git add <explicit paths>`.
- Site identity is "Barangay San Fernando, San Nicolas, Ilocos Norte". Any "Sampaguita" in `src/` is a regression.

## File Structure

| File | Change | Responsibility after the change |
|---|---|---|
| `src/features/admin/components/admin-mobile-nav.tsx` | Rewrite (67 lines → ~130) | Owns the whole mobile menu: toggle button, scrim, card, grouped pill rows, and all three dismissal paths. |
| `src/features/admin/components/admin-sidebar.tsx` | Two comment edits | Unchanged behaviour; the desktop rail. Its doc comments stop claiming a mobile drawer consumes it. |

No new files. `AdminSidebar`'s props and rendering are untouched — only prose.

---

### Task 1: Rewrite AdminMobileNav as a floating card

**Files:**
- Modify: `src/features/admin/components/admin-mobile-nav.tsx` (full rewrite)
- Modify: `src/features/admin/components/admin-sidebar.tsx:26` and `:38-41` (comments only)

**Interfaces:**
- Consumes: `groupNavItems(items: IconNavItem[], viewer: { isSuperAdmin: boolean; permissions: Permission[] })` from `@/lib/admin-nav`, returning `{ group: string; label: string; items: IconNavItem[] }[]`. Each `IconNavItem` carries `label`, `href`, `icon` (a `LucideIcon` component), and optional `exact`.
- Consumes: `useDisclosure()` from `@/hooks/use-disclosure` → `{ isOpen, open, close, toggle }`.
- Produces: nothing new. `AdminMobileNav`'s own props are unchanged — `{ isSuperAdmin: boolean; permissions: Permission[] }` — so `AdminTopBar` needs no edit.

- [ ] **Step 1: Replace the whole body of `admin-mobile-nav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { FADE_QUICK, POP } from "@/lib/motion";
import { groupNavItems } from "@/lib/admin-nav";
import { useDisclosure } from "@/hooks/use-disclosure";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";

/**
 * Hamburger + floating card menu for the admin portal on small screens.
 *
 * Shaped after the public site's `MobileNav` so the site has one mobile menu
 * model, but it cannot reuse that component: `MobileNav` maps a flat constant
 * of text links, while this needs permission-gated, grouped, icon-bearing rows
 * off `groupNavItems` — the same helper the desktop rail uses, so the gate is
 * never copied.
 *
 * The active row is plain CSS, not the rail's `layoutId` shared element. The
 * card mounts fresh on every open, so a glide would have nothing to glide from,
 * and the rail is `hidden md:flex` — display-hidden but still mounted — so a
 * shared id would compete with a laid-out-but-invisible twin.
 */
export function AdminMobileNav({
  isSuperAdmin,
  permissions,
}: {
  isSuperAdmin: boolean;
  permissions: Permission[];
}) {
  const { isOpen, toggle, close } = useDisclosure();
  const pathname = usePathname();
  const groups = groupNavItems(ADMIN_NAV_ITEMS, { isSuperAdmin, permissions });

  // Rows close the menu themselves on tap, because tapping the row you are
  // already on does not change the pathname. This effect is the other half:
  // it catches browser back/forward and the global search's deep links.
  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls="admin-mobile-menu"
        aria-label={isOpen ? "Close admin menu" : "Open admin menu"}
        className="p-2 text-ink-900"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {isOpen ? (
            // The layer is click-through; only the scrim and the card take
            // taps, so the topbar's own X stays live in the strip above them.
            <motion.div
              key="admin-mobile-menu-layer"
              className="pointer-events-none fixed inset-0 z-50"
            >
              <motion.button
                type="button"
                aria-label="Close admin menu"
                onClick={close}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FADE_QUICK}
                // Starts level with the card: the topbar's bottom edge is at
                // 72px (pt-4 + h-14) and must not be dimmed.
                className="pointer-events-auto absolute inset-x-0 bottom-0 top-[4.5rem] bg-ink-900/40 backdrop-blur-[2px]"
              />
              <motion.nav
                id="admin-mobile-menu"
                aria-label="Admin navigation"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, transition: FADE_QUICK }}
                transition={POP}
                style={{ transformOrigin: "top center" }}
                className="pointer-events-auto absolute inset-x-4 top-[4.5rem] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-3xl border border-ink-200/70 bg-white/95 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)] backdrop-blur-xl"
              >
                <div className="flex flex-col gap-5">
                  {groups.map((section) => (
                    <div key={section.group}>
                      <p className="mb-2 flex items-center gap-2 px-4 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-ink-500 before:h-px before:w-4 before:shrink-0 before:bg-brand-400/40 before:content-['']">
                        {section.label}
                      </p>
                      <ul className="flex flex-col gap-1">
                        {section.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = item.exact
                            ? pathname === item.href
                            : pathname.startsWith(item.href);
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                onClick={close}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                  "flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium transition-colors duration-(--duration-quick)",
                                  isActive
                                    ? "bg-brand-50 text-ink-900"
                                    : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                                )}
                              >
                                <Icon
                                  className={cn(
                                    "h-5 w-5 shrink-0",
                                    isActive ? "text-brand-600" : "text-ink-400",
                                  )}
                                  aria-hidden="true"
                                />
                                <span className="truncate">{item.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </motion.nav>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
```

Note the wrapper stays a `motion.div` with a `key` and **no** animation props. `AnimatePresence` only tracks direct motion children, and the scrim and card need it present to run their own exits. It carries no transform, so the `position: fixed` rule is not violated.

- [ ] **Step 2: Fix the stale `onToggle` comment in `admin-sidebar.tsx`**

At line 26, replace:

```tsx
  /** Omitted by the mobile drawer, which has nothing to collapse into. */
  onToggle?: () => void;
```

with:

```tsx
  /** Renders the collapse toggle when passed. The fixed rail is the only caller. */
  onToggle?: () => void;
```

Leave the prop optional. Making it required is a defensible follow-up but is outside this change's approved scope.

- [ ] **Step 3: Fix the stale `LayoutGroup` comment in `admin-sidebar.tsx`**

In the component doc block (lines 38-41), replace:

```
 * same exact/prefix matching NavLink uses. The `LayoutGroup` id keeps the
 * fixed rail and the mobile drawer — both mounted at once — from fighting
 * over the same layoutId.
```

with:

```
 * same exact/prefix matching NavLink uses. The `LayoutGroup` id scopes that
 * layoutId to this instance — the rail is now the only one that renders it,
 * since the mobile menu draws its own active row in CSS.
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no output. A failure here most likely means `groupNavItems`' returned shape was misnamed — the fields are `group`, `label`, `items`.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: exits 0. Watch for `react-hooks/exhaustive-deps` on the two effects; both dependency arrays above are already complete (`close` is a stable `useCallback`).

- [ ] **Step 6: Confirm the drawer's last trace is gone**

Run: `npx rg -n "AdminSidebar|admin-drawer|SPRING_PANEL" src/features/admin/components/admin-mobile-nav.tsx`
Expected: no matches, exit code 1. Any hit means part of the old drawer survived the rewrite.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/components/admin-mobile-nav.tsx src/features/admin/components/admin-sidebar.tsx
git commit -m "feat: admin mobile nav opens as a floating card

Matches the public site's mobile menu instead of sliding the full dark
rail in from the left. Rows keep their icons and the Requests/Content/
System headings, since thirteen items do not scan flat, and the card
caps its height so it scrolls internally on a phone.

Corrects two comments in admin-sidebar.tsx that described the mobile
drawer this change removes."
```

---

### Task 2: Verify in the browser at phone width

**Files:** none modified. This task is a gate, not a change.

**Interfaces:** none.

**Blocker to resolve first:** `.env.local` has no `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`, so `npm run test:e2e --project=admin` skips and no automated login exists. The admin portal is auth-gated, so **this task needs the user to either add those two vars to `.env.local` or drive the login themselves.** Ask before starting; do not report the change verified without completing this task.

- [ ] **Step 1: Start the dev server**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200` if it is already up. If `000`, start it with `npm run dev` in the background and re-check — it is often already running, so do not start a second one blindly.

- [ ] **Step 2: Open a phone-sized browser on the admin portal**

Use the Playwright MCP browser: resize to 390×844, navigate to `http://localhost:3000/admin/applications`, and sign in when the login form appears.

- [ ] **Step 3: Open the menu and screenshot**

Click the hamburger in the topbar, then take a full-page screenshot.
Expected: a white rounded card spanning `inset-x-4`, its top edge flush under the topbar with the topbar undimmed and its X icon crisp; three headings (REQUESTS / CONTENT / SYSTEM); each row an icon + label pill; the current route's row tinted amber with an amber icon.

- [ ] **Step 4: Confirm the height cap and internal scroll**

Scroll inside the card and confirm **Settings** — the last item — can be reached, and that the card's bottom edge stays above the viewport bottom rather than running off it.

Note: a viewer without every permission sees fewer rows and may not need to scroll at all. Sign in as a SuperAdmin to exercise all 13.

- [ ] **Step 5: Confirm all three dismissal paths**

1. Tap the scrim below the card → menu closes.
2. Reopen, press `Escape` → menu closes.
3. Reopen, tap a **different** module's row → route changes and the menu closes.
4. Reopen, tap the **current** module's row → menu closes (this is the case the `usePathname` effect alone would miss, which is why rows also close on click).

- [ ] **Step 6: Confirm the desktop rail is untouched**

Resize to 1280×800 and confirm the dark rail renders as before, its collapse toggle works, and the active-row indicator still glides between links.

- [ ] **Step 7: Report**

Attach the phone-width screenshot. If any step failed, say which and stop — do not amend Task 1's commit silently; make a follow-up commit describing the fix.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| White card, public palette | 1 / Step 1 (`bg-white/95`, `rounded-3xl`, `border-ink-200/70`) |
| `POP` in, `FADE_QUICK` out, `y`/`scale` entrance | 1 / Step 1 |
| Pinned `top-[4.5rem]`, `inset-x-4` | 1 / Step 1 |
| Height cap + internal scroll | 1 / Step 1; verified 2 / Step 4 |
| Rows from `groupNavItems`, icons + 3 headings | 1 / Step 1 |
| Active row plain CSS, no `layoutId` | 1 / Step 1 |
| Scrim starting below the topbar, click-through layer | 1 / Step 1; verified 2 / Step 3 |
| Escape, scrim-tap, close-on-navigate | 1 / Step 1; verified 2 / Step 5 |
| Two stale `admin-sidebar.tsx` comments | 1 / Steps 2-3 |
| `collapsed` stays required, rail untouched | 1 (no prop edits); verified 2 / Step 6 |
| Non-goal: `AdminTopBar` untouched | Confirmed — props unchanged, so no edit is needed |
| Verification at 390×844 | Task 2 |

No gaps.

**Placeholder scan:** none. Every code step carries complete code; every command step carries the exact command and expected result.

**Type consistency:** `groupNavItems` is called with the same `{ isSuperAdmin, permissions }` shape the sidebar uses; `section.group` / `section.label` / `section.items` and `item.icon` / `item.exact` / `item.href` / `item.label` match `admin-sidebar.tsx`'s existing usage. `AdminMobileNav`'s prop type is unchanged, so `AdminTopBar`'s call site still compiles.

**Deviation from the skill's TDD default:** deliberate, and recorded in Global Constraints — this repo has no component test layer by design, and the pure helper this leans on is already unit-tested.
