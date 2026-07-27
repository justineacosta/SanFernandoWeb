"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, TransparencyProjectValues } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { guardDelete, statusPatch } from "@/lib/archive";
import { auditTypeForStatus, recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTransparencyProjectForEdit } from "@/features/admin/queries/transparency";
import { MAX_FILES_PER_RECORD } from "@/lib/storage";
import { cleanupPromotedMedia, demoteMedia, promoteMedia } from "@/lib/media-lifecycle";
import { removeStoredDocument, uploadTransparencyFile } from "./documents";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

const schema = z.object({
  name: z.string().trim().min(3, "Enter a project name."),
  progress: z.number().int().min(0, "Progress must be 0–100.").max(100, "Progress must be 0–100."),
  date: z.string().trim().nullable(),
});

/** "" (empty date input) → SQL NULL; a real date passes through. */
function normalizeDate(value: string | null): string | null {
  return value && value.length > 0 ? value : null;
}

// Server Actions are public HTTP endpoints — `ContentStatus` only constrains
// callers that go through TypeScript. A direct POST can send any string, so
// validate at runtime before it reaches the update patch.
const statusSchema = z.enum(["draft", "in-review", "published", "archived"]);

// `/transparency` is a static route, so this revalidatePath call is the only
// mechanism keeping the public monitored-projects list fresh after an edit.
function revalidate() {
  revalidatePath("/admin/transparency");
  revalidatePath("/transparency");
  revalidatePath("/transparency/uploads");
}

/**
 * Client-callable counterpart to `getTransparencyProjectForEdit` (which is
 * `server-only` and cannot be imported into the "use client" panel). The
 * panel fetches full detail — including files — only when a drawer opens.
 */
export async function getTransparencyProjectForEditAction(id: string) {
  if (!(await checkPermission("manage-transparency"))) return null;
  return getTransparencyProjectForEdit(id);
}

export async function saveTransparencyProject(
  id: string | null,
  values: TransparencyProjectValues,
  formData: FormData,
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

  const newFiles = formData.getAll("newFile").filter((f): f is File => f instanceof File && f.size > 0);
  const keptIds = formData.getAll("keptFileId").map(String);

  if (keptIds.length + newFiles.length > MAX_FILES_PER_RECORD) {
    return { error: `Up to ${MAX_FILES_PER_RECORD} files.`, id: null };
  }

  const uploaded: { path: string; mime: string; sizeBytes: number }[] = [];
  async function cleanupUploads() {
    for (const u of uploaded) {
      const removed = await removeStoredDocument("transparency", currentStatus, u.path);
      if (removed.error) console.error(`Orphaned storage object (compensating delete failed): ${u.path}`);
    }
  }
  for (const file of newFiles) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadTransparencyFile("projects", currentStatus, fd);
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

  const date = normalizeDate(parsed.data.date);

  // Resolve the parent row id (insert if new).
  let projectId = id;
  if (projectId) {
    const { error } = await admin
      .from("transparency_projects")
      .update({ name: parsed.data.name, progress: parsed.data.progress, date })
      .eq("id", projectId);
    if (error) { await cleanupUploads(); return { error: "Could not save the project.", id: null }; }
  } else {
    // New rows join at the end of the display list, mirroring createNewsCategory.
    const { data: rows, error: readError } = await admin
      .from("transparency_projects")
      .select("sort_order");
    if (readError) { await cleanupUploads(); return { error: "Could not create the project. Try again.", id: null }; }
    const nextSortOrder =
      (rows ?? []).reduce((max, row) => Math.max(max, row.sort_order ?? 0), 0) + 1;

    const { data, error } = await admin
      .from("transparency_projects")
      .insert({ name: parsed.data.name, progress: parsed.data.progress, date, sort_order: nextSortOrder })
      .select("id")
      .single();
    if (error || !data) { await cleanupUploads(); return { error: "Could not create the project.", id: null }; }
    projectId = data.id as string;
  }

  // Existing files: delete the ones the user dropped (rows + objects), keep the rest.
  const { data: existingFiles } = await admin.from("transparency_files")
    .select("id, path, sort_order").eq("owner_type", "project").eq("owner_id", projectId)
    .order("sort_order", { ascending: true });
  const removedRows = ((existingFiles ?? []) as { id: string; path: string }[]).filter((f) => !keptIds.includes(f.id));
  if (removedRows.length > 0) {
    await admin.from("transparency_files").delete().in("id", removedRows.map((r) => r.id));
    for (const r of removedRows) await removeStoredDocument("transparency", currentStatus, r.path); // deferred: row already gone
  }

  // Insert the newly uploaded files after the kept ones.
  const keptCount = ((existingFiles ?? []) as { id: string }[]).filter((f) => keptIds.includes(f.id)).length;
  if (uploaded.length > 0) {
    const insert = uploaded.map((u, i) => ({
      owner_type: "project", owner_id: projectId, path: u.path, mime: u.mime,
      size_bytes: u.sizeBytes, sort_order: keptCount + i,
    }));
    const { error } = await admin.from("transparency_files").insert(insert);
    if (error) { await cleanupUploads(); return { error: "Could not save the project's files.", id: null }; }
  }

  await recordActivity(actor, {
    type: id ? "update" : "create",
    action: id ? "updated project" : "created project",
    entityType: "transparency project",
    entityId: projectId,
    entityLabel: parsed.data.name,
  });
  revalidate();
  return { error: null, id: projectId };
}

/**
 * Move a project through draft → in-review → published → archived.
 * `published_at` is set once, on the first transition into published.
 */
export async function setTransparencyProjectStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return { error: NOT_FOUND };

  const statusResult = statusSchema.safeParse(status);
  if (!statusResult.success) {
    return { error: statusResult.error.issues[0]?.message ?? "Invalid status." };
  }
  const nextStatus = statusResult.data;

  const admin = createSupabaseAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("transparency_projects")
    .select("name, status, published_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Project not found." };

  const previousStatus = existing.status as ContentStatus;

  const { data: fileRows, error: fileRowsErr } = await admin
    .from("transparency_files")
    .select("path")
    .eq("owner_type", "project")
    .eq("owner_id", id);
  if (fileRowsErr) return { error: "Could not read the project's files. Try again." };
  const paths = (fileRows ?? []).map((f) => f.path as string);

  const promotingNow = nextStatus === "published" && previousStatus !== "published";
  if (promotingNow && paths.length > 0) {
    const promoted = await promoteMedia("transparency", paths);
    if (promoted.error) return { error: "Could not publish the project's files. Try again." };
  }

  const patch = statusPatch(actor, nextStatus);
  if (nextStatus === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("transparency_projects").update(patch).eq("id", id);
  if (error) return { error: "Could not update the project." };

  if (promotingNow && paths.length > 0) {
    await cleanupPromotedMedia("transparency", paths, "transparency project published");
  }
  if (previousStatus === "published" && nextStatus !== "published" && paths.length > 0) {
    await demoteMedia("transparency", paths, "transparency project left published status");
  }

  await recordActivity(actor, {
    type: auditTypeForStatus(nextStatus),
    action: `${nextStatus} project`,
    entityType: "transparency project",
    entityId: id,
    entityLabel: existing.name as string,
  });
  revalidate();
  return { error: null };
}

/**
 * Hard delete — SuperAdmin only, and only from `archived` (umbrella §3.2).
 * Archiving is the normal path for a finished project.
 */
export async function deleteTransparencyProject(id: string): Promise<ActionResult> {
  const guard = await guardDelete<{ name: string }>("transparency_projects", id, "name");
  if (!guard.ok) return { error: guard.error };
  const { actor, row: existing } = guard;
  const admin = createSupabaseAdminClient();

  // Collect the project's file objects before the parent row goes away.
  const { data: fileRows } = await admin
    .from("transparency_files")
    .select("id, path")
    .eq("owner_type", "project")
    .eq("owner_id", id);

  const { error } = await admin.from("transparency_projects").delete().eq("id", id);
  if (error) return { error: "Could not delete the project." };

  // Deferred delete: rows first (cascades with the parent), then the objects.
  const files = (fileRows ?? []) as { id: string; path: string }[];
  if (files.length > 0) {
    await admin.from("transparency_files").delete().in("id", files.map((f) => f.id));
    for (const f of files) await removeStoredDocument("transparency", "archived", f.path);
  }

  await recordActivity(actor, {
    type: "delete",
    action: "deleted project",
    entityType: "transparency project",
    entityId: id,
    entityLabel: existing.name,
  });
  revalidate();
  return { error: null };
}

/** Bring an archived project back as a draft — not straight back onto the public list. */
export async function restoreTransparencyProject(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_projects")
    .update(statusPatch(actor, "draft"))
    .eq("id", id)
    .eq("status", "archived")
    .select("name")
    .maybeSingle();
  if (error) return { error: "Could not restore the project." };
  if (!data) return { error: "That project is not archived. Refresh to see the current state." };

  await recordActivity(actor, {
    type: "restore",
    action: "restored project",
    entityType: "transparency project",
    entityId: id,
    entityLabel: data.name as string,
  });
  revalidate();
  return { error: null };
}

/**
 * Swap a project's sort_order with its neighbour in the given direction. A
 * no-op at either end of the list is not an error.
 *
 * The two updates below are deliberately not wrapped in a transaction: this
 * is a short, hand-curated list edited by one admin at a time, and the worst
 * case of an interleaved swap is a duplicated sort_order, which
 * `order by sort_order` still renders deterministically enough to fix with
 * another click. That tradeoff was weighed and accepted rather than adding
 * an RPC for it. (Direct copy of moveNewsCategory in
 * src/features/admin/actions/news-categories.ts, table name changed.)
 */
export async function moveTransparencyProject(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data: rows, error: readError } = await admin
    .from("transparency_projects")
    .select("id, sort_order")
    .order("sort_order", { ascending: true });
  if (readError || !rows) return { error: "Could not reorder projects." };

  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return { error: "Project not found." };

  const neighbourIndex = direction === "up" ? index - 1 : index + 1;
  if (neighbourIndex < 0 || neighbourIndex >= rows.length) {
    return { error: null };
  }

  const current = rows[index];
  const neighbour = rows[neighbourIndex];

  const { error: firstError } = await admin
    .from("transparency_projects")
    .update({ sort_order: neighbour.sort_order })
    .eq("id", current.id);
  if (firstError) return { error: "Could not reorder projects." };

  const { error: secondError } = await admin
    .from("transparency_projects")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbour.id);
  if (secondError) return { error: "Could not reorder projects." };

  await recordActivity(actor, {
    type: "reorder",
    action: "reordered projects",
    entityType: "transparency project",
    entityId: id,
  });
  revalidate();
  return { error: null };
}
