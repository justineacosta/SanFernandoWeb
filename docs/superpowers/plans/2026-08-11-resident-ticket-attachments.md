# Resident Ticket Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let residents attach up to three files (JPG/PNG/WebP/PDF, 2 MB each) when filing a document application or an incident report online, and let staff attach files when encoding a walk-in application, complaint or assistance request at the counter.

**Architecture:** One shared client picker (`TicketFileField`) replaces the three hand-rolled pickers in the codebase and gains browser-side image downscaling so a straight-from-camera photo fits the 2 MB cap. One shared server helper (`recordIntakeWithAttachments`) owns the upload-after-insert sequence, its compensating deletes and its warning path, so six call sites share one implementation instead of six copies of `submitAssistance`'s loop. Nothing about the storage layer changes: the private `ticket-media` bucket, the upload helpers, the path allow-list and the admin/resident timeline renderers all already exist and are reused untouched.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase Storage, zod v4, Vitest (pure functions only), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-11-resident-ticket-attachments-design.md`

## Global Constraints

- **No migration.** No schema, column, bucket, policy or RPC changes anywhere in this plan. If a task appears to need one, stop and raise it.
- **Caps come from `src/lib/storage.ts`**: `MAX_TICKET_FILES` = 3, `MAX_TICKET_FILE_BYTES` = 2 MB, `ALLOWED_DOC_FILE_TYPES`. Never write these numbers inline; never raise them.
- **Appointments get nothing** — neither `submitAppointment` nor `createWalkInAppointment` nor `AppointmentForm` (public or admin) is touched by any task.
- **Upload runs after the row insert, never before.** The storage path is `<ticket_no>/<uuid>.<ext>` and the ticket number does not exist until the row is written.
- **Everything a resident can fix is rejected before the insert** (count, declared type, size, byte-sniff). The post-insert warning path is reserved for genuine storage failures.
- **A storage or timeline failure after the insert never fails the submission.** Discard the uploads, return the warning, keep the ticket.
- **The picker's field-level error must disable Submit** (`.claude/frontend.md`, "Every error banner is dismissible"). Field-level validation is the one non-dismissible error class — plain `role="alert"` text, never `InlineAlert`.
- **Default picker label is exactly `"Supporting documents (optional)"`** — `tests/e2e/public/assistance-form.spec.ts` selects the input with `getByLabel("Supporting documents (optional)")`.
- **Design tokens only** (`brand-*`, `ink-*`, `danger`). No blue tokens. No inlined animation durations.
- **Every `startTransition(async …)` wraps its Server Action call in `try`/`catch`** with cleanup in `finally`.
- Path alias `@/*` → `src/*`. zod is **v4**.
- Work on a branch off `main`, not on `main` itself.

---

### Task 1: `downscaleImageFile` — make camera photos fit

**Files:**
- Create: `src/lib/downscale-image.ts`
- Test: `tests/unit/downscale-image.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export const DOWNSCALE_EDGE_LADDER: readonly number[]`
  - `export function scaleToFit(width: number, height: number, maxEdge: number): { width: number; height: number }`
  - `export async function downscaleImageFile(file: File, maxBytes: number): Promise<File | null>` — returns the original `File` untouched for PDFs and for images already under `maxBytes`; a re-encoded `File` when it can get under the cap; `null` when it cannot.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/downscale-image.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DOWNSCALE_EDGE_LADDER, scaleToFit } from "@/lib/downscale-image";

describe("scaleToFit", () => {
  it("leaves an image already inside the bound alone", () => {
    expect(scaleToFit(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });

  it("scales the longest edge down to the bound, landscape", () => {
    expect(scaleToFit(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
  });

  it("scales the longest edge down to the bound, portrait", () => {
    // The bound applies to whichever side is longer, not to width.
    expect(scaleToFit(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it("never returns a zero side for an extreme aspect ratio", () => {
    // 6000x10 scaled to 900 would round the height to 1.5 -> 1, not 0: a
    // zero-sided canvas throws in every browser.
    const out = scaleToFit(6000, 10, 900);
    expect(out.width).toBe(900);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });

  it("returns whole pixels", () => {
    const out = scaleToFit(1333, 999, 1000);
    expect(Number.isInteger(out.width)).toBe(true);
    expect(Number.isInteger(out.height)).toBe(true);
  });
});

describe("DOWNSCALE_EDGE_LADDER", () => {
  it("descends and is bounded", () => {
    expect(DOWNSCALE_EDGE_LADDER.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < DOWNSCALE_EDGE_LADDER.length; i += 1) {
      expect(DOWNSCALE_EDGE_LADDER[i]).toBeLessThan(DOWNSCALE_EDGE_LADDER[i - 1]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- downscale-image`
Expected: FAIL — cannot resolve `@/lib/downscale-image`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/downscale-image.ts`:

```ts
/**
 * Shrink an oversized resident attachment in the browser so it fits the
 * ticket-media cap, instead of rejecting a photo the resident cannot easily
 * resize on a phone.
 *
 * Structured after `src/lib/crop-image.ts`: canvas work happens inside function
 * bodies only and nothing touches `document` at module scope, so the pure
 * exports below stay importable by Vitest, which runs with no DOM.
 */

/**
 * Longest-edge bounds tried in order. Bounded and named rather than a
 * shrink-until-it-fits loop: a corrupt or pathological image must not be able
 * to spin the main thread.
 */
export const DOWNSCALE_EDGE_LADDER = [2048, 1600, 1200, 900] as const;

/** JPEG/WebP quality for every re-encode step. */
const DOWNSCALE_QUALITY = 0.82;

/**
 * `width`x`height` scaled so neither side exceeds `maxEdge`, aspect preserved.
 * Sides are whole pixels and never zero — a canvas with a zero side throws.
 */
export function scaleToFit(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** Decode a File into an image element, or null if it is not a usable image. */
async function decodeFile(file: File): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Original basename with `ext` swapped in, so staff see a real filename. */
function renamed(original: string, ext: string): string {
  const base = original.replace(/\.[^./\\]+$/, "") || "attachment";
  return `${base}.${ext}`;
}

/**
 * An attachment small enough to upload, or null if it cannot be made small
 * enough. A null is a normal, visible rejection at the call site — never a
 * silent drop.
 *
 * PDFs are returned untouched: there is no lossless way to shrink one here, and
 * re-encoding is not an option. An image already under the cap is also returned
 * untouched — re-encoding a 300 KB photo costs quality and buys nothing.
 */
export async function downscaleImageFile(file: File, maxBytes: number): Promise<File | null> {
  if (!file.type.startsWith("image/")) return file.size <= maxBytes ? file : null;
  if (file.size <= maxBytes) return file;

  const image = await decodeFile(file);
  if (!image) return null;

  for (const maxEdge of DOWNSCALE_EDGE_LADDER) {
    const size = scaleToFit(image.naturalWidth, image.naturalHeight, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, size.width, size.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", DOWNSCALE_QUALITY);
    });
    if (!blob) return null;
    if (blob.size > maxBytes) continue;

    // The type comes from the blob, NEVER from what we asked for. toBlob falls
    // back to image/png where WebP encoding is unavailable, and the server
    // compares the uploaded bytes against the DECLARED type (sniffMimeType) —
    // so a hardcoded "image/webp" would get a perfectly valid PNG rejected as a
    // mismatch. crop-image.ts documents this same trap for the avatar cropper.
    const mime = blob.type || "image/webp";
    const ext = mime === "image/png" ? "png" : "webp";
    return new File([blob], renamed(file.name, ext), { type: mime });
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- downscale-image`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/downscale-image.ts tests/unit/downscale-image.test.ts
git commit -m "feat: add browser-side image downscaling for ticket attachments"
```

---

### Task 2: Shared server helpers for intake attachments

Extracts the upload-after-insert sequence `submitAssistance` already implements into one helper, and proves the extraction against that one working call site before five more depend on it. Behaviour must not change.

**Files:**
- Create: `src/lib/ticket-attachments.ts`
- Modify: `src/types/index.ts` (result types)
- Modify: `src/features/assistance/actions.ts` (refactor onto the helpers; delete its local `ATTACHMENT_WARNING`)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `export const TICKET_ATTACHMENT_WARNING: string`
  - `export async function validateTicketFiles(files: File[]): Promise<string | null>` — the pre-insert gate; returns an error message or null.
  - `export async function recordIntakeWithAttachments(input: IntakeAttachmentsInput): Promise<{ entryId: string | null; attachmentWarning: string | null }>`
  - `export interface IntakeAttachmentsInput { ticketNo: string; kind: TicketKind; files: File[]; authorName?: string; context: string }`
  - `SubmitTicketWithFilesResult`, `WalkInTicketResult` in `@/types`; `SubmitApplicationResult.attachmentWarning`.

- [ ] **Step 1: Add the result types**

In `src/types/index.ts`, add `attachmentWarning` to `SubmitApplicationResult`:

```ts
export interface SubmitApplicationResult {
  error: string | null;
  /** e.g. "APP-2026-00001" — present only on success. */
  ticketNo: string | null;
  /** Non-null only alongside a successful ticketNo: the ticket filed, the files did not. */
  attachmentWarning: string | null;
}
```

Replace the `SubmitAssistanceResult` block (and its comment) with the generalized type:

```ts
/**
 * Every public submission that also carries files. Their uploads happen after
 * the row insert (the storage path is prefixed with the ticket number, which
 * does not exist until then), so they need a way to say "you have a real ticket
 * with no attachments" — a case `SubmitTicketResult` cannot express, since a
 * non-null `error` there means no ticket was filed.
 *
 * Extending rather than widening the shared type, for the reason
 * `SignInFormState extends AuthFormState` does: the base must not carry a field
 * that is inert for `submitAppointment`, the one public flow that accepts no
 * files at all. Applications use their own `SubmitApplicationResult`.
 */
export interface SubmitTicketWithFilesResult extends SubmitTicketResult {
  /** Non-null only alongside a successful ticketNo: the ticket filed, the files did not. */
  attachmentWarning: string | null;
}

/**
 * A walk-in encode action's result. `ActionResult` plus the same warning the
 * public flows carry: a counter ticket is encoded whether or not its
 * attachments landed, and staff need to be told which happened.
 */
export interface WalkInTicketResult {
  error: string | null;
  attachmentWarning: string | null;
}
```

- [ ] **Step 2: Write the shared helper module**

Create `src/lib/ticket-attachments.ts`:

```ts
import type { TicketAttachment, TicketKind } from "@/types";
import { discardTicketAttachment, uploadTicketAttachment } from "@/lib/media";
import {
  ALLOWED_DOC_FILE_TYPES,
  MAX_TICKET_FILES,
  MAX_TICKET_FILE_BYTES,
  sniffMimeType,
} from "@/lib/storage";
import { TICKET_INTAKE_STATUS, recordTicketUpdate } from "@/lib/ticket-updates";

/**
 * Shown when a ticket was filed but its attachments were not. Reachable only
 * through a genuine storage or timeline failure — everything the resident can
 * fix is rejected by `validateTicketFiles` before any row exists.
 *
 * It deliberately does not tell the resident to reply on /track as something
 * they can do right now: `canReply()` opens the reply form only on
 * `awaiting-info`, and every intake status (`pending`, `received`) is earlier
 * than that, so the instruction would be false the instant this can show.
 */
export const TICKET_ATTACHMENT_WARNING =
  "We could not attach your files. Your request is filed — bring them to the barangay hall, or send them through /track once staff ask for more information.";

/**
 * The pre-insert gate. Every rejection here is something the submitter can fix,
 * which is exactly why it runs before any row is written: a bad file must not
 * cost anyone a ticket number, and the post-insert warning path stays reserved
 * for failures they had no part in.
 *
 * Returns the message to show, or null when the files are acceptable.
 */
export async function validateTicketFiles(files: File[]): Promise<string | null> {
  if (files.length > MAX_TICKET_FILES) {
    return `You can attach up to ${MAX_TICKET_FILES} files.`;
  }
  for (const file of files) {
    if (!ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number])) {
      return "Attachments must be JPG, PNG, WebP, or PDF.";
    }
    if (file.size > MAX_TICKET_FILE_BYTES) {
      return "Each attachment must be 2 MB or smaller.";
    }
    // Bytes, not just the declared type. Checked here rather than only inside
    // uploadTicketAttachment because a mismatch is submitter-fixable and belongs
    // in this gate. Same message as the declared-type rejection above,
    // deliberately: a prober must not learn which of the two they tripped.
    const buffer = Buffer.from(await file.arrayBuffer());
    if (sniffMimeType(buffer) !== file.type) {
      return "Attachments must be JPG, PNG, WebP, or PDF.";
    }
  }
  return null;
}

export interface IntakeAttachmentsInput {
  /** DB-resolved, never a client string — it becomes a storage path prefix. */
  ticketNo: string;
  kind: TicketKind;
  files: File[];
  /** Set for walk-in encoding; absent for a resident's own submission. */
  authorName?: string;
  /** Identifies the caller in orphan logs, e.g. "submitApplication". */
  context: string;
}

/**
 * Upload the attachments, then write the intake timeline entry that references
 * them. The single owner of the ordering rules every caller depends on:
 *
 * - Uploads run after the row insert, because the path is `<ticket_no>/<uuid>`.
 * - A storage failure never fails the submission. The ticket is already the
 *   submitter's; failing here would send them back for a second number. Every
 *   object uploaded so far is discarded and the caller returns a warning.
 * - A `recordTicketUpdate` failure discards the uploads too — otherwise a
 *   resident's ID sits in a private bucket referenced by no row at all, which
 *   breaks the one invariant every upload path in this codebase keeps.
 */
export async function recordIntakeWithAttachments({
  ticketNo,
  kind,
  files,
  authorName,
  context,
}: IntakeAttachmentsInput): Promise<{ entryId: string | null; attachmentWarning: string | null }> {
  const uploaded: TicketAttachment[] = [];
  let attachmentWarning: string | null = null;

  for (const file of files) {
    const result = await uploadTicketAttachment(file, ticketNo);
    if (result.error || !result.src) {
      for (const done of uploaded) {
        await discardTicketAttachment(done.path, `${context} upload failed`);
      }
      uploaded.length = 0;
      attachmentWarning = TICKET_ATTACHMENT_WARNING;
      break;
    }
    uploaded.push({ path: result.src, name: file.name, mime: file.type, sizeBytes: file.size });
  }

  const entryId = await recordTicketUpdate({
    ticketNo,
    kind,
    entryType: "status",
    status: TICKET_INTAKE_STATUS[kind],
    visibility: "public",
    authorKind: "system",
    authorName,
    attachments: uploaded,
  });

  if (!entryId && uploaded.length > 0) {
    for (const done of uploaded) {
      await discardTicketAttachment(done.path, `${context} timeline insert failed`);
    }
    attachmentWarning = TICKET_ATTACHMENT_WARNING;
  }

  return { entryId, attachmentWarning };
}
```

- [ ] **Step 3: Refactor `submitAssistance` onto the helpers**

In `src/features/assistance/actions.ts`:

1. Delete the local `ATTACHMENT_WARNING` constant and its comment block (they move to `ticket-attachments.ts` verbatim).
2. Replace the imports of `discardTicketAttachment`/`uploadTicketAttachment` and of `ALLOWED_DOC_FILE_TYPES`/`MAX_TICKET_FILES`/`MAX_TICKET_FILE_BYTES`/`sniffMimeType` with:

```ts
import { recordIntakeWithAttachments, validateTicketFiles } from "@/lib/ticket-attachments";
```

Keep `TICKET_INTAKE_STATUS` out of this file's imports if nothing else uses it; keep `markTicketUpdateNotified`.

3. Change the result type on the signature from `SubmitAssistanceResult` to `SubmitTicketWithFilesResult` (and the import in the `import type` line).
4. Replace the whole inline file-check block (the `files.length > MAX_TICKET_FILES` check through the `sniffMimeType` loop) with:

```ts
  // Everything the resident can fix is rejected here, before any row exists —
  // so the attachmentWarning path below is reserved for genuine storage
  // failures they had no part in.
  const fileError = await validateTicketFiles(files);
  if (fileError) {
    return { error: fileError, ticketNo: null, attachmentWarning: null };
  }
```

5. Replace the upload loop and the `recordTicketUpdate` call (everything from `const uploaded: TicketAttachment[] = [];` down to the closing brace of the `if (!entryId && uploaded.length > 0)` block) with:

```ts
  const { entryId, attachmentWarning } = await recordIntakeWithAttachments({
    ticketNo: data.ticket_no,
    kind: "assistance",
    files,
    context: "submitAssistance",
  });
```

6. Delete the now-unused `TicketAttachment` import if nothing else in the file uses it.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean. A `SubmitAssistanceResult` not-found error means a consumer was missed — `src/features/assistance/index.ts` and `assistance-form.tsx` are the likely ones.

- [ ] **Step 5: Verify the refactor changed no behaviour**

Start the dev server if it is not already running (`npm run dev`), then run the one spec that already exercises this exact path end to end:

Run: `npx playwright test tests/e2e/public/assistance-form.spec.ts --project=public`
Expected: PASS — a ticket number matching `AST-\d{4}-\d{5}` on screen. This spec forges a fresh random IP per run, so it has no shared rate-limit budget to collide with: **read a failure here as real**, not as a limiter collision.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ticket-attachments.ts src/types/index.ts src/features/assistance/actions.ts
git commit -m "refactor: extract shared intake-attachment helpers from submitAssistance"
```

---

### Task 3: `TicketFileField` — the shared picker

**Files:**
- Create: `src/components/shared/ticket-file-field.tsx`
- Modify: `src/features/assistance/components/assistance-form.tsx` (delete inline picker, use the component)
- Modify: `src/features/track/components/ticket-reply-form.tsx` (same)

**Interfaces:**
- Consumes: `downscaleImageFile`, `MAX_TICKET_FILE_BYTES` (Task 1).
- Produces: `export function TicketFileField(props: TicketFileFieldProps)` with props `{ files, onFilesChange, error, onErrorChange, preparing, onPreparingChange, idPrefix, label? }`.

- [ ] **Step 1: Write the component**

Create `src/components/shared/ticket-file-field.tsx`:

```tsx
"use client";

import { useRef } from "react";
import {
  ALLOWED_DOC_FILE_TYPES,
  MAX_TICKET_FILES,
  MAX_TICKET_FILE_BYTES,
} from "@/lib/storage";
import { downscaleImageFile } from "@/lib/downscale-image";

interface TicketFileFieldProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** Field-level rejection. Owned here, read by the parent to gate Submit. */
  error: string | null;
  onErrorChange: (error: string | null) => void;
  /** True while downscaling runs; the parent disables Submit on it. */
  preparing: boolean;
  onPreparingChange: (preparing: boolean) => void;
  /** Disambiguates the input id and its label. */
  idPrefix: string;
  label?: string;
}

/**
 * The one file picker for resident ticket attachments — public forms and
 * walk-in encoding both. A PURE picker: no network calls, chosen files live in
 * the parent form's state and become uploads only inside its submit action,
 * which is what keeps "a storage object exists only if a row references it"
 * true by construction.
 *
 * Oversized images are downscaled in the browser rather than rejected: a
 * straight-from-camera photo is routinely 3-5 MB against a 2 MB cap, and a
 * resident on a phone has no easy way to resize one. PDFs are never touched.
 */
export function TicketFileField({
  files,
  onFilesChange,
  error,
  onErrorChange,
  preparing,
  onPreparingChange,
  idPrefix,
  label = "Supporting documents (optional)",
}: TicketFileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  /** Clears the control AND the state. Leaving an earlier valid pick in `files`
   *  behind an input that now reads "no file chosen" would submit files the
   *  resident can no longer see. */
  function reject(message: string) {
    onErrorChange(message);
    onFilesChange([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length === 0) return;
    if (picked.length > MAX_TICKET_FILES) {
      reject(`You can attach up to ${MAX_TICKET_FILES} files.`);
      return;
    }
    if (
      picked.some(
        (file) =>
          !ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number]),
      )
    ) {
      reject("Attachments must be JPG, PNG, WebP, or PDF.");
      return;
    }

    onPreparingChange(true);
    try {
      const prepared: File[] = [];
      for (const file of picked) {
        const fitted = await downscaleImageFile(file, MAX_TICKET_FILE_BYTES);
        // null means it could not be made to fit, or the browser could not
        // decode it. Say so — never submit silently without the attachment.
        if (!fitted) {
          reject("Each attachment must be 2 MB or smaller.");
          return;
        }
        prepared.push(fitted);
      }
      onErrorChange(null);
      onFilesChange(prepared);
    } finally {
      onPreparingChange(false);
    }
  }

  const inputId = `${idPrefix}-files`;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-semibold text-ink-800">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleChange}
        className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
      />
      <p className="text-xs text-ink-500">
        Up to {MAX_TICKET_FILES} files, 2 MB each. JPG, PNG, WebP, or PDF. Large photos are
        resized automatically.
      </p>
      {preparing ? (
        <p className="text-xs text-ink-500" aria-live="polite">
          Preparing files…
        </p>
      ) : null}
      {/*
        Plain role="alert" text rather than an <InlineAlert>: this is
        field-level validation that clears itself on the next valid pick, so a
        close button would have nothing to dismiss to. The parent additionally
        disables Submit while this is set — see .claude/frontend.md.
      */}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Swap `AssistanceForm` onto it**

In `src/features/assistance/components/assistance-form.tsx`:

1. Add state next to the existing `fileError`:

```tsx
  const [filePreparing, setFilePreparing] = useState(false);
```

2. Replace the entire `<div className="space-y-2">` block containing the `assistance-files` input (from that opening tag through the closing `</div>` after the `fileError` paragraph) with:

```tsx
          <TicketFileField
            files={files}
            onFilesChange={setFiles}
            error={fileError}
            onErrorChange={setFileError}
            preparing={filePreparing}
            onPreparingChange={setFilePreparing}
            idPrefix="assistance"
          />
```

3. Extend the submit gate, keeping the existing comment above it:

```tsx
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={isPending || filePreparing || fileError !== null}
          >
```

4. Replace the `MAX_TICKET_FILES, MAX_TICKET_FILE_BYTES` import from `@/lib/storage` with:

```tsx
import { TicketFileField } from "@/components/shared/ticket-file-field";
```

(The label the component defaults to is the one this form already used, so the e2e selector keeps working.)

- [ ] **Step 3: Swap `TicketReplyForm` onto it**

In `src/features/track/components/ticket-reply-form.tsx`:

1. Add `const [filePreparing, setFilePreparing] = useState(false);` beside `fileError`.
2. Delete the whole `handleFiles` function.
3. Replace the `<div>` containing the `ticket-reply-files` input (through its `fileError` paragraph) with:

```tsx
        <TicketFileField
          files={files}
          onFilesChange={setFiles}
          error={fileError}
          onErrorChange={setFileError}
          preparing={filePreparing}
          onPreparingChange={setFilePreparing}
          idPrefix="ticket-reply"
          label="Attach files (optional)"
        />
```

4. Extend the gate: `disabled={isPending || filePreparing || fileError !== null}`.
5. Replace the `@/lib/storage` import with the `TicketFileField` import. Keep the module docstring but trim its "File type/size are checked here too" sentence to point at the shared component instead:

```tsx
 * The file picker is `TicketFileField`, shared with every other resident
 * attachment surface: pure, no network call until submit, and it downscales an
 * oversized photo rather than rejecting it.
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Verify in the browser**

Run the assistance spec again — it drives the swapped picker:

Run: `npx playwright test tests/e2e/public/assistance-form.spec.ts --project=public`
Expected: PASS.

Then check the downscaling by hand at `http://localhost:3000/assistance/new`: pick a photo over 2 MB, confirm "Preparing files…" appears and then clears with no error, and that the request files successfully. Pick a `.txt` renamed to `.pdf` and confirm the form rejects it and Submit is disabled.

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/ticket-file-field.tsx src/features/assistance/components/assistance-form.tsx src/features/track/components/ticket-reply-form.tsx
git commit -m "refactor: one shared TicketFileField picker with image downscaling"
```

---

### Task 4: Attachments on the public application form

**Files:**
- Modify: `src/features/services/actions.ts`
- Modify: `src/features/services/components/apply-form.tsx`
- Create: `tests/e2e/public/apply-form.spec.ts`

**Interfaces:**
- Consumes: `validateTicketFiles`, `recordIntakeWithAttachments`, `TICKET_ATTACHMENT_WARNING` (Task 2); `TicketFileField` (Task 3); `SubmitApplicationResult.attachmentWarning` (Task 2).
- Produces: `submitApplication(serviceId, values, files, turnstileToken)`.

- [ ] **Step 1: Widen `submitApplication`**

In `src/features/services/actions.ts`:

1. Add the import:

```ts
import { recordIntakeWithAttachments, validateTicketFiles } from "@/lib/ticket-attachments";
```

2. Change the signature and every early return to carry the new field:

```ts
export async function submitApplication(
  serviceId: string,
  values: PublicApplicationValues,
  files: File[],
  turnstileToken: string | null,
): Promise<SubmitApplicationResult> {
```

Every existing `return { error: …, ticketNo: null }` becomes `return { error: …, ticketNo: null, attachmentWarning: null }`. There are five of them: the Turnstile failure, the rate limit, the Zod failure, the service-lookup error, the wrong-flow rejection, and the unavailable-service rejection.

3. Immediately **after** the `service.is_available` check and **before** the `applications` insert, add the pre-insert gate:

```ts
  // Everything the resident can fix is rejected here, before any row exists —
  // so the attachmentWarning path below is reserved for genuine storage
  // failures they had no part in.
  const fileError = await validateTicketFiles(files);
  if (fileError) {
    return { error: fileError, ticketNo: null, attachmentWarning: null };
  }
```

4. Add the failed-insert return's new field, then replace the `recordTicketUpdate` call with:

```ts
  // data.ticket_no, never a client string — it becomes a storage path prefix.
  const { entryId, attachmentWarning } = await recordIntakeWithAttachments({
    ticketNo: data.ticket_no,
    kind: "application",
    files,
    context: "submitApplication",
  });
```

5. Drop the now-unused `TICKET_INTAKE_STATUS` and `recordTicketUpdate` imports (keep `markTicketUpdateNotified`), and change the final return to:

```ts
  return { error: null, ticketNo: data.ticket_no, attachmentWarning };
```

- [ ] **Step 2: Add the picker to `ApplyForm`**

In `src/features/services/components/apply-form.tsx`:

1. Add imports:

```tsx
import { TicketFileField } from "@/components/shared/ticket-file-field";
```

2. Add state beside the existing `error` state:

```tsx
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreparing, setFilePreparing] = useState(false);
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null);
```

3. Pass files to the action and capture the warning inside the existing `try`:

```tsx
        const result = await submitApplication(serviceId, values, files, turnstileToken);
        if (result.error || !result.ticketNo) {
          setError(result.error ?? "Something went wrong. Please try again.");
          return;
        }
        setAttachmentWarning(result.attachmentWarning);
        setTicketNo(result.ticketNo);
```

4. In the receipt branch, render the warning between the ticket-number card and the "What happens next" card — a dismissible `InlineAlert`, because unlike the field error this one has somewhere to dismiss to:

```tsx
          {attachmentWarning ? (
            <InlineAlert
              message={attachmentWarning}
              onDismiss={() => setAttachmentWarning(null)}
              className="mb-6 text-left"
            />
          ) : null}
```

5. In the form branch, add the picker directly after the "Purpose (optional)" `Field` and before the consent block:

```tsx
          <TicketFileField
            files={files}
            onFilesChange={setFiles}
            error={fileError}
            onErrorChange={setFileError}
            preparing={filePreparing}
            onPreparingChange={setFilePreparing}
            idPrefix="apply"
          />
```

6. Gate Submit:

```tsx
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={isPending || filePreparing || fileError !== null}
          >
```

- [ ] **Step 3: Write the e2e spec**

Create `tests/e2e/public/apply-form.spec.ts`. It targets the `barangay-clearance` service, confirmed present in `supabase/baseline/0000_baseline_2026-07-23.sql` and on the `apply` flow.

```ts
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Files a document application with a supporting document attached, end to
 * end: the file lands in the private `ticket-media` bucket, the row in
 * `ticket_updates` references it, and the resident sees a ticket number.
 *
 * Spends one `apply:<ip>` hit against `SUBMIT_LIMIT` = 10 per hour, but pins
 * itself to a fresh forged IP per run so no shared budget exists to collide
 * with — copied from `assistance-form.spec.ts`, which copied it from
 * `admin/login.spec.ts`. `page.route()` scoped to the app's own origin,
 * deliberately NOT `test.use({ extraHTTPHeaders })`, which would also send the
 * forged header to `challenges.cloudflare.com` and get the Turnstile widget
 * refused by its edge. NOT `cf-connecting-ip` — `requestIp()` ignores it.
 */
test.beforeEach(async ({ page, baseURL }) => {
  const h = randomUUID().replace(/-/g, "");
  const ip = `198.51.${parseInt(h.slice(0, 2), 16)}.${1 + (parseInt(h.slice(2, 4), 16) % 254)}`;
  const origin = new URL(baseURL ?? "http://localhost:3000").origin;
  await page.route(`${origin}/**`, async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), "x-forwarded-for": ip },
    });
  });
});

test("an application with a supporting document is filed and returns a ticket", async ({
  page,
}) => {
  await page.goto("/services/apply/barangay-clearance");

  await page.getByLabel("First name").fill("Testd");
  // Date.now()-suffixed for the reason ticket-updates.spec.ts established: a
  // fixed surname ties with rows previous runs left behind.
  await page.getByLabel("Last name").fill(`Ramos${Date.now()}`);
  await page.getByLabel("Date of birth").fill("1990-01-15");
  await page.getByLabel("Contact number").fill(`(077) 600-${String(Date.now()).slice(-4)}`);
  await page.getByLabel("Sitio / street address").fill("Sitio 1, Barangay San Fernando");

  await page.getByLabel("Supporting documents (optional)").setInputFiles({
    name: "valid-id.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 test"),
  });

  await page.getByRole("checkbox").check();
  // Turnstile's token arrives asynchronously via a callback into React state;
  // ApplyForm has no form-action hidden input to poll, so there is no DOM
  // signal to wait on. A short pause covers the always-pass test key.
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Submit application" }).click();

  await expect(page.getByText("Application filed")).toBeVisible();
  await expect(page.getByText(/APP-\d{4}-\d{5}/)).toBeVisible();
});
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean. A type error at a `submitApplication` call site means a caller was missed — grep for it.

- [ ] **Step 5: Run the new spec**

Run: `npx playwright test tests/e2e/public/apply-form.spec.ts --project=public`
Expected: PASS. This spec forges its own IP, so a failure is real, not a limiter collision.

- [ ] **Step 6: Commit**

```bash
git add src/features/services/actions.ts src/features/services/components/apply-form.tsx tests/e2e/public/apply-form.spec.ts
git commit -m "feat: accept attachments on the public application form"
```

---

### Task 5: Attachments on the public incident report form

**Files:**
- Modify: `src/features/complaints/actions.ts`
- Modify: `src/features/complaints/components/complaint-form.tsx`

**Interfaces:**
- Consumes: `validateTicketFiles`, `recordIntakeWithAttachments`, `SubmitTicketWithFilesResult` (Task 2); `TicketFileField` (Task 3).
- Produces: `submitComplaint(values, files, turnstileToken)`.

- [ ] **Step 1: Widen `submitComplaint`**

In `src/features/complaints/actions.ts`:

1. Change the type import from `SubmitTicketResult` to `SubmitTicketWithFilesResult`, and add:

```ts
import { recordIntakeWithAttachments, validateTicketFiles } from "@/lib/ticket-attachments";
```

2. New signature:

```ts
export async function submitComplaint(
  values: PublicComplaintValues,
  files: File[],
  turnstileToken: string | null,
): Promise<SubmitTicketWithFilesResult> {
```

3. Add `attachmentWarning: null` to all five existing early returns (Turnstile, rate limit, Zod, service-lookup error, unavailable service) and to the failed-insert return.

4. After the `service?.is_available` check and before the `complaints` insert:

```ts
  // Everything the resident can fix is rejected here, before any row exists —
  // so the attachmentWarning path below is reserved for genuine storage
  // failures they had no part in.
  const fileError = await validateTicketFiles(files);
  if (fileError) {
    return { error: fileError, ticketNo: null, attachmentWarning: null };
  }
```

5. Replace the `recordTicketUpdate` call with:

```ts
  // data.ticket_no, never a client string — it becomes a storage path prefix.
  const { entryId, attachmentWarning } = await recordIntakeWithAttachments({
    ticketNo: data.ticket_no,
    kind: "complaint",
    files,
    context: "submitComplaint",
  });
```

6. Drop the unused `TICKET_INTAKE_STATUS`/`recordTicketUpdate` imports (keep `markTicketUpdateNotified`) and return:

```ts
  return { error: null, ticketNo: data.ticket_no, attachmentWarning };
```

- [ ] **Step 2: Add the picker to `ComplaintForm`**

In `src/features/complaints/components/complaint-form.tsx`, apply the identical five edits Task 4 Step 2 made to `ApplyForm`:

1. `import { TicketFileField } from "@/components/shared/ticket-file-field";`
2. State:

```tsx
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreparing, setFilePreparing] = useState(false);
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null);
```

3. In the transition:

```tsx
        const result = await submitComplaint(values, files, turnstileToken);
        if (result.error || !result.ticketNo) {
          setError(result.error ?? "Something went wrong. Please try again.");
          return;
        }
        setAttachmentWarning(result.attachmentWarning);
        setTicketNo(result.ticketNo);
```

4. In the receipt branch, after the ticket-number card:

```tsx
          {attachmentWarning ? (
            <InlineAlert
              message={attachmentWarning}
              onDismiss={() => setAttachmentWarning(null)}
              className="mb-6 text-left"
            />
          ) : null}
```

5. In the form branch, after the narrative field and before the consent block:

```tsx
          <TicketFileField
            files={files}
            onFilesChange={setFiles}
            error={fileError}
            onErrorChange={setFileError}
            preparing={filePreparing}
            onPreparingChange={setFilePreparing}
            idPrefix="complaint"
            label="Photos or documents (optional)"
          />
```

6. Gate Submit: `disabled={isPending || filePreparing || fileError !== null}`.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Verify in the browser**

No new spec here: each submitting run spends real budget against `submitComplaint`'s tighter `SUBMIT_LIMIT` = 5/hour, and Tasks 3 and 4 already cover the shared picker and the shared upload sequence.

At `http://localhost:3000/complaints/new`, file a report with one image attached. Confirm the ticket receipt shows a `CMP-` number. Then open `/admin/complaints`, find the ticket, and confirm the attachment is listed in its timeline panel.

- [ ] **Step 5: Commit**

```bash
git add src/features/complaints/actions.ts src/features/complaints/components/complaint-form.tsx
git commit -m "feat: accept attachments on the public incident report form"
```

---

### Task 6: Attachments on walk-in application encoding

**Files:**
- Modify: `src/features/admin/actions/applications.ts`
- Modify: `src/features/admin/components/application-form.tsx`
- Modify: `src/features/admin/components/applications-manager.tsx`

**Interfaces:**
- Consumes: `validateTicketFiles`, `recordIntakeWithAttachments`, `WalkInTicketResult` (Task 2); `TicketFileField` (Task 3).
- Produces: `createWalkInApplication(values, files): Promise<WalkInTicketResult>`.

- [ ] **Step 1: Widen `createWalkInApplication`**

In `src/features/admin/actions/applications.ts`:

1. Add to the type import: `WalkInTicketResult`. Add:

```ts
import { recordIntakeWithAttachments, validateTicketFiles } from "@/lib/ticket-attachments";
```

2. New signature:

```ts
export async function createWalkInApplication(
  values: WalkInApplicationValues,
  files: File[],
): Promise<WalkInTicketResult> {
```

3. Add `attachmentWarning: null` to each of its early returns: the `NOT_FOUND` permission failure, the Zod failure, the service-lookup error, the invalid-document-type rejection and the failed-insert return.

4. After the `service.flow !== "apply"` check and before the insert:

```ts
  // Staff-fixable rejections happen before any row exists, exactly as on the
  // public path — a bad scan must not cost the resident at the counter a
  // ticket number.
  const fileError = await validateTicketFiles(files);
  if (fileError) return { error: fileError, attachmentWarning: null };
```

5. Replace the `recordTicketUpdate` call with:

```ts
  const { entryId, attachmentWarning } = await recordIntakeWithAttachments({
    ticketNo: data.ticket_no,
    kind: "application",
    files,
    authorName: actor.fullName,
    context: "createWalkInApplication",
  });
```

6. Leave the existing `recordActivity` call exactly as it is. **No separate audit entry for the upload** — the create is the auditable event, the same reasoning the admin document Route Handler records for itself.

7. Final return:

```ts
  return { error: null, attachmentWarning };
```

- [ ] **Step 2: Add the picker to the admin `ApplicationForm`**

In `src/features/admin/components/application-form.tsx`:

1. Add imports:

```tsx
import { TicketFileField } from "@/components/shared/ticket-file-field";
```

2. Change the props interface and destructuring so the parent receives files:

```tsx
interface ApplicationFormProps {
  services: { id: string; title: string }[];
  onSubmit: (values: WalkInApplicationValues, files: File[]) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDismissError: () => void;
}
```

3. Add state below the existing `values` state:

```tsx
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreparing, setFilePreparing] = useState(false);
```

4. Pass them on submit:

```tsx
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(values, files);
  };
```

5. Add the picker after the "Purpose (optional)" field and before the consent label:

```tsx
        <TicketFileField
          files={files}
          onFilesChange={setFiles}
          error={fileError}
          onErrorChange={setFileError}
          preparing={filePreparing}
          onPreparingChange={setFilePreparing}
          idPrefix="walkin-application"
          label="Documents handed over (optional)"
        />
```

6. Gate the encode button:

```tsx
        <Button type="submit" disabled={saving || filePreparing || fileError !== null}>
```

- [ ] **Step 3: Pass files through the manager**

In `src/features/admin/components/applications-manager.tsx`, change `handleCreate`:

```tsx
  const handleCreate = (values: WalkInApplicationValues, files: File[]) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await createWalkInApplication(values, files);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        setCreateOpen(false);
        setPage(1);
        // The ticket is encoded either way; the toast says which happened
        // rather than failing an encode that actually succeeded.
        showToast(result.attachmentWarning ?? "Walk-in application encoded.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Verify in the browser**

Sign in to `/admin/applications`, click **New Application**, fill the form, attach a PDF, and encode. Confirm the toast reads "Walk-in application encoded." and that opening the new ticket's review drawer shows the attachment in its timeline.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/actions/applications.ts src/features/admin/components/application-form.tsx src/features/admin/components/applications-manager.tsx
git commit -m "feat: accept attachments when encoding a walk-in application"
```

---

### Task 7: Attachments on walk-in complaint encoding

**Files:**
- Modify: `src/features/admin/actions/complaints.ts`
- Modify: `src/features/admin/components/complaint-form.tsx`
- Modify: `src/features/admin/components/complaints-manager.tsx`

**Interfaces:**
- Consumes: `validateTicketFiles`, `recordIntakeWithAttachments`, `WalkInTicketResult` (Task 2); `TicketFileField` (Task 3).
- Produces: `createWalkInComplaint(values, files): Promise<WalkInTicketResult>`.

- [ ] **Step 1: Widen `createWalkInComplaint`**

In `src/features/admin/actions/complaints.ts`:

1. Add `WalkInTicketResult` to the type import and add:

```ts
import { recordIntakeWithAttachments, validateTicketFiles } from "@/lib/ticket-attachments";
```

2. New signature:

```ts
export async function createWalkInComplaint(
  values: WalkInComplaintValues,
  files: File[],
): Promise<WalkInTicketResult> {
```

3. Add `attachmentWarning: null` to every early return in the function (permission failure, Zod failure, and the failed-insert return).

4. Immediately before the `complaints` insert:

```ts
  // Staff-fixable rejections happen before any row exists, exactly as on the
  // public path — a bad scan must not cost the resident at the counter a
  // ticket number.
  const fileError = await validateTicketFiles(files);
  if (fileError) return { error: fileError, attachmentWarning: null };
```

5. Replace the `recordTicketUpdate` call with:

```ts
  const { entryId, attachmentWarning } = await recordIntakeWithAttachments({
    ticketNo: data.ticket_no,
    kind: "complaint",
    files,
    authorName: actor.fullName,
    context: "createWalkInComplaint",
  });
```

This action does send an intake email and uses `entryId` for `markTicketUpdateNotified`, so keep both halves of the destructure and leave the email block below it exactly as it is.

6. Leave `recordActivity` untouched. Final return:

```ts
  return { error: null, attachmentWarning };
```

- [ ] **Step 2: Add the picker to the admin `ComplaintForm`**

In `src/features/admin/components/complaint-form.tsx`:

1. `import { TicketFileField } from "@/components/shared/ticket-file-field";`
2. Props:

```tsx
interface ComplaintFormProps {
  onSubmit: (values: WalkInComplaintValues, files: File[]) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDismissError: () => void;
}
```

3. State:

```tsx
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreparing, setFilePreparing] = useState(false);
```

4. `onSubmit(values, files);` in `handleSubmit`.
5. Picker after the narrative field, before the consent label:

```tsx
        <TicketFileField
          files={files}
          onFilesChange={setFiles}
          error={fileError}
          onErrorChange={setFileError}
          preparing={filePreparing}
          onPreparingChange={setFilePreparing}
          idPrefix="walkin-complaint"
          label="Photos or documents (optional)"
        />
```

6. Gate the submit button: `disabled={saving || filePreparing || fileError !== null}`.

- [ ] **Step 3: Pass files through the manager**

In `src/features/admin/components/complaints-manager.tsx`:

```tsx
  const handleCreate = (values: WalkInComplaintValues, files: File[]) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await createWalkInComplaint(values, files);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        setCreateOpen(false);
        setPage(1);
        showToast(result.attachmentWarning ?? "Walk-in report encoded.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };
```

`"Walk-in report encoded."` is the string this file already uses — it is preserved, not invented.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Verify in the browser**

At `/admin/complaints`, encode a walk-in report with an image attached and confirm it appears in the new ticket's timeline.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/actions/complaints.ts src/features/admin/components/complaint-form.tsx src/features/admin/components/complaints-manager.tsx
git commit -m "feat: accept attachments when encoding a walk-in complaint"
```

---

### Task 8: Attachments on walk-in assistance encoding

Closes the gap where the public assistance form can attach but its counter twin cannot.

**Files:**
- Modify: `src/features/admin/actions/assistance.ts`
- Modify: `src/features/admin/components/assistance-form.tsx`
- Modify: `src/features/admin/components/assistance-manager.tsx`

**Interfaces:**
- Consumes: `validateTicketFiles`, `recordIntakeWithAttachments`, `WalkInTicketResult` (Task 2); `TicketFileField` (Task 3).
- Produces: `createWalkInAssistance(values, files): Promise<WalkInTicketResult>`.

- [ ] **Step 1: Widen `createWalkInAssistance`**

In `src/features/admin/actions/assistance.ts`:

1. Add `WalkInTicketResult` to the type import and add:

```ts
import { recordIntakeWithAttachments, validateTicketFiles } from "@/lib/ticket-attachments";
```

2. New signature:

```ts
export async function createWalkInAssistance(
  values: WalkInAssistanceValues,
  files: File[],
): Promise<WalkInTicketResult> {
```

3. Add `attachmentWarning: null` to every early return (permission failure, Zod failure, the category-lookup error, the retired-category rejection, and the failed-insert return).

4. After the category checks and before the `assistance_requests` insert:

```ts
  // Staff-fixable rejections happen before any row exists, exactly as on the
  // public path — a bad scan must not cost the resident at the counter a
  // ticket number.
  const fileError = await validateTicketFiles(files);
  if (fileError) return { error: fileError, attachmentWarning: null };
```

5. Replace the `recordTicketUpdate` call with:

```ts
  const { entryId, attachmentWarning } = await recordIntakeWithAttachments({
    ticketNo: data.ticket_no,
    kind: "assistance",
    files,
    authorName: actor.fullName,
    context: "createWalkInAssistance",
  });
```

This action does send an intake email and uses `entryId` for `markTicketUpdateNotified`, so keep both halves of the destructure and leave the email block below it exactly as it is.

6. Leave `recordActivity` untouched. Final return:

```ts
  return { error: null, attachmentWarning };
```

- [ ] **Step 2: Add the picker to the admin `AssistanceForm`**

In `src/features/admin/components/assistance-form.tsx`:

1. `import { TicketFileField } from "@/components/shared/ticket-file-field";`
2. Props:

```tsx
interface AssistanceFormProps {
  categories: { id: string; label: string }[];
  onSubmit: (values: WalkInAssistanceValues, files: File[]) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDismissError: () => void;
}
```

3. State:

```tsx
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreparing, setFilePreparing] = useState(false);
```

4. `onSubmit(values, files);` in `handleSubmit`.
5. Picker after the details field, before the consent label:

```tsx
        <TicketFileField
          files={files}
          onFilesChange={setFiles}
          error={fileError}
          onErrorChange={setFileError}
          preparing={filePreparing}
          onPreparingChange={setFilePreparing}
          idPrefix="walkin-assistance"
          label="Documents handed over (optional)"
        />
```

6. Gate the submit button: `disabled={saving || filePreparing || fileError !== null}`.

- [ ] **Step 3: Pass files through the manager**

In `src/features/admin/components/assistance-manager.tsx`:

```tsx
  const handleCreate = (values: WalkInAssistanceValues, files: File[]) => {
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await createWalkInAssistance(values, files);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        setCreateOpen(false);
        setPage(1);
        showToast(result.attachmentWarning ?? "Walk-in request encoded.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  };
```

`"Walk-in request encoded."` is the string this file already uses — it is preserved, not invented.

- [ ] **Step 4: Typecheck, lint and full unit suite**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all clean.

- [ ] **Step 5: Verify in the browser**

At `/admin/assistance`, encode a walk-in request with a PDF attached and confirm it appears in the new ticket's timeline.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/actions/assistance.ts src/features/admin/components/assistance-form.tsx src/features/admin/components/assistance-manager.tsx
git commit -m "feat: accept attachments when encoding a walk-in assistance request"
```

---

### Task 9: Documentation

Required in the same session as the code, per CLAUDE.md's "Keeping these docs true". Prefer correcting an existing bullet over appending a new one, and delete what these changes made untrue.

**Files:**
- Modify: `.claude/storage.md`
- Modify: `.claude/resident-portal.md`
- Modify: `.claude/admin-cms.md`
- Modify: `.claude/frontend.md`
- Modify: `.claude/testing.md`
- Check: `docs/HARDENING_BACKLOG.md`

- [ ] **Step 1: `.claude/storage.md`**

Rewrite the "Resident ticket attachments (private `ticket-media`)" section so it describes six ingest callers, not two. It must state:

- The caps are unchanged (3 × 2 MB) and why (the `"8mb"` `bodySizeLimit`).
- `src/lib/ticket-attachments.ts` is the single owner of the upload-after-insert sequence: `validateTicketFiles` is the pre-insert gate, `recordIntakeWithAttachments` does upload → timeline write → compensating discard → warning. All six callers (`submitApplication`, `submitComplaint`, `submitAssistance`, and the three `createWalkIn*` actions) go through it; `submitTicketReply` keeps its own path because it writes a `reply` entry, not an intake one.
- Attachments are **downscaled in the browser** by `src/lib/downscale-image.ts` before they reach the cap check, and the output `File`'s type comes from `blob.type` for the same reason `cropFromImage` documents.
- Appointments accept no attachments on either surface, deliberately.

Then re-audit the `sniffMimeType` bullet against the code: it currently claims "Six call sites" and names `uploadTicketAttachment`, `uploadFeedbackScreenshot`, `uploadSingleImage`, the document Route Handler, `attachPendingPhotos` and `uploadAchievementPhotos`. Run `git grep -n sniffMimeType src/` and correct the count and the list — `validateTicketFiles` is now one of them, and it replaced the inline sniff `submitAssistance` used to do.

- [ ] **Step 2: `.claude/resident-portal.md`**

In "The four ticket flows", state that three of the four accept attachments at filing (`apply`, `complaint`, `assistance`) and that appointments deliberately do not. Correct the `/assistance/new` paragraph's claim that filing-time attachments needed no new schema — still true, and now true of all three — and point at `src/lib/ticket-attachments.ts` as the shared owner rather than describing assistance as a second caller of the reply machinery.

Update the `/track` section's attachment bullet to name `TicketFileField` as the picker.

- [ ] **Step 3: `.claude/admin-cms.md`**

Add to the walk-in encoding material: the application, complaint and assistance encode forms accept up to 3 × 2 MB attachments through the same `TicketFileField`; the appointment one does not. The encode action files **no separate audit entry** for the upload — the create is the auditable event. A failed upload does not fail the encode; the manager's toast carries the warning instead.

- [ ] **Step 4: `.claude/frontend.md`**

Rewrite the file-picker bullet under "Every error banner is dismissible". It currently names `AssistanceForm`, `TicketReplyForm` and `FeedbackPanel` as three places that each carry the gate. Now: `TicketFileField` owns the field error for every ticket attachment surface and the parent gates Submit on `fileError !== null || filePreparing` — the second half being new, because downscaling is async and a submit landing mid-resize would file with no attachment. `FeedbackPanel` keeps its own picker and its own copy of the gate (different bucket, images only, single file).

- [ ] **Step 5: `.claude/testing.md`**

Add `public/apply-form.spec.ts` to the rate-limit budget table: spends 1 `apply:<ip>` against `SUBMIT_LIMIT` = 10/hour, but forges a fresh random IP per run, so no shared budget exists to collide with — read a failure as real. Note in the same table that the complaint flow has no submitting spec on purpose, since its 5/hour budget is the tightest of the public forms.

- [ ] **Step 6: Check the hardening backlog**

Run: `git grep -n -i "attach\|upload" docs/HARDENING_BACKLOG.md`
Delete any entry this work shipped. If nothing matches, leave the file alone.

- [ ] **Step 7: Full verification before calling it done**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run build
```

Expected: all clean. `npm run build` is included because the two new public forms change route payloads and a missing `"use client"` surfaces at build, not at typecheck.

- [ ] **Step 8: Commit**

```bash
git add .claude docs/HARDENING_BACKLOG.md
git commit -m "docs: record resident ticket attachments across apply, complaint and walk-in flows"
```

---

## Notes for the reviewer

- **Nothing in this plan touches appointments.** If a diff shows `appointments.ts`, `appointment-form.tsx` or `submitAppointment`, that is out of scope.
- **No migration.** A diff touching `supabase/` is out of scope.
- **Task 2 must not change behaviour.** It is an extraction, verified against the one call site that already worked. If the assistance e2e spec fails there, the extraction is wrong — do not adjust the spec to match.
- The `entryId` returned by `recordIntakeWithAttachments` is only used to call `markTicketUpdateNotified` after an email sends. Actions that send no intake email do not need it.
