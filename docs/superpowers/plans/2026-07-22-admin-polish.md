# Admin Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the officials publish defect, add a fourth directory section, retire the Dashboard Overview, and modernize the admin shell into a collapsible grouped sidebar plus a floating top bar.

**Architecture:** Eleven independent changes sharing no code. The only new abstraction is `src/lib/admin-nav.ts` — pure gate/group/lookup helpers over the nav table, consumed by the sidebar, the mobile nav, the top bar's page title, and the `/admin` redirect. Everything else edits existing files in place.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (Postgres), Zod v4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-22-admin-polish-design.md`

## Global Constraints

- Path alias `@/*` → `src/*`.
- Tailwind: **only** `brand-*` / `ink-*` / `danger*` tokens from `src/app/globals.css` `@theme`. No blue tokens. `brand-50` and `brand-900` **do not exist** — do not invent scale stops.
- zod is **v4**: `z.uuid()`, not `z.string().uuid()`.
- Server Actions are public HTTP endpoints — every write re-validates with Zod at runtime.
- Migrations are applied **manually by the owner**. Never assume `0022` is applied; never run it yourself.
- **Component-level tests are deliberately not a thing in this repo.** Vitest covers pure functions only (`tests/unit`, no jsdom, no React renderer). Everything else is verified in the running browser per `.claude/skills/verify/SKILL.md`. Only Task 8 has unit tests; that is correct, not an omission.
- The barangay is **San Fernando**. San Nicolas is a **municipality**. Area code **(077)**.
- Never `git add -A` — stage explicit paths.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Migration 0022

**Files:**
- Create: `supabase/migrations/0022_official_members_and_quick_services.sql`

**Interfaces:**
- Produces: the `members` value on the `public.official_group` enum; removal of every `quick_services` row from `public.site_items`. Tasks 2 and 5 depend on this having been applied to the target environment.

- [ ] **Step 1: Write the migration**

```sql
-- Admin polish pass (design doc
-- docs/superpowers/specs/2026-07-22-admin-polish-design.md).
--
-- Two unrelated changes, one sitting of work. They are together because they
-- ship together, not because they relate.
--
-- 1. A fourth officials directory section, below Administration.
-- 2. Quick Services returns to code (spec §5).

-- ── 1. Barangay Members ─────────────────────────────────────────────────────
-- Postgres has permitted ALTER TYPE ... ADD VALUE inside a transaction since
-- 12, but the new label CANNOT BE USED in the same transaction that adds it.
-- This migration therefore only declares it.
--
-- DO NOT add a seed INSERT using 'members' to this file. It will fail with
-- "unsafe use of new value of enum type". A later migration, or the admin UI,
-- is where the first 'members' row comes from.
alter type public.official_group add value 'members';

-- ── 2. Quick Services leaves the CMS ────────────────────────────────────────
-- The six home-page shortcut cards were moved into site_items by 0021. They
-- are a fixed set of links to this site's own routes: they change when the
-- routes change, which is a deploy, not an edit. They are back in
-- src/features/home/data.ts as of this change.
--
-- DOCUMENTED DRIFT: Postgres cannot drop an enum value, so 'quick_services'
-- survives on the site_block enum and as a branch of the site_items_shape
-- CHECK that nothing can now reach. The TypeScript SITE_BLOCKS union in
-- src/types/index.ts NO LONGER MIRRORS this enum exactly, and that is
-- deliberate — recreating the type would mean rewriting the CHECK, the index,
-- and every dependent object to delete six rows.
delete from public.site_items where block = 'quick_services';
```

- [ ] **Step 2: Verify the SQL parses without applying it**

There is no local Postgres. Confirm by eye against `0021_site_content.sql`:
- the enum type is `public.official_group` (from `0012_officials.sql:17`), not `content_status`;
- the column in `site_items` is `block`, not `site_block` (the *type* is `site_block`, the *column* is `block` — see `0021` line ~90).

Run: `grep -n "block\b" supabase/migrations/0021_site_content.sql | head -5`
Expected: confirms `block public.site_block not null`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0022_official_members_and_quick_services.sql
git commit -m "$(cat <<'EOF'
feat(db): a fourth officials section, and Quick Services leaves the CMS

0022 adds 'members' to official_group and deletes the quick_services rows.
The enum value cannot be dropped, so it stays as an unreachable branch of
0021's CHECK — documented at the top of the migration.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Tell the owner**

This migration must be applied to Supabase staging by the owner before Task 2's code can write a `members` official. Say so explicitly in the task report. Do not attempt to apply it.

---

### Task 2: Barangay Members through the stack

**Files:**
- Modify: `src/types/index.ts:89`
- Modify: `src/features/admin/actions/officials.ts:32`
- Modify: `src/features/admin/components/official-form.tsx:149-159`
- Modify: `src/features/admin/components/officials-manager.tsx:55-66`
- Modify: `src/features/officials/components/leadership-directory.tsx`

**Interfaces:**
- Consumes: the `members` enum label from Task 1.
- Produces: `OfficialGroup` widened to `"executive" | "council" | "administration" | "members"`. Task 3 and Task 4 edit the same manager file — do this one first to avoid conflicting edits.

- [ ] **Step 1: Widen the type**

In `src/types/index.ts`, replace line 89:

```ts
export type OfficialGroup = "executive" | "council" | "administration" | "members";
```

- [ ] **Step 2: Widen the Zod enum**

In `src/features/admin/actions/officials.ts`, replace line 32:

```ts
  group: z.enum(["executive", "council", "administration", "members"]),
```

- [ ] **Step 3: Add the form option**

In `src/features/admin/components/official-form.tsx`, inside the `Select` at line ~150, after the `administration` option:

```tsx
            <option value="administration">Administration</option>
            <option value="members">Members</option>
```

- [ ] **Step 4: Add the manager's filter option and label**

In `src/features/admin/components/officials-manager.tsx`, replace the two constants at lines 55-66:

```tsx
const GROUP_OPTIONS = [
  { value: "all", label: "All Sections" },
  { value: "executive", label: "Chief Executive" },
  { value: "council", label: "Barangay Council" },
  { value: "administration", label: "Administration" },
  { value: "members", label: "Members" },
];

const GROUP_LABELS: Record<AdminOfficialRow["group"], string> = {
  executive: "Chief Executive",
  council: "Barangay Council",
  administration: "Administration",
  members: "Members",
};
```

- [ ] **Step 5: Render the fourth public section**

In `src/features/officials/components/leadership-directory.tsx`, add the filter beside the other three (after line 22):

```tsx
  const members = officials.filter((official) => official.group === "members");
```

Then change the Administration block so it is no longer the last child (it currently has no `mb-20`), and append the new section. Replace lines 54-65 with:

```tsx
      {administration.length > 0 ? (
        <div className={members.length > 0 ? "mb-20" : undefined}>
          <DividerHeading>Administration</DividerHeading>
          <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-8">
            {administration.map((official) => (
              <div key={official.id} className="w-full md:w-[calc(50%-1rem)]">
                <OfficialCard official={official} variant="compact" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {members.length > 0 ? (
        <div>
          <DividerHeading>Barangay Members</DividerHeading>
          <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-8">
            {members.map((official) => (
              <div key={official.id} className="w-full md:w-[calc(50%-1rem)]">
                <OfficialCard official={official} variant="compact" />
              </div>
            ))}
          </div>
        </div>
      ) : null}
```

Also update the component's doc comment on line 6:

```tsx
/** Complete officials directory: chief executive, council, administration, members. */
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean. If `OfficialGroup` is used in an exhaustive `switch` or `Record` anywhere else, TypeScript names the file — fix each by adding a `members` arm.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/features/admin/actions/officials.ts src/features/admin/components/official-form.tsx src/features/admin/components/officials-manager.tsx src/features/officials/components/leadership-directory.tsx
git commit -m "$(cat <<'EOF'
feat(officials): a Barangay Members section below Administration

Fourth value on official_group, rendered like Administration and omitted
when empty. Needs 0022 applied before an official can be saved into it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The publish fix

**Files:**
- Modify: `src/features/admin/components/officials-manager.tsx` (imports, new `publish` handler, `actionsFor`)
- Modify: `src/features/admin/components/official-form.tsx:236-270`

**Interfaces:**
- Consumes: `setOfficialStatus(id: string, status: ContentStatus): Promise<{ error: string | null }>` — already exported from `@/features/admin/actions/officials`, already imported by the manager.
- Produces: nothing new.

- [ ] **Step 1: Add the Send icon to the manager's imports**

In `src/features/admin/components/officials-manager.tsx`, add `Send` to the `lucide-react` import, keeping alphabetical order (it goes between `RotateCcw` and `Trash2`):

```tsx
  RotateCcw,
  Send,
  Trash2,
```

- [ ] **Step 2: Add the publish handler**

Insert directly above `const actionsFor = ...` (line ~225):

```tsx
  /**
   * Publish straight from the row, like News, Events and Projects.
   *
   * The failure path matters more than the success one here: setOfficialStatus
   * refuses to publish an official with no portrait or no portrait alt text,
   * and before this the refusal had nowhere to surface — the drawer rendered it
   * below a long scrolling form. An error toast is the whole point.
   */
  const publish = (id: string, name: string) => {
    startTransition(async () => {
      const result = await setOfficialStatus(id, "published");
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(`Published ${name}.`);
      router.refresh();
    });
  };
```

- [ ] **Step 3: Offer Publish in the row menu**

In `actionsFor`, replace the `else if (record.status === "published")` branch (lines ~252-260) with:

```tsx
    } else if (record.status === "published") {
      // Archiving is only meaningful for a record the public can currently see.
      actions.push({
        label: "Archive",
        icon: Archive,
        tone: "danger",
        onSelect: () => setConfirming({ kind: "archive", id: record.id, name: record.name }),
      });
    } else {
      actions.push({
        label: "Publish",
        icon: Send,
        onSelect: () => publish(record.id, record.name),
      });
    }
```

- [ ] **Step 4: Let the drawer publish an unsaved official**

In `src/features/admin/components/official-form.tsx`, replace the Publish button's guard at line ~250. `handlePublish` already saves first and reads `saveResult.id ?? id`, so the `id &&` guard only enforced a save-close-reopen round trip:

```tsx
          {status !== "published" ? (
```

- [ ] **Step 5: Move the drawer's error into the footer**

Delete the error block from the scrolling body (lines ~236-240):

```tsx
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
```

Then replace the footer `<div>` (line ~248) so the error sits above the buttons and cannot scroll away:

```tsx
      {/*
        Archive and Delete moved to the row's actions menu (sub-project 5): a
        destructive action should not require opening an editor you did not
        want to open. Publish stays here because it must persist the on-screen
        values first — see handlePublish.

        The error lives in this footer, not in the scrolling body above it: it
        is usually the server refusing to publish for want of a portrait or alt
        text, and a message explaining a button must be visible from that
        button. Below the achievements editor it never was.
      */}
      <div className="border-t border-ink-200/70 p-6">
        {error ? (
          <p role="alert" className="mb-4 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {status !== "published" ? (
              <Button
                type="button"
                variant="accent"
                disabled={pending}
                onClick={handlePublish}
              >
                Publish
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <DraftSavedNote savedAt={draft.savedAt} />
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : id ? "Save Changes" : "Add Official"}
            </Button>
          </div>
        </div>
      </div>
```

This replacement already contains Step 4's change — the guard in the block above reads `status !== "published"`. If you applied Step 4 first, this simply preserves it; if you jumped straight here, Step 4 is done.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 7: Verify in the browser**

Per `.claude/skills/verify/SKILL.md`. `npm run dev` may already be running — check before starting another.

1. `/admin/officials` → row kebab on a Draft official shows **Publish**.
2. Publish one **with** a portrait and alt text → row flips to Published, success toast, official appears on `/officials`.
3. Publish one **without** alt text → red error toast reading "Add a description (alt text) for the portrait before publishing this official." Row stays Draft.
4. Open the drawer on a brand-new official (Add New Official) → **Publish is visible before saving**.
5. Trigger the same alt-text failure from the drawer → the message is visible without scrolling.

- [ ] **Step 8: Commit**

```bash
git add src/features/admin/components/officials-manager.tsx src/features/admin/components/official-form.tsx
git commit -m "$(cat <<'EOF'
fix(admin): officials can be published, and say why when they cannot

Publish was missing from the officials row menu — the only path was a drawer
button hidden until after a save. When the server refused for want of a
portrait or alt text, the message rendered below a long scrolling form and
was never seen, so publishing looked like it silently did nothing.

Row-level Publish with an error toast; the drawer's button no longer waits
for a save; the drawer's error moves into the footer beside the button it
explains.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Officials page chrome

**Files:**
- Modify: `src/features/admin/components/officials-manager.tsx:275-335`

**Interfaces:**
- Consumes: `AdminPageHeader({ title, description?, action? })` from `./admin-page-header`; `ViewToggle({ view, archivedCount, onChange, noun, className? })` from `@/components/ui/view-toggle`.
- Produces: nothing new.

- [ ] **Step 1: Import AdminPageHeader**

In `src/features/admin/components/officials-manager.tsx`, add beside the other local imports (after `./admin-filter-bar`):

```tsx
import { AdminPageHeader } from "./admin-page-header";
```

- [ ] **Step 2: Replace the bare button with a page header, and move the view toggle**

Replace everything from `<div className="mb-6 flex justify-end">` down to the closing `/>` of `CardHeader` (lines ~277-335) with:

```tsx
      <AdminPageHeader
        title="Manage Officials"
        description="The barangay directory as the public sees it — order, sections, and who is currently published."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            Add New Official
          </Button>
        }
      />
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={UserCheck} label="Published" value={published} />
        <AdminStatCard icon={Users} label="Drafts" value={drafts} tone="secondary" />
        <AdminStatCard icon={UserX} label="Archived" value={archived} tone="danger" />
      </div>
      <Card>
        <CardHeader
          title="Officials Directory"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              search={{
                id: "official-search",
                value: search,
                placeholder: "Search name or position...",
                onChange: setSearch,
              }}
              selects={[
                {
                  id: "official-group-filter",
                  label: "Section",
                  value: group,
                  options: GROUP_OPTIONS,
                  onChange: setGroup,
                },
                // Every row in the Archived view holds the same status, so
                // the dropdown has nothing left to narrow.
                ...(view === "active"
                  ? [
                      {
                        id: "official-status-filter",
                        label: "Status",
                        value: status,
                        options: STATUS_OPTIONS,
                        onChange: setStatus,
                      },
                    ]
                  : []),
              ]}
            />
          }
        />
        {/*
          The view toggle sits on its own row under the heading rather than in
          the header's right-hand cluster. In that cluster it shared a wrapping
          flex row with the filter bar, so switching to Archived — which also
          drops the Status select — reflowed the toggle itself. Here it cannot
          move, and because search is the first control in AdminFilterBar,
          losing a trailing select shifts nothing to its left either.
        */}
        <div className="px-6 pb-4 pt-4">
          <ViewToggle
            view={view}
            archivedCount={archived}
            noun="officials"
            onChange={(next) => {
              setView(next);
              setStatus("all");
            }}
          />
        </div>
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 4: Verify in the browser**

1. `/admin/officials` shows a **Manage Officials** heading with the Add button on its right, matching `/admin/news`.
2. The `Active | Archived` toggle sits under **Officials Directory**, above the table.
3. Toggle Active ↔ Archived repeatedly: the toggle does not move, and the search box does not shift.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/components/officials-manager.tsx
git commit -m "$(cat <<'EOF'
feat(admin): the officials page gets a heading, and a toggle that stays put

It was the only manager opening on a bare Add button. The Active|Archived
toggle moves out of the filter cluster onto its own row, so switching views
no longer reflows the control you just clicked.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Quick Services back to code

**Files:**
- Create: `src/features/home/data.ts`
- Modify: `src/features/home/components/quick-services-section.tsx`
- Modify: `src/features/site-content/queries.ts` (delete `listQuickServices`)
- Modify: `src/types/index.ts` (`SITE_BLOCKS` union)
- Modify: `src/features/admin/site-blocks.ts` (drop the spec entry, note the drift)

**Interfaces:**
- Consumes: `QuickService { title, ctaLabel, href, icon: LucideIcon }` from `@/types` (already defined, line 55).
- Produces: `QUICK_SERVICES: QuickService[]` from `@/features/home/data`.

- [ ] **Step 1: Recreate the home data file**

Create `src/features/home/data.ts`. The six entries are `0021`'s seed rows verbatim, with `icon_name` strings resolved through `src/lib/icon-map.ts` to the components they mapped to:

```ts
import {
  CalendarDays,
  FileBadge,
  FileEdit,
  FileText,
  HeartHandshake,
  Store,
} from "lucide-react";
import type { QuickService } from "@/types";

/**
 * The six shortcut cards under the home hero.
 *
 * These lived in `site_items` between migrations 0021 and 0022 and came back
 * here deliberately (design doc 2026-07-22-admin-polish §5): they are links to
 * this site's own routes, so they change when the routes change — a deploy,
 * not an edit. Being code again also means the icon is a component rather than
 * a name resolved at runtime.
 */
export const QUICK_SERVICES: QuickService[] = [
  { title: "Barangay Clearance", ctaLabel: "Apply Online", href: "/services", icon: FileText },
  { title: "Certificate Requests", ctaLabel: "Request Now", href: "/services", icon: FileBadge },
  {
    title: "Set an Appointment",
    ctaLabel: "Book Now",
    href: "/appointments/new",
    icon: CalendarDays,
  },
  {
    title: "File a Complaint",
    ctaLabel: "Submit Online",
    href: "/complaints/new",
    icon: FileEdit,
  },
  { title: "Business Permit", ctaLabel: "Apply Now", href: "/services", icon: Store },
  {
    title: "Social Services Assistance",
    ctaLabel: "Request Now",
    href: "/assistance/new",
    icon: HeartHandshake,
  },
];
```

- [ ] **Step 2: Point the section at the constant**

In `src/features/home/components/quick-services-section.tsx`, replace the import on line 6 and the function signature. The component stops being `async` and loses the empty-state guard (a hardcoded array of six is never empty):

```tsx
import { QUICK_SERVICES } from "@/features/home/data";
```

```tsx
/** Six-up grid of the most requested citizen services. */
export function QuickServicesSection() {
  return (
    <Section tone="white">
```

and replace `services.map(` with `QUICK_SERVICES.map(`. Delete the `const services = await listQuickServices();` line and the `if (services.length === 0) return null;` guard.

- [ ] **Step 3: Delete the query**

In `src/features/site-content/queries.ts`, delete the whole `listQuickServices` function (lines ~94-101). Then remove `QuickService` from that file's type imports if it is no longer referenced there.

Run: `grep -n "QuickService" src/features/site-content/queries.ts`
Expected: no output.

- [ ] **Step 4: Narrow the SITE_BLOCKS union**

In `src/types/index.ts`, remove `"quick_services",` from the `SITE_BLOCKS` array (line ~616) and extend the comment above it:

```ts
/* --------------------------- Site content CMS (plan 9) -------------------------- */
/* The editable Home and About blocks.                                              */
/*                                                                                  */
/* This union NO LONGER mirrors the SQL `site_block` enum exactly: migration 0022    */
/* removed Quick Services from the CMS, and Postgres cannot drop an enum value, so   */
/* 'quick_services' survives in the database as an unreachable label. Every value    */
/* HERE must still exist in the enum — the drift only runs one way.                  */

export const SITE_BLOCKS = [
  "hero_slides",
  "glance_stats",
  "involvement_items",
  "core_values",
  "history_entries",
  "milestones",
] as const;
```

- [ ] **Step 5: Drop the spec entry**

In `src/features/admin/site-blocks.ts`, delete the whole `quick_services` entry from `SITE_BLOCK_SPECS` (the object at lines ~56-83, from `{ block: "quick_services",` to its closing `},`).

This is why Step 4 is mandatory rather than optional: `specFor` ends in a non-null assertion whose stated invariant is "every `SiteBlock` has a spec above". Removing the spec while leaving the union member would break that silently. Update the assertion's comment to reflect the narrower union:

```ts
export function specFor(block: SiteBlock): SiteBlockSpec {
  // Every SiteBlock has a spec above; the non-null assertion is safe because
  // both lists are derived from the same union. Quick Services was removed
  // from BOTH in 0022 — never from one alone.
  return SITE_BLOCK_SPECS.find((spec) => spec.block === block)!;
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean. If the Zod schema in `src/features/admin/actions/site-content.ts:172` keys off the union, TypeScript names it — delete the `quick_services` key there and its label at line ~290.

- [ ] **Step 7: Verify in the browser**

1. `/` — the six Quick Services cards render exactly as before (same titles, CTA wording, icons, links).
2. `/admin/site-content` → Home page tab has **no** Quick Services collection.
3. The rest of the Home tab (hero carousel, at-a-glance, get involved) still edits and saves.

- [ ] **Step 8: Commit**

```bash
git add src/features/home/data.ts src/features/home/components/quick-services-section.tsx src/features/site-content/queries.ts src/types/index.ts src/features/admin/site-blocks.ts src/features/admin/actions/site-content.ts
git commit -m "$(cat <<'EOF'
feat(home): Quick Services goes back to being code

Six links to this site's own routes change when the routes change, which is
a deploy, not an edit. Removing them from the CMS also drops a runtime icon
lookup — the icon is a component again.

The SITE_BLOCKS union and SITE_BLOCK_SPECS lose the block together; specFor's
non-null assertion depends on the two agreeing.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The map

**Files:**
- Rename: `src/images/map/San Fernando Map.png` → `src/images/map/san-fernando-map.png`
- Modify: `src/features/contact/data.ts:48`
- Modify: `src/features/contact/components/map-section.tsx`

**Interfaces:**
- Produces: `MAP_IMAGE: StaticImageData` (was `string`).

- [ ] **Step 1: Rename the file**

```bash
git mv "src/images/map/San Fernando Map.png" src/images/map/san-fernando-map.png
```

If the file is untracked, `git mv` fails — use `mv` instead and let Step 6 stage it.

- [ ] **Step 2: Make MAP_IMAGE a static import**

In `src/features/contact/data.ts`, replace the `MAP_IMAGE` export at line 48 (and its `lh3` URL) with:

```ts
import mapImage from "@/images/map/san-fernando-map.png";
```

placed with the other imports at the top of the file, and:

```ts
/**
 * The barangay map, supplied by the barangay. Bundled like SITE.sealImage
 * rather than served from Storage: one file, no admin surface, changes only
 * when the boundary does.
 */
export const MAP_IMAGE = mapImage;
```

- [ ] **Step 3: Render it with next/image**

In `src/features/contact/components/map-section.tsx`, add the import:

```tsx
import Image from "next/image";
```

and replace the `role="img"` div (lines ~26-31) with:

```tsx
          <Image
            src={MAP_IMAGE}
            alt="Map showing the location of the San Fernando Barangay Hall"
            fill
            sizes="(min-width: 768px) 100vw, 100vw"
            className="object-cover"
          />
```

The `grayscale-20 opacity-80` treatment goes: it existed to make a stock placeholder recede, and a real barangay map should be legible. The parent already has `relative`, which `fill` requires.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Verify in the browser**

1. `/contact` → the Barangay Hall Location panel shows the real San Fernando map, full-bleed inside its rounded frame, not washed out.
2. The white info card still overlays it legibly at the bottom-left.
3. Check at 390px wide — the map still fills its frame.

- [ ] **Step 6: Commit**

```bash
git add src/images/map src/features/contact/data.ts src/features/contact/components/map-section.tsx
git commit -m "$(cat <<'EOF'
feat(contact): the real barangay map replaces the hotlinked placeholder

Bundled like the seal, rendered through next/image instead of a CSS
background, and no longer greyscaled — that treatment existed to make a
stock photo recede. One fewer lh3 hotlink.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The hotline

**Files:**
- Modify: `src/features/officials/components/action-center-banner.tsx:27-30`

- [ ] **Step 1: Dial the real number**

`SITE.phone` is already imported in this file. Replace the primary button (lines 27-30):

```tsx
            <Button href="tel:+63776001082" variant="primary" size="lg">
              <Phone className="h-5 w-5" aria-hidden="true" />
              Emergency Hotline: {SITE.phone}
            </Button>
```

The label reads from `SITE.phone` — `(077) 600 1082` — so it cannot drift from the footer and hotline card. The `tel:` href is the same number in dialable E.164 form; `(077) 600 1082` is the Ilocos Norte landline `+63 77 600 1082`.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Verify in the browser**

`/officials` → the red 24/7 Action Center strip reads "Emergency Hotline: (077) 600 1082". Hover the button and confirm the status bar shows `tel:+63776001082`.

- [ ] **Step 4: Commit**

```bash
git add src/features/officials/components/action-center-banner.tsx
git commit -m "$(cat <<'EOF'
fix(officials): the action centre dials the barangay, not 911

(077) 600 1082 is the real hotline and already lives in SITE.phone, so the
label now reads from it rather than repeating a number.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Nav grouping and the pure helpers

This is the one task with unit tests, because it is the one task that is pure logic. Tasks 9, 10 and 11 all consume it.

**Files:**
- Create: `src/lib/admin-nav.ts`
- Create: `tests/unit/admin-nav.test.ts`
- Modify: `src/features/admin/data.ts` (`ADMIN_NAV_ITEMS`: drop Dashboard Overview, add `group`, reorder)
- Modify: `src/types/index.ts` (`IconNavItem` gains `group`)

**Interfaces:**
- Produces:
  - `type AdminNavGroup = "requests" | "content" | "system"`
  - `interface NavGate { isSuperAdmin: boolean; permissions: Permission[] }`
  - `interface GatedNavItem { label: string; href: string; exact?: boolean; superAdminOnly?: boolean; permission?: Permission; group: AdminNavGroup }`
  - `canSeeNavItem(item: GatedNavItem, gate: NavGate): boolean`
  - `visibleNavItems<T extends GatedNavItem>(items: T[], gate: NavGate): T[]`
  - `groupNavItems<T extends GatedNavItem>(items: T[], gate: NavGate): { group: AdminNavGroup; label: string; items: T[] }[]`
  - `firstPermittedPath(items: GatedNavItem[], gate: NavGate): string`
  - `adminPageTitle(items: GatedNavItem[], pathname: string, gate: NavGate): string`
  - `ADMIN_NAV_GROUP_LABELS: Record<AdminNavGroup, string>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Permission } from "@/types";
import {
  type GatedNavItem,
  adminPageTitle,
  canSeeNavItem,
  firstPermittedPath,
  groupNavItems,
  visibleNavItems,
} from "@/lib/admin-nav";

/**
 * The admin nav gate (admin polish, 2026-07-22).
 *
 * These helpers decide three things that fail quietly when wrong: which links a
 * staff member sees, where /admin sends them, and what the top bar calls the
 * page. The last one is a disclosure surface — the portal 404s on unpermitted
 * routes precisely so their existence stays hidden, and a title bar naming the
 * module would undo that from inside the layout that renders above the 404.
 */

const ITEMS: GatedNavItem[] = [
  { label: "Applications", href: "/admin/applications", permission: "process-applications", group: "requests" },
  { label: "Inquiries", href: "/admin/inquiries", permission: "handle-inquiries", group: "requests" },
  { label: "Officials", href: "/admin/officials", permission: "manage-officials", group: "content" },
  { label: "Services Management", href: "/admin/services", superAdminOnly: true, group: "system" },
  { label: "Settings", href: "/admin/settings", group: "system" },
];

const superAdmin = { isSuperAdmin: true, permissions: [] as Permission[] };
const editor = { isSuperAdmin: false, permissions: ["manage-officials"] as Permission[] };
const nobody = { isSuperAdmin: false, permissions: [] as Permission[] };

describe("canSeeNavItem", () => {
  it("lets an ungated item through for everyone", () => {
    expect(canSeeNavItem(ITEMS[4]!, nobody)).toBe(true);
  });

  it("hides a permission-gated item from someone without it", () => {
    expect(canSeeNavItem(ITEMS[2]!, nobody)).toBe(false);
  });

  it("shows a permission-gated item to someone holding it", () => {
    expect(canSeeNavItem(ITEMS[2]!, editor)).toBe(true);
  });

  it("hides a SuperAdmin-only item from a permission holder", () => {
    expect(canSeeNavItem(ITEMS[3]!, editor)).toBe(false);
  });

  it("gives SuperAdmins everything, permissions array notwithstanding", () => {
    expect(ITEMS.every((item) => canSeeNavItem(item, superAdmin))).toBe(true);
  });
});

describe("visibleNavItems", () => {
  it("preserves source order", () => {
    expect(visibleNavItems(ITEMS, superAdmin).map((i) => i.label)).toEqual([
      "Applications",
      "Inquiries",
      "Officials",
      "Services Management",
      "Settings",
    ]);
  });

  it("filters to what the gate allows", () => {
    expect(visibleNavItems(ITEMS, editor).map((i) => i.label)).toEqual([
      "Officials",
      "Settings",
    ]);
  });
});

describe("groupNavItems", () => {
  it("groups in Requests / Content / System order", () => {
    expect(groupNavItems(ITEMS, superAdmin).map((g) => g.group)).toEqual([
      "requests",
      "content",
      "system",
    ]);
  });

  it("drops a group whose every item is gated away, label included", () => {
    const groups = groupNavItems(ITEMS, editor);
    expect(groups.map((g) => g.group)).toEqual(["content", "system"]);
    expect(groups[1]!.items.map((i) => i.label)).toEqual(["Settings"]);
  });

  it("carries a human label for each group", () => {
    expect(groupNavItems(ITEMS, superAdmin)[0]!.label).toBe("Requests");
  });
});

describe("firstPermittedPath", () => {
  it("sends a SuperAdmin to the first item overall", () => {
    expect(firstPermittedPath(ITEMS, superAdmin)).toBe("/admin/applications");
  });

  it("sends an editor to the first item they can actually reach", () => {
    expect(firstPermittedPath(ITEMS, editor)).toBe("/admin/officials");
  });

  it("falls back to Settings for someone with no permissions", () => {
    expect(firstPermittedPath(ITEMS, nobody)).toBe("/admin/settings");
  });

  it("falls back to Settings rather than crashing on an empty list", () => {
    expect(firstPermittedPath([], nobody)).toBe("/admin/settings");
  });
});

describe("adminPageTitle", () => {
  it("names the page from its route", () => {
    expect(adminPageTitle(ITEMS, "/admin/officials", editor)).toBe("Officials");
  });

  it("matches nested routes by prefix", () => {
    expect(adminPageTitle(ITEMS, "/admin/officials/some-id", editor)).toBe("Officials");
  });

  it("refuses to name a module the viewer may not see", () => {
    // The portal 404s here, but this layout renders above the 404 — naming the
    // module would leak exactly what the 404 exists to hide.
    expect(adminPageTitle(ITEMS, "/admin/applications", editor)).toBe("Admin");
  });

  it("falls back for a route with no nav entry", () => {
    expect(adminPageTitle(ITEMS, "/admin", superAdmin)).toBe("Admin");
  });

  it("prefers the longest matching href", () => {
    const nested: GatedNavItem[] = [
      { label: "Transparency", href: "/admin/transparency", group: "content" },
      { label: "Projects", href: "/admin/transparency/projects", group: "content" },
    ];
    expect(adminPageTitle(nested, "/admin/transparency/projects", superAdmin)).toBe("Projects");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- admin-nav`
Expected: FAIL — `Failed to resolve import "@/lib/admin-nav"`.

- [ ] **Step 3: Write the implementation**

First declare the group type where the rest of the shared shapes live. In `src/types/index.ts`, directly above `IconNavItem` (line ~21):

```ts
/** Sidebar section. Labels and render order live in `src/lib/admin-nav.ts`. */
export type AdminNavGroup = "requests" | "content" | "system";
```

It goes here rather than in `admin-nav.ts` because that module already imports `Permission` from `@/types`, and owning the type there would make the two files import each other. Step 5 adds the matching field to `IconNavItem`.

Then create `src/lib/admin-nav.ts`:

```ts
import type { AdminNavGroup, Permission } from "@/types";

/**
 * The admin nav gate: who sees which links, where /admin sends them, and what
 * the top bar calls the current page.
 *
 * These are pure functions over a list passed in rather than reads of
 * ADMIN_NAV_ITEMS, for two reasons. They stay unit-testable without dragging
 * lucide-react into the test environment (every nav item carries an icon
 * component), and the gating rule ends up written once instead of copied into
 * the sidebar, the mobile nav, the redirect and the title bar.
 *
 * AdminNavGroup itself is declared in @/types — this module already imports
 * Permission from there, and owning the type here would make the two files
 * import each other.
 */

export type { AdminNavGroup };

export const ADMIN_NAV_GROUP_LABELS: Record<AdminNavGroup, string> = {
  requests: "Requests",
  content: "Content",
  system: "System",
};

/** Render order. Also the order firstPermittedPath walks. */
const GROUP_ORDER: AdminNavGroup[] = ["requests", "content", "system"];

/** Where a user with no permissions at all still lands. Settings has no gate. */
const FALLBACK_PATH = "/admin/settings";

export interface NavGate {
  isSuperAdmin: boolean;
  permissions: Permission[];
}

/** The structural subset of IconNavItem these helpers need. */
export interface GatedNavItem {
  label: string;
  href: string;
  exact?: boolean;
  superAdminOnly?: boolean;
  permission?: Permission;
  group: AdminNavGroup;
}

export function canSeeNavItem(item: GatedNavItem, gate: NavGate): boolean {
  if (gate.isSuperAdmin) return true;
  if (item.superAdminOnly) return false;
  return !item.permission || gate.permissions.includes(item.permission);
}

export function visibleNavItems<T extends GatedNavItem>(items: T[], gate: NavGate): T[] {
  return items.filter((item) => canSeeNavItem(item, gate));
}

/**
 * Grouped for rendering. A group with nothing visible in it is omitted
 * entirely — a heading over an empty list is worse than no heading.
 */
export function groupNavItems<T extends GatedNavItem>(
  items: T[],
  gate: NavGate,
): { group: AdminNavGroup; label: string; items: T[] }[] {
  const visible = visibleNavItems(items, gate);
  return GROUP_ORDER.map((group) => ({
    group,
    label: ADMIN_NAV_GROUP_LABELS[group],
    items: visible.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);
}

/**
 * Where /admin sends someone. Settings is ungated, so a target always exists
 * and the redirect cannot loop.
 */
export function firstPermittedPath(items: GatedNavItem[], gate: NavGate): string {
  return visibleNavItems(items, gate)[0]?.href ?? FALLBACK_PATH;
}

/**
 * The current page's name, for the top bar.
 *
 * Gated deliberately. The portal 404s on routes the viewer lacks permission
 * for, but the layout — and therefore this bar — renders above that 404. An
 * ungated lookup would print "Applications" over the not-found page and
 * disclose the module's existence, which is the whole thing the 404 gating
 * (umbrella §3.1) exists to prevent.
 *
 * Longest match wins so a nested route beats its parent.
 */
export function adminPageTitle(
  items: GatedNavItem[],
  pathname: string,
  gate: NavGate,
): string {
  const match = visibleNavItems(items, gate)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? "Admin";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- admin-nav`
Expected: PASS, 19 tests.

- [ ] **Step 5: Add `group` to the nav item type**

`AdminNavGroup` already exists from Step 3. This step adds the field that uses it.

In `src/types/index.ts`, extend `IconNavItem` (lines 21-29):

```ts
export interface IconNavItem extends NavItem {
  icon: LucideIcon;
  /** Match the route exactly instead of by prefix. */
  exact?: boolean;
  /** Render only for SuperAdmins (page is SuperAdmin-gated). */
  superAdminOnly?: boolean;
  /** Render only for users holding this permission (page is permission-gated). */
  permission?: Permission;
  /** Sidebar section. See ADMIN_NAV_GROUP_LABELS in src/lib/admin-nav.ts. */
  group: AdminNavGroup;
}
```

No change to `src/lib/admin-nav.ts` is needed — Step 3 already wrote it importing and re-exporting `AdminNavGroup` from `@/types`.

- [ ] **Step 6: Regroup and reorder the nav table**

In `src/features/admin/data.ts`, replace `ADMIN_NAV_ITEMS` entirely. **Dashboard Overview is gone** (Task 9 turns `/admin` into a redirect), `LayoutDashboard` leaves the import list, and the flat order below is what `firstPermittedPath` walks:

```ts
export const ADMIN_NAV_ITEMS: IconNavItem[] = [
  { label: "Applications", href: "/admin/applications", icon: Inbox, permission: "process-applications", group: "requests" },
  { label: "Incident Reports", href: "/admin/complaints", icon: Scale, permission: "handle-complaints", group: "requests" },
  { label: "Appointments", href: "/admin/appointments", icon: CalendarClock, permission: "process-appointments", group: "requests" },
  { label: "Assistance Requests", href: "/admin/assistance", icon: HeartHandshake, permission: "handle-assistance", group: "requests" },
  { label: "Inquiries", href: "/admin/inquiries", icon: MessagesSquare, permission: "handle-inquiries", group: "requests" },
  { label: "News & Announcements", href: "/admin/news", icon: Megaphone, permission: "manage-news", group: "content" },
  { label: "Event Calendar", href: "/admin/events", icon: CalendarDays, permission: "manage-news", group: "content" },
  { label: "Transparency", href: "/admin/transparency", icon: FileStack, permission: "manage-transparency", group: "content" },
  { label: "Officials", href: "/admin/officials", icon: Users, permission: "manage-officials", group: "content" },
  { label: "Site Content", href: "/admin/site-content", icon: PanelsTopLeft, permission: "manage-site-content", group: "content" },
  { label: "Services Management", href: "/admin/services", icon: Landmark, superAdminOnly: true, group: "system" },
  { label: "Audit Logs", href: "/admin/audit", icon: History, superAdminOnly: true, group: "system" },
  { label: "Settings", href: "/admin/settings", icon: Settings, group: "system" },
];
```

- [ ] **Step 7: Typecheck, lint, full unit run**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all clean. `AdminSidebar` still compiles — it filters with its own inline predicate until Task 10 replaces it.

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin-nav.ts tests/unit/admin-nav.test.ts src/types/index.ts src/features/admin/data.ts
git commit -m "$(cat <<'EOF'
feat(admin): one gate for the nav, grouped into Requests/Content/System

The rule deciding which links a staff member sees was inline in the sidebar
and about to be copied into the redirect and the title bar. It moves to
src/lib/admin-nav.ts as pure functions over a list, with tests.

adminPageTitle is gated too, deliberately: the layout renders above the
portal's 404, so an ungated lookup would name a module the viewer is not
supposed to know exists.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Retire the Dashboard Overview

**Files:**
- Modify: `src/app/admin/(portal)/page.tsx` (becomes a redirect)
- Delete: `src/features/admin/components/content-hub.tsx`
- Delete: `src/features/admin/components/recent-drafts.tsx`
- Delete: `src/features/admin/components/audit-log-panel.tsx`
- Delete: `src/features/admin/components/content-type-card.tsx`
- Modify: `src/features/admin/index.ts` (drop the `ContentHub` export)
- Modify: `src/features/admin/data.ts` (drop `ADMIN_USER`, `CONTENT_TYPE_ACTIONS`, `RECENT_DRAFTS`, `DRAFT_STATUS_LABELS`)
- Modify: `src/types/index.ts` (drop `ContentDraft`, `ContentTypeAction`)

**Interfaces:**
- Consumes: `firstPermittedPath(items, gate)` and `ADMIN_NAV_ITEMS` from Task 8.

- [ ] **Step 1: Turn /admin into a redirect**

Replace `src/app/admin/(portal)/page.tsx` entirely:

```tsx
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth";
import { firstPermittedPath } from "@/lib/admin-nav";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";

/**
 * /admin is a doorway, not a destination.
 *
 * It used to render a Content Hub: three shortcut cards, a mock "Recent
 * Drafts" list, and a duplicate of the audit log that /admin/audit already
 * owns. The owner removed the panels, which left nothing to land on.
 *
 * Settings carries no permission requirement, so firstPermittedPath always
 * resolves and this cannot loop.
 */
export default async function AdminIndexPage() {
  const user = await requireSessionUser();
  redirect(
    firstPermittedPath(ADMIN_NAV_ITEMS, {
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.permissions,
    }),
  );
}
```

Note there is no `metadata` export: the page never renders.

- [ ] **Step 2: Delete the hub components**

```bash
git rm src/features/admin/components/content-hub.tsx src/features/admin/components/recent-drafts.tsx src/features/admin/components/audit-log-panel.tsx src/features/admin/components/content-type-card.tsx
```

- [ ] **Step 3: Drop the barrel export**

In `src/features/admin/index.ts`, delete line 4:

```ts
export { ContentHub } from "./components/content-hub";
```

- [ ] **Step 4: Delete the dead seed data**

In `src/features/admin/data.ts`, delete `ADMIN_USER`, `CONTENT_TYPE_ACTIONS`, `RECENT_DRAFTS` and `DRAFT_STATUS_LABELS` in full. `ADMIN_USER` is already unreferenced and its avatar is the last `lh3` hotlink in this file.

Then prune the now-unused imports from the top of the file: `Gavel`, `LayoutDashboard`, `Newspaper`, `PartyPopper`, and the `AdminTeamMember` / `ContentDraft` / `ContentTypeAction` type imports if nothing else in the file uses them.

Run: `npm run lint`
Expected: names any import that is now unused. Remove exactly those.

- [ ] **Step 5: Delete the dead types**

In `src/types/index.ts`, delete the `ContentDraft` interface (line ~472) and the `ContentTypeAction` interface (ending line ~495 with the `permission?: Permission` field). Keep `AdminTeamMember` if `settings-panel.tsx` still uses it.

Run: `grep -rn "ContentDraft\|ContentTypeAction" src/`
Expected: no output. If there is output, that file still needs the type — stop and reassess rather than deleting its usage.

- [ ] **Step 6: Typecheck, lint, unit**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all clean.

- [ ] **Step 7: Verify in the browser**

1. Sign in as a SuperAdmin → landing on `/admin` redirects to `/admin/applications`.
2. Navigate to `/admin` directly → same redirect, no flash of an empty hub.
3. `/admin/audit` still lists the audit log in full.
4. If a non-SuperAdmin account is available, confirm it lands on its first permitted module instead.

- [ ] **Step 8: Commit**

```bash
git add -u
git add src/app/admin/\(portal\)/page.tsx src/features/admin/index.ts src/features/admin/data.ts src/types/index.ts
git commit -m "$(cat <<'EOF'
refactor(admin): /admin is a doorway now, not a dashboard

The overview held three shortcut cards, a mock Recent Drafts list, and a
second copy of the audit log that /admin/audit already owns. With the panels
removed there was nothing to land on, so /admin redirects to the first module
the signed-in user can actually reach.

Takes ADMIN_USER with it — already unreferenced, and the last lh3 hotlink in
the admin seed data.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The collapsible grouped sidebar

**Files:**
- Create: `src/features/admin/components/admin-shell.tsx`
- Modify: `src/features/admin/components/admin-sidebar.tsx` (rewrite)
- Modify: `src/features/admin/components/admin-mobile-nav.tsx`
- Modify: `src/app/admin/(portal)/layout.tsx`

**Interfaces:**
- Consumes: `groupNavItems(items, gate)`, `ADMIN_NAV_ITEMS`, `Tooltip({ label, children })`, `NavLink({ item, className, activeClassName, exact, children })`.
- Produces: `AdminShell({ user, defaultCollapsed, children })`; `AdminSidebar({ className?, isSuperAdmin, permissions, collapsed, onToggle? })` — the mobile drawer passes `collapsed={false}` and no `onToggle`, which hides the toggle button.

- [ ] **Step 1: Rewrite the sidebar**

Replace `src/features/admin/components/admin-sidebar.tsx` entirely:

```tsx
"use client";

import Image from "next/image";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Permission } from "@/types";
import { cn } from "@/lib/utils";
import { SITE } from "@/constants/site";
import { groupNavItems } from "@/lib/admin-nav";
import { NavLink } from "@/components/navigation/nav-link";
import { Tooltip } from "@/components/ui/tooltip";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";

interface AdminSidebarProps {
  /** Extra classes on the aside — used to control overlay vs. fixed rendering. */
  className?: string;
  /** Gates SuperAdmin-only nav items (e.g. Services Management). */
  isSuperAdmin: boolean;
  /** Gates permission-scoped nav items. Ignored for SuperAdmins, who hold everything. */
  permissions: Permission[];
  /** 72px icon rail instead of the 256px labelled rail. */
  collapsed: boolean;
  /** Omitted by the mobile drawer, which has nothing to collapse into. */
  onToggle?: () => void;
}

/**
 * Left navigation rail for the admin portal.
 *
 * A client component so it can own the collapsed rendering and read
 * ADMIN_NAV_ITEMS whole. It used to be a Server Component that split each
 * item's icon out before crossing into NavLink, because an icon is a component
 * and components do not cross the RSC boundary as props; that workaround is
 * gone with the boundary.
 *
 * Thirteen flat links did not scan, so they render under three group headings.
 * Collapsed, the headings become hairline rules — 72px has no room for a word
 * but does have room for the grouping.
 */
export function AdminSidebar({
  className,
  isSuperAdmin,
  permissions,
  collapsed,
  onToggle,
}: AdminSidebarProps) {
  const groups = groupNavItems(ADMIN_NAV_ITEMS, { isSuperAdmin, permissions });

  return (
    <aside
      aria-label="Admin navigation"
      className={cn(
        "relative flex h-screen flex-col overflow-y-auto overflow-x-hidden border-r border-white/10 bg-ink-950 py-6 text-ink-300 transition-[width] duration-200",
        collapsed ? "w-18" : "w-64",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
      />
      <div
        className={cn(
          "relative mb-6 flex items-center gap-3",
          collapsed ? "flex-col px-2" : "px-5",
        )}
      >
        <Image
          src={SITE.sealImage}
          alt={`${SITE.name} seal`}
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight tracking-tight text-white">
              Barangay Portal
            </h2>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              San Fernando
            </p>
          </div>
        ) : null}
        {onToggle ? (
          <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        ) : null}
      </div>

      <nav className="relative flex flex-1 flex-col gap-5 px-2">
        {groups.map((section) => (
          <div key={section.group}>
            {collapsed ? (
              <div className="mx-3 mb-2 border-t border-white/10" aria-hidden="true" />
            ) : (
              <p className="mb-1.5 px-3 text-[0.68rem] font-bold uppercase tracking-widest text-ink-500">
                {section.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const link = (
                  <NavLink
                    item={{ label: item.label, href: item.href }}
                    exact={item.exact}
                    className={cn(
                      "group relative flex h-10 items-center rounded-lg text-sm font-medium text-ink-300 transition-colors hover:bg-white/5 hover:text-white",
                      collapsed ? "justify-center px-0" : "gap-3 px-3",
                    )}
                    activeClassName="bg-white/10 text-white before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-brand-400 [&>svg]:text-brand-400"
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </NavLink>
                );
                return (
                  // Tooltip wraps its child in an inline-flex span that shrinks
                  // to the icon, so the collapsed row has to be centred by the
                  // li rather than by the link's own justify-center.
                  <li key={item.href} className={collapsed ? "flex justify-center" : undefined}>
                    {collapsed ? <Tooltip label={item.label}>{link}</Tooltip> : link}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

The `Siren` import and the Emergency Response button are gone — a dead stub, on the open-items list since the table-standards spec.

- [ ] **Step 2: Create the shell**

Create `src/features/admin/components/admin-shell.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import type { SessionUser } from "@/types";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopBar } from "./admin-topbar";

const COOKIE = "sf-admin-sidebar";

interface AdminShellProps {
  user: SessionUser;
  /** Read server-side from the cookie, so a collapsed rail renders collapsed on first paint. */
  defaultCollapsed: boolean;
  children: React.ReactNode;
}

/**
 * Owns the sidebar's collapsed state for both the rail and the main column's
 * left margin — the two must move together or the layout tears.
 *
 * The initial value comes from the server via a cookie rather than from
 * localStorage in an effect: an effect runs after paint, so a collapsed
 * sidebar would render expanded and snap shut on every load.
 */
export function AdminShell({ user, defaultCollapsed, children }: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      document.cookie = `${COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar
        className="fixed left-0 top-0 z-30 hidden md:flex"
        isSuperAdmin={user.isSuperAdmin}
        permissions={user.permissions}
        collapsed={collapsed}
        onToggle={toggle}
      />
      <div
        className={cn(
          "flex min-h-screen w-full flex-1 flex-col transition-[margin] duration-200",
          collapsed ? "md:ml-18" : "md:ml-64",
        )}
      >
        <AdminTopBar user={user} />
        <main className="mx-auto w-full max-w-(--container-page) flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Keep the mobile drawer expanded**

In `src/features/admin/components/admin-mobile-nav.tsx`, pass the new prop at line 38. A drawer that is already a drawer has nothing to collapse into, so it gets no toggle:

```tsx
            <AdminSidebar
              className="shadow-xl"
              isSuperAdmin={isSuperAdmin}
              permissions={permissions}
              collapsed={false}
            />
```

- [ ] **Step 4: Read the cookie in the layout**

Replace `src/app/admin/(portal)/layout.tsx`:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { AdminUserProvider } from "@/features/admin/components/admin-user-context";

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  // Seeds AdminShell's initial state so a collapsed sidebar renders collapsed
  // on first paint rather than snapping shut after hydration.
  const cookieStore = await cookies();
  const collapsed = cookieStore.get("sf-admin-sidebar")?.value === "collapsed";

  return (
    <AdminUserProvider userId={user.id}>
      <AdminShell user={user} defaultCollapsed={collapsed}>
        {children}
      </AdminShell>
    </AdminUserProvider>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Verify in the browser**

1. `/admin/officials` → sidebar shows **Requests / Content / System** headings over the 13 links; no Dashboard Overview, no Emergency Response.
2. Click the collapse control → rail narrows to 72px, labels vanish, main content's left edge follows with no gap or overlap.
3. **Reload while collapsed** → it renders collapsed immediately, with no expanded flash.
4. Hover a collapsed icon → tooltip names the link.
5. Expand again, reload → stays expanded.
6. Active-route highlight shows the amber left bar in both states.
7. Resize below `md` → the fixed rail hides, the hamburger opens the drawer, and the drawer is expanded with no collapse button.
8. If a non-SuperAdmin account is available, confirm the System group shows Settings only, and that no group heading appears over an empty list.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/components/admin-shell.tsx src/features/admin/components/admin-sidebar.tsx src/features/admin/components/admin-mobile-nav.tsx src/app/admin/\(portal\)/layout.tsx
git commit -m "$(cat <<'EOF'
feat(admin): a sidebar that groups its links and gets out of the way

Thirteen flat items did not scan; they now sit under Requests, Content and
System, and the rail collapses to a 72px icon strip with tooltips.

The collapsed state is a cookie read in the layout, not localStorage read in
an effect — an effect runs after paint, so a collapsed sidebar would render
expanded and snap shut on every load. AdminShell owns the state because the
rail and the main column's margin have to move together.

Emergency Response goes: a dead stub since the table-standards spec.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: The floating top bar

**Files:**
- Modify: `src/features/admin/components/admin-topbar.tsx` (rewrite)

**Interfaces:**
- Consumes: `adminPageTitle(items, pathname, gate)` and `ADMIN_NAV_ITEMS` from Task 8; `AdminShell` already renders it with a `user` prop.

- [ ] **Step 1: Rewrite the top bar**

Replace `src/features/admin/components/admin-topbar.tsx` entirely:

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/types";
import { cn } from "@/lib/utils";
import { adminPageTitle } from "@/lib/admin-nav";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";
import { AdminGlobalSearch } from "@/features/admin/components/admin-global-search";
import { AdminMobileNav } from "@/features/admin/components/admin-mobile-nav";
import { SignOutButton } from "@/features/admin/components/sign-out-button";

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * Floating app bar for the admin portal: current page, search, profile.
 *
 * Styled after the public site's header (`SiteHeader`) — a rounded, blurred
 * bar that takes its border and shadow only once there is content behind it,
 * rather than a flat white strip wearing a hard rule at all times.
 *
 * The title is the current page rather than "San Fernando Admin", which the
 * sidebar already says. `adminPageTitle` is permission-gated: this bar renders
 * above the portal's 404, so an ungated lookup would name a module the viewer
 * is not supposed to know exists.
 *
 * Notifications and Help used to sit here. Both were stubs wired to nothing.
 */
export function AdminTopBar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const title = adminPageTitle(ADMIN_NAV_ITEMS, pathname, {
    isSuperAdmin: user.isSuperAdmin,
    permissions: user.permissions,
  });

  return (
    <header className="sticky top-0 z-40 px-4 pt-4 md:px-8">
      <div
        className={cn(
          "flex h-14 w-full items-center justify-between gap-4 rounded-2xl border px-3 transition-all duration-300 sm:px-5",
          scrolled
            ? "border-ink-200/70 bg-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md"
            : "border-transparent bg-white/60 backdrop-blur-md",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <AdminMobileNav isSuperAdmin={user.isSuperAdmin} permissions={user.permissions} />
          <h1 className="truncate text-lg font-semibold tracking-tight text-ink-900 md:text-xl">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <AdminGlobalSearch />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-ink-900">
                {user.fullName}
              </p>
              <p className="text-xs capitalize text-ink-500">
                {user.isSuperAdmin ? "SuperAdmin" : user.statusLabel}
              </p>
            </div>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white ring-2 ring-brand-400"
            >
              {initialsOf(user.fullName) || "?"}
            </span>
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
```

`Bell` and `CircleHelp` leave the imports with the buttons.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Verify in the browser**

1. `/admin/officials` → the bar reads **Officials**, not "San Fernando Admin". Check `/admin/news` reads **News & Announcements**.
2. Scroll a long page (`/admin/audit`) → the bar gains its border and shadow, and content is blurred behind it, not hidden under a hard strip.
3. No bell, no question mark.
4. Global search still opens and navigates to a record.
5. Sign out still works.
6. At 390px the title truncates rather than pushing the avatar off-screen, and the hamburger still opens the drawer.
7. Visit a route the account has no permission for → the 404 renders and the bar reads **Admin**, naming nothing.

- [ ] **Step 4: Full check and commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run build`
Expected: all clean. The build is worth running once at the end — Task 9 changed a route's rendering mode from static to a redirect.

```bash
git add src/features/admin/components/admin-topbar.tsx
git commit -m "$(cat <<'EOF'
feat(admin): a top bar that floats, and says where you are

Restyled after the public site's header — rounded, blurred, taking its shadow
only once there is content behind it. The title becomes the current page;
"San Fernando Admin" repeated what the sidebar already says.

The title lookup is permission-gated on purpose: this bar renders above the
portal's 404, so naming the module would undo the gating.

Notifications and Help are deleted. Both were wired to nothing.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

Run the spec's §12 list end to end against the running app before reporting the plan complete. In particular, re-check items 2–5 (the publish paths) after the shell tasks, since Task 10 and 11 changed the layout the officials drawer renders inside.

Report to the owner:

- **Migration `0022` is unapplied.** It joins `0012`–`0021` in the staging/production backlog. Until it reaches an environment, saving an official into **Members** fails with an unknown-enum-label error, and the six `quick_services` rows sit unreferenced in `site_items` (harmless — nothing reads them once Task 5 lands).
- `docs/BACKEND_HANDOFF.md` needs a changelog entry for this pass, and CLAUDE.md's admin-portal paragraphs need updating (the Dashboard Overview seed is gone; `src/features/home/data.ts` exists again). Offer both rather than assuming.
