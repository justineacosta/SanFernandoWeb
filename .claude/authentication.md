# Authentication

Supabase Auth, server-driven throughout. **There is no browser-side Supabase client
anywhere in this app** — don't introduce one. Permissions are a separate concern:
`.claude/authorization.md`.

## Session resolution

`src/lib/auth.ts` is the only entry point.

- `getSessionUser()` — the signed-in profile, or `null` when signed out, disabled,
  archived **or idle past the timeout**. `cache()`d per request. It reads cookies and never
  writes them (`cookies()` is read-only in a Server Component); Proxy and the client
  heartbeat own every write.
- `getSessionUserIgnoringIdle` — one caller only, `signOutIdle`, which needs an actor for
  its audit entry at the moment the activity cookie has just died.
- `requireSessionUser()` redirects to `/admin/login`. **Signed-out users are redirected,
  not 404'd** — they may well hold the permission once authenticated.

## The idle timeout is one cookie, and its absence is the whole signal

`sf-activity`: `Max-Age` 1800, `Path=/`, **not** `httpOnly` (the client heartbeat writes
it). It exists *iff* the user interacted in the last 30 minutes. Nothing compares two
clocks — the browser expiring the cookie on disk is what makes "window closed for 30
minutes" work with no code.

- `Path=/`, not `/admin`: a browser only attaches a cookie to a request path starting with
  `Path + "/"`, and the notification poll hits `/api/admin/notifications`.
- **Constants live only in `src/lib/session-activity.ts`.** `IDLE_MS` and the cookie's
  `Max-Age` are one derived value, never two literals.
- **Two gates read it and the second is not redundant:** `src/proxy.ts` for page GETs, and
  `getSessionUser()` for everything else — Server Action POSTs are excluded from the Proxy
  matcher on purpose, so without the second gate a user could sit in a drawer submitting
  saves indefinitely without a single page GET.
- The warning dialog owns the **final** minute (29:00→30:00), not a 31st, so the client
  deadline and the cookie expiry are the same instant. `<IdleTimeout />` mounts as a
  **sibling** of `AdminShell` (see the `backdrop-filter` trap in `.claude/ui-ux.md`). Its
  keydown listener is **capture-phase on purpose**: Escape must not dismiss an inactivity
  warning, and must not reach a `Drawer`/`ConfirmDialog` open behind it either — those
  listen on `document` in the bubble phase and were registered first, so the dialog
  swallows the key from capture where `stopImmediatePropagation()` still comes first.
- **Both idle sign-out paths are audited identically** (`type: "logout"`, `detail: "signed
  out for inactivity"`): `signOutIdle` for an open tab, and the Proxy idle-gate branch for a
  closed one — the latter has no live client to call the action from, since discovering the
  expiry *is* the request that trips it. It resolves the actor from the `getUser()` result,
  fetches `full_name` via the service-role client (`profiles` is unreadable otherwise) and
  calls `recordActivity` directly. Safe because **Proxy defaults to the Node.js runtime as
  of Next 16** — `proxy.ts` (renamed from `middleware.ts` in the 2026-07-28 pass) does not
  accept a `runtime` config at all; setting one throws. A stale background tab can file a
  second, harmless row; not deduplicated, since two true rows cost less than the query to
  suppress one.

## `src/proxy.ts` — `isPublicAuthPage` exempts two branches, not one

Beyond the `if (!user && !isPublicAuthPage)` redirect-to-login check, **the idle gate must
test it too.** The `sb-*` refresh token lives for days, so a staffer still signed in but
idle 30+ minutes who clicks their own emailed reset link hits that gate — and its redirect
to `/admin/login?reason=timeout` **discards the query string**, throwing away the one-time
`token_hash` with no route back. A second block right after it handles the same idle
condition on the two reset pages by deleting the stale `sb-*` cookies onto the response that
goes on to render normally: same hygiene, no redirect, query string intact. It carries
`!isLoginPage` so `/admin/login` still falls through to the redirect-to-`/admin` branch,
files no audit entry (that page is public by design), and sets a `clearedStaleSession` flag
the bottom activity-slide block checks so no `sf-activity` window opens for a session just
deleted.

## Sign-in and the adaptive challenge

`/admin/login` shows a Turnstile challenge **only after a failed attempt** on that IP or
email — the trigger is ≥ 1 hit on `login:ip:*`/`login:email:*` inside `LOGIN_WINDOW_MS`
(5 min), read off the same `rate_limit_hits` rows that already drive the 5-failure block. No
new table, column or key namespace. Spec:
`docs/superpowers/specs/2026-08-03-admin-login-captcha-design.md`.

- `LOGIN_WINDOW_MS` is the one knob moving both thresholds at once: shortening it gives a
  blocked attacker their 5 guesses back more often *and* drops the challenge sooner — the
  tradeoff that makes a locked-out staffer tolerable, since **there is deliberately no
  break-glass bypass flag.**
- **Always-on was rejected on purpose.** `verifyTurnstileToken` fails closed and throws in
  production on a missing key, so an unconditional widget puts a hard Cloudflare dependency
  in front of the only door into the portal — an outage, a blocked network or a key rotation
  (site key is inlined at build time) would lock out every staffer including the SuperAdmin,
  with nobody able to sign in and fix it.
- **`countRateLimitHits(key, windowMs)` returns `number | null` and the two predicates read
  `null` in opposite directions — that asymmetry is the point.** `isOverLoginLimit` fails
  **open** (a limiter outage must not lock out real staff); `needsChallenge` fails
  **closed**, so the same outage that used to remove all brute-force protection now
  challenges every attempt instead. Both are pure and unit-tested
  (`src/features/admin/lib/login-challenge.ts`) — they live outside `actions/auth.ts`
  because that file is `"use server"` and Vitest can't import it.
- **`signIn` recomputes the condition server-side every call.**
  `SignInFormState.challengeRequired` is a UI hint only, so a client that never mounts the
  widget is refused identically. It **extends** `AuthFormState` rather than widening it: the
  base type stays the password-reset flow's, which has no challenge concept and must not
  carry an inert field. (Same rule as `SubmitAssistanceResult extends SubmitTicketResult` —
  when a base type has other callers, extend it.) **The Turnstile check runs AFTER the count reads, inverting
  the "verify first" rule** in `.claude/security.md` — whether a challenge is required at
  all depends on state only those reads reveal. It is commented at the call site so it
  doesn't get "fixed" back.
- **A failed or missing token records no rate-limit hit.** Hits are keyed partly on email,
  so counting them would let anyone lock a known staff address out with five tokenless
  POSTs. A successful sign-in likewise records nothing; only a failed sign-in or a
  disabled-account rejection does.
- **`page.tsx` server-renders the initial challenge state** (reads `countRateLimitHits` for
  the request IP, passes `initialChallengeRequired` into `LoginForm`). Without it a staffer
  on a shared office IP a colleague had just flagged submits correct credentials with no
  token and is refused — the ordinary case for a barangay hall behind one public IP. It
  passes `0`, never `null`, for the email count: `needsChallenge` treats `null` as
  fail-closed, which would put a widget on every first load and destroy the adaptive
  behaviour. **The email half is unfixable at render time** and is closed by copy instead —
  the failed-challenge branch returns `TURNSTILE_FAILURE_MESSAGE`, not `"Incorrect email or
  password."`, so a staffer whose own address is flagged isn't told a working password is
  wrong.
- Client-side this form can't follow the 8 public forms' pattern: it is `useActionState` +
  a native `<form action={...}>` with no `handleSubmit`, so the token rides in a hidden
  `turnstileToken` input and the single-use widget is `reset()` from a `useEffect` keyed on
  `state` **identity** (a second failure yields a new object with identical copy). That
  effect fires only on failures — a successful sign-in throws `NEXT_REDIRECT` and never
  returns a new state.
- **This raises the stakes on the `requestIp()` follow-up** (`docs/HARDENING_BACKLOG.md`):
  `login:ip:*` is both the CAPTCHA trigger and the sole input to
  `initialChallengeRequired`, so a caller rotating a forged `cf-connecting-ip` buys one
  unchallenged guess *per account* in a spraying attack. Still bounded by the email key, so
  degradation rather than a hole.
- A rejected sign-in is **deliberately not** written to the audit log: the row would be
  unbounded and attacker-triggerable at will.

## Self-service "Forgot password?"

Two public pages, `/admin/forgot-password` and `/admin/reset-password`, sharing the login
page's split-screen chrome via `AuthLayout`
(`src/features/admin/components/auth-layout.tsx`; `children` mounts twice, once per
responsive tree, exactly as `<LoginForm />` always has). **No new database table.** Spec:
`docs/superpowers/specs/2026-07-31-admin-forgot-password-design.md`.

- **`requestPasswordReset` returns the same generic response for every outcome** — real
  account, unknown email, inactive account, rate-limited alike. Turnstile-gated, then rate
  limited with `checkRateLimit`'s record-on-every-call form (**not** `signIn`'s
  success-doesn't-count split: differential counting is itself an enumeration signal).
  `RESET_LIMIT` = 3 per 15 min on both a `reset:ip:*` and a `reset:email:*` key.
- **`RESET_TIMING_FLOOR_MS` (1200) closes the same leak in the time dimension** — the
  found-active branch makes three sequential network hops the other branches don't, so
  without a floor a script could enumerate staff addresses by stopwatch. 1200 sits above
  those hops without making rejected requests wait out `sendEmail()`'s 5s ceiling.
- **Account existence is decided by `generateLink`'s own result, not a `profiles` lookup by
  email.** `profiles.email` isn't guaranteed to share `auth.users.email`'s case
  normalization (`createTeamUser` inserts whatever case was typed), so matching by email
  risked a false negative for a real account. `generateLink` returns the user's id and
  `profiles` is queried by that instead.
- **The emailed link carries `properties.hashed_token`, and `resetPassword` redeems it with
  `verifyOtp({type:"recovery", token_hash})` — NOT `action_link` +
  `exchangeCodeForSession`. Do not "simplify" this back.** It shipped that way, was broken
  for every possible link, and six reviews missed it because it reads like the documented
  happy path: `@supabase/ssr`'s `createServerClient` hardcodes `flowType: "pkce"` *after*
  spreading caller-supplied auth options, so `src/lib/supabase/server.ts` cannot override
  it, and PKCE's `exchangeCodeForSession` demands a code-verifier written only by the client
  that *initiated* the flow. Here the initiator is the service-role admin client, which
  writes nothing to the user's browser, so the verifier can never exist and every exchange
  throws `AuthPKCECodeVerifierMissingError` even on a fresh link. `verifyOtp` needs no
  verifier and persists the session through the cookie-bound client's normal adapter —
  exactly the session `updateUser({password})` then runs against.
- Since the app builds the URL itself (`${EMAIL_SITE_URL}/admin/reset-password?token_hash=…`)
  and never sends `redirectTo`, **no Supabase dashboard Redirect-URL entry is needed on any
  environment.**
- **Redemption happens only at submit time inside the Server Action, never on page render**
  — corporate "safe link" scanners pre-fetch every link in an inbound email and would burn
  the single-use token before the recipient clicks. The page only reads the `token_hash`
  search param into a hidden input.
- **`token_hash` is a wire contract** (URL → input `name` → `formData.get()`); `tokenHash`
  everywhere internal. A mismatch compiles clean and fails silently at runtime.
- `RESET_SUBMIT_LIMIT`/`RESET_SUBMIT_WINDOW_MS` (10 per 15 min, `reset-submit:ip:*`) is
  defense-in-depth against replay of the token itself. After the password updates the
  session is signed straight back out before redirecting to `/admin/login?reset=success`; it
  never touches the `sf-activity` cookie.
- Both audit entries reuse the existing `"password_reset"` `AuditActionType`; see
  `.claude/audit-logs.md` for why the request-side one carries a `detail`.

## Account creation is password-based

The SuperAdmin types the new staff member's password. Spec:
`2026-08-06-superadmin-password-and-staff-email-removal-design.md`. **This reverses the
invite-based design of 2026-08-01** on the project owner's explicit request — that spec is a
historical record, don't implement from it, and **don't reintroduce** `sendAccountInvite` /
`resendTeamUserInvite` / `AccountInviteEmail` / `TeamUser.invitePending` /
`invitePendingFlags()`, all deleted with it.

- `createTeamUser` (`/admin/users`, SuperAdmin-only) takes a `password` on `TeamUserInput`
  validated `.min(10)` — matching the floor `resetPassword` and `changeMyPassword` already
  enforce, so **all three doors into a password agree** rather than each carrying its own
  number.
- Password + Confirm exist in **create mode only** (edit mode still cannot set another
  user's password). Confirm is a client-side typo guard — there is no server-side match
  check, by design.
- `email_confirm: true` suppresses Supabase's own verification mail, so **account creation
  sends no email whatsoever.** The credential travels out of band, and
  `/admin/forgot-password` is the answer to a lost or mistyped one. The recovery-link
  mechanism itself survives untouched; only its account-invite consumer went away.
- `profiles.first_name`/`middle_name`/`last_name` (`0031`) are kept in sync with
  `full_name` on every SuperAdmin-driven write by `buildFullName()`
  (`src/features/admin/lib/build-full-name.ts`). Settings → Profile's self-service "Full
  Name" field still writes `full_name` directly, so a user who renames themselves there
  drifts the split columns out of sync — **accepted**, see the spec's "Accepted drift".
- `profiles.phone` is captured at creation and editable by a SuperAdmin for someone else's
  account, gated the same "only when editing someone else" way the email field is.

## "Remember me" is interactive but wired to nothing

It ships `defaultChecked`, `name="remember"`, not disabled — un-disabled on explicit
direction, reversing its original "honest, not dead, UI" placeholder treatment without
replacing the rationale. The form submits a `remember` value **that no Server Action
reads**, so ticking it has zero effect: session length is still governed solely by the
30-minute idle model. Wiring it up is a real, unscoped security change, not a UI tweak.
