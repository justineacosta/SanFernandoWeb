# Storage and media

Supabase Storage. `src/lib/storage.ts` (buckets, rules, limits), `src/lib/media.ts` (upload
helpers — **not** a `"use server"` module, deliberately unaudited),
`src/lib/media-lifecycle.ts` (promote/demote between buckets).

## Buckets are split per content type (migration `0028`, `0030` dropped the old ones)

**Why, because it constrains anything new:** Supabase Storage's `list()` rides the same RLS
`select` policy as an individual object `get()`, so a single "public read" bucket made every
draft/in-review/archived file **anonymously enumerable** even though the site never linked
to it.

- One **public/private pair per status-aware type**: `news-media`/`news-drafts`, and the
  same for `officials`, `events`, `announcements`, `legislative`, `transparency`.
- Always-public `site-media` and `avatars-media` for content with no draft state.
- Private `feedback-media` and `ticket-media`.
- Object path *strings* never changed, only which bucket holds them — no DB columns were
  touched by the split.
- **`PUBLIC_MEDIA_BUCKET` / `PUBLIC_DOCUMENTS_BUCKET` / `photoUrl` / `documentUrl` are
  deleted. Don't reintroduce them.**

Helpers: `MediaKind` / `publicBucketFor` / `draftBucketFor` / `bucketForStatus` / `mediaUrl`
in `storage.ts`; `promoteMedia` / `cleanupPromotedMedia` / `demoteMedia` /
`storedObjectExists` in `media-lifecycle.ts`.

### Bucket-level ceilings (migrations `0036`, `0037`)

Every bucket carries a `file_size_limit` equal to what app code already enforces (10 MB for
`legislative-*`/`transparency-*`, 2 MB everywhere else), so the app cap and the bucket cap
cannot drift into disagreement without someone editing both.

The two seed scripts (`upload-official-portraits.mjs`, `upload-site-images.mjs`) write
directly to Storage with no app-side size check of their own — a future asset over the cap
would fail with a raw Storage error, not a validation message.

**`allowed_mime_types` is set on every bucket except `site-media` and `avatars-media`.**
Those two also take uploads (`scripts/upload-site-images.mjs`, the avatar uploader) but are
deliberately left `null` — they have no draft/promote lifecycle and are out of scope for this
restriction.

`ticket-media` and `feedback-media` got theirs in migration `0036`. The twelve status-aware
buckets (`news`/`officials`/`events`/`announcements`/`legislative`/`transparency`, each
`-media`/`-drafts`) get theirs in migration `0037` — the four image-only kinds allow
`image/png`/`image/jpeg`/`image/webp`; `legislative`/`transparency` add `application/pdf`.
`0037` had to wait for those twelve to go through `copyObjects` (promote/demote) safely,
because that path resolves an explicit content type — **sniffed bytes → path extension
(`mimeFromExtension`, `storage.ts`) → the downloaded blob's own type** — before every
re-upload, and only falls through to `undefined` if all three come back empty. Before that
fix (hardening backlog Task 7, 2026-08-11) `copyObjects` uploaded with `contentType:
file.type || undefined`, and a Storage download's blob routinely comes back with no type of
its own; Supabase would then substitute a default that a bucket-level `allowed_mime_types`
would reject, and `promoteMedia` fails closed — breaking publishing in production. Verified
2026-08-11 against real objects both directions (publish and archive) for one image kind
(news) and one document kind (legislative): `storage.objects.metadata->>'mimetype'` came
back `image/png` and `application/pdf` respectively in every case, never a generic default.
`0037` (hardening backlog Task 8) was written 2026-08-11 against that verified fix, folded
into the baseline alongside it, and applied to staging then production on 2026-08-12 —
manual, staging first, like every migration since `0012` (`.claude/deployment.md`).
`.env.local`'s active, uncommented Supabase block (labeled "Development API," which is stale
now that the split matters) is **staging**; the commented-out "Production API" block, with its
own project and keys, is the real production database — the two are separate projects, not
one project under two names.

Verified in two tiers, matching the risk each environment can carry:
- **Staging** — full round trip through the real admin portal with the allow-list actually
  enforcing: published and archived a throwaway image-kind record (news) and a throwaway
  PDF-kind record (legislative). Both succeeded, `storage.objects.metadata->>'mimetype'` read
  `image/png` and `application/pdf` (never rejected, never a generic default), and the public
  page/PDF download served the correct `content-type` in both cases. Test records deleted
  afterward; all four touched buckets returned to their exact pre-test object counts.
- **Production** — read-only only, deliberately: a direct `storage.buckets` read (service-role
  `listBuckets()`) confirmed all fourteen non-null buckets carry exactly the array `0037`/
  `0036` specify, `site-media`/`avatars-media` still `null` — byte-for-byte identical to
  staging. No publish/archive round trip was run against production; staging's round trip
  already proved the promote/demote mechanism, this branch isn't deployed to production yet,
  and a live write there would only re-prove what staging showed while carrying real risk
  (audit log entries, potential live-subscriber side effects) for no new information.

### Publish is three steps in this order

`promoteMedia` (copy only, deletes nothing) → the DB status update → `cleanupPromotedMedia`
(best-effort removal of the redundant `-drafts` source). **The third runs only if the second
committed** — dropping the private source before the status flip lands would leave the
object public and enumerable with nothing left to retry from if that flip failed or no-oped.
`promoteMedia` fails closed, so a row can never read "published" with its media still
private.

### `demoteMedia` fires on any transition that leaves `published`, not only archiving

The guard is `previousStatus === "published" && nextStatus !== "published"`. The four
generic setters (`setOfficialStatus`, `setLegislativeStatus`,
`setTransparencyDocumentStatus`, `setTransparencyProjectStatus` — the four types with one
setter accepting any `ContentStatus` rather than discrete named actions) originally demoted
only on `archived`; a direct Server Action POST of `published → draft` passed validation and
left the file live in the public bucket, **unrecoverably** — a later archive wouldn't demote
either, since `previousStatus` was no longer `"published"`. News, announcements and events
need no such guard: every transition goes through a named function with an explicit
allowed-from list, so `published → draft` was never reachable.

### Admin previews use `resolveMediaUrl` / `resolveMediaUrls` / `resolveMediaUrlsForList`

Never `mediaUrl(bucketForStatus(...))` directly. Published resolves to a plain public URL;
anything else mints a signed URL against the drafts bucket. The third batches over a list
query's rows in one pass.

**Any `<Image>` that can receive a signed URL needs `unoptimized`** — `next.config.ts`
allow-lists only `/storage/v1/object/public/**`, while a signed path is
`/storage/v1/object/sign/**`, so without it the image 400s in production and throws in dev.
Chosen over allow-listing the signed pattern for the reason `feedback-drawer.tsx` documents:
a URL expiring in ten minutes has nothing worth caching or optimizing.

## The core invariant: a storage object exists only if a row references it

Photo sets are capped at `MAX_PHOTOS` = 3 per record (news articles, achievements), and
`uploadSingleImage` enforces `MAX_IMAGE_BYTES` = 2 MB — these are what keep the inline
Server-Action payload under the `"8mb"` limit.

- **Uploads defer to Save.** Every uploader is a *pure file picker* making no network calls
  — `PdfUploader`, `MultiFileUploader`, `SingleImageUploader`, `NewsPhotoUploader`'s pending
  list. The save Server Action uploads server-side and **compensating-deletes** the object
  if the row write fails. Copy `saveLegislative`'s `fail()` helper for any new one.
- **Cleanup helpers must be hoisted above every validation check.** Defining `fail()` /
  `cleanupUploads()` later orphaned an object on any rejected save (reproducible: attach a
  file, blank the title, Save).
- **Every delete path removes the DB row before the Storage object, never the reverse.** An
  object deleted ahead of a failed row delete leaves a live row pointing at nothing (a
  broken image forever); the reverse failure just leaves a logged orphan. `news-photos.ts`,
  `achievement-photos.ts`, `achievements.ts` and the achievement-photo cascade in
  `officials.ts`'s `deleteOfficial` had this backwards until a 2026-07-27 pass reordered
  them to match the record-level deletes.
- **A record delete removes its own media, and a DB cascade does not do that for you** — the
  cascade drops the child *rows* (an article's `news_photos`, an official's achievement
  photos), never the Storage objects. Delete the files explicitly in the same action.
- **One deliberate exception:** `AchievementPhotoUploader` stays eager, because its editor
  has no Save button to defer to. Read the sub-project 7 spec §2.4 before "fixing" it.
- **Every ingest point verifies bytes against the declared type.** `sniffMimeType`
  (`src/lib/storage.ts`, unit-tested) reads the first 12 bytes of the buffer the uploader
  already holds and the caller rejects on `!== file.type`. Re-audited 2026-08-11
  (`git grep -n "sniffMimeType(" src/`): **seven call sites**, not six —
  `uploadTicketAttachment`, `uploadFeedbackScreenshot`, `uploadSingleImage` (all three in
  `src/lib/media.ts`), the document Route Handler, `attachPendingPhotos` (news),
  `uploadAchievementPhotos`, and now `validateTicketFiles`
  (`src/lib/ticket-attachments.ts`) — the pre-insert gate shared by all six ticket ingest
  points, which replaced the inline sniff `submitAssistance` used to do on its own before
  the shared module existed. **`attachPendingPhotos` and `uploadAchievementPhotos` still do
  not route through `uploadSingleImage`** — they upload directly, which is why patching the
  shared helper alone was never enough for those two. Each rejection reuses that call site's
  existing declared-type string so a prober cannot tell the two checks apart.
  `media-lifecycle.ts`'s promote/demote copy is deliberately exempt from this reject-on-
  mismatch pattern: it re-uploads already-validated bytes, so there is nothing to reject.
  It does still call `sniffMimeType` (paired with `mimeFromExtension`) — not to validate,
  but to resolve the `contentType` the re-upload sends; see `copyObjects` above.

## Document PDFs upload through a Route Handler, not a Server Action

`POST /api/admin/uploads/document` (Plan 3, 2026-07-29). It exists because those were the
only call sites forcing `bodySizeLimit` up for every public unauthenticated form too. The
three document forms now make **two calls on Save**: upload first, then the save action with
the resolved path.

- Gates on `checkPermission("manage-transparency")` and validates against
  `uploadRulesFor(kind)` (a pure function in `src/lib/storage.ts`, alongside the
  `DocUploadKind` type): `legislative` = exactly one 10MB PDF; `documents`/`projects` = up
  to `MAX_FILES_PER_RECORD` = 3 PDF-or-image files at 10MB each. It uploads to the bucket
  `bucketForStatus` resolves and returns `{ error, files: [{path, sizeBytes, mime}] }`.
- **It deliberately files no `recordActivity` entry**, mirroring the reasoning the
  `uploadDocumentPdf`/`uploadTransparencyFile` Server Actions it replaced already had — the
  save action that references the path is the auditable event, not the upload.
- The client half is `uploadDocumentFiles`
  (`src/features/admin/lib/document-upload-client.ts`); the three forms call it, then pass
  the resolved path(s) to the save action.
- **The handler reads the record's `status` from the DB and never accepts one from the
  client.** Its contract is `kind` + an optional `id` (absent for a new record, always
  `draft`). A client-sent status let a stale tab put a published record's file in the
  private `-drafts` bucket (permanent 404 on the public site) or a draft's file in the
  anonymously enumerable `-media` one, with nothing downstream to self-heal it since every
  cleanup and URL-resolution path computes the bucket from the row's current status. A
  missing row returns the same generic failure as everything else.
- **Each save action re-validates the client-supplied path** against the same
  prefix/traversal allow-list `removeStoredDocument` uses (`/^legislative\//`, no `..`
  segment) *and* confirms the object exists via `storedObjectExists`. A well-formed path is
  not evidence that an upload produced it, and a path absent from the bucket the record's
  *current* status points at cannot be the one this save should store. It stops short of
  proving the object came from this request's own upload (another record's path in the same
  bucket still passes) — closing that needs a signed upload receipt, disproportionate
  against an already-authenticated holder.
- **This narrows the invariant rather than preserving it.** What remains is the window
  between a successful upload and reaching the cleanup helper. `cleanupOrphanedUpload`
  (`actions/documents.ts`) covers a save call that throws with the tab still alive,
  re-checking whether the exact `crypto.randomUUID()`-based path is now referenced before
  deleting anything — a thrown client call doesn't prove the save never committed
  server-side. A closed tab, a reload or an idle timeout still leaks and surfaces only via
  the orphan report. **Accepted tradeoff of the two-call design, not an open bug.** It is
  deliberately *not* the umbrella-spec-rejected background sweeper
  (`2026-07-22-transactional-uploads-design.md` §2.8): a compensating action tied to one
  specific failed call, not a process scanning storage on its own judgement.
- `src/proxy.ts`'s Server Action POST matcher exclusion (`missing: [{type: "header", key:
  "next-action"}]`) was re-checked against this and deliberately left alone — never
  PDF-specific, and the largest remaining Server-Action payload is well under
  `proxyClientMaxBodySize`'s 10MB default.

## Resident ticket attachments (private `ticket-media`)

Capped at **3 files × 2 MB** (`MAX_TICKET_FILES`/`MAX_TICKET_FILE_BYTES` — renamed from
`MAX_REPLY_*` once filing-time attachments joined replies), unchanged since replies were the
only caller, and still sized to fit the existing `"8mb"` `bodySizeLimit` rather than raise
it. `uploadTicketAttachment`/`discardTicketAttachment` (`src/lib/media.ts`); the path
allow-list covers all four ticket prefixes.

**`src/lib/ticket-attachments.ts` is the single owner of the upload-after-insert sequence**
for every ticket ingest point except resident replies:

- `validateTicketFiles` is the **pre-insert gate** — file count, declared type, size and the
  byte-sniff cross-check, all resident/staff-fixable, all run before any row exists.
- `recordIntakeWithAttachments` runs **after** the insert: it uploads each file, writes the
  intake `ticket_updates` entry that references them (`TICKET_INTAKE_STATUS[kind]`,
  `visibility: "public"`), and on a storage or timeline failure discards whatever it already
  uploaded and returns `TICKET_ATTACHMENT_WARNING` instead of failing the caller.
- **`authorKind` on `IntakeAttachmentsInput` is required, not defaulted** — every caller
  states explicitly whether the intake entry is `"resident"` or `"staff"` (2026-08-11; a
  hardcoded `"system"` here used to make a resident's own uploaded ID read as "Barangay
  staff" in the admin drawer, see `.claude/resident-portal.md`).
- **All six ingest points call it**: the three public Server Actions (`submitApplication`,
  `submitComplaint`, `submitAssistance`, `src/features/services/actions.ts` /
  `complaints/actions.ts` / `assistance/actions.ts`) pass `authorKind: "resident"`, and the
  three staff walk-in encode actions (`createWalkInApplication`, `createWalkInComplaint`,
  `createWalkInAssistance`, `.claude/admin-cms.md`) pass `authorKind: "staff"` plus
  `authorName: actor.fullName`.
- **`submitTicketReply` keeps its own path**, not this module — it writes a `reply` entry,
  not an intake one, so the timeline write has a different shape even though the upload and
  discard mechanics are identical.
- `entryId` is returned only so a caller that sends an intake email can call
  `markTicketUpdateNotified` after the send; an action with no email path (none currently)
  would have no use for it.

**The 2 MB cap is enforced twice, on purpose.** The client picker (`TicketFileField`,
`.claude/frontend.md`) downscales an oversized image in the browser via `downscaleImageFile`
(`src/lib/downscale-image.ts`, `DOWNSCALE_EDGE_LADDER` = 2048/1600/1200/900px, WebP at
quality 0.82) rather than rejecting it outright — a straight-from-camera photo routinely runs
3-5 MB and a resident on a phone has no easy way to shrink one. PDFs and already-small images
are returned untouched; an image that can't be brought under the cap (or won't decode)
becomes a normal, visible client-side rejection. **The output `File`'s type comes from the
returned `blob.type`, never a hardcoded `"image/webp"`** — `canvas.toBlob` falls back to PNG
where WebP encoding is unavailable, and the server compares uploaded bytes against the
*declared* type (`sniffMimeType`), so a hardcoded type would get a valid PNG rejected as a
mismatch. `crop-image.ts` documents this same trap for the avatar cropper.
`validateTicketFiles`'s server-side cap is still the real gate — the client step is a UX
convenience, not a trust boundary.

**The upload runs after the insert, and that ordering is not negotiable:** the storage path
is `<ticket_no>/<uuid>.<ext>`, and the ticket number does not exist until the row is
written. Therefore:

- Every resident/staff-fixable rejection — file count, size, MIME — is checked **before** the
  insert (`validateTicketFiles`) and returns a normal error with no ticket filed.
- A storage failure *after* the insert must **never** fail the submission: the ticket is
  already filed, and failing here would have the submitter refile for a second number. A
  partial or failed upload is discarded and a warning field carries the explanation instead
  — so the warning path is reachable only by a genuine storage failure, never by anything
  the submitter did wrong.
- A `recordTicketUpdate` failure downgrades to the same warning **and also discards any
  uploads** — without that, a resident's uploaded ID would sit in the private bucket
  referenced by no row at all.
- **Appointments accept no attachments on either surface, deliberately** — neither
  `submitAppointment` nor `createWalkInAppointment` calls this module.

## Avatars

`profiles.avatar_src` → `avatars-media` (migration `0025`); null means initials.
**Own photo only** — there is no editor for anyone else's, and `/admin/users` renders them
read-only. Saving one must `revalidatePath("/admin", "layout")` as well as the settings
path, or the top bar keeps the stale initials.

**`AvatarPicker` is the one uploader with a cropper and is not a `SingleImageUploader`
variant** (`src/features/admin/components/avatar-picker.tsx`, Settings → Profile only): a
128px circle that *is* the button — no dashed drop-box — opening `ImageCropperDialog`
(`src/components/ui/image-cropper-dialog.tsx`, wrapping `react-easy-crop`). Its empty state
is the amber gradient with an upload icon rather than initials, because an empty control
should say what it does. Three things not to undo:

1. Output is normalised to a **512px WebP square** (`AVATAR_OUTPUT_PX`), which is the *only*
   reason its source ceiling may be `MAX_AVATAR_SOURCE_BYTES` (5 MB, client-side) rather
   than `MAX_IMAGE_BYTES` — the 2 MB check in `uploadSingleImage` still guards the upload
   and the ~50 KB crop sails past it. Source types are the avatar-only
   `ALLOWED_AVATAR_SOURCE_TYPES` (JPG/PNG, no WebP — the crop re-encodes to WebP anyway),
   narrower than the shared `ALLOWED_IMAGE_TYPES`.
2. `cropFromImage` rotates the whole image onto its bounding box **before** cropping,
   because `croppedAreaPixels` is measured against the rotated image — crop first and every
   non-zero rotation lands offset.
3. The dialog splits into a wrapper plus an inner panel so crop/zoom/rotation reset by
   **unmounting**, not from an effect on `open` — the React Compiler lint rule rejects that
   setState cascade.

It copies `ConfirmDialog`'s focus trap, scroll lock and Escape handling on purpose; don't
give it its own. `react-easy-crop` injects its own stylesheet — nothing to add to
`globals.css`. `SingleImageUploader`'s `previewShape="circle"` option is now unused; the
officials portrait is the obvious next consumer if the cropper ever widens.

## Orphan reporting

`scripts/report-orphaned-media.mjs` lists unreferenced objects and **never deletes**.
Rewritten 2026-07-29 for the bucket split — it had gone stale the moment that split shipped
(still hardcoded to one `public-media` bucket and a `FOLDERS` prefix list), so it silently
found zero orphans in every run afterward. It now walks every status-aware `MediaKind`'s
public **and** drafts bucket plus the three single-bucket kinds (`site-media` against
`site_items.image_path`, `avatars-media` against `profiles.avatar_src`, `feedback-media`
against `feedback.screenshot_path`) and `ticket_updates.attachments`. The bucket formulas
are **reimplemented as plain JS** because the script runs outside the Next/TS build — keep
them in step with `storage.ts` when buckets change.
