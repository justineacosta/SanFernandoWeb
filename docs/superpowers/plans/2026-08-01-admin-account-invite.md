# Admin account creation via invite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `createTeamUser`'s SuperAdmin-chosen password with a "set your own
password" emailed link (reusing the existing forgot-password mechanism), and capture
split name parts + a required phone number on account creation.

**Architecture:** `profiles` gains `first_name`/`middle_name`/`last_name` (migration
`0031`), kept in sync with the existing `full_name` by a new pure helper. `createTeamUser`
creates the Supabase Auth user with an unguessable random password, then emails a
recovery-type link via the exact `generateLink` → own-URL → `verifyOtp` mechanism
`requestPasswordReset`/`resetPassword` already built and ship unchanged. A new
`resendTeamUserInvite` action and an "Invite pending" badge (inferred from
`auth.users.last_sign_in_at`, no new column) round out the admin-portal UI.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (Postgres +
Auth), Zod v4, Vitest, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-admin-account-invite-design.md` — every task
  below implements a section of it; consult it for the "why" behind any choice questioned
  during review.
- `zod` is v4, not v3 — `z.enum([...])`/`z.string().trim()` syntax as already used in
  `src/features/admin/actions/users.ts`.
- The service-role Supabase client (`createSupabaseAdminClient()`,
  `src/lib/supabase/admin.ts`) is untyped (no `Database` generic) — `.insert()`/`.update()`
  calls are not schema-checked at compile time, so code in this plan will typecheck even
  before migration `0031` is applied to any live database. Runtime behavior (dev server,
  Playwright) DOES require the migration applied to whichever Supabase project
  `.env.local` points at — flagged again at Task 7.
- Migrations are applied manually by the repo owner against live Supabase environments —
  never assume `0031` is applied; nothing in this plan runs it automatically.
- New helper functions taking the service-role client as a parameter are typed
  `admin: ReturnType<typeof createSupabaseAdminClient>` (see `src/features/admin/actions/news.ts`,
  `announcements.ts`, `legislative.ts`, `officials.ts` for the existing pattern) — never a
  hand-written interface.
- Random tokens/ids use the global `crypto.randomUUID()` (no import — already used this way
  in `src/lib/media.ts`, `src/lib/storage.ts`, `src/app/api/admin/uploads/document/route.ts`).
- Every `startTransition(async () => {...})` block wraps its action call in
  `try { ... } catch { showError(...) / setFormError(...) }` — the whole-portal convention
  from the 2026-07-28 security-hardening pass. New code must follow it, not the old
  bare-`try/finally` shape.
- Per `CLAUDE.md`'s standing rule, this plan's final task updates `CLAUDE.md` in the same
  session — not deferred.

---

## File Structure

- **Create** `supabase/migrations/0031_profile_name_parts.sql` — new columns + backfill.
- **Modify** `supabase/baseline/0000_baseline_2026-07-23.sql` — same columns added to the
  `profiles` table definition, per the README's "fold into baseline in the same commit" rule.
- **Create** `src/features/admin/lib/build-full-name.ts` — pure name-joining helper.
- **Create** `tests/unit/build-full-name.test.ts` — its Vitest coverage.
- **Modify** `src/types/index.ts` — `TeamUser` gains `firstName`/`middleName`/`lastName`/`invitePending`.
- **Modify** `src/features/admin/queries/users.ts` — read the new columns, compute `invitePending`.
- **Create** `src/emails/AccountInviteEmail.tsx` — new Resend template.
- **Create** `tests/unit/account-invite-email.test.ts` — its Vitest coverage.
- **Modify** `src/features/admin/actions/users.ts` — `createTeamUser`/`updateTeamUser` rewritten,
  new `resendTeamUserInvite` action, new `sendAccountInvite` helper.
- **Modify** `src/features/admin/components/team-manager.tsx` — form fields, badge, resend action.
- **Create** `tests/e2e/admin/users.spec.ts` — first e2e coverage for `/admin/users`.
- **Modify** `CLAUDE.md` — document the change (final task).

---

### Task 1: Migration `0031` + baseline update

**Files:**
- Create: `supabase/migrations/0031_profile_name_parts.sql`
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:1-4` (header), `:177-197` (profiles table)

**Interfaces:**
- Produces: `profiles.first_name text not null`, `profiles.middle_name text` (nullable),
  `profiles.last_name text not null` — consumed by every later task that reads/writes profiles.

No automated test exists for SQL migrations in this project (applied manually by the repo
owner against live Supabase — see `CLAUDE.md`'s Architecture section). Verification here is
a careful read-back, not a test run.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0031_profile_name_parts.sql`:

```sql
-- Split full_name into first/middle/last for the admin account-creation form.
-- full_name stays a plain (non-generated) column — src/features/admin/lib/
-- build-full-name.ts keeps it in sync on every SuperAdmin-driven write. See
-- docs/superpowers/specs/2026-08-01-admin-account-invite-design.md.

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

comment on column public.profiles.first_name is 'Given name, captured on account creation.';
comment on column public.profiles.middle_name is 'Optional middle name.';
comment on column public.profiles.last_name is 'Surname, captured on account creation.';
```

- [ ] **Step 2: Update the baseline's header comment**

In `supabase/baseline/0000_baseline_2026-07-23.sql`, line 3, change:

```sql
-- Squash of migrations 0001–0030, as of 2026-07-23.
```

to:

```sql
-- Squash of migrations 0001–0031, as of 2026-07-23 (0031 folded in after the fact —
-- see supabase/migrations/README.md).
```

Also update line 17 (`NOT for an environment that already has any of 0001–0030 applied.`)
to say `0001–0031`, and line 31's section header
(`HOW IT DIFFERS FROM RUNNING 0001–0030 IN SEQUENCE`) to say `0001–0031`.

- [ ] **Step 3: Add the columns to the baseline's `profiles` table**

In `supabase/baseline/0000_baseline_2026-07-23.sql`, find the `create table public.profiles`
block (around line 177):

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  status_label text not null default 'staff'
    check (status_label in ('staff', 'editor')),
  is_superadmin boolean not null default false,
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cellphone, editable by the account owner in Settings.              [0003]
  phone text,
  -- Profile picture: avatars-media path, or null for initials.         [0025]
  avatar_src text,
  -- Bell "have I looked?" stamp. Null means never opened.              [0026]
  notifications_seen_at timestamptz,
  -- Staff email uniqueness enforced at the database layer.             [0002]
  constraint profiles_email_unique unique (email)
);
```

Replace with (adds three columns, each `not null` except `middle_name`, matching the
migration's final state — the baseline starts from an empty table so no backfill step is
needed here):

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  -- Split name parts, captured on account creation and kept in sync with
  -- full_name by buildFullName() on every SuperAdmin-driven write.      [0031]
  first_name text not null,
  middle_name text,
  last_name text not null,
  status_label text not null default 'staff'
    check (status_label in ('staff', 'editor')),
  is_superadmin boolean not null default false,
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cellphone, editable by the account owner in Settings.              [0003]
  phone text,
  -- Profile picture: avatars-media path, or null for initials.         [0025]
  avatar_src text,
  -- Bell "have I looked?" stamp. Null means never opened.              [0026]
  notifications_seen_at timestamptz,
  -- Staff email uniqueness enforced at the database layer.             [0002]
  constraint profiles_email_unique unique (email)
);
```

- [ ] **Step 4: Update the baseline's seed data (if any) to supply the new required columns**

Search the baseline file for `insert into public.profiles` — if the seed section (§13)
inserts any placeholder profile rows, add `first_name`/`last_name` values to each (a
`not null` column with no default will reject an insert that omits it). Run:

```bash
grep -n "insert into public.profiles" "supabase/baseline/0000_baseline_2026-07-23.sql"
```

If no matches, no change needed — most likely case, since profiles are normally created
through `createTeamUser`, not seeded.

- [ ] **Step 5: Read both files back in full to confirm they're internally consistent**

Re-read `supabase/migrations/0031_profile_name_parts.sql` and the edited region of
`supabase/baseline/0000_baseline_2026-07-23.sql` end to end. Confirm: column names match
exactly between the two files (`first_name`, `middle_name`, `last_name`); the baseline's
`profiles` table has no leftover reference to the old three-column-less shape; the header
comment edits from Step 2 landed on the right lines.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0031_profile_name_parts.sql supabase/baseline/0000_baseline_2026-07-23.sql
git commit -m "feat: split profiles.full_name into first/middle/last name columns"
```

---

### Task 2: `buildFullName` helper

**Files:**
- Create: `src/features/admin/lib/build-full-name.ts`
- Test: `tests/unit/build-full-name.test.ts`

**Interfaces:**
- Produces: `buildFullName(firstName: string, middleName: string, lastName: string): string`
  — consumed by Task 5's `createTeamUser`/`updateTeamUser`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/build-full-name.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFullName } from "@/features/admin/lib/build-full-name";

describe("buildFullName", () => {
  it("joins all three parts with single spaces", () => {
    expect(buildFullName("Juan", "Santos", "Dela Cruz")).toBe("Juan Santos Dela Cruz");
  });

  it("skips an empty middle name", () => {
    expect(buildFullName("Juan", "", "Dela Cruz")).toBe("Juan Dela Cruz");
  });

  it("trims whitespace from each part", () => {
    expect(buildFullName("  Juan  ", "  ", "  Dela Cruz  ")).toBe("Juan Dela Cruz");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- build-full-name`
Expected: FAIL — `Cannot find module '@/features/admin/lib/build-full-name'`

- [ ] **Step 3: Write the implementation**

Create `src/features/admin/lib/build-full-name.ts`:

```ts
/** Joins split name parts for display/storage. An empty part (no middle name) is skipped. */
export function buildFullName(firstName: string, middleName: string, lastName: string): string {
  return [firstName, middleName, lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- build-full-name`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/lib/build-full-name.ts tests/unit/build-full-name.test.ts
git commit -m "feat: add buildFullName helper for split-name profile writes"
```

---

### Task 3: Types + queries

**Files:**
- Modify: `src/types/index.ts:692-697` (`TeamUser` interface)
- Modify: `src/features/admin/queries/users.ts` (whole file)

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `TeamUser.firstName: string`, `TeamUser.middleName: string | null`,
  `TeamUser.lastName: string`, `TeamUser.invitePending: boolean` — consumed by Task 6
  (`team-manager.tsx`).

No automated test — this file is a Supabase-backed query, matching the existing
"queries aren't unit-tested" pattern in this codebase (verified via `npm run typecheck`
instead, in Task 8).

- [ ] **Step 1: Extend `TeamUser`**

In `src/types/index.ts`, replace:

```ts
/** A row in the team-management list (profiles table). */
export interface TeamUser extends SessionUser {
  isActive: boolean;
  isArchived: boolean;
  /** ISO timestamp. */
  createdAt: string;
}
```

with:

```ts
/** A row in the team-management list (profiles table). */
export interface TeamUser extends SessionUser {
  isActive: boolean;
  isArchived: boolean;
  /** ISO timestamp. */
  createdAt: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  /** True when the account has never signed in — the invite link is unredeemed. */
  invitePending: boolean;
}
```

- [ ] **Step 2: Rewrite `src/features/admin/queries/users.ts`**

Replace the whole file with:

```ts
import type { Permission, StaffStatusLabel, TeamUser } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const COLUMNS =
  "id, email, full_name, first_name, middle_name, last_name, status_label, is_superadmin, permissions, is_active, is_archived, created_at, phone, avatar_src";

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  status_label: string;
  is_superadmin: boolean;
  permissions: unknown;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  phone: string | null;
  avatar_src: string | null;
}

function toTeamUser(row: ProfileRow, invitePending: boolean): TeamUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    statusLabel: row.status_label as StaffStatusLabel,
    isSuperAdmin: row.is_superadmin,
    permissions: row.permissions as Permission[],
    isActive: row.is_active,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    phone: row.phone,
    avatarSrc: row.avatar_src,
    invitePending,
  };
}

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

/**
 * Both readers use the service-role client behind the caller's own
 * `isSuperAdmin` check, matching every other admin query in this folder.
 * `listTeamUsers` previously went through the anon client and leaned on an RLS
 * policy for its filtering — the one read in the portal that did.
 */

/** Non-archived team members for the settings panel, oldest first. */
export async function listTeamUsers(): Promise<TeamUser[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(COLUMNS)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });
  if (error || !data) {
    if (error) console.error("listTeamUsers failed:", error.message);
    return [];
  }
  const pending = await invitePendingFlags(admin, data.map((row) => row.id));
  return data.map((row) => toTeamUser(row, pending[row.id] ?? false));
}

/**
 * Archived team members, most recently created first. Kept out of
 * `listTeamUsers` so the main roster stays the list of people who work here;
 * the settings panel shows these behind a disclosure.
 */
export async function listArchivedTeamUsers(): Promise<TeamUser[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(COLUMNS)
    .eq("is_archived", true)
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listArchivedTeamUsers failed:", error.message);
    return [];
  }
  const pending = await invitePendingFlags(admin, data.map((row) => row.id));
  return data.map((row) => toTeamUser(row, pending[row.id] ?? false));
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors anywhere. `TeamUser` gained required fields, but the only place
that constructs a `TeamUser` value is `toTeamUser` in `queries/users.ts`, which Step 2
above already supplies them from — every other file only reads existing fields off values
it receives, which stays valid under structural typing when a type gains new fields.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/features/admin/queries/users.ts
git commit -m "feat: track split name parts and invite-pending status on TeamUser"
```

---

### Task 4: `AccountInviteEmail` template

**Files:**
- Create: `src/emails/AccountInviteEmail.tsx`
- Test: `tests/unit/account-invite-email.test.ts`

**Interfaces:**
- Produces: `AccountInviteEmail({ fullName: string, setPasswordUrl: string }): ReactElement`
  — consumed by Task 5's `sendAccountInvite` helper.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/account-invite-email.test.ts`:

```ts
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { AccountInviteEmail } from "@/emails/AccountInviteEmail";

describe("AccountInviteEmail", () => {
  it("includes the recipient's name and the set-password link", async () => {
    const html = await render(
      createElement(AccountInviteEmail, {
        fullName: "Juan Dela Cruz",
        setPasswordUrl: "https://example.com/admin/reset-password?token_hash=abc123",
      }),
    );

    expect(html).toContain("Juan Dela Cruz");
    expect(html).toContain("https://example.com/admin/reset-password?token_hash=abc123");
    expect(html).toContain("Set your password");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- account-invite-email`
Expected: FAIL — `Cannot find module '@/emails/AccountInviteEmail'`

- [ ] **Step 3: Write the implementation**

Create `src/emails/AccountInviteEmail.tsx`:

```tsx
import { Button, Text } from "react-email";
import { EmailLayout } from "./EmailLayout";

export interface AccountInviteEmailProps {
  fullName: string;
  setPasswordUrl: string;
}

/**
 * setPasswordUrl carries generateLink()'s recovery hashed_token — the exact
 * mechanism PasswordResetEmail uses, reused as-is here (see createTeamUser's
 * sendAccountInvite helper in src/features/admin/actions/users.ts). It is
 * already absolute, used as-is.
 */
export function AccountInviteEmail({ fullName, setPasswordUrl }: AccountInviteEmailProps) {
  return (
    <EmailLayout previewText="An admin portal account was created for you">
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>Hi {fullName},</Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>
        A Barangay San Fernando admin portal account was created for you. Click the button
        below to set your password and sign in. This link is valid for a short time and can
        only be used once.
      </Text>
      <Button
        href={setPasswordUrl}
        style={{
          backgroundColor: "#b45309",
          color: "#ffffff",
          padding: "10px 20px",
          borderRadius: 6,
          fontSize: 14,
          marginTop: 8,
        }}
      >
        Set your password
      </Button>
      <Text style={{ fontSize: 13, lineHeight: 1.5, margin: "16px 0 0", color: "#6b6255" }}>
        If you weren&apos;t expecting this, you can ignore this email — no one can access this
        account without setting a password through this link.
      </Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- account-invite-email`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/emails/AccountInviteEmail.tsx tests/unit/account-invite-email.test.ts
git commit -m "feat: add AccountInviteEmail template"
```

---

### Task 5: Server actions

**Files:**
- Modify: `src/features/admin/actions/users.ts` (whole file)

**Interfaces:**
- Consumes: `buildFullName` (Task 2, `@/features/admin/lib/build-full-name`),
  `AccountInviteEmail` (Task 4, `@/emails/AccountInviteEmail`), `sendEmail` (existing,
  `@/lib/email`), `EMAIL_SITE_URL` (existing, `@/emails/site-url`).
- Produces: `TeamUserInput` (no `password` field; adds `firstName`/`middleName`/`lastName`/
  `phone`), `UpdateTeamUserInput` (adds `firstName`/`middleName`/`lastName`, optional
  `phone`), `resendTeamUserInvite(id: string): Promise<ActionResult>` — all consumed by
  Task 6 (`team-manager.tsx`).

No automated test — this file has never had unit tests (Server Actions calling the
service-role Supabase client, matching this codebase's "Zod schemas aren't unit-tested
elsewhere" convention noted in the forgot-password spec). Verified via `npm run typecheck`
in Task 8 and the e2e test in Task 7.

- [ ] **Step 1: Rewrite `src/features/admin/actions/users.ts`**

Replace the whole file with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSIONS, type Permission, type StaffStatusLabel } from "@/types";
import { NOT_FOUND, checkSuperAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildFullName } from "@/features/admin/lib/build-full-name";
import { sendEmail } from "@/lib/email";
import { EMAIL_SITE_URL } from "@/emails/site-url";
import { AccountInviteEmail } from "@/emails/AccountInviteEmail";

export interface ActionResult {
  error: string | null;
}

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

const teamUserSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  middleName: z.string().trim(),
  lastName: z.string().trim().min(1, "Last name is required."),
  phone: z.string().trim().min(1, "Enter a mobile number.").max(30, "Phone number is too long."),
  email: z.string().email("Enter a valid email."),
  statusLabel: z.enum(["staff", "editor"]),
  permissions: z.array(z.enum(PERMISSIONS)),
  isSuperAdmin: z.boolean(),
});

export interface UpdateTeamUserInput {
  firstName: string;
  middleName: string; // "" means none
  lastName: string;
  statusLabel: StaffStatusLabel;
  permissions: Permission[];
  isSuperAdmin: boolean;
  /** Only honored when editing another user; ignored on the actor's own row. */
  email?: string;
  /** Only honored when editing another user; ignored on the actor's own row. */
  phone?: string;
}

const updateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  middleName: z.string().trim(),
  lastName: z.string().trim().min(1, "Last name is required."),
  statusLabel: z.enum(["staff", "editor"]),
  permissions: z.array(z.enum(PERMISSIONS)),
  isSuperAdmin: z.boolean(),
  email: z.string().email("Enter a valid email.").optional(),
  phone: z.string().trim().min(1, "Enter a mobile number.").max(30, "Phone number is too long.").optional(),
});

/** Active, non-archived SuperAdmins. The system must never drop below one. */
async function activeSuperAdminCount(): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_superadmin", true)
    .eq("is_active", true)
    .eq("is_archived", false);
  return count ?? 0;
}

/** True when removing this user's power would leave zero SuperAdmins. */
async function wouldOrphanSuperAdmin(id: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("is_superadmin, is_active, is_archived")
    .eq("id", id)
    .single();
  // Fail closed: if we cannot verify the target's role, block the mutation.
  if (error || !data) return true;
  const isActiveSuperAdmin =
    data.is_superadmin && data.is_active && !data.is_archived;
  if (!isActiveSuperAdmin) return false;
  return (await activeSuperAdminCount()) <= 1;
}

/**
 * Emails a "set your password" link using the exact mechanism
 * requestPasswordReset/resetPassword already built (src/features/admin/
 * actions/auth.ts): generateLink({type: "recovery"}) returns a hashed_token,
 * this app builds its own /admin/reset-password URL from it (never Supabase's
 * action_link), and the unchanged resetPassword action redeems it via
 * verifyOtp. Fails open, same as every sendEmail() call site in this app — an
 * email failure must never undo the account this is called after creating.
 */
async function sendAccountInvite(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  user: { email: string; fullName: string },
): Promise<void> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: user.email,
  });
  if (error || !data) return;
  const setPasswordUrl = `${EMAIL_SITE_URL}/admin/reset-password?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}`;
  await sendEmail({
    to: user.email,
    subject: "Welcome to the Barangay San Fernando admin portal",
    template: AccountInviteEmail({ fullName: user.fullName, setPasswordUrl }),
  });
}

export async function createTeamUser(input: TeamUserInput): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  const parsed = teamUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const admin = createSupabaseAdminClient();
  const fullName = buildFullName(parsed.data.firstName, parsed.data.middleName, parsed.data.lastName);

  // A random, never-surfaced password: the account exists but cannot sign in
  // until the invite email's link is used to set a real one.
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) {
    return { error: error?.message ?? "Could not create the account." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    email: parsed.data.email,
    first_name: parsed.data.firstName,
    middle_name: parsed.data.middleName || null,
    last_name: parsed.data.lastName,
    full_name: fullName,
    phone: parsed.data.phone,
    status_label: parsed.data.statusLabel,
    permissions: parsed.data.permissions,
    is_superadmin: parsed.data.isSuperAdmin,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Could not save the profile. The account was not created." };
  }

  await sendAccountInvite(admin, { email: parsed.data.email, fullName });

  await recordActivity(actor, {
    type: "create",
    action: "created user",
    entityType: "team-user",
    entityId: data.user.id,
    entityLabel: fullName,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

/** SuperAdmin-only, unrate-limited: same trust level as every other row action in TeamManager. */
export async function resendTeamUserInvite(id: string): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("email, full_name, is_archived")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };
  if (target.is_archived) return { error: "Restore this account before resending an invite." };

  await sendAccountInvite(admin, { email: target.email, fullName: target.full_name });

  await recordActivity(actor, {
    type: "update",
    action: "resent account invite",
    entityType: "team-user",
    entityId: id,
    entityLabel: target.full_name,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

export async function updateTeamUser(
  id: string,
  input: UpdateTeamUserInput,
): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
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
  const fullName = buildFullName(parsed.data.firstName, parsed.data.middleName, parsed.data.lastName);

  // Email is editable only for OTHER users, and only when it actually changes.
  // Look up the current email so we can skip a no-op auth write and roll back
  // the auth change if the profile write below fails (keeping the two in sync).
  // Read the prior grant so the audit entry can distinguish a permission or
  // SuperAdmin change (role_change) from an ordinary profile edit (update).
  // Who can do what is the highest-stakes thing this action can alter, and
  // burying it under a generic "updated user" would make it unfindable.
  const { data: prior } = await admin
    .from("profiles")
    .select("permissions, is_superadmin")
    .eq("id", id)
    .maybeSingle();
  const priorPermissions = [...((prior?.permissions as string[]) ?? [])].sort();
  const nextPermissions = [...parsed.data.permissions].sort();
  const roleChanged =
    prior !== null &&
    (prior.is_superadmin !== parsed.data.isSuperAdmin ||
      priorPermissions.join(",") !== nextPermissions.join(","));

  let changingEmail = false;
  let previousEmail: string | null = null;
  if (!isSelf && parsed.data.email !== undefined) {
    const { data: current } = await admin
      .from("profiles")
      .select("email")
      .eq("id", id)
      .single();
    if (current && parsed.data.email !== current.email) {
      changingEmail = true;
      previousEmail = current.email;
      const { error: authError } = await admin.auth.admin.updateUserById(id, {
        email: parsed.data.email,
      });
      if (authError) {
        return { error: "That email is already in use." };
      }
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      middle_name: parsed.data.middleName || null,
      last_name: parsed.data.lastName,
      full_name: fullName,
      status_label: parsed.data.statusLabel,
      permissions: parsed.data.permissions,
      is_superadmin: parsed.data.isSuperAdmin,
      ...(changingEmail ? { email: parsed.data.email } : {}),
      ...(!isSelf && parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
    })
    .eq("id", id);
  if (error) {
    // Roll back the auth email so it can't drift from profiles.email.
    if (changingEmail && previousEmail) {
      await admin.auth.admin.updateUserById(id, { email: previousEmail });
    }
    return { error: "Could not save the changes." };
  }

  await recordActivity(actor, {
    type: roleChanged ? "role_change" : "update",
    action: roleChanged ? "changed user permissions" : "updated user",
    entityType: "team-user",
    entityId: id,
    entityLabel: fullName,
    detail: roleChanged
      ? `${parsed.data.isSuperAdmin ? "SuperAdmin" : "Staff"} · ${
          nextPermissions.length > 0 ? nextPermissions.join(", ") : "no permissions"
        }`
      : undefined,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

export async function setTeamUserActive(id: string, isActive: boolean): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  if (id === actor.id) {
    return { error: "You cannot change your own account's active state." };
  }
  if (!isActive && (await wouldOrphanSuperAdmin(id))) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Could not update the account." };

  await recordActivity(actor, {
    type: "update",
    action: isActive ? "enabled user" : "disabled user",
    entityType: "team-user",
    entityId: id,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

export async function archiveTeamUser(id: string): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  if (id === actor.id) {
    return { error: "You cannot archive your own account." };
  }
  if (await wouldOrphanSuperAdmin(id)) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_archived: true, is_active: false })
    .eq("id", id);
  if (error) return { error: "Could not archive the account." };

  await recordActivity(actor, {
    type: "archive",
    action: "archived user",
    entityType: "team-user",
    entityId: id,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

/**
 * Undo of archiveTeamUser. Sign-in is deliberately NOT restored with it:
 * archiving sets `is_active: false`, and bringing someone back onto the roster
 * is a smaller decision than handing them a working login. The account returns
 * to the list marked disabled, and enabling it is a separate, deliberate act.
 */
export async function restoreTeamUser(id: string): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("full_name, is_archived")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };
  if (!target.is_archived) return { error: "That account is not archived." };

  const { error } = await admin
    .from("profiles")
    .update({ is_archived: false })
    .eq("id", id);
  if (error) return { error: "Could not restore the account." };

  await recordActivity(actor, {
    type: "restore",
    action: "restored user",
    entityType: "team-user",
    entityId: id,
    entityLabel: target.full_name,
  });
  revalidatePath("/admin/users");
  return { error: null };
}

/** Hard delete — only for users with no recorded actions (spec §4). */
export async function deleteTeamUser(id: string): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };
  if (id === actor.id) {
    return { error: "You cannot delete your own account." };
  }
  if (await wouldOrphanSuperAdmin(id)) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();

  // Umbrella §3.2: permanent deletion is reachable only from a record that is
  // already archived. The UI hides Delete outside the Archived view, but the
  // UI is never the gate — this action is a public HTTP endpoint.
  const { data: target } = await admin
    .from("profiles")
    .select("is_archived")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };
  if (!target.is_archived) {
    return { error: "Archive this account before deleting it." };
  }

  const { count, error: countError } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", id);
  if (countError) {
    return { error: "Could not verify this user's activity history. Try again." };
  }
  if ((count ?? 0) > 0) {
    return { error: "This user has recorded actions. Disable or archive instead of deleting." };
  }

  const { error } = await admin.auth.admin.deleteUser(id); // profile row cascades
  if (error) return { error: "Could not delete the account." };

  await recordActivity(actor, {
    type: "delete",
    action: "deleted user",
    entityType: "team-user",
    entityId: id,
  });
  revalidatePath("/admin/users");
  return { error: null };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: errors only inside `src/features/admin/components/team-manager.tsx` (it still
calls `createTeamUser`/`updateTeamUser` with the old `fullName`/`password` shape — fixed in
Task 6). No errors anywhere else.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/actions/users.ts
git commit -m "feat: create/invite team users without a SuperAdmin-chosen password"
```

---

### Task 6: `TeamManager` UI

**Files:**
- Modify: `src/features/admin/components/team-manager.tsx` (whole file)

**Interfaces:**
- Consumes: `TeamUser.firstName`/`middleName`/`lastName`/`invitePending` (Task 3),
  `TeamUserInput`/`UpdateTeamUserInput`/`resendTeamUserInvite` (Task 5), `Badge` (existing,
  `@/components/ui/badge`).

- [ ] **Step 1: Replace the whole file**

Replace `src/features/admin/components/team-manager.tsx` with:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Archive, RotateCcw, Trash2, Pencil, UserCheck, UserX, Mail } from "lucide-react";
import type { Permission, SessionUser, StaffStatusLabel, TeamUser } from "@/types";
import { PERMISSION_GROUPS, PERMISSION_LABELS, STATUS_PRESETS } from "@/constants/permissions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { InlineAlert } from "@/components/ui/inline-alert";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { SortableTh } from "@/components/ui/sortable-th";
import { Toast } from "@/components/ui/toast";
import { useTableSort } from "@/components/ui/use-table-sort";
import { ViewToggle, type TableView } from "@/components/ui/view-toggle";
import { useToast } from "@/hooks/use-toast";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import {
  archiveTeamUser,
  createTeamUser,
  deleteTeamUser,
  resendTeamUserInvite,
  restoreTeamUser,
  setTeamUserActive,
  updateTeamUser,
} from "@/features/admin/actions/users";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";

interface TeamManagerProps {
  team: TeamUser[];
  archived: TeamUser[];
  currentUser: SessionUser;
}

interface DrawerState {
  mode: "create" | "edit";
  user?: TeamUser;
}

/**
 * A row action awaiting confirmation. Null when no dialog is open.
 *
 * Enabling and restoring are absent on purpose: they hand access back rather
 * than take it away, and a confirmation step on a harmless action teaches
 * people to click through the ones that matter.
 */
type PendingAction = { kind: "archive" | "delete" | "disable"; user: TeamUser } | null;

const CONFIRM_COPY = {
  archive: { title: "Archive this user?", confirmLabel: "Archive" },
  delete: { title: "Delete this user?", confirmLabel: "Delete" },
  disable: { title: "Disable sign-in for this user?", confirmLabel: "Disable sign-in" },
} as const;

const inputClass =
  "w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2 text-sm text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30";

const PAGE_SIZE = 10;

/** The role shown in the table and matched by the filter. */
function roleLabel(user: TeamUser): string {
  return user.isSuperAdmin ? "SuperAdmin" : user.statusLabel === "editor" ? "Editor" : "Staff";
}

/**
 * `useTableSort` memoises on this object, so it must be a module-level
 * constant — a fresh literal every render would re-sort every render.
 */
const SORT_ACCESSORS: Record<string, (row: TeamUser) => string | number | null> = {
  name: (u) => u.fullName,
  email: (u) => u.email,
  role: (u) => roleLabel(u),
  status: (u) => (u.isActive ? "Active" : "Disabled"),
};

/** Team management: list, create/edit drawer with permission checkboxes, row actions. */
export function TeamManager({ team, archived, currentUser }: TeamManagerProps) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<TableView>("active");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Controlled drawer form state.
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [statusLabel, setStatusLabel] = useState<StaffStatusLabel>("staff");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>(STATUS_PRESETS.staff);

  const editingSelf = drawer?.mode === "edit" && drawer.user?.id === currentUser.id;

  function openCreate() {
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setStatusLabel("staff");
    setIsSuperAdmin(false);
    setPermissions(STATUS_PRESETS.staff);
    setFormError(null);
    setDrawer({ mode: "create" });
  }

  function openEdit(user: TeamUser) {
    setFirstName(user.firstName);
    setMiddleName(user.middleName ?? "");
    setLastName(user.lastName);
    setPhone(user.phone ?? "");
    setEmail(user.email);
    setStatusLabel(user.statusLabel);
    setIsSuperAdmin(user.isSuperAdmin);
    setPermissions(user.permissions);
    setFormError(null);
    setDrawer({ mode: "edit", user });
  }

  /** Picking a label re-applies its preset; SuperAdmin can adjust after. */
  function applyStatusLabel(label: StaffStatusLabel) {
    setStatusLabel(label);
    setPermissions(STATUS_PRESETS[label]);
  }

  function togglePermission(permission: Permission) {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission],
    );
  }

  function submit() {
    startTransition(async () => {
      try {
        const editingOther = drawer?.mode === "edit" && drawer.user && drawer.user.id !== currentUser.id;
        const result =
          drawer?.mode === "edit" && drawer.user
            ? await updateTeamUser(drawer.user.id, {
                firstName,
                middleName,
                lastName,
                statusLabel,
                permissions,
                isSuperAdmin,
                ...(editingOther && email !== drawer.user.email ? { email } : {}),
                ...(editingOther ? { phone } : {}),
              })
            : await createTeamUser({
                firstName,
                middleName,
                lastName,
                phone,
                email,
                statusLabel,
                permissions,
                isSuperAdmin,
              });
        if (result.error) {
          setFormError(result.error);
          return;
        }
        setDrawer(null);
        showToast(drawer?.mode === "edit" ? "User updated." : "User created.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  }

  function runRowAction(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        // Previously the error text was passed to the success toast, so a failed
        // archive arrived looking like a successful one.
        if (result.error) {
          showError(result.error);
          return;
        }
        showToast(success);
      } catch {
        showError("Something went wrong. Please try again.");
      }
    });
  }

  /**
   * Archiving, disabling, and deleting a colleague's account all went through a
   * bare click before this — no confirmation of any kind. All three now route
   * through the dialog, which stays locked until the Server Action answers.
   */
  function runConfirmed() {
    if (!confirming) return;
    const { kind, user } = confirming;
    setActionPending(true);
    startTransition(async () => {
      try {
        const result =
          kind === "delete"
            ? await deleteTeamUser(user.id)
            : kind === "disable"
              ? await setTeamUserActive(user.id, false)
              : await archiveTeamUser(user.id);
        if (result.error) {
          showError(result.error);
          return;
        }
        showToast(
          kind === "delete"
            ? `Deleted ${user.fullName}.`
            : kind === "disable"
              ? `Disabled ${user.fullName}.`
              : `Archived ${user.fullName}.`,
        );
      } catch {
        showError("Something went wrong. Please try again.");
      } finally {
        setActionPending(false);
        setConfirming(null);
      }
    });
  }

  function restore(user: TeamUser) {
    runRowAction(
      () => restoreTeamUser(user.id),
      `Restored ${user.fullName} — still disabled until you enable sign-in.`,
    );
  }

  function resendInvite(user: TeamUser) {
    runRowAction(() => resendTeamUserInvite(user.id), `Invite resent to ${user.fullName}.`);
  }

  function actionsFor(member: TeamUser): RowAction[] {
    // Nobody may disable, archive, or delete their own account — that is the
    // one mistake with no way back into the portal.
    const isSelf = member.id === currentUser.id;

    if (view === "archived") {
      return [
        {
          label: "Restore",
          icon: RotateCcw,
          disabled: isPending,
          onSelect: () => restore(member),
        },
        {
          label: "Delete",
          icon: Trash2,
          tone: "danger" as const,
          disabled: isPending || isSelf,
          onSelect: () => setConfirming({ kind: "delete", user: member }),
        },
      ];
    }

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
        label: member.isActive ? "Disable sign-in" : "Enable sign-in",
        icon: member.isActive ? UserX : UserCheck,
        tone: member.isActive ? ("danger" as const) : ("default" as const),
        disabled: isPending || isSelf,
        // Disabling locks a colleague out of the portal, so it asks first.
        // Enabling gives access back and goes straight through.
        onSelect: () =>
          member.isActive
            ? setConfirming({ kind: "disable", user: member })
            : runRowAction(
                () => setTeamUserActive(member.id, true),
                `Enabled ${member.fullName}.`,
              ),
      },
      {
        label: "Archive",
        icon: Archive,
        tone: "danger" as const,
        disabled: isPending || isSelf,
        onSelect: () => setConfirming({ kind: "archive", user: member }),
      },
    ];
  }

  const source = view === "active" ? team : archived;

  const filtered = useMemo(() => {
    const narrowed = source.filter((member) => role === "all" || roleLabel(member) === role);
    return fuzzyFilter(narrowed, search, (member) =>
      haystack(member.fullName, member.email, roleLabel(member)),
    );
  }, [source, search, role]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "name", dir: "asc" },
    SORT_ACCESSORS,
  );

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <AdminPageHeader
        title="Users Management"
        description="Portal accounts, roles and permissions."
        action={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add user
          </Button>
        }
      />

      <Card>
        <div className="border-b border-ink-200/70 px-6 pb-4 pt-6">
          <AdminFilterBar
            search={{
              id: "team-user-search",
              value: search,
              placeholder: "Search users...",
              onChange: (value) => {
                setSearch(value);
                setPage(1);
              },
            }}
            selects={
              // Every archived account is off the roster for the same reason,
              // so the role filter has nothing left to narrow there.
              view === "active"
                ? [
                    {
                      id: "team-user-role-filter",
                      label: "Role",
                      value: role,
                      options: [
                        { value: "all", label: "All Roles" },
                        { value: "SuperAdmin", label: "SuperAdmin" },
                        { value: "Editor", label: "Editor" },
                        { value: "Staff", label: "Staff" },
                      ],
                      onChange: (value) => {
                        setRole(value);
                        setPage(1);
                      },
                    },
                  ]
                : []
            }
          />
          <ViewToggle
            className="mt-4"
            view={view}
            archivedCount={archived.length}
            noun="users"
            onChange={(next) => {
              setView(next);
              setRole("all");
              setPage(1);
            }}
          />
        </div>
        {sorted.length === 0 ? (
          view === "archived" ? (
            <AdminEmptyState message="Nothing archived. Archived accounts are kept here so they can be restored." />
          ) : (
            <AdminEmptyState
              message="No users match your filters."
              onClear={() => {
                setSearch("");
                setRole("all");
                setPage(1);
              }}
            />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Email" sortKey="email" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Role" sortKey="role" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4">Permissions</th>
                    <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((member) => (
                    <tr key={member.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4 font-semibold text-ink-900">
                        <span className="flex items-center gap-3">
                          <Avatar src={member.avatarSrc} fullName={member.fullName} size="sm" />
                          <span className="min-w-0">
                            {member.fullName}
                            {member.id === currentUser.id ? (
                              <span className="ml-2 text-xs font-medium text-brand-600">
                                (you)
                              </span>
                            ) : null}
                            {member.invitePending ? (
                              <Badge variant="soft" className="ml-2 align-middle">
                                Invite pending
                              </Badge>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-ink-600">{member.email}</td>
                      <td className="px-6 py-4 text-ink-600">{roleLabel(member)}</td>
                      <td className="px-6 py-4 text-ink-600">
                        {member.isSuperAdmin ? "All" : `${member.permissions.length} permission(s)`}
                      </td>
                      <td className="px-6 py-4 text-ink-600">
                        {member.isActive ? "Active" : "Disabled"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end">
                          <RowActions label={member.fullName} actions={actionsFor(member)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={sorted.length}
              onPageChange={setPage}
              className="px-6 py-4"
            />
          </>
        )}
      </Card>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "edit" ? "Edit user" : "Add user"}
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <label className="text-sm font-semibold text-ink-700">
              First name
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm font-semibold text-ink-700">
              Middle name <span className="font-normal text-ink-400">(optional)</span>
              <input
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm font-semibold text-ink-700">
              Last name
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
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
            <label className="text-sm font-semibold text-ink-700">
              Mobile number
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={editingSelf}
                className={`mt-1 ${inputClass} ${editingSelf ? "cursor-not-allowed opacity-60" : ""}`}
              />
              {editingSelf ? (
                <span className="mt-1 block text-xs font-normal text-ink-500">
                  You cannot change your own mobile number here — use Settings.
                </span>
              ) : null}
            </label>

            <fieldset>
              <legend className="text-sm font-semibold text-ink-700">Status label</legend>
              <p className="mb-2 text-xs text-ink-500">
                A title with a permission preset — actual power is the checkboxes below.
              </p>
              <div className="flex gap-2">
                {(["staff", "editor"] as const).map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => applyStatusLabel(label)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                      statusLabel === label
                        ? "bg-brand-500 text-white"
                        : "border border-ink-200 text-ink-600 hover:bg-ink-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

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

            {PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.title} disabled={isSuperAdmin} className="disabled:opacity-40">
                <legend className="text-sm font-semibold text-ink-700">{group.title}</legend>
                <div className="mt-1 flex flex-col gap-1.5">
                  {group.permissions.map((permission) => (
                    <label key={permission} className="flex items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={permissions.includes(permission)}
                        onChange={() => togglePermission(permission)}
                        className="h-4 w-4 accent-brand-500"
                      />
                      {PERMISSION_LABELS[permission]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            {formError ? (
              <InlineAlert message={formError} onDismiss={() => setFormError(null)} />
            ) : null}
          </div>
          <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
            <Button variant="ghost" onClick={() => setDrawer(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={isPending}>
              {isPending ? "Saving…" : drawer?.mode === "edit" ? "Save changes" : "Create user"}
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? CONFIRM_COPY[confirming.kind].title : ""}
        body={
          confirming?.kind === "delete" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.user.fullName}</strong>{" "}
              ({confirming.user.email}) will lose their account permanently. Their entries in
              the audit log stay — that record is immutable.
            </>
          ) : confirming?.kind === "disable" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.user.fullName}</strong>{" "}
              will be signed out and blocked from the portal on their next page load. They stay
              on this list with their permissions intact, and you can enable them again from
              the same menu.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink-900">
                {confirming?.user.fullName}
              </strong>{" "}
              will no longer be able to sign in and will drop off this list. The account is
              kept — restore it from the <em>Archived</em> view.
            </>
          )
        }
        confirmLabel={confirming ? CONFIRM_COPY[confirming.kind].confirmLabel : ""}
        pending={actionPending}
        onConfirm={runConfirmed}
        onCancel={() => setConfirming(null)}
      />
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors anywhere.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS. If it flags the `PendingAction`/array-spread pattern in `actionsFor`, adjust
formatting only — do not change behavior.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/components/team-manager.tsx
git commit -m "feat: split-name/phone create form, invite-pending badge, resend action"
```

---

### Task 7: E2E coverage

**Files:**
- Create: `tests/e2e/admin/users.spec.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1-6, running against a live dev server.

**Before running this task:** migration `0031` must be applied to whichever Supabase
project `.env.local` points at (`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`).
Apply `supabase/migrations/0031_profile_name_parts.sql` there manually (e.g. via the
Supabase SQL editor) before Step 2 below — without it, `createTeamUser`'s insert will fail
on the `first_name`/`last_name` `not null` constraint not existing yet, or more likely fail
because the column doesn't exist at all.

- [ ] **Step 1: Write the test**

Create `tests/e2e/admin/users.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/**
 * Covers the create-account form's split-name/phone fields, the removed
 * password field, and the invite-pending badge + resend action introduced by
 * the 2026-08-01 admin-account-invite design. The emailed set-password link
 * itself is not asserted — not automatable without a live inbox, the same
 * limitation every other email-touching flow in this app already documents.
 *
 * Creates a real Supabase Auth user + profiles row against the shared dev
 * database this suite runs against (same live-data tradeoff
 * notifications.spec.ts documents for queue counts), then archives and
 * permanently deletes it at the end so repeated runs don't accumulate test
 * accounts.
 */
test("creating a user has no password field, and shows an invite-pending badge until first sign-in", async ({
  page,
}) => {
  const email = `e2e-invite-${Date.now()}@example.com`;
  const fullName = "Test E2E Invitee";

  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Add user" }).click();

  const dialog = page.getByRole("dialog", { name: "Add user" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("First name")).toBeVisible();
  await expect(dialog.getByLabel("Middle name", { exact: false })).toBeVisible();
  await expect(dialog.getByLabel("Last name")).toBeVisible();
  await expect(dialog.getByLabel("Mobile number")).toBeVisible();
  await expect(dialog.getByText(/temporary password/i)).toHaveCount(0);

  await dialog.getByLabel("First name").fill("Test");
  await dialog.getByLabel("Middle name", { exact: false }).fill("E2E");
  await dialog.getByLabel("Last name").fill("Invitee");
  await dialog.getByLabel("Mobile number").fill("09171234567");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Create user" }).click();

  await expect(page.getByRole("status")).toHaveText("User created.");
  await expect(dialog).not.toBeVisible();

  // Filter down to the one row this test created — the shared roster can
  // otherwise span multiple pages and push it off the first one.
  await page.getByLabel("Search users...").fill(email);
  const row = page.locator("tbody tr", { hasText: email });
  await expect(row).toBeVisible();
  await expect(row.getByText("Invite pending")).toBeVisible();

  // Cleanup: archive then permanently delete the account this test created.
  await row.getByRole("button", { name: `Actions for ${fullName}` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  const archiveDialog = page.getByRole("alertdialog", { name: "Archive this user?" });
  await archiveDialog.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("status")).toHaveText(`Archived ${fullName}.`);

  await page.getByRole("button", { name: "Show archived users" }).click();
  await page.getByLabel("Search users...").fill(email);
  const archivedRow = page.locator("tbody tr", { hasText: email });
  await expect(archivedRow).toBeVisible();
  await archivedRow.getByRole("button", { name: `Actions for ${fullName}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete this user?" });
  await deleteDialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status")).toHaveText(`Deleted ${fullName}.`);
  await expect(archivedRow).toHaveCount(0);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/admin/users.spec.ts --project=admin`

Expected: PASS, if `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` are set in `.env.local` and
migration `0031` has been applied to that environment's Supabase project. If those env
vars are absent, the `admin` project skips entirely (documented, pre-existing behavior) —
in that case this step cannot be verified locally; note that in the task handoff rather
than treating it as a failure.

If a locator doesn't match (e.g. the row's accessible name computation differs from what's
assumed above), inspect the actual DOM via `--headed --debug` and adjust the locator —
every accessible name used above was cross-checked against
`src/components/ui/row-actions.tsx`, `src/components/ui/confirm-dialog.tsx`,
`src/components/ui/view-toggle.tsx`, and `src/components/ui/drawer.tsx` at plan-writing
time, but UI code can drift between then and implementation.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin/users.spec.ts
git commit -m "test: cover the invite-based account creation flow end to end"
```

---

### Task 8: Full verification pass + `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the complete feature from Tasks 1-7.

- [ ] **Step 1: Run the full non-e2e verification suite**

```bash
npm run typecheck
npm run lint
npm run test:unit
```

Expected: all three PASS. If `lint` flags anything in files this plan touched, fix it in
place (formatting only, no behavior change) and re-run.

- [ ] **Step 2: Update `CLAUDE.md`**

In `CLAUDE.md`, find this exact text (the end of the "Self-service 'Forgot password?' flow"
bullet, immediately followed by the start of the "Autosave is a local recovery copy" bullet):

```
  Tested via
  `tests/e2e/public/forgot-password.spec.ts`, which needs no
  `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (both pages are public) — the full emailed-link round
  trip isn't automatable without a live inbox, same limitation the Resend integration design
  already documented.
- **Autosave is a local recovery copy, never a database write** (sub-project 8, 2026-07-22).
```

Replace it with (inserting a new bullet between the two):

```
  Tested via
  `tests/e2e/public/forgot-password.spec.ts`, which needs no
  `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (both pages are public) — the full emailed-link round
  trip isn't automatable without a live inbox, same limitation the Resend integration design
  already documented.
- **Admin account creation is invite-based, not password-based, 2026-08-01**
  (`docs/superpowers/specs/2026-08-01-admin-account-invite-design.md`). `createTeamUser`
  (`/admin/users`, SuperAdmin-only) no longer accepts a password — it creates the Supabase
  Auth user with an unguessable `crypto.randomUUID()` password (so the account exists but
  cannot sign in), inserts the `profiles` row, then reuses the forgot-password flow's exact
  mechanism (see the bullet above) to email a "set your password" link:
  `generateLink({type: "recovery"})` → this app's own
  `/admin/reset-password?token_hash=...` URL → the unchanged `resetPassword` Server Action
  redeems it via `verifyOtp`. The shared helper, `sendAccountInvite` (same file,
  `src/features/admin/actions/users.ts`), is called both from `createTeamUser` and from the
  new `resendTeamUserInvite` action — SuperAdmin-only, unrate-limited, the same trust level
  as every other row action in `TeamManager`, not a public form. `profiles` gained
  `first_name`/`middle_name`/`last_name` (migration `0031`) alongside the unchanged
  `full_name`, which the new `buildFullName()` helper
  (`src/features/admin/lib/build-full-name.ts`) keeps in sync on every SuperAdmin-driven
  write. Settings → Profile's self-service "Full Name" field is deliberately untouched and
  still writes `full_name` directly — a user who renames themselves there will drift the
  split columns out of sync with it (accepted, see the spec's "Accepted drift" section).
  `profiles.phone` (already existed, migration `0003`) is now also captured at
  account-creation time and editable by a SuperAdmin for someone else's account, gated the
  same "only when editing someone else" way the email field already was. "Invite pending" —
  inferred from `auth.users.last_sign_in_at is null`, no new column, an N+1 `getUserById`
  per row accepted because team rosters are small — shows as a badge in `TeamManager` and
  gates the "Resend invite" row action.
- **Autosave is a local recovery copy, never a database write** (sub-project 8, 2026-07-22).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the invite-based admin account creation flow"
```
