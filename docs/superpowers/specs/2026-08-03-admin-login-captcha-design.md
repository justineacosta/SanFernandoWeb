# Adaptive Turnstile challenge on `/admin/login` — design

**Status:** approved, ready for implementation planning.
**Closes:** the gap where the durable rate limiter is the *only* brute-force
defence on the admin sign-in form, and that limiter fails open — so a Supabase
outage silently removes every protection from the one door into the portal.

## Context

All 8 public anonymous Server Actions verify a Cloudflare Turnstile token before
doing anything else (security-hardening Plan 2,
`docs/superpowers/specs/2026-07-28-security-hardening-design.md` §5). `signIn`
(`src/features/admin/actions/auth.ts`) is the conspicuous exception: it is a
public, unauthenticated Server Action with no CAPTCHA at all.

Its only defence is the durable limiter (`rate_limit_hits`, migration `0029`):
`LOGIN_LIMIT` = 5 failures per `LOGIN_WINDOW_MS` = 15 minutes, on both a
`login:ip:*` and a `login:email:*` key. `signIn` deliberately uses the read-only
`isRateLimited` + explicit `recordRateLimitHit` pair rather than
`checkRateLimit`, so a *successful* login records nothing — the threat model is
repeated failures, not usage volume.

`checkRateLimit` and `isRateLimited` both **fail open** on a Supabase error
(returning "within budget" / "not limited"). For the public forms that is a
deliberate, well-reasoned tradeoff: Turnstile is still underneath, and Zod is
still the correctness gate. For admin login there is nothing underneath. During a
Supabase blip, `signIn` accepts unlimited password guesses.

## What this adds

A Turnstile challenge on `/admin/login` that appears **only after a failed
attempt** against that IP or that email address, enforced server-side.

## 1. Why adaptive rather than always-on

`/admin/login` is the only entrance to the portal, and
`verifyTurnstileToken` fails *closed* by design — in production it `throw`s on a
missing `TURNSTILE_SECRET_KEY` rather than bypassing.

Mounting the widget unconditionally, exactly as the 8 public forms do, would put
a hard Cloudflare dependency in front of that single door. A Turnstile outage, a
network that blocks `challenges.cloudflare.com`, an expired key, or a botched key
rotation (the site key is inlined at build time, so rotation needs a rebuild, not
just a redeploy) would lock out **every staff member including the SuperAdmin**,
with nobody able to sign in to fix it. On a public form the same failure costs one
resident one submission attempt; here it costs the barangay its entire portal.

Adaptive keeps that door open for anyone who types their password correctly, while
a credential-stuffing script — which by definition fails constantly — is challenged
on every attempt after its first miss. A staff member who typos once sees a
challenge on their second try.

**Deliberately no break-glass bypass flag.** Any env var or query parameter that
skips the challenge is a hole an attacker can look for, and it would recreate
precisely the exposure this closes.

## 2. The trigger

A challenge is required when **either** `login:ip:<ip>` **or**
`login:email:<normalized-email>` has **≥ 1 hit** inside the existing
`LOGIN_WINDOW_MS`. These are the exact rows `signIn` already writes on a failed
sign-in or a disabled-account rejection.

**No new table, no new column, no new key namespace.** The rows that drive the
5-failure block also drive the 1-failure challenge; only the threshold differs.

### `countRateLimitHits`

Reading two thresholds off the same key with the existing `isRateLimited` would
mean two `count` queries per key — four per login attempt. Instead, add to
`src/lib/rate-limit.ts`:

```ts
countRateLimitHits(key: string, windowMs: number): Promise<number | null>
```

`null` means the count could not be read (a Supabase error).

**`isRateLimited` is deleted, not wrapped.** `signIn` (lines 63–64) is its only
caller in the entire codebase, and both of those calls become
`countRateLimitHits`. Keeping it as a thin wrapper would leave a function with
zero callers, which this project removes rather than retains — the same treatment
`photoUrl` / `documentUrl` / `PUBLIC_MEDIA_BUCKET` got once the media-bucket
wiring stopped calling them, and `ADMIN_TEAM` got once `TeamManager` shipped.

Two doc comments in `src/lib/rate-limit.ts` name `isRateLimited` and must be
updated in the same change: the `checkRateLimit` header (line ~31, "see
`isRateLimited` / `recordRateLimitHit` below") and the `recordRateLimitHit`
header (line ~91, "Pairs with `isRateLimited` above"). `recordRateLimitHit`
itself is unchanged and keeps both its call sites.

### The fail-open inversion, and why it is the point

`null` is interpreted differently by the two thresholds, and this asymmetry is the
main security gain of the whole design:

| Condition | On `null` (Supabase unreachable) | Reasoning |
|---|---|---|
| Over `LOGIN_LIMIT` → block | **No** (fail open) | Unchanged from today. A limiter outage must not lock out real staff. |
| ≥ 1 hit → challenge | **Yes** (fail closed) | Cheap, recoverable, and it is exactly the window in which the limiter is providing no protection. |

So during the outage that today removes all brute-force defence, login instead
falls back to challenging **every** attempt — the always-on behaviour, but only
while the cheaper adaptive signal is unavailable. The degraded mode is strictly
safer than the healthy one.

## 3. Server enforces; the client flag is a hint

`AuthFormState` gains `challengeRequired: boolean`. A rejected attempt returns it
`true`, and `LoginForm` mounts `<TurnstileWidget>` in response.

That flag is **presentation only**. `signIn` independently recomputes the trigger
condition on every call and rejects a missing or invalid token regardless of what
the client rendered — a script that simply never mounts the widget is refused
exactly like one that submits a bad token. A Server Action is a public HTTP
endpoint; what the previous response told the client is not a constraint on the
next POST.

### Ordering inside `signIn`

```
Zod validation
  → countRateLimitHits on both keys (one query each)
  → over-LOGIN_LIMIT rejection
  → challenge check (verifyTurnstileToken) when either count ≥ 1
  → signInWithPassword
  → profile is_active / is_archived check
  → idle cookie, audit entry, redirect
```

This **inverts** the security-hardening spec's §5 rule that Turnstile is verified
first, before the rate limit and before validation, so a failed challenge is the
cheapest possible rejection. That rule cannot hold here: whether a challenge is
required at all depends on state only a DB read reveals, so the read must come
first. The inversion must be commented at the call site, or the next reader will
correct it back into a bug.

### A failed challenge records no rate-limit hit

Rate-limit hits are keyed partly on email. If a missing or invalid token recorded
one, anyone who knows a staff address could lock that person out of their own
account with five tokenless POSTs.

Bad *passwords* already carry that property, and it is inherent to email-keyed
limiting — but this change must not make the lockout cheaper to trigger than it
already is. A challenge failure returns the same
`"Incorrect email or password."` copy every other rejection uses, and writes
nothing.

## 4. Client wiring

Two details are specific to this form and do not appear in any of the 8 public
forms.

### The form is mounted twice

`src/app/admin/login/page.tsx` renders both responsive trees unconditionally and
toggles them with `md:hidden` / `hidden md:flex` — CSS `display:none`, never
conditional mounting. So there will be two `<TurnstileWidget>` instances, one
inside a hidden subtree.

Each `LoginForm` instance owns its own token state and widget ref, the same way it
already owns its own `useId()`-derived control ids. The hidden instance may never
solve its challenge; its form is never submitted, so nothing depends on it.
Verification must confirm the *visible* instance solves at both breakpoints.

### No `handleSubmit` to hang the token or the reset off

The 8 public forms put the token into their action call and `reset()` the widget
inside their own `handleSubmit`. This form is `useActionState` + a native
`<form action={formAction}>` and has no such hook.

- **Token in:** a hidden `<input name="turnstileToken">` whose value is React
  state, set from the widget's `onVerify` callback.
- **Reset after:** a `useEffect` keyed on `state` *identity*, mirroring the
  existing `dismissedState` pattern in the same file — a second failure produces
  a new `state` object even when the copy is identical.

That effect only ever runs on failures: a successful sign-in ends in `redirect()`,
which throws `NEXT_REDIRECT` and never produces a new state. This keeps the change
clear of the standing rule (CLAUDE.md, security-hardening bullet) that
`login-form.tsx` / `sign-out-button.tsx` / `idle-timeout.tsx` must never wrap their
action calls in a `catch`, because doing so swallows that redirect throw.

## 5. Tests

**`.env.example`** documents Cloudflare's always-pass test keys for local and CI
admin runs:

- site: `1x00000000000000000000AA`
- secret: `1x0000000000000000000000000000000AA`

**`tests/e2e/admin/login.spec.ts`** — attempts 2 through 5 now require a token, so
the test must wait for the hidden input to be populated before clicking, or it
races the widget. New assertions:

1. attempt 1 renders no challenge;
2. attempt 2 does;
3. a POST with no token is refused even with correct credentials.

Assertion 3 is the one that proves the server gate rather than the UI. Following
the discipline the ticket-timeline spec established — *a guard that has never been
seen to fail is not a guard* — each new assertion must be verified to fail with its
own fix reverted.

**`tests/e2e/auth.setup.ts`** — unchanged. It types the correct password, so it is
normally never challenged. The case where a prior `login.spec.ts` run leaves it
blocked is the pre-existing rate-limit collision CLAUDE.md already documents under
Commands, not something this design introduces.

## 6. Accepted tradeoffs

**A staffer who typos once and then hits a Cloudflare outage cannot sign in until
the 15-minute window drains.** There is no override. Everyone who types their
password correctly is unaffected, including during a total Turnstile failure —
which is the entire reason adaptive was chosen over always-on.

**A shared office IP couples colleagues.** One person's failed attempt puts the
whole office behind a challenge for 15 minutes, since `login:ip:*` is one of the
two trigger keys. This is already true of the 5-failure block and is not made
worse here; a challenge is a far milder consequence than the lockout that key can
already cause.

**Turnstile analytics will show renders from hidden widget instances** (§4). Cosmetic.

## 7. Out of scope

- The staff-notification BCC fix (`to: staffEmails` → `bcc`) in
  `contact/actions.ts`, `feedback/actions.ts` and `track/actions.ts`.
- The `remember` checkbox, which still submits a value no Server Action reads.
- Making the rate limiter fail closed generally — §2's inversion covers the login
  case specifically, which is the one with nothing underneath it.
- The four other findings from the 2026-08-03 review (PII retention, upload
  magic-byte validation, `/track` gate entropy).
