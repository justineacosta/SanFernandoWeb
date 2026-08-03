# Adaptive Turnstile Challenge on Admin Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a Cloudflare Turnstile challenge on `/admin/login` only after a failed sign-in attempt against that IP or email, enforced server-side, so credential stuffing is blocked without putting a hard Cloudflare dependency in front of the portal's only door.

**Architecture:** The trigger reads the `rate_limit_hits` rows `signIn` already writes — ≥1 hit in the 15-minute window means challenge, ≥5 still means block. A new `countRateLimitHits` returns the raw count so one query per key serves both thresholds, replacing `isRateLimited` (whose only caller is `signIn`). A Supabase read failure fails *open* for the block and *closed* for the challenge, so the outage that currently disables login throttling entirely instead falls back to always challenging.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Supabase (service-role client), Cloudflare Turnstile, Vitest (pure functions), Playwright (e2e).

**Design spec:** `docs/superpowers/specs/2026-08-03-admin-login-captcha-design.md`

## Global Constraints

- **No new migration.** This reuses `rate_limit_hits` (migration `0029`). Do not add a table, column, or key namespace.
- **No break-glass bypass.** No env var, query param, or header may skip the challenge. Only `verifyTurnstileToken`'s existing dev-skip (unset `TURNSTILE_SECRET_KEY` in non-production) applies, and it is untouched.
- **Rejection copy is always `"Incorrect email or password."`** — for a bad password, a disabled account, an over-limit attempt, and a failed challenge alike. A distinct message per case tells an attacker which check they tripped.
- **A failed or missing Turnstile token records NO rate-limit hit.** Hits are keyed partly on email; if challenge failures counted, anyone knowing a staff address could lock that account out with five tokenless POSTs.
- **Never wrap `signIn` in a `catch` at the call site.** `login-form.tsx`, `sign-out-button.tsx` and `idle-timeout.tsx` are deliberately exempt from the portal-wide `try`/`catch` sweep because `redirect()` works by throwing `NEXT_REDIRECT`. See the security-hardening bullet in `CLAUDE.md`.
- **`LoginForm` mounts twice** (both responsive trees, CSS `display:none`, never conditional mounting). Every id must stay `useId()`-derived; every Playwright locator must use `getByRole`, not `getByLabel`.
- **Tailwind tokens only** — `brand-*` / `ink-*` / `danger*` from `src/app/globals.css`. There is no `brand-900`.
- **CLAUDE.md is updated in the same session** as the code (standing project rule), not as a follow-up.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/admin/lib/login-challenge.ts` | **Create.** Pure predicates + the two login constants. The only unit-testable logic in this change; sits next to `build-full-name.ts`, the existing example of this pattern. |
| `tests/unit/login-challenge.test.ts` | **Create.** Vitest cover for the predicates, including the `null` (Supabase-unreachable) asymmetry. |
| `src/lib/rate-limit.ts` | **Modify.** Add `countRateLimitHits`; delete `isRateLimited`; fix two doc comments naming it. |
| `src/features/admin/actions/auth.ts` | **Modify.** `signIn` only: rewire counts, return `challengeRequired`, enforce the token. |
| `src/features/admin/components/login-form.tsx` | **Modify.** Mount the widget when challenged, carry the token in a hidden input, reset after each attempt. |
| `.env.example` | **Modify.** Document Cloudflare's always-pass test keys for admin e2e runs. |
| `tests/e2e/admin/login.spec.ts` | **Modify.** Wait for the token before clicking; add three challenge assertions. |
| `CLAUDE.md` | **Modify.** Document the adaptive trigger, the fail-open inversion, and the new e2e key requirement. |

---

### Task 1: Pure challenge predicates

The decision logic is the only part of this change that is pure, so it is the only part Vitest can cover. Extracting it also moves `LOGIN_LIMIT` / `LOGIN_WINDOW_MS` out of a `"use server"` module, which a unit test cannot import.

**Files:**
- Create: `src/features/admin/lib/login-challenge.ts`
- Create: `tests/unit/login-challenge.test.ts`
- Modify: `src/features/admin/actions/auth.ts:26-28` (delete the local constants, import them instead)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `LOGIN_LIMIT: number` (5)
  - `LOGIN_WINDOW_MS: number` (900_000)
  - `isOverLoginLimit(ipHits: number | null, emailHits: number | null): boolean`
  - `needsChallenge(ipHits: number | null, emailHits: number | null): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/login-challenge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LOGIN_LIMIT,
  isOverLoginLimit,
  needsChallenge,
} from "@/features/admin/lib/login-challenge";

describe("isOverLoginLimit", () => {
  it("is false for a clean pair of keys", () => {
    expect(isOverLoginLimit(0, 0)).toBe(false);
  });

  it("is false below the limit on both keys", () => {
    expect(isOverLoginLimit(LOGIN_LIMIT - 1, LOGIN_LIMIT - 1)).toBe(false);
  });

  it("is true when either key reaches the limit", () => {
    expect(isOverLoginLimit(LOGIN_LIMIT, 0)).toBe(true);
    expect(isOverLoginLimit(0, LOGIN_LIMIT)).toBe(true);
  });

  // Fails OPEN: a limiter outage must never lock out real staff. This is the
  // pre-existing behaviour of isRateLimited, preserved exactly.
  it("is false when a count could not be read", () => {
    expect(isOverLoginLimit(null, null)).toBe(false);
    expect(isOverLoginLimit(null, LOGIN_LIMIT - 1)).toBe(false);
  });
});

describe("needsChallenge", () => {
  it("is false on a first attempt with no recorded failures", () => {
    expect(needsChallenge(0, 0)).toBe(false);
  });

  it("is true after a single failure on either key", () => {
    expect(needsChallenge(1, 0)).toBe(true);
    expect(needsChallenge(0, 1)).toBe(true);
  });

  // Fails CLOSED, the opposite of isOverLoginLimit above. A null count means
  // the limiter is providing no protection at all right now, which is exactly
  // when every attempt should be challenged.
  it("is true when a count could not be read", () => {
    expect(needsChallenge(null, 0)).toBe(true);
    expect(needsChallenge(0, null)).toBe(true);
    expect(needsChallenge(null, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- login-challenge`

Expected: FAIL — `Failed to resolve import "@/features/admin/lib/login-challenge"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/admin/lib/login-challenge.ts`:

```ts
/**
 * Pure decision logic for the admin login gate. Lives here rather than in
 * `actions/auth.ts` because that module is `"use server"` and cannot be
 * imported by a Vitest unit test — the same reason `build-full-name.ts` sits
 * beside it instead of inside the users action file.
 */

/** Tighter than the public forms' hour-long windows — credential-stuffing arrives fast. */
export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * True when this attempt should be refused outright.
 *
 * A `null` count means the Supabase read failed, and is treated as "not
 * limited" — fail OPEN. An outage in the limiter must not lock out staff who
 * are typing the right password. This preserves `isRateLimited`'s original
 * behaviour exactly; `needsChallenge` below is what covers the gap it leaves.
 */
export function isOverLoginLimit(ipHits: number | null, emailHits: number | null): boolean {
  return (ipHits ?? 0) >= LOGIN_LIMIT || (emailHits ?? 0) >= LOGIN_LIMIT;
}

/**
 * True when this attempt must carry a valid Turnstile token.
 *
 * One recorded failure on either key is enough: a human who typoed sees a
 * challenge on their second try, while a credential-stuffing script — which
 * fails by definition — is challenged on every attempt after its first.
 *
 * A `null` count fails CLOSED here, deliberately inverting the rule above.
 * When the limiter cannot be read it is providing no protection whatsoever,
 * so the login falls back to challenging everyone: the always-on behaviour,
 * but only for as long as the cheaper adaptive signal is unavailable. The
 * degraded mode is strictly safer than the healthy one.
 */
export function needsChallenge(ipHits: number | null, emailHits: number | null): boolean {
  if (ipHits === null || emailHits === null) return true;
  return ipHits >= 1 || emailHits >= 1;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- login-challenge`

Expected: PASS, 7 tests.

- [ ] **Step 5: Point `auth.ts` at the moved constants**

In `src/features/admin/actions/auth.ts`, delete these three lines (currently 26-28):

```ts
/** Tighter than the public forms' hour-long windows — credential-stuffing arrives fast. */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
```

and add to the import block:

```ts
import { LOGIN_LIMIT, LOGIN_WINDOW_MS } from "@/features/admin/lib/login-challenge";
```

Nothing else in the file changes yet. `LOGIN_LIMIT` / `LOGIN_WINDOW_MS` keep the same values and the same two use sites.

- [ ] **Step 6: Verify nothing broke**

Run: `npm run typecheck && npm run lint`

Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/lib/login-challenge.ts tests/unit/login-challenge.test.ts src/features/admin/actions/auth.ts
git commit -m "feat: extract pure login gate predicates with the fail-open/closed split"
```

---

### Task 2: `countRateLimitHits` replaces `isRateLimited`

Behaviour-preserving refactor. `signIn` must reject exactly the same attempts after this task as before it — the challenge arrives in Task 4.

**Files:**
- Modify: `src/lib/rate-limit.ts:60-101` (replace `isRateLimited`, fix two neighbouring doc comments)
- Modify: `src/features/admin/actions/auth.ts:59-69`

**Interfaces:**
- Consumes: `isOverLoginLimit` from Task 1.
- Produces: `countRateLimitHits(key: string, windowMs: number): Promise<number | null>` — the hit count inside the window, or `null` if the read failed.

- [ ] **Step 1: Replace `isRateLimited` with `countRateLimitHits`**

In `src/lib/rate-limit.ts`, delete the whole `isRateLimited` function (lines 60-86) and put this in its place:

```ts
/**
 * Read-only hit count for a key inside a window — does NOT record a hit.
 * Returns `null` when the count could not be read (a Supabase error), so the
 * caller decides what an unknown count means rather than having a fail-open
 * default baked in here. Admin login needs opposite answers for its two
 * thresholds: see `isOverLoginLimit` / `needsChallenge` in
 * `src/features/admin/lib/login-challenge.ts`.
 *
 * Exists for admin login only. `checkRateLimit`'s check-and-record-together
 * contract would count every successful sign-in against the same budget as a
 * failed one, which is wrong — the threat this limiter defends against is
 * repeated *failures* (credential stuffing), not usage volume.
 *
 * Replaced the earlier boolean `isRateLimited(key, limit, windowMs)`: `signIn`
 * reads two thresholds off each key (>= 1 to challenge, >= LOGIN_LIMIT to
 * block), and a boolean helper meant running the same count query twice per
 * key — four round trips per login attempt instead of two.
 */
export async function countRateLimitHits(key: string, windowMs: number): Promise<number | null> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - windowMs).toISOString();

  const { count, error } = await admin
    .from("rate_limit_hits")
    .select("id", { count: "exact", head: true })
    .eq("key", key)
    .gte("hit_at", since);

  if (error) {
    console.error("countRateLimitHits count failed:", error.message);
    return null;
  }
  return count ?? 0;
}
```

- [ ] **Step 2: Fix the two doc comments that name the deleted function**

In the same file, `checkRateLimit`'s header currently ends:

```
 * This is the whole contract for every caller EXCEPT admin login, which
 * counts only failed attempts (a successful sign-in must not consume the
 * budget) — see `isRateLimited` / `recordRateLimitHit` below, used together
 * by `signIn` in src/features/admin/actions/auth.ts instead of this function.
```

Change the third line to `` * budget) — see `countRateLimitHits` / `recordRateLimitHit` below, used together ``.

`recordRateLimitHit`'s header currently ends `` * never after success). Pairs with `isRateLimited` above. `` — change it to `` * never after success). Pairs with `countRateLimitHits` above. ``

- [ ] **Step 3: Rewire `signIn`'s limit check**

In `src/features/admin/actions/auth.ts`, replace lines 59-69 — from `const ip = await requestIp();` through the closing brace of the `if (ipLimited || emailLimited)` block — with:

```ts
  const ip = await requestIp();
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const ipKey = `login:ip:${ip}`;
  const emailKey = `login:email:${normalizedEmail}`;
  const ipHits = await countRateLimitHits(ipKey, LOGIN_WINDOW_MS);
  const emailHits = await countRateLimitHits(emailKey, LOGIN_WINDOW_MS);
  if (isOverLoginLimit(ipHits, emailHits)) {
    // Same copy as a real bad password — a distinct "too many attempts"
    // message would confirm to an attacker that their guesses were arriving.
    return { error: "Incorrect email or password." };
  }
```

Keep the existing explanatory comment block above it (lines 47-58), amending its second paragraph to name the new function:

```ts
  // This check is read-only (countRateLimitHits, not checkRateLimit): a hit is
  // recorded below ONLY when signInWithPassword or the profile check
  // actually fails. Counting every attempt — including successful ones,
  // which is what the old checkRateLimit-before-signIn shape did — would
  // lock a legitimate admin out after their 6th successful login in 15
  // minutes. The threat model here is repeated FAILURES (credential
  // stuffing), not usage volume.
```

Update the import on line 9 to drop `isRateLimited` and add `countRateLimitHits`:

```ts
import { checkRateLimit, countRateLimitHits, recordRateLimitHit, requestIp } from "@/lib/rate-limit";
```

and replace Task 1's import. **`LOGIN_LIMIT` must come out of it** — the
`>= LOGIN_LIMIT` comparison now lives inside `isOverLoginLimit`, so the constant
has no remaining use site in this file and leaving it imported fails
`npm run lint` on `@typescript-eslint/no-unused-vars`:

```ts
import { isOverLoginLimit, LOGIN_WINDOW_MS } from "@/features/admin/lib/login-challenge";
```

- [ ] **Step 4: Confirm `isRateLimited` is gone everywhere**

Run: `grep -rn "isRateLimited" src/ tests/`

Expected: **no matches at all.** Any hit is a leftover reference to fix.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run test:unit`

Expected: all clean; unit suite passes including Task 1's new file.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rate-limit.ts src/features/admin/actions/auth.ts
git commit -m "refactor: return raw hit counts so login can read two thresholds per key"
```

---

### Task 3: Return `challengeRequired` from `signIn`

The flag only — no enforcement yet. Enforcing before the client can render a widget (Task 4) would make a second failed attempt unrecoverable on any machine with a real `TURNSTILE_SECRET_KEY` set.

**Files:**
- Modify: `src/features/admin/actions/auth.ts:22-24` (the `AuthFormState` interface) and `signIn`'s four `return` statements

**Interfaces:**
- Consumes: `needsChallenge` from Task 1; `countRateLimitHits` from Task 2.
- Produces: `AuthFormState = { error: string | null; challengeRequired: boolean }`.

- [ ] **Step 1: Widen `AuthFormState`**

```ts
export interface AuthFormState {
  error: string | null;
  /**
   * UI hint only — tells `LoginForm` to mount the Turnstile widget. NEVER a
   * security boundary: `signIn` recomputes the same condition server-side on
   * every call (Task 4), so a client that ignores this flag is refused just
   * the same. A Server Action is a public HTTP endpoint; what the previous
   * response told the client does not constrain the next POST.
   */
  challengeRequired: boolean;
}
```

- [ ] **Step 2: Compute the flag and return it from every exit**

Immediately after the `isOverLoginLimit` block added in Task 2, add:

```ts
  const challenge = needsChallenge(ipHits, emailHits);
```

Then update every `return` in `signIn` to carry it:

| Location | New return |
|---|---|
| Zod failure (top of function) | `return { error: "Enter your email and password.", challengeRequired: false };` |
| Over-limit rejection | `return { error: "Incorrect email or password.", challengeRequired: challenge };` |
| Bad password / no user | `return { error: "Incorrect email or password.", challengeRequired: true };` |
| Disabled account | `return { error: "This account is disabled. Contact the barangay administrator.", challengeRequired: true };` |

The last two are hardcoded `true` rather than `challenge`: both have just called `recordRateLimitHit` on both keys, so the *next* attempt is challenged by definition, and re-reading the count to discover that would be a wasted round trip.

The Zod failure returns `false` because it happens before any count is read — `ipHits` is not in scope there.

Extend the import from Task 2 to include the second predicate (still no
`LOGIN_LIMIT` — it has no use site in this file):

```ts
import {
  isOverLoginLimit,
  LOGIN_WINDOW_MS,
  needsChallenge,
} from "@/features/admin/lib/login-challenge";
```

- [ ] **Step 3: Update the client's initial state**

`src/features/admin/components/login-form.tsx` line 12 will now fail to typecheck. Change:

```ts
const initialState: AuthFormState = { error: null };
```

to:

```ts
const initialState: AuthFormState = { error: null, challengeRequired: false };
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`

Expected: both clean. `signIn` still behaves exactly as it did — the flag is returned and nothing reads it yet.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions/auth.ts src/features/admin/components/login-form.tsx
git commit -m "feat: return challengeRequired from signIn as a UI hint"
```

---

### Task 4: Render the widget and enforce the token

Client and server land together so there is never a commit where the server demands a token no page can produce.

**Files:**
- Modify: `src/features/admin/components/login-form.tsx`
- Modify: `src/features/admin/actions/auth.ts` (`signIn` only)

**Interfaces:**
- Consumes: `AuthFormState.challengeRequired` (Task 3); `TurnstileWidget` / `TurnstileWidgetHandle` from `@/components/shared/turnstile-widget`; `verifyTurnstileToken` from `@/lib/turnstile`.
- Produces: a `turnstileToken` form field read by `signIn`.

- [ ] **Step 1: Mount the widget in `LoginForm`**

Add to the imports:

```tsx
import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  TurnstileWidget,
  type TurnstileWidgetHandle,
} from "@/components/shared/turnstile-widget";
```

Add this state beside the existing `dismissedState` (after line 28):

```tsx
  // The token rides in a hidden input rather than being passed to the action
  // directly: this form is `useActionState` + a native `<form action={...}>`,
  // so there is no handleSubmit to inject it in the way the 8 public forms do.
  const [token, setToken] = useState<string | null>(null);
  const widgetRef = useRef<TurnstileWidgetHandle>(null);

  // Cloudflare tokens are single-use, so the widget must be reset after every
  // attempt. Keyed on `state` IDENTITY, not on the error text — a second
  // failure produces a new state object even when the copy reads the same,
  // the same reason `dismissedState` compares identity below.
  //
  // This only ever fires on a failure: a successful sign-in ends in
  // `redirect()`, which throws NEXT_REDIRECT and never produces a new state.
  // That keeps this clear of the standing rule that this file must not wrap
  // its action call in a catch.
  useEffect(() => {
    if (state === initialState) return;
    widgetRef.current?.reset();
    setToken(null);
  }, [state]);
```

Then, immediately above the existing `{visibleError ? ... : null}` block, add:

```tsx
      {state.challengeRequired ? (
        <>
          <input type="hidden" name="turnstileToken" value={token ?? ""} />
          <TurnstileWidget ref={widgetRef} onVerify={setToken} size="compact" />
        </>
      ) : null}
```

`size="compact"` because the form column is narrow at the mobile breakpoint. The widget's `appearance: "interaction-only"` default means it stays invisible unless Cloudflare actually wants to challenge the visitor.

- [ ] **Step 2: Enforce the token in `signIn`**

In `src/features/admin/actions/auth.ts`, immediately after `const challenge = needsChallenge(ipHits, emailHits);` from Task 3, insert:

```ts
  // NOTE the ordering: the security-hardening spec (§5) has every public form
  // verify Turnstile FIRST, before the rate limit and before Zod, so a failed
  // challenge is the cheapest possible rejection. That rule cannot hold here —
  // whether a challenge is required at all depends on state only the count
  // reads above can reveal, so they must come first. Do not "fix" this back.
  //
  // A failed challenge records NO rate-limit hit. Hits are keyed partly on
  // email, so if they counted, anyone who knows a staff address could lock
  // that person out of their own account with five tokenless POSTs.
  if (challenge) {
    const tokenValue = formData.get("turnstileToken");
    const verified = await verifyTurnstileToken(
      typeof tokenValue === "string" ? tokenValue : null,
      ip,
    );
    if (!verified) {
      // Same copy as every other rejection — never reveal which check failed.
      return { error: "Incorrect email or password.", challengeRequired: true };
    }
  }
```

`verifyTurnstileToken` is already imported on line 10 (`requestPasswordReset` uses it). Do not add a second import.

- [ ] **Step 3: Verify the build**

Run: `npm run typecheck && npm run lint && npm run test:unit`

Expected: all clean.

- [ ] **Step 4: Drive it in the browser**

Follow `.claude/skills/verify/SKILL.md`. With **no** `TURNSTILE_SECRET_KEY` set (the normal dev state), `verifyTurnstileToken` returns `true` and the widget renders nothing, so confirm the whole flow still works end to end:

1. `/admin/login`, wrong password → error, and the DOM now contains `input[name="turnstileToken"]`.
2. Correct password on the next attempt → lands in the portal.
3. Repeat at a mobile viewport (≤767px) and confirm the *visible* tree is the one showing the widget, not the hidden one.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/components/login-form.tsx src/features/admin/actions/auth.ts
git commit -m "feat: challenge admin login with Turnstile after a failed attempt"
```

---

### Task 5: Test keys and e2e coverage

**Files:**
- Modify: `.env.example`
- Modify: `tests/e2e/admin/login.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Document Cloudflare's test keys**

In `.env.example`, append to the existing Turnstile comment block, directly above the two `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` / `TURNSTILE_SECRET_KEY=` lines:

```
# Running the admin e2e suite: `/admin/login` challenges any attempt that
# follows a recent failure, and `login.spec.ts` submits five wrong passwords on
# purpose. Use Cloudflare's published always-pass test keys for those runs so
# the widget solves instantly and headlessly:
#   NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
#   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
# The site key is inlined at BUILD time, so switching between real and test
# keys needs a rebuild, not just a restart.
```

- [ ] **Step 2: Add a token-wait helper to the spec**

At the top of `tests/e2e/admin/login.spec.ts`, below the existing `test.use(...)`:

```ts
/**
 * Both responsive `<LoginForm />` trees are always mounted (one hidden via CSS
 * `display:none`), so there can be two `turnstileToken` inputs in the DOM.
 * `getByRole` skips display:none elements, so filtering on a visible Email
 * textbox picks out the form that will actually be submitted.
 */
function visibleForm(page: import("@playwright/test").Page) {
  return page.locator("form").filter({ has: page.getByRole("textbox", { name: "Email" }) });
}

/** Turnstile solves asynchronously; clicking before it does submits an empty token. */
async function waitForToken(page: import("@playwright/test").Page) {
  await expect(visibleForm(page).locator('input[name="turnstileToken"]')).toHaveValue(/.+/, {
    timeout: 15_000,
  });
}
```

- [ ] **Step 3: Wait for the token inside the existing five-failure loop**

In the `for (let i = 0; i < 5; i++)` loop, between the password `.fill(...)` and the `Sign in` click, add:

```ts
    // Attempts 2-5 are challenged (attempt 1 recorded the first failure).
    if (i > 0) await waitForToken(page);
```

Apply the same `await waitForToken(page);` before the `Sign in` click in both blocks *after* the loop — the 6th attempt and the correct-password attempt. Both follow five recorded failures, so both are challenged.

- [ ] **Step 4: Write the three new assertions**

Append to the same file:

```ts
test("the challenge appears only after a failed attempt, and the server enforces it", async ({
  page,
}) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test.");

  // A fresh email key, so this test never inherits failures from another run.
  // Any well-formed address works: signIn reads the count before it ever asks
  // Supabase Auth whether the account exists.
  const unknownEmail = `no-such-user-${Date.now()}@example.com`;

  // 1. First attempt on a clean key: no challenge.
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "Email" }).fill(unknownEmail);
  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
  await expect(visibleForm(page).locator('input[name="turnstileToken"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();

  // 2. Second attempt: the challenge is now mounted.
  await expect(visibleForm(page).locator('input[name="turnstileToken"]')).toHaveCount(1);

  // 3. The server refuses a tokenless POST even with the CORRECT password.
  //    Blanking the input proves the gate lives in signIn, not in the widget.
  await page.getByRole("textbox", { name: "Email" }).fill(email!);
  await page.getByRole("textbox", { name: "Password" }).fill(password!);
  await waitForToken(page);
  await visibleForm(page)
    .locator('input[name="turnstileToken"]')
    .evaluate((el) => {
      (el as HTMLInputElement).value = "";
    });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/admin(?!\/login)/);
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});
```

Note this test deliberately spends its failures on a throwaway address, so it does not push the real `E2E_ADMIN_EMAIL` toward the 5-failure block that `auth.setup.ts` would then trip on. Step 3's assertion in the *existing* test still exercises the real address, unchanged.

- [ ] **Step 5: Prove each new assertion can fail**

*A guard that has never been seen to fail is not a guard.* Run the new test three times, each with one thing reverted, and confirm the matching assertion fails:

| Revert | Assertion that must fail |
|---|---|
| Force `challengeRequired: true` on the Zod-failure return in `signIn` | #1 (`toHaveCount(0)`) |
| Force `challengeRequired: false` on the bad-password return | #2 (`toHaveCount(1)`) |
| Delete the `if (challenge) { ... }` enforcement block from `signIn` | #3 (reaches `/admin`) |

Restore each revert before moving to the next.

- [ ] **Step 6: Run the suite**

Set the test keys from Step 1 in `.env.local`, rebuild (the site key is inlined at build time), then run:

```bash
npm run test:e2e -- --project=admin login
```

Expected: both tests pass.

**Rate-limit budget:** this spec now spends 6 hits on `login:email:<test-admin>` plus 3 on a throwaway address per run, against `LOGIN_LIMIT` = 5 per 15 minutes. A second run inside that window fails at `auth.setup.ts`, which `playwright.config.ts` runs before every `admin`-project test — so the whole project fails, not just this file. That is a collision, not a regression. This is the pre-existing hazard CLAUDE.md documents under Commands, unchanged in kind.

- [ ] **Step 7: Commit**

```bash
git add .env.example tests/e2e/admin/login.spec.ts
git commit -m "test: cover the adaptive login challenge and its server-side gate"
```

---

### Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the feature bullet**

Add a new bullet to the **Architecture** section, directly after the `/admin/login` split-screen bullet (it is the closest neighbour and readers will look there):

```markdown
- **Admin login is challenged adaptively, not always, 2026-08-03**
  (`docs/superpowers/specs/2026-08-03-admin-login-captcha-design.md`). `/admin/login`
  shows a Turnstile challenge **only after a failed attempt** on that IP or email —
  the trigger is >= 1 hit on `login:ip:*`/`login:email:*` inside the unchanged
  `LOGIN_WINDOW_MS`, read off the same `rate_limit_hits` rows (migration `0029`)
  that already drive the 5-failure block. No new table, column, or key namespace.
  **Always-on was deliberately rejected**: `verifyTurnstileToken` fails closed and
  throws in production on a missing key, so mounting the widget unconditionally
  would put a hard Cloudflare dependency in front of the only door into the portal —
  an outage, a blocked network, or a key rotation (the site key is inlined at build
  time, so rotation needs a rebuild) would lock out every staffer including the
  SuperAdmin with nobody able to sign in and fix it. Adaptive keeps that door open
  for anyone who types their password correctly. **There is deliberately no
  break-glass bypass flag** — it would be exactly the hole this closes.
  `isRateLimited` is **gone**, replaced by `countRateLimitHits(key, windowMs)`
  returning `number | null`: `signIn` reads two thresholds off each key, and a
  boolean helper meant running the same count query twice per key. The two
  thresholds interpret `null` (Supabase unreachable) in **opposite** directions, and
  that asymmetry is the point — `isOverLoginLimit` fails **open** (unchanged: a
  limiter outage must not lock out real staff), `needsChallenge` fails **closed**,
  so the outage that previously removed *all* brute-force protection now makes login
  challenge every attempt instead. Both predicates are pure and unit-tested in
  `tests/unit/login-challenge.test.ts`; they live in
  `src/features/admin/lib/login-challenge.ts` (beside `build-full-name.ts`) because
  `actions/auth.ts` is `"use server"` and Vitest cannot import it.
  `AuthFormState.challengeRequired` is a **UI hint only** — `signIn` recomputes the
  condition server-side every call, so a client that never mounts the widget is
  refused identically. **The Turnstile check runs AFTER the count reads, inverting
  the security-hardening spec's §5 "verify first" rule**, because whether a
  challenge is required at all depends on state only those reads reveal; commented
  at the call site so it doesn't get "fixed" back. **A failed or missing token
  records no rate-limit hit** — hits are keyed partly on email, so counting them
  would let anyone lock a known staff address out with five tokenless POSTs.
  Client-side, this form is the one that can't follow the 8 public forms' pattern:
  it is `useActionState` + a native `<form action={...}>` with no `handleSubmit`, so
  the token rides in a hidden `turnstileToken` input and the single-use widget is
  `reset()` from a `useEffect` keyed on `state` **identity** (a second failure
  yields a new state object with identical copy — the same reason `dismissedState`
  compares identity). That effect only fires on failures, since a successful sign-in
  throws `NEXT_REDIRECT` and never returns a new state, which keeps `login-form.tsx`
  clear of the standing "never wrap `signIn` in a catch" rule. `LoginForm` mounts
  twice (both responsive trees), so two widget instances exist once challenged; the
  hidden one may never solve and nothing depends on it.
```

- [ ] **Step 2: Note the new e2e key requirement**

In the **Commands** section, extend the existing paragraph about non-idempotent suites — `tests/e2e/admin/login.spec.ts` already appears there. Append:

```markdown
**Since the adaptive login challenge shipped (2026-08-03), `login.spec.ts` also
needs Turnstile keys that solve headlessly**: attempts 2-6 of its five-failure test
are challenged, as is its correct-password attempt. Use Cloudflare's always-pass
test keys (documented in `.env.example`) for admin e2e runs — and remember the site
key is inlined at build time, so switching between real and test keys needs a
rebuild, not just a restart. Its budget per run is now 6 hits on
`login:email:<test-admin>` plus 3 on a throwaway address, against `LOGIN_LIMIT` = 5
per 15 minutes.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the adaptive admin login challenge"
```

---

## Verification Checklist

Run before considering the plan complete:

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npm run test:unit` — passes, including `login-challenge.test.ts`
- [ ] `npm run test:e2e -- --project=public` — passes (unaffected, but proves nothing regressed in the shared Turnstile widget)
- [ ] `npm run test:e2e -- --project=admin login` — passes with test keys set
- [ ] `grep -rn "isRateLimited" src/ tests/` — no matches
- [ ] `npm run build` — succeeds
- [ ] CLAUDE.md updated in this same session
