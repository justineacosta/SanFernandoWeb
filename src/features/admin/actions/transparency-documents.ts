"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, TransparencyDocumentValues } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTransparencyDocumentForEdit } from "@/features/admin/queries/transparency";
import { removeStoredDocument } from "./documents";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

const schema = z.object({
  title: z.string().trim().min(3, "Enter a title."),
  categoryId: z.string().trim().min(1, "Pick a category."),
  dateReleased: z.string().trim().min(1, "Pick the date released."),
  filePath: z.string().nullable(),
  fileSizeBytes: z.number().nullable(),
});

// Server Actions are public HTTP endpoints — `ContentStatus` only constrains
// callers that go through TypeScript. A direct POST can send any string, so
// validate at runtime before it reaches the update patch.
const statusSchema = z.enum(["draft", "in-review", "published", "archived"]);

// Unlike legislative documents, transparency documents have no slug page —
// there is nothing to revalidate beyond the admin list and the disclosure
// page itself. `/transparency` is a static route, so this revalidatePath
// call is the only mechanism keeping it fresh after an edit.
function revalidate() {
  revalidatePath("/admin/transparency");
  revalidatePath("/transparency");
}

/**
 * Client-callable counterpart to `getTransparencyDocumentForEdit` (which is
 * `server-only` and cannot be imported into the "use client" manager). The
 * manager fetches full detail — including the file — only when a drawer opens.
 */
export async function getTransparencyDocumentForEditAction(id: string) {
  await requirePermission("manage-transparency");
  return getTransparencyDocumentForEdit(id);
}

export async function saveTransparencyDocument(
  id: string | null,
  values: TransparencyDocumentValues,
): Promise<SaveResult> {
  const actor = await requirePermission("manage-transparency");
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };
  }

  const admin = createSupabaseAdminClient();

  // Category must exist — never trust categoryId from the client.
  const { data: cat, error: catErr } = await admin
    .from("transparency_categories")
    .select("id")
    .eq("id", parsed.data.categoryId)
    .maybeSingle();
  if (catErr) return { error: "Could not save the document. Try again.", id: null };
  if (!cat) return { error: "Pick a valid category.", id: null };

  if (id) {
    const { data: existing, error: readErr } = await admin
      .from("transparency_documents")
      .select("file_path")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { error: "Could not save the document.", id: null };
    if (!existing) return { error: "Document not found.", id: null };

    const { error } = await admin
      .from("transparency_documents")
      .update({
        title: parsed.data.title,
        category_id: parsed.data.categoryId,
        date_released: parsed.data.dateReleased,
        file_path: parsed.data.filePath,
        file_size_bytes: parsed.data.fileSizeBytes,
      })
      .eq("id", id);
    if (error) return { error: "Could not save the document.", id: null };

    // Deferred delete: only once the row no longer references the old file.
    const oldPath = existing.file_path as string | null;
    if (oldPath && oldPath !== parsed.data.filePath) {
      await removeStoredDocument(oldPath);
    }

    await recordActivity(actor, "updated document", "transparency document", id, parsed.data.title);
    revalidate();
    return { error: null, id };
  }

  const { data, error } = await admin
    .from("transparency_documents")
    .insert({
      title: parsed.data.title,
      category_id: parsed.data.categoryId,
      date_released: parsed.data.dateReleased,
      file_path: parsed.data.filePath,
      file_size_bytes: parsed.data.fileSizeBytes,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the document.", id: null };

  await recordActivity(
    actor,
    "created document",
    "transparency document",
    data.id,
    parsed.data.title,
  );
  revalidate();
  return { error: null, id: data.id };
}

/**
 * Move a document through draft → in-review → published → archived.
 * `published_at` is set once, on the first transition into published
 * (matching the legislative-documents precedent); archiving is the normal
 * path for a superseded budget or report.
 */
export async function setTransparencyDocumentStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const actor = await requirePermission("manage-transparency");

  const statusResult = statusSchema.safeParse(status);
  if (!statusResult.success) {
    return { error: statusResult.error.issues[0]?.message ?? "Invalid status." };
  }
  const nextStatus = statusResult.data;

  const admin = createSupabaseAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("transparency_documents")
    .select("title, published_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Document not found." };

  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("transparency_documents").update(patch).eq("id", id);
  if (error) return { error: "Could not update the document." };

  await recordActivity(
    actor,
    `${nextStatus} document`,
    "transparency document",
    id,
    existing.title as string,
  );
  revalidate();
  return { error: null };
}

/**
 * Hard delete — for mistakes only. Archiving is the normal path: a
 * superseded budget or report remains part of the public record.
 */
export async function deleteTransparencyDocument(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-transparency");
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("transparency_documents")
    .select("title, file_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("transparency_documents").delete().eq("id", id);
  if (error) return { error: "Could not delete the document." };

  if (existing?.file_path) await removeStoredDocument(existing.file_path as string);
  await recordActivity(
    actor,
    "deleted document",
    "transparency document",
    id,
    (existing?.title as string) ?? "",
  );
  revalidate();
  return { error: null };
}
