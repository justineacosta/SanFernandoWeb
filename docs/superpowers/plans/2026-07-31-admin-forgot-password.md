# Admin Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin/staff self-serve a forgotten password from `/admin/login`, replacing the current "Contact SuperAdmin" toast with a real email-link reset flow.

**Architecture:** A public "request a link" page + Server Action generates a Supabase Auth recovery link via the service-role admin client and emails it through the existing Resend pipeline; a public "set new password" page + Server Action exchanges the emailed link's `code` for a session server-side (`exchangeCodeForSession`) and updates the password on it, then immediately signs that session back out. No new database table, no new browser-side Supabase client — everything stays server-driven, matching how the rest of this app's auth works.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, `@supabase/supabase-js` 2.111.0 (service-role admin client), `@supabase/ssr` 0.12.4 (cookie-bound server client), Zod v4, Resend + `react-email` (existing `src/lib/email.ts` / `src/emails/`), Cloudflare Turnstile (existing `src/lib/turnstile.ts` / `src/components/shared/turnstile-widget.tsx`), Tailwind v4.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-31-admin-forgot-password-design.md` — read it first if anything below is ambiguous.
- **Anti-enumeration is non-negotiable**: the request-reset action must return the exact same response (`{ error: null, submitted: true }`) whether the email matches a real active account, an inactive/archived one, or nothing at all — and whether or not the rate limit was hit. Never branch the *visible* response on account existence.
- Path alias `@/*` → `src/*`.
- New password minimum length: 10 characters (matches `changeMyPassword` in `src/features/admin/actions/account.ts:102`).
- Reuse the existing `AuditActionType` value `"password_reset"` (already defined in `src/types/index.ts:720`, already used by `changeMyPassword`) for both new audit entries — do not add a new enum value or migration.
- No new Supabase migration, no new table.
- Every public Server Action in this codebase verifies Turnstile first, then rate-limits, then Zod-validates (cheapest rejection first) — follow this order for `requestPasswordReset`.
- Follow this codebase's error-handling convention: every `startTransition`/`useTransition` call site wraps its action call in `try { ... } catch { ... }` (see any file in `src/features/admin/components/` for the pattern) — but since both new forms use `useActionState` (matching `login-form.tsx`, not the `useTransition` pattern), this constraint doesn't apply to them directly; `useActionState`'s action itself never throws (it always returns a state object), matching `signIn`'s existing shape.
- `zod` is v4, not v3.
- **Every session that changes code must update `CLAUDE.md` in the same session** — Task 6 below does this; don't skip it.

---

## Task 1: Extract shared `AuthLayout` from the login page

Pure refactor — no new behavior. Moves the split-screen chrome (desktop brand panel + mobile card, shared background photo/scrim) out of `src/app/admin/login/page.tsx` into a reusable component, so the forgot-password and reset-password pages (Tasks 2-3) don't triplicate it.

**Files:**
- Create: `src/features/admin/components/auth-layout.tsx`
- Modify: `src/app/admin/login/page.tsx`
- Test: manual — `npm run dev`, visit `/admin/login` at both a phone-width and desktop-width viewport, confirm it renders identically to before.

**Interfaces:**
- Produces: `AuthLayout({ subtitle: string; banner?: ReactNode; children: ReactNode })` — renders the full split-screen shell (mobile card below `md`, desktop split above it), placing `subtitle` under the "San Fernando" heading in both trees, `banner` (if given) above `children`, and `children` itself in both the mobile card and the desktop form panel — exactly mirroring how `<LoginForm />` was previously written out twice in `page.tsx` (each instance gets its own `useId()`-derived ids, since both trees mount simultaneously and only one is hidden via CSS).

- [ ] **Step 1: Create `AuthLayout`**

Create `src/features/admin/components/auth-layout.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Newspaper, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { SITE } from "@/constants/site";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Eyebrow } from "@/components/ui/eyebrow";
import trickOrTreatPhoto from "@/images/loginpageImage/TrickOrTreat.jpg";

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

interface AuthLayoutProps {
  /** Shown under the "San Fernando" heading in both trees, e.g. "Sign in to continue". */
  subtitle: string;
  /** Optional status banner (timeout notice, reset-success notice) rendered above children. */
  banner?: ReactNode;
  children: ReactNode;
}

/**
 * Shared split-screen chrome for every admin auth page (login, forgot-password,
 * reset-password) — desktop split-screen at md:+ (768px), a separate centered-
 * card layout below it. Extracted from the original login page.tsx during the
 * forgot-password work (2026-07-31 design spec) so three pages don't
 * triplicate this JSX.
 *
 * `children` is interpolated in BOTH trees below (mobile card and desktop form
 * panel), which mounts it as two independent component instances — the same
 * thing the original login page did by writing `<LoginForm />` out twice.
 * Any child using `useId()` for its input ids (as `LoginForm`/`ForgotPasswordForm`/
 * `ResetPasswordForm` all do) gets two distinct ids automatically; a hardcoded
 * id would collide.
 */
export function AuthLayout({ subtitle, banner, children }: AuthLayoutProps) {
  return (
    <main className="min-h-screen md:overflow-hidden">
      {/* Mobile (< md): centered-card layout. */}
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4 md:hidden">
        <Image
          src={trickOrTreatPhoto}
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="scale-105 object-cover blur-[2px]"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ink-950/70" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl"
        />
        <div className="relative w-full max-w-sm rounded-3xl border border-ink-200/70 bg-white p-8 shadow-floating">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
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
              <p className="mt-2 text-sm text-ink-500">{subtitle}</p>
            </div>
          </div>
          {banner}
          {children}
        </div>
      </div>

      {/* Desktop (md+): split-screen layout. */}
      <div className="hidden md:flex md:min-h-screen">
        <div className="relative flex w-[55%] shrink-0 flex-col justify-between overflow-hidden bg-ink-950 p-12">
          <Image
            src={trickOrTreatPhoto}
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="(min-width: 768px) 55vw, 100vw"
            className="scale-105 object-cover blur-[2px]"
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ink-950/70" />
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
            <div className="mb-8">
              <Eyebrow tone="dark">Barangay Portal</Eyebrow>
            </div>
            <h1 className="font-display text-4xl font-semibold leading-tight text-white">
              San Fernando – &ldquo;Onse&rdquo;
              <br />
              San Nicolas, Ilocos Norte
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

        <div className="relative flex flex-1 justify-center overflow-y-auto bg-ink-50 px-8">
          <Link
            href="/"
            className="absolute bottom-8 left-8 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
          <div className="my-auto w-full max-w-sm -translate-y-10 text-center">
            <div className="mb-6 flex items-center justify-center">
              <Image
                src={SITE.sealImage}
                alt={`${SITE.name} seal`}
                width={240}
                height={240}
                className="h-60 w-60 rounded-full object-cover"
              />
            </div>
            <Eyebrow className="mb-2 justify-center">Barangay Portal</Eyebrow>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink-900">
              <BrandStroke>San Fernando</BrandStroke>
            </h2>
            <p className="mt-2 text-sm text-ink-500">{subtitle}</p>
            <div className="mt-8 text-left">
              {banner}
              {children}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Rewrite the login page to use it**

Replace the full contents of `src/app/admin/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AuthLayout } from "@/features/admin/components/auth-layout";
import { LoginForm } from "@/features/admin/components/login-form";

export const metadata: Metadata = { title: "Log in" };

function LoginStatusBanner({ reason, reset }: { reason?: string; reset?: string }) {
  if (reset === "success") {
    return (
      <p role="status" className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink-700">
        Your password has been reset. Sign in with your new password.
      </p>
    );
  }
  if (reason === "timeout") {
    return (
      <p role="status" className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink-700">
        You were signed out because of inactivity. Please sign in again.
      </p>
    );
  }
  return null;
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; reset?: string }>;
}) {
  const { reason, reset } = await searchParams;

  return (
    <AuthLayout
      subtitle="Sign in to continue"
      banner={<LoginStatusBanner reason={reason} reset={reset} />}
    >
      <LoginForm />
    </AuthLayout>
  );
}
```

(The `reset` search param and its banner aren't wired up until Task 3's `resetPassword` action redirects to `/admin/login?reset=success` — the banner code is added now so Task 1 ships the full login page in one piece, but it simply won't trigger yet.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run dev` (skip if already running), then visit `http://localhost:3000/admin/login` in a browser at both a narrow (phone) and wide (desktop) viewport.
Expected: identical to the page's appearance before this change — seal, "San Fernando" heading, "Sign in to continue", the login form, the split-screen brand panel on desktop.

Run: `npm run test:e2e -- tests/e2e/admin/login.spec.ts` (only if `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` are set in `.env.local`; otherwise this test skips itself — that's expected, not a failure).
Expected: PASS (or SKIP).

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/components/auth-layout.tsx src/app/admin/login/page.tsx
git commit -m "refactor: extract AuthLayout from the admin login page"
```

---

## Task 2: Request-reset flow (action + email template + page + form)

**Files:**
- Modify: `src/features/admin/actions/auth.ts` (add `RequestResetState`, `RESET_LIMIT`/`RESET_WINDOW_MS`, `requestPasswordReset`)
- Create: `src/emails/PasswordResetEmail.tsx`
- Create: `src/app/admin/forgot-password/page.tsx`
- Create: `src/features/admin/components/forgot-password-form.tsx`
- Test: manual (dev server) + `tests/e2e/public/forgot-password.spec.ts` (written in Task 5)

**Interfaces:**
- Consumes: `AuthFormState`-adjacent conventions already in `auth.ts` (`requestIp` from `@/lib/rate-limit`, `verifyTurnstileToken`/`TURNSTILE_FAILURE_MESSAGE` from `@/lib/turnstile`, `sendEmail` from `@/lib/email`, `EMAIL_SITE_URL` from `@/emails/site-url`, `recordActivity` from `@/lib/audit`, `createSupabaseAdminClient` from `@/lib/supabase/admin`).
- Produces: `export interface RequestResetState { error: string | null; submitted: boolean }` and `export async function requestPasswordReset(prev: RequestResetState, formData: FormData): Promise<RequestResetState>` from `src/features/admin/actions/auth.ts` — consumed by `ForgotPasswordForm` (this task) via `useActionState`. `export function PasswordResetEmail({ resetUrl }: { resetUrl: string }): ReactElement` from `src/emails/PasswordResetEmail.tsx`.

- [ ] **Step 1: Add `requestPasswordReset` to `auth.ts`**

In `src/features/admin/actions/auth.ts`, update the top-of-file imports (add `checkRateLimit`, `sendEmail`, `EMAIL_SITE_URL`, `PasswordResetEmail`):

```ts
import { checkRateLimit, isRateLimited, recordRateLimitHit, requestIp } from "@/lib/rate-limit";
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
import { sendEmail } from "@/lib/email";
import { EMAIL_SITE_URL } from "@/emails/site-url";
import { PasswordResetEmail } from "@/emails/PasswordResetEmail";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
```

(`createSupabaseAdminClient` is a new import — the existing file only imports `createSupabaseServerClient` from `@/lib/supabase/server`, which is unrelated and already present. Both `requestPasswordReset` below and `resetPassword` in Task 3 use the admin client, so this import serves both.)

Then append, after the existing `signIn` function and before `signOut`:

```ts
export interface RequestResetState {
  error: string | null;
  submitted: boolean;
}

/**
 * Same generic copy for every outcome (found, not found, inactive,
 * rate-limited) — see below. Exported so ForgotPasswordForm (Step 3) can
 * render it directly; the action itself never returns this as `error`, it
 * returns `{ error: null, submitted: true }` and the form shows this copy
 * whenever `submitted` is true.
 */
export const GENERIC_RESET_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password.";

/** Tighter than the public forms' hour-long windows, matching admin login's own caution. */
const RESET_LIMIT = 3;
const RESET_WINDOW_MS = 15 * 60 * 1000;

const resetRequestSchema = z.object({ email: z.string().email() });

/**
 * Request a password-reset link. Public, unauthenticated — anyone can submit
 * any email. ALWAYS returns the same generic response regardless of whether
 * the email matches a real, active account, or whether the rate limit was
 * hit — differing copy or timing here would let a script enumerate valid
 * staff emails. See the 2026-07-31 forgot-password design spec.
 */
export async function requestPasswordReset(
  _prev: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const ip = await requestIp();
  const turnstileToken = formData.get("turnstileToken");
  if (!(await verifyTurnstileToken(typeof turnstileToken === "string" ? turnstileToken : null, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, submitted: false };
  }

  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Enter a valid email address.", submitted: false };
  }
  const normalizedEmail = parsed.data.email.trim().toLowerCase();

  // Record-on-every-call (checkRateLimit), NOT signIn's isRateLimited/
  // recordRateLimitHit split: every request must count identically whether
  // or not the email matches a real account, or differential counting
  // itself becomes an enumeration signal. Two keys, same IP+email shape as
  // signIn's own limiter.
  const ipOk = await checkRateLimit(`reset:ip:${ip}`, RESET_LIMIT, RESET_WINDOW_MS);
  const emailOk = await checkRateLimit(`reset:email:${normalizedEmail}`, RESET_LIMIT, RESET_WINDOW_MS);
  if (!ipOk || !emailOk) {
    // Still the generic response — a distinct "too many requests" message
    // would itself confirm requests against this email were being processed.
    return { error: null, submitted: true };
  }

  // generateLink is the account-existence check, not a separate `profiles`
  // query by email: `profiles.email` isn't guaranteed to be stored in the
  // same case Supabase Auth normalizes `auth.users.email` to (createTeamUser
  // inserts whatever case the SuperAdmin typed), so looking it up by email
  // risks a false "no such account" for an existing user typed in a
  // different case. generateLink asks Supabase Auth directly and hands back
  // the matching user's id, which is then used for an exact `profiles` id
  // lookup below.
  const admin = createSupabaseAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: normalizedEmail,
    options: { redirectTo: `${EMAIL_SITE_URL}/admin/reset-password` },
  });

  if (!linkError && linkData?.user) {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, is_active, is_archived")
      .eq("id", linkData.user.id)
      .maybeSingle();

    if (profile && profile.is_active && !profile.is_archived) {
      await sendEmail({
        to: normalizedEmail,
        subject: "Reset your password — Barangay San Fernando",
        template: PasswordResetEmail({ resetUrl: linkData.properties.action_link }),
      });
      await recordActivity(
        { id: linkData.user.id, fullName: profile.full_name },
        {
          type: "password_reset",
          action: "requested a password reset",
          entityType: "account",
          entityId: linkData.user.id,
        },
      );
    }
  }

  return { error: null, submitted: true };
}
```

- [ ] **Step 2: Add the `PasswordResetEmail` template**

Create `src/emails/PasswordResetEmail.tsx`:

```tsx
import { Button, Text } from "react-email";
import { EmailLayout } from "./EmailLayout";

export interface PasswordResetEmailProps {
  resetUrl: string;
}

/**
 * resetUrl is Supabase's own generateLink() action_link — already a full,
 * absolute URL through Supabase's /auth/v1/verify endpoint (which redirects
 * to /admin/reset-password with a `code` param once clicked) — unlike
 * TicketNotice's trackHref, this is used as-is, not joined with
 * EMAIL_SITE_URL.
 */
export function PasswordResetEmail({ resetUrl }: PasswordResetEmailProps) {
  return (
    <EmailLayout previewText="Reset your Barangay San Fernando admin password">
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>Hi,</Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>
        We received a request to reset the password for your Barangay San Fernando staff
        account. Click the button below to choose a new password. This link is valid for a
        short time and can only be used once.
      </Text>
      <Button
        href={resetUrl}
        style={{
          backgroundColor: "#b45309",
          color: "#ffffff",
          padding: "10px 20px",
          borderRadius: 6,
          fontSize: 14,
          marginTop: 8,
        }}
      >
        Reset your password
      </Button>
      <Text style={{ fontSize: 13, lineHeight: 1.5, margin: "16px 0 0", color: "#6b6255" }}>
        If you didn&apos;t request this, you can safely ignore this email — your password will
        not change.
      </Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 3: Add `ForgotPasswordForm`**

Create `src/features/admin/components/forgot-password-form.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
import {
  GENERIC_RESET_MESSAGE,
  requestPasswordReset,
  type RequestResetState,
} from "@/features/admin/actions/auth";

const initialState: RequestResetState = { error: null, submitted: false };

export function ForgotPasswordForm() {
  const uid = useId();
  const emailId = `${uid}-email`;
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialState);
  // Same object-identity dismiss trick as LoginForm — useActionState gives no
  // setter to clear `state.error` directly.
  const [dismissedState, setDismissedState] = useState<RequestResetState | null>(null);
  const visibleError = state.error && state !== dismissedState ? state.error : null;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  // Turnstile tokens are single-use; reset after every completed action call
  // (success or failure). `state` changes identity on every dispatch,
  // including the initial mount (where it equals `initialState` and the
  // widget hasn't rendered yet, making this a harmless no-op).
  useEffect(() => {
    turnstileRef.current?.reset();
    setTurnstileToken(null);
  }, [state]);

  if (state.submitted) {
    return (
      <div className="text-center">
        <p className="text-sm text-ink-600">{GENERIC_RESET_MESSAGE}</p>
        <Link
          href="/admin/login"
          className="mt-6 inline-flex items-center justify-center gap-2 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-ink-500">
        Enter the email address on your staff account and we&apos;ll send you a link to reset
        your password.
      </p>
      <div>
        <label htmlFor={emailId} className="mb-1 block text-sm font-semibold text-ink-700">
          Email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      <input type="hidden" name="turnstileToken" value={turnstileToken ?? ""} />
      <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />
      {visibleError ? (
        <InlineAlert message={visibleError} onDismiss={() => setDismissedState(state)} />
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isPending}>
        {isPending ? (
          "Sending…"
        ) : (
          <>
            Send reset link
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>
      <Link
        href="/admin/login"
        className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to login
      </Link>
    </form>
  );
}
```

- [ ] **Step 4: Add the page**

Create `src/app/admin/forgot-password/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AuthLayout } from "@/features/admin/components/auth-layout";
import { ForgotPasswordForm } from "@/features/admin/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout subtitle="Reset your password">
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run dev` (skip if already running). Visit `http://localhost:3000/admin/forgot-password`, enter any email-shaped address (e.g. `test@example.com`), submit.
Expected: the page swaps to "If an account exists for that email, we've sent a link to reset your password." with a "Back to login" link. No error, no crash, regardless of whether that address is a real staff account.

If `RESEND_API_KEY`/`TURNSTILE_SECRET_KEY` are unset in `.env.local` (fine for local dev — both fail open/skip per their own documented dev behavior), confirm no exception is thrown in the terminal running `npm run dev` beyond the expected one-time warnings.

If you have a real staff account's email and `RESEND_API_KEY` configured, submit that email and confirm an email arrives with a working "Reset your password" button (don't click it yet — Task 3 builds the page it lands on).

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/actions/auth.ts src/emails/PasswordResetEmail.tsx src/app/admin/forgot-password/page.tsx src/features/admin/components/forgot-password-form.tsx
git commit -m "feat: add password-reset request flow (Turnstile + rate-limited, anti-enumeration)"
```

---

## Task 3: Reset-password flow (action + page + form)

**Files:**
- Modify: `src/features/admin/actions/auth.ts` (add `resetPassword`)
- Create: `src/app/admin/reset-password/page.tsx`
- Create: `src/features/admin/components/reset-password-form.tsx`
- Test: manual (dev server, requires clicking a real emailed link) + `tests/e2e/public/forgot-password.spec.ts`'s no-code case (Task 5)

**Interfaces:**
- Consumes: `AuthFormState` (already defined in `auth.ts`), `createSupabaseServerClient` from `@/lib/supabase/server`, `createSupabaseAdminClient` from `@/lib/supabase/admin`, `checkRateLimit`/`requestIp` from `@/lib/rate-limit`, `recordActivity` from `@/lib/audit`, `redirect` from `next/navigation` (already imported in `auth.ts`).
- Produces: `export async function resetPassword(prev: AuthFormState, formData: FormData): Promise<AuthFormState>` from `src/features/admin/actions/auth.ts` — consumed by `ResetPasswordForm` (this task) via `useActionState`.

- [ ] **Step 1: Add `resetPassword` to `auth.ts`**

Append to `src/features/admin/actions/auth.ts`, after `requestPasswordReset` (from Task 2) and before `signOut`:

```ts
/** Defense-in-depth against replay/brute-force of the (long, single-use, random) emailed code. */
const RESET_SUBMIT_LIMIT = 10;
const RESET_SUBMIT_WINDOW_MS = 15 * 60 * 1000;

const resetPasswordSchema = z
  .object({
    code: z.string().min(1),
    password: z.string().min(10, "New password needs at least 10 characters."),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

/**
 * Set a new password from an emailed recovery link. Public, unauthenticated
 * by design — the `code` itself, not a session, is the proof of identity.
 *
 * The code is exchanged for a session HERE, at submit time, never when the
 * page renders: corporate email "safe link" scanners pre-fetch every link in
 * an inbound email before the recipient opens it, which would silently burn
 * Supabase's single-use recovery code before the real user ever clicks. The
 * page (src/app/admin/reset-password/page.tsx) only ever reads the `code`
 * search param, never exchanges it.
 */
export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const ip = await requestIp();
  if (!(await checkRateLimit(`reset-submit:ip:${ip}`, RESET_SUBMIT_LIMIT, RESET_SUBMIT_WINDOW_MS))) {
    return { error: "Too many attempts. Please request a new reset link." };
  }

  const parsed = resetPasswordSchema.safeParse({
    code: formData.get("code"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(parsed.data.code);
  if (exchangeError || !data.user) {
    return { error: "This reset link has expired or already been used. Request a new one." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (updateError) {
    await supabase.auth.signOut();
    return { error: "Could not update your password. Request a new reset link and try again." };
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", data.user.id)
    .maybeSingle();

  await recordActivity(
    { id: data.user.id, fullName: profile?.full_name ?? data.user.email ?? "Unknown" },
    {
      type: "password_reset",
      action: "reset password via emailed link",
      entityType: "account",
      entityId: data.user.id,
    },
  );

  // The recovery session must not linger — sign it out before redirecting so
  // this flow never leaves the browser "logged in" as a side effect. It also
  // never touches the custom `sf-activity` idle cookie signIn sets, so the
  // idle-timeout model is unaffected.
  await supabase.auth.signOut();

  redirect("/admin/login?reset=success");
}
```

No new imports needed for this step: `createSupabaseServerClient` (from `@/lib/supabase/server`) was already imported in the original file for `signIn`/`signOut`/`signOutIdle`, and `createSupabaseAdminClient` was added by Task 2, Step 1 — both are already in scope.

- [ ] **Step 2: Add `ResetPasswordForm`**

Create `src/features/admin/components/reset-password-form.tsx`:

```tsx
"use client";

import { useActionState, useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPassword, type AuthFormState } from "@/features/admin/actions/auth";

const initialState: AuthFormState = { error: null };

export function ResetPasswordForm({ code }: { code: string }) {
  const uid = useId();
  const passwordId = `${uid}-password`;
  const confirmId = `${uid}-confirm`;
  const [state, formAction, isPending] = useActionState(resetPassword, initialState);
  const [dismissedState, setDismissedState] = useState<AuthFormState | null>(null);
  const visibleError = state.error && state !== dismissedState ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="code" value={code} />
      <div>
        <label htmlFor={passwordId} className="mb-1 block text-sm font-semibold text-ink-700">
          New password
        </label>
        <PasswordInput
          id={passwordId}
          name="password"
          autoComplete="new-password"
          required
          minLength={10}
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
        <p className="mt-1 text-xs text-ink-500">At least 10 characters.</p>
      </div>
      <div>
        <label htmlFor={confirmId} className="mb-1 block text-sm font-semibold text-ink-700">
          Confirm new password
        </label>
        <PasswordInput
          id={confirmId}
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength={10}
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      {visibleError ? (
        <InlineAlert message={visibleError} onDismiss={() => setDismissedState(state)} />
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isPending}>
        {isPending ? (
          "Saving…"
        ) : (
          <>
            Set new password
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Add the page**

Create `src/app/admin/reset-password/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/features/admin/components/auth-layout";
import { ResetPasswordForm } from "@/features/admin/components/reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <AuthLayout subtitle="Set a new password">
        <p className="text-center text-sm text-ink-600">
          This link is invalid or has expired.{" "}
          <Link
            href="/admin/forgot-password"
            className="font-semibold text-brand-600 transition-colors hover:text-brand-700"
          >
            Request a new one
          </Link>
          .
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Set a new password">
      <ResetPasswordForm code={code} />
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Configure Supabase's allowed redirect URLs (manual, not code)**

Supabase Auth rejects `generateLink`'s `redirectTo` unless it's on the project's allow-list. In the Supabase dashboard for **both staging and production** projects: Authentication → URL Configuration → Redirect URLs, add:
- `http://localhost:3000/admin/reset-password` (local dev)
- `https://<staging-domain>/admin/reset-password`
- `https://<production-domain>/admin/reset-password`

Without this, `generateLink` in Task 2 either errors or silently falls back to the project's default redirect, and the emailed link will not land on `/admin/reset-password` with a usable `code`. This is a one-time dashboard change, not a migration — note it in Task 6's CLAUDE.md update so it isn't lost.

- [ ] **Step 5: Verify end-to-end with a real account**

Prerequisite: `RESEND_API_KEY`/`RESEND_FROM_EMAIL` and the Supabase redirect URL (Step 4) must be configured, and you need a real staff account's email.

Run: `npm run typecheck`
Expected: no errors.

Manual flow:
1. `npm run dev`, visit `/admin/forgot-password`, submit a real staff account's email.
2. Open the received email, click "Reset your password".
3. Confirm you land on `/admin/reset-password?code=...` and the "Set new password"/"Confirm new password" fields render (not the invalid-link message).
4. Enter a new password (10+ characters) matching in both fields, submit.
5. Confirm you're redirected to `/admin/login?reset=success` and see "Your password has been reset. Sign in with your new password."
6. Sign in with the new password and confirm it works.
7. Re-visit the same emailed link a second time — confirm it now shows "This reset link has expired or already been used." (the code is single-use).

Also visit `/admin/reset-password` directly with no `code` param.
Expected: "This link is invalid or has expired." with a working "Request a new one" link back to `/admin/forgot-password`.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/actions/auth.ts src/app/admin/reset-password/page.tsx src/features/admin/components/reset-password-form.tsx
git commit -m "feat: add password-reset completion flow via emailed recovery link"
```

---

## Task 4: Wire the login page to the new flow

Removes the "Contact SuperAdmin" placeholder and replaces it with a real link, now that a real flow exists.

**Files:**
- Modify: `src/features/admin/components/login-form.tsx`

**Interfaces:**
- No new exports. Consumes nothing new (removes the `Toast`/`createPortal` usage entirely).

- [ ] **Step 1: Replace the Forgot-password button + Toast with a Link**

In `src/features/admin/components/login-form.tsx`:

Remove these two imports (no longer used):
```tsx
import { createPortal } from "react-dom";
import { Toast } from "@/components/ui/toast";
```

Add:
```tsx
import Link from "next/link";
```

Remove this line (the `showForgotToast` state is no longer needed):
```tsx
  const [showForgotToast, setShowForgotToast] = useState(false);
```
(and its preceding comment about "no reset flow to link to yet").

Replace the `<button type="button" onClick={...}>Forgot password?</button>` block with:
```tsx
        <Link
          href="/admin/forgot-password"
          className="font-semibold text-brand-600 transition-colors hover:text-brand-700"
        >
          Forgot password?
        </Link>
```

Remove the entire portal block that follows it:
```tsx
      {/* Portalled: ... */}
      {showForgotToast
        ? createPortal(
            <Toast message="Contact SuperAdmin" onDismiss={() => setShowForgotToast(false)} />,
            document.body,
          )
        : null}
```

The resulting file should still import `useActionState`, `useId`, `useState` from `"react"` (all three are still used — `useState` remains needed for `dismissedState`).

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: no errors, no unused-import warnings.

Run: `npm run lint`
Expected: no errors.

Run: `npm run dev` (skip if already running). Visit `/admin/login`, confirm "Forgot password?" is now a link that navigates to `/admin/forgot-password` (no toast appears).

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/components/login-form.tsx
git commit -m "feat: link login page's Forgot password? to the real reset flow"
```

---

## Task 5: End-to-end tests

**Files:**
- Create: `tests/e2e/public/forgot-password.spec.ts`

**Interfaces:**
- Consumes: the pages/forms built in Tasks 2-3. No new app code.

These tests run in the `public` Playwright project (no session required — both pages are public by design), so they need no `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` env vars and will always run, unlike `login.spec.ts`.

- [ ] **Step 1: Write the failing test file**

Create `tests/e2e/public/forgot-password.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/**
 * The admin password-reset request/set flows. No session required — both
 * pages are public by design (the request form is anti-enumeration by
 * construction; the reset form's proof of identity is the emailed code, not
 * a session).
 *
 * `getByRole`, not `getByLabel`, for the email field: AuthLayout mounts both
 * the mobile and desktop trees at once (one hidden via CSS `display:none`),
 * so `getByLabel` would match two legitimately-labeled inputs — the same
 * reason tests/e2e/admin/login.spec.ts and auth.setup.ts use `getByRole`.
 */

test("requesting a reset always shows the same generic message, even for an unknown email", async ({
  page,
}) => {
  await page.goto("/admin/forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill("definitely-not-a-real-account@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(
    page.getByText(/if an account exists for that email, we've sent a link/i),
  ).toBeVisible();
});

test("an invalid email is rejected client-side, before the generic message can show", async ({
  page,
}) => {
  await page.goto("/admin/forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill("not-an-email");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(
    page.getByText(/if an account exists for that email, we've sent a link/i),
  ).not.toBeVisible();
});

test("visiting the reset page with no code shows an invalid-link message", async ({ page }) => {
  await page.goto("/admin/reset-password");

  await expect(page.getByText(/this link is invalid or has expired/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new one" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to confirm it fails on a stale build, then passes**

Run: `npm run test:e2e -- tests/e2e/public/forgot-password.spec.ts`
Expected: all 3 tests PASS against the code built in Tasks 2-4. (If any of these were run against the codebase *before* Tasks 2-4, they'd fail with "page not found" / missing elements — that's the red state this step is confirming you've moved past.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/public/forgot-password.spec.ts
git commit -m "test: add e2e coverage for the password-reset request/set flows"
```

---

## Task 6: Documentation and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Correct the now-stale Toast paragraph in the existing login bullet**

`CLAUDE.md`'s existing `**/admin/login` is a responsive split-screen...` bullet ends with a long paragraph describing "Forgot password?"'s old `Toast`-via-`createPortal` behavior ("...but its honest note (now just \"Contact SuperAdmin\") surfaces as an unmodified `Toast`..." through "...the same fix `RowActions`/`Tooltip`/`NotificationBell`/`AdminMobileNav` already use for the equivalent problem elsewhere in the admin portal."). Task 4 deletes that Toast entirely, so this paragraph would misdescribe the code if left as-is.

Read `CLAUDE.md`, find that paragraph (it's the last paragraph of the login-split-screen bullet, starting at the sentence `"Forgot password?" is still a button, not a link to a nonexistent route...`), and replace the whole paragraph — from `"Forgot password?"` through the paragraph's final period — with:

```
"Forgot password?" is a real link now, not a placeholder button — see the
self-service reset flow bullet below.
```

Keep everything in the bullet before that paragraph unchanged (the split-screen layout, background photo, "Remember me" checkbox, etc. are all still accurate).

- [ ] **Step 2: Add a new CLAUDE.md bullet for the reset flow**

Immediately after the login bullet just corrected, and before the next bullet (`**Autosave is a local recovery copy...`), insert:

```markdown
- **Self-service "Forgot password?" flow, 2026-07-31** (`docs/superpowers/specs/2026-07-31-admin-forgot-password-design.md`). Closes the login page's honesty placeholder — "Forgot password?" used to just toast "Contact SuperAdmin" because no reset flow existed. Two new public pages, `/admin/forgot-password` and `/admin/reset-password`, share the login page's split-screen chrome via a new `AuthLayout` (`src/features/admin/components/auth-layout.tsx`, extracted from `login/page.tsx` — `subtitle` swaps per page, `children` still mounts twice, once per responsive tree, exactly as `<LoginForm />` always has). **No new database table and no new browser-side Supabase client** — everything stays server-driven, matching the rest of this app's auth. `requestPasswordReset` (`src/features/admin/actions/auth.ts`) is Turnstile-gated like the other 8 public forms, then rate-limited via `checkRateLimit`'s record-on-every-call form (not `signIn`'s success-doesn't-count split — every request must count identically, real account or not, or differential counting itself becomes an enumeration signal), then calls the service-role `auth.admin.generateLink({type:'recovery', ...})` and emails the resulting link via a new `PasswordResetEmail` template through the existing Resend pipeline — Supabase's own mailer is never used. **It always returns the same generic response** ("If an account exists for that email...") regardless of whether the email matched a real/active account or whether the rate limit was hit; the UI cannot observably distinguish any of those cases, by design. The account-existence check is `generateLink`'s own result, not a `profiles` lookup by email — `profiles.email` isn't guaranteed to share `auth.users.email`'s case normalization (`createTeamUser` inserts whatever case was typed), so matching by email risked a false negative for an existing account; `generateLink` returns the matching user's id instead, and `profiles` is then queried by that id (exact, no case ambiguity). `resetPassword` exchanges the emailed link's `code` for a session via `exchangeCodeForSession` **only at submit time, inside the Server Action — never when `/admin/reset-password` first renders**, because corporate email "safe link" scanners pre-fetch every link in an inbound email before the recipient opens it, which would otherwise burn the single-use code before the real user ever clicks. After updating the password on that session, it's immediately signed back out before redirecting to `/admin/login?reset=success` — the recovery session must not linger, and it never touches the custom `sf-activity` idle cookie, so the idle-timeout model is unaffected. Both new audit entries reuse the existing `"password_reset"` `AuditActionType` (already used by `changeMyPassword`'s current-password-required flow, which this doesn't replace) rather than adding a new enum value. **Requires a one-time Supabase dashboard change on every environment** (Authentication → URL Configuration → Redirect URLs): `generateLink`'s `redirectTo` must be on the project's allow-list, or the emailed link won't land on `/admin/reset-password` with a usable `code`. Tested via `tests/e2e/public/forgot-password.spec.ts`, which needs no `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (both pages are public) — the full emailed-link round trip isn't automatable without a live inbox, same limitation the Resend integration design already documented.
```

- [ ] **Step 3: Full verification pass**

Run, in order:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

Expected: all four succeed with no errors.

Run: `npm run test:e2e -- --project=public`
Expected: all public-project tests PASS, including the 3 new ones from Task 5.

Run: `npm run test:e2e -- --project=admin` (only if `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` are set — otherwise this whole project self-skips).
Expected: PASS (or SKIP entirely).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the admin forgot-password flow in CLAUDE.md"
```
