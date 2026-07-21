"use server";

import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_DOC_FILE_TYPES,
  ALLOWED_PDF_TYPES,
  MAX_DOC_FILE_BYTES,
  MAX_PDF_BYTES,
  PUBLIC_DOCUMENTS_BUCKET,
  documentUrl,
  extForDocType,
} from "@/lib/storage";

/**
 * Deliberately NOT audited, unlike the image helpers in media.ts.
 *
 * Every function here is an internal step of a larger save action
 * (saveLegislative, saveTransparencyDocument, saveTransparencyProject) which
 * records its own create/update entry. Worse, `removeStoredDocument` is also
 * the compensating-delete path: it runs when a save FAILS, so a file_delete
 * entry from here would claim a deletion for an operation the user never
 * completed. Per-file entries would be both duplicative and, in the failure
 * case, wrong.
 *
 * media.ts is audited because its upload/remove are called directly by the
 * uploader widget, not as a step inside another audited action.
 */

export interface ActionResult {
  error: string | null;
}
export interface UploadDocumentResult {
  error: string | null;
  /** Raw storage path to persist in file_path. */
  path: string | null;
  /** Resolved public URL, for immediate preview. */
  url: string | null;
  sizeBytes: number | null;
}

/**
 * Upload one PDF for a legislative record or transparency document.
 * Persisting the returned `path` and `sizeBytes` is the caller's job — this
 * keeps the action reusable across both tables without a discriminator,
 * mirroring uploadSingleImage in media.ts.
 */
export async function uploadDocumentPdf(
  folder: "legislative" | "documents",
  formData: FormData,
): Promise<UploadDocumentResult> {
  if (!(await checkPermission("manage-transparency"))) {
    return { error: NOT_FOUND, path: null, url: null, sizeBytes: null };
  }

  // Validate folder at runtime; TypeScript unions erase at runtime and Server Actions
  // are public HTTP endpoints, so a direct caller could pass any string.
  if (!["legislative", "documents"].includes(folder)) {
    return { error: "Upload failed. Try again.", path: null, url: null, sizeBytes: null };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF.", path: null, url: null, sizeBytes: null };
  }
  if (!ALLOWED_PDF_TYPES.includes(file.type as (typeof ALLOWED_PDF_TYPES)[number])) {
    return { error: "The document must be a PDF.", path: null, url: null, sizeBytes: null };
  }
  if (file.size > MAX_PDF_BYTES) {
    return { error: "The PDF must be 10 MB or smaller.", path: null, url: null, sizeBytes: null };
  }

  const path = `${folder}/${crypto.randomUUID()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(PUBLIC_DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (error) return { error: "Upload failed. Try again.", path: null, url: null, sizeBytes: null };

  return { error: null, path, url: documentUrl(path), sizeBytes: file.size };
}

export interface UploadFileResult {
  error: string | null;
  path: string | null;
  sizeBytes: number | null;
  mime: string | null;
}

/**
 * Upload one PDF-or-image for a transparency document or project. The caller
 * persists the returned path/mime/size; on any later failure the caller must
 * delete the object (compensating delete), keeping the storage/DB invariant.
 */
export async function uploadTransparencyFile(
  folder: "documents" | "projects",
  formData: FormData,
): Promise<UploadFileResult> {
  if (!(await checkPermission("manage-transparency"))) {
    return { error: NOT_FOUND, path: null, sizeBytes: null, mime: null };
  }
  if (!["documents", "projects"].includes(folder)) {
    return { error: "Upload failed. Try again.", path: null, sizeBytes: null, mime: null };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file.", path: null, sizeBytes: null, mime: null };
  }
  if (!ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number])) {
    return { error: "Files must be a PDF or image.", path: null, sizeBytes: null, mime: null };
  }
  if (file.size > MAX_DOC_FILE_BYTES) {
    return { error: "Each file must be 10 MB or smaller.", path: null, sizeBytes: null, mime: null };
  }
  const path = `${folder}/${crypto.randomUUID()}.${extForDocType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(PUBLIC_DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", path: null, sizeBytes: null, mime: null };
  return { error: null, path, sizeBytes: file.size, mime: file.type };
}

/** Delete an owned storage object. A remote URL is left alone. */
export async function removeStoredDocument(path: string): Promise<ActionResult> {
  if (!(await checkPermission("manage-transparency"))) return { error: NOT_FOUND };
  // Pass through remote URLs as no-op (seeded content, nothing to remove locally).
  if (/^https?:\/\//i.test(path)) return { error: null };
  // Require path to start with a valid folder prefix.
  if (!/^(legislative|documents|projects)\//.test(path)) {
    return { error: "That file cannot be removed." };
  }
  // Reject paths containing .. segments to prevent directory traversal. Check both
  // the literal substring .. with path delimiters (covering /../ and /.. at end) and
  // at the start. This prevents legislative/../../../etc/passwd while allowing
  // legitimate filenames like report..final.pdf (dots within a filename segment).
  if (path.split("/").some((segment) => segment === "..")) {
    return { error: "That file cannot be removed." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(PUBLIC_DOCUMENTS_BUCKET).remove([path]);
  if (error) return { error: "Could not remove the file." };
  return { error: null };
}
