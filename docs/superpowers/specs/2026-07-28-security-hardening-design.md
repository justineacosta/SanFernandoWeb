# Security hardening pass

2026-07-28. Not yet built — this is the approved design, to be handed to the
planning skill next.

## Problem

The master spec (`docs/superpowers/specs/2026-07-15-backend-integration-design.md`
§12) named hardening as build-order step 8 — "rate limits, Turnstile, headers,
RLS review, privacy/terms pages, Playwright tests" — and every other step in
that build order has since shipped. Hardening never has. An audit done
2026-07-28 (see the chat history behind this spec, not reproduced here) found
nine gaps, three already flagged in `docs/BACKEND_HANDOFF.md` §3/§6 and six
new:

1. `src/lib/rate-limit.ts` is an in-memory, single-instance limiter — resets
   on redeploy and doesn't share state across serverless instances. Already
   flagged in its own top-of-file comment.
2. `next.config.ts`'s `experimental.serverActions.bodySizeLimit: "12mb"` is
   global, so it also raises the accepted body size on every public,
   unauthenticated Server Action (contact/application/appointment/complaint/
   assistance), not just the admin PDF upload it exists for. Already flagged
   in the transparency-documents changelog entry in CLAUDE.md.
3. An unevaluated alternative — raising `proxyClientMaxBodySize` directly
   instead of the current middleware-matcher exclusion — was noted as worth
   revisiting. Already flagged in the same changelog entry.
4. **`signIn` in `src/features/admin/actions/auth.ts` has no rate limiting at
   all** — every one of the 8 public submission endpoints calls
   `checkRateLimit`/`requestIp`; the admin login action calls neither.
   Unlimited password-guessing against any known staff email is possible
   today.
5. **`npm audit` reports 3 high-severity advisories**, the most relevant
   being two against `next@16.2.10` itself: a middleware/proxy bypass in the
   App Router, and unauthenticated disclosure of internal Server Function
   endpoints. Both bear directly on this app's `/admin` auth model. The
   other two (`postcss`, `sharp`) are transitive.
6. **No security response headers** — no CSP, `X-Frame-Options`,
   `Strict-Transport-Security`, `X-Content-Type-Options`,
   `Referrer-Policy`, or `Permissions-Policy` anywhere. `next.config.ts` has
   no `headers()` export.
7. **No privacy policy or terms page** — named explicitly in the master
   spec's step 8, never built.
8. **No CAPTCHA (Turnstile)** on any of the 8 anonymous public forms — also
   named explicitly in step 8, never built. The in-memory rate limiter is
   currently the only anti-abuse layer on all of them.
9. **`middleware.ts` is a deprecated file convention as of Next 16.0** — the
   framework renamed it to `proxy.ts` (confirmed against the current Next.js
   docs during this spec's research). The rename itself is mechanical, but
   the new convention **rejects a `runtime` config export outright** — and
   `src/middleware.ts` currently sets `runtime: "nodejs"` explicitly, with a
   comment explaining why (the idle-gate branch calls the service-role admin
   client). Left as-is, the dependency bump in item 5 would start failing the
   build the moment `next dev`/`next build` enforces the removal.

Two items are explicitly *not* gaps, confirmed during the audit rather than
assumed: CSRF (Next Server Actions already enforce an Origin-header check by
framework default — this pass adds a verification step, not a fix) and RLS
(the "enabled, zero policies, service-role-gated in code" pattern is a
deliberate, already-reviewed architecture choice; the service-role key is
only ever imported in `src/lib/supabase/admin.ts`, confirmed by grep).

## Goals

- Close every gap above with the least invasive change that actually closes
  it — this is a hardening pass, not a rewrite.
- Preserve every existing architectural guarantee this touches, specifically
  the "uploads defer to Save, compensating-delete on row-write failure"
  pattern (CLAUDE.md, sub-project 7) and the idle-timeout / audit-log
  behavior in `middleware.ts`/`proxy.ts`.
- Leave the codebase able to answer, for each of the nine items, "closed, and
  here's the test that proves it" — not "closed, probably."

## Non-goals

- Resend / transactional email — separate, already-tracked work item
  (`docs/BACKEND_HANDOFF.md` §3A/§3B/§3E.6), unrelated to this pass beyond
  both being pre-launch blockers.
- A fully nonce-based, zero-`unsafe-inline` CSP — see item 4 below for why
  that's not realistic yet without touching Tailwind/Motion/react-easy-crop's
  injected stylesheet. This pass ships a real, scoped CSP, not the
  theoretical strictest one.
- Two-factor auth for admin accounts — the mock 2FA toggle was deliberately
  removed (`docs/BACKEND_HANDOFF.md`, 2026-07-16 changelog entry); reversing
  that is a separate product decision, not a hardening default.
- Network-layer DDoS protection (WAF, Vercel's own edge mitigations) — outside
  application code.
- Citizen accounts, SMS dispatch — already out of scope per the master spec
  §13.

## Approach

### 0. `middleware.ts` → `proxy.ts` rename

Rename `src/middleware.ts` to `src/proxy.ts`; rename the exported
`middleware` function to `proxy`. The `config.matcher` array is unchanged —
Proxy's matcher shape is identical to Middleware's, including the object
form with `missing`/`has` this file already uses. Drop `runtime: "nodejs"`
from the `config` export: Proxy defaults to the Node.js runtime now, so the
line is not just disallowed but redundant. The comment block explaining *why*
the service-role admin client is safe there stays — that reasoning didn't
change, only the mechanism that used to require an explicit opt-in.

Live references to the filename get updated in the same commit: CLAUDE.md's
idle-timeout bullet, `docs/BACKEND_HANDOFF.md`, and comments in
`src/lib/session-activity.ts`, `src/lib/auth.ts`, `src/lib/supabase/server.ts`,
and `src/app/api/admin/notifications/route.ts`. Historical records
(`docs/superpowers/plans/*`, `docs/superpowers/specs/*`, `.superpowers/sdd/*`)
are left alone, per this repo's own convention of not retro-editing dated
files.

No behavior change is expected. Verified by: the `middleware-to-proxy`
deprecation warning disappearing from `npm run build` output, plus a manual
smoke test of admin login, a permission-gated page load, and the idle-timeout
redirect (the three things that actually execute inside this file).

### 1. Dependency upgrade

Bump `next` to `16.2.12` — in-range for the existing `^16.0.0` in
`package.json`, no major-version jump. Run `npm audit fix` for the
transitive `postcss`/`sharp` findings. Re-run `npm audit` and confirm zero
high-severity results remain; if anything is left, it gets documented here
rather than silently accepted. Follow with a full `npm run build`,
`npm run typecheck`, `npm run lint`, `npm run test:unit`, and
`npm run test:e2e:public` pass, since this touches the framework itself, not
just app code.

### 2. Admin login rate limiting

Reuse the existing `checkRateLimit`/`requestIp` pattern — no new mechanism.
In `signIn`, before calling `signInWithPassword`, check two keys: `` `login:ip:${ip}` `` and `` `login:email:${normalizedEmail}` `` (email
lowercased/trimmed the same way Supabase itself normalizes it), so a
distributed attempt against one account and a single source hammering many
accounts are both caught. `LOGIN_LIMIT = 5`, `LOGIN_WINDOW_MS = 15 * 60 * 1000`
— tighter than the 8 public forms' hour-long windows (their existing pattern
is 3–10 submissions/hour), because credential-stuffing attempts arrive fast
and legitimate mistyped-password retries don't need an hour to recover from.
On limit, return the same generic `"Incorrect email or password."` copy the
action already uses for a real bad password — a distinct "too many attempts"
message would tell an attacker their guesses were arriving, not just being
rejected. Failed attempts still aren't audit-logged (existing, deliberate,
unchanged) — the limit is the defense, not the log.

### 3. Durable rate-limit store

Replace the in-memory `Map` in `src/lib/rate-limit.ts` with a Supabase-backed
one, keeping every call site's signature-shaped call the same in spirit —
`checkRateLimit(key, limit, windowMs)` — but now `async`, since it's a
database round-trip. New migration `0029_rate_limit_hits.sql`: a
`rate_limit_hits` table (`key text`, `hit_at timestamptz default now()`), RLS
enabled with no policies (the established pattern — service-role client
only). `checkRateLimit` counts rows for `key` newer than `now() - windowMs`;
if under `limit`, inserts a row and returns `true`, else returns `false`.
Cleanup mirrors the existing "opportunistic sweep" comment already in this
file rather than adding a `pg_cron` dependency: a small random chance
(~1%) on each call to delete rows older than 24 hours, so a long-lived
deployment doesn't grow the table unbounded, without needing a scheduled job.

Consequence: all 9 call sites (the 8 public forms plus the new login check)
need an `await` added — mechanical, but every one touches the same function
signature, so this is done as one pass across all 9 files in the same
commit as the migration, not spread across the plan.

### 4. Security response headers

Add a `headers()` export to `next.config.ts`, applied to `/:path*`:
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a scoped
`Content-Security-Policy`: `default-src 'self'`; `frame-ancestors 'none'`
(the CSP-level version of the `X-Frame-Options` header, redundant on purpose
for older browsers); `object-src 'none'`; `base-uri 'self'`; `img-src 'self'
data: https://lh3.googleusercontent.com https://<supabase-host>`;
`connect-src 'self' https://<supabase-host>` (the browser Supabase client
calls this directly); `script-src 'self' 'unsafe-inline'`; `style-src 'self'
'unsafe-inline'`. `<supabase-host>` is not a placeholder to fill in by hand —
`next.config.ts` already derives `supabaseHost` from
`NEXT_PUBLIC_SUPABASE_URL` for `images.remotePatterns`; the headers config
reuses that same computed value.

The two `'unsafe-inline'`s are a known, named compromise, not an oversight:
`react-easy-crop` injects its own `<style>` tag (CLAUDE.md's avatar-cropper
bullet already documents this), and a nonce-based strict CSP would need
Next's per-request nonce plumbing threaded through every inline style/script
path Tailwind's arbitrary values and Motion produce — a materially bigger
change than this pass's budget. This CSP still blocks the categories of
attack that matter most for an admin portal holding a service-role-gated
backend: framing (clickjacking), arbitrary `<object>`/plugin embeds, and
exfiltration to an attacker-controlled `connect-src`. Verified by loading
every distinct page template (public home, an article detail page, the admin
dashboard, a drawer editor, the avatar cropper) in dev with the browser
console open and confirming zero CSP violation errors before this ships.

### 5. Turnstile CAPTCHA

Added to all 8 anonymous public forms, alongside (not replacing) the rate
limiter — defense in depth, since Cloudflare Turnstile stops scripted
submission in a way an IP-based limiter can't (a distributed script defeats
the limiter; it doesn't defeat a challenge). New shared client component
`src/components/shared/turnstile-widget.tsx` wrapping Cloudflare's script,
and a server-side `src/lib/turnstile.ts` exporting
`verifyTurnstileToken(token, ip)`, called first in each of the 8 Server
Actions, before validation/rate-limiting — a failed challenge should be the
cheapest possible rejection. New env vars `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
(client) and `TURNSTILE_SECRET_KEY` (server), added to `.env.example`.

This item has an external dependency the same way Resend does elsewhere in
the backlog: it needs a Cloudflare account and a real site key before it can
ship to any real environment, not just be coded. The code path is built
regardless; going live on it is gated on that account existing. Missing-key
behavior is deliberately asymmetric: in development, an unset
`TURNSTILE_SECRET_KEY` skips verification with a console warning, so
`npm run dev` isn't blocked for a contributor without Cloudflare access;
`verifyTurnstileToken` throws instead of silently passing when
`NODE_ENV === "production"` and the key is missing, so a misconfigured
production deploy fails loudly rather than quietly running with no CAPTCHA.

### 6. Body-size-limit scoping

The transparency/legislative PDF upload is the only Server Action family
that needs more than the framework's 1MB default, and
`experimental.serverActions.bodySizeLimit` has no per-action granularity —
it's one global number. The fix already named in the docs (move PDF upload
off the Server Action body-size path entirely) is what this pass builds: a
new authenticated Route Handler, `POST /api/admin/uploads/document`, doing
its own multipart parse with its own size ceiling
(`MAX_DOC_FILE_BYTES`/`MAX_FILES_PER_RECORD`, unchanged from
`src/lib/storage.ts`) and its own `checkPermission("manage-transparency")`
call, returning the uploaded object path(s).

This changes *when* the network call happens, not the ordering guarantee:
today, file-select makes no network call and Save's Server Action uploads
+ writes the row + compensating-deletes on failure, all in one call. After
this change, clicking Save still fires both calls together (the picker
itself still makes no call on file-select) — first the Route Handler upload,
then the existing Save Server Action, now taking already-uploaded paths
instead of `File` objects for the PDF fields, and still compensating-deleting
those objects if the row write fails. "A storage object exists only if a row
references it" still holds by construction; only the transport for the
upload half moved. This is the most invasive item in the pass — it touches
`PdfUploader` and all three of `saveLegislative`/`saveTransparencyDocument`/
`saveTransparencyProject` (multi-file, up to 3 each) — and should be built
and tested last, with the optimistic-locking-on-`file_path`
behavior (CLAUDE.md, transparency-enhancements bullet) specifically
re-verified afterward since it's the part most likely to interact badly with
a two-call sequence.

Once this lands, `next.config.ts`'s `bodySizeLimit` drops back to the
framework default (the line is deleted, not lowered — no remaining Server
Action needs a non-default limit), closing item 2 from the Problem section.
The `proxyClientMaxBodySize`/matcher-exclusion question (item 3) is
re-evaluated at the same time: once PDFs no longer flow through a Server
Action at all, the matcher exclusion in `proxy.ts` may no longer be needed
for large-body handling — it stays only if something else still depends on
it (re-check against the file's own comment before removing).

### 7. Privacy policy + Terms pages

Two new public routes, `/privacy` and `/terms`. These fit the "effectively
static" tier the master spec already established for About-page content
(§3C item 6: "can stay in code") rather than the admin CMS — legal text
shouldn't be casually editable through a drawer the way a news article is.
Content lives in a typed `data.ts` in a new `src/features/legal/` module,
linked from the footer. The actual policy text is placeholder, explicitly
marked as such in the same way `CAPTAIN.message` already is (CLAUDE.md,
Known Gaps item 6) — real legal text has to come from the barangay/legal
counsel before launch, and inventing it here would be worse than leaving the
gap visible.

### 8. RLS + CSRF review

Not new code — a verification pass. RLS: query
`pg_policies`/`information_schema` (or the Supabase dashboard) against every
table and confirm the only policies anywhere are the documented
public-read ones on `storage.objects`; everything else stays
enabled-with-zero-policies. CSRF: confirm Next 16.2's Server Action
Origin-header enforcement actually rejects a forged `Origin` against a real
action ID (manual test, not assumed from documentation) — Server Actions'
built-in protection is what CLAUDE.md and the transparency-documents
changelog already lean on when explaining why the `proxy.ts` matcher
exclusion doesn't weaken auth; this pass verifies that assumption once
rather than continuing to assume it. Findings (pass or a named gap) get a
short paragraph appended to `docs/BACKEND_HANDOFF.md` §6, not a new doc.

### 9. Playwright security tests

New `tests/e2e/security.spec.ts`: (a) submitting one public form past its
`SUBMIT_LIMIT` returns the rate-limit error on the next attempt — one
endpoint proves the pattern, not all 9; (b) repeated bad-password attempts
against `/admin/login` trip the new login limiter; (c) a fetched response
carries the new security headers; (d) loading the public home page and an
authenticated admin page produces zero CSP-violation console errors. This
follows the existing project convention (`tests:e2e`, Playwright against the
real dev server, `public` project needs no login, `admin` project needs
`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`).

## Rollout / deploy order

Same discipline every migration in this project already follows — staging
first, confirmed, then production:

1. Rename to `proxy.ts` + dependency bump (items 0, 1) — no DB change, can
   ship and verify independently of everything else.
2. Apply migration `0029_rate_limit_hits.sql` on staging → swap
   `rate-limit.ts`'s implementation + add the login rate-limit call (items 2,
   3) → verify → apply `0029` to production → deploy.
3. Headers (item 4) — config-only, no migration, verify CSP against every
   page template in a deployed environment (not just dev) before calling it
   done, since CSP behavior can differ slightly between `next dev` and a
   production build.
4. Turnstile (item 5) — code ships regardless; going live needs the
   Cloudflare account + keys, tracked the same way the Resend blocker is
   tracked elsewhere.
5. Body-size-limit scoping (item 6) — last, deliberately, given it's the
   most invasive change and touches the upload/compensating-delete
   guarantee directly.
6. Privacy/terms pages (item 7) and the RLS/CSRF review (item 8) have no
   ordering dependency on anything else and can land whenever convenient.
7. Security Playwright tests (item 9) land alongside whichever item they
   cover, not as one final batch — the rate-limit test after item 2/3, the
   login-lockout test after item 2, the headers/CSP test after item 4.
