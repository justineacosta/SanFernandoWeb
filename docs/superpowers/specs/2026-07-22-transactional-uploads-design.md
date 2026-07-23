# Transactional Uploads — Design

**Sub-project 7 of the portal overhaul.** Umbrella: `2026-07-22-portal-overhaul-design.md`
§3.3. Date: 2026-07-22. Migration: **none**.

## 1. The invariant, and where it does not hold

> A storage object exists only if a database row references it.

The transparency work of 2026-07-20 established this and made it true by construction:
`PdfUploader` is a pure file picker making no network calls, and `saveLegislative` uploads
server-side then compensating-deletes the object if the row write fails. `MultiFileUploader`
extended the same shape from one file to a set. Both are live.

Three uploaders predate that and still upload the instant a file is chosen.

### 1.1 `SingleImageUploader` — three ways to orphan an object

Used for the announcement image, the event cover, and the official portrait. It calls
`uploadSingleImage` from `onChange`, so the object is in `public-media` before the user has
typed a title.

| Gesture | Result |
| --- | --- |
| Pick a file, close the drawer without saving | Object stays. Nothing references it. |
| Pick A, then pick B, then save | A is orphaned (except officials — see below). |
| Pick a file, click the trash, then save | `clear()` only resets form state. Object stays. |

**Officials escape rows 2 and 3**: `saveOfficial` compares `photo_path` against the incoming
value and deletes the old object. **Announcements and events do not** — neither
`saveAnnouncement` nor `saveEvent` calls `removeStoredImage` at all. Every announcement image
replaced since the feature shipped is still in the bucket.

Row 1 leaks for all three.

### 1.2 `NewsPhotoUploader` — the invariant holds, the UX pays for it

It writes the Storage object *and* the `news_photos` row together, so nothing is orphaned.
The cost is that photos cannot exist before their parent, which is why `news-form.tsx` shows
*"Save this post as a draft first, then come back to add up to 3 photos."* Creating a post
with photos takes two passes through the drawer.

### 1.3 `AchievementPhotoUploader` — eager, and correctly so

Named in umbrella §3.3 as the third conversion. Reading the editor says otherwise: see §2.4.

## 2. Decisions

### 2.1 Copy `saveLegislative`'s contract exactly

Signature becomes `save<X>(id, values, fileForm: FormData)`. The file rides in a `FormData`
beside the plain values object; the action uploads up front, then every failure path after
that point runs a local `fail()` that deletes the object it just created and logs the path if
that cleanup itself fails.

This is not a new mechanism. It is the one already in `legislative.ts`,
`transparency-documents.ts`, and `transparency-projects.ts`, down to the `fail()` helper and
its comment. A second upload model would be worse than the bug.

### 2.2 `SingleImageUploader` becomes a pure file picker

It holds a `File` and shows a local `URL.createObjectURL` preview. No Server Action call, no
network, nothing in the bucket until Save runs. It gains the `removeExisting` flag `PdfUploader`
already has, so "remove this image" is a *stated intention* applied at save time rather than a
silent form-state edit that leaves the object behind.

Props converge on `PdfUploader`'s: `existingSrc` / `existingPreviewUrl` / `file` /
`onFileChange` / `removeExisting` / `onRemoveExistingChange`. Object URLs are revoked on
replacement and unmount.

### 2.3 News photos: a pending list flushed on Save

`NewsPhotoUploader` splits its state in two — photos already saved (with ids, reorderable and
deletable server-side as today) and pending `File`s chosen in this session, previewed locally.
Save sends the pending ones; the drawer's Cancel discards them with nothing to clean up.

Ordering on create is the array order. The `MAX_PHOTOS = 3` ceiling counts saved + pending
together, client-side for the message and server-side because a Server Action is a public HTTP
endpoint.

**Order of operations on create.** `newsPhotoPath` keys the object path by `articleId`, which
does not exist until the row does. So the article row is inserted first, then per pending
photo: upload the object, insert the `news_photos` row, and on a failed row write delete the
object just uploaded and stop. An article row with no photos is valid content, so a partial
failure leaves the system consistent — never an object without a row.

This removes the "save as a draft first" message.

### 2.4 Achievements stay eager — deliberately

`AchievementPhotoUploader` is not converted. The achievements editor has **no Save button**:
"Add achievement" calls `createAchievement(officialId)` and inserts the row immediately, and
every field saves on blur. There is no commit event to defer an upload to and no Cancel to
orphan an object.

Its cleanup is already correct: `deleteAchievement` collects the child photo paths and removes
the objects, and `deleteOfficial` does the same across every achievement it cascades away.

Giving achievements a draft/commit model is a real change to how that editor works, and it
belongs with the autosave sub-project that is about exactly that question — not here. Recorded
so it reads as a decision rather than an omission.

### 2.5 Announcements and events gain the replace/remove cleanup they never had

`saveAnnouncement` and `saveEvent` read the existing `image_src` / `cover_src` and delete the
old object when the save replaces or clears it, mirroring `saveOfficial`. A failed cleanup logs
the path and does not fail the user's save — the row is already correct; the leftover is a
storage fault, and only a human can act on it.

Guarded, as everywhere else, by "only delete an object we own": a seeded `https://lh3…` value
is left alone.

### 2.6 `media.ts` stops writing audit entries

`uploadSingleImage` and `removeStoredImage` currently record `file_upload` / `file_delete`
because the widget called them directly. After this change every caller is a step inside a save
or delete action that records its own entry, so per-file entries become duplicates — and
`removeStoredImage` is now also the compensating-delete path, where an entry would claim a
deletion for a save the user never completed.

This is the same reasoning already written at the top of `documents.ts`, which is why that
module was never audited. `media.ts` adopts it and the comment says so.

### 2.7 The deletes sub-project 6 deferred here

News, announcements and events get delete actions, on the terms sub-project 6 set: SuperAdmin
only, only from `archived`, both enforced by `guardDelete()`.

Each removes its own media first: `news_photos` children (rows and objects) plus the article's
own image, and the announcement image / event cover. The `src` columns hold a Storage path for
portal uploads and a full remote URL for seeded rows, so cleanup keys off the same
`/^https?:\/\//i` test used everywhere else and skips what it does not own.

### 2.8 Existing orphans are reported, never swept

Objects already leaked stay where they are. This sub-project ships a **list-only** script that
walks `public-media` and prints objects no row references. It deletes nothing. A sweeper that
deletes on its own judgement is exactly the mechanism umbrella §3.3 rejected, and a bug in one
would destroy live content silently.

What to do with the list is the owner's call, once.

## 3. Sequence

| Phase | Content |
| --- | --- |
| A | `SingleImageUploader` → pure picker; announcement / event / official saves take the file, upload, compensate, and clean up replacements |
| B | `NewsPhotoUploader` → pending list; `saveNewsArticle` flushes it |
| C | Delete actions for news / announcements / events (§2.7) |
| D | The orphan report script (§2.8) |

A and B are independent. C depends on neither but shares the media-cleanup helper A introduces.

## 4. Risks

- **Every image-bearing admin form changes at once** — announcement, event, official, news.
  The blast radius is the whole news/officials editing surface.
- **Upload moves to Save.** A 2 MB photo on a slow connection now delays the Save click rather
  than the file pick. Every affected Save button needs a real pending state or it reads as
  frozen. Payloads stay far inside the existing 12 MB `serverActions.bodySizeLimit`
  (3 × 2 MB worst case, news).
- **`next/image` cannot optimise a `blob:` URL.** Local previews render `unoptimized`; verified
  in the browser rather than assumed.
- **Partial photo flush.** §2.3 accepts "some photos saved, then an error" as consistent. It
  must surface clearly enough that the user knows to retry the rest.
- **Adding delete actions in C** grows destructive capability, which sub-project 6 was written
  to shrink. Mitigated by reusing `guardDelete()` unchanged: SuperAdmin, archived-only, no new
  gate and no new judgement call.

## 5. What the browser confirmed

Driven per `.claude/skills/verify/SKILL.md` against staging, with the session stubbed as both
roles. `scripts/report-orphaned-media.mjs` gave the baseline before and after: **12 objects, 12
referenced, 0 orphans** both times — everything created during verification was removed.

- **The bug, in one gesture.** Announcement drawer, image picked, preview reads *"Uploads when
  you save"*, Cancel → `announcements/` still holds **0 objects**. That is what used to leak.
- **Save uploads it.** Same drawer completed → 1 object, and the row's `image_src` is that
  exact path.
- **Replacing cleans up.** Swap the image, save → still **1** object; the old one is gone and
  the row points at the new one. This is the leak announcements and events had since the
  feature shipped — neither save action removed a replaced image.
- **Removing is deferred too.** "Remove" shows *"The image will be removed when you save"*;
  after saving, 0 objects and `image_src` is NULL.
- **The compensating delete runs.** With a save forced to fail after the upload (temporary
  stub, since removed): the error surfaced, no row was created, and `announcements/` was left
  at **0 objects**.
- **News photos commit with the post.** A brand new post took two photos in one pass — the
  *"save this post as a draft first"* message is gone — producing 2 rows and 2 objects, every
  row pointing at one.
- **Delete is gated as sub-project 6 requires.** On an archived announcement a staff member
  with `manage-news` sees *View details / Restore*; a SuperAdmin also sees *Delete
  permanently*. Deleting removed the row and its object.
- **The stale-tab guard holds for the new actions.** Two tabs on the archived news view; one
  restored the post, the other clicked Delete → *"Archive this record first. Only archived
  records can be deleted permanently."* The post and both photo rows survived.
- **Deleting a post takes its photos with it.** The probe post, re-archived and deleted:
  row gone, 2 photo rows gone, `news/<id>/` down to 0 objects.
