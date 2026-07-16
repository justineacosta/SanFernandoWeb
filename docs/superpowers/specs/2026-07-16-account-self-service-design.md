# Account Self-Service & User-Management Revisions — Design

**Date:** 2026-07-16
**Status:** Approved by Justine (brainstorming session)
**Branch:** folds into `feature/auth-foundation` (Plan 1, not yet merged)
**Builds on:** `docs/superpowers/specs/2026-07-15-backend-integration-design.md` §4 (auth/permissions)

## Purpose

Post-implementation revisions to the auth foundation: let every signed-in admin user
manage their own profile and password, tighten SuperAdmin self-demotion, and clarify who
may edit email addresses.

## Decisions locked with the user

| Decision | Choice |
| --- | --- |
| Profile photo upload | **Deferred** to the later media/storage plan (shares the bucket + RLS + `next/image` host + 2MB validation with news/officials photos). Initials badge stays meanwhile. |
| Password change | **Requires current password** (verified server-side) + new password. |
| Full name self-edit | **Allowed** on My Profile (basic personal info; card already has the field). |

## 1. Settings page access

`/admin/settings` changes from `requireSuperAdmin()` to `requireSessionUser()` — reachable
by every signed-in admin user. The page renders:

- **My Profile** card — all users.
- **Account Security** card — all users.
- **Manage Users** section — **only when `currentUser.isSuperAdmin`** (non-SuperAdmins never
  see it). Server actions behind it keep their own `requireSuperAdmin()` gate — the
  conditional render is cosmetic, the action gate is the real control.

## 2. "Team" → "Manage Users"

Rename the panel heading and its wording throughout `team-manager.tsx`. No behavior change
beyond the copy.

## 3. SuperAdmin self-demotion blocked

- **UI:** in the Manage Users edit drawer, when editing your own row, the SuperAdmin
  checkbox is locked on (disabled).
- **Server (`updateTeamUser`):** if `id === actor.id` and the input removes the caller's own
  SuperAdmin status (`!input.isSuperAdmin` while they are currently a SuperAdmin), reject:
  "You cannot remove your own SuperAdmin status — another SuperAdmin must do it."
- A *different* SuperAdmin editing the row can still demote them, subject to the existing
  `wouldOrphanSuperAdmin` last-SuperAdmin guard.

## 4. Email editing rules

- **No one edits their own email** — not even a SuperAdmin edits their own.
- **A SuperAdmin may edit another user's email** (Manage Users edit drawer). The field is
  editable only when `id !== currentUser.id`; on the own row it is read-only.
- A SuperAdmin changing another user's email updates **both** the Supabase Auth user
  (`admin.auth.admin.updateUserById(id, { email })`) **and** the `profiles.email` column,
  respecting the `profiles_email_unique` constraint (migration 0002) — on a duplicate,
  return a friendly "That email is already in use." and make no partial change.
- **My Profile** card shows email read-only with the note: "Contact a SuperAdmin to change
  your email."

## 5. Self-service personal info (all users)

### 5a. My Profile card (`account-profile-form.tsx`, client)

- Editable: **full name**, **cellphone number** (new nullable `phone` column, migration
  0003). Email read-only (see §4). Photo deferred — initials badge stays with a disabled
  "photo upload coming soon" affordance.
- Action `updateMyProfile({ fullName, phone })` in `actions/account.ts`: `requireSessionUser`,
  Zod-validate (fullName min 2; phone optional, trimmed), update the caller's own
  `profiles` row by their session id (never accepts an id or email argument), record audit
  activity, `revalidatePath("/admin/settings")`.

### 5b. Account Security card (`account-security-form.tsx`, client)

- Fields: **current password**, **new password**, **confirm new password** — each with an
  eye show/hide toggle. New password min 10 characters. The confirm field is a
  **client-side-only** guard: the form blocks submit and shows "Passwords do not match"
  until new and confirm are equal; the server action receives only `currentPassword` and
  `newPassword`.
- Action `changeMyPassword({ currentPassword, newPassword })` in `actions/account.ts`:
  `requireSessionUser`; verify the current password by calling
  `signInWithPassword({ email: <session email>, password: currentPassword })` on the
  cookie-bound server client — on error return "Current password is incorrect."; then
  `supabase.auth.updateUser({ password: newPassword })`; record audit activity. Never logs
  password values.

### 5c. Eye toggles

Show/hide button (lucide `Eye`/`EyeOff`) on every password input: the login page
(`login-form.tsx`) and all three Account Security fields. Pure client state; the button is
`type="button"` with an `aria-label` that flips between "Show password"/"Hide password".

## 6. Schema (migration 0003)

```sql
alter table public.profiles add column phone text;
```

`SessionUser` and `TeamUser` gain `phone: string | null`; the `getSessionUser`,
`listTeamUsers` selects add `phone`.

## 7. File inventory

- Create: `supabase/migrations/0003_profiles_phone.sql`
- Create: `src/features/admin/actions/account.ts`
- Create: `src/features/admin/components/account-profile-form.tsx`
- Create: `src/features/admin/components/account-security-form.tsx`
- Modify: `src/features/admin/actions/users.ts` (email edit for others; self-demotion guard)
- Modify: `src/features/admin/components/team-manager.tsx` (rename; lock own SuperAdmin box; email field for others)
- Modify: `src/features/admin/components/settings-panel.tsx` (compose new cards; gate Manage Users to SuperAdmin)
- Modify: `src/app/admin/(portal)/settings/page.tsx` (`requireSessionUser`; pass phone)
- Modify: `src/features/admin/components/login-form.tsx` (password eye toggle)
- Modify: `src/lib/auth.ts` (select + map `phone`), `src/features/admin/queries/users.ts` (select + map `phone`)
- Modify: `src/types/index.ts` (`phone` on `SessionUser`/`TeamUser`; `UpdateMyProfileValues`, `ChangePasswordValues`)

## 8. Verification

Project rule: no test framework. Gate = `npm run typecheck` + `npm run lint` +
`npm run build` + runtime drive against the live Supabase staging project. Runtime checks:
non-SuperAdmin reaches Settings and sees only the two personal cards; My Profile name/phone
save and persist; password change rejects a wrong current password and succeeds with the
right one; login + security eye toggles flip the field type; a SuperAdmin cannot untick
their own SuperAdmin box (UI locked + action rejects); a SuperAdmin edits another user's
email (and a duplicate is rejected); own-email field is read-only everywhere.

## 9. Out of scope

Profile photo upload (media plan), SMS verification of phone numbers, password strength
meters beyond the 10-char minimum, email change confirmation flow (SuperAdmin sets it
directly).
