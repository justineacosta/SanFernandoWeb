# Security Hardening — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the lower-risk, no-external-dependency items from the 2026-07-28 security-hardening spec: the Next 16 middleware→proxy rename, the dependency CVE bump, a durable rate limiter, admin login rate limiting, security response headers, privacy/terms pages, and an RLS+CSRF verification pass.

**Architecture:** No new architectural layer — every change either swaps an implementation behind an existing interface (`checkRateLimit`'s signature stays, only its storage changes) or adds a self-contained new surface (headers config, two static pages). Nothing here touches the upload/compensating-delete pattern.

**Tech Stack:** Next.js 16, Supabase (Postgres, RLS-enabled-zero-policies pattern), Zod, Playwright (`tests/e2e/public/*.spec.ts`), Vitest (`tests/unit/*.test.ts`).

## Global Constraints

- This is Plan 1 of 3 from `docs/superpowers/specs/2026-07-28-security-hardening-design.md`. Turnstile CAPTCHA (spec §5) and the PDF-upload Route Handler / body-size-limit scoping (spec §6) are **out of scope** here — separate plans, because both need either an external account or a materially larger refactor.
- Every migration in this repo is applied **staging first, then production, manually, by the repo owner** — never assume a migration is applied without confirmation. New migration here is `0029_rate_limit_hits.sql`.
- RLS pattern for any new table: **enabled, zero policies** — the service-role client is the entire gate. Do not add a policy.
- `checkRateLimit(key, limit, windowMs)` becomes `async` in Task 3. Every existing call site must be updated in the same task — the codebase must never be left with a mix of awaited and un-awaited calls.
- CLAUDE.md and `docs/BACKEND_HANDOFF.md` get updated in the same session as any change with architectural consequence, per this repo's standing rule (CLAUDE.md's own header). Each task below says exactly which lines.
- Comment style in this codebase explains **why**, not what — match the tone of the surrounding file when editing comments, not just the code.
- Windows dev environment: use `PowerShell`-safe commands where the plan shows a shell step; forward slashes in paths work fine inside this repo's own tooling (`npm`, `next`).

---

### Task 1: Rename `middleware.ts` to `proxy.ts`

**Files:**
- Create: `src/proxy.ts`
- Delete: `src/middleware.ts`
- Modify: `CLAUDE.md:243-246`, `CLAUDE.md:255-259`, `CLAUDE.md:262-266`, `CLAUDE.md:280-281`
- Modify: `docs/BACKEND_HANDOFF.md:1055`
- Modify: `src/lib/session-activity.ts:18-22`, `src/lib/session-activity.ts:31-35`
- Modify: `src/lib/auth.ts:51-53`
- Modify: `src/lib/supabase/server.ts:23`
- Modify: `src/app/api/admin/notifications/route.ts:7`, `src/app/api/admin/notifications/route.ts:9`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `src/proxy.ts` exporting `proxy(request: NextRequest)` and `config.matcher` — Next's file-convention pickup, not an import, so no other task-file imports this by name.

- [ ] **Step 1: Create `src/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  ACTIVITY_COOKIE,
  ACTIVITY_COOKIE_PATH,
  activityCookieOptions,
  hasActivityCookie,
} from "@/lib/session-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordActivity } from "@/lib/audit";

/**
 * Next prefetches admin links on hover and on viewport entry. Those GETs must
 * not refresh the activity cookie: a page holding many links would keep its
 * own session alive with no human present.
 */
function isPrefetch(request: NextRequest): boolean {
  return (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch"
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session cookie when expired — do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Exact match — assumes no nested routes exist under /admin/login.
  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  const secure = request.nextUrl.protocol === "https:";

  if (!user && !isLoginPage) {
    const redirectResponse = NextResponse.redirect(
      new URL("/admin/login", request.url),
    );
    // Carry refreshed session cookies onto the redirect — getUser() may have rotated them.
    response.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  /*
   * The idle gate. A valid Supabase session with no activity cookie means the
   * user has been idle for 30 minutes, or the window was closed that long —
   * the browser expired the cookie on disk either way.
   *
   * The auth cookies are cleared here rather than by delegating to an
   * /admin/logout route handler: a GET that signs you out is CSRF-able, and an
   * <img src="/admin/logout"> on any page would sign an admin out. The cost is
   * that the refresh token is not revoked at Supabase, only deleted from the
   * browser — accepted, because the only copy is the one being deleted.
   *
   * No loop is possible. A signed-in user landing on /admin/login is bounced
   * to /admin below; that GET arrives here without a cookie, clears the
   * session, and returns to /admin/login — where `user` is now null and the
   * page simply renders.
   *
   * This is also this Proxy's only audit hook: <IdleTimeout /> logs the
   * open-tab case itself via signOutIdle, but a tab that was closed has no
   * client running to call it. This branch is where that idle sign-out is
   * *discovered*, on whatever request the user (or a stale background tab)
   * next makes — so it records the audit entry here instead. Proxy defaults
   * to the Node.js runtime as of Next 16 (no explicit opt-in, unlike the old
   * `middleware.ts` convention's required `runtime: "nodejs"` — a `proxy.ts`
   * file does not accept a `runtime` config at all; setting one throws), so
   * the service-role admin client below is safe to use; profile lookup
   * bypasses RLS the same way recordActivity's other callers do.
   */
  if (
    user &&
    !isLoginPage &&
    !hasActivityCookie(request.cookies.get(ACTIVITY_COOKIE)?.value)
  ) {
    const timedOut = NextResponse.redirect(
      new URL("/admin/login?reason=timeout", request.url),
    );
    request.cookies
      .getAll()
      .filter((cookie) => cookie.name.startsWith("sb-"))
      .forEach((cookie) => timedOut.cookies.delete({ name: cookie.name, path: "/" }));
    timedOut.cookies.delete({ name: ACTIVITY_COOKIE, path: ACTIVITY_COOKIE_PATH });

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    await recordActivity(
      { id: user.id, fullName: profile?.full_name ?? "" },
      {
        type: "logout",
        action: "signed out",
        entityType: "session",
        entityId: user.id,
        detail: "signed out for inactivity",
      },
    );

    return timedOut;
  }

  if (user && isLoginPage) {
    const redirectResponse = NextResponse.redirect(
      new URL("/admin", request.url),
    );
    response.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  // A real page navigation by a signed-in user IS activity — slide the window.
  if (user && !isLoginPage && !isPrefetch(request)) {
    response.cookies.set(activityCookieOptions(secure));
  }

  return response;
}

export const config = {
  // Server Action POSTs (identified by the `Next-Action` header) are excluded:
  // Next.js buffers/clones the request body for any matched route
  // (`proxyClientMaxBodySize`, 10MB default) before it reaches the action's
  // own multipart parser, silently truncating large PDF uploads and causing
  // an unhandled "Unexpected end of form" crash instead of the app's own
  // 10MB validation message. Skipping Proxy here is safe: every admin Server
  // Action independently re-checks auth via checkPermission()/checkSuperAdmin(),
  // and — unlike Server Components — cookies() is mutable inside a Server
  // Action, so the Supabase server client (src/lib/supabase/server.ts)
  // refreshes the session cookie itself when the action calls getUser(). Page
  // navigations (GET requests, no Next-Action header) still go through Proxy
  // and get the redirect-to-login / redirect-to-/admin convenience.
  //
  // This is also why Proxy cannot be the only idle gate: a user working
  // inside a drawer submits POSTs that never reach here. getSessionUser() in
  // src/lib/auth.ts is the second gate and covers them.
  matcher: [{ source: "/admin/:path*", missing: [{ type: "header", key: "next-action" }] }],
};
```

- [ ] **Step 2: Delete the old file**

```bash
git rm src/middleware.ts
```

- [ ] **Step 3: Update `CLAUDE.md`**

At `CLAUDE.md:243-246`, replace:

```
  cookie's `Max-Age` are one derived value, never two literals. **Two gates read it:**
  `src/middleware.ts` for page GETs, and `getSessionUser()` for everything else — the
  second is not redundant, because Server Action POSTs are excluded from the middleware
  matcher on purpose. `getSessionUserIgnoringIdle` exists for exactly one caller,
```

with:

```
  cookie's `Max-Age` are one derived value, never two literals. **Two gates read it:**
  `src/proxy.ts` (renamed from `middleware.ts` in the 2026-07-28 hardening pass — Next 16
  deprecated the `middleware` file convention in favor of `proxy`) for page GETs, and
  `getSessionUser()` for everything else — the second is not redundant, because Server
  Action POSTs are excluded from the Proxy matcher on purpose. `getSessionUserIgnoringIdle`
  exists for exactly one caller,
```

At `CLAUDE.md:255-259`, replace:

```
  **The closed-window idle sign-out is audited too, discovered rather than witnessed:**
  `signOutIdle` (open tab, client-driven) and the middleware idle-gate branch
  (`src/middleware.ts`, closed tab) both end with the same `audit_log` shape — `type:
  "logout"`, `detail: "signed out for inactivity"` — but the middleware branch has no
  live client to call `signOutIdle` from, since discovering the expiry *is* the request
```

with:

```
  **The closed-window idle sign-out is audited too, discovered rather than witnessed:**
  `signOutIdle` (open tab, client-driven) and the Proxy idle-gate branch
  (`src/proxy.ts`, closed tab) both end with the same `audit_log` shape — `type:
  "logout"`, `detail: "signed out for inactivity"` — but the Proxy branch has no
  live client to call `signOutIdle` from, since discovering the expiry *is* the request
```

At `CLAUDE.md:262-266`, replace:

```
  RLS policies, so nothing else can read it there), and calls `recordActivity` directly.
  This is the one reason `middleware.ts` opts into `export const config = { runtime:
  "nodejs" }` — Next 16's stable, non-experimental way to move a middleware file off the
  Edge default — since a service-role client and an audit insert are not something to
  assume is Edge-safe.
```

with:

```
  RLS policies, so nothing else can read it there), and calls `recordActivity` directly.
  This runs safely because Proxy defaults to the Node.js runtime as of Next 16 — a
  service-role client and an audit insert are not something to assume is Edge-safe, and
  unlike the old `middleware.ts` convention (which required an explicit `runtime: "nodejs"`
  opt-in), `proxy.ts` does not accept a `runtime` config at all; setting one throws.
```

At `CLAUDE.md:280-281`, replace:

```
  `NotificationProvider` runs the one 60s poll (`GET /api/admin/notifications`, outside
  `src/middleware.ts`'s matcher, so it re-checks `getSessionUser` itself) that feeds the sidebar
```

with:

```
  `NotificationProvider` runs the one 60s poll (`GET /api/admin/notifications`, outside
  `src/proxy.ts`'s matcher, so it re-checks `getSessionUser` itself) that feeds the sidebar
```

- [ ] **Step 4: Update `docs/BACKEND_HANDOFF.md`**

At line 1055 (the "Auth" row of the tech-stack table), replace the substring `` `src/middleware.ts` redirects unauthenticated `` with `` `src/proxy.ts` redirects unauthenticated `` — the rest of that table row is unchanged.

- [ ] **Step 5: Update the remaining comment references**

These four files have comments naming the file — the code logic is untouched, only the identifier:

- `src/lib/session-activity.ts:20` — `(src/middleware.ts, src/lib/auth.ts)` → `(src/proxy.ts, src/lib/auth.ts)`.
- `src/lib/session-activity.ts:33` — `middleware's matcher below is scoped` → `Proxy's matcher is scoped`.
- `src/lib/auth.ts:51-53` — `The idle check lives here, not only in middleware, because Server Action POSTs are excluded from the middleware matcher on purpose (see the comment on config in src/middleware.ts).` → `The idle check lives here, not only in Proxy, because Server Action POSTs are excluded from the Proxy matcher on purpose (see the comment on config in src/proxy.ts).`
- `src/lib/supabase/server.ts:23` — `// middleware handles the session refresh in that case.` → `// Proxy handles the session refresh in that case.`
- `src/app/api/admin/notifications/route.ts:7` — `` `src/middleware.ts`'s matcher `` → `` `src/proxy.ts`'s matcher ``.
- `src/app/api/admin/notifications/route.ts:9` — `second of the project's two idle gates and middleware only covers page` → `second of the project's two idle gates and Proxy only covers page`.

- [ ] **Step 6: Build and smoke-test**

```bash
npm run build
```

Expected: the build output no longer contains `The "middleware" file convention is deprecated`. Then start the dev server (`npm run dev`) and manually verify, since this file gates all of `/admin`:
1. Visiting `/admin` while signed out redirects to `/admin/login`.
2. Signing in with `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (from `.env.local`) redirects to the portal.
3. Visiting `/admin/login` while already signed in redirects back to `/admin`.

- [ ] **Step 7: Typecheck and lint**

```bash
npm run typecheck
npm run lint
```

Expected: both pass with no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/proxy.ts CLAUDE.md docs/BACKEND_HANDOFF.md src/lib/session-activity.ts src/lib/auth.ts src/lib/supabase/server.ts src/app/api/admin/notifications/route.ts
git commit -m "fix: rename middleware.ts to proxy.ts (Next 16 file-convention rename)"
```

---

### Task 2: Dependency upgrade — clear the 3 high-severity `npm audit` findings

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks import — this only changes installed versions.

- [ ] **Step 1: Confirm the current findings**

```bash
npm audit
```

Expected: 3 high-severity advisories, the two most relevant being against `next@16.2.10` — "Middleware / Proxy bypass in App Router applications" and "Unauthenticated disclosure of internal Server Function endpoints" — plus transitive `postcss`/`sharp` findings.

- [ ] **Step 2: Bump `next` to the latest in-range patch**

```bash
npm install next@16.2.12
```

This stays inside the existing `"next": "^16.0.0"` range in `package.json` — no major-version jump.

- [ ] **Step 3: Fix the transitive findings**

```bash
npm audit fix
```

- [ ] **Step 4: Re-run audit and confirm clean**

```bash
npm audit
```

Expected: `found 0 vulnerabilities`. If anything remains, do not proceed to Step 5 — note the specific remaining advisory here in this plan file before continuing, so it isn't silently dropped.

- [ ] **Step 5: Full verification pass**

```bash
npm run build
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e:public
```

Expected: all pass. This is a framework-level bump, so the full suite runs, not just a spot check.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix: bump next to 16.2.12 and clear 3 high-severity npm audit findings"
```

---

### Task 3: Durable, Supabase-backed rate limiter

**Files:**
- Create: `supabase/migrations/0029_rate_limit_hits.sql`
- Modify: `src/lib/rate-limit.ts`
- Modify: `src/features/appointments/actions.ts:20`, `src/features/announcements/actions.ts:30`, `src/features/track/actions.ts:41`, `src/features/complaints/actions.ts:21`, `src/features/contact/actions.ts:31`, `src/features/assistance/actions.ts:20`, `src/features/services/actions.ts:22`, `src/features/feedback/actions.ts:37`
- Test: `tests/e2e/public/feedback.spec.ts`

**Interfaces:**
- Consumes: `createSupabaseAdminClient` from `src/lib/supabase/admin.ts` (already used identically by every action file this touches).
- Produces: `checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean>` — was synchronous, now `async`. `requestIp(): Promise<string>` is unchanged. Task 4 (login rate limiting) calls this new async `checkRateLimit`.

- [ ] **Step 1: Write the migration**

```sql
-- Durable rate limiting: replaces the in-memory limiter in src/lib/rate-limit.ts.
--
-- The previous implementation (a plain in-memory Map) resets on every
-- redeploy and does not share state across serverless instances — flagged in
-- its own top-of-file comment since Plan 3. checkRateLimit() now counts rows
-- in this table instead of a Map, so the limit holds regardless of which
-- instance serves a given request or how recently the process restarted.
--
-- RLS: enabled with NO policies, exactly like every other table — only the
-- service-role client (inside checkRateLimit itself) ever touches this.
--
-- No cleanup job: checkRateLimit() opportunistically deletes rows older than
-- 24 hours on a small random fraction of calls, mirroring the "opportunistic
-- sweep" the old in-memory Map already did once it grew past 5000 keys. This
-- avoids adding a pg_cron dependency for a table that self-limits in size.

create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  key text not null,
  hit_at timestamptz not null default now()
);

-- Every checkRateLimit() call filters by key and a recent hit_at window —
-- this composite index serves both the count and the cleanup delete.
create index rate_limit_hits_key_hit_at_idx
  on public.rate_limit_hits (key, hit_at desc);

alter table public.rate_limit_hits enable row level security;
```

- [ ] **Step 2: Note the staging-apply requirement**

This migration must be applied to staging by the repo owner before Step 4's e2e test can pass against staging, and to production before this code is deployed there — same discipline as every prior migration. Flag this to the repo owner now; do not proceed to Step 3 assuming it is already applied.

- [ ] **Step 3: Rewrite `src/lib/rate-limit.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Durable sliding-window limiter backed by the rate_limit_hits table
 * (migration 0029). Replaces the earlier in-memory Map, which reset on every
 * redeploy and did not share state across serverless instances.
 *
 * True when the caller is still within budget. Records the attempt only when
 * it's within budget — a caller hammering past the limit must not keep
 * pushing its own window forward with rejected attempts.
 *
 * Fails open on a Supabase error: an outage in the rate limiter must not take
 * down the public forms it protects, which still have their own Zod
 * validation as the real correctness gate. For the one fail-closed-sensitive
 * caller (admin login, added in the hardening pass) this is still safe: if
 * Supabase itself is unreachable, signInWithPassword fails too, so there is
 * no window where brute-forcing succeeds because rate limiting alone is down.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - windowMs).toISOString();

  const { count, error } = await admin
    .from("rate_limit_hits")
    .select("id", { count: "exact", head: true })
    .eq("key", key)
    .gte("hit_at", since);

  if (error) {
    console.error("checkRateLimit count failed:", error.message);
    return true;
  }
  if ((count ?? 0) >= limit) return false;

  const { error: insertError } = await admin.from("rate_limit_hits").insert({ key });
  if (insertError) {
    console.error("checkRateLimit insert failed:", insertError.message);
  }

  // Opportunistic sweep, ~1% of calls: keeps the table from growing forever
  // without a scheduled job. 24h is comfortably past every window this file's
  // callers use (the widest is 1 hour).
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await admin.from("rate_limit_hits").delete().lt("hit_at", cutoff);
  }

  return true;
}

/** Caller IP from the proxy headers, or a shared fallback bucket. */
export async function requestIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || store.get("x-real-ip") || "unknown";
}
```

- [ ] **Step 4: Update all 8 call sites to `await` the now-async check**

Each of these is the same one-line change — wrap the call in `await` and parenthesize for the `!` operator. Apply exactly:

`src/features/appointments/actions.ts:20`
```diff
-  if (!checkRateLimit(`appointment:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
+  if (!(await checkRateLimit(`appointment:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
```

`src/features/announcements/actions.ts:30`
```diff
-  if (!checkRateLimit(`subscribe:${ip}`, SUBSCRIBE_LIMIT, SUBSCRIBE_WINDOW_MS)) {
+  if (!(await checkRateLimit(`subscribe:${ip}`, SUBSCRIBE_LIMIT, SUBSCRIBE_WINDOW_MS))) {
```

`src/features/track/actions.ts:41`
```diff
-  if (!checkRateLimit(`track:${ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW_MS)) {
+  if (!(await checkRateLimit(`track:${ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW_MS))) {
```

`src/features/complaints/actions.ts:21`
```diff
-  if (!checkRateLimit(`complaint:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
+  if (!(await checkRateLimit(`complaint:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
```

`src/features/contact/actions.ts:31`
```diff
-  if (!checkRateLimit(`inquiry:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
+  if (!(await checkRateLimit(`inquiry:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
```

`src/features/assistance/actions.ts:20`
```diff
-  if (!checkRateLimit(`assistance:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
+  if (!(await checkRateLimit(`assistance:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
```

`src/features/services/actions.ts:22`
```diff
-  if (!checkRateLimit(`apply:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
+  if (!(await checkRateLimit(`apply:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
```

`src/features/feedback/actions.ts:37`
```diff
-  if (!checkRateLimit(`feedback:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
+  if (!(await checkRateLimit(`feedback:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS))) {
```

- [ ] **Step 5: Write the e2e test proving the durable limiter still enforces the limit**

Append to `tests/e2e/public/feedback.spec.ts` (feedback has the tightest budget of the 8 forms — `SUBMIT_LIMIT = 3` — so it trips fastest):

```ts
test("the rate limit blocks a 4th submission within the window", async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await page.goto("/");
    await page.getByRole("button", { name: /send feedback about this website/i }).click();
    await page.getByRole("radio", { name: "General Feedback" }).click();
    await page.getByLabel("Subject").fill(`E2E: rate limit probe ${i}`);
    await page
      .getByLabel("Message")
      .fill("Filed by the Playwright rate-limit test. Safe to ignore/delete.");
    await page.getByRole("button", { name: /^send feedback$/i }).click();
    await expect(page.getByText(/this reached the barangay/i)).toBeVisible();
  }

  await page.goto("/");
  await page.getByRole("button", { name: /send feedback about this website/i }).click();
  await page.getByRole("radio", { name: "General Feedback" }).click();
  await page.getByLabel("Subject").fill("E2E: rate limit probe 4th");
  await page.getByLabel("Message").fill("This one should be blocked by the limiter.");
  await page.getByRole("button", { name: /^send feedback$/i }).click();

  await expect(page.getByText(/too much feedback from this connection/i)).toBeVisible();
});
```

- [ ] **Step 6: Run it**

```bash
npx playwright test --project=public tests/e2e/public/feedback.spec.ts
```

Expected: PASS, against a staging environment with migration `0029` applied (see Step 2). This test shares an IP-scoped budget with any other run in the same hour — if it's re-run within an hour of itself, the earlier 3 submissions already count, so the 4th-submission assertion may need to run standalone the second time. That's expected behavior of the limiter working, not a test bug.

- [ ] **Step 7: Full check**

```bash
npm run typecheck
npm run lint
npm run test:unit
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0029_rate_limit_hits.sql src/lib/rate-limit.ts src/features/appointments/actions.ts src/features/announcements/actions.ts src/features/track/actions.ts src/features/complaints/actions.ts src/features/contact/actions.ts src/features/assistance/actions.ts src/features/services/actions.ts src/features/feedback/actions.ts tests/e2e/public/feedback.spec.ts
git commit -m "fix: back the rate limiter with a durable Supabase table instead of an in-memory Map"
```

---

### Task 4: Admin login rate limiting

**Files:**
- Modify: `src/features/admin/actions/auth.ts`
- Test: `tests/e2e/admin/login.spec.ts` (new)

**Interfaces:**
- Consumes: `checkRateLimit`, `requestIp` from `src/lib/rate-limit.ts` (Task 3's async version).
- Produces: nothing new other tasks depend on.

- [ ] **Step 1: Add the rate limit to `signIn`**

In `src/features/admin/actions/auth.ts`, add the import and constants near the top:

```ts
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
```

```ts
/** Tighter than the public forms' hour-long windows — credential-stuffing arrives fast. */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
```

Then modify `signIn` — insert the rate-limit check right after the schema parse succeeds, before the Supabase call:

```ts
export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  // Two keys: IP stops one source hammering many accounts, email stops a
  // distributed attempt against one account. Both are checked (not
  // short-circuited) so both budgets tighten regardless of which one an
  // attacker is closer to tripping.
  const ip = await requestIp();
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const withinIpLimit = await checkRateLimit(`login:ip:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  const withinEmailLimit = await checkRateLimit(
    `login:email:${normalizedEmail}`,
    LOGIN_LIMIT,
    LOGIN_WINDOW_MS,
  );
  if (!withinIpLimit || !withinEmailLimit) {
    // Same copy as a real bad password — a distinct "too many attempts"
    // message would confirm to an attacker that their guesses were arriving.
    return { error: "Incorrect email or password." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

  // ... rest of the function is unchanged from here
```

Everything from `const { data: profile } = await supabase...` onward in the existing function body stays exactly as-is — only the block above is new, inserted between the schema parse and the existing `const supabase = await createSupabaseServerClient();` line (which now appears once, not duplicated).

- [ ] **Step 2: Write the e2e test**

Create `tests/e2e/admin/login.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/**
 * Runs against the `admin` Playwright project, but deliberately does NOT use
 * the shared signed-in storage state — this test needs to submit the login
 * form itself, repeatedly, with a wrong password.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("repeated bad passwords trip the login rate limit", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  test.skip(!email, "Set E2E_ADMIN_EMAIL in .env.local to run this test.");

  for (let i = 0; i < 5; i++) {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByRole("textbox", { name: "Password" }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }

  // 6th attempt: still the same message (rate limit and bad-password share
  // copy on purpose), but this one is the limiter, not a real auth check.
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByRole("textbox", { name: "Password" }).fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  // The real assertion: even the CORRECT password is now refused, proving
  // this was the limiter and not just another wrong-password rejection.
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (password) {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/admin(?!\/login)/);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
});
```

- [ ] **Step 3: Run it**

```bash
npx playwright test --project=admin tests/e2e/admin/login.spec.ts
```

Expected: PASS. Note this test locks out the real `E2E_ADMIN_EMAIL` account for `LOGIN_WINDOW_MS` (15 minutes) — run it last among the admin suite, or expect the `setup` project's `auth.setup.ts` to fail if it runs again within that window. Re-running the full `admin` project immediately after this test is a known, expected friction, not a bug.

- [ ] **Step 4: Full check**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions/auth.ts tests/e2e/admin/login.spec.ts
git commit -m "fix: rate-limit admin login by IP and by email"
```

---

### Task 5: Security response headers

**Files:**
- Modify: `next.config.ts`
- Test: `tests/e2e/public/site.spec.ts`

**Interfaces:**
- Consumes: `process.env.NEXT_PUBLIC_SUPABASE_URL` (already read by this file for `images.remotePatterns`).
- Produces: nothing other tasks import — config-only.

- [ ] **Step 1: Add the `headers()` export and CSP**

Replace the full contents of `next.config.ts` with:

```ts
import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

// Shared between images.remotePatterns and the CSP's img-src/connect-src —
// one derived value, not two literals that could drift apart.
const supabaseOrigin = supabaseHost ? `https://${supabaseHost}` : "";

// The two 'unsafe-inline's are a known, named compromise: react-easy-crop
// injects its own <style> tag (see CLAUDE.md's avatar-cropper bullet), and
// Tailwind's arbitrary values / Motion rely on inline styles too. A
// nonce-based strict CSP is a materially bigger change — see the 2026-07-28
// security-hardening spec §4 for the full reasoning. This still blocks
// framing, arbitrary <object> embeds, and exfiltration to an
// attacker-controlled connect-src.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `img-src 'self' data: https://lh3.googleusercontent.com ${supabaseOrigin}`.trim(),
  `connect-src 'self' ${supabaseOrigin}`.trim(),
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Legislative/transparency PDFs are validated server-side against a
      // 10 MB cap (see MAX_PDF_BYTES in src/lib/storage.ts); the framework's
      // default 1 MB Server Action body limit would otherwise reject any
      // upload above 1 MB with an opaque framework error before that check
      // ever runs. Sized with headroom for multipart/form-data framing
      // overhead above the raw 10 MB file payload.
      //
      // TODO(security-hardening plan 3): this is global, so it also raises
      // the accepted body size on every public unauthenticated Server
      // Action. The PDF-upload Route Handler plan removes this line
      // entirely once uploads no longer flow through a Server Action body.
      bodySizeLimit: "12mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      ...(supabaseHost
        ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Manual CSP check across every distinct page template**

Start the dev server (`npm run dev`) and, with the browser devtools console open, load each of: the public home page (`/`), an article detail page (`/announcements/[slug]` for any published article), the admin dashboard (signed in), an admin drawer editor (open any manager and click "New"/"Edit"), and the avatar cropper (Settings → Profile → change photo). Confirm **zero** `Refused to ... because it violates the following Content Security Policy directive` errors in the console. If any appear, the CSP in Step 1 needs a directive adjusted — do not proceed to Step 3 with known violations.

- [ ] **Step 3: Write the e2e tests**

Append to `tests/e2e/public/site.spec.ts`:

```ts
test("responses carry the baseline security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("the home page produces no CSP violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("Content Security Policy")) {
      violations.push(msg.text());
    }
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(violations).toEqual([]);
});
```

- [ ] **Step 4: Run it**

```bash
npx playwright test --project=public tests/e2e/public/site.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Full check**

```bash
npm run build
npm run typecheck
npm run lint
```

Run the CSP manual check from Step 2 again against the **production build** (`npm run build && npm run start`, then repeat the page-by-page console check) — CSP enforcement can differ slightly between `next dev` and a production build, and this header only matters in production.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts tests/e2e/public/site.spec.ts
git commit -m "feat: add security response headers and a scoped CSP"
```

---

### Task 6: Privacy policy + Terms of Use pages

**Files:**
- Create: `src/features/legal/data.ts`
- Create: `src/app/(public)/privacy/page.tsx`
- Create: `src/app/(public)/terms/page.tsx`
- Modify: `src/constants/site.ts` (the `LEGAL_LINKS` array — currently both entries point at `"#"`)
- Test: `tests/e2e/public/site.spec.ts`

**Interfaces:**
- Consumes: `PageHero` (`src/components/sections/page-hero.tsx`), `Container` (`src/components/ui/container.tsx`) — both already used identically by `src/app/(public)/about/page.tsx`.
- Produces: routes `/privacy` and `/terms`; no other task depends on these.

- [ ] **Step 1: Write the content module**

Create `src/features/legal/data.ts`:

```ts
export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

/**
 * Placeholder text only — same treatment CLAUDE.md already documents for
 * CAPTAIN.message in src/features/about/data.ts: real legal text has to come
 * from the barangay/legal counsel before launch. Inventing convincing-
 * sounding legal language here would be worse than the gap staying visible.
 */
export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  intro:
    "This page has not yet been reviewed by the barangay or legal counsel. The text below is a placeholder outline, not the barangay's actual privacy policy.",
  sections: [
    {
      heading: "What this page will cover",
      body: [
        "How information submitted through this website — certificate applications, appointments, complaints, assistance requests, contact messages, alert sign-ups, and anonymous site feedback — is collected, used, and retained.",
        "Real policy text is pending review from the barangay and legal counsel before this site launches publicly.",
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  title: "Terms of Use",
  intro:
    "This page has not yet been reviewed by the barangay or legal counsel. The text below is a placeholder outline, not the barangay's actual terms of use.",
  sections: [
    {
      heading: "What this page will cover",
      body: [
        "The rules for using this website: the four ticketing flows, the transparency document archive, the public contact and feedback forms, and account use for signed-in staff.",
        "Real terms text is pending review from the barangay and legal counsel before this site launches publicly.",
      ],
    },
  ],
};
```

- [ ] **Step 2: Write the two pages**

Create `src/app/(public)/privacy/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Container } from "@/components/ui/container";
import { PRIVACY_POLICY } from "@/features/legal/data";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Barangay San Fernando handles information submitted through this website.",
};

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title={PRIVACY_POLICY.title} description={PRIVACY_POLICY.intro} />
      <Container className="pb-20">
        <div className="mx-auto max-w-3xl space-y-10">
          {PRIVACY_POLICY.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-xl font-semibold text-ink-900">{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-ink-600">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
```

Create `src/app/(public)/terms/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Container } from "@/components/ui/container";
import { TERMS_OF_USE } from "@/features/legal/data";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for using the Barangay San Fernando website.",
};

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title={TERMS_OF_USE.title} description={TERMS_OF_USE.intro} />
      <Container className="pb-20">
        <div className="mx-auto max-w-3xl space-y-10">
          {TERMS_OF_USE.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-xl font-semibold text-ink-900">{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-ink-600">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
```

- [ ] **Step 3: Wire the existing footer links**

In `src/constants/site.ts`, find:

```ts
export const LEGAL_LINKS: NavItem[] = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Use", href: "#" },
];
```

Replace with:

```ts
export const LEGAL_LINKS: NavItem[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms" },
];
```

`src/components/layout/site-footer.tsx` already renders `LEGAL_LINKS` as `<Link>`s — no change needed there.

- [ ] **Step 4: Write the e2e test**

Append to `tests/e2e/public/site.spec.ts`:

```ts
test.describe("legal pages", () => {
  test("privacy and terms are reachable from the footer", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: "Terms of Use" }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { name: "Terms of Use", level: 1 })).toBeVisible();
  });
});
```

- [ ] **Step 5: Run it**

```bash
npx playwright test --project=public tests/e2e/public/site.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Full check**

```bash
npm run build
npm run typecheck
npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/features/legal/data.ts "src/app/(public)/privacy/page.tsx" "src/app/(public)/terms/page.tsx" src/constants/site.ts tests/e2e/public/site.spec.ts
git commit -m "feat: add placeholder privacy policy and terms of use pages"
```

---

### Task 7: RLS + CSRF verification pass

**Files:**
- Modify: `docs/BACKEND_HANDOFF.md` (append to §6, Known Gaps / Tech Debt)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — this is a verification task with a documentation output, not code.

- [ ] **Step 1: Query every table's RLS policies**

Against the **staging** Supabase project (SQL editor or `psql`), run:

```sql
-- Expected: zero rows. Every application table should be RLS-enabled with no
-- policies at all — the service-role client is the entire gate.
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public';
```

```sql
-- Expected: only the documented public-read policies on storage.objects, one
-- per public bucket (news-media, officials-media, events-media,
-- announcements-media, legislative-media, transparency-media, site-media,
-- avatars-media) — never on any of the *-drafts or feedback-media buckets.
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
```

Record the actual output of both queries — if the first returns any row, or the second returns a policy on a `-drafts` bucket or `feedback-media`, that is a real finding, not an expected result, and must be written up in Step 3 as a gap, not silently noted as "reviewed."

- [ ] **Step 2: Manually verify the CSRF assumption**

CLAUDE.md and `docs/BACKEND_HANDOFF.md`'s 2026-07-20 changelog entry both lean on "Next Server Actions enforce an Origin-header check by default" to justify the Proxy matcher exclusion for Server Action POSTs not weakening auth. Verify this holds under the current Next version rather than continuing to assume it:

1. Start the dev server (`npm run dev`) and sign in to `/admin`.
2. Open any admin drawer that saves via a Server Action (e.g. Services → New).
3. Open browser devtools → Network tab, submit the form once successfully, and find the resulting POST request (its request headers include `Next-Action: <id>`).
4. Right-click the request → Copy as cURL.
5. Run the copied command once as-is (should succeed, or at least reach the action). Then run it again with `-H "Origin: https://evil.example.com"` added, replacing any existing `Origin` header.
6. Expected: the forged-Origin request is rejected by the framework itself (typically a 403 with a body indicating an invalid Server Action request), before the action's own `checkPermission` logic even runs.

- [ ] **Step 3: Append findings to `docs/BACKEND_HANDOFF.md` §6**

Add a new numbered item at the end of the "Known Gaps / Tech Debt" section (§6, after the existing item 11), using this exact structure — fill in the two `[RESULT: ...]` placeholders with the real output from Steps 1 and 2, since those can only be known after running them against the live database and a running dev server:

```
12. **RLS + CSRF verification pass (2026-07-28 security-hardening Plan 1).**
    Confirmed every `public` schema table remains RLS-enabled with zero
    policies: [RESULT: paste the exact output of Step 1's first query, or
    "zero rows, as expected" if empty]. Confirmed `storage.objects` carries
    only the documented public-read policies: [RESULT: paste the exact
    output of Step 1's second query]. Confirmed Next Server Actions reject a
    forged `Origin` header before the action's own permission check runs:
    [RESULT: describe the actual response Step 2 produced — status code and
    body]. No code change resulted from this pass; it verifies assumptions
    CLAUDE.md and this file already documented rather than fixing a gap.
```

- [ ] **Step 4: Commit**

```bash
git add docs/BACKEND_HANDOFF.md
git commit -m "docs: record RLS and CSRF verification findings from the hardening pass"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers spec §0, Task 2 covers §1, Task 4 covers §2, Task 3 covers §3, Task 5 covers §4, Task 6 covers §7, Task 7 covers §8. Spec §9 (Playwright security tests) is covered for every item this plan touches (Tasks 3, 4, 5, 6 each include their own test step) — the portions of §9 covering Turnstile and the PDF upload handler are deferred to Plans 2 and 3 respectively, matching those items' own deferral (spec §5, §6).
- **Placeholder scan:** the two `[RESULT: ...]` markers in Task 7 Step 3 are the only bracketed placeholders in this plan, and they're deliberate — they hold live query/HTTP output that cannot exist until the steps before them run against a real database and server. No other step contains a TBD, a hand-wave, or a "handle appropriately."
- **Type consistency:** `checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean>` is defined once in Task 3 Step 3 and consumed with matching arity in Task 3 Step 4 (8 call sites) and Task 4 Step 1 (2 new call sites) — no signature drift.
