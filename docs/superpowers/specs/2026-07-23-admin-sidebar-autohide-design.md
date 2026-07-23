# Admin sidebar: hover-peek autohide + edge-mounted collapse toggle

**Date:** 2026-07-23
**Scope:** `src/features/admin/components/admin-sidebar.tsx`, `src/features/admin/components/admin-shell.tsx`
**Status:** design approved

## Problem

The admin rail has two states — a 256px labelled rail and a 72px icon rail — toggled by a
button parked in the header row beside the seal. Collapsed, the rail is efficient but mute:
reaching a labelled nav item costs a click to expand, a click to navigate and a click to
collapse again. The toggle itself also reads as a header control rather than as a handle on
the rail.

Two changes: the collapsed rail should **peek open on hover** and slide back when the pointer
leaves, and the toggle should sit **on the rail's right edge** rather than inside its header.

## Design

### 1. State model

Two concepts, deliberately kept separate:

| | Owner | Persisted | Drives |
| --- | --- | --- | --- |
| `collapsed` (pinned) | `AdminShell` | `sf-admin-sidebar` cookie | rail width **and** the main column's `md:ml-18` / `md:ml-64` |
| `peeked` (transient) | `AdminSidebar` | never | rail width only |

`AdminSidebar` derives `const expanded = !collapsed || peeked`. Every presentational branch
inside it — labels vs. `sr-only`, group headings vs. hairline rules, seal size, header
padding, `Tooltip`-wrapped rows vs. bare rows — switches on `expanded`.

**The toggle button keeps switching on `collapsed`, not `expanded`.** Its job is still
"pin / unpin", so during a peek it must still read "Expand sidebar" — the sidebar is
temporarily wide, but it is not pinned. An icon that flipped mid-peek would promise a
collapse that has nothing to collapse.

Peek state lives in `AdminSidebar` rather than in `AdminShell` because the aside is
`position: fixed`: its width affects nothing outside itself. The shell's margin stays bound
to `collapsed` alone, so **no page content reflows during a peek**. Hovering while pinned
open does nothing.

Peek is ephemeral by definition and must never write the cookie. A peek is a glance, not a
preference.

### 2. Peek interaction

- **Open:** `onMouseEnter` on the aside, with no delay. Also on `onFocus` — React's focus
  event bubbles, so tabbing into the rail expands it rather than making a keyboard user tab
  blind through thirteen icon-only links.
- **Close:** `onMouseLeave` behind a ~150ms grace timer, cleared on re-entry, so clipping the
  edge does not flicker. Also `onBlur` when `relatedTarget` is outside the aside
  (`event.currentTarget.contains(...)` guard, or focus moving between two links would close
  it), and `Escape` while peeked.
- The timer must be cleared on unmount.
- The overhanging toggle is a DOM child of the aside, so moving the pointer onto it never
  fires `mouseleave`. There is no dead gap between rail and handle to engineer around.
- Clicking a nav link does not force-close the peek. The pointer is still over the rail;
  pulling the panel out from under it is jarring. It closes on leave like anything else.
- Touch is a non-issue: the rail is `hidden md:flex` and the small-screen portal
  (`AdminMobileNav`) is a separate component that does not use `AdminSidebar` at all.

### 3. Layering

The existing stack is rail `z-30` → top bar `z-40` → drawer `z-50` → toast `z-60` →
tooltip / confirm dialog / row actions `z-70`.

A peeked panel spans 0–256px, while the top bar's blurred card begins around 104px when the
rail is collapsed. At `z-30` the bar would paint over the peeked panel. **The rail therefore
takes `z-45` while peeked and returns to `z-30` at rest** — above the top bar, still below an
open drawer. (A drawer's scrim swallows pointer events anyway, so a peek cannot start while
one is open.) If the bare `z-45` utility does not resolve under this Tailwind v4 setup, fall
back to `z-[45]` — confirm in the browser, not by assumption.

### 4. The toggle button

A ~28px circular tab, `absolute -right-3.5 top-11 -translate-y-1/2` on the aside: centred on
the right border, vertically aligned with the seal row (`py-6` + half of the 40px seal ≈
44px). Ink-950 fill with the rail's own `border-white/10` so it reads as part of the edge,
brand-tinted on hover, existing `Tooltip` and `aria-label` / `aria-expanded` retained.

This needs one structural change. The aside currently carries
`overflow-y-auto overflow-x-hidden`, which would guillotine anything overhanging its right
edge. **The scroll moves one level inward:**

- the `aside` keeps `h-screen`, the width classes, border, background, shadow and `relative`,
  and becomes the positioning context for the toggle — with no overflow of its own;
- a new inner wrapper takes `relative flex min-h-0 flex-1 flex-col overflow-y-auto
  overflow-x-hidden py-6` and holds the blur glow, the header block and the `nav` exactly as
  they are today. (`min-h-0 flex-1`, not `h-full`: as a flex child it must be allowed to
  shrink below its content height or it will not scroll.)

The glow stays inside that wrapper so it is still clipped, and it needs the wrapper to be
`relative` for its `-right-24 -top-24` offsets to anchor as they do now. Scroll behaviour is
unchanged.

### 5. Motion

None. This is a width change, which the aside's existing
`transition-[width] duration-200 ease-out-soft` already animates; add
`motion-reduce:transition-none`. The `layoutId` active-nav indicator, `LayoutGroup` and
`MotionConfig` are untouched. Per the repo's rule, Motion is for what CSS cannot do, and CSS
can do this. A peek must not be built on `AnimatePresence`: unmounting the panel would drop
the shared-element indicator and re-run the mount stagger on every hover.

### 6. Testing

No pure logic is added — `src/lib/admin-nav.ts` and its unit tests are untouched — so there
is no new Vitest coverage to write. Verified in the browser via `.claude/skills/verify/SKILL.md`:

1. Collapsed rail peeks open on hover and slides back on leave.
2. Pinned-open rail ignores hover.
3. The peeked panel paints **over** the top bar, not under it.
4. A wide table (the audit log's `min-w-160`) does not reflow or pan during a peek.
5. Tab from the top bar into the rail expands it; `Escape` dismisses; focus moving between
   two nav links does not.
6. The toggle sits on the border, is not clipped, and pins / unpins.
7. The `sf-admin-sidebar` cookie survives a reload and a peek never changes it.

## Out of scope

- `AdminMobileNav` — separate component, separate model, unchanged.
- Any change to the nav gate (`canSeeNavItem` / `visibleNavItems` / `firstPermittedPath`).
- A user-facing setting for the peek delay.
