# SuperAdmin-set passwords and staff-email removal — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the three staff-directed notification emails and the account-invite email, and let a SuperAdmin type the new account's password directly in the create drawer.

**Architecture:** Purely subtractive except for one added form field pair. No migration, no schema change, no new module. Six tasks, each ending with `npm run typecheck` + `npm run lint` + `npm run test:unit` green, so the working tree is never left in a broken intermediate state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (service-role client), Zod v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-superadmin-password-and-staff-email-removal-design.md`

## Global Constraints

- **Every resident-facing email stays.** The four ticket submission receipts, `InquiryAcknowledgedEmail`, the eight terminal-decision notices, `TicketUpdateEmail`, and `PasswordResetEmail` are all out of scope. Do not touch them.
- **`NOTIFICATION_QUEUES` stays.** Only `staffEmailsFor` and `staffQualifies` leave `src/lib/notifications.ts`. The registry, `permittedQueues`, `countForNavHref`, `hasUnseen`, `mergeRecent` and `formatRelativeTime` all remain and stay tested.
- **No migration.** `invitePending` was always inferred from `auth.users.last_sign_in_at`, never a column.
- **Password minimum is 10 characters**, exact message `"Password needs at least 10 characters."` — matching the existing `.min(10)` floor in `resetPassword` (`src/features/admin/actions/auth.ts:378`) and `changeMyPassword` (`src/features/admin/actions/account.ts:102`).
- **`email_confirm: true` stays** in `createTeamUser`'s `admin.auth.admin.createUser` call. It predates the invite work and is what suppresses Supabase's own address-verification email.
- **Vitest cannot import `"use server"` modules.** None of the changed Server Actions can get a unit test; verification for those is `typecheck` + `lint` + manual browser check per `.claude/skills/verify/SKILL.md`. Do not fabricate tests that cannot run.
- **Never `git add -A`** — this branch sits on top of unrelated uncommitted work (`CLAUDE.md`, three hero components, `src/images/transparencyimage/`). Stage the exact paths each task names.
- Run commands from the repo root, `e:\GitHub\SanFernandoWeb`.

---

## File Structure

**Deleted (4 email templates):**
- `src/emails/InquiryStaffNotifyEmail.tsx`
- `src/emails/FeedbackStaffNotifyEmail.tsx`
- `src/emails/TicketReplyStaffNotifyEmail.tsx`
- `src/emails/AccountInviteEmail.tsx`

**Modified:**
- `src/features/contact/actions.ts` — drop the staff notify, collapse the `Promise.all`
- `src/features/feedback/actions.ts` — drop the staff notify (leaves the action emailing nobody)
- `src/features/track/actions.ts` — drop the staff notify, narrow `REPLY_KINDS`
- `src/lib/notifications.ts` — delete `staffEmailsFor` + `staffQualifies`, becomes a pure module again
- `tests/unit/notifications.test.ts` — delete those two `describe` blocks and the Supabase mock scaffolding
- `src/features/admin/actions/users.ts` — delete `sendAccountInvite` + `resendTeamUserInvite`, add `password` to create
- `src/features/admin/queries/users.ts` — delete `invitePendingFlags`, drop the N+1
- `src/types/index.ts` — drop `TeamUser.invitePending`
- `src/features/admin/components/team-manager.tsx` — drop invite UI, add password fields
- `CLAUDE.md` — correct three bullets

---

### Task 1: Remove the three staff notification emails

**Files:**
- Modify: `src/features/contact/actions.ts:9-12, 71-105`
- Modify: `src/features/feedback/actions.ts:10-13, 108-123`
- Modify: `src/features/track/actions.ts:4-21, 255-283, 400-428`
- Modify: `src/lib/notifications.ts:1-5, 184-223`
- Modify: `tests/unit/notifications.test.ts:1-28, 146-219`
- Delete: `src/emails/InquiryStaffNotifyEmail.tsx`, `src/emails/FeedbackStaffNotifyEmail.tsx`, `src/emails/TicketReplyStaffNotifyEmail.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first).
- Produces: `src/lib/notifications.ts` exports shrink to `NOTIFICATION_QUEUES`, `permittedQueues`, `countForNavHref`, `hasUnseen`, `mergeRecent`, `formatRelativeTime` and their types. `staffEmailsFor` and `staffQualifies` no longer exist — no later task may reference them. `REPLY_KINDS` in `track/actions.ts` becomes `Record<TicketKind, { table: string }>`.

- [ ] **Step 1: Delete the three template files**

```bash
git rm src/emails/InquiryStaffNotifyEmail.tsx src/emails/FeedbackStaffNotifyEmail.tsx src/emails/TicketReplyStaffNotifyEmail.tsx
```

- [ ] **Step 2: Run typecheck to see exactly which call sites break**

Run: `npm run typecheck`

Expected: FAIL, with "Cannot find module" errors pointing at `src/features/contact/actions.ts`, `src/features/feedback/actions.ts` and `src/features/track/actions.ts`. This is the checklist for steps 3-5 — confirm you get exactly those three files and no others.

- [ ] **Step 3: Strip the staff notify from `submitInquiry`**

In `src/features/contact/actions.ts`, delete these two import lines (lines 10 and 12):

```ts
import { staffEmailsFor } from "@/lib/notifications";
import { InquiryStaffNotifyEmail } from "@/emails/InquiryStaffNotifyEmail";
```

Keep `import { sendEmail } from "@/lib/email";` — the resident acknowledgment still uses it.

Then replace the whole block from the `// Best-effort notifications:` comment through the closing brace of the `if (staffEmails.length > 0) { ... }` (lines 71-105) with:

```ts
  // Best-effort acknowledgment: the inquiry row is already saved above, so a
  // failed send must never surface as an error to the resident — sendEmail()
  // fails open by construction (see src/lib/email.ts).
  await sendEmail({
    to: parsed.data.email,
    subject: "We received your message — Barangay San Fernando",
    template: InquiryAcknowledgedEmail({
      firstName: parsed.data.firstName,
      subject: parsed.data.subject,
    }),
  });
```

The insert above keeps its `.select("id").single()`. `data.id` was only read by the deleted staff email, but the `if (error || !data)` guard still needs `data`, and narrowing the select is scope this task does not own.

- [ ] **Step 4: Strip the staff notify from `submitFeedback`**

In `src/features/feedback/actions.ts`, delete these four import lines (10-13):

```ts
import { sendEmail } from "@/lib/email";
import { staffEmailsFor } from "@/lib/notifications";
import { feedbackCategoryLabel } from "./data";
import { FeedbackStaffNotifyEmail } from "@/emails/FeedbackStaffNotifyEmail";
```

All four go: `sendEmail` and `feedbackCategoryLabel` had no other consumer in this file (verified by grep — `feedbackCategoryLabel` appeared only at line 117, `sendEmail` only at 113). `submitFeedback` now emails nobody, which is correct: feedback is anonymous, so there was never a resident to acknowledge.

Then delete lines 108-123 entirely — the `// Best-effort:` comment, the `staffEmailsFor` call, and the `if (staffEmails.length > 0) { ... }` block — leaving:

```ts
  return { error: null };
}
```

directly after the insert's error guard.

- [ ] **Step 5: Strip the staff notify from `submitTicketReply` and narrow `REPLY_KINDS`**

In `src/features/track/actions.ts`, delete these three import lines (19-21):

```ts
import { sendEmail } from "@/lib/email";
import { staffEmailsFor } from "@/lib/notifications";
import { TicketReplyStaffNotifyEmail } from "@/emails/TicketReplyStaffNotifyEmail";
```

Also remove `Permission,` from the `import type { ... } from "@/types"` block at lines 4-11 — after the next edit nothing else in this file uses it.

Replace the `REPLY_KINDS` declaration (lines 255-283) with:

```ts
/**
 * Which table each ticket kind's reply updates. `permission`, `label` and
 * `path` used to live here too; all three existed only to address and link the
 * staff notification email, removed 2026-08-06.
 */
const REPLY_KINDS: Record<TicketKind, { table: string }> = {
  application: { table: "applications" },
  appointment: { table: "appointments" },
  complaint: { table: "complaints" },
  assistance: { table: "assistance_requests" },
};
```

Then, in `submitTicketReply`, the status update at line 403 no longer needs its returned row — `row` was read only by the deleted email's `adminHref`. Replace:

```ts
  const { data: row, error: statusError } = await admin
    .from(def.table)
    .update({ status: REPLY_RETURN_STATUS, replied_at: new Date().toISOString() })
    .eq("ticket_no", view.ticket_no)
    .eq("status", "awaiting-info")
    .select("id")
    .maybeSingle();
  if (statusError) console.error("submitTicketReply status update failed:", statusError.message);
```

with:

```ts
  const { error: statusError } = await admin
    .from(def.table)
    .update({ status: REPLY_RETURN_STATUS, replied_at: new Date().toISOString() })
    .eq("ticket_no", view.ticket_no)
    .eq("status", "awaiting-info");
  if (statusError) console.error("submitTicketReply status update failed:", statusError.message);
```

and delete lines 412-428 (the `// Sent either way...` comment block, the `staffEmailsFor` call and the `if (staffEmails.length > 0) { ... }` send).

Leave the `// Rebuild the result AFTER the status update...` comment and everything below it exactly as it is — the resident still gets their refreshed `TicketLookupResult`, and `replied_at` is still written, so the admin queue's "New reply" pill still works.

- [ ] **Step 6: Delete `staffEmailsFor` and `staffQualifies`**

In `src/lib/notifications.ts`, delete lines 184-223 — both functions and their doc comments. Then delete the now-unused import at line 3:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
```

This returns the module to pure functions over a static registry, with no database access at all.

- [ ] **Step 7: Delete the matching unit tests**

In `tests/unit/notifications.test.ts`:

Delete the `describe("staffQualifies", ...)` block (lines 146-162) and the `describe("staffEmailsFor", ...)` block (lines 164-219) in full.

Delete `staffEmailsFor,` and `staffQualifies,` from the import block at lines 17-28.

Delete the now-unused Supabase mock scaffolding at lines 5-15:

```ts
// vi.mock factories are hoisted above regular `const` declarations, so the
// mock functions themselves must be created inside vi.hoisted() — same
// reasoning tests/unit/email.test.ts documents for its own `resend` mock.
const { fromMock, createSupabaseAdminClientMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
```

Then narrow the vitest import on line 1 — `beforeEach` and `vi` were used only by the deleted blocks:

```ts
import { describe, expect, it } from "vitest";
```

The `MODULE_META` / `MODULE_PERMISSION` import and the registry-agreement tests stay untouched.

- [ ] **Step 8: Verify the suite is green**

Run: `npm run typecheck && npm run lint && npm run test:unit`

Expected: all three PASS. The unit suite should report fewer tests than before (six fewer: three `staffQualifies`, three `staffEmailsFor`) with zero failures. If `lint` reports an unused import or variable anywhere in the four modified source files, you missed one of the deletions above.

- [ ] **Step 9: Commit**

```bash
git add src/emails src/features/contact/actions.ts src/features/feedback/actions.ts src/features/track/actions.ts src/lib/notifications.ts tests/unit/notifications.test.ts
git commit -m "feat: remove the three staff notification emails

Inquiry, feedback and resident-reply staff notifies are gone, along with
staffEmailsFor/staffQualifies (no callers left) and the three templates.
Staff now learn of new work only from the in-portal bell and count badges.
Every resident-facing email is untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Remove the invite UI from TeamManager

**Files:**
- Modify: `src/features/admin/components/team-manager.tsx:4, 8, 21-29, 246-248, 273-284, 428-432`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `team-manager.tsx` no longer imports `resendTeamUserInvite` or reads `member.invitePending`, which is what lets Tasks 3 and 4 delete them.

This task is UI-only and leaves the app green: the `resendTeamUserInvite` action still exists, it just has no caller.

- [ ] **Step 1: Delete the `resendInvite` handler**

Remove lines 246-248:

```ts
  function resendInvite(user: TeamUser) {
    runRowAction(() => resendTeamUserInvite(user.id), `Invite resent to ${user.fullName}.`);
  }
```

- [ ] **Step 2: Delete the "Resend invite" row action**

In `actionsFor`, replace the active-view return block's opening (lines 273-285) — currently:

```ts
    return [
      { label: "Edit user", icon: Pencil, onSelect: () => openEdit(member) },
      ...(member.invitePending
        ? [
            {
              label: "Resend invite",
              icon: Mail,
              disabled: isPending,
              onSelect: () => resendInvite(member),
            },
          ]
        : []),
      {
```

with:

```ts
    return [
      { label: "Edit user", icon: Pencil, onSelect: () => openEdit(member) },
      {
```

- [ ] **Step 3: Delete the "Invite pending" badge**

Remove lines 428-432 from the name cell:

```tsx
                            {member.invitePending ? (
                              <Badge variant="soft" className="ml-2 align-middle">
                                Invite pending
                              </Badge>
                            ) : null}
```

The `(you)` marker directly above it stays.

- [ ] **Step 4: Drop the three now-unused imports**

Line 4 — remove `Mail` (it was the Resend-invite icon and has no other use in this file):

```ts
import { Plus, Archive, RotateCcw, Trash2, Pencil, UserCheck, UserX } from "lucide-react";
```

Line 8 — delete entirely, `Badge` had no other use:

```ts
import { Badge } from "@/components/ui/badge";
```

Lines 21-29 — remove `resendTeamUserInvite,` from the actions import, leaving:

```ts
import {
  archiveTeamUser,
  createTeamUser,
  deleteTeamUser,
  restoreTeamUser,
  setTeamUserActive,
  updateTeamUser,
} from "@/features/admin/actions/users";
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint`

Expected: both PASS. `lint` catching an unused `Mail`, `Badge` or `resendTeamUserInvite` means step 4 was missed.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/team-manager.tsx
git commit -m "feat: drop the Resend invite action and Invite pending badge

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Delete the invite mechanism

**Files:**
- Modify: `src/features/admin/actions/users.ts:10-12, 92-118, 159, 172-197`
- Delete: `src/emails/AccountInviteEmail.tsx`

**Interfaces:**
- Consumes: Task 2 removed the only caller of `resendTeamUserInvite`.
- Produces: `createTeamUser` still has today's `TeamUserInput` signature (no `password` yet — that is Task 5) and simply no longer emails. `resendTeamUserInvite` and `sendAccountInvite` no longer exist.

- [ ] **Step 1: Delete the invite email template**

```bash
git rm src/emails/AccountInviteEmail.tsx
```

- [ ] **Step 2: Delete `sendAccountInvite`**

In `src/features/admin/actions/users.ts`, delete lines 92-118 — the whole doc comment and function, from `/**` through the closing `}` of `sendAccountInvite`.

- [ ] **Step 3: Delete its call in `createTeamUser`**

Remove line 159 and the blank line after it:

```ts
  await sendAccountInvite(admin, { email: parsed.data.email, fullName });
```

`recordActivity` and `revalidatePath` below it stay exactly as they are.

- [ ] **Step 4: Delete `resendTeamUserInvite`**

Delete lines 172-197 — the `/** SuperAdmin-only, unrate-limited... */` comment and the entire `resendTeamUserInvite` function.

- [ ] **Step 5: Drop the three now-unused imports**

Delete lines 10-12:

```ts
import { sendEmail } from "@/lib/email";
import { EMAIL_SITE_URL } from "@/emails/site-url";
import { AccountInviteEmail } from "@/emails/AccountInviteEmail";
```

`createSupabaseAdminClient`, `buildFullName`, `recordActivity` and the rest all stay.

- [ ] **Step 6: Fix the now-stale comment in `createTeamUser`**

Lines 131-132 currently read:

```ts
  // A random, never-surfaced password: the account exists but cannot sign in
  // until the invite email's link is used to set a real one.
```

Leave this comment for now — Task 5 replaces both it and the `crypto.randomUUID()` line it describes. Deleting it here would leave the `randomUUID` call undocumented for one commit; changing it here would describe behaviour that does not exist yet.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run lint`

Expected: both PASS. Nothing should reference `AccountInviteEmail`, `sendAccountInvite` or `resendTeamUserInvite` anywhere. Confirm with:

Run: `git grep -n "AccountInviteEmail\|sendAccountInvite\|resendTeamUserInvite" -- src tests`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/emails src/features/admin/actions/users.ts
git commit -m "feat: remove the account invite email and resend action

Creating an account no longer emails a set-your-password link. The
recovery-link mechanism itself is untouched and still serves
/admin/forgot-password.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Remove `invitePending` and its N+1 lookup

**Files:**
- Modify: `src/types/index.ts` (the `TeamUser` interface)
- Modify: `src/features/admin/queries/users.ts:24, 40, 44-61, 82-83, 102-103`

**Interfaces:**
- Consumes: Task 2 removed the only reader of `TeamUser.invitePending`.
- Produces: `TeamUser` no longer has `invitePending`. `toTeamUser(row: ProfileRow): TeamUser` is now single-argument.

- [ ] **Step 1: Drop the field from the type**

In `src/types/index.ts`, in the `TeamUser` interface, delete:

```ts
  /** True when the account has never signed in — the invite link is unredeemed. */
  invitePending: boolean;
```

- [ ] **Step 2: Delete `invitePendingFlags`**

In `src/features/admin/queries/users.ts`, delete lines 44-61 in full — the doc comment and the whole function:

```ts
/**
 * "Invite pending" is inferred from auth.users.last_sign_in_at being null — no
 * new column. One getUserById call per row (N+1), accepted because team
 * rosters in this app are small (single-digit to low tens of rows); see
 * the 2026-08-01 admin-account-invite design spec.
 */
async function invitePendingFlags(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  ids: string[],
): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      return [id, !data?.user?.last_sign_in_at] as const;
    }),
  );
  return Object.fromEntries(entries);
}
```

`createSupabaseAdminClient` stays imported — both list queries still use it.

- [ ] **Step 3: Make `toTeamUser` single-argument**

Change line 24 from:

```ts
function toTeamUser(row: ProfileRow, invitePending: boolean): TeamUser {
```

to:

```ts
function toTeamUser(row: ProfileRow): TeamUser {
```

and delete the `invitePending,` entry from the returned object (line 40).

- [ ] **Step 4: Simplify both list queries**

In `listTeamUsers`, replace lines 82-83:

```ts
  const pending = await invitePendingFlags(admin, data.map((row) => row.id));
  return data.map((row) => toTeamUser(row, pending[row.id] ?? false));
```

with:

```ts
  return data.map(toTeamUser);
```

Apply the identical replacement to lines 102-103 in `listArchivedTeamUsers`.

This removes one `auth.admin.getUserById` round trip per roster row from both queries.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run test:unit`

Expected: all PASS. `typecheck` is the real test here — it is what proves no other consumer of `TeamUser` was reading `invitePending`.

Run: `git grep -n "invitePending" -- src tests`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/features/admin/queries/users.ts
git commit -m "feat: drop invitePending and its per-row getUserById lookup

The flag existed only to gate the Resend invite action. Removing it also
removes the N+1 auth lookup from both roster queries.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: SuperAdmin sets the password at creation

**Files:**
- Modify: `src/features/admin/actions/users.ts:18-38, 128-137`
- Modify: `src/features/admin/components/team-manager.tsx`

**Interfaces:**
- Consumes: Task 3's `createTeamUser` (no invite send).
- Produces: `TeamUserInput` gains `password: string`. `UpdateTeamUserInput` is unchanged — edit mode still cannot set a password.

Both halves are in one task deliberately: adding a required field to `TeamUserInput` breaks `team-manager.tsx`'s call at compile time, so splitting them would leave `typecheck` red between commits.

- [ ] **Step 1: Add `password` to the action's input type and schema**

In `src/features/admin/actions/users.ts`, add to `TeamUserInput` (after `email`):

```ts
  /** Chosen by the SuperAdmin and handed over out of band — no invite email. */
  password: string;
```

and to `teamUserSchema`, after the `email` line:

```ts
  password: z.string().min(10, "Password needs at least 10 characters."),
```

Leave `UpdateTeamUserInput` and `updateSchema` alone.

- [ ] **Step 2: Use it when creating the auth user**

Replace lines 131-137 — the stale comment from Task 3 step 6 and the `createUser` call:

```ts
  // A random, never-surfaced password: the account exists but cannot sign in
  // until the invite email's link is used to set a real one.
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
```

with:

```ts
  // The SuperAdmin's chosen password, handed to the new staff member out of
  // band. `email_confirm: true` skips Supabase's own address-verification
  // email, so account creation sends nothing at all; someone who loses this
  // password recovers through /admin/forgot-password like anyone else.
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
```

- [ ] **Step 3: Verify the action half fails typecheck at the call site**

Run: `npm run typecheck`

Expected: FAIL, one error in `src/features/admin/components/team-manager.tsx` — `createTeamUser` is called without `password`. This confirms the required field is actually required; step 4 fixes it.

- [ ] **Step 4: Add the password state and reset to TeamManager**

In `src/features/admin/components/team-manager.tsx`, add two state hooks after the `email` one (line 100):

```ts
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
```

In `openCreate()`, add after `setEmail("")`:

```ts
    setPassword("");
    setConfirmPassword("");
```

In `openEdit()`, add the same two lines after `setEmail(user.email)` — the fields are not rendered in edit mode, but leaving a typed password in state across an open/close/reopen cycle would carry it into the next create.

- [ ] **Step 5: Send it, and guard the confirm field client-side**

In `submit()`, add a guard at the top of the function body, before `startTransition`:

```ts
    if (drawer?.mode !== "edit" && password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
```

The copy matches `account-security-form.tsx:24` exactly. The confirm field is a typo guard, not a security boundary — the server keeps only the `.min(10)` rule, since a second copy of the same string proves nothing to a public HTTP endpoint.

Then add `password,` to the `createTeamUser({...})` call's object literal, after `email,`:

```ts
            : await createTeamUser({
                firstName,
                middleName,
                lastName,
                phone,
                email,
                password,
                statusLabel,
                permissions,
                isSuperAdmin,
              });
```

- [ ] **Step 6: Render the two fields, create mode only**

Add the two imports at the top of the file, beside the other `@/components/ui` imports:

```ts
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
```

In the drawer body, immediately after the Mobile number `</label>` (line 525) and before the `<fieldset>` for Status label, insert:

```tsx
            {drawer?.mode === "create" ? (
              <>
                <label className="text-sm font-semibold text-ink-700">
                  Password (min 10 characters)
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className={`mt-1 ${inputClass}`}
                  />
                  <PasswordStrength value={password} />
                  <span className="mt-1 block text-xs font-normal text-ink-500">
                    Give this to the new staff member yourself — no email is sent.
                  </span>
                </label>
                <label className="text-sm font-semibold text-ink-700">
                  Confirm password
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
              </>
            ) : null}
```

`PasswordInput` takes plain `React.InputHTMLAttributes<HTMLInputElement>` and supplies its own `type`, so pass `className` (it appends its own `pr-12` for the show/hide toggle) and no `type`. `PasswordStrength` takes a single `value: string` prop and is advisory only — it must not gate submit.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run lint && npm run test:unit`

Expected: all PASS.

- [ ] **Step 8: Verify in the running app**

Follow `.claude/skills/verify/SKILL.md`. Check the dev server is not already running before starting another.

1. Sign in as a SuperAdmin, go to `/admin/users`, click **Add user**.
2. Confirm the Password and Confirm password fields render, the show/hide eye toggle works, and the strength meter moves as you type.
3. Submit with mismatched passwords → inline `"Passwords do not match."`, no request sent.
4. Submit with a 9-character password → `"Password needs at least 10 characters."` from the server.
5. Submit a valid account. Confirm the toast reads "User created." and the row appears with **no** "Invite pending" badge.
6. Open the row's kebab menu → confirm there is no "Resend invite" entry.
7. Sign out, sign in as the new account with the password you typed. It must work on the first attempt with no reset step.
8. Open the drawer on an existing user via **Edit user** → confirm no password fields appear.

- [ ] **Step 9: Commit**

```bash
git add src/features/admin/actions/users.ts src/features/admin/components/team-manager.tsx
git commit -m "feat: SuperAdmin sets the account password at creation

createTeamUser takes a password (min 10, same floor as resetPassword and
changeMyPassword) instead of generating a throwaway one. The create drawer
gains Password + Confirm fields; edit mode is unchanged and still cannot
set another user's password. Recovery stays /admin/forgot-password.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (three bullets)

**Interfaces:**
- Consumes: all of Tasks 1-5.
- Produces: nothing code-facing.

`CLAUDE.md` already has uncommitted changes from the hero session on this branch. **Stage only `CLAUDE.md` and expect the diff to include those** — do not revert them, and do not use `git add -A`.

This task is mandatory, not optional: the repo's standing rule is that a session changing code updates `CLAUDE.md` in the same session.

- [ ] **Step 1: Correct the Resend email bullets**

Find the **"Transactional email (Resend), Plan 1 of 3"** bullet and its Plan 2 continuation. Add a dated correction stating that as of 2026-08-06 the three staff-directed sends (`InquiryStaffNotifyEmail`, `FeedbackStaffNotifyEmail`, `TicketReplyStaffNotifyEmail`) and `staffEmailsFor()`/`staffQualifies()` are removed; `submitInquiry` now sends only the resident acknowledgment and no longer sets `replyTo`; `submitFeedback` emails nobody; every resident-facing send and `PasswordResetEmail` are unchanged. Note that staff now learn of new work only through the in-portal bell and count badges, and that this was a deliberate request, not an oversight.

Follow the file's existing convention: correct the claim in place with a dated note rather than deleting the history of what shipped.

- [ ] **Step 2: Correct the invite bullet**

Find the **"Admin account creation is invite-based, not password-based, 2026-08-01"** bullet. It is now false end to end. Rewrite it to record that the invite approach was reversed on 2026-08-06: `createTeamUser` takes a SuperAdmin-chosen password again (`.min(10)`, matching `resetPassword`/`changeMyPassword`), `email_confirm: true` still suppresses Supabase's own verification mail, and `sendAccountInvite`/`resendTeamUserInvite`/`AccountInviteEmail`/`TeamUser.invitePending`/`invitePendingFlags` are all deleted — including the N+1 `getUserById` that bullet had accepted. Keep the parts that are still true: migration `0031`'s split name columns, `buildFullName`, the phone capture, and the accepted `full_name` drift from Settings → Profile. Note that the recovery-link mechanism itself survives untouched for `/admin/forgot-password`.

- [ ] **Step 3: Correct the ticket-timeline bullet**

Find the **"Progressive ticket timeline, `awaiting-info`, and resident replies, 2026-08-02"** bullet. Two claims need fixing: the `replied_at` rationale says staff would otherwise learn of a reply "only from an email, the channel most likely to be missed" — with that email gone, `replied_at` and its "New reply" pill are now the *only* signal, which strengthens rather than weakens the reason for the column. Also correct the `submitTicketReply` note that says its own timeline entry "emails **staff**" — it no longer emails anyone, so the reason it never calls `markTicketUpdateNotified` is now simply that no resident email is attempted.

- [ ] **Step 4: Verify the claims you wrote are true**

Run: `git grep -n "staffEmailsFor\|staffQualifies\|AccountInviteEmail\|invitePending\|resendTeamUserInvite\|InquiryStaffNotifyEmail\|FeedbackStaffNotifyEmail\|TicketReplyStaffNotifyEmail" -- src tests`

Expected: no output. If anything matches, the bullet you just wrote is wrong — fix the code, not the doc.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the staff-email removal and password-at-creation reversal

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Final verification

After Task 6, from a clean state:

- [ ] `npm run typecheck` — PASS
- [ ] `npm run lint` — PASS
- [ ] `npm run test:unit` — PASS, six fewer tests than the pre-branch baseline
- [ ] `npm run build` — PASS (nothing here is build-sensitive, but the drawer change touches a client component)
- [ ] `npm run test:e2e -- --project=public` — PASS. No public suite asserts on staff email. **Mind the rate-limit windows** documented in `CLAUDE.md`'s Commands section: `feedback.spec.ts` spends all 3 of `SUBMIT_LIMIT` per run, so a second run within the hour can fail on the limiter rather than on a regression.
- [ ] The manual browser check from Task 5 step 8 passed.

Not run as part of this plan: `--project=admin`, which needs `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` and whose `login.spec.ts` and `ticket-updates.spec.ts` have their own 5-minute and 1-hour rate-limit windows. Nothing in this plan touches the code those suites exercise.
