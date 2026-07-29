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
