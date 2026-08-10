# Hardening backlog

Opened 2026-08-10, immediately after `services-request-flows` merged to `main`
(merge commit `adbdac0`, 27 commits, migration `0035` already applied to staging
**and** production).

This file exists because the SDD ledger that produced most of these findings
(`.superpowers/sdd/2026-08-10-services-request-flows/`) is git-ignored and never
reaches GitHub. Everything below was found during that branch's per-task and
whole-branch reviews and deliberately **deferred** — none of it blocked the
merge. Delete an entry when it ships; don't let the file rot into a wish list.

The next planned session is a hardening pass over section A. Section B is
ordinary polish and can be picked off in any order.

---

## A. Security

**A1 is the one to scope first** — it is the widest in blast radius and it
changes what A2–A4 are worth.

### A1. `requestIp()` trusts `cf-connecting-ip` unconditionally

*Pre-existing (2026-07-29), not introduced by the services branch. Already noted
in CLAUDE.md's adaptive-login-challenge bullet as an open follow-up.*

`requestIp()` prefers the `cf-connecting-ip` header whenever it is present.
Nothing in the code, the config, or `.env.example` asserts that production
actually sits behind Cloudflare, and there is no Cloudflare hop in the path a
direct request takes. `tests/e2e/admin/login.spec.ts` and
`tests/e2e/public/assistance-form.spec.ts` both forge that header successfully
from a bare Playwright client — direct proof any caller can.

Every IP-keyed rate limit on the site derives from this one helper: all 8 public
forms, admin login's `login:ip:*`, the reply and lookup budgets, and
`assistance:<ip>`. It is also the sole input to `/admin/login`'s
`initialChallengeRequired`, so rotating the header buys one unchallenged guess
per account in a spraying attack.

Still bounded — the email-keyed limiter caps per-account brute force at five —
so this is degradation, not a hole. But it undermines the controls A2–A4 would
otherwise lean on, which is why it goes first.

**Fix shape:** gate the preference behind an explicit deployment assertion (an
env flag, or validating the peer against Cloudflare's published ranges), and
document which topology the app is deployed behind.

### A2. Upload MIME types are browser-supplied and never content-verified

Applies to the assistance filing path (new) **and** the resident-reply path
(pre-existing, 2026-08-02). Scope any fix to both — they share
`uploadTicketAttachment` and the `ticket-media` bucket.

Currently bounded by: the bucket is private, `contentType` is set from the
declared type, HTML/SVG are not in the allow-list, and the stored extension is
derived from the MIME rather than the filename. Residual risk is a malformed
PDF or image aimed at a staff viewer's parser.

**Fix shape:** magic-byte sniffing on the first bytes of each upload, checked
against the declared type. This is the thorough answer and is its own change.

### A3. No bucket-level `file_size_limit` / `allowed_mime_types`

The 3 files × 2 MB cap is enforced only in app code (`MAX_TICKET_FILES` /
`MAX_TICKET_FILE_BYTES` in `src/lib/storage.ts`). Supabase Storage can enforce
both at the bucket level. Check `ticket-media` and `feedback-media`.

Cheapest real win here: a proportionate second layer that costs nothing and
needs no application change.

### A4. No malware scanning

On files that reach staff machines. Listed for completeness — likely
out of proportion for a barangay deployment, but it should be a decision on
record rather than an omission.

### A5. Assistance rate limiting is IP-only

`submitAssistance` keys on `assistance:<ip>` alone — no email or ticket
dimension, unlike `login:email:*` or `reply:ticket:*`. 5 per hour, so
distributed abuse is not bounded per person. Each submission is capped at ~6 MB.
Depends on A1 to mean anything.

---

## B. Functional follow-ups

From the same reviews. Ordered by leverage, not severity.

1. **Give `AssistanceForm` a hidden `turnstileToken` input** (the shape
   `LoginForm` already uses). `tests/e2e/public/assistance-form.spec.ts`
   currently sleeps a fixed `waitForTimeout(3000)` before submitting because the
   token lives in plain `useState` with no DOM-observable ready signal. A hidden
   input makes the wait deterministic — and the pattern generalises to the other
   eight public forms. **Highest leverage of the six.**

2. **Weekend default date.** `EMPTY.preferredDate = manilaToday()`, so on a
   Saturday or Sunday `/appointments/new` pre-fills a date its own
   `isClosedDay` refine then rejects. Fix: a `nextOpenDay()` beside `isClosedDay`
   in `src/lib/office-days.ts`.

3. **Timeline attribution.** Resident-supplied attachments hang on the intake
   entry, which is `authorKind: "system"`, so the admin drawer attributes them to
   "Barangay staff". The resident's own `/track` view reads correctly. Touches
   all four ticket flows.

4. **`applyPreset` does not focus the textarea.** Design §5.3 asked for it; it
   was silently dropped during implementation.

5. **The empty-category guidance-card e2e case never shipped** — the 5th
   Playwright bullet from design §7. Verified manually only. Submits nothing, so
   it costs no rate-limit budget to add.

6. **Three small ones:** `fileError` does not disable submit (a resident who
   ignores the red text files a ticket with no attachments); a missing
   `label`/`htmlFor` pair in `assistance-categories-panel.tsx`; and a clarifying
   comment on `services-directory.spec.ts`'s collapsed-accordion assertion.

---

## Rate-limit budgets to respect while testing

Re-running e2e suites is not free. See CLAUDE.md's Commands section for the full
picture; the short version:

- `assistance-form.spec.ts` — 1 hit on `assistance:<ip>`, `SUBMIT_LIMIT` = 5/hour.
  Forges a fresh IP per run, so it does not collide with itself. **A failure here
  is a real failure first, not a collision.**
- `login.spec.ts` — spends 6 hits on `login:email:<test-admin>` against a limit
  of 5 per 5 min. Still collides by design; a second run inside the window fails.
- `ticket-updates.spec.ts` — 1 hit on `reply:ip:*`, limit 5/hour. ~5 runs an hour.
- `feedback.spec.ts` — all 3 of `SUBMIT_LIMIT` on `feedback:unknown` per run.
