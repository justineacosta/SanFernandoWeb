# Admin login: split-screen reskin

**Date:** 2026-07-31
**Scope:** `src/app/admin/login/page.tsx`, `src/features/admin/components/login-form.tsx`
**Status:** design approved

## Problem

The current login page (`src/app/admin/login/page.tsx`) is a single centered card on a dark
background — seal, eyebrow, wordmark, then the form. Justine wants a more polished, modern
look modeled on a reference split-screen login (mcartly.vercel.app/login: dark brand panel on
the left with a big wordmark/tagline/feature list and a giant watermark, plain white form
panel on the right with "Welcome back", email/password, remember-me + forgot-password row, a
pill CTA, social login and a sign-up line) — same amber+ink theme and colors, not a copy of
CartLy's navy/commerce content.

The reference has three affordances this codebase doesn't support: Google OAuth, public
sign-up, and a working password-reset flow. Building password reset for real (request page +
Resend email + token page + Supabase call) is out of scope for a page reskin.

## Design

### Layout split

- **Below `md` (768px): unchanged.** The current dark-background, centered-floating-card
  layout stays exactly as it is today, byte-for-byte where possible. This is a deliberate
  scope cut — it means zero mobile regression risk and no new responsive logic to get wrong.
- **At `md` and up:** a full-viewport two-pane layout, no page scroll. Left pane ~42% width
  (`md:w-[42%]` or similar), right pane fills the remainder.

`AdminLoginPage` therefore renders two sibling trees gated by Tailwind responsive classes
(`hidden md:flex` / `md:hidden`) rather than one shared markup tree reflowed by breakpoint —
matching the "just don't touch mobile" goal above.

### Left panel (desktop only)

- Background `ink-950`. Two decorative layers, both `aria-hidden`:
  - The existing soft `bg-brand-500/15 blur-3xl` glow (reused from today's page, repositioned
    to sit in this pane).
  - A subtle dot-grid texture: a small inline `backgroundImage` radial-gradient pattern
    (`radial-gradient(circle, rgb(255 255 255 / 0.08) 1px, transparent 1px)`,
    `backgroundSize: 24px 24px`), page-local — not a new global CSS utility, since it's a
    one-off decoration.
  - `SITE.sealImage` rendered oversized (e.g. 420px) and faded (`opacity-[0.06]` or similar),
    bleeding off the bottom-left corner via negative positioning — the watermark, standing in
    for the reference's giant background typography but using the barangay's own mark instead
    of invented text.
- Content, top to bottom, `flex flex-col justify-between h-full` so the feature list anchors
  to the bottom the way the reference's does:
  - Small seal (40px) + `<Eyebrow tone="dark">Barangay Portal</Eyebrow>`.
  - `font-display text-4xl` two-line wordmark: "San" / `<BrandStroke>Fernando</BrandStroke>`.
  - One-line tagline: "The staff portal for managing resident requests, transparency
    records, and community services."
  - Three feature rows (icon + bold label + one-line description), each grounded in the
    portal's real nav groups (`src/lib/admin-nav.ts`'s Requests/Content/System grouping) —
    not invented marketing copy:
    - **Requests** — Applications, appointments, complaints & assistance in one queue.
    - **Content** — News, notices, events & transparency records.
    - **System** — Users, permissions & settings.

### Right panel

- White / `ink-50` background, form column `max-w-sm`, centered both axes.
- `font-display text-3xl font-semibold text-ink-900` "Welcome back", then
  `text-sm text-ink-500` "Sign in to manage barangay services."
- The existing `reason=timeout` banner slot renders above the form, content unchanged.
- Email + password fields: same markup/classes as today (pill inputs, existing
  `PasswordInput`) — no restyle, so nothing shared with Settings/Team's password fields
  changes.
- New row between password and submit: `Remember me` (left) + `Forgot password?` (right).
- `Button variant="primary" size="lg" className="w-full"` "Sign in" + trailing
  `ArrowRight` icon (`lucide-react`), keeping the existing `isPending` label swap.
- No Google button, no sign-up line (per Justine's answer — dropped, not hidden/placeholder).

### Remember me / Forgot password — honest, not dead, treatment

Neither has a backing feature today, and this codebase deliberately avoids dead links/no-op
controls (see CLAUDE.md: dead FOI Guide/More Statistics CTAs were removed rather than left
unwired). Both get a treatment that tells the truth instead of pretending to work:

- **Forgot password?** — a `<button type="button">`, not a link to a nonexistent route. On
  click it reveals an inline message via the existing `InlineAlert` pattern: "Contact a
  SuperAdmin to reset your password." No route, no 404.
- **Remember me** — rendered `checked disabled` with a `title`/tooltip: "Sessions stay active
  for 30 minutes of inactivity." This is a factual statement about the existing idle-timeout
  security model (`src/lib/session-activity.ts`, the `sf-activity` cookie), not a working
  toggle — the app has no second "remembered" session lifetime to wire this to without adding
  a second dimension to a session model that CLAUDE.md documents as deliberately single-signal.
  Approved by Justine as-is; if it should become a live no-op checkbox instead, that's a
  one-line change (drop `disabled`).

### Testing

Purely presentational — no new pure logic, no new Server Action behavior (the `signIn` action,
its rate limiting, and the timeout banner are untouched). Verified in the browser per
`.claude/skills/verify/SKILL.md`, not with new Vitest/Playwright coverage:

1. Desktop (`md`+): split-screen renders, left panel content and watermark visible, right
   panel form functions (submit, wrong-password error, timeout banner via `?reason=timeout`).
2. Mobile (< `md`): page is pixel-identical to today's centered-card layout.
3. Forgot-password button reveals the inline message and doesn't navigate.
4. Remember-me checkbox shows as checked/disabled with its tooltip.
5. Tab order and focus states still reach every control in a sane order on both layouts.
6. No layout shift/scroll on common desktop widths (1280px, 1440px, 1920px) — the design's
   `h-screen`/no-scroll goal actually holds.

## Out of scope

- Building a real password-reset flow (request page, Resend email, token page).
- Any change to `signIn`/`signOut`/`signOutIdle`, rate limiting, or the idle-timeout model.
- Any change to `PasswordInput`, `Button`, or other shared primitives beyond using them as-is.
- Google OAuth, public sign-up.
