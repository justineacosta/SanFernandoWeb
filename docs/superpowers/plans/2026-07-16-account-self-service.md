# Account Self-Service & User-Management Revisions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every signed-in admin user edit their own profile (name, phone) and password; add password eye-toggles; block SuperAdmin self-demotion; let SuperAdmins edit other users' emails while no one edits their own.

**Architecture:** New `phone` column on `profiles`; self-service Server Actions in `actions/account.ts` (own row only, via admin client scoped to the session id; password verified by re-auth on the cookie client); revisions to `updateTeamUser`; new client form components; a shared `PasswordInput`. Settings page opens to all signed-in users with Manage Users gated to SuperAdmins.

**Tech Stack:** Next.js 16 App Router, React 19 (`useTransition`), TS strict, Supabase (`@supabase/ssr`, admin API), Zod v4, Tailwind v4 tokens, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-16-account-self-service-design.md`. Builds on the completed auth foundation (`docs/superpowers/plans/2026-07-15-auth-foundation.md`), same branch `feature/auth-foundation`.

## Global Constraints

- **No test framework** (CLAUDE.md). Per-task verification = `npm run typecheck` + `npm run lint` + `npm run build`. Runtime drive happens in the final task against the live Supabase staging project.
- TypeScript strict; path alias `@/*` → `src/*`; shared shapes in `src/types/index.ts`.
- Design tokens only (`brand-*`, `ink-*`, `danger*`); Space Grotesk = `font-display`; no raw hex, no blue tokens.
- Identity: "San Fernando", "Municipal", area code (077); any "Sampaguita" is a regression.
- Server Components by default; `"use client"` only for interactive islands. Server Actions validate with Zod and enforce auth server-side.
- Exact strings: self-demotion rejection = `"You cannot remove your own SuperAdmin status — another SuperAdmin must do it."`; duplicate-email rejection = `"That email is already in use."`; wrong current password = `"Current password is incorrect."`. Password minimum = 10 characters.
- Email is never editable on one's own account (any surface). Phone column is nullable.
- Existing primitives: `Drawer`, `Toast`, `Button` (variants `primary`/`ghost`/`outline`), `Field`/`Input`/`Select` from `@/components/ui/form`, `requireSessionUser`/`requireSuperAdmin` from `@/lib/auth`, `recordActivity` from `@/lib/audit`, `createSupabaseServerClient`/`createSupabaseAdminClient`.
- Commit after every task. Never commit `.env.local`.

---

### Task 1: Migration 0003, phone on types + session + team query

**Files:**
- Create: `supabase/migrations/0003_profiles_phone.sql`
- Modify: `src/types/index.ts` (add `phone` to `SessionUser`/`TeamUser`; add `UpdateMyProfileValues`, `ChangePasswordValues`)
- Modify: `src/lib/auth.ts` (`getSessionUser` select + map)
- Modify: `src/features/admin/queries/users.ts` (`listTeamUsers` select + map)

**Interfaces:**
- Produces: `phone: string | null` on `SessionUser` and `TeamUser`; `UpdateMyProfileValues`, `ChangePasswordValues` types. Later tasks read `currentUser.phone` and these value shapes.

- [ ] **Step 1: Create `supabase/migrations/0003_profiles_phone.sql`**

```sql
-- Cellphone number for staff self-service profile editing.
alter table public.profiles add column phone text;
```

- [ ] **Step 2: Add `phone` to `SessionUser` and `TeamUser` in `src/types/index.ts`**

In the auth/permissions block, add `phone: string | null;` to both interfaces. `SessionUser` gains it after `permissions`; `TeamUser` inherits via `extends SessionUser` (no separate edit needed if it extends — verify; if `TeamUser` re-declares fields, add there too). Then append the two value types near the other `*Values` contracts:

```ts
/** Self-service profile edit (own row). */
export interface UpdateMyProfileValues {
  fullName: string;
  phone: string;
}

/** Self-service password change. */
export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
}
```

- [ ] **Step 3: `getSessionUser` maps phone** — in `src/lib/auth.ts`, add `phone` to the `.select(...)` column list and `phone: profile.phone` to the returned object.

- [ ] **Step 4: `listTeamUsers` maps phone** — in `src/features/admin/queries/users.ts`, add `phone` to the `.select(...)` list and `phone: row.phone` to each mapped row.

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck` — expected clean (any consumer of `SessionUser` now compiles with the added field; if a mock object literal breaks, that's Task 7's file — leave it, it's rewritten there; if typecheck fails ONLY in `settings-panel.tsx`, note it and proceed, Task 7 fixes it). Run `npm run lint`.

```bash
git add supabase/migrations/0003_profiles_phone.sql src/types/index.ts src/lib/auth.ts src/features/admin/queries/users.ts
git commit -m "feat(auth): phone column on profiles + session/team plumbing"
```

(Note: `settings-panel.tsx` currently supplies no `phone` to any `SessionUser` literal — it reads `currentUser`, so it should still compile. If typecheck surfaces an error elsewhere from the new required field, report it.)

---

### Task 2: Self-service account actions

**Files:**
- Create: `src/features/admin/actions/account.ts`

**Interfaces:**
- Consumes: `requireSessionUser`, `recordActivity`, `createSupabaseServerClient`, `createSupabaseAdminClient`, `UpdateMyProfileValues`, `ChangePasswordValues`.
- Produces: `updateMyProfile(input: UpdateMyProfileValues): Promise<ActionResult>`, `changeMyPassword(input: ChangePasswordValues): Promise<ActionResult>`, `interface ActionResult { error: string | null }`.

- [ ] **Step 1: Create `src/features/admin/actions/account.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ChangePasswordValues, UpdateMyProfileValues } from "@/types";
import { requireSessionUser } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short."),
  phone: z.string().trim().max(30, "Phone number is too long."),
});

/** Update the caller's own name + phone. Never accepts an id or email. */
export async function updateMyProfile(input: UpdateMyProfileValues): Promise<ActionResult> {
  const user = await requireSessionUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ? parsed.data.phone : null,
    })
    .eq("id", user.id);
  if (error) return { error: "Could not save your profile." };

  await recordActivity(user, "updated own profile", "profile", user.id);
  revalidatePath("/admin/settings");
  return { error: null };
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(10, "New password needs at least 10 characters."),
});

/** Change the caller's own password after verifying the current one. */
export async function changeMyPassword(input: ChangePasswordValues): Promise<ActionResult> {
  const user = await requireSessionUser();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const supabase = await createSupabaseServerClient();
  // Re-authenticate with the current password to confirm identity before changing it.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    return { error: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    return { error: "Could not update your password." };
  }

  await recordActivity(user, "changed own password", "account", user.id);
  return { error: null };
}
```

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck` && `npm run lint` — expected clean.

```bash
git add src/features/admin/actions/account.ts
git commit -m "feat(admin): self-service profile + password server actions"
```

---

### Task 3: Email editing for others + self-demotion guard in updateTeamUser

**Files:**
- Modify: `src/features/admin/actions/users.ts`

**Interfaces:**
- Changes `updateTeamUser`'s signature from `Omit<TeamUserInput, "email" | "password">` to a new `UpdateTeamUserInput` with an optional `email`. Task 6 (team-manager) passes `email` only when editing another user.
- Produces: exported `interface UpdateTeamUserInput { fullName: string; statusLabel: StaffStatusLabel; permissions: Permission[]; isSuperAdmin: boolean; email?: string }`.

- [ ] **Step 1: Replace the `updateSchema` definition and `updateTeamUser`** in `src/features/admin/actions/users.ts`.

Add the exported input type near `TeamUserInput`:

```ts
export interface UpdateTeamUserInput {
  fullName: string;
  statusLabel: StaffStatusLabel;
  permissions: Permission[];
  isSuperAdmin: boolean;
  /** Only honored when editing another user; ignored on the actor's own row. */
  email?: string;
}
```

Replace the existing `const updateSchema = teamUserSchema.omit({ email: true, password: true });` with:

```ts
const updateSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short."),
  statusLabel: z.enum(["staff", "editor"]),
  permissions: z.array(z.enum(PERMISSIONS)),
  isSuperAdmin: z.boolean(),
  email: z.string().email("Enter a valid email.").optional(),
});
```

Replace the whole `updateTeamUser` function body with:

```ts
export async function updateTeamUser(
  id: string,
  input: UpdateTeamUserInput,
): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const isSelf = id === actor.id;
  // A SuperAdmin cannot strip their own SuperAdmin status — another must do it.
  if (isSelf && !parsed.data.isSuperAdmin) {
    return {
      error: "You cannot remove your own SuperAdmin status — another SuperAdmin must do it.",
    };
  }
  if (!parsed.data.isSuperAdmin && (await wouldOrphanSuperAdmin(id))) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();

  // Email is editable only for OTHER users. Change auth first so a duplicate
  // is rejected before we touch the profile row.
  const changingEmail = !isSelf && parsed.data.email !== undefined;
  if (changingEmail) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, {
      email: parsed.data.email!,
    });
    if (authError) {
      return { error: "That email is already in use." };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      status_label: parsed.data.statusLabel,
      permissions: parsed.data.permissions,
      is_superadmin: parsed.data.isSuperAdmin,
      ...(changingEmail ? { email: parsed.data.email } : {}),
    })
    .eq("id", id);
  if (error) return { error: "Could not save the changes." };

  await recordActivity(actor, "updated user", "team-user", id, parsed.data.fullName);
  revalidatePath("/admin/settings");
  return { error: null };
}
```

Leave `createTeamUser`, `setTeamUserActive`, `archiveTeamUser`, `deleteTeamUser`, `teamUserSchema`, and the guard helpers unchanged. Keep `TeamUserInput` (still used by `createTeamUser`).

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck` — this will fail in `team-manager.tsx` if it passes the old shape; that's fixed in Task 6. Confirm the ONLY typecheck error (if any) is `team-manager.tsx`'s call to `updateTeamUser` — if so, proceed; if errors appear elsewhere, stop and report. Run `npm run lint` on `users.ts`.

```bash
git add src/features/admin/actions/users.ts
git commit -m "feat(admin): superadmin edits others' email; block self-demotion"
```

(If typecheck blocks the commit workflow, it is acceptable to commit here with the known `team-manager.tsx` break that Task 6 immediately resolves — note it in the report. Do not `git commit` with `--no-verify`; there is no pre-commit hook in this repo, so a red typecheck does not block `git commit` itself.)

---

### Task 4: Shared PasswordInput + login eye toggle

**Files:**
- Modify: `src/components/ui/form.tsx` (export `fieldClasses`)
- Create: `src/components/ui/password-input.tsx`
- Modify: `src/features/admin/components/login-form.tsx`

**Interfaces:**
- Produces: `PasswordInput` — a client input that toggles `type` between `password`/`text` via an eye button; accepts all native input props plus `className` (appended to the caller's base). Task 5 reuses it.

- [ ] **Step 1: Export the field classes** — in `src/components/ui/form.tsx`, change `const fieldClasses =` to `export const fieldClasses =`. No other change.

- [ ] **Step 2: Create `src/components/ui/password-input.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide toggle. The caller supplies the base input
 * className (so it matches the surrounding form); this adds right padding for
 * the button and the toggle itself.
 */
export function PasswordInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={cn(className, "pr-12")} />
      <button
        type="button"
        onClick={() => setShow((value) => !value)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-500 transition-colors hover:text-ink-800"
      >
        {show ? (
          <EyeOff className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Eye className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Use it in `src/features/admin/components/login-form.tsx`** — replace the password `<input>` element with `PasswordInput`, keeping the exact same `id`, `name`, `autoComplete`, `required`, and `className` props it already has. Add `import { PasswordInput } from "@/components/ui/password-input";`. The email input is unchanged.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck` && `npm run lint` && `npm run build` — expected clean (Task 3's `team-manager` break is still open; if the build fails only there, note it — Task 6 is next. If you want a green build here, this task may be committed with that single known break.)
Browser (optional, dev server): `/admin/login` password field shows an eye button that flips the field between dots and text.

```bash
git add src/components/ui/form.tsx src/components/ui/password-input.tsx src/features/admin/components/login-form.tsx
git commit -m "feat(auth): shared PasswordInput with eye toggle; login password toggle"
```

---

### Task 5: Account Profile + Account Security forms

**Files:**
- Create: `src/features/admin/components/account-profile-form.tsx`
- Create: `src/features/admin/components/account-security-form.tsx`

**Interfaces:**
- Consumes: `updateMyProfile`/`changeMyPassword` (Task 2), `PasswordInput` (Task 4), `fieldClasses` (Task 4), `Field`/`Input`/`Button`/`Toast`, `SessionUser`.
- Produces: `AccountProfileForm({ currentUser }: { currentUser: SessionUser })`, `AccountSecurityForm()` — both client components Task 7 mounts.

- [ ] **Step 1: Create `src/features/admin/components/account-profile-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import type { SessionUser } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Toast } from "@/components/ui/toast";
import { updateMyProfile } from "@/features/admin/actions/account";

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function AccountProfileForm({ currentUser }: { currentUser: SessionUser }) {
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [phone, setPhone] = useState(currentUser.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateMyProfile({ fullName, phone });
      if (result.error) {
        setError(result.error);
        return;
      }
      setToast("Profile saved.");
    });
  }

  return (
    <>
      <div className="flex flex-col gap-6 border-t border-ink-200/70 pt-6 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-500 text-2xl font-bold text-white ring-2 ring-brand-400"
          >
            {initialsOf(currentUser.fullName) || "?"}
          </span>
          <span className="text-xs text-ink-500">Photo upload coming soon</span>
        </div>
        <form onSubmit={submit} noValidate className="flex-1 space-y-4">
          <Field label="Full Name" htmlFor="account-name">
            <Input
              id="account-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email Address" htmlFor="account-email">
              <Input id="account-email" type="email" value={currentUser.email} disabled readOnly />
              <p className="text-xs text-ink-500">Contact a SuperAdmin to change your email.</p>
            </Field>
            <Field label="Contact Number" htmlFor="account-phone">
              <Input
                id="account-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(077) 000-0000"
              />
            </Field>
          </div>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save Profile"}
            </Button>
          </div>
        </form>
      </div>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
```

- [ ] **Step 2: Create `src/features/admin/components/account-security-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldClasses } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { Toast } from "@/components/ui/toast";
import { changeMyPassword } from "@/features/admin/actions/account";

export function AccountSecurityForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await changeMyPassword({ currentPassword: current, newPassword: next });
      if (result.error) {
        setError(result.error);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setToast("Password updated.");
    });
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-4 border-t border-ink-200/70 pt-6">
        <Field label="Current Password" htmlFor="account-current-password">
          <PasswordInput
            id="account-current-password"
            autoComplete="current-password"
            className={fieldClasses}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New Password (min 10 characters)" htmlFor="account-new-password">
            <PasswordInput
              id="account-new-password"
              autoComplete="new-password"
              className={fieldClasses}
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </Field>
          <Field label="Confirm New Password" htmlFor="account-confirm-password">
            <PasswordInput
              id="account-confirm-password"
              autoComplete="new-password"
              className={fieldClasses}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end">
          <Button variant="outline" type="submit" disabled={isPending}>
            {isPending ? "Updating…" : "Update Password"}
          </Button>
        </div>
      </form>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
```

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` && `npm run lint` — expected clean for these two files (the `team-manager` break from Task 3 may still show; confirm no NEW errors originate in the two new files).

```bash
git add src/features/admin/components/account-profile-form.tsx src/features/admin/components/account-security-form.tsx
git commit -m "feat(admin): account profile + security self-service forms"
```

---

### Task 6: Team-manager — rename, lock own SuperAdmin, edit others' email

**Files:**
- Modify: `src/features/admin/components/team-manager.tsx`

**Interfaces:**
- Consumes: the new `updateTeamUser(id, UpdateTeamUserInput)` signature (Task 3).

- [ ] **Step 1: Rename the heading** — change `<h3 ...>Team</h3>` (around line 119) to `<h3 ...>Manage Users</h3>`.

- [ ] **Step 2: Compute an editing-self flag** — inside the component, after the state declarations, add:

```tsx
const editingSelf = drawer?.mode === "edit" && drawer.user?.id === currentUser.id;
```

- [ ] **Step 3: Pass email when editing another user** — in `submit()`, change the edit branch call to:

```tsx
? await updateTeamUser(drawer.user.id, {
    fullName,
    statusLabel,
    permissions,
    isSuperAdmin,
    ...(drawer.user.id !== currentUser.id ? { email } : {}),
  })
```

(The `email` state is already declared and is populated by `openEdit`, which sets `setEmail(user.email)`.)

- [ ] **Step 4: Show the email field in edit mode, read-only on own row.** Currently email + password only render in `create` mode. Restructure so:
  - Password stays create-only.
  - Email renders in BOTH modes, but in edit mode is disabled on the own row.

Replace the `{drawer?.mode === "create" ? ( <> …email…password… </> ) : null}` block with:

```tsx
<label className="text-sm font-semibold text-ink-700">
  Email
  <input
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    disabled={editingSelf}
    className={`mt-1 ${inputClass} ${editingSelf ? "cursor-not-allowed opacity-60" : ""}`}
  />
  {editingSelf ? (
    <span className="mt-1 block text-xs font-normal text-ink-500">
      You cannot change your own email.
    </span>
  ) : null}
</label>
{drawer?.mode === "create" ? (
  <label className="text-sm font-semibold text-ink-700">
    Temporary password (min 10 characters)
    <input
      type="password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      className={`mt-1 ${inputClass}`}
    />
  </label>
) : null}
```

- [ ] **Step 5: Lock the SuperAdmin checkbox on own row.** Change the SuperAdmin checkbox `<input>` to add `disabled={editingSelf}` and append a note:

```tsx
<label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
  <input
    type="checkbox"
    checked={isSuperAdmin}
    disabled={editingSelf}
    onChange={(e) => setIsSuperAdmin(e.target.checked)}
    className="h-4 w-4 accent-brand-500 disabled:opacity-50"
  />
  SuperAdmin (full power, manages users — ignores the checkboxes below)
</label>
{editingSelf ? (
  <p className="text-xs text-ink-500">
    You cannot change your own SuperAdmin status.
  </p>
) : null}
```

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck` && `npm run lint` && `npm run build` — expected fully clean now (Task 3's break is resolved by the new call shape).

```bash
git add src/features/admin/components/team-manager.tsx
git commit -m "feat(admin): Manage Users rename, self-row email/superadmin locks"
```

---

### Task 7: Settings page opens to all; Manage Users gated; wire new cards

**Files:**
- Modify: `src/app/admin/(portal)/settings/page.tsx`
- Modify: `src/features/admin/components/settings-panel.tsx`

**Interfaces:**
- Consumes: `requireSessionUser`, `listTeamUsers`, `AccountProfileForm`, `AccountSecurityForm`, `TeamManager`.

- [ ] **Step 1: `settings/page.tsx` — open to all signed-in users, fetch team only for SuperAdmins.**

```tsx
import { requireSessionUser } from "@/lib/auth";
import { listTeamUsers } from "@/features/admin/queries/users";
import { SettingsPanel } from "@/features/admin/components/settings-panel";

export default async function AdminSettingsPage() {
  const currentUser = await requireSessionUser();
  const team = currentUser.isSuperAdmin ? await listTeamUsers() : [];
  return <SettingsPanel team={team} currentUser={currentUser} />;
}
```

(Keep any existing `metadata` export in that file.)

- [ ] **Step 2: Rework `settings-panel.tsx`.** Replace the mock Profile Information card body and the mock password form with the new components, drop the mock 2FA block, and gate Manage Users. Concretely:
  - Add imports: `import { AccountProfileForm } from "./account-profile-form";` and `import { AccountSecurityForm } from "./account-security-form";`.
  - Remove the now-unused profile/password state and handlers: `profile`, `profileErrors`, `savingProfile`, `handleProfileSubmit`, `passwords`, `passwordError`, `savingPassword`, `handlePasswordSubmit`, `twoFactor`, `initialsOf`, `PLACEHOLDER_PHONE`, `SAVE_TOAST`. Also remove the panel-level `toast` state and its `{toast ? <Toast … /> : null}` render at the bottom — nothing in the panel triggers it once profile/password/photo move out (the two new form components own their own toasts); leaving it would be an unused-variable lint error.
  - Remove imports that become unused: `ShieldCheck`, `Field`, `Input`, `Toast`, and `useState` **only if** no remaining state uses it (Preferences still uses `useState` for `language`/`prefs`, so KEEP `useState`). KEEP `Select`, `Card`, `ToggleSwitch` — the Preferences card still uses them (`Select` for language, `ToggleSwitch` for the notification toggles).
  - Profile Information card body becomes: heading + description (keep) then `<AccountProfileForm currentUser={currentUser} />`.
  - Account Security card body becomes: heading + description (keep) then `<AccountSecurityForm />`. Delete the 2FA sub-block entirely.
  - The Manage Users card: wrap in a SuperAdmin check —
    ```tsx
    {currentUser.isSuperAdmin ? (
      <Card className="p-6">
        <TeamManager team={team} currentUser={currentUser} />
      </Card>
    ) : null}
    ```
  - The component's own `toast` state now only serves Preferences (mock). Leave it; the two new forms own their own toasts.

  Read the current file first and make these edits surgically — do not rewrite the Preferences card or the layout grid. If removing `initialsOf` leaves the profile avatar to `AccountProfileForm` (it does — the avatar moved into that component), ensure no duplicate avatar remains in the panel.

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` && `npm run lint` && `npm run build` — expected clean; `/admin/settings` stays a route (now `requireSessionUser`).

```bash
git add "src/app/admin/(portal)/settings/page.tsx" src/features/admin/components/settings-panel.tsx
git commit -m "feat(admin): settings open to all users; Manage Users gated to SuperAdmin"
```

---

### Task 8: Apply migration + runtime verification sweep

**Files:** none new — verification only.

- [ ] **Step 1 (HUMAN, coordinated by controller): apply migration 0003.** Run in the Supabase SQL editor (staging):

```sql
alter table public.profiles add column phone text;
```

Expected: "Success. No rows returned." (The controller confirms via a REST read that `phone` is selectable before driving the sweep.)

- [ ] **Step 2: Full gate.** Run `npm run typecheck` && `npm run lint` && `npm run build` — all clean; confirm every PUBLIC route still prerenders static (`○`) and only `/admin/*` are dynamic.

- [ ] **Step 3: Runtime drive** (controller uses the playwright-core recipe against the live project, creating temporary test users via the admin API and cleaning them up after). Verify:
  1. A non-SuperAdmin (temp editor) reaches `/admin/settings` and sees My Profile + Account Security but NOT Manage Users.
  2. My Profile: change name + phone → "Profile saved." → reload shows persisted values (DB read confirms `phone`).
  3. Account Security: wrong current password → "Current password is incorrect."; mismatch confirm → "Passwords do not match."; correct current + valid new (≥10) → "Password updated."; the temp user can then log in with the new password.
  4. Eye toggles on the login page and all three security fields flip the field between hidden/visible.
  5. SuperAdmin editing their own row: SuperAdmin checkbox disabled, email field read-only; unticking is impossible in UI, and a forced `updateTeamUser(self, {isSuperAdmin:false})` returns the self-demotion message.
  6. SuperAdmin editing another user: can change their email; a duplicate email returns "That email is already in use."
  7. Public site unaffected (`/`, `/services`).

- [ ] **Step 4: Update handoff doc + commit.** Append to the changelog block at the top of `docs/BACKEND_HANDOFF.md` a short note: settings now self-service (profile name/phone + password with eye toggles), `profiles.phone` added (migration 0003), SuperAdmin self-demotion blocked, SuperAdmins edit others' emails; photo upload still deferred to the media plan.

```bash
git add docs/BACKEND_HANDOFF.md
git commit -m "docs: record account self-service revisions in backend handoff"
```

---

## Self-review notes

- **Spec coverage:** settings open-to-all + Manage Users gated ✅ (T7); rename ✅ (T6); self-demotion UI+server ✅ (T3/T6); email rules (others-only, own read-only, unique) ✅ (T3/T6); self-service profile name+phone ✅ (T2/T5); password change with current-password verify + min 10 ✅ (T2/T5); eye toggles login + security ✅ (T4/T5); phone column ✅ (T1); photo deferred ✅ (T5 shows "coming soon"). 
- **Type consistency:** `UpdateTeamUserInput` (T3) matches the team-manager call (T6); `UpdateMyProfileValues`/`ChangePasswordValues` (T1) match `account.ts` (T2) and the forms (T5); `phone` added in T1 is read in T5/T7.
- **Ordering risk:** Task 3 transiently breaks `team-manager.tsx` typecheck until Task 6; called out in both tasks. No pre-commit hook exists, so commits still succeed; the build is green again after Task 6.
- **Security:** `updateMyProfile` scopes to `user.id` and never accepts an id/email; `changeMyPassword` re-authenticates before changing; `updateTeamUser` keeps `requireSuperAdmin` first and only allows email change for non-self.
