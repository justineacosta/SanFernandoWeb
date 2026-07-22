# Admin mobile nav as a floating card — design

**Date:** 2026-07-23
**Scope:** `src/features/admin/components/admin-mobile-nav.tsx`, with stale-comment
corrections in `src/features/admin/components/admin-sidebar.tsx`.

## Problem

On small screens the admin portal opens its navigation as a full-height dark rail that
slides in from the left behind a scrim — `AdminMobileNav` simply renders `AdminSidebar`
at `collapsed={false}` inside an animated wrapper. The public site opens its navigation as
a floating white card that drops under the header, with rounded pill rows. Two mobile
menus, two different mental models, on one site.

The admin menu should adopt the public menu's shape.

## Reference

`src/components/navigation/mobile-nav.tsx` is the model: a `fixed inset-x-4 top-20` card,
`rounded-3xl border-ink-200/70 bg-white/95 backdrop-blur-xl` with a deep soft shadow,
entering on `POP` from `{ opacity: 0, y: -8, scale: 0.98 }` and leaving on `FADE_QUICK`,
holding `rounded-full` pill rows.

It cannot be reused as-is. It maps over the flat `NAV_ITEMS` constant and renders text-only
`NavLink`s; the admin menu needs permission-gated, grouped, icon-bearing rows. So
`AdminMobileNav` grows its own markup in the same visual language rather than importing
`MobileNav`.

## Decisions

| Question | Decision |
|---|---|
| Card palette | White, like the public card — not the rail's `ink-950`. It sits under an already-white topbar, and one site should read as one site. |
| Row density | Keep the Lucide icon per row **and** the Requests / Content / System headings. Thirteen items do not scan as a flat list — the reason the rail groups them in the first place. |
| Dismissal | Keep a scrim, plus tap-outside, Escape, and close-on-navigate. A card holding 13 rows covers most of a phone screen; the public menu's no-scrim treatment only works because it is short. |

## Design

### Card

`AdminMobileNav` stops rendering `AdminSidebar`. The breakpoint stays `md:hidden` and the
burger↔X toggle button in `AdminTopBar` is unchanged.

The card is pinned just under the topbar. `AdminTopBar` is `sticky top-0 pt-4` around an
`h-14` bar, so its bottom edge sits at 72px: the card takes `top-[4.5rem]` (72px) and
`inset-x-4`, matching the topbar's own `px-4` gutter.

Thirteen items plus three headings overflow a phone, so the card caps its height:
`max-h-[calc(100dvh-6rem)] overflow-y-auto`. This is the one place the card must depart
from the public menu, which never had enough items to need it.

### Rows

Rows come from `groupNavItems(ADMIN_NAV_ITEMS, { isSuperAdmin, permissions })` — the same
helper the rail uses, so permission gating and grouping come free and there is no second
copy of the gate.

- Group heading: the rail's small uppercase amber-ruled label, recoloured for a light card
  (`text-ink-500`, the `before:` hairline staying `bg-brand-400/40`).
- Row: `flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium`, icon then
  label. Rest `text-ink-600`, hover `bg-ink-50 text-ink-900`.
- Active: `bg-brand-50 text-ink-900` with the icon in `text-brand-600`. Active matching
  repeats the rail's rule — `item.exact ? pathname === item.href : pathname.startsWith(item.href)`.

Active state is **plain CSS, not the rail's `layoutId` shared element.** The card mounts
fresh on every open, so a shared-element glide has nothing to glide from; and the rail is
`hidden md:flex` — display-hidden but still mounted — so a shared `layoutId` would be
competing with a laid-out-but-invisible twin.

### Scrim and dismissal

The scrim fades in on `FADE_QUICK` but starts **below the topbar**, at the same
`top-[4.5rem]` as the card — one pixel higher and it would dim the topbar's own bottom
edge. The header stays crisp and the X stays live and clickable. The animated wrapper is
`pointer-events-none` with `pointer-events-auto` on the scrim and the card, so the wrapper
never swallows taps in the strip it does not paint.

Three ways out:

1. Tap the scrim (a `<button>` with an accessible label, as today).
2. Escape — a `keydown` listener attached only while open.
3. Navigate — a `usePathname` effect that closes on route change. The public menu gets this
   from `NavLink`'s `onNavigate`; grouped plain `Link`s are cleaner closed by route change.

### Stale comments in `admin-sidebar.tsx`

Two comments describe a relationship that this change ends, and must be corrected in the
same commit:

- The `onToggle` prop's *"Omitted by the mobile drawer, which has nothing to collapse into."*
  — there is no longer a mobile consumer; the rail is the only caller and always passes it.
- The `LayoutGroup` note, *"keeps the fixed rail and the mobile drawer — both mounted at
  once — from fighting over the same layoutId."* — the drawer is gone. The `useId` group
  can stay (it is harmless and correct), but its justification must be rewritten to reflect
  that the rail is now the sole instance.

The `collapsed` prop stays required — the rail still needs it.

## Non-goals

- The desktop rail is untouched.
- `AdminTopBar` is untouched, including the burger button's current plain-icon styling.
- The public `MobileNav` is untouched.
- No shared abstraction is extracted between the two menus. They share a visual language,
  not a data shape — one is a flat constant of text links, the other is a permission-gated
  grouped table with icons. Extracting a common component would mean parameterising away
  almost everything that differs.

## Verification

Playwright at 390×844 against `/admin/applications` with an admin session
(`E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`), driven ad hoc per `.claude/skills/verify/SKILL.md`:

1. Open the menu; screenshot. The card clears the topbar and does not cover the X.

2. Scroll inside the card and reach **Settings** — confirms the height cap and internal scroll.
3. Close via scrim tap, via Escape, and via tapping a nav row (route changes, menu closes).
4. `npm run typecheck` and `npm run lint` clean.

---

## Implementation note (appended 2026-07-23, after the change shipped)

The design above says the scrim and card render as a `fixed inset-0` layer. **They must
be portalled to `document.body` instead**, and the first implementation was visibly wrong
until they were.

`AdminMobileNav` renders inside `AdminTopBar`'s inner bar, which carries `backdrop-blur-md`.
**`backdrop-filter` establishes a containing block for fixed-position descendants** — the
same effect CLAUDE.md already records for `transform`, and the reason the route templates
animate opacity only. Rendered in place, `fixed inset-0` therefore resolved to the *bar's*
box rather than the viewport, so:

- the card measured `inset-x-4` from the bar's padding edge, landing ~45px in on a 390px
  screen instead of 16px;
- the scrim's `bottom-0` was the bar's bottom, collapsing it into an invisible strip.

The old slide-in drawer had the same `fixed inset-0` structure and so carried the same
latent bug; a left-anchored full-height rail simply hid it.

The fix follows `RowActions`' existing escape hatch — `createPortal(..., document.body)`.
Two consequences worth keeping:

- The portalled layer must repeat `md:hidden`. It is no longer inside the wrapper that
  carried it, so resizing to desktop with the menu open would otherwise strand it.
- The portal is gated on a `useSyncExternalStore` hydration read, not `setState` in an
  effect — `react-hooks/set-state-in-effect` rejects the latter. `AnimatePresence` lives
  inside the portal and stays mounted across the close, or the exit animation never runs.

Verified at 390×844 and 390×667: card top flush at the bar's 72px edge, `inset-x-4`,
scrim `ink-900/40` spanning to the viewport bottom, internal scroll reaching Settings, and
all four dismissal paths (scrim, Escape, navigating elsewhere, tapping the current row).
