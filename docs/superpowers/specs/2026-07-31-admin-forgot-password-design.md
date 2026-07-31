# Admin forgot-password — design

**Status:** approved, ready for implementation planning.
**Closes:** the honesty placeholder on `/admin/login`'s "Forgot password?"
button (`login-form.tsx`), which currently just shows a "Contact SuperAdmin"
toast because, per its own comment, the app "has no reset flow to link to
yet." Also closes `2026-07-30-resend-email-integration-design.md`'s "Out of
scope" note that a password-reset email flow didn't exist and wasn't
designed.

## Context

Only admin/staff have Supabase Auth accounts (`profiles`) — residents are
fully unauthenticated across every public route, so this flow is purely an
admin-portal concern. Confirmed during brainstorming: no public account
system exists anywhere in the codebase to extend.

The codebase's existing auth (`src/lib/auth.ts`,
`src/features/admin/actions/auth.ts`) is entirely server-driven — no
browser-side Supabase client exists anywhere. This design preserves that
property rather than introducing one.

`changeMyPassword` (`src/features/admin/actions/account.ts`) already lets a
signed-in user change their own password, but it requires knowing the
current password — a structurally different flow from "forgot password,"
where the whole point is the user doesn't have it. Not reused directly.

## Scope

1. A public "request a reset link" page and Server Action.
2. A public "set new password" page and Server Action, reached via the
   emailed link.
3. One new Resend email template.
4. Replacing `login-form.tsx`'s dead Toast with a real link.
5. A small shared layout extraction so the three auth pages (login,
   forgot-password, reset-password) don't triplicate the split-screen chrome.

Out of scope: SuperAdmin-initiated/forced resets from `/admin/users` (may be
a future addition, not designed here — confirmed with Justine during
brainstorming that self-service email link is the only mechanism needed for
now); SMS-based reset; any change to session/idle-timeout behavior.

## Approaches considered

- **A — Supabase's built-in recovery link, exchanged server-side via PKCE
  `code` (chosen).** Generate the link with the service-role
  `auth.admin.generateLink({type: 'recovery', ...})` (no email sent by
  Supabase itself — we own the send), then exchange the returned `code` for
  a session server-side with `exchangeCodeForSession(code)` when the user
  submits their new password. Reuses Supabase's vetted secure-token
  generation/expiry, needs no new table, no new migration, and requires no
  browser Supabase client — consistent with every other auth code path in
  this app being server-only.
- **B — Fully custom token.** Generate our own random token, store its hash
  in a new `password_reset_tokens` table with an expiry column, verify it
  server-side, then set the password via the service-role admin client.
  Rejected: more code (a migration, expiry/cleanup logic, hashing) to
  reimplement something Supabase Auth already does correctly, for no
  behavioral gain.
- **C — Supabase's own hosted recovery flow + browser client.** Let
  Supabase's default mailer send its own recovery email, and add a browser
  Supabase client to `setSession`/`updateUser` client-side after redirect.
  Rejected: introduces the one piece of client-side Supabase auth
  infrastructure this app has deliberately avoided everywhere else, and the
  email would need separate branding configuration in the Supabase
  dashboard instead of going through the app's existing `EmailLayout`
  templates.

## Request flow

- New page `/admin/forgot-password` (`src/app/admin/forgot-password/page.tsx`),
  same split-screen visual family as `/admin/login`, via the shared
  `AuthLayout` (see below). Renders `ForgotPasswordForm` — an email field
  plus `TurnstileWidget`, matching the other 8 public-form call sites.
- Server Action `requestPasswordReset(prevState, formData)` in
  `src/features/admin/actions/auth.ts`, following `signIn`'s existing
  ordering (cheapest rejection first):
  1. `verifyTurnstileToken` — same shared helper and failure message as
     every other public form.
  2. Zod-validate the email.
  3. Rate limit via `checkRateLimit` (the **record-on-every-call** variant,
     not `signIn`'s success-doesn't-count split — every request, valid
     account or not, must consume the budget identically, or differential
     counting itself becomes an enumeration signal). Two keys, mirroring
     `signIn`: `reset:ip:<ip>` and `reset:email:<normalizedEmail>`.
     `RESET_LIMIT = 3`, `RESET_WINDOW_MS = 15 * 60 * 1000` (new constants
     alongside `LOGIN_LIMIT`/`LOGIN_WINDOW_MS` in the same file).
  4. Look up an active, non-archived `profiles` row by email via the
     service-role client (needed regardless of RLS, same as every other
     admin-portal query).
  5. If found: call `supabaseAdmin.auth.admin.generateLink({type:
     'recovery', email, options: {redirectTo:
     `${EMAIL_SITE_URL}/admin/reset-password`}})`, then `sendEmail` a new
     `PasswordResetEmail` to that address with the returned
     `properties.action_link`, then insert an `audit_log` row (`type:
     "password_reset_requested"`, actor resolved from the found profile —
     see Audit logging below).
  6. **Always returns the same generic success state** — "If an account
     exists for that email, we've sent a reset link" — regardless of steps
     4-5's outcome. This is the standard anti-enumeration practice and is
     non-negotiable for a public, unauthenticated form.
- `AuthFormState`-shaped return (`{ error: string | null }` on the
  rejection paths from steps 1-3; a separate `{ submitted: true }` success
  shape the form uses to swap in the generic message) — mirrors
  `signIn`'s `useActionState` wiring in `login-form.tsx`.

## Reset flow

- New page `/admin/reset-password` (`src/app/admin/reset-password/page.tsx`).
  Reads the `code` search param server-side. If absent or empty, renders an
  "This link is invalid — request a new one" message with a link back to
  `/admin/forgot-password`, and never renders the form. Otherwise renders
  `ResetPasswordForm` with `code` as a hidden field.
- **The code is exchanged lazily, at submit time inside the Server Action —
  never eagerly on page load.** This is deliberate: corporate email
  "safe link" scanners pre-fetch/HEAD every link in an inbound email before
  the recipient ever opens it, which would silently burn Supabase's
  single-use recovery code before the real user clicks, breaking the flow
  for anyone behind such a scanner. Rendering the page is a pure read of
  the search param; nothing about the code is consumed until submit.
- Server Action `resetPassword(prevState, formData)`:
  1. Zod-validate `code` (present) and the new password (min 10 chars,
     matching `changeMyPassword`'s existing rule) + confirm-password match.
  2. Create a request-scoped cookie-bound server Supabase client (the same
     `createSupabaseServerClient()` helper `signIn` uses) and call
     `exchangeCodeForSession(code)`. An error here (expired/already-used
     code) returns `{ error: "This reset link has expired or already been
     used. Request a new one." }` — no rate limiting needed on this
     specific failure since Supabase's codes are long, single-use, random
     strings; brute-forcing one is infeasible, but the action still sits
     behind a basic per-IP rate limit as defense-in-depth against replay
     spam.
  3. On success, that server client now holds an authenticated recovery
     session. Call `supabase.auth.updateUser({ password })` on it — the
     exact call `changeMyPassword` already makes, just against a
     recovery-established session instead of a normal one.
  4. Resolve the actor (`getUser()` on that same session, then `full_name`
     via the service-role client — same pattern
     `src/proxy.ts`'s closed-window idle-logout branch already uses to log
     an action with no live "current session user" context) and insert an
     `audit_log` row, `type: "password_reset_completed"`.
  5. **Immediately sign that session back out** (`supabase.auth.signOut()`)
     before responding — the recovery session must not linger as a live
     logged-in session, and this path never touches the custom `sf-activity`
     idle cookie the normal `signIn` flow sets, so nothing about the admin
     portal's idle-timeout model is affected.
  6. `redirect("/admin/login?reset=success")` — `login-form.tsx` (or the
     login page) reads that param to show a one-time success toast telling
     the user to sign in with their new password. Reuses the existing
     `<Toast>` component the same way the "Contact SuperAdmin" placeholder
     already did, not a new toast mechanism.

## Email template

- `src/emails/PasswordResetEmail.tsx` — new file, wraps `<EmailLayout>`
  exactly like every existing template. Props: `resetUrl` (the Supabase
  `action_link`), `expiresInMinutes` (display copy only — the real expiry
  is enforced by Supabase). Body: a short explanation, a button/link to
  `resetUrl`, a note that the link expires shortly and to ignore the email
  if this wasn't requested. No `<TicketNotice>` reuse — that component is
  ticket-specific (ticket numbers, remarks, requirements lists), nothing
  here fits it.
- Sent via the existing `sendEmail()` wrapper — same fail-open behavior as
  every other trigger (a Resend outage degrades to "no email sent," never
  a thrown error back to `requestPasswordReset`, and the generic response
  is returned either way per the anti-enumeration rule above).

## Shared layout extraction

- `login-form.tsx`/`page.tsx` currently inline the full split-screen chrome
  (desktop brand panel with seal/dot-grid/watermark, mobile card, the
  shared background photo + scrim). Extracting an `AuthLayout` component
  (`src/features/admin/components/auth-layout.tsx` or similar) that takes
  the form content as children/props and renders that identical chrome,
  used by all three pages (`login`, `forgot-password`, `reset-password`).
  Avoids a third (and now fourth counting reset) copy of that JSX. The
  `-translate-y-10` wrapper and its portal-for-Toast implication (documented
  in CLAUDE.md's login-split-screen bullet) moves into this shared layout
  too, since any toast on any of these three pages would hit the same
  transformed-ancestor problem `login-form.tsx`'s Toast already solved via
  `createPortal`.
- `login-form.tsx`'s "Forgot password?" button and its `showForgotToast`
  state/Toast portal are deleted entirely, replaced with a plain
  `<Link href="/admin/forgot-password">` styled identically to the old
  button.

## Audit logging

- Two new `audit_log` entries, following the existing `type` +
  `detail`-string convention (e.g. `signOutIdle`'s `"signed out for
  inactivity"`): `password_reset_requested` (fires only when a real,
  active profile was found in step 4 above — there is no actor to log
  against for an unknown/inactive email, and logging an attempt against a
  nonexistent account would itself be a minor enumeration leak into the
  audit trail) and `password_reset_completed`.

## Security notes

- Anti-enumeration is the load-bearing constraint on the request flow:
  identical response, identical rate-limit accounting, regardless of
  whether the email matches a real, active account.
- Turnstile on the request form only — the reset-submission form's "proof"
  is the emailed single-use code itself, not a second CAPTCHA.
- No change to `LOGIN_LIMIT`/`LOGIN_WINDOW_MS` or the login flow itself
  beyond the link swap.

## Testing

- **Vitest**: none of this is pure-function-shaped beyond what already
  exists (Zod schemas aren't unit-tested elsewhere in this codebase either).
- **Playwright**: a new `tests/e2e/admin/forgot-password.spec.ts` covering
  the request form's generic-success-message behavior (submitting a
  nonexistent email must look identical to a real one from the UI's
  perspective) and the invalid/missing-code state on `/admin/reset-password`.
  The full email-round-trip (clicking a real emailed link) is not
  automatable without a live inbox — manual verification via the `verify`
  skill once `RESEND_API_KEY` is set, same limitation the Resend
  integration design already documented for its own suites.

## Out of scope

- SuperAdmin-initiated/forced password reset from `/admin/users`.
- Any resident-facing account system (none exists).
- SMS-based reset.
- Changing `changeMyPassword`'s existing current-password-required flow.
