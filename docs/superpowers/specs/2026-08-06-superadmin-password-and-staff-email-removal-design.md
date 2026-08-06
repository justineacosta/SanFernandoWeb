# SuperAdmin-set passwords and staff-email removal — design

**Status:** approved, ready for implementation planning.
**Reverses:** the invite half of
`2026-08-01-admin-account-invite-design.md`, and the staff-notification half
of `2026-07-30-resend-email-integration-design.md` (Plan 1's inquiry staff
notify) and its Plan 2 follow-up (feedback staff notify, resident-reply staff
notify).

Both changes were requested directly by the project owner on 2026-08-06. This
document records what is being undone and why the reversal is safe, because
each piece being removed shipped with a written rationale that a future reader
would otherwise find still standing.

## Context

Two independent asks, bundled because both are subtractive and both touch the
email layer:

1. **Account creation.** Since 2026-08-01, `createTeamUser` creates the Supabase
   Auth user with an unguessable `crypto.randomUUID()` password and emails a
   "set your password" link, reusing the forgot-password flow's
   `generateLink({type: "recovery"})` → `/admin/reset-password?token_hash=…` →
   `verifyOtp` mechanism. The owner wants the SuperAdmin to type the password
   directly again, and the invite email gone.

2. **Staff notification emails.** Three sends notify staff that resident work
   arrived. The owner wants them gone. Every **resident-facing** email stays.

## Scope

### A. Emails removed

Four sends and their four templates:

| # | Template | Call site | Recipients | Subject |
|---|---|---|---|---|
| 1 | `InquiryStaffNotifyEmail` | `submitInquiry`, `src/features/contact/actions.ts` | every `handle-inquiries` holder | `New inquiry: <subject>` |
| 2 | `FeedbackStaffNotifyEmail` | `submitFeedback`, `src/features/feedback/actions.ts` | every `handle-inquiries` holder | `New feedback: <subject>` |
| 3 | `TicketReplyStaffNotifyEmail` | `submitTicketReply`, `src/features/track/actions.ts` | that flow's permission holders, via `REPLY_KINDS[kind].permission` | `Resident reply — <ticket_no>` |
| 4 | `AccountInviteEmail` | `sendAccountInvite`, `src/features/admin/actions/users.ts` | the new staff member | `Welcome to the Barangay San Fernando admin portal` |

Knock-on: `staffEmailsFor()` (`src/lib/notifications.ts`) loses every caller and
is deleted, along with its coverage in `tests/unit/notifications.test.ts`. The
`NOTIFICATION_QUEUES` registry itself **stays** — it drives the in-portal bell,
the sidebar count badges, and the `/api/admin/notifications` poll, none of which
this change touches.

`submitInquiry`'s `Promise.all` collapses back to a single `await sendEmail(...)`
for the resident acknowledgment, since the staff-recipient lookup it was
parallelised against is gone. The `replyTo: parsed.data.email` that Plan 1's
final review added belonged to the staff notification only, and goes with it.

`REPLY_KINDS` (`src/features/track/actions.ts`) is a local registry, distinct
from `NOTIFICATION_QUEUES`. Removing send #3 leaves only `def.table` in use —
`permission`, `label` and `path` existed solely to address and link that email.
The type narrows to the table name alone; leaving three dead fields on a
four-field record would read as an oversight to the next person in the file.

### B. Emails that stay — explicitly unchanged

- The four ticket **submission receipts** to the resident
  (`ApplicationSubmittedEmail`, `AppointmentSubmittedEmail`,
  `ComplaintSubmittedEmail`, `AssistanceSubmittedEmail`), from both the four
  public actions and the four admin walk-in creates.
- `InquiryAcknowledgedEmail` to the resident.
- The eight terminal-decision notices (approved/rejected, confirmed/declined,
  resolved/dismissed, granted/declined).
- `TicketUpdateEmail` — staff post a timeline update, the resident is told.
- `PasswordResetEmail` — the `/admin/forgot-password` flow, wholly untouched.

`markTicketUpdateNotified` and its `notified_at` stamp are unaffected: all three
removed notifications are staff-directed, and the "Email attempted" chip has
only ever tracked resident sends. `submitTicketReply`'s own resident-reply
timeline entry deliberately never called it (a chip there would read as the
barangay having already answered), and that stays true — it simply no longer
emails anyone at all.

### C. Accepted consequence of A

Sends 1–3 were the only outbound push staff received. After this, a new
inquiry, a new feedback item, or a resident reply surfaces **only inside the
portal**: the sidebar count badge for the queue and the bell's "something
arrived" dot, both fed by the existing 60-second poll. Nothing is lost from the
queues themselves — the rows, counts and deep links are unchanged — but a staff
member who does not open the portal will not learn of a resident reply.

This was raised during brainstorming and confirmed as intended. It is recorded
here so a future reader does not mistake it for an oversight and re-add the
sends.

### D. SuperAdmin sets the password at creation

`TeamUserInput` gains `password: string`, validated
`z.string().min(10, "Password needs at least 10 characters.")` — the same floor
`resetPassword` and `changeMyPassword` already enforce, so all three doors into
a password agree on one rule.

`createTeamUser` passes it to `admin.auth.admin.createUser({ password })` in
place of `crypto.randomUUID()`. **`email_confirm: true` stays.** That flag is
what already suppresses Supabase's own address-verification email; it predates
the invite work and is not part of what is being removed. Nothing else in the
action changes — the `profiles` insert, the delete-the-auth-user rollback on a
failed profile write, the audit entry and the `revalidatePath` are all as they
are today, minus the `sendAccountInvite` call between them.

Deleted with the invite:

- `sendAccountInvite()` (the helper) and the `resendTeamUserInvite` action.
- The "Resend invite" row action in `TeamManager`.
- `TeamUser.invitePending` (`src/types/index.ts`), `invitePendingFlags()`
  (`src/features/admin/queries/users.ts`), and the "Invite pending" badge in the
  roster table. The badge existed solely to gate "Resend invite"; with no invite
  to resend it is a label with no action behind it. Removing it also deletes the
  N+1 `auth.admin.getUserById` per roster row that the 2026-08-01 spec accepted
  on the grounds that team rosters are small — an accepted cost that no longer
  buys anything.

### E. The create drawer

The create/edit drawer is inline JSX in
`src/features/admin/components/team-manager.tsx`. In **create mode only** it
gains a Password field and a Confirm Password field, built from the existing
`PasswordInput` and `PasswordStrength` primitives so the control matches
`account-security-form.tsx`. Edit mode is unchanged and still offers no way to
set another user's password.

The confirm field is deliberate, not decoration. With the invite email gone
there is nothing that would expose a typo: a mistyped password produces an
account that looks correct on the roster and simply does not open, with no
signal pointing at the password as the cause. The client compares the two
fields before calling the action, matching `account-security-form.tsx`'s
`"Passwords do not match."` check; the server keeps only the `.min(10)` rule,
since a confirm field is a typo guard, not a security boundary, and the action
is a public HTTP endpoint where a second copy of the same string proves nothing.

`openCreate()` clears both fields alongside the ones it already resets. They are
never populated in `openEdit()`.

### F. Recovery path

No new "reset someone else's password" power is granted, and none is needed. A
staff member who loses or mistypes their password uses `/admin/forgot-password`
themselves — public, unchanged, still emailing through `PasswordResetEmail` and
still redeeming at `/admin/reset-password`. Nobody can be locked out, and the
`/admin/reset-password` page stays in the app for that flow's sake even though
the invite that also pointed at it is gone.

## Out of scope

- Any change to `requestPasswordReset` / `resetPassword` / `changeMyPassword`.
- Any change to the in-portal notification system (`NOTIFICATION_QUEUES`, the
  bell, the badges, the 60s poll, `notifications_seen_at`).
- Any change to resident-facing email content or triggers.
- Adding a SuperAdmin-driven password reset for an existing account.
- Deleting `src/lib/email.ts`, `EmailLayout`, `TicketNotice`, or any other
  shared email infrastructure — all of it still serves the resident sends.
- Migration work. Nothing here touches the schema: `invitePending` was always
  inferred from `auth.users.last_sign_in_at`, never a column.

## Error handling

Unchanged in shape. The three removed staff sends were best-effort and
fail-open by construction (`sendEmail()` never throws to its caller); deleting
them removes failure paths rather than adding any. `createTeamUser`'s error
handling is untouched — a bad password now fails Zod validation and returns
`{ error }` to the drawer through the existing `setFormError` path, the same as
a bad email does today.

## Testing

- `npm run typecheck` and `npm run lint` must pass. Removing
  `TeamUser.invitePending` is the change most likely to surface a compile error
  at an unexpected consumer, which is the point of leaning on `tsc` here.
- `npm run test:unit` — `tests/unit/notifications.test.ts` loses its
  `staffEmailsFor` coverage; the `NOTIFICATION_QUEUES` / `search-modules`
  agreement test in the same file stays and must still pass.
- Manual verification in the running app, per `.claude/skills/verify/SKILL.md`:
  create a staff account with a chosen password, confirm no email is sent, and
  sign in as that user on the first attempt with no reset step.
- Existing e2e suites are unaffected: none of them assert on staff email, and
  `tests/e2e/admin/ticket-updates.spec.ts`'s reply round trip asserts on the
  admin timeline and the "New reply" pill, not on a notification email.

## CLAUDE.md consequences

Three bullets carry claims this change falsifies and must be corrected in the
same session:

1. The **Resend Plan 1/Plan 2** bullet — `submitInquiry`'s staff notify,
   `submitFeedback`'s staff notify, the `replyTo` note, and `staffEmailsFor()`
   itself are all described as live.
2. The **invite-based account creation** bullet (2026-08-01) — describes the
   `crypto.randomUUID()` password, `sendAccountInvite`, `resendTeamUserInvite`,
   the "Invite pending" badge and its accepted N+1 as current behaviour.
3. The **ticket-timeline** bullet's reply-path paragraph — mentions the staff
   email as the channel a reply arrives on.
