# Portal UX Fixes and Structured Legislative Numbering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four UI defects in the admin portal and the public transparency pages, lift Users Management out of Settings into its own CMS module, and replace the free-text legislative document number with structured Type/Number/Year fields that sort correctly.

**Architecture:** Nine tasks, three independent groups. Tasks 1–2 are presentational changes to existing components. Tasks 3–4 extract an existing manager into a new route and rebuild its body on the portal's shared table primitives. Tasks 5–8 introduce two integer columns on `legislative_documents`, a pure formatting/sorting module, and the form and query changes that consume them. Task 9 verifies the whole set.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4 `@theme` tokens, Supabase (Postgres + Auth + Storage), Zod v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-portal-ux-and-legislative-numbering-design.md`

## Global Constraints

- **Design tokens only.** `brand-*` (amber), `ink-*` (neutrals), `danger*`. No blue tokens — they are from the pre-2026-07 design. There is no `brand-900`.
- **Path alias** `@/*` → `src/*`.
- **Server Components by default.** `"use client"` only for real interactivity.
- **Every write is a Server Action** using the service-role client behind an explicit `requirePermission(...)` / `requireSuperAdmin()` check. All tables have RLS enabled with zero policies; the code check is the entire auth gate. Every write re-validates its input with Zod at runtime because Server Actions are public HTTP endpoints.
- **zod is v4**, not v3.
- **Vitest covers pure functions only.** No jsdom, no React renderer. Do not write component tests.
- **Migrations are applied manually by the owner.** Never assume a migration has been applied. A new migration must also be folded into `supabase/baseline/0000_baseline_2026-07-23.sql` — see `supabase/migrations/README.md`.
- **Destructive actions belong on the row, not in the drawer.**
- **Permanent deletion is SuperAdmin-only and reachable only from a record already archived**, enforced server-side, never by the UI alone.
- **Exact composed document-number format:** `Ordinance No. 05, 2024` — type label, space, `No.`, space, sequence zero-padded to a **minimum** of two digits, comma, space, four-digit year.
- **Exact legislative sort order:** year descending, sequence ascending within the year.
- **Do not run Playwright.** The owner verifies in the browser. Task 9 produces a plain-sentence checklist.
- Run `npm run typecheck` and `npm run lint` before every commit. Both must exit 0.

---

### Task 1: Admin chrome — search panel width and semi-circular collapse tab

Two small presentational fixes to the admin shell. Grouped because both are pure CSS-and-icon changes to sibling components with the same verification (typecheck, lint, look at it).

**Files:**
- Modify: `src/features/admin/components/admin-global-search.tsx:96-99`, `:143`
- Modify: `src/features/admin/components/admin-sidebar.tsx:8`, `:283-306`
- Test: none — presentational only. Vitest in this repo covers pure functions, and component tests are deliberately not a thing here.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Widen the search container and make the panel track it**

In `src/features/admin/components/admin-global-search.tsx`, replace the comment and container opening tag (lines 96–99):

```tsx
    // w-80 is the preferred width, not a fixed one: min-w-0 lets it shrink
    // when the bar is tight (between md and ~980px the sidebar takes 256px
    // and the right-hand cluster would otherwise overflow the viewport).
    // The results panel below is w-full rather than a second fixed width, so
    // it stays exactly as wide as the input at every size — shrinking
    // included. A second hardcoded width would agree at one viewport and
    // drift at every other.
    <div ref={containerRef} className="relative hidden w-80 min-w-0 sm:block">
```

- [ ] **Step 2: Change the panel from a fixed width to the container's width**

In the same file, line 143, replace `w-96` with `w-full`. The full attribute becomes:

```tsx
          className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-2xl border border-ink-200/70 bg-white p-2 shadow-xl"
```

- [ ] **Step 3: Swap the sidebar's icon import**

In `src/features/admin/components/admin-sidebar.tsx`, line 8, replace:

```tsx
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
```

with:

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
```

`PanelLeftClose` and `PanelLeftOpen` are used nowhere else in the file — verify with a search before committing, and if either survives elsewhere, keep it in the import rather than breaking the build.

- [ ] **Step 4: Reshape the toggle into a semi-circular tab**

In the same file, replace the whole `{onToggle ? (...) : null}` block at lines 283–306 with:

```tsx
        {onToggle ? (
          // A half-disc handle flush against the rail's right edge, so it reads
          // as a tab on the edge rather than a header control. The wrapper
          // carries the placement because Tooltip measures its own span: hang
          // the positioning off the button and that span collapses to zero,
          // taking the tooltip somewhere else entirely.
          //
          // -right-5 puts the tab entirely outside the rail (it was -right-3.5,
          // half of the old 28px disc, which straddled the border instead).
          // border-l-0 stops the flat edge being outlined against the rail it
          // is meant to be part of, and the shadow points right because that is
          // now the only side light falls off.
          <div className="absolute -right-5 top-11 z-10 -translate-y-1/2">
            <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <button
                type="button"
                onClick={handleToggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                className="flex h-11 w-5 items-center justify-center rounded-r-full border border-l-0 border-white/15 bg-ink-950 text-ink-400 shadow-[2px_0_10px_rgb(0_0_0/0.4)] transition-colors duration-(--duration-quick) hover:border-brand-400/50 hover:bg-ink-900 hover:text-brand-400"
              >
                {/*
                  A panel glyph is unreadable across 20px of usable width. The
                  chevron points the way the click moves the rail.
                */}
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </Tooltip>
          </div>
        ) : null}
```

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0, no output from typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/components/admin-global-search.tsx src/features/admin/components/admin-sidebar.tsx
git commit -m "fix(admin): match the search panel to its input and make the rail handle a tab"
```

---

### Task 2: Transparency — a kebab on every row, and a way out of a paper-only record

`RecordActions` currently returns `null` when a record has no detail page and no files, and each call site prints its own `At the barangay hall` sentence. A sentence and a kebab are different widths, so the Actions column's right edge moves from row to row. Give every row a kebab; a paper-only record offers `Request a copy` instead of a dead end.

**Files:**
- Modify: `src/features/transparency/components/record-actions.tsx`
- Modify: `src/features/transparency/components/legislative-table.tsx:239-243`, `:284-295`
- Modify: `src/features/transparency/components/uploads-preview-table.tsx:74-78`, `:121-132`
- Modify: `src/features/transparency/components/uploads-browse.tsx:177-181`, `:226-237`
- Modify: `src/features/transparency/components/disclosure-grid.tsx:9`, `:53`
- Delete: `src/features/transparency/components/file-downloads.tsx`
- Modify: `src/features/transparency/index.ts:5`
- Test: none — presentational.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `RecordActions` now **never returns `null`**. Any future caller can assume a control renders.

- [ ] **Step 1: Give RecordActions a fallback action**

Replace the whole of `src/features/transparency/components/record-actions.tsx`:

```tsx
"use client";

import { Download, Eye, Mail } from "lucide-react";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import type { TransparencyFile } from "@/types";

interface RecordActionsProps {
  /** Named in the trigger's accessible label, e.g. "Ordinance No. 05, 2024". */
  label: string;
  /** Detail-page link, or null for records with no page of their own. */
  viewHref?: string | null;
  files: TransparencyFile[];
  className?: string;
}

/**
 * The row kebab for the public transparency tables.
 *
 * A thin client wrapper over RowActions taking only serializable props, so a
 * Server Component can render it: the Lucide icons are imported here rather
 * than handed down, which is what keeps the RSC icon boundary intact.
 *
 * Every file gets its own entry rather than hiding behind a "3 files"
 * disclosure — the menu is already a second click, and a third to reach the
 * actual PDF is one too many.
 *
 * Every row gets a kebab, including records with nothing to download, so the
 * Actions column holds one control of one width all the way down. A record
 * that exists only on paper offers "Request a copy" rather than nothing: the
 * previous design printed a bare note where the kebab would have been, which
 * both ragged the column and ended the trail for a resident who still needs
 * the document.
 */
export function RecordActions({ label, viewHref, files, className }: RecordActionsProps) {
  const actions: RowAction[] = [];

  if (viewHref) {
    actions.push({ label: "View record", icon: Eye, href: viewHref });
  }

  files.forEach((file, index) => {
    actions.push({
      label: file.label || `File ${index + 1}`,
      icon: Download,
      href: file.url,
      newTab: true,
    });
  });

  if (actions.length === 0) {
    // Not newTab: /contact is this site's own page, and forcing a new tab on
    // an internal link is a habit that loses people.
    actions.push({ label: "Request a copy", icon: Mail, href: "/contact" });
  }

  return <RowActions label={label} actions={actions} className={className} />;
}
```

- [ ] **Step 2: Drop the sentence from the legislative table's mobile card**

In `src/features/transparency/components/legislative-table.tsx`, delete this block entirely (lines 239–243) — it is the last thing in `LegislativeCard` before the closing `</li>`:

```tsx
      {files.length === 0 ? (
        <p className="mt-3 border-t border-ink-200/70 pt-3 text-sm text-ink-500">
          At the barangay hall
        </p>
      ) : null}
```

- [ ] **Step 3: Simplify the legislative table's desktop actions cell**

In the same file, replace the actions `<td>` in `LegislativeRow` (lines 284–295):

```tsx
        <td className="px-6 py-4">
          <div className="flex justify-end">
            <RecordActions
              label={doc.number}
              viewHref={`/transparency/legislative/${doc.slug}`}
              files={files}
            />
          </div>
        </td>
```

The `<span className="flex items-center justify-end gap-2">` wrapper existed only to sit the sentence beside the kebab. With one child, a right-aligned flex container is all that is left.

- [ ] **Step 4: Drop the sentence from the uploads preview table, both renderings**

In `src/features/transparency/components/uploads-preview-table.tsx`, delete lines 74–78:

```tsx
            {item.files.length === 0 && !item.href ? (
              <p className="mt-3 border-t border-ink-200/70 pt-3 text-sm text-ink-500">
                At the barangay hall
              </p>
            ) : null}
```

and replace the actions `<td>` (lines 121–132) with:

```tsx
                <td className="px-6 py-4">
                  <div className="flex justify-end">
                    <RecordActions
                      label={item.title}
                      viewHref={item.href}
                      files={item.files}
                    />
                  </div>
                </td>
```

- [ ] **Step 5: Drop the sentence from the uploads browse table, both renderings**

In `src/features/transparency/components/uploads-browse.tsx`, delete lines 177–181:

```tsx
                {item.files.length === 0 && !item.href ? (
                  <p className="mt-3 border-t border-ink-200/70 pt-3 text-sm text-ink-500">
                    At the barangay hall
                  </p>
                ) : null}
```

and replace the actions `<td>` (lines 226–237) with:

```tsx
                  <td className="px-6 py-4">
                    <div className="flex justify-end">
                      <RecordActions
                        label={item.title}
                        viewHref={item.href}
                        files={item.files}
                      />
                    </div>
                  </td>
```

- [ ] **Step 6: Convert the disclosure grid from FileDownloads to the kebab**

This is the surface in the owner's screenshot: the "Annual Budget Reports" card, where one document shows `DOWNLOAD` and the next shows `At the barangay hall` — two affordances in one column.

In `src/features/transparency/components/disclosure-grid.tsx`, replace the import on line 9:

```tsx
import { RecordActions } from "./record-actions";
```

and replace line 53:

```tsx
                  <RecordActions label={doc.title} files={doc.files} />
```

`TransparencyDocumentItem` carries no detail-page href, so `viewHref` is omitted: a document with files gets one Download entry per file, and one without gets `Request a copy`.

Import it directly from `./record-actions`, **not** from the feature barrel. `RecordActions` is deliberately absent from `src/features/transparency/index.ts` — it is a client component, and widening the barrel is the path by which a client component reaches the `server-only` `queries.ts`.

- [ ] **Step 7: Delete the now-unreferenced FileDownloads**

```bash
git rm src/features/transparency/components/file-downloads.tsx
```

Then remove line 5 from `src/features/transparency/index.ts`:

```tsx
export { FileDownloads } from "./components/file-downloads";
```

- [ ] **Step 8: Confirm nothing else references it**

```bash
grep -rn "FileDownloads\|At the barangay hall" src/
```

Expected: **no matches**. Any hit is a call site this task missed. (Matches under `docs/` are historical plan records and must not be edited.)

- [ ] **Step 9: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: both exit 0.

- [ ] **Step 10: Commit**

```bash
git add -u src/features/transparency
git commit -m "fix(transparency): give every row a kebab and paper-only records a way to ask"
```

---

### Task 3: Users Management — its own route, nav entry, and extraction from Settings

Move `TeamManager` out of the Settings right-hand column onto `/admin/users` with a nav entry of its own. The manager's body is rebuilt in Task 4; this task delivers a working module at the new address.

**Files:**
- Create: `src/app/admin/(portal)/users/page.tsx`
- Create: `src/app/admin/(portal)/users/loading.tsx`
- Modify: `src/features/admin/data.ts:23-37` (nav array + icon import)
- Modify: `src/features/admin/index.ts` (export `TeamManager`)
- Modify: `src/features/admin/components/team-manager.tsx:243-251` (page header)
- Modify: `src/features/admin/components/settings-panel.tsx`
- Modify: `src/app/admin/(portal)/settings/page.tsx`
- Modify: `src/features/admin/actions/users.ts` (six `revalidatePath` calls)
- Test: none. `tests/unit/admin-nav.test.ts` exercises the pure gate helpers over fixtures, not over `ADMIN_NAV_ITEMS` itself, so adding an entry does not change it. Run it anyway in Step 9.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: route `/admin/users`; `TeamManager` exported from `@/features/admin`; `SettingsPanel` props narrowed to `{ currentUser: SessionUser }`.

- [ ] **Step 1: Add the nav entry**

In `src/features/admin/data.ts`, add `UserCog` to the existing `lucide-react` import, then insert the new entry as the **first** item of the `system` group — immediately before `Services Management` (line 34):

```ts
  { label: "Users Management", href: "/admin/users", icon: UserCog, superAdminOnly: true, group: "system" },
```

Position matters. `firstPermittedPath` walks the **flat** order of this array and decides where each user lands after login. Placing the entry after every `requests` and `content` item leaves that landing unchanged for everyone, and `superAdminOnly` keeps it invisible to staff.

`src/lib/admin-nav.ts` needs no change: `canSeeNavItem` already honours `superAdminOnly`, and the sidebar, mobile drawer, `/admin` redirect and top-bar title all derive from this one array.

- [ ] **Step 2: Export TeamManager from the barrel**

In `src/features/admin/index.ts`, beside the other manager exports:

```ts
export { TeamManager } from "./components/team-manager";
```

- [ ] **Step 3: Create the route**

`src/app/admin/(portal)/users/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth";
import { listArchivedTeamUsers, listTeamUsers } from "@/features/admin/queries/users";
import { TeamManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "Users Management",
};

export default async function AdminUsersPage() {
  // Both reads are SuperAdmin-only, and so is this whole module — the gate is
  // the page's own check, not the shape of the data it fetches.
  const currentUser = await requireSuperAdmin();
  const [team, archived] = await Promise.all([listTeamUsers(), listArchivedTeamUsers()]);
  return <TeamManager team={team} archived={archived} currentUser={currentUser} />;
}
```

`requireSuperAdmin()` returns `Promise<SessionUser>` and calls `notFound()` for everyone else, which is the portal's 404-rather-than-403 convention.

- [ ] **Step 4: Create the loading skeleton**

`src/app/admin/(portal)/users/loading.tsx`, matching the other admin routes:

```tsx
import { PageHeaderSkeleton, PageSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="the user list">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} columns={6} />
    </PageSkeleton>
  );
}
```

- [ ] **Step 5: Give TeamManager a page header**

In `src/features/admin/components/team-manager.tsx`, add to the imports:

```tsx
import { AdminPageHeader } from "./admin-page-header";
```

Then replace the opening of the returned JSX (lines 243–251) — the `<div>` and the `Manage Users` heading row — with:

```tsx
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
```

The heading is now the page's, so the in-card `<h3>Manage Users</h3>` and its sibling `Add user` button are gone. Close the fragment with `</>` instead of `</div>` at the very end of the component (the line before the final `);`).

- [ ] **Step 6: Point every user Server Action at the new route**

In `src/features/admin/actions/users.ts`, replace **all six** occurrences of:

```ts
  revalidatePath("/admin/settings");
```

with:

```ts
  revalidatePath("/admin/users");
```

They are in `createTeamUser`, `updateTeamUser`, `setTeamUserActive`, `archiveTeamUser`, `restoreTeamUser` and `deleteTeamUser`. Settings no longer renders any user data, so revalidating it achieves nothing — and every save would appear to do nothing until the route cache expired an hour later.

Confirm the count:

```bash
grep -c 'revalidatePath("/admin/users")' src/features/admin/actions/users.ts
grep -c 'revalidatePath("/admin/settings")' src/features/admin/actions/users.ts
```

Expected: `6` then `0`.

- [ ] **Step 7: Remove the team card from Settings**

In `src/features/admin/components/settings-panel.tsx`: delete the `TeamManager` import, drop `team` and `archived` from `SettingsPanelProps` and from the destructured parameter list, and delete the whole `{currentUser.isSuperAdmin ? (...) : null}` block (lines 97–101). Narrow the interface to:

```tsx
interface SettingsPanelProps {
  currentUser: SessionUser;
}
```

`TeamUser` is then an unused import — remove it from the `@/types` import list.

Change the grid on line 38 from `lg:grid-cols-[2fr_1fr]` to `lg:grid-cols-2`:

```tsx
      <div className="grid gap-6 lg:grid-cols-2">
```

The `2fr_1fr` split existed to give the narrow column two stacked cards beside two tall ones. With only Preferences left there, an even split stops it looking stranded. **Keep the `min-w-0` on both grid items and its comment** — that is what stops the single-column mobile grid panning sideways, and it is unrelated to this change.

- [ ] **Step 8: Simplify the Settings page**

Replace `src/app/admin/(portal)/settings/page.tsx` entirely:

```tsx
import type { Metadata } from "next";
import { requireSessionUser } from "@/lib/auth";
import { SettingsPanel } from "@/features/admin";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function AdminSettingsPage() {
  const currentUser = await requireSessionUser();
  return <SettingsPanel currentUser={currentUser} />;
}
```

- [ ] **Step 9: Verify**

```bash
npm run typecheck && npm run lint && npm run test:unit
```

Expected: typecheck and lint exit 0; Vitest reports all tests passing with no new failures. If typecheck flags an unused `listTeamUsers` / `listArchivedTeamUsers` import anywhere, remove it.

- [ ] **Step 10: Commit**

```bash
git add -A src/app/admin src/features/admin
git commit -m "feat(admin): give Users Management its own module instead of a Settings card"
```

---

### Task 4: Users Management — standard table, Archived view, archive-gated delete

Rebuild the manager's body on the primitives every other module uses, and move Delete behind the archive gate the rest of the portal enforces.

**Files:**
- Modify: `src/features/admin/components/team-manager.tsx`
- Modify: `src/features/admin/actions/users.ts` (`deleteTeamUser` precondition)
- Test: none — the manager is a client component. The archive precondition is server-side and unreachable from Vitest.

**Interfaces:**
- Consumes: `TeamManager` from Task 3, already mounted at `/admin/users` with an `AdminPageHeader`.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Gate deletion on the archived flag, server-side**

In `src/features/admin/actions/users.ts`, inside `deleteTeamUser`, after the `wouldOrphanSuperAdmin` guard and before the audit-log count, add:

```ts
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
```

Move the `const admin = createSupabaseAdminClient();` line above this block if it is not already there. This is an **additional** condition: the existing audit-log-emptiness check, the `wouldOrphanSuperAdmin` guard and the self-deletion guard all stay exactly as they are.

- [ ] **Step 2: Add the imports the rebuilt body needs**

In `src/features/admin/components/team-manager.tsx`, add to the existing imports:

```tsx
import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { SortableTh } from "@/components/ui/sortable-th";
import { useTableSort } from "@/components/ui/use-table-sort";
import { ViewToggle, type TableView } from "@/components/ui/view-toggle";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminPagination } from "./admin-pagination";
```

`useMemo`, `useState` and `useTransition` are already imported — do not duplicate the line.

- [ ] **Step 3: Add view, role filter, paging and sorting state**

Add a module-level constant above the component:

```tsx
const PAGE_SIZE = 10;

/** The role shown in the table and matched by the filter. */
function roleLabel(user: TeamUser): string {
  return user.isSuperAdmin ? "SuperAdmin" : user.statusLabel === "editor" ? "Editor" : "Staff";
}
```

Then inside `TeamManager`, beside the existing `search` state:

```tsx
  const [view, setView] = useState<TableView>("active");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
```

- [ ] **Step 4: Replace the filtering with view-aware filtering, sorting and paging**

Replace the existing `visible` `useMemo` (lines 231–241) with:

```tsx
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
```

And add this beside `PAGE_SIZE` at module level — **not** inside the component. `useTableSort` memoises on the accessors object, so a fresh literal every render would re-sort every render:

```tsx
const SORT_ACCESSORS: Record<string, (row: TeamUser) => string | number | null> = {
  name: (u) => u.fullName,
  email: (u) => u.email,
  role: (u) => roleLabel(u),
  status: (u) => (u.isActive ? "Active" : "Disabled"),
};
```

- [ ] **Step 5: Make Delete conditional on the Archived view, and add Restore to it**

Replace `actionsFor` (lines 193–229) with:

```tsx
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
```

Delete leaves the active view entirely. It is now reachable only from a row that is already archived — matching the server precondition added in Step 1, and every other manager in the portal.

- [ ] **Step 6: Replace the list body with the standard table**

Replace everything from the `AdminFilterBar` (line 253) through the closing `</details>` block (line 337) with:

```tsx
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
                        {member.fullName}
                        {member.id === currentUser.id ? (
                          <span className="ml-2 text-xs font-medium text-brand-600">(you)</span>
                        ) : null}
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
```

The `<details>` disclosure and its trailing explanatory paragraph are gone — the Archived view replaces both, and the restore path now lives in the row kebab like every other manager's.

- [ ] **Step 7: Update the archive dialog's copy**

The archive confirmation currently promises the account can be restored "from *Archived accounts* below", which no longer exists. In the `ConfirmDialog` body, replace that final sentence:

```tsx
            <>
              <strong className="font-semibold text-ink-900">
                {confirming?.user.fullName}
              </strong>{" "}
              will no longer be able to sign in and will drop off this list. The account is
              kept — restore it from the <em>Archived</em> view.
            </>
```

- [ ] **Step 8: Check nothing was orphaned**

The `RotateCcw` icon is now used by `actionsFor` rather than the deleted `<details>` block, and `Button` may no longer be used if the header action in Task 3 is the only remaining consumer. Run:

```bash
npm run lint
```

Expected: exit 0. `@typescript-eslint/no-unused-vars` will name any import the rewrite left behind — remove those, do not suppress them.

- [ ] **Step 9: Verify**

```bash
npm run typecheck && npm run lint && npm run test:unit
```

Expected: all three exit 0.

- [ ] **Step 10: Commit**

```bash
git add -u src/features/admin
git commit -m "feat(admin): rebuild Users Management on the shared table primitives"
```

---

### Task 5: The legislative number module (TDD)

Two pure functions: one composes the display string from the three structured fields, one produces a sort key that expresses "year descending, sequence ascending" as a single descending comparison. Written test-first — this is exactly the pure logic Vitest exists for in this repo.

**Files:**
- Create: `src/lib/legislative-number.ts`
- Create: `tests/unit/legislative-number.test.ts`

**Interfaces:**
- Consumes: `LegislativeType` from `@/types` (existing: `"ordinance" | "resolution"`).
- Produces:
  - `formatLegislativeNumber(docType: LegislativeType, seqNo: number, year: number): string`
  - `legislativeSortKey(year: number, seqNo: number): number`
  - `MAX_SEQ_NO: number` (= `9999`)

  Tasks 7 and 8 both import from this module.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/legislative-number.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_SEQ_NO,
  formatLegislativeNumber,
  legislativeSortKey,
} from "@/lib/legislative-number";

describe("formatLegislativeNumber", () => {
  it("pads a single-digit sequence to two digits", () => {
    expect(formatLegislativeNumber("ordinance", 5, 2024)).toBe("Ordinance No. 05, 2024");
  });

  it("leaves a two-digit sequence alone", () => {
    expect(formatLegislativeNumber("ordinance", 12, 2024)).toBe("Ordinance No. 12, 2024");
  });

  it("does not truncate a sequence past two digits", () => {
    expect(formatLegislativeNumber("resolution", 123, 2025)).toBe("Resolution No. 123, 2025");
  });

  it("labels each document type", () => {
    expect(formatLegislativeNumber("resolution", 3, 2025)).toBe("Resolution No. 03, 2025");
  });
});

describe("legislativeSortKey", () => {
  /** Sorted descending, which is how the tables consume this key. */
  function order(pairs: [year: number, seq: number][]): string[] {
    return [...pairs]
      .sort((a, b) => legislativeSortKey(b[0], b[1]) - legislativeSortKey(a[0], a[1]))
      .map(([year, seq]) => `${year}-${seq}`);
  }

  it("puts the newest year first and counts up inside it", () => {
    expect(
      order([
        [2024, 9],
        [2025, 4],
        [2023, 11],
        [2025, 3],
        [2024, 4],
        [2025, 5],
      ]),
    ).toEqual(["2025-3", "2025-4", "2025-5", "2024-4", "2024-9", "2023-11"]);
  });

  it("ranks a later year above an earlier one whatever the sequences", () => {
    expect(legislativeSortKey(2025, MAX_SEQ_NO)).toBeGreaterThan(legislativeSortKey(2024, 1));
  });

  it("keeps the widest permitted sequence inside its own year", () => {
    // The boundary the seq_no < 10000 check constraint protects: one more
    // digit and the key would cross into the neighbouring year's range.
    expect(legislativeSortKey(2024, 1)).toBeGreaterThan(legislativeSortKey(2024, MAX_SEQ_NO));
    expect(legislativeSortKey(2024, MAX_SEQ_NO)).toBeGreaterThan(legislativeSortKey(2023, 1));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/unit/legislative-number.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/legislative-number"`. The module does not exist yet.

- [ ] **Step 3: Write the module**

Create `src/lib/legislative-number.ts`:

```ts
import type { LegislativeType } from "@/types";

const TYPE_LABELS: Record<LegislativeType, string> = {
  ordinance: "Ordinance",
  resolution: "Resolution",
};

/**
 * The widest sequence a document number may carry.
 *
 * This is not a stylistic limit — `legislativeSortKey` multiplies the year by
 * one more than this, so a wider sequence would overflow into the neighbouring
 * year's range and silently mis-order the table. The `seq_no < 10000` check
 * constraint in migration 0024 enforces the same bound in the database. The
 * two must move together.
 */
export const MAX_SEQ_NO = 9999;

/**
 * The public document number, composed from the three fields an encoder
 * actually types. Stored on the row so SQL search and the audit log have a
 * human-readable string to work with.
 *
 * Padded to a minimum of two digits so a column of numbers lines up; a
 * three-digit sequence is left as it is rather than truncated.
 */
export function formatLegislativeNumber(
  docType: LegislativeType,
  seqNo: number,
  year: number,
): string {
  return `${TYPE_LABELS[docType]} No. ${String(seqNo).padStart(2, "0")}, ${year}`;
}

/**
 * One number expressing "year descending, sequence ascending within the year",
 * for a sorter that applies a single direction to a single key.
 *
 * Subtracting the sequence inverts it inside its year, so sorting these
 * descending yields 2025 → 03, 04, 05, then 2024 → 03, 04, 05. Sorting them
 * ascending gives the exact mirror, which is why the tables pin the default
 * direction to "desc" rather than leaving it to chance.
 */
export function legislativeSortKey(year: number, seqNo: number): number {
  return year * (MAX_SEQ_NO + 1) - seqNo;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/unit/legislative-number.test.ts
```

Expected: PASS, 7 tests, no warnings. Then run the whole unit suite to be sure nothing else moved:

```bash
npm run test:unit
```

Expected: all passing.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint
git add src/lib/legislative-number.ts tests/unit/legislative-number.test.ts
git commit -m "feat(transparency): add the legislative number formatter and sort key"
```

---

### Task 6: Migration 0024 and the baseline fold

Add `seq_no` and `year` to `legislative_documents`, backfill from the existing free-text numbers, constrain them, and reorder the public search RPC.

**This migration is NOT executed by this task.** No database is available; the owner applies it by hand. Verification here is structural only.

**Files:**
- Create: `supabase/migrations/0024_legislative_structured_number.sql`
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql`
- Modify: `supabase/migrations/README.md` (scope line)
- Modify: `CLAUDE.md` (migration range)

**Interfaces:**
- Consumes: `MAX_SEQ_NO` from Task 5 as the value behind the `seq_no < 10000` constraint. The SQL hardcodes `10000`; the module's doc comment already names the constraint.
- Produces: columns `legislative_documents.seq_no int not null`, `legislative_documents.year int not null`. Task 7 selects, inserts and updates both.

- [ ] **Step 1: Read the baseline's legislative section first**

```bash
grep -n "legislative" supabase/baseline/0000_baseline_2026-07-23.sql
```

You need three locations: the `create table public.legislative_documents` block, its indexes, and the `search_legislative_documents` function body. Note their line numbers before editing — Step 3 changes all three.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0024_legislative_structured_number.sql`:

```sql
-- 0024 — structured legislative document numbers
--
-- `number` was free text an encoder typed by hand ("Ordinance No. 05-2024"),
-- which could not be sorted: localeCompare buries the year behind the
-- sequence, so "Ordinance No. 11-2023" sorted after "Ordinance No. 05-2024".
-- Type was also retyped into a string the doc_type enum already held, with
-- nothing checking the two agreed.
--
-- Number and year become integer columns. `number` stays as the composed
-- display string, written by saveLegislative via formatLegislativeNumber() —
-- a generated column would need doc_type::text, and the enum-to-text cast is
-- STABLE rather than IMMUTABLE, which Postgres may refuse in a generation
-- expression.
--
-- The backfill has no fallback on purpose. If a row's number cannot be
-- parsed, the `set not null` in step 3 fails and this whole transaction rolls
-- back. Applied by hand against a live database, a loud failure beats writing
-- seq_no = 0 onto a real ordinance.

begin;

-- 1. New columns, nullable until the backfill has run.
alter table public.legislative_documents
  add column seq_no int,
  add column year   int;

-- 2. Backfill from the existing "<type> No. <seq>-<year>" text.
update public.legislative_documents
set seq_no = (regexp_match(number, '(\d+)\s*-\s*(\d{4})'))[1]::int,
    year   = (regexp_match(number, '(\d+)\s*-\s*(\d{4})'))[2]::int
where number ~ '(\d+)\s*-\s*(\d{4})';

-- 3. Constrain. A row the regex above missed fails here and aborts.
alter table public.legislative_documents
  alter column seq_no set not null,
  alter column year   set not null,
  add constraint legislative_documents_seq_no_range
    check (seq_no > 0 and seq_no < 10000),
  add constraint legislative_documents_year_range
    check (year between 1900 and 2200),
  add constraint legislative_documents_number_unique
    unique (doc_type, year, seq_no);

-- 4. Rewrite every number into the composed format. Mirrors
--    formatLegislativeNumber() in src/lib/legislative-number.ts.
update public.legislative_documents
set number = initcap(doc_type::text)
          || ' No. ' || lpad(seq_no::text, 2, '0')
          || ', '    || year::text;

-- 5. Index matching the new public ordering: newest year first, counting up.
create index legislative_documents_type_status_year_seq_idx
  on public.legislative_documents (doc_type, status, year desc, seq_no asc);

-- 6. Public browse RPC — same body and same return shape as 0016, ordered by
--    the structured columns instead of date_approved.
create or replace function public.search_legislative_documents(
  p_q        text default '',
  p_doc_type text default null,
  p_limit    int  default 10,
  p_offset   int  default 0
)
returns table (
  id              uuid,
  slug            text,
  doc_type        public.legislative_type,
  number          text,
  title           text,
  summary         text,
  date_approved   date,
  file_path       text,
  file_size_bytes int,
  total_count     bigint
)
language sql
stable
as $$
  select
    d.id, d.slug, d.doc_type, d.number, d.title, coalesce(d.summary, '') as summary,
    d.date_approved, d.file_path, d.file_size_bytes,
    count(*) over () as total_count
  from public.legislative_documents d
  where d.status = 'published'
    and (p_doc_type is null or d.doc_type = p_doc_type::public.legislative_type)
    and public.fuzzy_match(
          d.number || ' ' || d.title || ' ' || coalesce(d.summary, ''),
          p_q
        )
  order by d.year desc, d.seq_no asc, d.id desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

revoke execute on function public.search_legislative_documents(text, text, int, int)
  from anon, authenticated;

commit;
```

- [ ] **Step 3: Fold the same changes into the baseline**

The baseline is a single-transaction squash for a **new** environment, so it must describe the end state directly rather than replay the migration. Three edits:

1. In `create table public.legislative_documents`, add the two columns after `number text not null`:

```sql
  seq_no int not null,
  year int not null,
```

and add the three constraints to the table body:

```sql
  constraint legislative_documents_seq_no_range check (seq_no > 0 and seq_no < 10000),
  constraint legislative_documents_year_range check (year between 1900 and 2200),
  constraint legislative_documents_number_unique unique (doc_type, year, seq_no),
```

2. Beside the existing `legislative_documents_*_idx` indexes, add:

```sql
create index legislative_documents_type_status_year_seq_idx
  on public.legislative_documents (doc_type, status, year desc, seq_no asc);
```

3. In the baseline's `search_legislative_documents` body, change the `order by` to:

```sql
  order by d.year desc, d.seq_no asc, d.id desc
```

Do **not** add the backfill `update` statements — the baseline creates an empty schema with no rows to backfill, and it deliberately ships without demo seed content.

- [ ] **Step 4: Update the scope lines that name the migration range**

In `supabase/migrations/README.md` and in `CLAUDE.md`, the baseline is described as a squash of `0001`–`0023`. Both become `0001`–`0024`. Search for the range and update every occurrence:

```bash
grep -rn "0023" CLAUDE.md supabase/migrations/README.md supabase/baseline/0000_baseline_2026-07-23.sql docs/BACKEND_HANDOFF.md
```

Update the ones describing the baseline's scope. Leave alone any reference that names migration `0023` as a specific migration (the feedback table) — that is a fact about `0023`, not about the range.

- [ ] **Step 5: Verify structurally**

There is no database. Check what can be checked:

```bash
grep -c "begin;" supabase/migrations/0024_legislative_structured_number.sql
grep -c "commit;" supabase/migrations/0024_legislative_structured_number.sql
grep -n "seq_no\|year" supabase/baseline/0000_baseline_2026-07-23.sql | head -20
grep -n "order by d.year desc" supabase/baseline/0000_baseline_2026-07-23.sql supabase/migrations/0024_legislative_structured_number.sql
```

Expected: exactly `1` and `1` for the transaction markers; the baseline shows both columns inside the table definition and the three constraints; `order by d.year desc` appears **once in each file**.

Confirm the statement order in `0024` by eye: columns added → backfilled → constrained → recomposed → indexed → function replaced. A `set not null` before the backfill would fail on every existing row.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0024_legislative_structured_number.sql supabase/baseline/0000_baseline_2026-07-23.sql supabase/migrations/README.md CLAUDE.md docs/BACKEND_HANDOFF.md
git commit -m "feat(db): add structured seq_no/year to legislative documents (0024)"
```

---

### Task 7: Structured numbering through the types, queries, action and form

Wire the two new columns through the stack: the shared types, the public and admin queries, the Zod schema and the drawer form.

**Files:**
- Modify: `src/types/index.ts:330-346` (`LegislativeListItem`), `:405-415` (`AdminLegislativeRow`), `:439-450` (`LegislativeValues`)
- Modify: `src/features/transparency/queries.ts:18-68`
- Modify: `src/features/admin/queries/transparency.ts:16-65`
- Modify: `src/features/admin/actions/legislative.ts`
- Modify: `src/features/admin/components/legislative-form.tsx`
- Test: none beyond Task 5's. These are wiring changes; `typecheck` is the gate.

**Interfaces:**
- Consumes: `formatLegislativeNumber`, `MAX_SEQ_NO` from Task 5; columns `seq_no`, `year` from Task 6.
- Produces: `LegislativeListItem.seqNo`, `.year`; `AdminLegislativeRow.seqNo`, `.year`; `LegislativeValues.seqNo`, `.year` (replacing `.number`). Task 8 consumes the first two.

- [ ] **Step 1: Add the fields to the three shared types**

In `src/types/index.ts`, add to `LegislativeListItem` (after `docType`):

```ts
  /** Sequence within the year, 1–9999. Composed into `number` for display. */
  seqNo: number;
  year: number;
```

Add the identical two lines to `AdminLegislativeRow` (after `docType`).

In `LegislativeValues`, **replace** `number: string;` with:

```ts
  seqNo: number;
  year: number;
```

`number` stays on the two row types — it is the composed display string the tables and the audit log render. It leaves only `LegislativeValues`, which is what the form edits.

- [ ] **Step 2: Select and map the columns in the public query layer**

In `src/features/transparency/queries.ts`, extend `LIST_COLUMNS` (line 18):

```ts
const LIST_COLUMNS =
  "id, slug, doc_type, number, seq_no, year, title, date_approved, file_path, file_size_bytes";
```

Add to the `LegislativeRow` interface, after `number: string;`:

```ts
  seq_no: number;
  year: number;
```

Add to `toListItem`'s returned object, after `docType`:

```ts
    seqNo: row.seq_no,
    year: row.year,
```

- [ ] **Step 3: Reorder the public preview query**

In the same file, replace the `.order(...)` call in `listRecentLegislative` (lines 57–60):

```ts
    // Newest year first, counting up inside it — the owner's call, and the
    // order the /transparency preview tables re-apply client-side. Replaces
    // the old date_approved ordering: a document is numbered before it is
    // approved, so date could not express this.
    .order("year", { ascending: false })
    .order("seq_no", { ascending: true })
```

- [ ] **Step 4: Select and map the columns in the admin query layer**

In `src/features/admin/queries/transparency.ts`, extend the select in `listAdminLegislative` (line 20) to include `seq_no, year`:

```ts
    .select(`id, slug, doc_type, number, seq_no, year, title, date_approved, status, file_path, ${ARCHIVE_SELECT}`)
```

Add to its returned object, after `docType`:

```ts
    seqNo: row.seq_no as number,
    year: row.year as number,
```

Then in `getLegislativeForEdit`, extend the select (line 47) to `doc_type, number, seq_no, year, title, ...` and **replace** `number: data.number as string,` in the returned `values` with:

```ts
      seqNo: data.seq_no as number,
      year: data.year as number,
```

- [ ] **Step 5: Take the structured fields in the Server Action**

In `src/features/admin/actions/legislative.ts`, add the import:

```ts
import { MAX_SEQ_NO, formatLegislativeNumber } from "@/lib/legislative-number";
```

Replace the `number` line in the Zod schema (line 23) with:

```ts
  // Mirrors the check constraints in migration 0024 exactly. The upper bound
  // is load-bearing: legislativeSortKey multiplies the year by MAX_SEQ_NO + 1,
  // so a wider sequence would sort into the neighbouring year.
  seqNo: z.number().int().min(1).max(MAX_SEQ_NO),
  year: z.number().int().min(1900).max(2200),
```

In `saveLegislative`, immediately after the `safeParse` guard, compose the display string once:

```ts
  const number = formatLegislativeNumber(
    parsed.data.docType,
    parsed.data.seqNo,
    parsed.data.year,
  );
```

Then replace every `parsed.data.number` with `number`:
- line 102, the slug base: ``const base = slugify(`${number} ${parsed.data.title}`);``
- line 171, the update patch: `number,` — and add `seq_no: parsed.data.seqNo, year: parsed.data.year,` beside it
- line 234, the update audit `entityLabel: number,`
- line 248, the insert: `number,` plus `seq_no: parsed.data.seqNo, year: parsed.data.year,`
- line 264, the insert audit `entityLabel: number,`

- [ ] **Step 6: Report a duplicate number in words**

The unique constraint from Task 6 makes a repeat number a Postgres `23505`. Both write paths must say so plainly rather than leak the constraint name.

In the update path, replace the error branch at line 204:

```ts
    if (error) {
      return fail(
        error.code === "23505"
          ? `${number} already exists.`
          : "Could not save the document.",
      );
    }
```

In the insert path, replace line 257:

```ts
  if (error || !data) {
    return fail(
      error?.code === "23505"
        ? `${number} already exists.`
        : "Could not create the document.",
    );
  }
```

`fail()` deletes a freshly uploaded PDF on the way out, which is exactly right here: the row write never happened, so nothing references the object.

- [ ] **Step 7: Replace the form's text box with two number fields**

In `src/features/admin/components/legislative-form.tsx`, add the import:

```ts
import { MAX_SEQ_NO, formatLegislativeNumber } from "@/lib/legislative-number";
```

Replace `number: ""` in `EMPTY_VALUES` with:

```ts
  seqNo: 1,
  year: new Date().getFullYear(),
```

Replace the whole `<Field label="Document Number" …>` block (lines 112–121) with:

```tsx
        <div className="grid grid-cols-2 gap-4">
          <Field label="Number" htmlFor="legislative-seq-no">
            <Input
              id="legislative-seq-no"
              type="number"
              min={1}
              max={MAX_SEQ_NO}
              value={values.seqNo}
              onChange={(event) => set("seqNo", event.target.valueAsNumber || 0)}
              required
            />
          </Field>
          <Field label="Year" htmlFor="legislative-year">
            <Input
              id="legislative-year"
              type="number"
              min={1900}
              max={2200}
              value={values.year}
              onChange={(event) => set("year", event.target.valueAsNumber || 0)}
              required
            />
          </Field>
        </div>
        {/*
          The composed number is what the public sees and what search matches,
          but nobody types it — show it so the encoder can check the three
          fields produced what they meant.
        */}
        <p className="-mt-2 text-sm text-ink-600">
          Document number:{" "}
          <span className="font-semibold text-ink-900">
            {formatLegislativeNumber(values.docType, values.seqNo, values.year)}
          </span>
        </p>
```

`valueAsNumber` is `NaN` for an empty input, so `|| 0` keeps the field controlled. Zod rejects `0` on save with a message the form already renders.

- [ ] **Step 8: Retire pre-change draft snapshots**

`useFormDraft` restores a `localStorage` JSON blob blindly. A snapshot written before this change carries `number: string` and no `seqNo`/`year`, which would restore `undefined` into two controlled number inputs.

On line 50, change the scope string:

```ts
  const draft = useFormDraft(useAdminUserId(), "legislative-v2", id, values);
```

Old snapshots are then never matched and expire on their own.

- [ ] **Step 9: Verify**

```bash
npm run typecheck && npm run lint && npm run test:unit
```

Expected: all exit 0. `typecheck` is the real gate here — it names every consumer of the three changed types.

This task is self-contained: `LegislativeValues` has exactly three consumers (`actions/legislative.ts`, `legislative-form.tsx`, `queries/transparency.ts`), and this task changes all three. `legislative-manager.tsx` reads `AdminLegislativeRow.number`, which survives — `number` is removed only from `LegislativeValues`. If typecheck fails here, something in this task is incomplete; do not defer it to Task 8.

- [ ] **Step 10: Commit**

```bash
git add -u src/types src/features
git commit -m "feat(transparency): take document number as type, number and year"
```

---

### Task 8: Sort both legislative tables by the composed number

The public preview tables and the admin manager both sort a `number` column. Point them at the structured key.

**Files:**
- Modify: `src/features/transparency/components/legislative-table.tsx:33-43`, `:60-71`, `:100-107`
- Modify: `src/features/admin/components/legislative-manager.tsx:110`
- Test: covered by Task 5's unit tests on the key itself.

**Interfaces:**
- Consumes: `legislativeSortKey` from Task 5; `seqNo` / `year` on `LegislativeDetail` and `AdminLegislativeRow` from Task 7.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Point the public table's accessor at the sort key**

In `src/features/transparency/components/legislative-table.tsx`, add the import:

```ts
import { legislativeSortKey } from "@/lib/legislative-number";
```

Replace the `number` entry in `SORT_ACCESSORS` (line 36):

```ts
const SORT_ACCESSORS: Accessors = {
  // Not doc.number: that is a display string, and localeCompare on it buries
  // the year behind the sequence ("No. 11-2023" would sort after "No. 05-2024").
  number: (doc) => legislativeSortKey(doc.year, doc.seqNo),
  title: (doc) => doc.title,
  date: (doc) => doc.dateApproved,
};
```

- [ ] **Step 2: Default the public table to the number column, descending**

In the same file, replace the `useTableSort` call (lines 67–71):

```tsx
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    documents,
    // Descending is not cosmetic: legislativeSortKey encodes "year desc,
    // sequence asc" as one descending comparison. Ascending gives the mirror.
    { key: sortable ? "number" : "", dir: "desc" },
    sortable ? SORT_ACCESSORS : NO_ACCESSORS,
  );
```

- [ ] **Step 3: Correct the mobile-list comment**

The comment above the mobile `<ul>` (lines 100–107) claims "the rows arrive newest-first". Replace that sentence so it describes what now happens:

```tsx
        Sorting controls are omitted on mobile: the rows arrive newest year
        first counting up within the year, which is the useful order, and a
        sort bar would cost more room than it earns.
```

- [ ] **Step 4: Point the admin manager's accessor at the same key**

In `src/features/admin/components/legislative-manager.tsx`, add the import:

```ts
import { legislativeSortKey } from "@/lib/legislative-number";
```

and replace the `number` accessor on line 110:

```ts
      number: (r) => legislativeSortKey(r.year, r.seqNo),
```

The column still **displays** `record.number`; only what it sorts on changes.

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm run lint && npm run test:unit
```

Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add -u src/features
git commit -m "feat(transparency): sort ordinances and resolutions by their number"
```

---

### Task 9: Whole-change verification and the owner's browser checklist

**Files:**
- Modify: `CLAUDE.md` (Users Management in the admin-portal description)
- Test: the full suite.

**Interfaces:**
- Consumes: every preceding task.
- Produces: the plain-sentence checklist in the final report.

- [ ] **Step 1: Run everything**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run build
```

Expected: typecheck silent, lint clean, Vitest all-pass with pristine output, build succeeds. Record the unit test count in the report.

Do **not** run Playwright. The owner verifies visually.

- [ ] **Step 2: Confirm the retired affordances are gone**

```bash
grep -rn "At the barangay hall\|FileDownloads" src/
grep -rn 'revalidatePath("/admin/settings")' src/features/admin/actions/users.ts
grep -rn "w-96" src/features/admin/components/admin-global-search.tsx
```

Expected: no matches from any of the three.

- [ ] **Step 3: Note the module in CLAUDE.md**

The admin-portal bullet lists the portal's modules and states `ADMIN_TEAM` is the last placeholder constant. Add one sentence recording that user management is now its own module at `/admin/users`, SuperAdmin-only, and that Settings keeps only profile, security and preferences. Keep it to a sentence — this file is a guide, not a changelog.

- [ ] **Step 4: Commit**

```bash
git add -u CLAUDE.md
git commit -m "docs: record Users Management as its own admin module"
```

- [ ] **Step 5: Write the owner's checklist**

The final report must end with a plain-sentence list of what to look at, no jargon:

1. On any admin page, type two letters in the top-right search box — the results panel should now be exactly as wide as the box itself, with its left and right edges lined up.
2. Look at the round button on the right edge of the dark sidebar — it should now be a half-circle tab flush against the edge with an arrow on it, and clicking it should still collapse and expand the sidebar.
3. In the sidebar under **System**, there should be a new **Users Management** entry above Services Management. Open it: the users list should look like the other manager pages, with a search box, a Role dropdown, an Active/Archived switch, sortable columns and a pager.
4. Archive a user from the row menu, switch to **Archived**, and confirm Restore and Delete appear there — and that Delete is *not* offered on the Active list.
5. Open **Settings** — the Manage Users panel should be gone, leaving profile, security and preferences.
6. On `/transparency`, every row of every table should end with the same three-dot button, with no "At the barangay hall" text anywhere. Open the menu on a document that has no file: it should offer **Request a copy**, which goes to the contact page.
7. Same check on `/transparency/uploads` and `/transparency/legislative`.
8. In the admin **Transparency** module, open a legislative document: the single Document Number box should now be a **Number** and a **Year** box, with the finished number shown underneath as you type.
9. **The database migration has not been run.** Apply `supabase/migrations/0024_legislative_structured_number.sql` to staging before item 8 will work — the app expects two columns that do not exist yet.

---

## Notes for whoever executes this

- **Task 6 ships unexecuted SQL.** That is the standing state of this repo's migrations; the owner applies them. Do not attempt to run it and do not claim it verified.
- **Tasks 1–2, 3–4 and 5–8 are independent groups.** If a task in one group blocks, the others can still proceed.
- **Every task's commit must pass typecheck and lint on its own.** No task depends on a later one to compile: `LegislativeValues` has exactly three consumers and Task 7 changes all three, while `legislative-manager.tsx` reads `AdminLegislativeRow.number`, which survives the change.
- The `.superpowers/sdd/` scratch directory is shared across every past run in this repo and its filenames collide. Namespace anything written there for this plan with a `pln-` prefix.
