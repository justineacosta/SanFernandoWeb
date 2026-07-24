# Idle Logout and Profile Pictures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign a staff member out of the admin portal after 30 minutes of inactivity (or 30 minutes with the window closed), and let each person upload their own profile picture.

**Architecture:** A presence-only `sf-activity` cookie is the entire timeout contract — it exists iff the user interacted within 30 minutes, so nothing anywhere compares two clocks, and the browser's own `Max-Age` expiry handles the closed-window case. Two gates read it: middleware for page GETs, `getSessionUser()` for everything including Server Action POSTs (which bypass the middleware matcher by design). Avatars add one nullable column, reuse the `public-media` bucket and the existing defer-to-Save upload pattern, and collapse three copies of `initialsOf` into one `<Avatar>` primitive.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (Postgres + Auth + Storage), zod v4, Vitest, Playwright, motion/react.

**Spec:** `docs/superpowers/specs/2026-07-24-idle-logout-and-avatars-design.md`

## Global Constraints

- **Migration `0025_profile_avatars.sql` must be applied manually by the owner** against live Supabase staging. Announce it as soon as Task 5 lands; never assume it is applied. Production is still behind (`0012`–`0024` pending there).
- Every constant lives in `src/lib/session-activity.ts`. No file may inline `30 * 60 * 1000`, `1800`, `"sf-activity"`, or `60 * 1000`.
- Timing is **29:00 → 30:00**: the warning occupies the final 60 s so the client deadline and the cookie's `Max-Age` are the same number. If `IDLE_MS` ever changes, the cookie's `Max-Age` changes with it — they are derived from one constant, never written twice.
- Tailwind tokens only: `brand-*`, `ink-*`, `danger*`. No blue tokens. There is no `brand-900`.
- Colors/spacing come from `src/app/globals.css` `@theme`; springs and durations come from `src/lib/motion.ts` — never inline a transition.
- Server Actions are public HTTP endpoints: every write re-validates with zod v4 at runtime and goes through `requirePermission` / `requireSessionUser`.
- Images: JPG/PNG/WebP only, ≤ 2 MB, via the existing `ALLOWED_IMAGE_TYPES` / `MAX_IMAGE_BYTES` constants in `src/lib/storage.ts`.
- Uploads defer to Save. Uploader components make **no** network calls; the save action uploads and compensating-deletes on failure.
- Vitest covers pure functions only — `tests/unit/**/*.test.ts`, node environment, no jsdom, no React renderer. Never write a component test.
- Copy is Philippine-English and names the barangay as **San Fernando**. San Nicolas is a **municipality**.
- Commit after each task. Use `git add <explicit paths>`, never `git add -A`.

**Deploy note to carry into the release:** every currently signed-in staff member is signed out once when Task 3 ships, because no existing browser holds a `sf-activity` cookie. This is correct and one-time.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/lib/session-activity.ts` | Pure timeout constants + predicates. No I/O. The only place the numbers live. |
| `src/lib/initials.ts` | Pure `initialsOf(fullName)`. Extracted so it is unit-testable without a React renderer. |
| `tests/unit/session-activity.test.ts` | Boundary tests for the predicates. |
| `tests/unit/initials.test.ts` | Boundary tests for `initialsOf`. |
| `src/hooks/use-idle-timer.ts` | Effects: listeners, throttle, cross-tab sync, countdown. Consumed only by `<IdleTimeout />`. |
| `src/features/admin/components/idle-timeout.tsx` | The warning dialog + the sign-out call. |
| `src/components/ui/avatar.tsx` | Renders a stored photo or the amber initials fallback. |
| `supabase/migrations/0025_profile_avatars.sql` | `profiles.avatar_src`. |

**Modified:**

| Path | Change |
|---|---|
| `src/middleware.ts` | Gate + refresh the activity cookie; skip prefetches. |
| `src/lib/auth.ts` | Split `loadSessionUser` out; `getSessionUser` gains the cookie gate. |
| `src/features/admin/actions/auth.ts` | `signIn` writes the cookie; new `signOutIdle`. |
| `src/app/admin/login/page.tsx` | `?reason=timeout` notice. |
| `src/app/admin/(portal)/layout.tsx` | Mount `<IdleTimeout />` as a sibling of `AdminShell`. |
| `src/types/index.ts` | `SessionUser.avatarSrc`. |
| `src/features/admin/queries/users.ts` | Select + map `avatar_src`. |
| `supabase/baseline/0000_baseline_2026-07-23.sql` | `avatar_src` in the squashed `profiles`. |
| `src/features/admin/components/admin-topbar.tsx` | Use `<Avatar>`; drop local `initialsOf`. |
| `src/features/admin/components/account-profile-form.tsx` | Use `<Avatar>`; add the uploader; send the `FormData`. |
| `src/features/admin/components/team-manager.tsx` | Read-only `<Avatar>` in the name cell. |
| `src/components/ui/single-image-uploader.tsx` | `previewShape` prop. |
| `src/lib/media.ts` | `"avatars"` in the union **and** in the allow-list regex. |
| `src/features/admin/actions/account.ts` | `updateMyProfile` takes an avatar `FormData`. |
| `CLAUDE.md` | Document both rules. |

---

## Task 1: The pure timeout module

**Files:**
- Create: `src/lib/session-activity.ts`
- Test: `tests/unit/session-activity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ACTIVITY_COOKIE`, `ACTIVITY_COOKIE_VALUE`, `ACTIVITY_COOKIE_PATH`, `ACTIVITY_STORAGE_KEY`, `IDLE_MS`, `WARN_MS`, `HEARTBEAT_THROTTLE_MS`, `ACTIVITY_MAX_AGE_SECONDS`, `activityCookieOptions(secure: boolean)`, `activityCookieString(secure: boolean): string`, `hasActivityCookie(value: string | undefined): boolean`, `shouldWarn(lastActivityAt: number, now: number): boolean`, `isIdleExpired(lastActivityAt: number, now: number): boolean`, `secondsUntilSignOut(lastActivityAt: number, now: number): number`, `parseActivityAt(raw: string | null): number | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/session-activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_COOKIE,
  ACTIVITY_MAX_AGE_SECONDS,
  IDLE_MS,
  WARN_MS,
  activityCookieOptions,
  activityCookieString,
  hasActivityCookie,
  isIdleExpired,
  parseActivityAt,
  secondsUntilSignOut,
  shouldWarn,
} from "@/lib/session-activity";

const START = 1_700_000_000_000;

describe("the cookie contract", () => {
  it("expires exactly when the client deadline does", () => {
    // The whole design rests on these being one number, not two.
    expect(ACTIVITY_MAX_AGE_SECONDS * 1000).toBe(IDLE_MS);
  });

  it("is readable by client JS and scoped to the portal", () => {
    const options = activityCookieOptions(true);
    expect(options.httpOnly).toBe(false);
    expect(options.path).toBe("/admin");
    expect(options.sameSite).toBe("lax");
    expect(options.maxAge).toBe(ACTIVITY_MAX_AGE_SECONDS);
    expect(options.name).toBe(ACTIVITY_COOKIE);
  });

  it("marks the cookie Secure only when asked", () => {
    expect(activityCookieOptions(true).secure).toBe(true);
    expect(activityCookieOptions(false).secure).toBe(false);
    expect(activityCookieString(true)).toContain("; secure");
    expect(activityCookieString(false)).not.toContain("secure");
  });

  it("serialises a document.cookie assignment", () => {
    expect(activityCookieString(false)).toBe(
      "sf-activity=1; path=/admin; max-age=1800; samesite=lax",
    );
  });

  it("treats only the exact value as present", () => {
    expect(hasActivityCookie("1")).toBe(true);
    expect(hasActivityCookie(undefined)).toBe(false);
    expect(hasActivityCookie("")).toBe(false);
    expect(hasActivityCookie("0")).toBe(false);
  });
});

describe("the idle predicates", () => {
  it("does not warn before the final minute", () => {
    expect(shouldWarn(START, START + IDLE_MS - WARN_MS - 1)).toBe(false);
  });

  it("warns from the start of the final minute", () => {
    expect(shouldWarn(START, START + IDLE_MS - WARN_MS)).toBe(true);
  });

  it("keeps warning past the deadline (the caller checks expiry first)", () => {
    expect(shouldWarn(START, START + IDLE_MS + 5_000)).toBe(true);
  });

  it("does not expire one millisecond early", () => {
    expect(isIdleExpired(START, START + IDLE_MS - 1)).toBe(false);
  });

  it("expires exactly on the deadline", () => {
    expect(isIdleExpired(START, START + IDLE_MS)).toBe(true);
  });

  it("counts whole seconds down, never below zero", () => {
    expect(secondsUntilSignOut(START, START + IDLE_MS - 60_000)).toBe(60);
    expect(secondsUntilSignOut(START, START + IDLE_MS - 59_400)).toBe(60);
    expect(secondsUntilSignOut(START, START + IDLE_MS - 1)).toBe(1);
    expect(secondsUntilSignOut(START, START + IDLE_MS)).toBe(0);
    expect(secondsUntilSignOut(START, START + IDLE_MS + 10_000)).toBe(0);
  });
});

describe("parseActivityAt", () => {
  it("reads a stored epoch", () => {
    expect(parseActivityAt(String(START))).toBe(START);
  });

  it("rejects anything that is not a positive number", () => {
    // localStorage is shared with other origins' junk and survives releases —
    // a bad value must fall back to "unknown", never to NaN arithmetic that
    // would make every comparison false and disable the timeout silently.
    expect(parseActivityAt(null)).toBe(null);
    expect(parseActivityAt("")).toBe(null);
    expect(parseActivityAt("not-a-number")).toBe(null);
    expect(parseActivityAt("0")).toBe(null);
    expect(parseActivityAt("-5")).toBe(null);
    expect(parseActivityAt("Infinity")).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:unit -- session-activity
```

Expected: FAIL — `Failed to resolve import "@/lib/session-activity"`.

- [ ] **Step 3: Write the module**

Create `src/lib/session-activity.ts`:

```ts
/**
 * The inactivity-timeout contract, in one place.
 *
 * One rule governs everything: the `sf-activity` cookie exists IF AND ONLY IF
 * the user interacted within the last 30 minutes.
 *
 * The cookie is presence-only — its value is a constant and carries no
 * timestamp. That is deliberate. A timestamp would have to be written by
 * either the client clock or the server clock and then compared against the
 * other, and the two disagree; presence collapses the question to "did the
 * browser still have it?".
 *
 * It also buys the second half of the requirement for free. A closed tab runs
 * no timer, so "signed out after 30 minutes with the window closed" can only
 * be enforced on the next request — and cookie Max-Age is absolute wall-clock
 * time that survives a browser restart. Close at 14:00, reopen at 14:31, the
 * cookie is gone, the gate fires. No code.
 *
 * Pure module: no I/O, no `document`, no `cookies()`. The two gates
 * (src/middleware.ts, src/lib/auth.ts) and the client hook
 * (src/hooks/use-idle-timer.ts) supply their own.
 */

export const ACTIVITY_COOKIE = "sf-activity";
export const ACTIVITY_COOKIE_VALUE = "1";
export const ACTIVITY_COOKIE_PATH = "/admin";

/** Cross-tab freshness for the countdown only — never read by the server. */
export const ACTIVITY_STORAGE_KEY = "sf-admin-activity-at";

/** Total idle allowance. The warning lives inside this, not after it. */
export const IDLE_MS = 30 * 60 * 1000;

/**
 * The warning occupies the FINAL minute (29:00 → 30:00) rather than following
 * the 30 minutes. This keeps the client deadline and the cookie's Max-Age the
 * same number. If the dialog ran from 30:00 to 31:00 the cookie would already
 * be dead for its whole duration: "Stay signed in" would be reviving a session
 * the server had given up on, and any background navigation inside that minute
 * would redirect to login underneath the open dialog.
 */
export const WARN_MS = 60 * 1000;

/** At most one cookie write per minute, however much the user moves. */
export const HEARTBEAT_THROTTLE_MS = 60 * 1000;

/** Derived, never written twice — see the module note above. */
export const ACTIVITY_MAX_AGE_SECONDS = IDLE_MS / 1000;

export interface ActivityCookieOptions {
  name: string;
  value: string;
  path: string;
  maxAge: number;
  sameSite: "lax";
  secure: boolean;
  /**
   * Always false: the client heartbeat writes this cookie, so it cannot be
   * httpOnly. A signed-in user could therefore hand-craft it and never time
   * out — accepted. This protects an unattended desk in a shared barangay
   * office; it was never a defense against the session's own owner, who is
   * already authenticated. Making it httpOnly would force a Server Action
   * round trip per minute per user to buy nothing.
   */
  httpOnly: false;
}

/** Shape for `NextResponse.cookies.set()` and `cookies().set()`. */
export function activityCookieOptions(secure: boolean): ActivityCookieOptions {
  return {
    name: ACTIVITY_COOKIE,
    value: ACTIVITY_COOKIE_VALUE,
    path: ACTIVITY_COOKIE_PATH,
    maxAge: ACTIVITY_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure,
    httpOnly: false,
  };
}

/** The same cookie as a `document.cookie` assignment, for the client heartbeat. */
export function activityCookieString(secure: boolean): string {
  const parts = [
    `${ACTIVITY_COOKIE}=${ACTIVITY_COOKIE_VALUE}`,
    `path=${ACTIVITY_COOKIE_PATH}`,
    `max-age=${ACTIVITY_MAX_AGE_SECONDS}`,
    "samesite=lax",
  ];
  if (secure) parts.push("secure");
  return parts.join("; ");
}

/** Presence check. Absence means idle ≥ 30 min, or the window was closed that long. */
export function hasActivityCookie(value: string | undefined): boolean {
  return value === ACTIVITY_COOKIE_VALUE;
}

/**
 * True from the start of the final minute onward — including past the
 * deadline. Callers check `isIdleExpired` first; keeping this monotonic means
 * a tab that was throttled while backgrounded cannot skip the warning state.
 */
export function shouldWarn(lastActivityAt: number, now: number): boolean {
  return now >= lastActivityAt + IDLE_MS - WARN_MS;
}

export function isIdleExpired(lastActivityAt: number, now: number): boolean {
  return now >= lastActivityAt + IDLE_MS;
}

/** Whole seconds left on the countdown, floored at zero. */
export function secondsUntilSignOut(lastActivityAt: number, now: number): number {
  const remaining = lastActivityAt + IDLE_MS - now;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / 1000);
}

/** Read a `localStorage` epoch, rejecting anything that is not a positive finite number. */
export function parseActivityAt(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:unit -- session-activity
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/session-activity.ts tests/unit/session-activity.test.ts
git commit -m "feat(auth): the idle-timeout contract as one pure module"
```

---

## Task 2: Middleware gate and refresh

**Files:**
- Modify: `src/middleware.ts` (whole file rewritten below)

**Interfaces:**
- Consumes: `ACTIVITY_COOKIE`, `activityCookieOptions`, `hasActivityCookie` from Task 1.
- Produces: a `/admin/login?reason=timeout` redirect that Task 3's login page reads.

This task has no unit test — middleware needs a request/response pair and a live Supabase session, which is Playwright's job, not Vitest's (the project deliberately has no jsdom). It is verified by hand in Step 3.

- [ ] **Step 1: Rewrite the middleware**

Replace the whole of `src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  ACTIVITY_COOKIE,
  activityCookieOptions,
  hasActivityCookie,
} from "@/lib/session-activity";

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

export async function middleware(request: NextRequest) {
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
    timedOut.cookies.delete({ name: ACTIVITY_COOKIE, path: "/admin" });
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
  // 10MB validation message. Skipping middleware here is safe: every
  // transparency (and other admin) Server Action independently re-checks
  // auth via checkPermission()/checkSuperAdmin(), and — unlike Server
  // Components — cookies() is mutable inside a Server Action, so the
  // Supabase server client (src/lib/supabase/server.ts) refreshes the
  // session cookie itself when the action calls getUser(). Page navigations
  // (GET requests, no Next-Action header) still go through middleware and
  // get the redirect-to-login / redirect-to-/admin convenience.
  //
  // This is also why middleware cannot be the only idle gate: a user working
  // inside a drawer submits POSTs that never reach here. getSessionUser() in
  // src/lib/auth.ts is the second gate and covers them.
  matcher: [{ source: "/admin/:path*", missing: [{ type: "header", key: "next-action" }] }],
};
```

- [ ] **Step 2: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both clean.

- [ ] **Step 3: Verify by hand in the browser**

`npm run dev` (check whether it is already running first — it usually is). Sign in at `http://localhost:3000/admin/login`, then in DevTools → Application → Cookies confirm `sf-activity=1` exists with `Path=/admin` and a ~30 min expiry. Navigate between two admin pages and confirm the expiry slides forward. Delete the cookie by hand, then click any admin nav link: you land on `/admin/login?reason=timeout` and the `sb-*` cookies are gone.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(auth): gate and refresh the activity cookie in middleware"
```

---

## Task 3: The session gate, the idle sign-out action, and the login notice

**Files:**
- Modify: `src/lib/auth.ts:8-31`
- Modify: `src/features/admin/actions/auth.ts`
- Modify: `src/app/admin/login/page.tsx`

**Interfaces:**
- Consumes: `ACTIVITY_COOKIE`, `hasActivityCookie`, `activityCookieOptions` (Task 1); the `?reason=timeout` redirect (Task 2).
- Produces: `signOutIdle(): Promise<void>` from `@/features/admin/actions/auth`, called by Task 4's dialog; `getSessionUserIgnoringIdle` from `@/lib/auth`.

- [ ] **Step 1: Split the session loader and add the gate**

In `src/lib/auth.ts`, add the imports:

```ts
import { cookies } from "next/headers";
import { ACTIVITY_COOKIE, hasActivityCookie } from "@/lib/session-activity";
```

Then replace the existing `getSessionUser` block (lines 8–31) with:

```ts
/**
 * The profile behind the Supabase session, with no idle check.
 *
 * Split out for exactly one caller: `signOutIdle` runs at the moment the
 * activity cookie has just expired, and still needs an actor to attribute its
 * audit entry to. Everything else must go through `getSessionUser`.
 */
const loadSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "email, full_name, status_label, is_superadmin, permissions, is_active, is_archived, phone",
    )
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active || profile.is_archived) return null;

  return {
    id: user.id,
    email: profile.email,
    fullName: profile.full_name,
    statusLabel: profile.status_label as StaffStatusLabel,
    isSuperAdmin: profile.is_superadmin,
    permissions: profile.permissions as Permission[],
    phone: profile.phone,
  };
});

/** See the note on loadSessionUser. Only `signOutIdle` may use this. */
export const getSessionUserIgnoringIdle = loadSessionUser;

/**
 * Resolve the signed-in admin user (null if signed out, disabled, archived, or
 * idle past the timeout).
 *
 * The idle check lives here, not only in middleware, because Server Action
 * POSTs are excluded from the middleware matcher on purpose (see the comment on
 * `config` in src/middleware.ts). Without this gate a user could sit in a
 * drawer submitting saves indefinitely without a single page GET.
 *
 * Reading cookies here is safe in both contexts; writing them is not, and this
 * function deliberately never does — `cookies()` is read-only inside a Server
 * Component. Middleware and the client heartbeat own every write.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  if (!hasActivityCookie(cookieStore.get(ACTIVITY_COOKIE)?.value)) return null;
  return loadSessionUser();
});
```

Note: `avatar_src` joins that `select` in Task 5 — leave it alone for now.

- [ ] **Step 2: Write the cookie on sign-in, and add signOutIdle**

In `src/features/admin/actions/auth.ts`, add the imports:

```ts
import { cookies } from "next/headers";
import { getSessionUser, getSessionUserIgnoringIdle } from "@/lib/auth";
import { ACTIVITY_COOKIE, activityCookieOptions } from "@/lib/session-activity";
```

(Replace the existing `import { getSessionUser } from "@/lib/auth";` line with the two-name version above.)

In `signIn`, immediately **before** the `recordActivity` call — the redirect below it throws, so nothing after that line ever runs:

```ts
  // Open the idle window. Without this the very next page GET would see no
  // activity cookie and bounce the user straight back to the login page.
  const cookieStore = await cookies();
  cookieStore.set(activityCookieOptions(process.env.NODE_ENV === "production"));
```

Then append to the same file:

```ts
/**
 * Sign out because the idle deadline passed, called by <IdleTimeout />.
 *
 * Distinct from `signOut` only in how it resolves the actor and what it logs.
 * By the time this fires the activity cookie has already expired, so
 * `getSessionUser` would return null and the audit entry would be lost — hence
 * `getSessionUserIgnoringIdle`, whose sole purpose this is.
 *
 * The closed-window path has no counterpart here and records nothing: there is
 * no session running to attribute an entry to.
 */
export async function signOutIdle(): Promise<void> {
  const actor = await getSessionUserIgnoringIdle();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete({ name: ACTIVITY_COOKIE, path: "/admin" });
  if (actor) {
    await recordActivity(actor, {
      type: "logout",
      action: "signed out",
      entityType: "session",
      entityId: actor.id,
      detail: "signed out for inactivity",
    });
  }
  redirect("/admin/login?reason=timeout");
}
```

`detail?: string` is already an optional field on `AuditInput` (`src/lib/audit.ts:37`) and is written straight through to the row — no change is needed there.

- [ ] **Step 3: Show the notice on the login page**

In `src/app/admin/login/page.tsx`, change the component signature and add the banner. Replace:

```tsx
export default function AdminLoginPage() {
  return (
```

with:

```tsx
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  return (
```

and insert this directly above `<LoginForm />`:

```tsx
        {reason === "timeout" ? (
          <p
            role="status"
            className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink-700"
          >
            You were signed out because of inactivity. Please sign in again.
          </p>
        ) : null}
```

- [ ] **Step 4: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both clean.

- [ ] **Step 5: Verify by hand**

Sign in. Delete the `sf-activity` cookie in DevTools, then click an admin nav link: the login page shows the inactivity notice. Sign in again and confirm you land in the portal (this proves `signIn` writes the cookie — if it did not, you would bounce straight back out).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/features/admin/actions/auth.ts src/app/admin/login/page.tsx
git commit -m "feat(auth): idle gate in getSessionUser, signOutIdle, timeout notice"
```

---

## Task 4: The heartbeat hook and the warning dialog

**Files:**
- Create: `src/hooks/use-idle-timer.ts`
- Create: `src/features/admin/components/idle-timeout.tsx`
- Modify: `src/app/admin/(portal)/layout.tsx`

**Interfaces:**
- Consumes: everything from Task 1; `signOutIdle` from Task 3.
- Produces: `useIdleTimer({ onExpire })` → `{ warning: boolean; secondsLeft: number; stayActive: () => void }`; `<IdleTimeout />`.

- [ ] **Step 1: Write the hook**

Create `src/hooks/use-idle-timer.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVITY_STORAGE_KEY,
  HEARTBEAT_THROTTLE_MS,
  activityCookieString,
  isIdleExpired,
  parseActivityAt,
  secondsUntilSignOut,
  shouldWarn,
} from "@/lib/session-activity";

/**
 * The client half of the inactivity timeout (spec §4.1).
 *
 * Effects only — every number and predicate lives in
 * `src/lib/session-activity.ts`, the same split `useFormDraft` uses.
 *
 * Two things are written on each throttled beat, for two different readers:
 *
 *   1. the `sf-activity` cookie — read by the server's two gates;
 *   2. `localStorage[sf-admin-activity-at]` — read by OTHER TABS.
 *
 * The second exists because a presence-only cookie cannot answer "how fresh?",
 * and a background tab needs exactly that to know whether the foreground tab is
 * still being used. Without it, a tab left open behind the one you are working
 * in would warn and sign you out mid-sentence. Cookie for the server,
 * localStorage for the countdown — each mechanism reads one clock.
 */

/** `mousemove` is excluded on purpose: an idle mouse nudged by a desk bump fires it forever. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll"] as const;

const TICK_MS = 1000;

function writeItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing can throw. Losing cross-tab sync must never cost the
    // user the ability to keep working — the cookie is unaffected.
  }
}

function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export interface IdleTimerState {
  /** True once the final minute begins. */
  warning: boolean;
  /** Whole seconds until sign-out, for the countdown. */
  secondsLeft: number;
  /** Dismiss the warning and slide the window forward. */
  stayActive: () => void;
}

export function useIdleTimer({ onExpire }: { onExpire: () => void }): IdleTimerState {
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const lastActivityRef = useRef(Date.now());
  const lastBeatRef = useRef(0);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  /** Slide the window forward. `force` bypasses the throttle for deliberate acts. */
  const record = useCallback((force = false) => {
    if (expiredRef.current) return;
    const now = Date.now();
    lastActivityRef.current = now;
    if (!force && now - lastBeatRef.current < HEARTBEAT_THROTTLE_MS) return;
    lastBeatRef.current = now;
    document.cookie = activityCookieString(window.location.protocol === "https:");
    writeItem(ACTIVITY_STORAGE_KEY, String(now));
  }, []);

  const stayActive = useCallback(() => {
    setWarning(false);
    record(true);
  }, [record]);

  useEffect(() => {
    // Seed from whatever another tab last recorded, so a newly opened tab does
    // not reset a window that is already most of the way through.
    const stored = parseActivityAt(readItem(ACTIVITY_STORAGE_KEY));
    if (stored && stored < lastActivityRef.current) lastActivityRef.current = stored;
    record(true);

    const onActivity = () => record();
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );

    // Another tab moved: adopt its timestamp and drop out of the warning.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVITY_STORAGE_KEY) return;
      const at = parseActivityAt(event.newValue);
      if (!at || at <= lastActivityRef.current) return;
      lastActivityRef.current = at;
      setWarning(false);
    };
    window.addEventListener("storage", onStorage);

    const evaluate = () => {
      if (expiredRef.current) return;
      const now = Date.now();
      const at = lastActivityRef.current;
      if (isIdleExpired(at, now)) {
        expiredRef.current = true;
        setSecondsLeft(0);
        onExpireRef.current();
        return;
      }
      setWarning(shouldWarn(at, now));
      setSecondsLeft(secondsUntilSignOut(at, now));
    };

    const interval = window.setInterval(evaluate, TICK_MS);
    // A backgrounded tab has its timers throttled, so the deadline can pass
    // unnoticed. Re-evaluate the moment it comes back — returning to a tab is
    // not itself activity, so this checks without recording.
    const onVisible = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    document.addEventListener("visibilitychange", onVisible);
    evaluate();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [record]);

  return { warning, secondsLeft, stayActive };
}
```

- [ ] **Step 2: Write the dialog**

Create `src/features/admin/components/idle-timeout.tsx`:

```tsx
"use client";

import { useCallback, useState, useTransition } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIdleTimer } from "@/hooks/use-idle-timer";
import { FADE_QUICK, POP } from "@/lib/motion";
import { signOut, signOutIdle } from "@/features/admin/actions/auth";

/**
 * The inactivity warning (spec §4).
 *
 * Mounted in app/admin/(portal)/layout.tsx as a SIBLING of AdminShell, never
 * inside it: a `position: fixed` overlay nested in the `backdrop-filter` chrome
 * gets a new containing block and stops being viewport-fixed. Same rule as the
 * public feedback widget.
 *
 * `role="alertdialog"` rather than `dialog` — this interrupts for a
 * consequential decision, and the description is announced with the title.
 * Focus starts on "Stay signed in": the safe choice, and the one a person
 * hitting Enter to dismiss a surprise dialog means.
 */
export function IdleTimeout() {
  const [expired, setExpired] = useState(false);
  const [, startTransition] = useTransition();

  const onExpire = useCallback(() => {
    setExpired(true);
    startTransition(() => {
      void signOutIdle();
    });
  }, []);

  const { warning, secondsLeft, stayActive } = useIdleTimer({ onExpire });
  const open = warning || expired;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="idle"
            className="fixed inset-0 z-80 flex items-center justify-center p-4"
          >
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_QUICK}
              className="absolute inset-0 bg-ink-950/50"
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="idle-timeout-title"
              aria-describedby="idle-timeout-body"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={POP}
              className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-floating"
            >
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2
                    id="idle-timeout-title"
                    className="font-display text-lg font-semibold tracking-tight text-ink-900"
                  >
                    Still there?
                  </h2>
                  <div id="idle-timeout-body" className="mt-2 text-sm text-ink-600">
                    {expired ? (
                      <p>Signing you out…</p>
                    ) : (
                      <p>
                        You have been inactive for a while. For your security you will be
                        signed out in{" "}
                        {/* aria-live so the count is announced without stealing focus. */}
                        <span aria-live="polite" className="font-semibold text-ink-900">
                          {secondsLeft} second{secondsLeft === 1 ? "" : "s"}
                        </span>
                        .
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={expired}
                  onClick={() => startTransition(() => void signOut())}
                >
                  Sign out now
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  autoFocus
                  disabled={expired}
                  onClick={stayActive}
                >
                  Stay signed in
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}
```

`primary` and `outline` are both real `ButtonVariant` values (`src/components/ui/button.tsx:5,9`), and `primary` is the default.

- [ ] **Step 3: Mount it**

In `src/app/admin/(portal)/layout.tsx`, add the import:

```ts
import { IdleTimeout } from "@/features/admin/components/idle-timeout";
```

and change the returned JSX to:

```tsx
  return (
    <AdminUserProvider userId={user.id}>
      <AdminShell user={user} defaultCollapsed={collapsed}>
        {children}
      </AdminShell>
      {/* Sibling of AdminShell, not a child: a fixed overlay inside the
          backdrop-filter chrome would be positioned against it, not the
          viewport. */}
      <IdleTimeout />
    </AdminUserProvider>
  );
```

- [ ] **Step 4: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both clean.

- [ ] **Step 5: Verify by hand, with the clock shortened**

Temporarily set `IDLE_MS = 60 * 1000` and `WARN_MS = 20 * 1000` in `src/lib/session-activity.ts`, then:

1. Sit still on an admin page for 40 s → the dialog appears and counts down.
2. Click **Stay signed in** → it closes, and does not immediately return.
3. Sit still again for the full minute → you land on `/admin/login?reason=timeout` with the notice.
4. Check `/admin/audit` for a `logout` entry reading *"signed out for inactivity"*.
5. Open two admin tabs. Work in one, leave the other untouched for over a minute → the idle tab must **not** warn.
6. Close the browser entirely, wait past the deadline, reopen `/admin` → login page.

Then restore `IDLE_MS = 30 * 60 * 1000` and `WARN_MS = 60 * 1000` and re-run `npm run test:unit -- session-activity` to confirm the constants are back (the test asserts `ACTIVITY_MAX_AGE_SECONDS * 1000 === IDLE_MS`, so a half-restored edit fails loudly).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-idle-timer.ts src/features/admin/components/idle-timeout.tsx "src/app/admin/(portal)/layout.tsx"
git commit -m "feat(auth): inactivity warning dialog with cross-tab heartbeat"
```

---

## Task 5: The avatar column

**Files:**
- Create: `supabase/migrations/0025_profile_avatars.sql`
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:186-190`
- Modify: `src/types/index.ts:675-683`
- Modify: `src/lib/auth.ts` (the `select` inside `loadSessionUser`)
- Modify: `src/features/admin/queries/users.ts:4-33`

**Interfaces:**
- Consumes: the `loadSessionUser` split from Task 3.
- Produces: `SessionUser.avatarSrc: string | null`, inherited by `TeamUser`. Tasks 6 and 7 both read it.

This task is plumbing only — nothing renders the value yet, which is what makes it independently reviewable.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0025_profile_avatars.sql`:

```sql
-- Profile pictures for staff accounts.
--
-- One nullable column, no table. Null means "render initials", which stays the
-- permanent fallback — there is no default avatar image and no NOT NULL to
-- backfill.
--
-- The value is a `public-media` object path (avatars/<uuid>.<ext>), resolved by
-- photoUrl() like every other image reference in the schema. Same bucket as the
-- officials' portraits: the portal is auth-gated and a staff headshot is not a
-- screenshot of somebody's own account page, so the private-bucket treatment
-- that feedback screenshots get does not apply here.

alter table public.profiles add column avatar_src text;

comment on column public.profiles.avatar_src is
  'public-media object path (avatars/<uuid>.<ext>), or null to render initials.';
```

- [ ] **Step 2: Fold it into the baseline**

`supabase/baseline/0000_baseline_2026-07-23.sql` is the path a **new** environment takes instead of replaying the numbered migrations, so it must carry this column too. In the `create table public.profiles (...)` block, after the `phone text` line and before the `constraint profiles_email_unique` line, add:

```sql
  -- Profile picture: public-media path, or null for initials.          [0025]
  avatar_src text,
```

Keep the existing `[NNNN]` comment style exactly as the neighbouring lines use it.

- [ ] **Step 3: Widen the type**

In `src/types/index.ts`, replace the `SessionUser` interface:

```ts
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  statusLabel: StaffStatusLabel;
  isSuperAdmin: boolean;
  permissions: Permission[];
  phone: string | null;
  /** `public-media` object path, or null to render initials. */
  avatarSrc: string | null;
}
```

`TeamUser extends SessionUser`, so it inherits the field and both readers below must supply it — the typecheck in Step 5 is what proves neither was missed.

- [ ] **Step 4: Widen both readers**

In `src/lib/auth.ts`, inside `loadSessionUser`, change the `select` string to:

```ts
    .select(
      "email, full_name, status_label, is_superadmin, permissions, is_active, is_archived, phone, avatar_src",
    )
```

and add to the returned object, after `phone: profile.phone,`:

```ts
    avatarSrc: profile.avatar_src,
```

In `src/features/admin/queries/users.ts`, change the three matching places:

```ts
const COLUMNS =
  "id, email, full_name, status_label, is_superadmin, permissions, is_active, is_archived, created_at, phone, avatar_src";
```

Add to `ProfileRow`, after `phone: string | null;`:

```ts
  avatar_src: string | null;
```

Add to `toTeamUser`'s return, after `phone: row.phone,`:

```ts
    avatarSrc: row.avatar_src,
```

- [ ] **Step 5: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both clean. A failure here naming `avatarSrc` means a third construction site of `SessionUser`/`TeamUser` exists — fix it the same way rather than widening the type to optional.

- [ ] **Step 6: Ask the owner to apply the migration**

Tell them, in these words or close to them:

> Migration `0025_profile_avatars.sql` is ready and needs applying to Supabase **staging** before the avatar UI can be tested. It is one additive line — `alter table public.profiles add column avatar_src text;` — with no backfill and no downtime. Production is still behind on `0012`–`0024`, so this joins that queue rather than jumping it.

Do not proceed to Task 7's manual verification until they confirm. Task 6 can be built and reviewed meanwhile; a null column reads as null.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0025_profile_avatars.sql supabase/baseline/0000_baseline_2026-07-23.sql src/types/index.ts src/lib/auth.ts src/features/admin/queries/users.ts
git commit -m "feat(profiles): add avatar_src column and plumb it through reads"
```

---

## Task 6: The Avatar primitive

**Files:**
- Create: `src/lib/initials.ts`
- Create: `src/components/ui/avatar.tsx`
- Test: `tests/unit/initials.test.ts`
- Modify: `src/features/admin/components/admin-topbar.tsx:15` (delete the local helper) and `:93-98`
- Modify: `src/features/admin/components/account-profile-form.tsx:11-18` (delete the local helper) and `:43-51`
- Modify: `src/features/admin/components/team-manager.tsx:379-384`

**Interfaces:**
- Consumes: `SessionUser.avatarSrc` (Task 5); `photoUrl` from `@/lib/storage`.
- Produces: `initialsOf(fullName: string): string` from `@/lib/initials`; `<Avatar src={...} fullName={...} size="sm" | "md" | "lg" />` from `@/components/ui/avatar`. Task 7 renders the `lg` size.

`initialsOf` moves to its own module rather than living in the component, because Vitest's config is `tests/unit/**/*.test.ts` in a node environment — a `.tsx` file importing `next/image` cannot be imported there, and this project unit-tests its pure logic.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/initials.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialsOf } from "@/lib/initials";

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Justine Acosta")).toBe("JA");
  });

  it("stops at two, however many names there are", () => {
    expect(initialsOf("Maria Clara Dela Cruz")).toBe("MC");
  });

  it("handles a single name", () => {
    expect(initialsOf("Ferdinand")).toBe("F");
  });

  it("ignores extra whitespace", () => {
    expect(initialsOf("  Juan   Dela Cruz  ")).toBe("JD");
  });

  it("uppercases", () => {
    expect(initialsOf("juan dela cruz")).toBe("JD");
  });

  it("returns an empty string for an empty name, leaving the fallback to the caller", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf("   ")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:unit -- initials
```

Expected: FAIL — `Failed to resolve import "@/lib/initials"`.

- [ ] **Step 3: Write the module**

Create `src/lib/initials.ts`:

```ts
/**
 * Initials for the avatar fallback.
 *
 * Its own module, not a helper inside `<Avatar>`: this is the only pure logic
 * in that component, and a `.tsx` importing `next/image` cannot be pulled into
 * the node-environment Vitest suite.
 *
 * Returns "" for an empty name rather than a placeholder — the caller decides
 * what nothing looks like.
 */
export function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:unit -- initials
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the Avatar component**

Create `src/components/ui/avatar.tsx`:

```tsx
import Image from "next/image";
import { initialsOf } from "@/lib/initials";
import { photoUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * A staff member's photo, or their initials in the brand gradient.
 *
 * One component for all three call sites — the top bar, the Settings profile
 * card and the users table — which each carried their own copy of `initialsOf`
 * before this existed.
 *
 * `alt=""` is deliberate. Every call site renders the person's name adjacent to
 * the avatar, so announcing it again would be a duplicate; this is the same
 * decorative treatment the `aria-hidden` initials had.
 */

const SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-24 w-24 text-2xl",
} as const;

/** Matches SIZES, for next/image's `sizes` hint. */
const PIXELS = { sm: 36, md: 48, lg: 96 } as const;

interface AvatarProps {
  /** `public-media` object path, or null for initials. */
  src: string | null;
  fullName: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({ src, fullName, size = "sm", className }: AvatarProps) {
  if (src) {
    return (
      <span
        className={cn(
          "relative block shrink-0 overflow-hidden rounded-full bg-ink-100 ring-2 ring-brand-400/40",
          SIZES[size],
          className,
        )}
      >
        <Image
          src={photoUrl(src)}
          alt=""
          fill
          sizes={`${PIXELS[size]}px`}
          className="object-cover"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-brand-600 font-bold text-white",
        SIZES[size],
        className,
      )}
    >
      {initialsOf(fullName) || "?"}
    </span>
  );
}
```

- [ ] **Step 6: Replace the top bar's copy**

In `src/features/admin/components/admin-topbar.tsx`: delete the local `initialsOf` function entirely, add `import { Avatar } from "@/components/ui/avatar";`, and replace the `<span aria-hidden="true" className="flex h-9 w-9 …">{initialsOf(user.fullName) || "?"}</span>` element with:

```tsx
              <Avatar src={user.avatarSrc} fullName={user.fullName} size="sm" />
```

The `shadow-brand-glow` on the old span goes with it — the photo variant carries a ring instead, and keeping a glow behind a face reads as a halo.

- [ ] **Step 7: Replace the profile card's copy**

In `src/features/admin/components/account-profile-form.tsx`: delete the local `initialsOf` function, add `import { Avatar } from "@/components/ui/avatar";`, and replace the `<span aria-hidden="true" className="flex h-24 w-24 …">` element with:

```tsx
          <Avatar src={currentUser.avatarSrc} fullName={currentUser.fullName} size="lg" />
```

Leave the *"Photo upload coming soon"* caption for now — Task 7 replaces it with the real uploader, and removing it here would ship a card that silently does nothing.

- [ ] **Step 8: Add it to the users table**

In `src/features/admin/components/team-manager.tsx`, add `import { Avatar } from "@/components/ui/avatar";` and replace the name cell's contents:

```tsx
                      <td className="px-6 py-4 font-semibold text-ink-900">
                        <span className="flex items-center gap-3">
                          <Avatar src={member.avatarSrc} fullName={member.fullName} size="sm" />
                          <span className="min-w-0">
                            {member.fullName}
                            {member.id === currentUser.id ? (
                              <span className="ml-2 text-xs font-medium text-brand-600">
                                (you)
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
```

Read-only, by design: own-photo-only is the whole scope, and no editor for anyone else's picture exists anywhere.

- [ ] **Step 9: Typecheck, lint, and run the full unit suite**

```bash
npm run typecheck && npm run lint && npm run test:unit
```

Expected: all clean, all tests pass.

- [ ] **Step 10: Verify by hand**

Load `/admin/settings` and `/admin/users`. Every avatar still shows initials (no photos exist yet), the top bar is unchanged in size, and the users table rows have not grown a scrollbar.

- [ ] **Step 11: Commit**

```bash
git add src/lib/initials.ts tests/unit/initials.test.ts src/components/ui/avatar.tsx src/features/admin/components/admin-topbar.tsx src/features/admin/components/account-profile-form.tsx src/features/admin/components/team-manager.tsx
git commit -m "refactor(admin): one Avatar primitive replaces three initials copies"
```

---

## Task 7: Uploading your own photo

**Files:**
- Modify: `src/components/ui/single-image-uploader.tsx`
- Modify: `src/lib/media.ts:53` and `:99`
- Modify: `src/features/admin/actions/account.ts:20-46`
- Modify: `src/features/admin/components/account-profile-form.tsx`

**Interfaces:**
- Consumes: `<Avatar>` (Task 6), `SessionUser.avatarSrc` (Task 5).
- Produces: `updateMyProfile(input: UpdateMyProfileValues, avatarForm: FormData): Promise<ActionResult>` — the second argument carries `image` (a `File`) and `removeImage` (`"1"` or absent), exactly as `saveOfficial` does.

**Requires migration `0025` to be applied** before Step 6's manual verification. Steps 1–5 can be written and reviewed without it.

- [ ] **Step 1: Teach the uploader a circular preview**

In `src/components/ui/single-image-uploader.tsx`, add to `SingleImageUploaderProps`:

```ts
  /**
   * Circular preview for a face. The rectangular default is right for a banner
   * or a cover; a portrait previewed as a rectangle hides exactly the cropping
   * the user is trying to judge.
   */
  previewShape?: "rect" | "circle";
```

Add it to the destructured props with `previewShape = "rect",`, then just below the destructuring add:

```ts
  const previewBox =
    previewShape === "circle"
      ? "relative h-24 w-24 overflow-hidden rounded-full bg-ink-100"
      : "relative h-24 w-32 overflow-hidden rounded-2xl bg-ink-100";
```

Replace **both** preview wrappers — the picked-file `<div className="relative h-24 w-32 overflow-hidden rounded-2xl bg-ink-100">` and the existing-image one — with `<div className={previewBox}>`. The `sizes="128px"` on the existing-image `<Image>` stays correct for both.

- [ ] **Step 2: Open the avatars folder in the media helpers**

Two edits in `src/lib/media.ts`.

The union:

```ts
export type ImageFolder = "announcements" | "events" | "officials" | "site" | "avatars";
```

The allow-list regex inside `removeStoredImage` — **this is the one that fails silently if missed**, turning every replaced photo into an orphan instead of a deletion:

```ts
  if (!/^(announcements|events|officials|news|achievements|site|avatars)\//.test(src)) {
```

- [ ] **Step 3: Handle the file in the save action**

In `src/features/admin/actions/account.ts`, add to the imports:

```ts
import { discardImage, removeStoredImage, uploadSingleImage } from "@/lib/media";
```

Replace the whole of `updateMyProfile`:

```ts
/**
 * Update the caller's own name, phone and photo. Never accepts an id or email.
 *
 * The avatar arrives as its own FormData rather than inside `input`, mirroring
 * `saveOfficial`: a File does not belong in a zod-validated plain object, and
 * keeping it separate is what lets the uploader stay a pure file picker that
 * makes no network calls of its own.
 */
export async function updateMyProfile(
  input: UpdateMyProfileValues,
  avatarForm: FormData,
): Promise<ActionResult> {
  const user = await requireSessionUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  // Upload first, then compensate on any later failure — the invariant is that
  // a storage object exists only if a row references it.
  const incoming = avatarForm.get("image");
  const removeAvatar = avatarForm.get("removeImage") === "1";
  let uploadedPath: string | null = null;
  if (incoming instanceof File && incoming.size > 0) {
    const uploaded = await uploadSingleImage("avatars", incoming);
    if (uploaded.error) return { error: uploaded.error };
    uploadedPath = uploaded.src;
  }

  async function fail(error: string): Promise<ActionResult> {
    if (uploadedPath) {
      const removed = await removeStoredImage(uploadedPath);
      if (removed.error) {
        console.error(`Orphaned storage object (compensating delete failed): ${uploadedPath}`);
      }
    }
    return { error };
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("profiles")
    .select("avatar_src")
    .eq("id", user.id)
    .maybeSingle();
  if (readErr || !existing) return fail("Could not save your profile.");

  const previousPath = existing.avatar_src as string | null;
  const nextPath = uploadedPath ?? (removeAvatar ? null : previousPath);

  const { error } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ? parsed.data.phone : null,
      avatar_src: nextPath,
    })
    .eq("id", user.id);
  if (error) return fail("Could not save your profile.");

  // Deferred delete: only once the row no longer references the old photo.
  if (previousPath && previousPath !== nextPath) {
    await discardImage(previousPath, "avatar replaced");
  }

  await recordActivity(user, {
    type: "update",
    action: "updated own profile",
    entityType: "profile",
    entityId: user.id,
  });
  revalidatePath("/admin/settings");
  // The top bar renders the avatar from the portal layout, so revalidating the
  // settings page alone leaves the header showing stale initials until a hard
  // reload.
  revalidatePath("/admin", "layout");
  return { error: null };
}
```

- [ ] **Step 4: Wire the form**

In `src/features/admin/components/account-profile-form.tsx`, add the imports:

```ts
import { SingleImageUploader } from "@/components/ui/single-image-uploader";
import { photoUrl } from "@/lib/storage";
```

Add the file state beside the existing `useState` calls:

```ts
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
```

Replace the body of `submit` with:

```ts
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const avatarForm = new FormData();
    if (avatarFile) avatarForm.set("image", avatarFile);
    if (removeAvatar) avatarForm.set("removeImage", "1");
    startTransition(async () => {
      const result = await updateMyProfile({ fullName, phone }, avatarForm);
      if (result.error) {
        setError(result.error);
        return;
      }
      // The server now owns whatever was picked; clearing these puts the
      // uploader back to showing the stored photo rather than a stale pick.
      setAvatarFile(null);
      setRemoveAvatar(false);
      showToast("Profile saved.");
    });
  }
```

Replace the avatar column — the `<Avatar>` from Task 6 plus the *"Photo upload coming soon"* caption — with:

```tsx
        <div className="flex shrink-0 flex-col items-center gap-3">
          <Avatar src={currentUser.avatarSrc} fullName={currentUser.fullName} size="lg" />
          <div className="w-56">
            <SingleImageUploader
              existingSrc={currentUser.avatarSrc}
              existingPreviewUrl={currentUser.avatarSrc ? photoUrl(currentUser.avatarSrc) : null}
              alt=""
              onAltChange={() => {}}
              decorative
              previewShape="circle"
              file={avatarFile}
              onFileChange={setAvatarFile}
              removeExisting={removeAvatar}
              onRemoveExistingChange={setRemoveAvatar}
              idPrefix="account-avatar"
            />
          </div>
          <p className="text-xs text-ink-500">Your photo uploads when you save.</p>
        </div>
```

`decorative` hides the alt-text field: an avatar's alt is the person's name, and `<Avatar>` already renders `alt=""` for that reason. `onAltChange` is a no-op for the same reason.

- [ ] **Step 5: Typecheck, lint, and unit tests**

```bash
npm run typecheck && npm run lint && npm run test:unit
```

Expected: all clean.

- [ ] **Step 6: Verify by hand — requires migration 0025 applied**

On `/admin/settings`:

1. Pick a JPG under 2 MB → a circular preview appears saying it uploads on save. Nothing has reached storage yet (check the bucket).
2. Click **Save Profile** → toast, the large avatar updates, **and the top bar avatar updates without a hard reload** (this is what `revalidatePath("/admin", "layout")` buys).
3. Reload `/admin/users` → your row shows the photo.
4. Replace it with a different photo, save, then check the `public-media/avatars/` bucket: the old object is **gone**, not orphaned. If it is still there, the allow-list regex in Step 2 was missed.
5. Click **Remove**, save → back to initials in all three places, object deleted.
6. Try a 5 MB image and a `.gif` → both rejected in the picker, before any request.
7. Run `node scripts/report-orphaned-media.mjs` → no `avatars/` entries.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/single-image-uploader.tsx src/lib/media.ts src/features/admin/actions/account.ts src/features/admin/components/account-profile-form.tsx
git commit -m "feat(settings): upload your own profile picture"
```

---

## Task 8: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code-facing.

- [ ] **Step 1: Document both rules in CLAUDE.md**

Add a bullet to the **Architecture** list, after the "Autosave is a local recovery copy" bullet:

```markdown
- **The idle timeout is one cookie, and its absence is the whole signal.** `sf-activity`
  (`Max-Age` 1800, `Path=/admin`, not `httpOnly` — the client heartbeat writes it) exists
  *iff* the user interacted in the last 30 minutes. Nothing compares two clocks, and the
  browser expiring the cookie on disk is what makes "window closed for 30 minutes" work
  with no code. Constants live only in `src/lib/session-activity.ts`; `IDLE_MS` and the
  cookie's `Max-Age` are one derived value, never two literals. **Two gates read it:**
  `src/middleware.ts` for page GETs, and `getSessionUser()` for everything else — the
  second is not redundant, because Server Action POSTs are excluded from the middleware
  matcher on purpose. `getSessionUserIgnoringIdle` exists for exactly one caller,
  `signOutIdle`, which needs an actor for its audit entry at the moment the cookie has
  just died. The warning dialog owns the **final** minute (29:00→30:00), not a 31st, so
  the client deadline and the cookie expiry are the same instant; `<IdleTimeout />` mounts
  as a **sibling** of `AdminShell` for the usual `backdrop-filter` reason.
```

Add to the **Conventions and gotchas** list:

```markdown
- Staff avatars are `profiles.avatar_src` → `public-media/avatars/<uuid>.<ext>` (migration
  `0025`), null meaning initials. **Own photo only** — there is no editor for anyone
  else's, and `/admin/users` renders them read-only. `initialsOf` lives in
  `src/lib/initials.ts` and is rendered only through `src/components/ui/avatar.tsx`; three
  copies of it existed before, don't start a fourth. Saving one must
  `revalidatePath("/admin", "layout")` as well as the settings path, or the top bar keeps
  the stale initials.
```

- [ ] **Step 2: Run the full check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run build
```

Expected: all clean. The build matters here — `src/app/admin/login/page.tsx` became `async` with `searchParams`, which changes how that route is rendered.

- [ ] **Step 3: Run the public Playwright project**

```bash
npm run test:e2e -- --project=public
```

Expected: pass. Nothing in this work touches the public site; a failure here is a real regression, not a session issue.

- [ ] **Step 4: Run the admin Playwright project**

```bash
npm run test:e2e -- --project=admin
```

Expected: pass (skipped entirely if `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` are absent from `.env.local`). If admin specs now land on `/admin/login?reason=timeout`, the stored session in `tests/e2e/auth.setup.ts` is missing the activity cookie — delete the saved storage state and let setup re-run. Note it in the handoff if it recurs.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the idle-timeout contract and the avatar rules"
```

---

## Self-Review

**Spec coverage.** §2 contract → Task 1. §2.1 timing → Task 1 (asserted by test). §2.2 constants → Task 1. §3 writers/gates → Tasks 2 and 3. §3.2 prefetch → Task 2. §3.3 cookie clearing → Task 2. §4 dialog → Task 4. §4.1 heartbeat + cross-tab → Task 4. §5 non-httpOnly → documented in Task 1's `ActivityCookieOptions` and Task 8. §6.1 schema + baseline → Task 5. §6.2 storage + both `media.ts` edits → Task 7. §6.3 types → Task 5. §6.4 Avatar → Task 6. §6.5 upload flow → Task 7. §6.6 revalidation → Task 7. §6.7 no cropping → nothing to build. §7 risks → Task 7 Step 6.4/6.7 (orphans), Task 8 Step 4 (Playwright), Task 3 (the `cache()`/read-only-cookies note). §8 verification → Tasks 4, 7, 8.

**Type consistency.** `avatarSrc` (camel) in TS, `avatar_src` (snake) in SQL and PostgREST selects, used consistently in Tasks 5–7. `<Avatar>` takes `src` / `fullName` / `size` everywhere it is called. `updateMyProfile(input, avatarForm)` is defined in Task 7 Step 3 and called with that arity in Step 4. `useIdleTimer` returns `{ warning, secondsLeft, stayActive }` in Task 4 Step 1 and is destructured with exactly those names in Step 2. `signOutIdle` is defined in Task 3 and imported in Task 4.

**Two external names were verified against the codebase rather than assumed**: `AuditInput.detail` is an existing optional field (`src/lib/audit.ts:37`), and `primary` / `outline` are existing `ButtonVariant` values (`src/components/ui/button.tsx:5,9`). No task depends on a type, function, or prop that does not already exist or is not defined in an earlier task.

**One placeholder is intentional and is not a plan failure**: Task 4 Step 5 has the implementer temporarily shorten `IDLE_MS` / `WARN_MS` to test a 30-minute timer in under two minutes, and then restore them. The restore is guarded — Task 1's test asserts `ACTIVITY_MAX_AGE_SECONDS * 1000 === IDLE_MS`, so a half-restored edit fails the suite rather than shipping.
