# Admin Login Split-Screen Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin `/admin/login` into a split-screen layout (dark brand panel + white form panel) at `md`+ widths, while leaving the mobile layout byte-for-byte unchanged, per `docs/superpowers/specs/2026-07-31-login-split-screen-design.md`.

**Architecture:** Two files change. `login-form.tsx` gains a Remember-me/Forgot-password row and an arrow icon on the submit button — a self-contained change verifiable at any viewport. `page.tsx` is restructured into two responsive sibling trees (`md:hidden` mobile tree = today's markup unchanged, `hidden md:flex` desktop tree = the new two-pane layout), both rendering the same `<LoginForm />`.

**Tech Stack:** Next.js 16 App Router (Server Component page), React 19 client component form, Tailwind v4, `lucide-react` icons, existing UI primitives (`Button`, `Eyebrow`, `BrandStroke`, `InlineAlert`, `Checkbox`, `PasswordInput`).

## Global Constraints

- Amber+ink theme only — `brand-*`/`ink-*` Tailwind tokens, no blue, no `brand-900` (doesn't exist; highest is `brand-800`).
- No Google OAuth, no public sign-up link (dropped per product decision, not hidden/placeholder).
- No dead links/no-op controls presented as if they work: "Forgot password?" must not link to a nonexistent route; "Remember me" must not silently pretend to control something the session model doesn't support.
- Do not modify `signIn`/`signOut`/`signOutIdle` (`src/features/admin/actions/auth.ts`), rate limiting, or the idle-timeout model (`src/lib/session-activity.ts`).
- Do not modify shared primitives (`Button`, `PasswordInput`, `InlineAlert`, `Checkbox`, `Eyebrow`, `BrandStroke`) — use them as they exist today.
- Mobile (< `md` / 768px) must render identically to the current page — this is a scope cut, not a target for redesign.
- This is a purely presentational change: no new Server Action behavior, no new DB reads/writes, no new Vitest unit-test surface (no new pure logic is introduced).

---

## File Structure

- **Modify:** `src/features/admin/components/login-form.tsx` — add the Remember-me/Forgot-password row and the submit button's arrow icon. No prop/signature changes; still exported as `LoginForm` with no props.
- **Modify:** `src/app/admin/login/page.tsx` — restructure into the mobile/desktop responsive split described above. `AdminLoginPage`'s own signature (`searchParams: Promise<{ reason?: string }>`) is unchanged.

No new files. No test files — this task has no new pure logic to unit test, and Playwright coverage is explicitly out of scope for this change (verify manually in the browser per `.claude/skills/verify/SKILL.md`).

---

### Task 1: Login form — Remember-me / Forgot-password row + submit button icon

**Files:**
- Modify: `src/features/admin/components/login-form.tsx` (full file, currently 55 lines)

**Interfaces:**
- Consumes: `Button` (`@/components/ui/button`), `InlineAlert` (`@/components/ui/inline-alert`), `PasswordInput` (`@/components/ui/password-input`), `Checkbox` (`@/components/ui/form`), `signIn`/`AuthFormState` (`@/features/admin/actions/auth`) — all pre-existing, no changes to any of them.
- Produces: `LoginForm` (no props, unchanged export) — consumed by Task 2's `page.tsx` exactly as it is consumed today.

- [ ] **Step 1: Replace the full contents of `login-form.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn, type AuthFormState } from "@/features/admin/actions/auth";

const initialState: AuthFormState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  // `useActionState` gives no setter to clear `state.error` directly, so a
  // manual dismiss is tracked by comparing object identity, not the message
  // text — a second failed attempt produces a new `state` even if the copy
  // reads the same, and that new state must still show.
  const [dismissedState, setDismissedState] = useState<AuthFormState | null>(null);
  const visibleError = state.error && state !== dismissedState ? state.error : null;

  // "Forgot password?" has no reset flow to link to yet — this reveals an
  // honest note instead of a dead link. See the 2026-07-31 login design spec.
  const [showForgotNote, setShowForgotNote] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="login-email" className="mb-1 block text-sm font-semibold text-ink-700">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-1 block text-sm font-semibold text-ink-700">
          Password
        </label>
        <PasswordInput
          id="login-password"
          name="password"
          autoComplete="current-password"
          required
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <label
          className="flex items-center gap-2 text-ink-600"
          title="Sessions stay active for 30 minutes of inactivity."
        >
          <Checkbox checked disabled className="h-4 w-4 accent-brand-500" />
          Remember me
        </label>
        <button
          type="button"
          onClick={() => setShowForgotNote((value) => !value)}
          className="font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          Forgot password?
        </button>
      </div>
      {showForgotNote ? (
        <InlineAlert
          message="Contact a SuperAdmin to reset your password."
          onDismiss={() => setShowForgotNote(false)}
          className="text-ink-600"
        />
      ) : null}
      {visibleError ? (
        <InlineAlert message={visibleError} onDismiss={() => setDismissedState(state)} />
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full gap-2" disabled={isPending}>
        {isPending ? (
          "Signing in…"
        ) : (
          <>
            Sign in
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass with no errors.

- [ ] **Step 3: Manual verification in the browser**

Start `npm run dev` if it isn't already running, then visit `http://localhost:3000/admin/login`:
1. "Remember me" renders checked, and attempting to click it does nothing (disabled) — hovering shows the tooltip "Sessions stay active for 30 minutes of inactivity."
2. Clicking "Forgot password?" reveals "Contact a SuperAdmin to reset your password." in neutral (not red) text; clicking it again, or its own dismiss (×), hides it.
3. Submitting valid credentials still signs in; submitting bad credentials still shows the existing red "Incorrect email or password." banner via the unchanged `visibleError` path.
4. The submit button reads "Sign in" with a trailing arrow icon at rest, and "Signing in…" (no icon) while pending.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/components/login-form.tsx
git commit -m "feat: add remember-me/forgot-password row and arrow icon to login form"
```

---

### Task 2: Login page — responsive split-screen shell

**Files:**
- Modify: `src/app/admin/login/page.tsx` (full file, currently 51 lines)

**Interfaces:**
- Consumes: `LoginForm` (Task 1, no props), `SITE` (`@/constants/site`, `SITE.name`, `SITE.sealImage`), `BrandStroke`, `Eyebrow` (`tone?: "light" | "dark"`, both pre-existing).
- Produces: `AdminLoginPage` default export, signature unchanged (`{ searchParams: Promise<{ reason?: string }> }`) — nothing downstream depends on this beyond Next's routing.

- [ ] **Step 1: Replace the full contents of `page.tsx`**

```tsx
import Image from "next/image";
import type { Metadata } from "next";
import { ClipboardList, Newspaper, Settings } from "lucide-react";
import { SITE } from "@/constants/site";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Eyebrow } from "@/components/ui/eyebrow";
import { LoginForm } from "@/features/admin/components/login-form";

export const metadata: Metadata = { title: "Log in" };

const PORTAL_FEATURES = [
  {
    icon: ClipboardList,
    label: "Requests",
    description: "Applications, appointments, complaints & assistance in one queue.",
  },
  {
    icon: Newspaper,
    label: "Content",
    description: "News, notices, events & transparency records.",
  },
  {
    icon: Settings,
    label: "System",
    description: "Users, permissions & settings.",
  },
] as const;

function TimeoutBanner({ reason }: { reason?: string }) {
  if (reason !== "timeout") return null;
  return (
    <p role="status" className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink-700">
      You were signed out because of inactivity. Please sign in again.
    </p>
  );
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <main className="min-h-screen md:h-screen md:overflow-hidden">
      {/* Mobile (< md): unchanged centered-card layout. */}
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4 md:hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl"
        />
        <div className="relative w-full max-w-sm rounded-3xl border border-ink-200/70 bg-white p-8 shadow-floating">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Image
              src={SITE.sealImage}
              alt={`${SITE.name} seal`}
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover"
            />
            <div>
              <Eyebrow className="mb-2 justify-center">Barangay Portal</Eyebrow>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">
                <BrandStroke>San Fernando</BrandStroke>
              </h1>
              <p className="mt-2 text-sm text-ink-500">Sign in to continue</p>
            </div>
          </div>
          <TimeoutBanner reason={reason} />
          <LoginForm />
        </div>
      </div>

      {/* Desktop (md+): split-screen layout. */}
      <div className="hidden md:flex md:h-screen">
        <div className="relative flex w-[42%] shrink-0 flex-col justify-between overflow-hidden bg-ink-950 p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 size-[36rem] rounded-full bg-brand-500/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <Image
            src={SITE.sealImage}
            alt=""
            aria-hidden="true"
            width={480}
            height={480}
            className="pointer-events-none absolute -bottom-24 -left-24 h-[28rem] w-[28rem] object-contain opacity-[0.06]"
          />

          <div className="relative">
            <div className="mb-8 flex items-center gap-3">
              <Image
                src={SITE.sealImage}
                alt={`${SITE.name} seal`}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
              <Eyebrow tone="dark">Barangay Portal</Eyebrow>
            </div>
            <h1 className="font-display text-4xl font-semibold leading-tight text-white">
              San
              <br />
              <BrandStroke>Fernando</BrandStroke>
            </h1>
            <p className="mt-4 max-w-xs text-sm text-ink-300">
              The staff portal for managing resident requests, transparency records, and
              community services.
            </p>
          </div>

          <ul className="relative flex flex-col gap-6">
            {PORTAL_FEATURES.map(({ icon: Icon, label, description }) => (
              <li key={label} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="text-sm text-ink-400">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-y-auto bg-ink-50 px-8">
          <div className="w-full max-w-sm">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-ink-500">Sign in to manage barangay services.</p>
            <div className="mt-8">
              <TimeoutBanner reason={reason} />
              <LoginForm />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass with no errors. (Watch specifically for an unused-import lint failure if any icon name doesn't exist in the pinned `lucide-react@^0.577.0` — `ClipboardList`, `Newspaper`, and `Settings` all do.)

- [ ] **Step 3: Manual verification in the browser**

Visit `http://localhost:3000/admin/login` (dev server should already be running from Task 1):
1. At a desktop width (e.g. 1440px): left panel shows the dark background, dot-grid texture, faded oversized seal watermark bleeding off the bottom-left, small seal + "Barangay Portal" eyebrow, the "San / Fernando" wordmark with the amber underline on "Fernando", the tagline, and the three feature rows (Requests/Content/System) anchored toward the bottom. Right panel shows "Welcome back" + subtext + the form from Task 1, vertically centered, no page-level scrollbar.
2. Resize down to a mobile width (e.g. 390px): the page must look pixel-identical to how it looked before this task — dark background, centered floating white card, seal, eyebrow, "San Fernando" wordmark, "Sign in to continue" subtext, then the form.
3. Load `http://localhost:3000/admin/login?reason=timeout` at both widths: the amber timeout banner appears above the form in both layouts.
4. Shrink the browser height at desktop width (e.g. to ~700px): the right (form) panel scrolls internally if needed; nothing is clipped or overlaps.
5. Tab through the page at desktop width: focus order is seal/eyebrow area (not focusable) → email → password → remember-me checkbox (focusable but disabled, so it's skipped) → forgot-password button → sign-in button, all with visible focus rings.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/login/page.tsx
git commit -m "feat: split-screen layout for admin login page"
```

---

## Self-Review Notes

- **Spec coverage:** mobile-unchanged (Task 2 Step 1 preserves the exact prior markup under `md:hidden`), left-panel decoration/copy/feature list (Task 2), right-panel heading/subtext/form (Task 2), remember-me/forgot-password honest treatment (Task 1), arrow-icon CTA (Task 1), no-Google/no-signup (neither task adds them) — all covered.
- **Placeholder scan:** no TBDs; every step ships literal code.
- **Type consistency:** `LoginForm` has no props in either task; `Eyebrow`'s `tone` prop (`"light" | "dark"`) and `Checkbox`'s pass-through `React.InputHTMLAttributes` are used as they're already typed — no new types introduced.

## Out of scope (unchanged from the design spec)

- Building a real password-reset flow.
- Any change to `signIn`/`signOut`/`signOutIdle`, rate limiting, or the idle-timeout model.
- Any change to shared primitives (`Button`, `PasswordInput`, `InlineAlert`, `Checkbox`, `Eyebrow`, `BrandStroke`).
- Google OAuth, public sign-up.
