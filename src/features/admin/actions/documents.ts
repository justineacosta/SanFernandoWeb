"use server";

import type { ContentStatus } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bucketForStatus } from "@/lib/storage";

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

/** Delete an owned storage object. A remote URL is left alone. */
export async function removeStoredDocument(
  kind: "legislative" | "transparency",
  status: ContentStatus,
  path: string,
): Promise<ActionResult> {
  if (!(await checkPermission("manage-transparency"))) return { error: NOT_FOUND };
  if (/^https?:\/\//i.test(path)) return { error: null };
  if (!/^(legislative|documents|projects)\//.test(path)) {
    return { error: "That file cannot be removed." };
  }
  if (path.split("/").some((segment) => segment === "..")) {
    return { error: "That file cannot be removed." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucketForStatus(kind, status)).remove([path]);
  if (error) return { error: "Could not remove the file." };
  return { error: null };
}

/**
 * Best-effort compensating delete for the two-call document upload flow
 * (security-hardening Plan 3): called only when a document form's save
 * Server Action call itself throws — a dropped connection or a navigation
 * away — after `POST /api/admin/uploads/document` already succeeded. A
 * save that returns normally with an error already cleans up its own
 * upload via `fail()`/`cleanupUploads()`; this covers the case where the
 * save call never resolves at all.
 *
 * A thrown client-side call does not prove the save never committed — the
 * request can reach the server and the row write can succeed while the
 * response is lost on the way back. Deleting a file a row now legitimately
 * points to would be worse than the orphan this exists to prevent, so this
 * re-checks whether the path is referenced before deleting anything. Paths
 * are `crypto.randomUUID()`-based (see the upload route), so an exact match
 * is a reliable check, not a heuristic. A failed lookup also skips the
 * delete — fail toward leaving an orphan for `report-orphaned-media.mjs`,
 * never toward deleting something still in use.
 */
export async function cleanupOrphanedUpload(
  kind: "legislative" | "transparency",
  status: ContentStatus,
  path: string,
): Promise<ActionResult> {
  if (!(await checkPermission("manage-transparency"))) return { error: NOT_FOUND };
  if (/^https?:\/\//i.test(path)) return { error: null };
  if (!/^(legislative|documents|projects)\//.test(path)) return { error: null };
  if (path.split("/").some((segment) => segment === "..")) return { error: null };

  const admin = createSupabaseAdminClient();
  const referenced =
    kind === "legislative"
      ? await admin.from("legislative_documents").select("id").eq("file_path", path).maybeSingle()
      : await admin.from("transparency_files").select("id").eq("path", path).maybeSingle();
  if (referenced.error || referenced.data) return { error: null };

  const { error } = await admin.storage.from(bucketForStatus(kind, status)).remove([path]);
  if (error) return { error: "Could not remove the file." };
  return { error: null };
}
