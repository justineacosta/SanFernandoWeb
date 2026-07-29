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
