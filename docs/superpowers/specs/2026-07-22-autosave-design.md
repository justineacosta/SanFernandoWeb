# Autosave — Design

**Sub-project 8 of the portal overhaul.** Umbrella: `2026-07-22-portal-overhaul-design.md`
§3.7. Date: 2026-07-22. Migration: **none**.

## 1. The problem

Seven admin drawers hold unsaved work in React state and nothing else. `Drawer` closes on
**Esc** and on an **overlay click**, with no confirmation. A staff member three paragraphs
into a news body who taps Esc loses all of it, silently and instantly. So does a dropped
wifi connection, a closed tab, or a browser crash.

Nothing in `src/` reads or writes `localStorage` today. This is a clean addition.

## 2. Decisions

### 2.1 Autosave writes to the browser, never to Postgres — for every record

Umbrella §3.7 requires browser storage for a **new, never-saved** record, and forbids
touching the database "before a manual save". This spec goes further and uses browser
storage for **existing records too**. That is stricter than §3.7 asks, and satisfies it by
construction rather than by care — the same argument that made sub-project 7 sound.

The reason is a hazard §3.7 did not name. **Editing a published record does not change its
status.** `saveAnnouncement` on a `published` row updates the text in place and calls
`revalidatePath("/")`. An autosave that wrote to Postgres would therefore push a
half-rewritten announcement onto the barangay's live home page on a timer, with no click
and no review step. §3.7 says autosave "never publishes"; against this code path, a
database write *is* publishing.

Restricting DB autosave to `draft` / `in-review` would dodge that, at the cost of an
autosave that works in some drawers and not others for reasons invisible to the user.
Browser storage works identically everywhere.

What is given up: cross-device resume. A draft started on the hall PC is not offered on a
phone. For seven staff sharing a barangay office, that is not a real loss.

Consequences that follow for free:

- **No new Server Actions**, so no new public HTTP endpoints and nothing to permission-gate.
- **Nothing to exclude from the audit log** (§3.7's third bullet) — there is no write to log.
- **No migration.**

### 2.2 One hook, seven call sites

`src/hooks/use-form-draft.ts` — `useFormDraft(scope, recordId, values)`. It returns the
recovery state and two commands (`restore`, `discard`); it does not own the form's values.
Each form keeps `useState` exactly as it has it and passes `values` in.

The seven scopes are the §3.7 list: `news`, `announcement`, `event`, `official`,
`legislative`, `transparency-document`, `transparency-project`.

### 2.3 What is stored, and what is deliberately not

**Stored:** the `values` object, verbatim. All seven `*Values` types are plain JSON —
strings, numbers, booleans, nulls. No serialization layer is needed or wanted.

**Not stored:** every piece of file state. `image` / `cover` / `file` (a `File`), the news
form's `pendingPhotos`, and the `removeExisting` flags. Files cannot survive a reload, and
§3.7 requires staged uploads to stay staged. Since file state already lives *outside*
`values` in all seven forms, "text only" is enforced by what the hook is handed, not by a
rule someone has to remember.

Consequence to surface, not hide: a restored draft brings back the words and not the photos.
The recovery bar says so when the form has file state.

### 2.4 Restore is offered, never applied

On open, if a snapshot exists and differs from the record's server values, the form shows a
bar above the fields:

> Unsaved changes from 12 minutes ago. **Restore** · **Discard**

It is **not** applied automatically. For an existing record the server values may have moved
on — another editor may have published a correction in between — and silently reinstating a
stale snapshot over it would be a data-loss bug wearing a data-recovery costume.

Nothing is shown when the snapshot matches what the server already has; that is not a
recovery, it is noise.

### 2.5 Writes are debounced, and the indicator does not lie

Debounce **1.5 s** after the last keystroke. §3.7's 30-second figure describes the rejected
database design; a `localStorage` write costs nothing, so waiting 30 seconds only widens the
loss window.

The status line reads **"Recovery copy saved on this device"**, never "Saved". Editors must
not read an autosave indicator as "this is on the site". The distinction is the entire point
of §3.7 and the wording is load-bearing.

### 2.6 Keys are scoped to the signed-in user, and cleared on sign-out

Key: `sf-draft:v1:<userId>:<scope>:<recordId ?? "new">`.

A barangay hall workstation is plausibly shared. Without the user id, staff member B opening
the announcement drawer would be offered staff member A's unsaved text. Sign-out clears every
`sf-draft:v1:` key for that user.

The `v1:` prefix means a future change to the snapshot shape can be ignored rather than
migrated — an unreadable snapshot is discarded, not repaired.

### 2.7 Snapshots expire, and cannot fill the quota

- **7-day expiry**, checked on read. A draft resurfacing after a fortnight is a confusing
  artefact, not a rescue.
- **256 KB cap** per snapshot. Over it, the write is skipped and the indicator stays silent
  rather than claiming a copy that does not exist.
- `QuotaExceededError` is caught and treated as "no autosave", never as a form error. A full
  disk quota must not break the ability to save normally.

### 2.8 Cleared on success, kept on cancel

Clearing on a successful save is the point — the work is on the server. **Cancel keeps the
snapshot**, because cancel is precisely when someone wants their text back.

A "you have unsaved changes" confirm on Esc / overlay-click was considered and rejected:
autosave makes those gestures non-destructive, and a modal guarding a now-recoverable action
is friction without a payoff.

### 2.9 New records key on `"new"`, and hand off on first save

A never-saved form writes to `…:<scope>:new`. On the first successful save the form receives
an id; the snapshot is cleared (§2.8), so there is no stale `new` snapshot to collide with
the next record created in that drawer.

Only one unsaved new record per scope is retained. Starting a second new announcement while
an unsaved first exists offers the first one's text. Accepted: the alternative is a list of
anonymous drafts to choose between, which is a feature nobody asked for.

## 3. Sequence

| Phase | Content |
| --- | --- |
| A | `useFormDraft` hook + `DraftRecoveryBar` component + unit tests for the pure parts |
| B | Wire the three simplest forms (announcement, event, transparency-project) |
| C | Wire the remaining four (news, official, legislative, transparency-document) |
| D | Sign-out clearing |

## 4. Risks

- **Seven forms change at once.** Mitigated by the hook owning all the logic and each form
  gaining roughly four lines.
- **A restore that overwrites newer server data.** Addressed by §2.4 — offered, never applied
  — but it is the failure mode to verify hardest.
- **`localStorage` is synchronous.** Writes are debounced and capped, so the main-thread cost
  is a sub-millisecond `setItem` at most once per 1.5 s.
- **SSR.** The hook must not touch `window` during render; all access happens in effects and
  handlers.
- **Private browsing** can make `localStorage` throw on access, not just on write. Every entry
  point is wrapped, and failure degrades to "no autosave".

## 5. Not in scope

- **The achievements editor.** Sub-project 7 §2.4 deferred its missing commit point here
  because autosave was the sub-project "about exactly that question". Re-reading it: that
  editor already persists every field on blur, so it has autosave — what it lacks is a
  *draft* model, which is a redesign of how achievements are created, not a use of this hook.
  Recording the second look so the deferral does not silently expire.
- Ticket review drawers, settings, and account forms — not draft-capable (§3.7).

## 6. What the browser must confirm

Per `.claude/skills/verify/SKILL.md`, driven against staging.

1. Type into a new announcement, press **Esc**, reopen → recovery bar offers the text.
2. **Restore** brings the text back; **Discard** removes the bar and the key.
3. Save successfully → the key is gone, and reopening offers nothing.
4. Pick an image, type, Esc, reopen, Restore → text returns, image does not, and the bar
   says so. `announcements/` still holds 0 new objects.
5. Edit a **published** announcement, type, wait 5 s, do not save → the public page is
   unchanged and the row is untouched. This is §2.1's whole reason for existing.
6. Two users on one browser profile: A's snapshot is not offered to B.
7. Sign out → every `sf-draft:v1:` key is gone.
8. A news body over 256 KB → no write, no error, form still saves normally.
