# Admin account creation via invite — design

**Status:** approved, ready for implementation planning.
**Closes:** the gap where `createTeamUser` requires the SuperAdmin to invent
and hand over a password themselves (`src/features/admin/actions/users.ts`),
with no verification that the email address actually belongs to the new
staff member.

## Context

Today, creating a staff account (`/admin/users`, SuperAdmin-only) is a single
form: full name, email, a SuperAdmin-chosen password, status label
(Staff/Editor), SuperAdmin toggle, and permission checkboxes. The account is
created active and immediately usable with that password.

The self-service password-reset flow (`2026-07-31-admin-forgot-password-design.md`)
already built and shipped a fully server-side mechanism for "email a link,
redeem it, set a password": `auth.admin.generateLink({type: "recovery", ...})`
returns a `hashed_token`; the app builds its own URL
(`/admin/reset-password?token_hash=...`) rather than using Supabase's
`action_link`; `resetPassword` redeems it with
`verifyOtp({type: "recovery", token_hash})` (not `exchangeCodeForSession` —
PKCE has no code-verifier available on a server-initiated flow) and then
`updateUser({password})`. This design reuses that mechanism as-is for the
new account's first password, rather than building a second one.

`profiles.phone` already exists (migration `0003`) but is currently only
ever set by the account owner themselves, via `updateMyProfile`
(`src/features/admin/actions/account.ts`) — never by a SuperAdmin creating
the account.

Confirmed during brainstorming: this is **not** a "someone else requests, a
SuperAdmin approves" queue. Creation stays 100% SuperAdmin-initiated, exactly
as it is today — the only things changing are (a) the SuperAdmin no longer
sets a password, an emailed link handles that, and (b) the form captures
richer identity info (split name, phone) up front.

## Scope

1. Migration `0031`: split `profiles.full_name` into
   `first_name`/`middle_name`/`last_name`, with `full_name` kept as a plain
   (non-generated) column the application keeps in sync.
2. `createTeamUser` stops accepting a password; creates the auth user with a
   random unusable password, then sends a "welcome, set your password" email
   through the existing recovery-link mechanism.
3. One new email template, `AccountInviteEmail`.
4. `updateTeamUser` gains the split-name fields and (for editing someone
   else) the phone field.
5. An "Invite pending" indicator + "Resend invite" row action in
   `TeamManager`.
6. The create-drawer form (inline JSX in `team-manager.tsx`) drops the
   password/confirm-password fields and `PasswordStrength`; adds First
   Name / Middle Name / Last Name / Mobile Number inputs above Email.

Out of scope: any non-SuperAdmin request/approval step; changing how
`changeMyPassword` or self-service `updateMyProfile` work (the Settings →
Profile "Full Name" field stays a single input and keeps writing only
`full_name` directly — see "Accepted drift" below); expiring or capping how
long an unredeemed invite link stays valid (Supabase's own recovery-token
expiry already governs this, same as password reset).

## Approaches considered

- **A — Reuse the recovery-link mechanism verbatim for the first password
  (chosen).** Zero new auth plumbing; `resetPassword`,
  `/admin/reset-password`, and its rate limits are untouched and unaware
  this call site exists. The only new pieces are the email copy and the
  call site in `createTeamUser`/a new `resendInvite` action.
- **B — Supabase's `generateLink({type: "invite"})`.** Rejected: that link
  type creates the auth user itself as part of generating the link, which
  conflicts with this app's existing create-then-rollback-on-profile-failure
  pattern (`createTeamUser` already creates the auth user via
  `admin.createUser` first, then inserts the `profiles` row, and deletes the
  auth user if the insert fails — mixing in `invite`'s own user-creation
  would mean two different code paths create a Supabase Auth user). Using
  `recovery` against an account this app already fully controls sidesteps
  that entirely.
- **C — SuperAdmin still sets a temporary password, shown once.** Rejected:
  doesn't verify the email address belongs to the new person, and is exactly
  the pattern this design was asked to replace.

## Data model

`0031_profile_name_parts.sql`:

```sql
alter table public.profiles
  add column first_name text,
  add column middle_name text,
  add column last_name text;

-- Best-effort backfill for existing rows: first token, last token, middle
-- tokens. With only a handful of real team-user rows today, a manual
-- touch-up through the edit drawer afterward is expected and fine.
update public.profiles set
  first_name = split_part(full_name, ' ', 1),
  last_name = case
    when array_length(regexp_split_to_array(full_name, '\s+'), 1) > 1
      then (regexp_split_to_array(full_name, '\s+'))[array_length(regexp_split_to_array(full_name, '\s+'), 1)]
    else ''
  end,
  middle_name = nullif(trim(
    regexp_replace(full_name, '^\S+\s*|\s*\S+$', '', 'g')
  ), '');

alter table public.profiles
  alter column first_name set not null,
  alter column last_name set not null;
```

`first_name`/`last_name` are `not null` (matching `full_name`'s existing
`not null`); `middle_name` stays nullable. No RLS changes — same "readable
by signed-in staff, all writes via service-role" model as every other
`profiles` column.

`buildFullName(first, middle, last)` — new small pure helper (co-located
with the other user-management helpers in
`src/features/admin/actions/users.ts`, no need for its own file) —
`[first, middle, last].filter(Boolean).join(" ")`. Called by both
`createTeamUser` and `updateTeamUser` to write `full_name` alongside the
three parts, so every SuperAdmin-driven write keeps them in sync.

`TeamUser` (`src/types/index.ts`) gains `firstName: string`,
`middleName: string | null`, `lastName: string`. These stay on `TeamUser`,
not the base `SessionUser` — nothing outside the Users manager needs the
split (topbar, avatar initials, etc. keep reading `fullName`).
`src/features/admin/queries/users.ts`'s `COLUMNS`/`ProfileRow`/`toTeamUser`
extend accordingly.

**Accepted drift:** Settings → Profile (`account-profile-form.tsx`,
`updateMyProfile`) is unchanged — a single "Full Name" text input, still
writing only `full_name`. If a user later edits their own display name from
Settings, `first_name`/`middle_name`/`last_name` will not follow it and
`full_name` will diverge from the split fields. This is accepted rather than
fixed here: self-renaming is rare, and reworking the self-service profile
form was not part of what was asked for. If it matters later, the fix is
symmetric — split that form's field too, and have `updateMyProfile` call
`buildFullName` the same way.

## Create-account flow

`TeamUserInput` (`src/features/admin/actions/users.ts`):

```ts
export interface TeamUserInput {
  firstName: string;
  middleName: string; // "" means none
  lastName: string;
  phone: string;
  email: string;
  statusLabel: StaffStatusLabel;
  permissions: Permission[];
  isSuperAdmin: boolean;
}
```

`password`/`PasswordStrength` are gone from both the type and the Zod
schema. New Zod rules: `firstName`/`lastName` trimmed, `min(1)`;
`middleName` trimmed, allowed empty; `phone` trimmed, `min(1)` (required —
the SuperAdmin is capturing another person's contact info as part of
onboarding, not editing their own optional field), `max(30)` matching
`updateMyProfile`'s existing phone rule, no format regex (same
free-text-with-a-length-cap convention already used there).

`createTeamUser`:

1. Same `checkSuperAdmin()` gate and Zod validation as today.
2. `admin.auth.admin.createUser({ email, password: <random>,
   email_confirm: true })` — the random password is generated with
   `crypto.randomUUID()` (Node's built-in `crypto`, already a runtime
   dependency of this Server Action environment; not surfaced anywhere, not
   stored anywhere beyond what Supabase Auth itself holds as the hashed
   credential). `email_confirm: true` is kept as today's behavior: the
   SuperAdmin is vouching for the address, and the invite link itself is the
   verification step in practice (it proves the mailbox is reachable).
3. Insert the `profiles` row with `first_name`/`middle_name`/`last_name`,
   `full_name: buildFullName(...)`, `phone`, and the rest as today. Roll
   back (`admin.auth.admin.deleteUser`) on failure, unchanged.
4. Call a new shared helper, `sendAccountInvite(admin, { email, fullName })`
   (see below), awaited but its result not gating the return —
   matching this codebase's fail-open email convention (`sendEmail` never
   throws; a Resend outage must not un-create the account or report an
   error for something that otherwise fully succeeded).
5. `recordActivity` (`type: "create"`, unchanged) and
   `revalidatePath("/admin/users")`, unchanged.

`sendAccountInvite(admin, { email, fullName })` — new helper, same file:

```ts
async function sendAccountInvite(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  user: { email: string; fullName: string },
): Promise<void> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: user.email,
  });
  if (error || !data) return; // fail open, same as every sendEmail() call site
  const setPasswordUrl = `${EMAIL_SITE_URL}/admin/reset-password?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}`;
  await sendEmail({
    to: user.email,
    subject: "Welcome to the Barangay San Fernando admin portal",
    template: AccountInviteEmail({ fullName: user.fullName, setPasswordUrl }),
  });
}
```

This is the exact `generateLink` → build-our-own-URL → `sendEmail` shape
`requestPasswordReset` already uses, extracted just far enough to be called
from two places (create, resend) without duplicating it. It does **not**
reuse `requestPasswordReset` itself — that function is public/unauthenticated,
rate-limited, Turnstile-gated, and returns a generic anti-enumeration
response; none of that applies here, where the caller is an
already-authenticated SuperAdmin acting on an account they just created.

## Resend invite

New action, `resendTeamUserInvite(id)`, same file:

1. `checkSuperAdmin()` gate.
2. Look up the profile (`email`, `full_name`, `is_active`, `is_archived`) —
   reject with a generic error if archived (an archived account shouldn't
   be handed a working sign-in link).
3. Call `sendAccountInvite(admin, ...)`.
4. `recordActivity` (`type: "update"`, `action: "resent account invite"`,
   `entityType: "team-user"`).

No new rate limit: this is an authenticated SuperAdmin action against an
account they already control, not a public form — same trust level as every
other button in `TeamManager`.

## "Invite pending" indicator

A row is "pending" when `auth.users.last_sign_in_at is null` for that user
— no new column. `listTeamUsers`/`listArchivedTeamUsers`
(`src/features/admin/queries/users.ts`) call
`admin.auth.admin.getUserById(row.id)` per row and set a new
`TeamUser.invitePending: boolean` field. This is an N+1 pattern, accepted
because team rosters in this app are small (single-digit to low tens of
rows) — the same tradeoff this codebase already makes elsewhere for
small, bounded lists rather than optimizing for a scale this app doesn't
have.

`TeamManager`: a small amber "Invite pending" badge next to the role badge
for such rows; `RowActions` gains a "Resend invite" entry, shown only when
`invitePending` is true, calling `resendTeamUserInvite(id)` through the
same `try { await ... } catch { showError(...) } finally {}` shape every
other row action in this file already uses.

## Create/edit form

The drawer body is inline JSX in `team-manager.tsx` (no separate form
component today). The password + confirm-password + `PasswordStrength`
block (currently rendered only in create mode, around the existing
`password` local state) is deleted entirely — edit mode never had it,
since editing a password already goes through `changeMyPassword`/reset, not
this form. Above the existing Email field, three inputs replace the single
Full Name field: First Name, Middle Name (labeled optional), Last Name; a
Mobile Number field is added directly below Email. Edit mode prefills all
three name parts and phone from the `TeamUser` row. Status label,
SuperAdmin toggle, and the permission checkboxes are visually and
functionally unchanged.

## Email template

`src/emails/AccountInviteEmail.tsx` — new file, wraps `<EmailLayout>` like
every existing template.

```ts
export interface AccountInviteEmailProps {
  fullName: string;
  setPasswordUrl: string;
}
```

Body: addressed to `fullName`, explains an admin-portal account was created
for them, a button to `setPasswordUrl` labeled "Set your password," and a
short note that the link is single-use and expires after a while (same
"display copy only, Supabase enforces the real expiry" caveat
`PasswordResetEmail` already carries, restated for this template rather
than shared — the two templates' bodies differ enough in framing, "welcome"
vs. "you requested this," that composing a shared body would fight the
copy more than it would save).

## Testing

- **Vitest**: `buildFullName` is a pure function — one small test file
  covering the empty-middle-name case and the all-three-parts case, next to
  the existing `tests/unit/` admin-portal unit tests.
- **Playwright**: there is no existing `tests/e2e/admin/users.spec.ts` —
  `/admin/users` currently has no e2e coverage at all. A new spec file
  covering the create form's new fields, the removal of the password
  fields, and the "invite pending" badge/resend button against a freshly
  created account is possible without a live inbox. The actual emailed-link
  round trip is not automatable without a live inbox, same limitation every
  other email-touching flow in this app already documents.

## Out of scope

- Any request/approval step from a non-SuperAdmin.
- Expiring/capping/tracking invite-link lifetime beyond what Supabase's
  recovery token already enforces.
- Splitting the self-service Settings → Profile name field (see "Accepted
  drift" above).
- Format validation on the phone number beyond length (matches
  `updateMyProfile`'s existing free-text convention).
