# Body-Size-Limit Scoping (Security-Hardening Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move legislative/transparency document uploads off the Server Action
body path onto a new authenticated Route Handler, `POST /api/admin/uploads/document`,
per `docs/superpowers/specs/2026-07-28-security-hardening-design.md` §6 — so that
`next.config.ts`'s global `experimental.serverActions.bodySizeLimit` no longer has
to be sized for a single 10 MB PDF, closing the gap where that same global limit
also raised the accepted body size on all 8 public, unauthenticated Server Actions.

**Architecture:** `PdfUploader`/`MultiFileUploader` stay pure file pickers — no
change there. On Save, the three client forms (`legislative-form.tsx`,
`transparency-document-form.tsx`, `transparency-project-form.tsx`) now make
**two** calls instead of one: first a `fetch()` to the new Route Handler
(multipart, own size ceiling, own `checkPermission` check, returns uploaded
path/size/mime), then the existing Server Action — `saveLegislative` /
`saveTransparencyDocument` / `saveTransparencyProject` — now taking the
already-uploaded path(s) as plain arguments instead of a `File` inside
`FormData`. The compensating-delete guarantee ("a storage object exists only if
a row references it") is unchanged: the save actions still delete the newly
uploaded object if the row write fails, exactly as today.

**Important correction to the design spec, confirmed with the project owner
before this plan was written:** §6 of the design spec says `bodySizeLimit` can
be *deleted* entirely once PDFs move off the Server Action path, reverting to
Next's 1 MB default, because "no remaining Server Action needs a non-default
limit." That's false for this codebase: `uploadSingleImage` (`src/lib/media.ts`)
allows images up to `MAX_IMAGE_BYTES` (2 MB) and is called *inside*
`saveOfficial`/`saveEvent`/`saveAnnouncement`/site-content Server Actions, and
both `saveNewsArticle` (`news.ts`, `MAX_PHOTOS = 3`) and
`uploadAchievementPhotos` (`achievement-photos.ts`, `MAX_PHOTOS = 3`) accept up
to **three** 2 MB photos in one Server Action call — up to 6 MB. Deleting the
line as literally spec'd would 413 the first admin who saves a >1MB portrait or
a multi-photo news post. This plan instead **right-sizes** the limit (Task 9)
rather than deleting it — the smallest change that's still correct, matching
the spec's own "least invasive change that actually closes it" goal. Images
are explicitly out of scope for this plan (that would be a materially bigger
pass touching 7+ more upload flows); only the document/PDF path moves.

**Tech Stack:** Next.js 16 Route Handlers (Node.js runtime, no `bodySizeLimit`
config — that option only applies to Server Actions), Supabase Storage
service-role client, Vitest for the one pure-function unit, manual/browser
verification for everything Supabase- or Next-request-shaped (this project's
established convention — see `CLAUDE.md`'s Commands section and
`tests/unit/storage.test.ts`).

## Global Constraints

- Path alias `@/*` → `src/*`.
- zod is v4 — use `z.enum(...)`, not deprecated v3 forms.
- `npm run typecheck` and `npm run lint` must both pass clean before any task
  is considered done.
- Never `git add -A` — this repo has intentionally-untracked directories
  (`proposal/`, `stitch_tabbed_content_manager/`) at the root. Stage explicit
  paths only.
- Object path strings for documents (`legislative/<uuid>.pdf`,
  `documents/<uuid>.<ext>`, `projects/<uuid>.<ext>`) are unchanged — only which
  request uploads them changes. No database column changes anywhere in this
  plan, no new migration.
- Every Server Action is a public HTTP endpoint; every Route Handler is too.
  Any value a client can supply (a `path` string, a `kind`, a `status`) must be
  validated/allow-listed server-side before it's trusted — never assume a
  value only because "the client only ever sends a valid one."
- `checkPermission("manage-transparency")` is the auth gate for every new/
  changed entry point in this plan — no new permission, no `requirePermission`
  (Route Handlers use the same Server-Action-flavored `checkPermission` helper;
  it just reads cookies via `next/headers`, which works identically outside a
  Server Action).
- Uploads inside this Route Handler are **not** audited (`recordActivity`) —
  mirrors the deliberate reasoning already in `documents.ts` for
  `uploadDocumentPdf`/`uploadTransparencyFile`: this is one step inside a
  larger save action that records its own create/update entry, and it doubles
  as the compensating-delete path when a later step fails, where a
  `file_delete` log entry would misrepresent an operation the user never
  completed.
- CLAUDE.md must be updated in the same session per the repo's standing
  "document every change" rule (last task).
- This plan does not touch item 7 (privacy/terms — already shipped), item 8
  (RLS/CSRF review), or item 9 (security Playwright tests) — those are
  untouched, independent items from the same design spec.

---

## File Structure

- **Modify** `src/lib/storage.ts` — add `DocUploadKind` type + `uploadRulesFor()`
  pure function (the validation ceiling per upload kind).
- **Modify** `tests/unit/storage.test.ts` — add `uploadRulesFor` cases.
- **Create** `src/app/api/admin/uploads/document/route.ts` — the new Route
  Handler.
- **Create** `src/features/admin/lib/document-upload-client.ts` — client-side
  `fetch()` wrapper the three forms call before invoking their save action.
- **Modify** `src/features/admin/actions/legislative.ts` — `saveLegislative`
  signature change.
- **Modify** `src/features/admin/actions/transparency-documents.ts` —
  `saveTransparencyDocument` signature change.
- **Modify** `src/features/admin/actions/transparency-projects.ts` —
  `saveTransparencyProject` signature change.
- **Modify** `src/features/admin/actions/documents.ts` — delete
  `uploadDocumentPdf`/`uploadTransparencyFile` (dead code once nothing calls
  them); `removeStoredDocument` is untouched.
- **Modify** `src/features/admin/components/legislative-form.tsx` — `handleSave`
  uploads first, then saves.
- **Modify** `src/features/admin/components/transparency-document-form.tsx` and
  `transparency-project-form.tsx` — same two-step `handleSave`.
- **Modify** `next.config.ts` — `bodySizeLimit` right-sized from `"12mb"` to
  `"8mb"`, comment rewritten.
- **Modify** `CLAUDE.md` — document this plan under the security-hardening
  bullet.

---

### Task 1: `uploadRulesFor` pure helper

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `tests/unit/storage.test.ts`

**Interfaces:**
- Consumes: `ALLOWED_PDF_TYPES`, `MAX_PDF_BYTES`, `ALLOWED_DOC_FILE_TYPES`,
  `MAX_DOC_FILE_BYTES`, `MAX_FILES_PER_RECORD` (all already exported from this
  file, unchanged).
- Produces (for Task 2 to consume):
  - `type DocUploadKind = "legislative" | "documents" | "projects"`
  - `interface DocUploadRules { mediaKind: "legislative" | "transparency"; allowedTypes: readonly string[]; maxBytes: number; maxFiles: number }`
  - `function uploadRulesFor(kind: DocUploadKind): DocUploadRules`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/storage.test.ts` (extend the existing import line rather
than adding a second one):

```ts
import { describe, expect, it } from "vitest";
import {
  AVATARS_MEDIA_BUCKET,
  SITE_MEDIA_BUCKET,
  bucketForStatus,
  draftBucketFor,
  mediaUrl,
  publicBucketFor,
  uploadRulesFor,
} from "@/lib/storage";
```

Append at the end of the file:

```ts
describe("uploadRulesFor", () => {
  it("caps legislative uploads to exactly one PDF", () => {
    const rules = uploadRulesFor("legislative");
    expect(rules.mediaKind).toBe("legislative");
    expect(rules.maxFiles).toBe(1);
    expect(rules.allowedTypes).toEqual(["application/pdf"]);
  });

  it("caps transparency documents to MAX_FILES_PER_RECORD PDF-or-image files", () => {
    const rules = uploadRulesFor("documents");
    expect(rules.mediaKind).toBe("transparency");
    expect(rules.maxFiles).toBe(3);
    expect(rules.allowedTypes).toContain("image/png");
  });

  it("gives transparency projects the same rules as documents", () => {
    expect(uploadRulesFor("projects")).toEqual(uploadRulesFor("documents"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storage.test.ts`
Expected: FAIL — `uploadRulesFor` is not exported yet.

- [ ] **Step 3: Implement the helper**

In `src/lib/storage.ts`, add immediately after the `MAX_FILES_PER_RECORD`
constant (after the "Documents & projects accept PDF *or* image..." block,
before `extForDocType`):

```ts
/** The three document/PDF upload surfaces the Route Handler at
 * /api/admin/uploads/document (security-hardening Plan 3) serves. */
export type DocUploadKind = "legislative" | "documents" | "projects";

export interface DocUploadRules {
  mediaKind: "legislative" | "transparency";
  allowedTypes: readonly string[];
  maxBytes: number;
  maxFiles: number;
}

/**
 * Validation ceiling per upload kind. Legislative accepts exactly one PDF;
 * transparency documents/projects accept up to MAX_FILES_PER_RECORD
 * PDF-or-image files each — mirrors the rules `uploadDocumentPdf`/
 * `uploadTransparencyFile` used to enforce before this plan moved them into
 * the Route Handler.
 */
export function uploadRulesFor(kind: DocUploadKind): DocUploadRules {
  if (kind === "legislative") {
    return { mediaKind: "legislative", allowedTypes: ALLOWED_PDF_TYPES, maxBytes: MAX_PDF_BYTES, maxFiles: 1 };
  }
  return {
    mediaKind: "transparency",
    allowedTypes: ALLOWED_DOC_FILE_TYPES,
    maxBytes: MAX_DOC_FILE_BYTES,
    maxFiles: MAX_FILES_PER_RECORD,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storage.test.ts`
Expected: PASS, all cases including the new `uploadRulesFor` describe block.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/lib/storage.ts tests/unit/storage.test.ts
git commit -m "feat: add uploadRulesFor for the document upload Route Handler"
```

---

### Task 2: `POST /api/admin/uploads/document` Route Handler

**Files:**
- Create: `src/app/api/admin/uploads/document/route.ts`

**Interfaces:**
- Consumes: `uploadRulesFor` / `DocUploadKind` (Task 1), `checkPermission`,
  `NOT_FOUND` (from `@/lib/auth`), `bucketForStatus`, `extForDocType` (already
  exported from `@/lib/storage`), `createSupabaseAdminClient`.
- Produces (for Task 3 to consume): a JSON response shaped
  `{ error: string | null; files: { path: string; sizeBytes: number; mime: string }[] }`,
  sent from a `POST` request whose body is `multipart/form-data` with fields
  `kind` (`DocUploadKind`), `status` (`ContentStatus`), and one or more `file`
  entries.

- [ ] **Step 1: Write the Route Handler**

Create `src/app/api/admin/uploads/document/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bucketForStatus, extForDocType, uploadRulesFor, type DocUploadKind } from "@/lib/storage";

export interface UploadedDocumentFile {
  path: string;
  sizeBytes: number;
  mime: string;
}
interface UploadDocumentResponse {
  error: string | null;
  files: UploadedDocumentFile[];
}

const kindSchema = z.enum(["legislative", "documents", "projects"]);
const statusSchema = z.enum(["draft", "in-review", "published", "archived"]);

function fail(error: string, status: number): NextResponse<UploadDocumentResponse> {
  return NextResponse.json({ error, files: [] }, { status });
}

/**
 * Authenticated multipart upload for legislative/transparency documents,
 * moved off the Server Action body path (security-hardening Plan 3): a
 * single 10 MB PDF was forcing next.config.ts's global
 * serverActions.bodySizeLimit up for every public, unauthenticated form too.
 * Not audited (no recordActivity call) — see this plan's Global Constraints
 * for why, mirroring documents.ts's former uploadDocumentPdf/
 * uploadTransparencyFile.
 */
export async function POST(request: Request): Promise<NextResponse<UploadDocumentResponse>> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return fail(NOT_FOUND, 404);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Upload failed. Try again.", 400);
  }

  const kindResult = kindSchema.safeParse(formData.get("kind"));
  const statusResult = statusSchema.safeParse(formData.get("status"));
  if (!kindResult.success || !statusResult.success) {
    return fail("Upload failed. Try again.", 400);
  }
  const kind: DocUploadKind = kindResult.data;
  const status = statusResult.data;
  const rules = uploadRulesFor(kind);

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return fail("Choose a file.", 400);
  if (files.length > rules.maxFiles) {
    return fail(rules.maxFiles === 1 ? "Choose one file." : `Up to ${rules.maxFiles} files.`, 400);
  }

  const admin = createSupabaseAdminClient();
  const bucket = bucketForStatus(rules.mediaKind, status);
  const uploaded: UploadedDocumentFile[] = [];

  async function cleanupUploaded() {
    if (uploaded.length === 0) return;
    const { error } = await admin.storage.from(bucket).remove(uploaded.map((u) => u.path));
    if (error) {
      console.error(`Orphaned storage object(s) (upload cleanup failed): ${uploaded.map((u) => u.path).join(", ")}`);
    }
  }

  for (const file of files) {
    if (!rules.allowedTypes.includes(file.type as (typeof rules.allowedTypes)[number])) {
      await cleanupUploaded();
      return fail(kind === "legislative" ? "The document must be a PDF." : "Files must be a PDF or image.", 400);
    }
    if (file.size > rules.maxBytes) {
      await cleanupUploaded();
      return fail(`Each file must be ${rules.maxBytes / (1024 * 1024)} MB or smaller.`, 400);
    }

    const path = `${kind}/${crypto.randomUUID()}.${extForDocType(file.type)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(bucket).upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      await cleanupUploaded();
      return fail("Upload failed. Try again.", 500);
    }
    uploaded.push({ path, sizeBytes: file.size, mime: file.type });
  }

  return NextResponse.json({ error: null, files: uploaded });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. (No automated test for this file — it's Supabase- and
Next-`Request`-calling code, which this project verifies by typecheck + lint +
manual browser testing, not mocked-client unit tests; see `CLAUDE.md`'s
Commands section and the same convention already applied to `documents.ts`/
`media.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/uploads/document/route.ts
git commit -m "feat: add authenticated Route Handler for document uploads"
```

---

### Task 3: Client-side upload helper

**Files:**
- Create: `src/features/admin/lib/document-upload-client.ts`

**Interfaces:**
- Consumes: nothing from this codebase besides `ContentStatus` (`@/types`) —
  it only talks to the Task 2 Route Handler over `fetch`.
- Produces (for Tasks 7/8 to consume):
  `uploadDocumentFiles(kind: "legislative" | "documents" | "projects", status: ContentStatus, files: File[]): Promise<{ error: string | null; files: { path: string; sizeBytes: number; mime: string }[] }>`

- [ ] **Step 1: Write the helper**

Create `src/features/admin/lib/document-upload-client.ts`:

```ts
import type { ContentStatus } from "@/types";

export interface UploadedDocumentFile {
  path: string;
  sizeBytes: number;
  mime: string;
}
export interface UploadDocumentFilesResult {
  error: string | null;
  files: UploadedDocumentFile[];
}

/**
 * Calls POST /api/admin/uploads/document (security-hardening Plan 3). The
 * three document-editing forms call this first on Save, then pass the
 * returned path(s) to their Server Action — replacing the old pattern of
 * putting the File itself in the Server Action's FormData.
 */
export async function uploadDocumentFiles(
  kind: "legislative" | "documents" | "projects",
  status: ContentStatus,
  files: File[],
): Promise<UploadDocumentFilesResult> {
  const fd = new FormData();
  fd.append("kind", kind);
  fd.append("status", status);
  for (const file of files) fd.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/admin/uploads/document", { method: "POST", body: fd });
  } catch {
    return { error: "Upload failed. Try again.", files: [] };
  }

  let body: UploadDocumentFilesResult;
  try {
    body = await response.json();
  } catch {
    return { error: "Upload failed. Try again.", files: [] };
  }
  if (!response.ok) {
    return { error: body.error ?? "Upload failed. Try again.", files: [] };
  }
  return body;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/lib/document-upload-client.ts
git commit -m "feat: add client-side document upload helper"
```

---

### Task 4: `saveLegislative` signature change

**Files:**
- Modify: `src/features/admin/actions/legislative.ts:103-150` (the
  `saveLegislative` signature and the upload block at its top)

**Interfaces:**
- Consumes: nothing new — `removeStoredDocument` (unchanged, still imported
  from `./documents`).
- Produces (for Task 7 to consume): new signature
  `saveLegislative(id: string | null, values: LegislativeValues, upload: { path: string; sizeBytes: number } | null, removeExisting: boolean): Promise<SaveResult>`
  (was `saveLegislative(id, values, fileForm: FormData)`).

- [ ] **Step 1: Change the signature and the upload block**

In `src/features/admin/actions/legislative.ts`, remove the
`import { removeStoredDocument, uploadDocumentPdf } from "./documents";` line
and replace it with `import { removeStoredDocument } from "./documents";`.

Replace lines 103-150 (the function signature through the end of the
`incomingFile`/`uploadDocumentPdf` block):

```ts
export async function saveLegislative(
  id: string | null,
  values: LegislativeValues,
  upload: { path: string; sizeBytes: number } | null,
  removeExisting: boolean,
): Promise<SaveResult> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return { error: NOT_FOUND, id: null };
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };
  }
  const number = formatLegislativeNumber(
    parsed.data.docType,
    parsed.data.seqNo,
    parsed.data.year,
  );

  const admin = createSupabaseAdminClient();
  const base = slugify(`${number} ${parsed.data.title}`);
  if (!base) return { error: "Enter a number and title with letters or numbers.", id: null };

  let currentStatus: ContentStatus = "draft";
  if (id) {
    const { data: statusRow, error: statusErr } = await admin
      .from("legislative_documents")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (statusErr) return { error: "Could not save the document.", id: null };
    if (!statusRow) return { error: "Document not found.", id: null };
    currentStatus = statusRow.status as ContentStatus;
  }

  // The file was already uploaded by the Route Handler
  // (/api/admin/uploads/document) before this action was called — see
  // document-upload-client.ts. `upload.path` is client-supplied and this is a
  // public HTTP endpoint, so it's validated against the same allow-list
  // removeStoredDocument already uses before it's trusted.
  const removeFile = removeExisting;
  let uploadedPath: string | null = null;
  let uploadedSize: number | null = null;
  if (upload) {
    if (!/^legislative\//.test(upload.path) || upload.path.split("/").some((s) => s === "..")) {
      return { error: "Invalid file reference.", id: null };
    }
    uploadedPath = upload.path;
    uploadedSize = upload.sizeBytes;
  }
```

Everything below this point in `saveLegislative` (the `fail()` helper through
the end of the function) is unchanged — it already operates on
`uploadedPath`/`uploadedSize`/`removeFile`, none of which changed shape.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: errors in `legislative-form.tsx` only (still calling the old
3-argument signature) — that's Task 7. No errors inside `legislative.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/actions/legislative.ts
git commit -m "refactor: saveLegislative takes an already-uploaded file path"
```

---

### Task 5: `saveTransparencyDocument` / `saveTransparencyProject` signature change

**Files:**
- Modify: `src/features/admin/actions/transparency-documents.ts:59-117`
- Modify: `src/features/admin/actions/transparency-projects.ts:57-114`

**Interfaces:**
- Consumes: nothing new — `removeStoredDocument` (unchanged).
- Produces (for Task 8 to consume): both actions gain the same new third
  parameter shape, replacing `formData: FormData`:
  `files: { keptIds: string[]; uploaded: { path: string; mime: string; sizeBytes: number }[] }`.

- [ ] **Step 1: Change `saveTransparencyDocument`**

In `src/features/admin/actions/transparency-documents.ts`, remove
`uploadTransparencyFile` from the `./documents` import (keep
`removeStoredDocument`).

Replace lines 59-117 (signature through the end of the upload loop and its
post-upload cap check):

```ts
export async function saveTransparencyDocument(
  id: string | null,
  values: TransparencyDocumentValues,
  files: { keptIds: string[]; uploaded: { path: string; mime: string; sizeBytes: number }[] },
): Promise<SaveResult> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return { error: NOT_FOUND, id: null };
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();
  const { data: cat, error: catErr } = await admin
    .from("transparency_categories").select("id").eq("id", parsed.data.categoryId).maybeSingle();
  if (catErr) return { error: "Could not save the document. Try again.", id: null };
  if (!cat) return { error: "Pick a valid category.", id: null };

  let currentStatus: ContentStatus = "draft";
  if (id) {
    const { data: statusRow, error: statusErr } = await admin
      .from("transparency_documents")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (statusErr) return { error: "Could not save the document.", id: null };
    if (!statusRow) return { error: "Document not found.", id: null };
    currentStatus = statusRow.status as ContentStatus;
  }

  // Files were already uploaded by the Route Handler
  // (/api/admin/uploads/document) before this action was called — see
  // document-upload-client.ts. Every path is client-supplied and this is a
  // public HTTP endpoint, so each is validated against the same allow-list
  // removeStoredDocument already uses before it's trusted.
  const { keptIds, uploaded } = files;
  if (keptIds.length + uploaded.length > MAX_FILES_PER_RECORD) {
    return { error: `Up to ${MAX_FILES_PER_RECORD} files.`, id: null };
  }
  for (const u of uploaded) {
    if (!/^(documents|projects)\//.test(u.path) || u.path.split("/").some((s) => s === "..")) {
      return { error: "Invalid file reference.", id: null };
    }
  }

  async function cleanupUploads() {
    for (const u of uploaded) {
      const removed = await removeStoredDocument("transparency", currentStatus, u.path);
      if (removed.error) console.error(`Orphaned storage object (compensating delete failed): ${u.path}`);
    }
  }
```

Everything below this point (the `dateReleased` resolution through the end of
the function) is unchanged — it already reads `keptIds` and `uploaded` as
local names, which now come straight from the parameter instead of from a
per-file upload loop.

- [ ] **Step 2: Change `saveTransparencyProject` the same way**

In `src/features/admin/actions/transparency-projects.ts`, apply the identical
change: drop `uploadTransparencyFile` from the `./documents` import, replace
the signature and upload block (lines 57-114) with the same shape as Step 1
above, adjusted only for this file's own names:

```ts
export async function saveTransparencyProject(
  id: string | null,
  values: TransparencyProjectValues,
  files: { keptIds: string[]; uploaded: { path: string; mime: string; sizeBytes: number }[] },
): Promise<SaveResult> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return { error: NOT_FOUND, id: null };
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };
  }

  const admin = createSupabaseAdminClient();

  let currentStatus: ContentStatus = "draft";
  if (id) {
    const { data: statusRow, error: statusErr } = await admin
      .from("transparency_projects")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (statusErr) return { error: "Could not save the project.", id: null };
    if (!statusRow) return { error: "Project not found.", id: null };
    currentStatus = statusRow.status as ContentStatus;
  }

  // Files were already uploaded by the Route Handler
  // (/api/admin/uploads/document) before this action was called — see
  // document-upload-client.ts. Every path is client-supplied and this is a
  // public HTTP endpoint, so each is validated against the same allow-list
  // removeStoredDocument already uses before it's trusted.
  const { keptIds, uploaded } = files;
  if (keptIds.length + uploaded.length > MAX_FILES_PER_RECORD) {
    return { error: `Up to ${MAX_FILES_PER_RECORD} files.`, id: null };
  }
  for (const u of uploaded) {
    if (!/^(documents|projects)\//.test(u.path) || u.path.split("/").some((s) => s === "..")) {
      return { error: "Invalid file reference.", id: null };
    }
  }

  async function cleanupUploads() {
    for (const u of uploaded) {
      const removed = await removeStoredDocument("transparency", currentStatus, u.path);
      if (removed.error) console.error(`Orphaned storage object (compensating delete failed): ${u.path}`);
    }
  }
```

Everything below this point (the `date` resolution through the end of the
function) is unchanged.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: errors in `transparency-document-form.tsx` and
`transparency-project-form.tsx` only (Task 8). No errors inside either action
file.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/actions/transparency-documents.ts src/features/admin/actions/transparency-projects.ts
git commit -m "refactor: transparency doc/project saves take already-uploaded file paths"
```

---

### Task 6: Remove dead upload functions from `documents.ts`

**Files:**
- Modify: `src/features/admin/actions/documents.ts`

**Interfaces:**
- Consumes: none.
- Produces: none — this only deletes code Tasks 4/5 stopped calling.

- [ ] **Step 1: Confirm nothing else calls the two functions**

Run: `grep -rn "uploadDocumentPdf\|uploadTransparencyFile" src/`
Expected: zero matches (Tasks 4 and 5 already removed the only call sites).
If anything unexpected shows up, stop and investigate before deleting.

- [ ] **Step 2: Delete the dead exports**

In `src/features/admin/actions/documents.ts`, delete the
`uploadDocumentPdf` function (lines 49-87 in the pre-plan file) and the
`uploadTransparencyFile` function (lines 101-131 in the pre-plan file),
along with the now-unused `UploadDocumentResult`/`UploadFileResult`
interfaces they returned. Remove now-unused imports: `ALLOWED_DOC_FILE_TYPES`,
`ALLOWED_PDF_TYPES`, `MAX_DOC_FILE_BYTES`, `MAX_PDF_BYTES`, `bucketForStatus`,
`extForDocType` (all now used only inside the Route Handler / `uploadRulesFor`),
and `resolveMediaUrl` (only `uploadDocumentPdf` called it). `removeStoredDocument`
and its imports (`ContentStatus`, `NOT_FOUND`, `checkPermission`,
`createSupabaseAdminClient`) all stay — that function is unchanged.

The file's top doc comment (the "Deliberately NOT audited" block) stays too —
it still explains `removeStoredDocument`'s reasoning, which is unchanged.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors, no unused-import warnings.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/actions/documents.ts
git commit -m "chore: remove upload functions superseded by the document upload Route Handler"
```

---

### Task 7: Wire `legislative-form.tsx` to upload-then-save

**Files:**
- Modify: `src/features/admin/components/legislative-form.tsx:61-81`
  (`handleSave` only)

**Interfaces:**
- Consumes: `uploadDocumentFiles` (Task 3), `saveLegislative`'s new signature
  (Task 4).

- [ ] **Step 1: Add the import and rewrite `handleSave`**

Add to the imports:

```ts
import { uploadDocumentFiles } from "@/features/admin/lib/document-upload-client";
```

Replace `handleSave` (lines 61-81):

```ts
  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        let upload: { path: string; sizeBytes: number } | null = null;
        if (file) {
          const uploadResult = await uploadDocumentFiles("legislative", status, [file]);
          if (uploadResult.error || uploadResult.files.length === 0) {
            setError(uploadResult.error ?? "Upload failed. Try again.");
            return;
          }
          upload = { path: uploadResult.files[0].path, sizeBytes: uploadResult.files[0].sizeBytes };
        }
        const result = await saveLegislative(id, values, upload, removeFile);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.id) setId(result.id);
        draft.clear();
        onSaved("Document saved.");
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }
```

`status` is already in scope (component state, line 46) — it's the record's
current `ContentStatus`, `"draft"` for a new record, which is exactly what the
Route Handler needs to pick the right bucket.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors — this closes the type errors Task 4 left open.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`, sign in as an admin with `manage-transparency`, open
`/admin/transparency`, create a new ordinance with a PDF attached, save it.
Confirm: the network tab shows a `POST /api/admin/uploads/document` request
immediately before the `saveLegislative` Server Action call, the document
appears in the list, and the attached-PDF link opens the file. Then edit it,
remove the PDF, save — confirm the file link disappears. Then edit again,
replace the PDF, save — confirm the new file opens and the old object was
deleted (check via `.claude/skills/verify/SKILL.md`'s recipe or the Supabase
dashboard).

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/components/legislative-form.tsx
git commit -m "feat: legislative-form uploads via the Route Handler before saving"
```

---

### Task 8: Wire the transparency document/project forms to upload-then-save

**Files:**
- Modify: `src/features/admin/components/transparency-document-form.tsx:70-90`
  (`handleSave` only)
- Modify: `src/features/admin/components/transparency-project-form.tsx:54-74`
  (`handleSave` only)

**Interfaces:**
- Consumes: `uploadDocumentFiles` (Task 3), `saveTransparencyDocument`'s and
  `saveTransparencyProject`'s new signatures (Task 5).

- [ ] **Step 1: Wire `transparency-document-form.tsx`**

Add to the imports:

```ts
import { uploadDocumentFiles } from "@/features/admin/lib/document-upload-client";
```

Replace `handleSave` (lines 70-90):

```ts
  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        let uploaded: { path: string; mime: string; sizeBytes: number }[] = [];
        if (newFiles.length > 0) {
          const uploadResult = await uploadDocumentFiles("documents", status, newFiles);
          if (uploadResult.error) {
            setError(uploadResult.error);
            return;
          }
          uploaded = uploadResult.files;
        }
        const result = await saveTransparencyDocument(id, values, { keptIds, uploaded });
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.id) setId(result.id);
        draft.clear();
        onSaved("Document saved.");
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }
```

- [ ] **Step 2: Wire `transparency-project-form.tsx` the same way**

Add the same import. Replace `handleSave` (lines 54-74):

```ts
  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        let uploaded: { path: string; mime: string; sizeBytes: number }[] = [];
        if (newFiles.length > 0) {
          const uploadResult = await uploadDocumentFiles("projects", status, newFiles);
          if (uploadResult.error) {
            setError(uploadResult.error);
            return;
          }
          uploaded = uploadResult.files;
        }
        const result = await saveTransparencyProject(id, values, { keptIds, uploaded });
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.id) setId(result.id);
        draft.clear();
        onSaved("Project saved.");
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors — this closes the type errors Task 5 left open.

- [ ] **Step 4: Manual smoke test, including the optimistic-lock race**

Run `npm run dev`. For both the transparency document and project drawers:
add up to 3 files (mix of a PDF and images), save, confirm all 3 appear and
open correctly; remove one, add a new one, save, confirm the removed file's
object is gone and the new one is reachable.

Then specifically re-verify the optimistic-lock-on-`file_path` behavior named
in `CLAUDE.md`'s transparency-enhancements bullet, since this plan is exactly
the kind of change that bullet warns is "most likely to interact badly with a
two-call sequence": open the same transparency document in two browser tabs,
attach a *different* file to each, save the first tab (succeeds), then save
the second tab. Confirm the second save fails with "Someone else changed this
document's file. Reopen it and try again." rather than silently overwriting
the first tab's upload or leaving an orphaned object.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/components/transparency-document-form.tsx src/features/admin/components/transparency-project-form.tsx
git commit -m "feat: transparency document/project forms upload via the Route Handler before saving"
```

---

### Task 9: Right-size `next.config.ts`'s `bodySizeLimit`

**Files:**
- Modify: `next.config.ts:60-76`

**Interfaces:** none — config-only change.

- [ ] **Step 1: Change the limit and its comment**

Replace the `experimental.serverActions` block:

```ts
  experimental: {
    serverActions: {
      // Legislative/transparency PDFs no longer flow through a Server Action
      // body at all as of security-hardening Plan 3 — they go through
      // POST /api/admin/uploads/document instead, which has its own
      // Supabase-Storage-enforced ceiling (MAX_PDF_BYTES / MAX_DOC_FILE_BYTES
      // in src/lib/storage.ts) unrelated to this setting.
      //
      // This can't drop to Next's 1MB default, though: uploadSingleImage
      // (src/lib/media.ts, MAX_IMAGE_BYTES = 2MB) still runs *inside*
      // saveOfficial/saveEvent/saveAnnouncement/site-content Server Actions,
      // and both saveNewsArticle and uploadAchievementPhotos accept up to
      // MAX_PHOTOS = 3 images in a single Server Action call — up to 6MB.
      // 8mb gives that ~2MB of multipart/form-data framing headroom, the
      // same proportion the old 12mb gave a single 10MB PDF.
      bodySizeLimit: "8mb",
    },
  },
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "fix: right-size the Server Action body-size limit for images, not a 10MB PDF"
```

---

### Task 10: Re-verify the `proxy.ts` matcher exclusion (no code change expected)

**Files:**
- Read only: `src/proxy.ts:144-162`

**Interfaces:** none.

- [ ] **Step 1: Re-check the exclusion's stated reason against the new numbers**

The design spec (§6) flags this matcher exclusion (Server Action POSTs under
`/admin` skip Proxy entirely) as worth re-evaluating once PDFs no longer flow
through a Server Action body, since the exclusion's own comment cites large
PDF uploads as its reason for existing.

Read `src/proxy.ts:144-162` and confirm: the exclusion is not PDF-specific —
it's a blanket exclusion for every Server Action POST under `/admin`, and
after Task 9 those POSTs can still carry up to ~6MB of image data (news/
achievement photos), which is still subject to the same
`proxyClientMaxBodySize` (10MB default) buffering-before-truncation risk the
comment describes if a matched route ever saw that body. The risk this
exclusion prevents is not eliminated by this plan, only made less likely to
ever bite (6-8MB vs. a 10MB PDF). Confirm no other part of this plan changed
which requests carry a `Next-Action` header.

- [ ] **Step 2: Record the conclusion**

No code change. Add one sentence to this plan's CLAUDE.md entry (Task 11)
stating the matcher exclusion was re-checked and kept, and why — so a future
reader doesn't have to re-derive this.

---

### Task 11: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the security-hardening bullet**

Append to the security-hardening pass bullet in CLAUDE.md's Architecture
section (after the existing "Every error banner is now dismissible" text),
documenting: the new `POST /api/admin/uploads/document` Route Handler and what
it replaced; the `saveLegislative`/`saveTransparencyDocument`/
`saveTransparencyProject` signature changes; that `documents.ts`'s
`uploadDocumentPdf`/`uploadTransparencyFile` were deleted; that
`bodySizeLimit` was right-sized to `"8mb"` rather than deleted, and why
(images/news-photos/achievement-photos still flow through Server Actions, up
to ~6MB); and that the `proxy.ts` matcher exclusion was re-checked and kept
(Task 10's conclusion). Also update the Project section's "Remaining work"
line to drop "security-hardening Plan 3" now that all three plans are shipped.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the document-upload Route Handler in CLAUDE.md"
```

---

## Final verification

- [ ] `npm run typecheck`, `npm run lint`, `npm run test:unit`, and
      `npm run build` all pass clean.
- [ ] `npm run test:e2e:public` passes (regression check — this plan didn't
      touch any public route, but the global config change in Task 9 touches
      every Server Action including the 8 public ones).
- [ ] Manual regression check outside the transparency module, since Task 9's
      number affects every Server Action: upload a >1MB officials portrait
      (single image, `saveOfficial`) and save a news article with 3 photos
      attached (`saveNewsArticle`) — both must still succeed. This is the
      exact regression this plan exists to prevent; do not skip it.
