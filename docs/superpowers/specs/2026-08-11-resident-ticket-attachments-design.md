# Resident attachments on applications and complaints — design

**Date:** 2026-08-11
**Status:** approved, not yet implemented
**Migration:** none — no schema, column, bucket or policy changes

## 1. Problem

A resident filing a document application (`/services/apply/[id]`) or an incident report
(`/complaints/new`) has no way to attach anything. The barangay asks for supporting
documents — a valid ID, a medical abstract, damage photos, a scanned requirement — and
today the only way to hand one over is to walk to the hall, or to wait for staff to move
the ticket to `awaiting-info` and reply through `/track`.

`/assistance/new` already solved this. It accepts up to three files at filing time and
writes them to the private `ticket-media` bucket through the resident-reply machinery.
Applications and complaints — the two higher-volume flows — never got the same treatment.

The counter has the mirror-image gap. Staff encoding a walk-in cannot attach the documents
the resident is physically handing them, so a walk-in ticket is always thinner than an
online one. This is true even for **assistance**, whose public form *can* attach: the
walk-in encode form for the same flow cannot.

## 2. Scope

Attachments at filing time for every ticket flow **except appointments**:

| Flow | Public form | Walk-in encode form |
|---|---|---|
| Application | **new** | **new** |
| Complaint | **new** | **new** |
| Assistance | already ships — migrates to the shared picker | **new** |
| Appointment | deliberately none | deliberately none |

Plus one shared picker component and one shared image-downscaling helper, replacing the
two hand-rolled ticket pickers that exist today (the anonymous feedback widget keeps its own — see below).

Out of scope, stated so nobody reads them as covered:

- **Appointments, both halves.** Booking a slot to meet an official carries nothing to
  attach. The exclusion is the project owner's explicit instruction, not an oversight.
- **The anonymous feedback widget.** Different bucket (`feedback-media`), images only,
  single file. Folding it in would grow the shared picker options it otherwise doesn't
  need.
- **A per-service "attachment required" setting.** Attachments are optional everywhere
  (§3). No `services.requires_attachment` column, no admin toggle, no server-side
  enforcement.
- **Raising the 2 MB cap.** §5 makes big photos fit instead of lifting the ceiling.

## 3. Decisions taken before designing

Settled with the project owner up front:

- **Attachments are always optional.** A resident with no scanner and no phone camera must
  still be able to file; staff can still ask for documents later through `awaiting-info`.
  This is also what keeps the design migration-free.
- **The cap stays 3 files × 2 MB**, and the gap it leaves — a straight-from-camera photo
  is routinely 3–5 MB — is closed by downscaling in the browser rather than by raising the
  ceiling. Raising it would need a migration against `ticket-media`'s `file_size_limit`
  *and* a move off Server Actions, since 3 × 5 MB exceeds the `"8mb"` `bodySizeLimit`.
- **One picker for every ticket upload point**, including the two that already work.
  Building a new downscaling picker for apply and complaint while leaving assistance and
  `/track` on their inline ones would mean a resident hits a 2 MB rejection on one form and
  not another.
- **The walk-in side covers all three non-appointment flows**, including assistance, whose
  counter form is the odd one out today.

## 4. What already exists

Confirmed against the code, not the docs. The design leans on all of it unchanged:

| Piece | Where |
|---|---|
| Private `ticket-media` bucket, 2 MB `file_size_limit`, MIME allow-list | migrations `0028`, `0036` |
| `uploadTicketAttachment` / `discardTicketAttachment` | `src/lib/media.ts` |
| Path allow-list already covering all four ticket prefixes | `src/lib/media.ts` — `/^(APP\|APT\|CMP\|AST)-\d{4}-\d{5,}\//` |
| `recordTicketUpdate({ attachments })` | `src/lib/ticket-updates.ts` |
| Admin drawers rendering attachments | all four call `TicketTimelinePanel` |
| Resident-visible attachments on `/track` | intake entry is `visibility: "public"` |
| `sniffMimeType` byte verification | `src/lib/storage.ts` |

Nothing in this spec adds a bucket, a column, a policy or an RPC.

## 5. `TicketFileField` — the shared picker

New `src/components/shared/ticket-file-field.tsx`, `"use client"`.

A **pure file picker**: no network calls. Chosen files live in the parent form's state and
become uploads only inside the submit action — the rule that keeps "a storage object exists
only if a row references it" true by construction.

```ts
interface TicketFileFieldProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** Field-level rejection, owned here, read by the parent to gate Submit. */
  error: string | null;
  onErrorChange: (error: string | null) => void;
  /** Downscaling is async; the parent disables Submit while it runs. */
  preparing: boolean;
  onPreparingChange: (preparing: boolean) => void;
  /** Disambiguates the input id and its label when two forms share a page. */
  idPrefix: string;
  label?: string;
}
```

The label defaults to **`"Supporting documents (optional)"`** — the exact string the
assistance form uses today, because `tests/e2e/public/assistance-form.spec.ts` selects the
input with `getByLabel("Supporting documents (optional)")`. Changing it silently breaks
that spec.

Responsibilities:

- Enforces `MAX_TICKET_FILES`, `MAX_TICKET_FILE_BYTES` and `ALLOWED_DOC_FILE_TYPES` from
  `src/lib/storage.ts` — never its own copies of those numbers.
- On a rejection, **clears `files` as well as the input's `value`**. Leaving an earlier
  valid pick in state behind a control that now reads "no file chosen" would submit files
  the resident can no longer see. Both existing pickers already carry this fix and its
  comment; it moves here with them.
- Renders the rejection as a plain `role="alert"` paragraph, **not** an `InlineAlert`. This
  is field-level validation that clears itself on the next valid pick, so a dismiss button
  would have nothing to dismiss to — the one documented exception to "every error banner is
  dismissible".
- Runs downscaling (§6) before the size check, so the size the resident is judged against
  is the post-downscale size. While that runs it reports a busy state.

The parent, in every one of the seven call sites, gates its submit button on
`disabled={isPending || fileError !== null || filePreparing}`. Without the `fileError`
clause the button stays live and silently files a ticket with no attachments — a bug this
codebase has already fixed twice, in `AssistanceForm` and `TicketReplyForm`.

**It is not `MultiFileUploader`.** That component is 10 MB, `MAX_FILES_PER_RECORD`, and
carries existing-file / kept-id management for records being edited. Ticket intake has no
existing files and a different ceiling.

### 5.1 Call sites

Seven, one declaration:

| Call site | Change |
|---|---|
| `services/components/apply-form.tsx` | new |
| `complaints/components/complaint-form.tsx` | new |
| `assistance/components/assistance-form.tsx` | inline picker deleted, replaced |
| `track/components/ticket-reply-form.tsx` | inline picker deleted, replaced |
| `admin/components/application-form.tsx` | new |
| `admin/components/complaint-form.tsx` | new |
| `admin/components/assistance-form.tsx` | new |
| *(appointments, both halves)* | untouched |

## 6. `downscaleImageFile` — making camera photos fit

New `src/lib/downscale-image.ts`, structured after `src/lib/crop-image.ts`: canvas work
inside function bodies only, nothing touching `document` at module scope, so the pure
exports stay importable under Vitest's DOM-less environment.

```ts
export function scaleToFit(width: number, height: number, maxEdge: number):
  { width: number; height: number };

export async function downscaleImageFile(file: File, maxBytes: number): Promise<File | null>;
```

Behaviour:

- **PDFs pass through untouched**, returned as-is. Only `image/*` is re-encoded.
- **An image already under `maxBytes` passes through untouched.** Re-encoding a 300 KB
  photo would cost quality and buy nothing.
- Otherwise step the longest edge down through a fixed ladder — 2048, 1600, 1200, 900 —
  re-encoding at each step and stopping at the first result under the cap. The ladder is a
  named constant with a bounded length; there is no unbounded shrink loop.
- If the smallest step still doesn't fit, or a canvas context / `toBlob` comes back null,
  return `null`. The picker turns that into the ordinary field-level rejection. **A failure
  is visible, never a silent submission with no attachment.**
- **The output `File`'s type comes from `blob.type`, never from the type requested.**
  `toBlob(cb, "image/webp", q)` silently falls back to PNG where WebP encoding is
  unavailable, and `sniffMimeType` compares the uploaded bytes to the *declared* type — so
  a hardcoded `"image/webp"` would get a perfectly valid PNG rejected as a mismatch at
  upload time. `cropFromImage` already documents this exact trap; this module inherits both
  the rule and the reason.
- The output keeps the original basename with the new extension, so staff see a meaningful
  filename in the timeline rather than `blob`.

`scaleToFit` is pure and unit-tested. `downscaleImageFile` is not — it needs a DOM, and
this project does not do component or DOM tests.

## 7. Public Server Actions

`submitApplication` and `submitComplaint` each take a new `files: File[]` argument, passed
as a plain Server Action argument rather than through `FormData` — `submitAssistance`'s
precedent, and neither action carries the extra form fields that pushed
`submitTicketReply` to `FormData`.

Both mirror `submitAssistance`'s ordering exactly:

1. Turnstile (fails closed, first, before anything else)
2. IP rate limit — existing keys and budgets, unchanged
3. Zod
4. Service lookup, gated on `flow`
5. **File checks: count, declared type, size, byte-sniff**
6. Insert
7. Upload loop
8. `recordTicketUpdate({ attachments })`
9. Email

Two invariants that ordering encodes, carried over verbatim from the assistance path:

- **Everything the resident can fix is rejected before the insert**, so a bad file never
  produces a filed ticket. This is also what reserves the warning path (below) for genuine
  storage failures the resident had no part in. The byte-sniff belongs in this pre-insert
  gate specifically, not only inside `uploadTicketAttachment`, because a mismatch *is*
  resident-fixable.
- **A storage failure after the insert must never fail the submission.** The upload path is
  `<ticket_no>/<uuid>.<ext>` and the ticket number does not exist until the row is written,
  so the upload cannot precede the insert. The ticket is already the resident's; failing
  here would send them back to file a second one. Instead every uploaded object is
  discarded and a warning field carries the explanation. A `recordTicketUpdate` failure
  downgrades to the same warning **and also discards the uploads** — otherwise a resident's
  ID sits in a private bucket referenced by no row at all.

### 7.1 Result types

- `SubmitApplicationResult` gains `attachmentWarning: string | null`.
- `SubmitAssistanceResult` is generalized and renamed to `SubmitTicketWithFilesResult
  extends SubmitTicketResult`, now used by **both** assistance and complaint.
- `submitAppointment` stays on the bare `SubmitTicketResult`. The field would be inert for
  it, which is precisely the argument the existing comment on `SubmitAssistanceResult`
  makes for extending rather than widening. That comment's claim that assistance is "the
  one public submission that also carries files" is now false and gets rewritten.

### 7.2 The warning copy

One shared constant, moved out of `src/features/assistance/actions.ts` into the module
that owns ticket-update writes, and reused verbatim by all three flows:

> We could not attach your files. Your request is filed — bring them to the barangay hall,
> or send them through /track once staff ask for more information.

It deliberately does not say "reply on the Track page" as an action available now:
`canReply()` opens the reply form **only** on `awaiting-info`, and every intake status is
earlier than that (`pending` for applications and assistance, `received` for complaints —
verified in `TICKET_INTAKE_STATUS`). The wording holds for all three flows unchanged.

## 8. Walk-in encode actions

`createWalkInApplication`, `createWalkInComplaint` and `createWalkInAssistance` each take
the same `files: File[]` argument and run the same sequence: existing `checkPermission`
gate → Zod → service/category lookup → pre-insert file checks → insert → upload → intake
`recordTicketUpdate({ attachments })`.

- The return type widens from `ActionResult` to carry `attachmentWarning`. The manager
  surfaces it through its existing notification, not as a failure — the walk-in ticket is
  encoded either way, exactly as on the public side.
- **No separate audit entry for the upload.** The create is the auditable event; the upload
  is part of it. This mirrors the reasoning already recorded for the admin document Route
  Handler, which files no `recordActivity` of its own.
- `createWalkInAppointment` is untouched.

## 9. Payload budget

3 × 2 MB = 6 MB against the `"8mb"` `bodySizeLimit` in `next.config.ts`. `submitAssistance`
already ships this exact shape, so the limit is known to accommodate it, and downscaling
makes the typical real payload considerably smaller. **No change to `bodySizeLimit`, and no
move to a Route Handler.**

`src/proxy.ts`'s Server Action POST matcher needs no change either: it is not
payload-shaped, and 6 MB sits under `proxyClientMaxBodySize`'s 10 MB default.

## 10. Error handling summary

| Situation | Where caught | Result |
|---|---|---|
| More than 3 files | Picker, then re-checked in the action | Field error; no submission |
| File over 2 MB after downscaling | Picker, then re-checked in the action | Field error; no submission |
| Wrong type (declared) | Picker, then re-checked in the action | Field error; no submission |
| Bytes disagree with declared type | Action, pre-insert | Same generic error string as the declared-type rejection, so a prober cannot tell them apart |
| Downscaling fails or can't reach the cap | Picker | Field error; no submission |
| Storage upload fails | Action, post-insert | Ticket filed, uploads discarded, `attachmentWarning` |
| Timeline insert fails | Action, post-insert | Ticket filed, uploads discarded, `attachmentWarning` |

## 11. Testing

- **Vitest:** `scaleToFit`'s ladder arithmetic — pure, no DOM, no transitive Supabase
  import.
- **Playwright (`--project=public`):** there are no apply or complaint specs today —
  `tests/e2e/public/` covers appointments and assistance only. `assistance-form.spec.ts`
  already files a request *with* an attachment, so it is the regression guard for the
  picker swap and must keep passing untouched. **One** new spec is added, for the apply
  flow, filing an application with one attached file and asserting the ticket receipt
  renders. The complaint flow gets no new submitting spec: each submitting run spends real
  rate-limit budget, `submitComplaint`'s is the tighter 5/hour, and the apply spec plus the
  existing assistance one already cover both the shared picker and the shared upload
  sequence. The per-suite budget table in `.claude/testing.md` is checked before adding the
  run — an e2e failure shortly after a recent run is a rate-limit collision first and a
  regression second.
- **Browser verification** for the picker itself on both a public form and an admin
  walk-in drawer, per the `verify` skill. No component tests; they are deliberately not a
  thing here.

## 12. Documentation to update in the same session

- **`.claude/storage.md`** — the "Resident ticket attachments" section now covers six
  ingest callers, not two. Its `sniffMimeType` call-site list is re-audited against the
  code while there: the current "Six call sites" wording does not appear to account for
  `submitAssistance`'s own pre-insert sniff, and the new actions add more.
- **`.claude/resident-portal.md`** — three of the four ticket flows accept attachments at
  filing; the appointment exception is deliberate and belongs in writing.
- **`.claude/admin-cms.md`** — walk-in encode forms accept attachments; no extra audit
  entry.
- **`.claude/frontend.md`** — the submit-gating-on-`fileError` convention now has one
  owner, `TicketFileField`, instead of being restated per form.
- **`docs/HARDENING_BACKLOG.md`** — checked for entries this closes or invalidates.
