"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, TransparencyDocumentValues } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTransparencyDocumentForEdit } from "@/features/admin/queries/transparency";
import { MAX_FILES_PER_RECORD } from "@/lib/storage";
import { removeStoredDocument, uploadTransparencyFile } from "./documents";

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
  dateReleased: z.string().trim().nullable(),
});

/** "" (empty date input) → SQL NULL; a real date passes through. */
function normalizeDate(value: string | null): string | null {
  return value && value.length > 0 ? value : null;
}

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
  revalidatePath("/transparency/uploads");
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
  formData: FormData,
): Promise<SaveResult> {
  const actor = await requirePermission("manage-transparency");
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();
  const { data: cat, error: catErr } = await admin
    .from("transparency_categories").select("id").eq("id", parsed.data.categoryId).maybeSingle();
  if (catErr) return { error: "Could not save the document. Try again.", id: null };
  if (!cat) return { error: "Pick a valid category.", id: null };

  const newFiles = formData.getAll("newFile").filter((f): f is File => f instanceof File && f.size > 0);
  const keptIds = formData.getAll("keptFileId").map(String);

  // Upload every new file first; track them so any later failure deletes them.
  const uploaded: { path: string; mime: string; sizeBytes: number }[] = [];
  async function cleanupUploads() {
    for (const u of uploaded) {
      const removed = await removeStoredDocument(u.path);
      if (removed.error) console.error(`Orphaned storage object (compensating delete failed): ${u.path}`);
    }
  }
  for (const file of newFiles) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadTransparencyFile("documents", fd);
    if (res.error || res.path === null || res.mime === null || res.sizeBytes === null) {
      await cleanupUploads();
      return { error: res.error ?? "Upload failed. Try again.", id: null };
    }
    uploaded.push({ path: res.path, mime: res.mime, sizeBytes: res.sizeBytes });
  }

  // Enforce the ≤3 cap BEFORE any parent write, so an over-limit direct API
  // call can't leave an empty draft row behind. keptIds is client-supplied.
  if (keptIds.length + uploaded.length > MAX_FILES_PER_RECORD) {
    await cleanupUploads();
    return { error: `Up to ${MAX_FILES_PER_RECORD} files.`, id: null };
  }

  const dateReleased = normalizeDate(parsed.data.dateReleased);

  // Resolve the parent row id (insert if new).
  let docId = id;
  if (docId) {
    const { error } = await admin.from("transparency_documents")
      .update({ title: parsed.data.title, category_id: parsed.data.categoryId, date_released: dateReleased })
      .eq("id", docId);
    if (error) { await cleanupUploads(); return { error: "Could not save the document.", id: null }; }
  } else {
    const { data, error } = await admin.from("transparency_documents")
      .insert({ title: parsed.data.title, category_id: parsed.data.categoryId, date_released: dateReleased })
      .select("id").single();
    if (error || !data) { await cleanupUploads(); return { error: "Could not create the document.", id: null }; }
    docId = data.id as string;
  }

  // Existing files: delete the ones the user dropped (rows + objects), keep the rest.
  const { data: existingFiles } = await admin.from("transparency_files")
    .select("id, path, sort_order").eq("owner_type", "document").eq("owner_id", docId)
    .order("sort_order", { ascending: true });
  const removedRows = ((existingFiles ?? []) as { id: string; path: string }[]).filter((f) => !keptIds.includes(f.id));
  if (removedRows.length > 0) {
    await admin.from("transparency_files").delete().in("id", removedRows.map((r) => r.id));
    for (const r of removedRows) await removeStoredDocument(r.path); // deferred: row already gone
  }

  // Insert the newly uploaded files after the kept ones.
  const keptCount = ((existingFiles ?? []) as { id: string }[]).filter((f) => keptIds.includes(f.id)).length;
  if (uploaded.length > 0) {
    const insert = uploaded.map((u, i) => ({
      owner_type: "document", owner_id: docId, path: u.path, mime: u.mime,
      size_bytes: u.sizeBytes, sort_order: keptCount + i,
    }));
    const { error } = await admin.from("transparency_files").insert(insert);
    if (error) { await cleanupUploads(); return { error: "Could not save the document's files.", id: null }; }
  }

  await recordActivity(actor, id ? "updated document" : "created document", "transparency document", docId, parsed.data.title);
  revalidate();
  return { error: null, id: docId };
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
    .select("title")
    .eq("id", id)
    .maybeSingle();

  // Collect the document's file objects before the parent row goes away.
  const { data: fileRows } = await admin
    .from("transparency_files")
    .select("id, path")
    .eq("owner_type", "document")
    .eq("owner_id", id);

  const { error } = await admin.from("transparency_documents").delete().eq("id", id);
  if (error) return { error: "Could not delete the document." };

  // Deferred delete: rows first (cascades with the parent), then the objects.
  const files = (fileRows ?? []) as { id: string; path: string }[];
  if (files.length > 0) {
    await admin.from("transparency_files").delete().in("id", files.map((f) => f.id));
    for (const f of files) await removeStoredDocument(f.path);
  }
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
