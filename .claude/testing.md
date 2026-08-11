# Testing

```bash
npm run test:unit   # Vitest, pure functions only (tests/unit)
npm run test:e2e    # Playwright against the dev server (tests/e2e)
```

## Two frameworks with different jobs

- **Vitest covers pure functions only** — no jsdom, no React renderer, so a broken test
  environment cannot make a broken page look green. **A module under test must not
  transitively import a Supabase client**; that is why `demandLabel` lives in its own
  `demand.ts` apart from `queries.ts`, and why `login-challenge.ts` lives outside the
  `"use server"` `actions/auth.ts` Vitest cannot import.
- **Playwright drives the real dev server through system Chrome.** The `public` project
  needs no session; the `admin` project reuses a storage state from `tests/e2e/auth.setup.ts`
  and **skips unless `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` are set in `.env.local`**.
- **Component-level tests are deliberately not a thing here** — behaviour is verified in the
  browser, via `.claude/skills/verify/SKILL.md` for one-off checks.

## A guard that has never been seen to fail is not a guard

This repo's own rule, and the reason several tests exist in the shape they do. When you add
a test for a guard, **verify it fails with the guard removed** — forcing `canReply` false
must kill the reply form, dropping the `replied_at` write must kill the "New reply" pill,
inducing a CSP violation must fail the CSP test. A test that passes both with and without
the behaviour it claims to protect is proving nothing, which is exactly how `site.spec.ts`'s
CSP test sat green for weeks while never reaching its assertion.

## The suites

`tests/e2e/public/`: `site.spec.ts`, `turnstile.spec.ts`, `feedback.spec.ts`,
`news.spec.ts`, `notices.spec.ts`, `events.spec.ts`, `appointment-form.spec.ts`,
`assistance-form.spec.ts`, `assistance-guidance.spec.ts` (asserts the per-category "What to
prepare" card is never rendered empty, across every category the live picker offers — an
invariant rather than a named category, since a SuperAdmin can fill any category's guidance
in at any time through `/admin/services`), `apply-form.spec.ts` (files a document application
with a supporting PDF attached, end to end through `ticket-media` and `ticket_updates`),
`services-directory.spec.ts`, `forgot-password.spec.ts` (needs no admin credentials — both
reset pages are public; the full emailed-link round trip isn't automatable without a live
inbox). **Complaints deliberately has no submitting spec** — see the rate-limit table below.

`tests/e2e/admin/`: `login.spec.ts`, `users.spec.ts`, `global-search.spec.ts`,
`inbox-tabs.spec.ts`, `notifications.spec.ts`, `ticket-updates.spec.ts` (three tests: the
internal-note privacy boundary, an `awaiting-info` ticket must still be closeable, and the
resident reply round trip — the last because `submitTicketReply` is the most exposed surface
in the app: public, unauthenticated, accepts uploads).

## Some e2e suites are not idempotent within their rate-limit window

Since the limiter became durable (`0029`), **a failure shortly after a recent run is a
collision first, a regression second** — except where noted.

| Suite | Spends per run | Reruns before it collides |
|---|---|---|
| `admin/login.spec.ts` | 6 hits on `login:email:<test-admin>` (`LOGIN_LIMIT` = 5 / 5 min) | 1 per 5 min — and it fails the **whole** `admin` project, since `playwright.config.ts` runs `setup` before every admin test and `auth.setup.ts` is blocked by the previous run's hits |
| `public/feedback.spec.ts` | all 3 of `SUBMIT_LIMIT` on `feedback:unknown` | 1 per hour |
| `admin/ticket-updates.spec.ts` | 2 `track:*` lookups (`LOOKUP_LIMIT` = 10 / 10 min) + 1 `reply:ip:*` (`REPLY_LIMIT` = 5 / **hour**, the binding one). Its `reply:ticket:*` budget is keyed on a ticket the test just created, so it can never collide | ~5 per hour |
| `public/assistance-form.spec.ts` | 1 `assistance:<ip>` — but it forges a fresh random IP per run, so **no shared budget exists to collide with**. Also spends 1 `assistance:contact:<digits>`, same reasoning: the contact-number field is filled with a per-run-unique, `Date.now()`-suffixed value | unlimited; **read a failure here as real** |
| `public/apply-form.spec.ts` | 1 `apply:<ip>` against `SUBMIT_LIMIT` = 10/hour (`src/features/services/actions.ts`) — same forged-fresh-IP-per-run pattern as `assistance-form.spec.ts`, copied from it, so again **no shared budget exists to collide with** | unlimited; **read a failure here as real** |

`public/services-directory.spec.ts` and `public/assistance-guidance.spec.ts` submit nothing,
so they spend no budget either.

**Complaints has no submitting e2e spec, on purpose.** The shared picker and upload sequence
(`TicketFileField` / `recordIntakeWithAttachments` in `src/lib/ticket-attachments.ts`) are
already exercised twice, by `assistance-form.spec.ts` and `apply-form.spec.ts`; a third
submitting spec would cover the identical shared machinery a second time over, not add
coverage of anything complaint-specific. (`submitComplaint`'s `SUBMIT_LIMIT` is 5/hour, the
same as `assistance`'s — the tightest of the three attachment-accepting public forms — but
that is not the reason to skip it: a complaint spec could copy `assistance-form.spec.ts`'s
forge-a-fresh-IP-per-run pattern just as easily, since `complaint:${ip}` is the only
dimension `submitComplaint` rate-limits on, with no second contact-number budget the way
assistance has.) One real, honest gap this leaves: `TicketFileField`'s `label` prop is used
only by `ComplaintForm` (`"Photos or documents (optional)"`), and both existing specs select
the input by the shared default label (`"Supporting documents (optional)"`), so that custom
label has no automated coverage either way — low-risk, not a defect.

**The three walk-in encoding flows (application/complaint/assistance) have no e2e coverage
at all**, on the same rate-limit reasoning as the `admin/login.spec.ts` row above: every spec
under `tests/e2e/admin/` depends on `auth.setup.ts`, which spends a `login:email:*` hit, and
exhausting that budget fails the **entire** `admin` project, not just its own test. Three more
admin submitting specs would be an ongoing collision-risk tax on the whole admin suite, not a
cost paid once. Verified once by hand instead: filing CMP-2026-00069 and AST-2026-00047 with
real attachments and confirming they render in the admin timeline via real signed Storage
URLs.

## Turnstile in tests

- **`login.spec.ts` needs Turnstile keys that solve headlessly** — attempts 2-6 of its
  five-failure test are challenged, as is its correct-password attempt. Use Cloudflare's
  always-pass test keys (`1x00000000000000000000AA` /
  `1x0000000000000000000000000000000AA`, documented in `.env.example`); the real keys cannot
  be registered for `localhost` and will not solve locally at all. **The site key is inlined
  at build time, so switching key sets needs the dev server restarted**, not just a saved
  file.
- **Forge `x-forwarded-for` with a `page.route()` interception scoped to the app's own
  origin — never `test.use({ extraHTTPHeaders })`.** The latter also sends the forged header
  to `challenges.cloudflare.com`, whose edge then refuses to serve the widget script.
  `login.spec.ts` established the pattern to pin each run to its own `login:ip:*` bucket;
  `assistance-form.spec.ts` copies it. **Not `cf-connecting-ip`** — `requestIp()` ignores
  that header unless `TRUSTED_IP_HEADER` names it. Forging XFF works locally (no proxy to
  overwrite it) and is inert against production (Vercel overwrites it). The **email** key
  still collides by design.
- `auth.setup.ts` carries a token wait plus **one retry**, because the page cannot see the
  email key at render time: when the test account's own address is the flagged one, its first
  attempt renders no widget, sends no token, and is turned away.
- **`waitForLoadState("networkidle")` never resolves on a page carrying a widget** — it
  holds a `blob:` request open for the page's lifetime. This silently killed `site.spec.ts`'s
  CSP test for weeks: it timed out at 30s on the wait and never reached its assertion. Wait
  for `window.turnstile` to be defined instead.
- **The home page now mounts no widget at all** (the footer `NewsletterForm` was removed
  2026-08-05), so `networkidle` is usable there again — but that also means a
  Cloudflare-script CSP assertion on the home page proves nothing. The check therefore lives
  in its own test against `/contact` (verified to clear in ~3s, i.e. actually resolving, not
  falling through its 15s catch). `turnstile.spec.ts`'s rejected-site-key test counts **1**
  banner on `/contact`, down from 2.

## Fixtures that look their own row up twice

**Copy the unique-surname pattern, not the fixed one.** The admin queue's newest-first sort keys on
`submittedAt`, a **date**, so every row a previous run left behind ties with the new one —
and `expect(row).toBeVisible()` resolves instantly against the *stale* pre-insert list when a
matching older row exists. That had `ticket-updates.spec.ts` silently drive the previous
run's ticket while asserting against the current run's. Its reply test uses a
`Date.now()`-suffixed surname; the two older tests keep fixed ones (`Testa Reyes`,
`Testb Bautista`) only because they never re-find their row after navigating away.

## Turnstile token waits are deterministic

`AssistanceForm` and `ApplyForm` each render a hidden `input[name="turnstileToken"]`
mirroring their React token state. Neither server action reads it — both take the token
as an argument — it exists so `assistance-form.spec.ts` and `apply-form.spec.ts` can poll
a DOM signal instead of sleeping a fixed 3s. **Do not delete it as dead markup**, and if
you add a submitting spec for another public form, give that form the same input rather
than reintroducing a sleep.

## What has unit coverage today

`tests/unit/` covers the pure helpers: `admin-nav`, `fuzzy`, `motion` (animation budgets),
`office-days`, `resident-name`, `login-challenge`, `session-activity`, `storage`,
`public-forms`, `pagination`, `form-draft`, `initials`, `build-full-name`,
`legislative-number`, `service-flow`, `appointment-demand`, `search-modules` vs
`notifications` agreement, `crop-image`, `downscale-image` (the pure `scaleToFit` math —
canvas/`document` work stays inside function bodies for exactly this reason, per its own file
header), and the email templates/text helpers.

**Two classes of bug this suite structurally cannot catch**, so verify them another way:

1. **The JS and SQL fuzzy-search halves drifting apart** — Vitest covers only the JS half
   (`.claude/search.md`).
2. **A nullable DB column feeding a non-nullable TS field** — Supabase rows are untyped, so
   `npm run typecheck` misses it too (`.claude/database.md`).
