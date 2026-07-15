# Auth Foundation Implementation Plan (Backend Plan 1 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the entire `/admin` tree behind a real Supabase Auth login with the SuperAdmin + per-user permission-checkbox model, real user management, and an audit log.

**Architecture:** Supabase (Postgres + Auth) accessed via `@supabase/ssr` server clients; middleware guards `/admin`; all writes are Server Actions validated with Zod that check permissions server-side. The admin chrome moves into an `app/admin/(portal)` route group so `/admin/login` renders without the sidebar.

**Tech Stack:** Next.js 16 App Router, React 19 (`useActionState`), TypeScript strict, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Zod, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-07-15-backend-integration-design.md` (§2 routes, §4 auth/permissions). Later plans (ticketing, news, officials, transparency, hardening, turnover) build on the helpers this plan produces.

## Global Constraints

- **No test framework exists and none is added in this plan** (CLAUDE.md rule; Playwright arrives in the hardening plan). Verification per task = `npm run typecheck` + `npm run build` (or driving the dev server, usually already running at http://localhost:3000).
- TypeScript strict; path alias `@/*` → `src/*`; shared shapes go in `src/types/index.ts`.
- Design tokens only (`brand-*`, `ink-*`, `danger*`); Space Grotesk = `font-display`; no raw hex, no blue tokens.
- Identity: "San Fernando", "Municipal …" (not City), area code (077). Any "Sampaguita" is a regression.
- Pages stay thin; fetches live in server components/actions, never in client components.
- Existing primitives to reuse: `Drawer({ open, onClose, title, children })` from `@/components/ui/drawer`, `Toast({ message, onDismiss })` from `@/components/ui/toast`, `Button` from `@/components/ui/button`, `useDisclosure` from `@/hooks/use-disclosure`.
- Commit after every task. Never commit `.env.local`.

---

### Task 1: Supabase project, dependencies, env scaffolding

**Files:**
- Modify: `package.json` (via npm install)
- Create: `.env.example`
- Create: `.env.local` (NOT committed)
- Modify: `.gitignore` (verify `.env*` is ignored; Next.js default already ignores `.env*` — confirm)

**Interfaces:**
- Produces: env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` used by every later task.

- [ ] **Step 1 (HUMAN, blocking): Create the Supabase project**

Ask the user to do this in the browser (agent cannot):
1. Create a Supabase project named `san-fernando-staging` at https://supabase.com/dashboard (region: Southeast Asia/Singapore).
2. From Project Settings → API, copy: Project URL, `anon` public key, `service_role` key.
3. Paste all three into the chat or directly into `.env.local`.

- [ ] **Step 2: Install dependencies**

Run: `npm install @supabase/ssr @supabase/supabase-js zod`
Expected: added to `dependencies` in `package.json`, no peer-dep errors.

- [ ] **Step 3: Create `.env.example` (committed) and `.env.local` (real values, not committed)**

`.env.example`:
```bash
# Supabase — Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
# Server-only. Never expose to the client. Used for user management (auth admin API).
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
```

`.env.local`: same keys with the real values from Step 1.

Verify `.gitignore` covers env files: `git check-ignore .env.local` → prints `.env.local`. If it doesn't, add `.env*.local` to `.gitignore`.

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck` — expected: clean.
```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: add supabase + zod dependencies and env scaffolding"
```

---

### Task 2: Database migration — profiles, audit_log, RLS, first SuperAdmin

**Files:**
- Create: `supabase/migrations/0001_auth_foundation.sql`

**Interfaces:**
- Produces: tables `public.profiles` (id, email, full_name, status_label, is_superadmin, permissions text[], is_active, is_archived, created_at, updated_at) and `public.audit_log` (id, actor_id, actor_name, action, entity_type, entity_id, detail, created_at). Later tasks read/write these exact column names.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/0001_auth_foundation.sql`:
```sql
-- Auth foundation: staff profiles + audit log.
-- Permission model (spec §4): SuperAdmin has full power; everyone else's real power
-- is exactly the permissions[] array. status_label ('staff' | 'editor') is a title only.

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
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  detail text,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- Signed-in staff can read profiles (own session + team list). All writes go
-- through the service-role client in Server Actions, which bypasses RLS after
-- an explicit SuperAdmin check in code.
create policy "profiles readable by signed-in staff"
  on public.profiles for select to authenticated using (true);

create policy "audit log readable by signed-in staff"
  on public.audit_log for select to authenticated using (true);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2 (HUMAN, blocking): Apply the migration and seed the first SuperAdmin**

Ask the user to run in Supabase Dashboard → SQL Editor:
1. Paste and run the entire migration file above. Expected: "Success. No rows returned".
2. Dashboard → Authentication → Users → **Add user**: their email + a strong password, check **Auto Confirm User**. Copy the new user's UUID.
3. Run (replacing the UUID and name):
```sql
insert into public.profiles (id, email, full_name, is_superadmin, status_label)
values ('PASTE-UUID-HERE', 'their-login-email@example.com', 'Justine Acosta', true, 'staff');
```
Expected: `INSERT 0 1`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_auth_foundation.sql
git commit -m "feat(db): profiles + audit_log tables with RLS for auth foundation"
```

---

### Task 3: Permission contracts and Supabase clients

**Files:**
- Modify: `src/types/index.ts` (append at end)
- Create: `src/constants/permissions.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`

**Interfaces:**
- Produces: `PERMISSIONS`, `Permission`, `StaffStatusLabel`, `SessionUser`, `TeamUser`, `AuditEntry` types; `PERMISSION_LABELS`, `PERMISSION_GROUPS`, `STATUS_PRESETS` constants; `createSupabaseServerClient(): Promise<SupabaseClient>`; `createSupabaseAdminClient(): SupabaseClient`. Every later task consumes these exact names.

- [ ] **Step 1: Append contracts to `src/types/index.ts`**

```ts
/* ── Auth & permissions (backend plan 1) ─────────────────────────────── */

/** Permission slugs stored in profiles.permissions. Order matches the admin UI. */
export const PERMISSIONS = [
  "process-applications",
  "process-appointments",
  "handle-complaints",
  "handle-assistance",
  "manage-news",
  "manage-officials",
  "manage-transparency",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Display title only — real power is the permissions array (spec §4). */
export type StaffStatusLabel = "staff" | "editor";

/** The signed-in admin user, resolved server-side from Supabase Auth + profiles. */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  statusLabel: StaffStatusLabel;
  isSuperAdmin: boolean;
  permissions: Permission[];
}

/** A row in the team-management list (profiles table). */
export interface TeamUser extends SessionUser {
  isActive: boolean;
  isArchived: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

/** A row in the audit_log table. */
export interface AuditEntry {
  id: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: string | null;
  /** ISO timestamp. */
  createdAt: string;
}
```

- [ ] **Step 2: Create `src/constants/permissions.ts`**

```ts
import type { Permission, StaffStatusLabel } from "@/types";

export const PERMISSION_LABELS: Record<Permission, string> = {
  "process-applications": "Process certificate applications",
  "process-appointments": "Process appointments",
  "handle-complaints": "Handle complaints",
  "handle-assistance": "Handle assistance requests",
  "manage-news": "Manage news, announcements & events",
  "manage-officials": "Manage officials",
  "manage-transparency": "Manage transparency documents",
};

export const PERMISSION_GROUPS: { title: string; permissions: Permission[] }[] = [
  {
    title: "Tickets",
    permissions: [
      "process-applications",
      "process-appointments",
      "handle-complaints",
      "handle-assistance",
    ],
  },
  {
    title: "Content",
    permissions: ["manage-news", "manage-officials", "manage-transparency"],
  },
];

/** Pre-ticked checkboxes when the SuperAdmin picks a status label (spec §4). */
export const STATUS_PRESETS: Record<StaffStatusLabel, Permission[]> = {
  staff: [
    "process-applications",
    "process-appointments",
    "handle-complaints",
    "handle-assistance",
  ],
  editor: ["manage-news", "manage-officials", "manage-transparency"],
};
```

- [ ] **Step 3: Create `src/lib/supabase/server.ts`**

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cookie-bound Supabase client for Server Components and Server Actions.
 * Uses the anon key — RLS applies. One instance per request.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where cookies are read-only;
            // middleware handles the session refresh in that case.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Create `src/lib/supabase/admin.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS and can call the auth admin API.
 * Server-only; callers MUST verify SuperAdmin/permission first (lib/auth.ts).
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck` — expected: clean. Run: `npm run lint` — expected: clean.
```bash
git add src/types/index.ts src/constants/permissions.ts src/lib/supabase/
git commit -m "feat(auth): permission contracts and supabase server/admin clients"
```

---

### Task 4: Admin route restructure + login page + sign-in/out actions

**Files:**
- Create: `src/app/admin/(portal)/` (git mv `page.tsx`, `applications/`, `events/`, `legislative/`, `news/`, `services/`, `settings/` into it)
- Create: `src/app/admin/(portal)/layout.tsx` (the existing chrome, moved)
- Modify: `src/app/admin/layout.tsx` (becomes minimal shell keeping metadata)
- Create: `src/app/admin/login/page.tsx`
- Create: `src/features/admin/components/login-form.tsx`
- Create: `src/features/admin/actions/auth.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient` (Task 3).
- Produces: `signIn(prev: AuthFormState, formData: FormData): Promise<AuthFormState>`, `signOut(): Promise<void>`, `interface AuthFormState { error: string | null }` from `@/features/admin/actions/auth`. Route group `(portal)` that Task 5's session check lives in.

- [ ] **Step 1: Move portal routes into the group**

```bash
cd src/app/admin
mkdir "(portal)"
git mv page.tsx "(portal)/page.tsx"
git mv applications events legislative news services settings "(portal)/"
cd ../../..
```

- [ ] **Step 2: Create `src/app/admin/(portal)/layout.tsx`** with the chrome currently in `src/app/admin/layout.tsx` (sidebar + topbar + main), WITHOUT the `metadata` export (it stays in the root admin layout):

```tsx
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";
import { AdminTopBar } from "@/features/admin/components/admin-topbar";

export default function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar className="fixed left-0 top-0 hidden md:flex" />
      <div className="flex min-h-screen w-full flex-1 flex-col md:ml-64">
        <AdminTopBar />
        <main className="mx-auto w-full max-w-(--container-page) flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `src/app/admin/layout.tsx`** as the minimal shared shell (metadata only — applies to portal AND login):

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Barangay Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 4: Create `src/features/admin/actions/auth.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error: string | null;
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, is_archived")
    .eq("id", data.user.id)
    .single();
  if (!profile || !profile.is_active || profile.is_archived) {
    await supabase.auth.signOut();
    return { error: "This account is disabled. Contact the barangay administrator." };
  }

  redirect("/admin");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
```

- [ ] **Step 5: Create `src/features/admin/components/login-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { signIn, type AuthFormState } from "@/features/admin/actions/auth";

const initialState: AuthFormState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="login-email" className="mb-1 block text-sm font-semibold text-ink-700">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-1 block text-sm font-semibold text-ink-700">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2.5 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Create `src/app/admin/login/page.tsx`**

```tsx
import Image from "next/image";
import type { Metadata } from "next";
import { SITE } from "@/constants/site";
import { LoginForm } from "@/features/admin/components/login-form";

export const metadata: Metadata = { title: "Log in" };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image
            src={SITE.sealImage}
            alt={`${SITE.name} seal`}
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover"
          />
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-ink-900">
              Barangay Portal
            </h1>
            <p className="text-sm text-ink-500">Sign in to continue</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Verify + commit**

Run: `npm run typecheck` — expected: clean.
Run: `npm run build` — expected: all routes build; `/admin/login` appears in the route list; all previous `/admin/*` routes still present.
Browser: visit `http://localhost:3000/admin/login` → seal + minimal form, NO sidebar. Wrong password → "Incorrect email or password." Correct SuperAdmin credentials → redirected to `/admin` (portal still renders — guard comes next task).

```bash
git add -A src/app/admin src/features/admin
git commit -m "feat(auth): admin login page, sign-in/out actions, (portal) route group"
```

---

### Task 5: Middleware guard for the /admin tree

**Files:**
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: env vars (Task 1), Supabase session cookies set by `signIn` (Task 4).
- Produces: every request under `/admin` (except `/admin/login`) requires a session; signed-in users hitting `/admin/login` bounce to `/admin`.

- [ ] **Step 1: Create `src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session cookie when expired — do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  if (!user && !isLoginPage) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck` — expected: clean. Run: `npm run build` — expected: builds, middleware listed in output (ƒ Middleware).
Browser (signed out — clear cookies or private window): `http://localhost:3000/admin` → redirected to `/admin/login`. Sign in → lands on `/admin`. Visit `/admin/login` while signed in → bounced to `/admin`. Public site (`/`, `/about`) untouched by the matcher.

```bash
git add src/middleware.ts
git commit -m "feat(auth): middleware session guard for the /admin tree"
```

---

### Task 6: Session helpers, audit helper, real user in the portal chrome

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/audit.ts`
- Modify: `src/app/admin/(portal)/layout.tsx` (fetch session user, pass to topbar)
- Modify: `src/features/admin/components/admin-topbar.tsx` (accept `user` prop, initials avatar, sign-out button)

**Interfaces:**
- Consumes: `SessionUser`, `Permission` (Task 3); `signOut` (Task 4).
- Produces: `getSessionUser(): Promise<SessionUser | null>`, `requireSessionUser(): Promise<SessionUser>`, `requireSuperAdmin(): Promise<SessionUser>`, `requirePermission(p: Permission): Promise<SessionUser>` from `@/lib/auth`; `recordActivity(actor: SessionUser, action: string, entityType: string, entityId?: string, detail?: string): Promise<void>` from `@/lib/audit`. Every later plan's Server Actions call these.

- [ ] **Step 1: Create `src/lib/auth.ts`**

```ts
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Permission, SessionUser, StaffStatusLabel } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Resolve the signed-in admin user (null if signed out, disabled, or archived). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, status_label, is_superadmin, permissions, is_active, is_archived")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active || profile.is_archived) return null;

  return {
    id: user.id,
    email: profile.email,
    fullName: profile.full_name,
    statusLabel: profile.status_label as StaffStatusLabel,
    isSuperAdmin: profile.is_superadmin,
    permissions: profile.permissions as Permission[],
  };
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  return user;
}

/** SuperAdmin-only actions (user management, service toggles). */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (!user.isSuperAdmin) redirect("/admin");
  return user;
}

/** Permission-gated actions. SuperAdmin always passes (spec §4). */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (!user.isSuperAdmin && !user.permissions.includes(permission)) {
    redirect("/admin");
  }
  return user;
}
```

- [ ] **Step 2: Create `src/lib/audit.ts`**

```ts
import type { SessionUser } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Append to the audit log. Fire-and-forget by design: an audit failure must
 * never roll back the action it records (log and continue).
 */
export async function recordActivity(
  actor: SessionUser,
  action: string,
  entityType: string,
  entityId?: string,
  detail?: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("audit_log").insert({
    actor_id: actor.id,
    actor_name: actor.fullName,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    detail: detail ?? null,
  });
  if (error) {
    console.error("audit_log insert failed:", error.message);
  }
}
```

- [ ] **Step 3: Fetch the session user in `src/app/admin/(portal)/layout.tsx`** (defense-in-depth behind the middleware, and the data source for the chrome):

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";
import { AdminTopBar } from "@/features/admin/components/admin-topbar";

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar className="fixed left-0 top-0 hidden md:flex" />
      <div className="flex min-h-screen w-full flex-1 flex-col md:ml-64">
        <AdminTopBar user={user} />
        <main className="mx-auto w-full max-w-(--container-page) flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rework `src/features/admin/components/admin-topbar.tsx`** — accept the user, replace the Google-hotlinked `ADMIN_USER.avatar` with an initials circle, add sign-out. Keep the existing search/bell/help markup; change the imports, signature, and the profile block:

```tsx
import { Bell, CircleHelp, LogOut, Search } from "lucide-react";
import type { SessionUser } from "@/types";
import { signOut } from "@/features/admin/actions/auth";
import { AdminMobileNav } from "@/features/admin/components/admin-mobile-nav";

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Flat sticky app bar for the admin portal: title, search, utilities, profile. */
export function AdminTopBar({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-ink-200/70 bg-white px-4 md:px-8">
      {/* …keep the existing left block (AdminMobileNav + title) and the
          search / bell / help buttons exactly as they are… */}
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold leading-tight text-ink-900">{user.fullName}</p>
          <p className="text-xs capitalize text-ink-500">
            {user.isSuperAdmin ? "SuperAdmin" : user.statusLabel}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white ring-2 ring-brand-400"
        >
          {initialsOf(user.fullName)}
        </span>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sign out"
            className="rounded-full p-2 text-ink-600 transition-colors hover:bg-ink-50"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>
      </div>
    </header>
  );
}
```

(The comment placeholder above marks markup to KEEP from the current file, not to invent — only the profile block on the right changes. Remove the now-unused `Image` and `ADMIN_USER` imports.)

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck` — expected: clean (if other components still import `ADMIN_USER`, that's fine — only the topbar changed).
Browser: portal topbar shows the real signed-in name, role line ("SuperAdmin"), initials circle; the sign-out icon logs out and lands on `/admin/login`.

```bash
git add src/lib/auth.ts src/lib/audit.ts "src/app/admin/(portal)/layout.tsx" src/features/admin/components/admin-topbar.tsx
git commit -m "feat(auth): session helpers, audit helper, real user in admin chrome"
```

---

### Task 7: User-management server actions

**Files:**
- Create: `src/features/admin/actions/users.ts`
- Create: `src/features/admin/queries/users.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin`, `recordActivity`, `createSupabaseAdminClient`, `createSupabaseServerClient`, `PERMISSIONS`, `TeamUser` (Tasks 3/6).
- Produces (from `actions/users.ts`, all Server Actions returning `Promise<ActionResult>` where `interface ActionResult { error: string | null }`):
  - `createTeamUser(input: TeamUserInput)` — `TeamUserInput = { fullName: string; email: string; password: string; statusLabel: StaffStatusLabel; permissions: Permission[]; isSuperAdmin: boolean }`
  - `updateTeamUser(id: string, input: Omit<TeamUserInput, "email" | "password">)`
  - `setTeamUserActive(id: string, isActive: boolean)`
  - `archiveTeamUser(id: string)`
  - `deleteTeamUser(id: string)`
- Produces (from `queries/users.ts`): `listTeamUsers(): Promise<TeamUser[]>`.

- [ ] **Step 1: Create `src/features/admin/queries/users.ts`**

```ts
import type { Permission, StaffStatusLabel, TeamUser } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Non-archived team members for the settings panel, oldest first. */
export async function listTeamUsers(): Promise<TeamUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, status_label, is_superadmin, permissions, is_active, is_archived, created_at")
    .eq("is_archived", false)
    .order("created_at", { ascending: true });
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    statusLabel: row.status_label as StaffStatusLabel,
    isSuperAdmin: row.is_superadmin,
    permissions: row.permissions as Permission[],
    isActive: row.is_active,
    isArchived: row.is_archived,
    createdAt: row.created_at,
  }));
}
```

- [ ] **Step 2: Create `src/features/admin/actions/users.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSIONS, type Permission, type StaffStatusLabel } from "@/types";
import { requireSuperAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

export interface TeamUserInput {
  fullName: string;
  email: string;
  password: string;
  statusLabel: StaffStatusLabel;
  permissions: Permission[];
  isSuperAdmin: boolean;
}

const teamUserSchema = z.object({
  fullName: z.string().trim().min(2, "Name is too short."),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(10, "Password needs at least 10 characters."),
  statusLabel: z.enum(["staff", "editor"]),
  permissions: z.array(z.enum(PERMISSIONS)),
  isSuperAdmin: z.boolean(),
});

const updateSchema = teamUserSchema.omit({ email: true, password: true });

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
  const { data } = await admin
    .from("profiles")
    .select("is_superadmin, is_active, is_archived")
    .eq("id", id)
    .single();
  const isActiveSuperAdmin =
    data?.is_superadmin && data.is_active && !data.is_archived;
  if (!isActiveSuperAdmin) return false;
  return (await activeSuperAdminCount()) <= 1;
}

export async function createTeamUser(input: TeamUserInput): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const parsed = teamUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { error: error?.message ?? "Could not create the account." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    email: parsed.data.email,
    full_name: parsed.data.fullName,
    status_label: parsed.data.statusLabel,
    permissions: parsed.data.permissions,
    is_superadmin: parsed.data.isSuperAdmin,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Could not save the profile. The account was not created." };
  }

  await recordActivity(actor, "created user", "team-user", data.user.id, parsed.data.fullName);
  revalidatePath("/admin/settings");
  return { error: null };
}

export async function updateTeamUser(
  id: string,
  input: Omit<TeamUserInput, "email" | "password">,
): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }
  if (!parsed.data.isSuperAdmin && (await wouldOrphanSuperAdmin(id))) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      status_label: parsed.data.statusLabel,
      permissions: parsed.data.permissions,
      is_superadmin: parsed.data.isSuperAdmin,
    })
    .eq("id", id);
  if (error) return { error: "Could not save the changes." };

  await recordActivity(actor, "updated user", "team-user", id, parsed.data.fullName);
  revalidatePath("/admin/settings");
  return { error: null };
}

export async function setTeamUserActive(id: string, isActive: boolean): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  if (!isActive && (await wouldOrphanSuperAdmin(id))) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Could not update the account." };

  await recordActivity(actor, isActive ? "enabled user" : "disabled user", "team-user", id);
  revalidatePath("/admin/settings");
  return { error: null };
}

export async function archiveTeamUser(id: string): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  if (await wouldOrphanSuperAdmin(id)) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_archived: true, is_active: false })
    .eq("id", id);
  if (error) return { error: "Could not archive the account." };

  await recordActivity(actor, "archived user", "team-user", id);
  revalidatePath("/admin/settings");
  return { error: null };
}

/** Hard delete — only for users with no recorded actions (spec §4). */
export async function deleteTeamUser(id: string): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  if (await wouldOrphanSuperAdmin(id)) {
    return { error: "At least one SuperAdmin must remain. Promote someone else first." };
  }

  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", id);
  if ((count ?? 0) > 0) {
    return { error: "This user has recorded actions. Disable or archive instead of deleting." };
  }

  const { error } = await admin.auth.admin.deleteUser(id); // profile row cascades
  if (error) return { error: "Could not delete the account." };

  await recordActivity(actor, "deleted user", "team-user", id);
  revalidatePath("/admin/settings");
  return { error: null };
}
```

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` — expected: clean. Run: `npm run lint` — expected: clean.
```bash
git add src/features/admin/actions/users.ts src/features/admin/queries/users.ts
git commit -m "feat(admin): user management server actions with last-superadmin guard"
```

---

### Task 8: Team manager UI in Settings

**Files:**
- Create: `src/features/admin/components/team-manager.tsx`
- Modify: `src/app/admin/(portal)/settings/page.tsx` (fetch team + current user, pass down)
- Modify: `src/features/admin/components/settings-panel.tsx` (accept props; swap the mock team card for `<TeamManager />`)

**Interfaces:**
- Consumes: `listTeamUsers` and all five actions (Task 7); `PERMISSION_GROUPS`, `PERMISSION_LABELS`, `STATUS_PRESETS` (Task 3); `Drawer`, `Toast`, `Button`, `useDisclosure` primitives.
- Produces: `TeamManager({ team, currentUser }: { team: TeamUser[]; currentUser: SessionUser })` client component; `SettingsPanel` gains required props `team: TeamUser[]` and `currentUser: SessionUser`.

- [ ] **Step 1: Create `src/features/admin/components/team-manager.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Plus, Archive, Trash2, Pencil } from "lucide-react";
import type { Permission, SessionUser, StaffStatusLabel, TeamUser } from "@/types";
import { PERMISSION_GROUPS, PERMISSION_LABELS, STATUS_PRESETS } from "@/constants/permissions";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import {
  archiveTeamUser,
  createTeamUser,
  deleteTeamUser,
  setTeamUserActive,
  updateTeamUser,
} from "@/features/admin/actions/users";

interface TeamManagerProps {
  team: TeamUser[];
  currentUser: SessionUser;
}

interface DrawerState {
  mode: "create" | "edit";
  user?: TeamUser;
}

const inputClass =
  "w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2 text-sm text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30";

export function TeamManager({ team, currentUser }: TeamManagerProps) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Controlled drawer form state.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [statusLabel, setStatusLabel] = useState<StaffStatusLabel>("staff");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>(STATUS_PRESETS.staff);

  function openCreate() {
    setFullName("");
    setEmail("");
    setPassword("");
    setStatusLabel("staff");
    setIsSuperAdmin(false);
    setPermissions(STATUS_PRESETS.staff);
    setFormError(null);
    setDrawer({ mode: "create" });
  }

  function openEdit(user: TeamUser) {
    setFullName(user.fullName);
    setEmail(user.email);
    setPassword("");
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
      const result =
        drawer?.mode === "edit" && drawer.user
          ? await updateTeamUser(drawer.user.id, {
              fullName,
              statusLabel,
              permissions,
              isSuperAdmin,
            })
          : await createTeamUser({
              fullName,
              email,
              password,
              statusLabel,
              permissions,
              isSuperAdmin,
            });
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setDrawer(null);
      setToast(drawer?.mode === "edit" ? "User updated." : "User created.");
    });
  }

  function runRowAction(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action();
      setToast(result.error ?? success);
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink-900">Team</h3>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add user
        </Button>
      </div>

      <ul className="divide-y divide-ink-200/70 rounded-2xl border border-ink-200/70">
        {team.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">
                {member.fullName}
                {member.id === currentUser.id ? (
                  <span className="ml-2 text-xs font-medium text-brand-600">(you)</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-ink-500">
                {member.email} ·{" "}
                <span className="capitalize">
                  {member.isSuperAdmin ? "SuperAdmin" : member.statusLabel}
                </span>{" "}
                · {member.isSuperAdmin ? "all permissions" : `${member.permissions.length} permission(s)`}
                {member.isActive ? "" : " · disabled"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={`Edit ${member.fullName}`}
                onClick={() => openEdit(member)}
                className="rounded-full p-2 text-ink-600 transition-colors hover:bg-ink-50"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={isPending || member.id === currentUser.id}
                onClick={() =>
                  runRowAction(
                    () => setTeamUserActive(member.id, !member.isActive),
                    member.isActive ? "User disabled." : "User enabled.",
                  )
                }
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-600 transition-colors hover:bg-ink-50 disabled:opacity-40"
              >
                {member.isActive ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                aria-label={`Archive ${member.fullName}`}
                disabled={isPending || member.id === currentUser.id}
                onClick={() => runRowAction(() => archiveTeamUser(member.id), "User archived.")}
                className="rounded-full p-2 text-ink-600 transition-colors hover:bg-ink-50 disabled:opacity-40"
              >
                <Archive className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${member.fullName}`}
                disabled={isPending || member.id === currentUser.id}
                onClick={() => runRowAction(() => deleteTeamUser(member.id), "User deleted.")}
                className="rounded-full p-2 text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "edit" ? "Edit user" : "Add user"}
      >
        <div className="flex flex-col gap-4">
          <label className="text-sm font-semibold text-ink-700">
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          {drawer?.mode === "create" ? (
            <>
              <label className="text-sm font-semibold text-ink-700">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="text-sm font-semibold text-ink-700">
                Temporary password (min 10 characters)
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            </>
          ) : null}

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
              onChange={(e) => setIsSuperAdmin(e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            SuperAdmin (full power, manages users — ignores the checkboxes below)
          </label>

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
            <p role="alert" className="text-sm font-medium text-danger">
              {formError}
            </p>
          ) : null}

          <Button variant="primary" onClick={submit} disabled={isPending}>
            {isPending ? "Saving…" : drawer?.mode === "edit" ? "Save changes" : "Create user"}
          </Button>
        </div>
      </Drawer>

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
```

(If the existing `Drawer`/`Toast`/`Button` prop signatures differ from what's used here, adapt to the actual primitives — read them first.)

- [ ] **Step 2: Make `src/app/admin/(portal)/settings/page.tsx` fetch real data.** Read the current file; keep its metadata/header structure, change the body to:

```tsx
import { requireSuperAdmin } from "@/lib/auth";
import { listTeamUsers } from "@/features/admin/queries/users";
import { SettingsPanel } from "@/features/admin/components/settings-panel";

export default async function AdminSettingsPage() {
  const currentUser = await requireSuperAdmin();
  const team = await listTeamUsers();
  return <SettingsPanel team={team} currentUser={currentUser} />;
}
```

(Keep any existing `metadata` export and page-header components around the panel. `requireSuperAdmin` makes Settings SuperAdmin-only, matching spec §4 — non-SuperAdmins get bounced to `/admin`. Remove the Settings item from `ADMIN_NAV_ITEMS` rendering for non-SuperAdmins in a later plan; for now the redirect is the gate.)

- [ ] **Step 3: Update `src/features/admin/components/settings-panel.tsx`:**
  - Change the signature to `export function SettingsPanel({ team, currentUser }: { team: TeamUser[]; currentUser: SessionUser })`.
  - Import `TeamManager` and the two types; delete the `ADMIN_TEAM` and `TEAM_ROLE_LABELS` imports.
  - Replace the profile card's `ADMIN_USER.*` reads with `currentUser.fullName` / `currentUser.email` (keep the phone field's existing placeholder if there is no equivalent), and replace the avatar `<Image>` with the same initials-circle pattern used in the topbar (Task 6 Step 4).
  - Replace the entire mock team card/list (the block that maps `ADMIN_TEAM`, around the `TEAM_ROLE_LABELS[member.role]` usage) with `<TeamManager team={team} currentUser={currentUser} />`.
  - Leave the rest of the panel (security, preferences cards) untouched.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck` — expected: clean. Run: `npm run build` — expected: clean.
Browser walkthrough as the SuperAdmin on `/admin/settings`:
1. Team list shows the real seeded SuperAdmin with "(you)".
2. Add user → fill name/email/password, pick "Editor" → content boxes pre-tick; save → toast "User created.", list refreshes.
3. Sign out, sign in as the new editor → `/admin/settings` bounces to `/admin` (not SuperAdmin).
4. Back as SuperAdmin: Disable on the editor → toast; sign-in as editor now fails with the disabled message. Re-enable.
5. Disable/Archive/Delete on yourself are disabled buttons; attempting to demote the only SuperAdmin (edit → untick SuperAdmin → save) returns the "At least one SuperAdmin must remain" error.
6. Delete the editor (no recorded actions) → gone from list AND from Supabase Auth users.

```bash
git add src/features/admin/components/team-manager.tsx src/features/admin/components/settings-panel.tsx "src/app/admin/(portal)/settings/page.tsx"
git commit -m "feat(admin): real team management with permission checkboxes in settings"
```

---

### Task 9: Publishing Activity from the audit log

**Files:**
- Create: `src/features/admin/queries/audit.ts`
- Modify: `src/app/admin/(portal)/page.tsx` (fetch entries, pass down)
- Modify: `src/features/admin/components/publishing-activity.tsx` (accept entries prop instead of `PUBLISHING_ACTIVITY` seed)

**Interfaces:**
- Consumes: `AuditEntry` (Task 3), `createSupabaseServerClient` (Task 3).
- Produces: `listRecentActivity(limit?: number): Promise<AuditEntry[]>`; `PublishingActivity({ entries }: { entries: AuditEntry[] })`.

- [ ] **Step 1: Create `src/features/admin/queries/audit.ts`**

```ts
import type { AuditEntry } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function listRecentActivity(limit = 8): Promise<AuditEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_name, action, entity_type, entity_id, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    actorName: row.actor_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}
```

- [ ] **Step 2: Wire it through.** Read `src/features/admin/components/publishing-activity.tsx` and `src/app/admin/(portal)/page.tsx` first. Change `PublishingActivity` to accept `{ entries: AuditEntry[] }`, delete its `PUBLISHING_ACTIVITY` import, and render each entry as `"{actorName} {action}"` with `detail` as the secondary line and `formatDate(createdAt)` (from `@/lib/format`) as the timestamp — keeping the component's existing card markup and empty-state pattern (add "No activity yet." when `entries.length === 0`, styled like the legislative tables' empty rows). In the page, make the component async-fed: `const entries = await listRecentActivity();` and pass `<PublishingActivity entries={entries} />`. Keep `RecentDrafts` on seed data — it becomes real in the content plans.

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` && `npm run build` — expected: clean.
Browser: `/admin` Publishing Activity shows real rows ("Justine Acosta created user — <name>") from the Task 8 walkthrough; timestamps formatted; no mock entries remain.

```bash
git add src/features/admin/queries/audit.ts src/features/admin/components/publishing-activity.tsx "src/app/admin/(portal)/page.tsx"
git commit -m "feat(admin): publishing activity panel reads the real audit log"
```

---

### Task 10: Final verification sweep

**Files:** none new — verification only.

- [ ] **Step 1: Full gate**

Run: `npm run typecheck` && `npm run lint` && `npm run build` — all clean. Confirm the build output still lists every public route as static (`○`) — nothing in this plan may change public-page rendering.

- [ ] **Step 2: End-to-end walkthrough (fresh private window)**

1. `/admin` → redirected to `/admin/login`.
2. Wrong password → error; 6th rapid attempt → Supabase returns a rate-limit error (surfaced as the generic message — acceptable for now; friendly copy arrives in the hardening plan).
3. Sign in → `/admin`; topbar shows name + initials; Publishing Activity is real.
4. `/admin/settings` team CRUD works per Task 8's walkthrough.
5. Sign out → back to login; deep link `/admin/news` while signed out → login.
6. Public site unaffected: `/`, `/services`, `/transparency` render as before.

- [ ] **Step 3: Update handoff doc + commit**

Append to the changelog block at the top of `docs/BACKEND_HANDOFF.md`:

```markdown
> **Updated 2026-07-XX (auth foundation):** `/admin` is now behind real Supabase Auth
> (spec: `docs/superpowers/specs/2026-07-15-backend-integration-design.md`). Middleware
> guard + `(portal)` route group; `/admin/login`; SuperAdmin + per-user permission
> checkboxes (`profiles` table), team management in Settings (SuperAdmin-only), and a
> real `audit_log` feeding Publishing Activity. Work item E1 is DONE. `ADMIN_USER` seed
> remains only where later plans replace it (applications reviewer name).
```

(Replace `2026-07-XX` with the actual date.)

```bash
git add docs/BACKEND_HANDOFF.md
git commit -m "docs: record auth foundation completion in backend handoff"
```

---

## Self-review notes

- **Spec coverage (§4):** login page ✅ (T4), sessions/middleware ✅ (T5), SuperAdmin + checkboxes + presets + labels ✅ (T3/T7/T8), last-SuperAdmin guard ✅ (T7), disable/archive/delete rules ✅ (T7/T8), audit log ✅ (T2/T6/T9), RLS baseline ✅ (T2). Deferred by design: login rate-limit copy, Turnstile, security headers (hardening plan); password-reset email via Resend SMTP (needs domain — ticketing/notifications plan sets up Resend); hiding un-permitted nav items (cosmetic; each content plan gates its own routes via `requirePermission`).
- **Type consistency:** `SessionUser`/`TeamUser`/`Permission`/`ActionResult` names checked across Tasks 3→9; `profiles` column names in T2 match every query in T6–T9 (including `email` added for the team list).
- **Known risk:** exact prop shapes of `Drawer`/`Toast`/`Button` and the current markup of `settings-panel.tsx`/`publishing-activity.tsx` were not fully read — tasks touching them instruct the implementer to read first and adapt while keeping the specified interfaces.
