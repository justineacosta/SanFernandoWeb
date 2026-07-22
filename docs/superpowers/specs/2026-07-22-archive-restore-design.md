# Archive & Restore — Design

**Sub-project 6 of the portal overhaul.** Umbrella: `2026-07-22-portal-overhaul-design.md`
§3.2, §3.6. Date: 2026-07-22. Migration: **`0020`**.

## 1. Why this exists, and what it is not

The umbrella spec listed this as a build. A read of the code first says it is mostly not:

| §3.2 / §3.6 requirement | State before this sub-project |
| --- | --- |
| `archived` as a soft-delete state | ✅ `public.content_status` on all 7 content tables |
| An archive action per content type | ✅ `archiveX()` or `setXStatus(id, "archived")` on all 7 |
| Archived records restorable | ✅ by re-publishing from the drawer |
| Archived hidden from the public site | ✅ the `.eq("status","published")` filter in the query layer |
| Categories get a hide flag, not an archive | ✅ `is_active` on all three category tables, already filtered |
| **Delete is SuperAdmin-only** | ❌ **every delete is `checkPermission(<module>)`** |
| **Delete only from `archived`** | ❌ **no delete checks the record's status** |
| An Archived view holding the Delete action | ❌ archived rows sit in the main table behind a dropdown |

So the substrate is built and the **safety rule on top of it is not**. That is what this
sub-project is.

### 1.1 The defect

Seven Server Actions permanently destroy a record and its Storage objects behind nothing
but the module permission, from any state including `published`:

`deleteOfficial`, `deleteLegislative`, `deleteTransparencyDocument`,
`deleteTransparencyProject`, `deleteAchievement`, and the two `deleteX` paths reachable from
the news and events drawers.

A staff member holding `manage-transparency` can therefore erase a published ordinance — the
row and its PDF — in one click. That PDF is a public legal record and very likely the
barangay's only digital copy. There is no undo, no recycle bin, and no restore path.

Umbrella §3.2 was written to prevent exactly this and was never implemented. **Closing it is
the point of this sub-project;** the Archived view is the surface that makes the rule
coherent, not the goal.

## 2. Decisions

### 2.1 Delete requires SuperAdmin *and* an already-archived record

Two conditions, checked server-side in every delete action:

```
const actor = await checkSuperAdmin();        // not checkPermission(module)
if (!actor) return { error: NOT_FOUND };
// …then, in the same query that fetches the row for cleanup:
if (row.status !== "archived") return { error: "Archive this first…" };
```

The status check is **not** a client-side convenience. A stale tab, a replayed request, or a
deep link is enough to reach the action directly — Server Actions are public HTTP endpoints.

The pair is what makes it safe. SuperAdmin alone still allows a mis-click on a live record;
archived-only alone still lets any editor purge one. Together, destroying something takes two
deliberate acts by the most privileged account.

### 2.2 Restore returns a record to `draft`, never to `published`

Restoring is "take this out of the bin", not "put it back on the website". A record
un-archived straight to `published` would reappear publicly the moment someone was curious
enough to click Restore — and the click that undoes a mistake should not itself be able to
make one.

`draft` is the state the record was reachable from before, so republishing is one more
deliberate step through the editor that already exists.

This also gives the audit log its missing verb. `restore` has been in `AUDIT_ACTIONS` since
migration `0014` and nothing has ever written it; un-archiving currently files as `publish`
or `update`, so the log cannot answer "what has been brought back". Every restore action
records `type: "restore"`.

### 2.3 A separate Archived view, not a status in the dropdown

Each manager gets an **Active | Archived (n)** toggle above its table. Archived rows leave
the main list entirely and `archived` is removed from the status dropdown, which now only
offers states a live record can hold.

Three reasons over the dropdown:

1. **Delete gets a home.** The rule in §2.1 is "only from the Archived view", which is
   legible as a place and confusing as a filter value.
2. **The default view stops mixing retired records with live ones.** Today a manager opens
   on "All Statuses" and shows both.
3. **It matches what already shipped.** Settings grew an *Archived accounts* disclosure last
   week; one answer for the portal beats two.

The toggle lives in `src/components/ui/view-toggle.tsx` next to the other sub-project 5
primitives — six managers need it, and six copies would drift.

**Consequence for reordering.** Officials and projects hide their reorder arrows whenever a
filter or a non-`order` sort is active, because "move up" only means something when the row
above is the one that would swap. The Archived view is the same situation: it is a filtered
list. Arrows hide there too.

### 2.4 Row actions differ by view

| | Active view | Archived view |
| --- | --- | --- |
| Edit / View | Edit | View details (read-only drawer as today) |
| Archive | ✅ | — |
| Restore | — | ✅ (module permission) |
| Delete | **never** | ✅ **SuperAdmin only** |

A non-SuperAdmin in the Archived view sees Restore and no Delete — not a disabled Delete.
Showing a control that can never work teaches people to click it.

The manager needs `isSuperAdmin` to decide, and takes it as a prop from its page, which
already resolves the session user. **The prop is presentation only**; the gate is
`checkSuperAdmin()` in the action.

### 2.5 Provenance on the row (migration `0020`)

`archived_at` and `archived_by` on the 7 content tables, set by archive and cleared by
restore, with `archived_by` as `ON DELETE SET NULL`.

The audit log already knows this, but it is SuperAdmin-only — the staff member actually
looking at the Archived view holds a module permission and nothing more, so without these
columns they cannot see how long a record has been sitting there. Rows archived before the
migration keep NULLs and read "archived before 22 July 2026" rather than inventing a date.

### 2.6 Achievements are deliberately excluded

`deleteAchievement` stays on `manage-officials`. An achievement is a sub-record edited inside
an official's drawer, not a table row: it has no `content_status`, its soft state is the
existing `is_visible` toggle, and the archivable unit is the official who owns it. Giving it
its own archive lifecycle would mean an Archived view inside a drawer.

## 3. Sequence

| Phase | Content |
| --- | --- |
| A | Migration `0020`; `archived_at`/`archived_by` written by the archive paths |
| B | The seven delete actions: `checkSuperAdmin()` + archived-only, with restore actions beside them |
| C | `ViewToggle` + the Active/Archived split across the six managers |

B is the safety fix and can ship without C. C without B would be decoration.

## 4. Risks

- **Six managers change at once.** The shared toggle limits the per-manager diff to the view
  state, the row-action list, and the reorder predicate, but it is still six files.
- **`setXStatus` is used for more than archiving.** Officials and legislative drive
  draft/published/archived through one action; the archive-provenance write must key off the
  *target* status rather than being bolted onto the action's top.
- **Tightening delete could strand a record.** If an existing published record cannot be
  deleted without archiving first, that is the intent — but every manager must actually offer
  Archive on the states it can be in, or a record becomes undeletable. Verified per manager.
- **A SuperAdmin is the only account that can delete anything.** If the barangay has one
  SuperAdmin and that person is away, nothing can be purged. Accepted: purging is rare and
  archiving — which anyone with the module permission can do — is what stops publication.

## 5. Verification

Browser-driven, per `.claude/skills/verify/SKILL.md`, with the session stubbed both ways:

1. As a **non-SuperAdmin** with `manage-transparency`: the Archived view offers Restore and
   **no Delete**, and calling `deleteLegislative` directly returns `"Not found."`.
2. As a **SuperAdmin**: Delete on an *active* record is not offered, and calling the action
   on a published row is refused by the status check.
3. Archive → the row leaves the Active view, appears under Archived with "archived today by
   …", and disappears from the public page.
4. Restore → the row returns to the Active view as **Draft**, not Published, and the audit
   log holds a `restore` entry.
5. Delete from the Archived view as SuperAdmin → row and Storage objects gone.
