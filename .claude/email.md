# Transactional email (Resend)

**Resident-facing only — no email ever goes to staff.** Specs:
`2026-07-30-resend-email-integration-design.md` (foundation),
`2026-08-06-superadmin-password-and-staff-email-removal-design.md` (the reversal that
deleted every staff-directed send).

## `sendEmail()` is fail-open by construction in every environment

`src/lib/email.ts` wraps the `resend` SDK and **never throws to its caller**, because every
trigger fires after its own DB write already committed and an email failure must never turn
into a failed resident submission.

- A missing `RESEND_API_KEY`/`RESEND_FROM_EMAIL` skips sending: development warns once via
  `console.warn`, production `console.error`s on every call rather than throwing. **A
  deliberate divergence from Turnstile's dev-skip/prod-throw** — Turnstile IS the anti-bot
  layer, email is best-effort with nothing depending on it.
- It races the Resend call against a 5s `SEND_TIMEOUT_MS` via `Promise.race` (not an
  SDK-version-dependent `AbortSignal`), so a stalled connection resolves `{ ok: false }`
  instead of hanging the submission.
- Every send is **`await`ed** (never fire-and-forget), checks the resident's `email` column
  for null/`""` first, and **never inspects `sendEmail()`'s return value**.

## Templates

`react-email` JSX under `src/emails/`, each composed inside the shared `<EmailLayout>`
(seal, amber header, footer address/phone) — the email equivalent of `AdminShell`.

- `EMAIL_SITE_URL` (`src/emails/site-url.ts`, from `NEXT_PUBLIC_SITE_URL`; `console.error`s
  in production when unset and falls back to `localhost:3000`) exists because email clients
  can't resolve relative paths.
- Every resident template composes `<TicketNotice>` (`src/emails/shared/TicketNotice.tsx`):
  the Track button, the ticket-number treatment, optional remarks/detail lines and an
  optional `requirements[]` list live there once instead of in 12 near-identical files.
- `src/emails/shared/text.ts` holds `periodLabel()` — reusing `track/actions.ts`'s exact
  "Morning (8:00 AM – 12:00 NN)" copy rather than a second wording of the same fact — and
  `excerpt()`.

## What sends

- The four ticket submission receipts and their four walk-in siblings.
- `InquiryAcknowledgedEmail`.
- The eight **terminal**-decision notices: approved/rejected, confirmed/declined,
  resolved/dismissed, granted/declined. The non-terminal `released`/`completed`/
  `under-review` transitions are **deliberately excluded**.
- `TicketUpdateEmail`, `PasswordResetEmail`.

## Content restraint

**A complaint's `narrative` and `respondent` are never echoed into an email** — only the
incident date and location. Same "status only" restraint `TicketLookupResult` documents for
`/track`, applied on principle even though the mail goes to the reporter's own inbox.

A rejection email can arrive with **no Reason block** (`remarks` is optional and
`TicketNotice` skips a falsy value). **No fallback copy was invented to hide that; don't add
one.**

**An approval email lists the service's real requirements**, not a generic line:
`reviewApplication` selects `services (title, requirements)` — not `title` alone — and
passes the row's `requirements` into `TicketNotice`'s optional `requirements: string[]` (+
`requirementsLabel`, default `"Bring these when you claim it"`), the email equivalent of
`ApplyForm`'s requirements card. **Drop `requirements` from that `.select()` and the list
silently disappears from every approval email.** `closingNote`'s "bring a valid ID" stays
separate on purpose — it is a blanket rule, not a per-service requirement.

## Stamping `ticket_updates.notified_at` is the caller's job

`recordTicketUpdate` never writes it. **Every caller that emails the resident must call
`markTicketUpdateNotified(entryId)` itself, immediately after its own `sendEmail`, inside
the same `if (email)` guard, and guard on the id (`if (entryId)`).** Three deliberate
non-callers, all because no resident email is attempted: `releaseApplication`,
`completeAppointment`, `submitTicketReply`'s own resident-reply entry.

Full rationale — including why a missing stamp is a *human* failure rather than a duplicate
send — is on the column in `.claude/database.md`.

## Nobody is emailed when work arrives, and that is deliberate

Staff learn of a new inquiry, new feedback or a resident reply **only** from the in-portal
bell and the sidebar count badges — the 60-second poll, now the single channel rather than a
redundant one, so a regression in it is a total loss of signal rather than a degraded one.

**Don't "restore" a staff notification email as a fix for a missed queue; it was removed on
request.** `src/lib/notifications.ts` is now pure functions over a static registry **with no
database access at all** (`staffEmailsFor()`/`staffQualifies()` are gone) — worth knowing
before adding anything to it.

Account creation likewise sends **no email whatsoever** (`email_confirm: true` suppresses
Supabase's own verification mail) — see `.claude/authentication.md`.
