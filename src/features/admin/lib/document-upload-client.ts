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
 *
 * `id` is the record being edited, or null for a new one. It is sent *instead
 * of* a status: the route reads the record's real status itself to pick the
 * destination bucket, because a client-supplied status can be stale and would
 * put the object in the wrong half of the public/private bucket pair.
 */
export async function uploadDocumentFiles(
  kind: "legislative" | "documents" | "projects",
  id: string | null,
  files: File[],
): Promise<UploadDocumentFilesResult> {
  const fd = new FormData();
  fd.append("kind", kind);
  if (id) fd.append("id", id);
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
