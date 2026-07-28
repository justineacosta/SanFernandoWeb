# Turnstile CAPTCHA (Security-Hardening Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cloudflare Turnstile CAPTCHA verification, alongside (not replacing) the existing rate limiter, to all 8 anonymous public Server Actions, per `docs/superpowers/specs/2026-07-28-security-hardening-design.md` §5.

**Architecture:** One server-side verifier (`src/lib/turnstile.ts`, `verifyTurnstileToken`) called first — before rate-limiting or Zod validation — in each of the 8 public Server Actions. One client component (`src/components/shared/turnstile-widget.tsx`) wrapping Cloudflare's vanilla `api.js` script (no new npm dependency), rendered in each of the 8 forms just above its submit control, feeding a token into component state that the form passes to its action. Missing-key behavior is asymmetric by design: development skips verification with a console warning (so `npm run dev` isn't blocked without a Cloudflare account); production throws if the secret is unset, so a misconfigured deploy fails loudly instead of silently shipping with no CAPTCHA.

**Tech Stack:** Next.js 16 Server Actions, React 19 client components, Cloudflare Turnstile `api.js` (script tag, no SDK package), Vitest for the one pure server-side unit, Playwright for the existing public e2e suite (regression-checked, not extended — see Task 12).

## Global Constraints

- `verifyTurnstileToken` is called **first** in every action, before `checkRateLimit`/`requestIp`-derived rate limiting and before Zod parsing — a failed challenge must be the cheapest possible rejection (spec §5).
- `turnstileToken` is **never** added to any Zod-validated `Public*Values` type. It travels as a separate function parameter (or a separate `FormData` field for `submitFeedback`), because those types are shared with other code (schemas, and potentially future admin walk-in encoding reuse) that must not gain an unrelated CAPTCHA field.
- New env vars: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (client, inlined at build time) and `TURNSTILE_SECRET_KEY` (server-only, never sent to the client) — both added to `.env.example` with comments explaining the dev-bypass/prod-throw asymmetry.
- No new npm dependency — Turnstile is loaded as a plain `<script>` tag, matching the spec's "wrapping Cloudflare's script" wording.
- CSP (`next.config.ts`) must allow `https://challenges.cloudflare.com` in `script-src`, `frame-src`, and `connect-src` — Turnstile loads a script, renders an iframe, and makes its own XHR calls from that origin. **This is not optional for the existing test suite**: `NewsletterForm` (one of the 8 forms) renders `variant="inline"` in `SiteFooter`, which mounts on every public page — so `tests/e2e/public/site.spec.ts`'s "the home page produces no CSP violations" test will exercise whatever CSP gap exists here the moment a site key is configured.
- Every one of the 8 action files already calls `requestIp()` for rate-limiting; reuse that same `ip` value for `verifyTurnstileToken(token, ip)` rather than fetching it twice.
- Each of the 8 actions has exactly one call site (confirmed by grep — its own form component), so adding a new required parameter to each signature is safe with no other caller to update.
- This plan does **not** touch item 6 (body-size-limit scoping / PDF Route Handler) — that is Plan 3, explicitly last per the spec's rollout order.
- CLAUDE.md must be updated in the same session per the repo's standing "document every change" rule (last task).

---

## File Structure

- **Create** `src/lib/turnstile.ts` — `verifyTurnstileToken(token, ip)`, `TURNSTILE_FAILURE_MESSAGE`.
- **Create** `tests/unit/turnstile.test.ts` — the one automatable unit (dev bypass, prod throw, missing token, mocked-fetch success/failure).
- **Create** `src/components/shared/turnstile-widget.tsx` — `TurnstileWidget` client component + `TurnstileWidgetHandle` (imperative `reset()`).
- **Modify** `.env.example` — add the two new env vars with explanatory comments.
- **Modify** `next.config.ts` — add `https://challenges.cloudflare.com` to `script-src`, `frame-src`, `connect-src`.
- **Modify** `src/features/contact/actions.ts` + `src/features/contact/components/inquiry-form.tsx`.
- **Modify** `src/features/services/actions.ts` + `src/features/services/components/apply-form.tsx`.
- **Modify** `src/features/assistance/actions.ts` + `src/features/assistance/components/assistance-form.tsx`.
- **Modify** `src/features/complaints/actions.ts` + `src/features/complaints/components/complaint-form.tsx`.
- **Modify** `src/features/appointments/actions.ts` + `src/features/appointments/components/appointment-form.tsx`.
- **Modify** `src/features/feedback/actions.ts` + `src/features/feedback/components/feedback-panel.tsx`.
- **Modify** `src/features/announcements/actions.ts` + `src/features/announcements/components/newsletter-form.tsx`.
- **Modify** `src/features/track/actions.ts` + `src/features/track/components/track-lookup.tsx`.
- **Modify** `CLAUDE.md` — document the Turnstile rollout under the security-hardening bullet.

---

### Task 1: `verifyTurnstileToken` + env vars

**Files:**
- Create: `src/lib/turnstile.ts`
- Create: `tests/unit/turnstile.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `verifyTurnstileToken(token: string | null | undefined, ip: string): Promise<boolean>`, `TURNSTILE_FAILURE_MESSAGE: string` — both consumed by every action task below.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/turnstile.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * verifyTurnstileToken (security-hardening Plan 2).
 *
 * Missing-key behaviour is asymmetric on purpose: development skips
 * verification with a warning (no Cloudflare account required to run
 * `npm run dev`), production throws (a misconfigured deploy must fail loudly,
 * not silently ship with no CAPTCHA). A present secret with no token is
 * always a rejection, in every environment — there is nothing to verify.
 */
describe("verifyTurnstileToken", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("skips verification in development when the secret is unset", async () => {
    process.env.NODE_ENV = "development";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken(null, "1.2.3.4")).resolves.toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("throws in production when the secret is unset", async () => {
    process.env.NODE_ENV = "production";
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken("some-token", "1.2.3.4")).rejects.toThrow();
  });

  it("rejects a missing token when a secret is configured", async () => {
    process.env.NODE_ENV = "development";
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken(null, "1.2.3.4")).resolves.toBe(false);
  });

  it("returns true when Cloudflare reports success", async () => {
    process.env.NODE_ENV = "development";
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken("real-token", "1.2.3.4")).resolves.toBe(true);
  });

  it("returns false when Cloudflare reports failure", async () => {
    process.env.NODE_ENV = "development";
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: false }),
    }) as unknown as typeof fetch;
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken("bad-token", "1.2.3.4")).resolves.toBe(false);
  });

  it("fails closed when the verification request itself errors", async () => {
    process.env.NODE_ENV = "development";
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const { verifyTurnstileToken } = await import("@/lib/turnstile");
    await expect(verifyTurnstileToken("real-token", "1.2.3.4")).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- turnstile`
Expected: FAIL — `Cannot find module '@/lib/turnstile'`

- [ ] **Step 3: Write `src/lib/turnstile.ts`**

```typescript
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Same copy for every rejection reason (missing key handled separately,
 * missing token, wrong token, Cloudflare-reported failure, network error) —
 * a distinct message per case would tell a script which part to retry.
 */
export const TURNSTILE_FAILURE_MESSAGE =
  "We could not verify you're human. Please complete the challenge and try again.";

let warnedMissingSecret = false;

/**
 * Verifies a Turnstile token against Cloudflare's siteverify endpoint.
 * Called first in every one of the 8 public Server Actions — before
 * rate-limiting or Zod validation — so a failed challenge is the cheapest
 * possible rejection (security-hardening spec §5).
 *
 * Missing-key behaviour is asymmetric: in development, an unset
 * TURNSTILE_SECRET_KEY skips verification (returns true) with a one-time
 * console warning, so a contributor without a Cloudflare account isn't
 * blocked. In production it throws instead of silently passing, so a
 * misconfigured deploy fails loudly rather than shipping with no CAPTCHA.
 *
 * Fails closed on a missing token or a Cloudflare-reported failure, and also
 * fails closed if the verification request itself errors — unlike the rate
 * limiter (which fails open because Zod is its real correctness gate),
 * Turnstile IS the anti-bot layer this plan adds; failing open here would
 * silently disable the very feature being shipped.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "TURNSTILE_SECRET_KEY is not set — refusing to accept public form submissions with no CAPTCHA in production.",
      );
    }
    if (!warnedMissingSecret) {
      console.warn("TURNSTILE_SECRET_KEY is not set — skipping Turnstile verification in development.");
      warnedMissingSecret = true;
    }
    return true;
  }

  if (!token) return false;

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const result = (await response.json()) as { success: boolean };
    return result.success === true;
  } catch (error) {
    console.error("verifyTurnstileToken request failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- turnstile`
Expected: PASS (6 tests)

- [ ] **Step 5: Add the env vars**

Append to `.env.example`:

```bash

# Cloudflare Turnstile — Dashboard → Turnstile → add a site, "Managed" widget mode.
# NEXT_PUBLIC_TURNSTILE_SITE_KEY is inlined into the client bundle (safe to expose).
# TURNSTILE_SECRET_KEY is server-only — never expose to the client.
# In development, an unset TURNSTILE_SECRET_KEY skips verification with a console
# warning. In production, verifyTurnstileToken() throws if it is unset.
NEXT_PUBLIC_TURNSTILE_SITE_KEY=YOUR-TURNSTILE-SITE-KEY
TURNSTILE_SECRET_KEY=YOUR-TURNSTILE-SECRET-KEY
```

- [ ] **Step 6: Run the full unit suite and typecheck**

Run: `npm run test:unit && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/turnstile.ts tests/unit/turnstile.test.ts .env.example
git commit -m "feat: add Turnstile server-side verification helper"
```

---

### Task 2: `TurnstileWidget` client component

**Files:**
- Create: `src/components/shared/turnstile-widget.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TurnstileWidget` (forwardRef component, props `{ onVerify: (token: string | null) => void; className?: string; size?: "normal" | "compact" }`), `TurnstileWidgetHandle` (`{ reset(): void }`) — consumed by all 8 form components in Tasks 3–10.

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  size?: "normal" | "compact";
}

export interface TurnstileWidgetHandle {
  /** Cloudflare tokens are single-use; call after every submit attempt (success or failure). */
  reset: () => void;
}

interface TurnstileWidgetProps {
  onVerify: (token: string | null) => void;
  className?: string;
  size?: "normal" | "compact";
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve) => existing.addEventListener("load", () => resolve(), { once: true }));
  }
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    document.body.appendChild(script);
  });
}

/**
 * Cloudflare Turnstile widget, loaded as a plain script (no npm package —
 * matches the security-hardening spec's "wrapping Cloudflare's script"). If
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (no Cloudflare account configured
 * yet), the widget renders nothing and warns once — the matching server-side
 * verifyTurnstileToken() bypass means the form still works end to end.
 *
 * Renders via the imperative window.turnstile API rather than the
 * data-attribute auto-render mode, because every one of the 8 forms needs to
 * reset() after a submit attempt (Cloudflare tokens are single-use) without
 * remounting the surrounding form and losing its state.
 */
export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onVerify, className, size = "normal" }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const reactId = useId();
    const domId = `turnstile-${reactId.replace(/:/g, "")}`;

    useImperativeHandle(ref, () => ({
      reset() {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      if (!siteKey) {
        console.warn("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set — the CAPTCHA widget will not render.");
        return;
      }

      let cancelled = false;
      loadTurnstileScript().then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onVerify(token),
          "expired-callback": () => onVerify(null),
          "error-callback": () => onVerify(null),
          size,
        });
      });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
      // Mount once per form instance; onVerify identity changes are handled
      // through the callback closure, not by re-rendering the widget.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={containerRef} id={domId} className={className} />;
  },
);
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/turnstile-widget.tsx
git commit -m "feat: add TurnstileWidget client component"
```

---

### Task 3: CSP allow-list for Cloudflare Turnstile

**Files:**
- Modify: `next.config.ts:40-51`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new — this only widens the existing `csp` string. No later task depends on this task's completion to compile, but Tasks 4–10 depend on it to actually *work* once a site key is configured, and the existing `site.spec.ts` CSP tests depend on it once `NewsletterForm` (rendered sitewide via `SiteFooter`) gets its widget in Task 9.

- [ ] **Step 1: Update the CSP string**

In `next.config.ts`, extend the comment above `csp` and the three affected directives:

```typescript
// ... existing comment block ...
// script-src, frame-src and connect-src all also allow
// https://challenges.cloudflare.com for the Turnstile CAPTCHA
// (security-hardening spec §5): it loads a script from that origin, renders
// its challenge in an iframe from that origin, and the widget makes its own
// XHR calls back to it. NewsletterForm (one of the 8 CAPTCHA'd forms) is
// mounted sitewide via SiteFooter, so this is exercised on every page, not
// just the forms that look CAPTCHA-specific.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `object-src 'self' ${supabaseOrigin}`.trim(),
  `frame-src 'self' ${supabaseOrigin} https://challenges.cloudflare.com`.trim(),
  `img-src 'self' blob: data: https://lh3.googleusercontent.com ${supabaseOrigin}`.trim(),
  `connect-src 'self' ${supabaseOrigin} https://challenges.cloudflare.com`.trim(),
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
].join("; ");
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS (build succeeds; CSP header is a static string so this doesn't need a running server to catch a syntax error)

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: allow challenges.cloudflare.com in the CSP for Turnstile"
```

---

### Task 4: Wire the contact/inquiry form

**Files:**
- Modify: `src/features/contact/actions.ts`
- Modify: `src/features/contact/components/inquiry-form.tsx`

**Interfaces:**
- Consumes: `verifyTurnstileToken`, `TURNSTILE_FAILURE_MESSAGE` from `@/lib/turnstile` (Task 1); `TurnstileWidget`, `TurnstileWidgetHandle` from `@/components/shared/turnstile-widget` (Task 2).
- Produces: `submitInquiry(values: PublicInquiryValues, turnstileToken: string | null): Promise<SubmitInquiryResult>` — signature change, single call site updated in the same task.

- [ ] **Step 1: Update `submitInquiry`**

In `src/features/contact/actions.ts`, add the import and the token parameter, verifying first:

```typescript
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
```

```typescript
export async function submitInquiry(
  values: PublicInquiryValues,
  turnstileToken: string | null,
): Promise<SubmitInquiryResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE };
  }
  if (!(await checkRateLimit(`inquiry:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error: `Too many messages from this connection. Please try again later, or call ${SITE.phone}.`,
    };
  }

  const parsed = inquirySchema.safeParse(values);
  // ... rest unchanged ...
```

- [ ] **Step 2: Wire the widget into `InquiryForm`**

In `src/features/contact/components/inquiry-form.tsx`, add imports:

```typescript
import { useRef, useState } from "react";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
```

Add state and ref alongside the existing `values`/`error` state:

```typescript
const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
const turnstileRef = useRef<TurnstileWidgetHandle>(null);
```

In `handleSubmit`'s `startTransition`, pass the token and reset the widget after the attempt regardless of outcome:

```typescript
startTransition(async () => {
  try {
    const result = await submitInquiry(values, turnstileToken);
    if (result.error) {
      setError(result.error);
      return;
    }
    // ... existing success path ...
  } finally {
    submitting.current = false;
    turnstileRef.current?.reset();
    setTurnstileToken(null);
  }
});
```

Render the widget in the JSX, directly above the submit `<Button>` (same slot the error block already sits next to):

```tsx
<TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual verification**

Run `npm run dev` (skip if already running — check first). Visit `/contact`, submit the form. With no `TURNSTILE_SECRET_KEY`/`NEXT_PUBLIC_TURNSTILE_SITE_KEY` set locally, the widget area renders empty (console warning visible in devtools) and the submission still succeeds — this proves the dev bypass works end to end.

- [ ] **Step 5: Commit**

```bash
git add src/features/contact/actions.ts src/features/contact/components/inquiry-form.tsx
git commit -m "feat: add Turnstile to the contact inquiry form"
```

---

### Task 5: Wire the services/apply form

**Files:**
- Modify: `src/features/services/actions.ts`
- Modify: `src/features/services/components/apply-form.tsx`

**Interfaces:**
- Consumes: same as Task 4.
- Produces: `submitApplication(serviceId: string, values: PublicApplicationValues, turnstileToken: string | null): Promise<SubmitApplicationResult>`.

- [ ] **Step 1: Update `submitApplication`**

In `src/features/services/actions.ts`:

```typescript
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
```

```typescript
export async function submitApplication(
  serviceId: string,
  values: PublicApplicationValues,
  turnstileToken: string | null,
): Promise<SubmitApplicationResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticketNo: null };
  }
  if (!(await checkRateLimit(`apply:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error: "Too many applications from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
    };
  }

  const parsed = applicationSchema.safeParse(values);
  // ... rest unchanged ...
```

- [ ] **Step 2: Wire the widget into `ApplyForm`**

In `src/features/services/components/apply-form.tsx`, add the same import as Task 4, plus:

```typescript
const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
const turnstileRef = useRef<TurnstileWidgetHandle>(null);
```

Update the call and cleanup inside `startTransition`:

```typescript
startTransition(async () => {
  try {
    const result = await submitApplication(serviceId, values, turnstileToken);
    if (result.error || !result.ticketNo) {
      setError(result.error ?? "Something went wrong. Please try again.");
      return;
    }
    setTicketNo(result.ticketNo);
  } finally {
    submitting.current = false;
    turnstileRef.current?.reset();
    setTurnstileToken(null);
  }
});
```

Render `<TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />` directly above the `error` block, before the submit `<Button>` inside the `<Card>`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual verification**

Visit `/services/[a service id]`, fill and submit the application form; confirm the ticket receipt still renders (dev bypass, same as Task 4 Step 4).

- [ ] **Step 5: Commit**

```bash
git add src/features/services/actions.ts src/features/services/components/apply-form.tsx
git commit -m "feat: add Turnstile to the service application form"
```

---

### Task 6: Wire the assistance form

**Files:**
- Modify: `src/features/assistance/actions.ts`
- Modify: `src/features/assistance/components/assistance-form.tsx`

**Interfaces:**
- Consumes: same as Task 4.
- Produces: `submitAssistance(values: PublicAssistanceValues, turnstileToken: string | null): Promise<SubmitTicketResult>`.

- [ ] **Step 1: Update `submitAssistance`**

In `src/features/assistance/actions.ts`:

```typescript
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
```

```typescript
export async function submitAssistance(
  values: PublicAssistanceValues,
  turnstileToken: string | null,
): Promise<SubmitTicketResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticketNo: null };
  }
  if (!(await checkRateLimit(`assistance:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error: "Too many requests from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
    };
  }

  const parsed = assistanceSchema.safeParse(values);
  // ... rest unchanged ...
```

- [ ] **Step 2: Wire the widget into `AssistanceForm`**

Same pattern as Task 5 Step 2: import, `turnstileToken`/`turnstileRef` state, pass `turnstileToken` as `submitAssistance`'s second argument, reset in `finally`, render `<TurnstileWidget>` above the submit button.

```typescript
const result = await submitAssistance(values, turnstileToken);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual verification**

Visit `/assistance`, submit the form, confirm a ticket number is returned under the dev bypass.

- [ ] **Step 5: Commit**

```bash
git add src/features/assistance/actions.ts src/features/assistance/components/assistance-form.tsx
git commit -m "feat: add Turnstile to the assistance request form"
```

---

### Task 7: Wire the complaints form

**Files:**
- Modify: `src/features/complaints/actions.ts`
- Modify: `src/features/complaints/components/complaint-form.tsx`

**Interfaces:**
- Consumes: same as Task 4.
- Produces: `submitComplaint(values: PublicComplaintValues, turnstileToken: string | null): Promise<SubmitTicketResult>`.

- [ ] **Step 1: Update `submitComplaint`**

In `src/features/complaints/actions.ts`:

```typescript
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
```

```typescript
export async function submitComplaint(
  values: PublicComplaintValues,
  turnstileToken: string | null,
): Promise<SubmitTicketResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticketNo: null };
  }
  if (!(await checkRateLimit(`complaint:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error: "Too many reports from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
    };
  }

  const parsed = complaintSchema.safeParse(values);
  // ... rest unchanged ...
```

- [ ] **Step 2: Wire the widget into `ComplaintForm`**

Same pattern as Task 5 Step 2:

```typescript
const result = await submitComplaint(values, turnstileToken);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual verification**

Visit `/complaints` (or wherever `ComplaintForm` is mounted), submit, confirm a ticket number returns under the dev bypass.

- [ ] **Step 5: Commit**

```bash
git add src/features/complaints/actions.ts src/features/complaints/components/complaint-form.tsx
git commit -m "feat: add Turnstile to the complaint form"
```

---

### Task 8: Wire the appointments form

**Files:**
- Modify: `src/features/appointments/actions.ts`
- Modify: `src/features/appointments/components/appointment-form.tsx`

**Interfaces:**
- Consumes: same as Task 4.
- Produces: `submitAppointment(values: PublicAppointmentValues, turnstileToken: string | null): Promise<SubmitTicketResult>`.

- [ ] **Step 1: Update `submitAppointment`**

In `src/features/appointments/actions.ts`:

```typescript
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
```

```typescript
export async function submitAppointment(
  values: PublicAppointmentValues,
  turnstileToken: string | null,
): Promise<SubmitTicketResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticketNo: null };
  }
  if (!(await checkRateLimit(`appointment:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error: "Too many appointment requests from this connection. Please try again later or visit the barangay hall.",
      ticketNo: null,
    };
  }

  const parsed = appointmentSchema.safeParse(values);
  // ... rest unchanged ...
```

- [ ] **Step 2: Wire the widget into `AppointmentForm`**

Same pattern as Task 5 Step 2:

```typescript
const result = await submitAppointment(values, turnstileToken);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual verification**

Visit `/appointments`, submit, confirm a ticket number returns under the dev bypass.

- [ ] **Step 5: Commit**

```bash
git add src/features/appointments/actions.ts src/features/appointments/components/appointment-form.tsx
git commit -m "feat: add Turnstile to the appointment form"
```

---

### Task 9: Wire the anonymous feedback panel (FormData variant)

**Files:**
- Modify: `src/features/feedback/actions.ts`
- Modify: `src/features/feedback/components/feedback-panel.tsx`

**Interfaces:**
- Consumes: same as Task 4.
- Produces: `submitFeedback(form: FormData): Promise<SubmitFeedbackResult>` — signature unchanged (still one `FormData` param); the token travels as a new `"turnstileToken"` field inside it instead of a new positional parameter, since this action already takes `FormData` for the file upload.

- [ ] **Step 1: Update `submitFeedback`**

In `src/features/feedback/actions.ts`:

```typescript
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
```

```typescript
export async function submitFeedback(form: FormData): Promise<SubmitFeedbackResult> {
  // Before parsing, so a flood is rejected before doing any real work — no
  // Zod validation, no file read, no Storage upload.
  const ip = await requestIp();
  const rawToken = form.get("turnstileToken");
  if (!(await verifyTurnstileToken(typeof rawToken === "string" ? rawToken : null, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE };
  }
  if (!(await checkRateLimit(`feedback:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
    return {
      error: `Too much feedback from this connection. Please try again later, or call ${SITE.phone}.`,
    };
  }

  const parsed = feedbackSchema.safeParse({
    // ... unchanged ...
```

- [ ] **Step 2: Wire the widget into `FeedbackPanel`**

In `src/features/feedback/components/feedback-panel.tsx`, add the import and state:

```typescript
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
```

```typescript
const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
const turnstileRef = useRef<TurnstileWidgetHandle>(null);
```

Set the field on the `FormData` and reset after the attempt, inside `handleSubmit`:

```typescript
try {
  const form = new FormData();
  form.set("category", values.category);
  form.set("subject", values.subject);
  form.set("message", values.message);
  form.set("rating", String(values.rating));
  form.set("pagePath", withPath.pagePath);
  form.set("turnstileToken", turnstileToken ?? "");
  if (screenshot) form.set("screenshot", screenshot);
  const result = await submitFeedback(form);
  if (result.error) {
    setError(result.error);
    return;
  }
  setSent(true);
} finally {
  submitting.current = false;
  setPending(false);
  turnstileRef.current?.reset();
  setTurnstileToken(null);
}
```

Render the widget inside the scrollable body, directly above the `error` block (which already sits just before the footer's Cancel/Send buttons):

```tsx
<TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />

{error ? (
  <p role="alert" className="text-sm font-medium text-danger">
    {error}
  </p>
) : null}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual verification + regression check**

Visit any public page, open the feedback launcher (floating button), submit a report; confirm the "reached the barangay" success state still renders under the dev bypass.

Then run the existing Playwright suite for this feature, which asserts a full round trip:

Run: `npm run test:e2e:public -- feedback.spec.ts`
Expected: PASS. Per CLAUDE.md, this suite consumes all 3 of `SUBMIT_LIMIT` on `feedback:unknown` — if it was run within the last hour in this environment, a rate-limit collision (not a regression) is the likely cause of any failure; re-check by waiting out the window rather than debugging code.

- [ ] **Step 5: Commit**

```bash
git add src/features/feedback/actions.ts src/features/feedback/components/feedback-panel.tsx
git commit -m "feat: add Turnstile to the anonymous feedback panel"
```

---

### Task 10: Wire the newsletter/alert-subscribe form (both variants)

**Files:**
- Modify: `src/features/announcements/actions.ts`
- Modify: `src/features/announcements/components/newsletter-form.tsx`

**Interfaces:**
- Consumes: same as Task 4.
- Produces: `subscribeToAlerts(input: string, turnstileToken: string | null): Promise<SubscribeResult>`.

**Note:** `NewsletterForm` renders twice per relevant page — `variant="card"` in `NewsSidebar` and `variant="inline"` in `SiteFooter`, and the footer instance mounts on **every** public page. Use `size="compact"` on the `TurnstileWidget` for the `inline` variant so it fits the footer's cramped `flex-col gap-3 sm:flex-row` row instead of the default ~300px-wide widget; the `card` variant has room for the default size.

- [ ] **Step 1: Update `subscribeToAlerts`**

In `src/features/announcements/actions.ts`:

```typescript
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
```

```typescript
export async function subscribeToAlerts(
  input: string,
  turnstileToken: string | null,
): Promise<SubscribeResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE };
  }
  if (!(await checkRateLimit(`subscribe:${ip}`, SUBSCRIBE_LIMIT, SUBSCRIBE_WINDOW_MS))) {
    return { error: "Too many attempts from this connection. Please try again later." };
  }

  const mobile = normaliseMobile(input);
  // ... rest unchanged ...
```

- [ ] **Step 2: Wire the widget into `NewsletterForm`**

Add the import and state:

```typescript
import { useId, useRef, useState, useTransition } from "react";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
```

```typescript
const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
const turnstileRef = useRef<TurnstileWidgetHandle>(null);
```

Update `handleSubmit`:

```typescript
startTransition(async () => {
  try {
    const result = await subscribeToAlerts(mobile, turnstileToken);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSubscribed(true);
  } finally {
    submitting.current = false;
    turnstileRef.current?.reset();
    setTurnstileToken(null);
  }
});
```

Render the widget inside the `<form>`, after the input/button row and before the error paragraph, sized per variant:

```tsx
<TurnstileWidget
  ref={turnstileRef}
  onVerify={setTurnstileToken}
  size={variant === "inline" ? "compact" : "normal"}
  className={cn("flex", variant === "card" ? "justify-center" : "justify-start")}
/>
{error ? (
  <p id={errorId} role="alert" className="text-sm font-medium text-danger-bright">
    {error}
  </p>
) : null}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual verification**

Visit the home page (footer `inline` variant) and `/announcements` (sidebar `card` variant); confirm both layouts still look intentional with the empty (no-site-key) widget container, and that subscribing succeeds under the dev bypass in both places.

- [ ] **Step 5: Commit**

```bash
git add src/features/announcements/actions.ts src/features/announcements/components/newsletter-form.tsx
git commit -m "feat: add Turnstile to the alert-subscribe form"
```

---

### Task 11: Wire the public ticket-lookup form

**Files:**
- Modify: `src/features/track/actions.ts`
- Modify: `src/features/track/components/track-lookup.tsx`

**Interfaces:**
- Consumes: same as Task 4.
- Produces: `lookupTicket(ticketNo: string, lastName: string, turnstileToken: string | null): Promise<LookupResult>`.

- [ ] **Step 1: Update `lookupTicket`**

In `src/features/track/actions.ts`:

```typescript
import { TURNSTILE_FAILURE_MESSAGE, verifyTurnstileToken } from "@/lib/turnstile";
```

```typescript
export async function lookupTicket(
  ticketNo: string,
  lastName: string,
  turnstileToken: string | null,
): Promise<LookupResult> {
  const ip = await requestIp();
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return { error: TURNSTILE_FAILURE_MESSAGE, ticket: null };
  }
  if (!(await checkRateLimit(`track:${ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW_MS))) {
    return { error: "Too many lookups. Please wait a few minutes and try again.", ticket: null };
  }

  const ticket = ticketNo.trim().toUpperCase();
  // ... rest unchanged ...
```

- [ ] **Step 2: Wire the widget into `TrackLookup`**

Add the import and state:

```typescript
import { useRef, useState, useTransition } from "react";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
```

```typescript
const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
const turnstileRef = useRef<TurnstileWidgetHandle>(null);
```

Update `handleSubmit`:

```typescript
function handleSubmit(event: React.FormEvent) {
  event.preventDefault();
  setError(null);
  startTransition(async () => {
    const result = await lookupTicket(ticketNo, lastName, turnstileToken);
    setTicket(result.ticket);
    setError(result.error);
    turnstileRef.current?.reset();
    setTurnstileToken(null);
  });
}
```

Render the widget above the submit `<Button>`, after the error block:

```tsx
{error ? (
  <p role="alert" className="text-sm font-medium text-danger">
    {error}
  </p>
) : null}
<TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />
<Button type="submit" variant="primary" className="w-full" disabled={isPending}>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Manual verification**

Visit `/track`, look up a real ticket number (created in an earlier task's manual test), confirm the result still renders under the dev bypass.

- [ ] **Step 5: Commit**

```bash
git add src/features/track/actions.ts src/features/track/components/track-lookup.tsx
git commit -m "feat: add Turnstile to the public ticket-lookup form"
```

---

### Task 12: Full-suite verification + CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything from Tasks 1–11.
- Produces: nothing further downstream — this is the plan's closing task.

- [ ] **Step 1: Run the full verification battery**

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

Expected: all PASS. The build step matters here specifically because it re-parses `next.config.ts`'s CSP string and would surface a syntax mistake in Task 3 that `typecheck`/`lint` can't see.

- [ ] **Step 2: Run the public e2e suite**

Run: `npm run test:e2e:public`
Expected: PASS, including `site.spec.ts`'s two CSP tests (`responses carry the baseline security headers`, `the home page produces no CSP violations`) and `feedback.spec.ts`'s full round trip. Per CLAUDE.md, `feedback.spec.ts` is not idempotent within its rate-limit window — a failure here shortly after Task 9's manual run is a rate-limit collision, not a regression; re-run after `SUBMIT_WINDOW_MS` (1 hour) has elapsed to confirm.

- [ ] **Step 3: Update CLAUDE.md**

Add a new paragraph to the end of the existing "Security-hardening pass, Plan 1 of 3" bullet in the Architecture section (rename it to reflect Plan 2 landing), documenting: Turnstile added to all 8 public forms via `verifyTurnstileToken`/`TurnstileWidget`, called first before rate-limiting, the dev-skip/prod-throw asymmetry, the CSP additions for `challenges.cloudflare.com`, and that going live still needs a real Cloudflare account + site/secret key pair (same gating pattern as Resend) — Plan 3 (PDF-upload Route Handler / body-size-limit scoping) remains the only piece of the hardening pass not started.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record Turnstile CAPTCHA rollout (security-hardening Plan 2)"
```
