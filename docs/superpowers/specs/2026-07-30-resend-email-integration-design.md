# Resend email integration — design

**Status:** approved, ready for implementation planning.
**Closes:** `docs/BACKEND_HANDOFF.md` §2D — "plan 2D (Resend)," referenced but never
designed until now. Every ticketing/contact/feedback flow currently ends in an
on-screen receipt only; nothing emails anyone.

## Context

Justine has a Resend account; the sending domain is not verified yet, so the
first implementation will run against Resend's onboarding sender until the
domain swap happens (env var change only, no code change).

## Scope

All four groups of email triggers, in one coherent architecture, built as
three staged implementation plans (see Rollout below):

1. Contact inquiries (acknowledgment + staff notify)
2. Feedback (staff notify only — feedback is anonymous, no resident email)
3. Ticketing submission receipts, all 4 flows + their walk-in variants
4. Ticketing status-change notices, all 4 flows, "final outcome" triggers only
5. Delivery monitoring (`email_log` table + Resend webhook) — separate plan

## Architecture & config

- New dependencies: `resend` (SDK) and `@react-email/components` (templates).
- `src/lib/email.ts` — not a `"use server"` module, same reasoning as
  `src/lib/media.ts` (it's a plain helper library, not a server action
  surface). Exports `sendEmail({ to, replyTo?, subject, template })`:
  - Initializes the Resend client from `RESEND_API_KEY`.
  - Calls `resend.emails.send({ from: RESEND_FROM_EMAIL, to, replyTo, subject, react: template })`.
  - Never throws to its caller. Internally: `try { await resend.emails.send(...) } catch (err) { console.error(...); return { error: true } }`.
- New env vars in `.env.example`: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (e.g.
  `Barangay San Fernando <notifications@yourdomain>`).
- Dev/prod asymmetry in how a missing `RESEND_API_KEY` is *logged*, but never
  in whether it blocks the caller — `sendEmail` never throws, in dev or prod,
  per the fail-open decision below. In development it skips sending with a
  one-time `console.warn`. In production it still skips sending (never
  throws), but logs via `console.error` on every call, not just once — a
  misconfigured deploy should be loud in the logs, but "loud" here means
  visible to whoever checks logs, not a thrown exception that would turn a
  missing env var into a failed resident submission. This is a deliberate
  divergence from Turnstile's dev-skip/prod-throw asymmetry: Turnstile IS the
  anti-bot layer, so failing open there defeats its purpose; email is a
  best-effort notification layered on top of an already-committed DB write,
  so failing open there is safe by construction.
- No new queue, no outbox table for sending itself (rejected — see Approaches
  below). `email_log` (Section: Monitoring) is a delivery-status record, not a
  send queue; sends still go out synchronously, inline, in the triggering
  Server Action.

## Approaches considered

- **A — React Email components + shared mailer lib (chosen).** Templates as
  `@react-email/components` JSX sharing one `<EmailLayout>`. New dependency,
  but with ~14 templates across this scope a real component layer earns its
  keep, and Resend's SDK renders React templates natively.
- **B — Plain HTML string templates.** No new dependency, template-literal
  functions with inline CSS. Rejected: 14 near-identical hand-written HTML
  strings are repetitive and harder to keep visually consistent than
  composed JSX.
- **C — Outbox table + background processor.** Writes land in a queue table;
  a cron/route handler drains it. Most resilient to serverless timeouts and
  retries automatically. Rejected as disproportionate to this site's email
  volume (a barangay-scale site sending a handful of emails a day) — the
  fail-open + awaited-with-catch pattern already covers the real risk (a
  Resend outage) without a queue's added moving parts.

## Templates & layout

- `src/emails/` holds one `<EmailLayout>` component — barangay seal, a
  `brand-amber` accent bar, a web-safe font fallback (email clients don't
  reliably load custom fonts), and a footer with the barangay name/address.
  Every template wraps in it, the email equivalent of `AdminShell` being the
  one layout for admin pages.
- Individual templates are small JSX components composed inside that layout,
  one file per template under `src/emails/`, named after the event they
  represent (e.g. `InquiryAcknowledgedEmail`, `InquiryStaffNotifyEmail`,
  `FeedbackStaffNotifyEmail`, `ApplicationSubmittedEmail`,
  `ApplicationApprovedEmail`, `ApplicationRejectedEmail`, ...).
- Templates take plain typed props (ticket number, resident name, remarks, a
  link back to `/track`) — no DB or Supabase client access inside a
  template; they stay pure.
- No new preview tooling added for this (no Storybook, no
  `@react-email/preview` dev server) — previewing during implementation is a
  scratch page import, not new infrastructure.

## Trigger points — contact & feedback

- **`submitInquiry`** (`src/features/contact/actions.ts`): after the insert
  succeeds, send two emails —
  - `InquiryAcknowledgedEmail` to the resident (their required `email`
    field), carrying the "24-48 hours" copy already promised on `/contact`.
  - `InquiryStaffNotifyEmail` to every staff member `notifications.ts` says
    holds `handle-inquiries`, linking to `/admin/inquiries?review=<id>`.
- **`submitFeedback`** (`src/features/feedback/actions.ts`): staff-only
  `FeedbackStaffNotifyEmail` to `handle-inquiries` holders (the same
  permission `NOTIFICATION_QUEUES.feedback` already uses), linking to
  `/admin/inquiries?tab=feedback&review=<id>`. No resident-facing email —
  feedback is anonymous by design (no name/email/IP collected), nothing to
  send to.
- Both call sites use the staff-lookup helper (see below) and the same
  fail-open `sendEmail` — a Resend failure never blocks the resident's
  inquiry from saving or feedback from recording.

## Trigger points — ticketing submission receipts

- `submitApplication`, `submitAppointment`, `submitComplaint`,
  `submitAssistance` (each in `src/features/<flow>/actions.ts`): after the
  row inserts and the ticket number is generated, send one
  `<Flow>SubmittedEmail` to the resident **only if they provided an email**
  — the field is optional/nullable on all four; no email means silently
  skip, not an error.
- Each receipt template: ticket number, what was submitted (purpose /
  category / narrative excerpt as applicable), a link to `/track` — a
  durable copy of the on-screen receipt, not new content.
- Same pattern for the four walk-in variants (`createWalkInApplication` and
  its three siblings in `src/features/admin/actions/*.ts`) — a walk-in
  resident who gave staff an email gets the same receipt template, since
  these insert into the same tables in the same shape.
- No staff notification on submission — staff already gets a badge/bell
  signal via the existing `notifications.ts` system; an email here would
  duplicate a signal that's already pushed inside the portal.

## Trigger points — ticketing status-change

"Final outcome" is interpreted as **"the resident needs to know, and isn't
already standing at the counter to be told in person"** — not literally the
last status column value, because two of the four flows have a
non-terminal status that still carries information the resident can only
get by email:

| Flow | Notify on | Skip |
|---|---|---|
| Applications (`reviewApplication` → `releaseApplication`) | `rejected`, `approved` (ready to claim) | `released` (resident is physically at the counter when this is set) |
| Appointments (`reviewAppointment` → `completeAppointment`) | `declined`, `confirmed` (carries the actual date/time, which may differ from what was requested) | `completed` (resident was just there) |
| Complaints (`reviewComplaint` → `closeComplaint`) | `dismissed` (from either action), `resolved` | `under-review` (internal status move, nothing actionable yet) |
| Assistance (`reviewAssistance` → `decideAssistance`) | `declined` (from either action), `granted` | `under-review` (same reasoning) |

Each of these 8 admin actions sends its email after the DB update commits,
to the resident's stored email if present (same nullable handling as
receipts). No staff-facing email on status change — status changes are
staff-initiated, staff already knows.

## Staff recipient resolution

- New helper `staffEmailsFor(permission: Permission): Promise<string[]>` in
  `src/lib/notifications.ts` (extends the module that already owns the
  permission-per-queue mapping, rather than duplicating it in `email.ts`).
- Query via the service-role client:
  `select email from profiles where is_active and not is_archived and (is_superadmin or permissions @> ARRAY[permission])`.
- Reuses the exact `permission` each `NOTIFICATION_QUEUES` entry already
  declares — inquiries/feedback both resolve to `handle-inquiries`,
  applications to `process-applications`, etc. No new permission model.
- An empty result (no staff currently hold that permission) means skip
  sending, not an error — same "nothing to do" shape as a resident with no
  email on file.
- `sendEmail` accepts `to: string[]` directly, so a staff notification with
  multiple recipients is still one Resend API call.

## Error handling & fail-open

- Every call site does `await sendEmail(...)`, never fire-and-forget
  (`void sendEmail(...)`). Fire-and-forget risks the serverless function
  being torn down mid-request before the network call finishes; awaiting
  with an internal try/catch gets the same "never blocks the response"
  behavior without that risk.
- The DB write that triggers the email is always committed before
  `sendEmail` runs, so there is nothing to roll back on an email failure —
  callers ignore `sendEmail`'s return value everywhere in this scope.
- Mirrors two existing patterns in this codebase: the rate limiter's
  fail-open comment (`src/lib/rate-limit.ts`) and Turnstile's dev-skip — a
  missing config or provider outage degrades gracefully, it does not
  cascade into a failed resident-facing action.
- No retry logic beyond what's below (monitoring, not retrying) — consistent
  with rejecting Approach C.

## Monitoring — `email_log` table + webhook

Investigated reusing `audit_log` for this and rejected it: `audit_log` is
purpose-built for human staff actions (`actor_name` is `NOT NULL`, its
`action_type` enum has no value that honestly fits a delivery/bounce event,
and its whole design is an append-only *human* action trail — see its
migration `0014_audit_log_v2.sql` comments). Forcing webhook events into it
would mean widening `recordActivity`'s actor type to allow a synthetic/null
actor and adding new enum values via migration, fighting the table's actual
purpose rather than fitting it.

Instead, a dedicated table:

- New migration adds `email_log`: `id`, `resend_id`, `to_emails text[]`,
  `subject`, `entity_type`, `entity_id`, `status` (enum:
  `'sent' | 'delivered' | 'bounced' | 'complained' | 'failed'`),
  `created_at`, `updated_at`. RLS enabled, zero policies — same pattern as
  every other table in this schema.
- `sendEmail` inserts a row immediately after a successful Resend API call
  (status `'sent'`, capturing the `resend_id` Resend returns). Still
  fail-open: if this insert itself fails, log and continue — it must never
  block the caller that triggered the email.
- New `POST /api/admin/webhooks/resend` Route Handler: verifies Resend's
  Svix webhook signature against `RESEND_WEBHOOK_SECRET`, reads the event
  type + Resend email id from the payload, updates the matching
  `email_log` row's `status`. Public endpoint (Resend calls it, no admin
  session) — signature verification is the entire gate, the same posture
  `verifyTurnstileToken` has for its own external-service call.
- No admin UI for `email_log` in this scope — it exists to be queried
  directly if a delivery problem is reported. A read-only panel is a
  plausible future addition, not part of this design.

## Testing

- **Vitest**: the status→template mapping logic (e.g.
  `templateForApplicationStatus("approved")`) as a pure function, and any
  part of `staffEmailsFor` that can be tested without a live Supabase call.
- **Playwright**: no changes expected to existing suites — `sendEmail` fails
  open, so a missing/dev-mode `RESEND_API_KEY` never breaks a form
  submission test. No new e2e suite for email content itself (nothing to
  assert against without a real inbox); manual verification via the
  `verify` skill once a real `RESEND_API_KEY` is set in `.env.local`.

## Rollout — staged plans

Not one large PR. Three plans, in order, matching the shape already used
for security-hardening (foundation → turnstile → body-size) and the media
bucket split (foundation → wiring):

1. **Plan 1 — Foundation.** `src/lib/email.ts`, the two new dependencies,
   `<EmailLayout>`, env vars, and the smallest real trigger (contact
   inquiries) — already-required email, proves the whole pipeline
   end to end before the rest is built on top of it.
2. **Plan 2 — Remaining triggers.** Feedback staff alert, all 4 submission
   receipts + their 4 walk-in variants, all 8 status-change notices,
   `staffEmailsFor`.
3. **Plan 3 — Monitoring.** `email_log` migration + the Resend webhook
   Route Handler. Applies this project's existing migration discipline —
   staging first, confirmed, then production — for this plan's migration
   specifically.

## Out of scope

- SMS (Semaphore or otherwise) — separate decision, not bundled here.
- Password-reset / invite-link email for admin accounts — no such flow
  exists yet (`createTeamUser` sets a plaintext password directly); adding
  email there means designing a new flow, not wiring an existing trigger
  point, and was explicitly excluded from this scope during brainstorming.
- Alert-subscriber broadcast (`alert_subscribers` is keyed on mobile number,
  not email) — unrelated to Resend.
- Any admin UI surface for `email_log` beyond the table itself.
