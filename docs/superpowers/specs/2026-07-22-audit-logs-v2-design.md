# Audit Logs v2 — Design

**Date:** 2026-07-22
**Status:** Approved
**Umbrella:** `docs/superpowers/specs/2026-07-22-portal-overhaul-design.md` (sub-project 3 of 9)
**Predecessor:** `docs/superpowers/plans/2026-07-15-auth-foundation.md` (built `audit_log` + `recordActivity`)

## 1. Goal

Turn the existing append-only activity feed into a real, filterable, immutable Audit Log:
a SuperAdmin-only page with the columns the owner specified, a controlled Action Type
dropdown, and coverage of the events currently missing (login, logout, file upload, file
delete, role changes).

## 2. What exists today

`public.audit_log` (migration `0001`): `id`, `actor_id`, `actor_name`, `action`,
`entity_type`, `entity_id`, `detail`, `created_at`. `recordActivity()` in `src/lib/audit.ts`
is fire-and-forget by design — an audit failure must never roll back the action it
records. It is called **75 times across 20 of the 24 action files**.

Read side: `listRecentActivity(limit = 8)` → `PublishingActivity` on the dashboard.

### 2.1 Three findings that shape the design

**a) `detail` carries two different kinds of value.** Most call sites pass the entity's
human name (`parsed.data.title`, `.label`, `.number`, `row.title`). But `complaints.ts`
and `assistance.ts` pass `parsed.data.remarks` — genuine free-text staff remarks, not a
label. So `entity_label` must be a **new column**, not a rename of `detail`. Both are
needed.

**b) Ticket entities already have a human-readable id.** The four ticket flows pass
`data.ticket_no` (e.g. `APP-2026-00001`) as `entity_id`, not a UUID. For those rows the id
*is* the label; content and user rows need the separate column.

**c) `audit_log` has a permissive read policy.** Migration `0001` created
`"audit log readable by signed-in staff" ... for select to authenticated using (true)`,
and `listRecentActivity` reads through the **anon-key** server client rather than the
service-role client. Every other table in this codebase has RLS enabled with **zero**
policies and reads through the service-role client behind an explicit code check. Making
the log SuperAdmin-only in application code while leaving that policy in place would be a
hole in the gate. The policy is dropped and reads move to the service-role client, matching
the convention. This is defense-in-depth alignment, not a proven live leak — the session
lives in httpOnly cookies, so a browser client cannot trivially assume the `authenticated`
role.

## 3. Decisions

### 3.1 `action_type` enum alongside the existing `action` text

The Action Type dropdown needs controlled values; `action` holds English prose
(`"archived announcement"`). Per the owner's Q7 choice, `action` is **kept** as secondary
human-readable detail rather than dropped.

```sql
create type public.audit_action as enum (
  'create','update','delete','archive','restore','publish','unpublish',
  'save_draft','approve','reject','login','logout','file_upload','file_delete',
  'role_change','password_reset','reorder'
);
```

Sixteen values come from the owner's required list; `reorder` is added because 8 existing
call sites record reordering and folding them into `update` would bury them.

`action_type` is `NOT NULL` with **no default** — `recordActivity` is the only writer and
must always classify. A default would let a miss pass silently.

### 3.2 Mapping the existing 75 call sites

| Existing action text | `action_type` |
| --- | --- |
| `created …`, `added …`, `encoded walk-in …` | `create` |
| `updated …`, `took up …`, `released …`, `completed …`, `showed/hid achievement`, `enabled/disabled user` | `update` |
| `deleted …` | `delete` |
| `archived …`, `retired … category` | `archive` |
| `restored … category` | `restore` |
| `published …` | `publish` |
| `returned … to draft` | `save_draft` |
| `submitted … for review` | `update` |
| `approved …`, `confirmed …`, `granted …`, `resolved …` | `approve` |
| `rejected …`, `declined …`, `dismissed …` | `reject` |
| `reordered …` | `reorder` |
| `uploaded … photos` | `file_upload` |
| `removed … photo` | `file_delete` |
| `changed own password` | `password_reset` |

`approve`/`reject` are the positive/negative decision axis across all four ticket flows,
which is what a filtering user actually wants. `resolved complaint` is not literally an
approval, but it is the positive terminal outcome and belongs with its siblings.

`updateTeamUser` emits **`role_change`** when `permissions` or `is_superadmin` differ from
the stored row, and `update` otherwise. That requires reading the previous values, which
the action already does for `email`.

### 3.3 Immutability is enforced, not assumed

RLS blocks nothing for the service-role client, so today any future action file could
`UPDATE` the log. Two mechanisms, because either alone is weak:

```sql
revoke update, delete on public.audit_log from anon, authenticated, service_role;

create trigger audit_log_no_update before update on public.audit_log
  for each row execute function public.reject_audit_mutation();
create trigger audit_log_no_delete before delete on public.audit_log ...
```

The `REVOKE` stops the roles the app actually uses. The trigger fires even for the table
owner, which is what makes it real rather than advisory. A superuser can still
`ALTER TABLE … DISABLE TRIGGER` for a deliberate migration; that is the intended escape
hatch, and it leaves a trace in the migration history.

Consequence worth stating: **no future migration can retro-edit audit rows without
explicitly disabling the trigger.** That is the point.

### 3.4 Search is substring now, fuzzy in sub-project 4

The owner requires fuzzy search on Audit Logs. Fuzzy infrastructure (`pg_trgm` + RPCs) is
sub-project 4, which depends on nothing here. Shipping a stub or waiting would both be
worse than shipping the page with server-side `ilike` search now — reusing the escaping
helpers already proven in `src/features/transparency/queries.ts` — and swapping the
matcher underneath in sub-project 4. The UI, filters, sorting, and pagination do not change
when that happens.

This is a **deliberate partial** against the stated requirement, sequenced, not forgotten.

### 3.5 The page is SuperAdmin-only and server-driven

`/admin/audit`, gated by `requireSuperAdmin()`, with a new `ADMIN_NAV_ITEMS` entry carrying
`superAdminOnly: true` — so it 404s and stays out of the nav for everyone else, exactly as
sub-project 2 established.

Unlike the eight existing managers, this table is **server-driven via searchParams**
(`q`, `type`, `actor`, `sort`, `dir`, `page`), not a client component holding the full
dataset. The log grows without bound; shipping it all to the browser is the one case where
the established manager pattern is wrong. `/transparency/uploads` already demonstrates the
searchParams-driven server table in this codebase.

### 3.6 `recordActivity` takes an options object

Seven positional parameters would be unreadable. The call becomes:

```ts
await recordActivity(actor, {
  type: "update",
  action: "updated official",
  entityType: "official",
  entityId: id,
  entityLabel: parsed.data.name,
});
```

`type`, `action`, and `entityType` are required; `entityId`, `entityLabel`, and `detail`
are optional. TypeScript enforces `type` against the enum union at all 75 sites.

### 3.7 Dashboard: renamed, not removed

`PublishingActivity` becomes `AuditLogPanel` — "Audit Logs", the 8 most recent entries,
with a "View all" link to `/admin/audit` **shown only to SuperAdmins**. Non-SuperAdmins
keep the recent-activity timeline on their dashboard but cannot reach the full log.

The dead `PUBLISHING_ACTIVITY` constant and `PublishingActivityEntry` type are deleted —
`BACKEND_HANDOFF.md` §3E.3 records them as unused since 2026-07-15.

## 4. Scope

| In scope | Out of scope |
| --- | --- |
| Migration `0014`: enum, `entity_label`, immutability, indexes, drop the read policy | `pg_trgm` fuzzy search (sub-project 4) |
| `recordActivity` options object + 75 call-site conversions | Retention/archival policy for old rows |
| Login, logout, file upload, file delete, role change coverage | The permissive `profiles` read policy (noted, not touched) |
| `/admin/audit` page + server-driven table | Exporting the log (CSV/PDF) |
| Dashboard rename + dead mock removal | Audit entries for anonymous resident submissions (Q8: not logged) |

## 5. Files

- `supabase/migrations/0014_audit_log_v2.sql` — **new**
- `src/lib/audit.ts` — options object, enum type
- `src/types/index.ts` — `AuditActionType`, `AuditEntry` gains `actionType`/`entityLabel`; delete `PublishingActivityEntry`
- 20 action files — 75 conversions
- `src/features/admin/actions/auth.ts` — login/logout (currently **zero** audit calls)
- `src/features/admin/actions/media.ts`, `documents.ts` — file upload/delete (currently **zero**)
- `src/features/admin/actions/users.ts` — `role_change` detection
- `src/features/admin/queries/audit.ts` — `searchAuditLog`, service-role client
- `src/app/admin/(portal)/audit/page.tsx` — **new**
- `src/features/admin/components/audit-log-manager.tsx` — **new**
- `src/features/admin/components/publishing-activity.tsx` → `audit-log-panel.tsx`
- `src/features/admin/data.ts` — nav entry; delete `PUBLISHING_ACTIVITY`

## 6. Migration risk

`0014` is the first migration in this programme and the owner applies migrations manually.
It is **additive and reversible up to the trigger**: new type, two new columns, a backfill,
two indexes, one dropped policy, two triggers. The backfill classifies existing rows from
their `action` text using the §3.2 table; rows that match nothing fall to `update`, which is
the honest default for an unrecognised edit.

The one-way door is the immutability trigger — after it lands, correcting a mis-backfilled
row requires disabling it deliberately. So the backfill runs **before** the trigger is
created, in the same migration.

## 7. Verification

1. `npm run typecheck` — proves all 75 conversions carry a valid enum member.
2. `npm run lint`.
3. **Owner applies `0014` to staging.** Nothing below can run before that.
4. Signed in as SuperAdmin: `/admin/audit` lists entries with User / Action Type / Target
   Entity / Date & Time; the dropdown filters; sorting and pagination work; search matches.
5. Signed in as non-SuperAdmin: `/admin/audit` 404s and is absent from the nav.
6. Perform one action of each family (edit an official, publish an announcement, upload a
   photo, log out and back in) and confirm each appears with the right type and label.
7. Immutability: `update public.audit_log set action = 'x' where id = <n>` from the SQL
   editor must raise. Same for `delete`.
8. Dashboard shows "Audit Logs" with a View-all link for SuperAdmins only.

Steps 4–8 need an authenticated session, which the sub-project 2 spec §6 already flags as
an open verification gap. Same constraint, same workaround (local session stub), same
honesty about what that does and does not prove.
