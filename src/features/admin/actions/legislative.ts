"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, LegislativeValues } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { guardDelete, statusPatch } from "@/lib/archive";
import { auditTypeForStatus, recordActivity } from "@/lib/audit";
import { cleanupPromotedMedia, demoteMedia, promoteMedia } from "@/lib/media-lifecycle";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MAX_SEQ_NO, formatLegislativeNumber } from "@/lib/legislative-number";
import { getLegislativeForEdit } from "@/features/admin/queries/transparency";
import { removeStoredDocument, uploadDocumentPdf } from "./documents";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

const schema = z.object({
  docType: z.enum(["ordinance", "resolution"]),
  // Mirrors the check constraints in migration 0024 exactly. The upper bound
  // is load-bearing: legislativeSortKey multiplies the year by MAX_SEQ_NO + 1,
  // so a wider sequence would sort into the neighbouring year.
  seqNo: z
    .number()
    .int()
    .min(1, "Enter a document number of 1 or more.")
    .max(MAX_SEQ_NO, `Document number cannot exceed ${MAX_SEQ_NO}.`),
  year: z
    .number()
    .int()
    .min(1900, "Enter a four-digit year.")
    .max(2200, "Enter a four-digit year."),
  title: z.string().trim().min(3, "Enter a title."),
  // Date approved is optional — a document can exist (and be uploaded) before
  // it's approved. An empty string means "not yet approved"; it is converted
  // to SQL NULL below rather than stored as "", which would give "pending"
  // two different representations and break the display logic.
  dateApproved: z.string().nullable(),
  summary: z.string(),
  filePath: z.string().nullable(),
  fileSizeBytes: z.number().nullable(),
});

/** Empty string (or null) from the form means "not yet approved" → SQL NULL. */
function normalizeDateApproved(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

// Server Actions are public HTTP endpoints — `ContentStatus` only constrains
// callers that go through TypeScript. A direct POST can send any string, so
// validate at runtime before it reaches the update patch.
const statusSchema = z.enum(["draft", "in-review", "published", "archived"]);

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function revalidate(slug?: string) {
  revalidatePath("/admin/transparency");
  revalidatePath("/transparency");
  revalidatePath("/transparency/legislative");
  if (slug) revalidatePath(`/transparency/legislative/${slug}`);
}

// `ok` is a literal-typed discriminant (unlike `error: string | null`, which
// TS cannot use to narrow `slug` on a truthiness check since `string` isn't
// a unit type) so `if (!slugResult.ok)` below actually narrows `slug`.
type SlugResult = { ok: true; slug: string } | { ok: false; error: string };

/** Ensure a slug is unique, suffixing -2, -3… (ignoring the row being edited). */
async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
  ignoreId: string | null,
): Promise<SlugResult> {
  const { data, error } = await admin.from("legislative_documents").select("id, slug");
  if (error) return { ok: false, error: "Could not save the document. Try again." };
  const taken = new Set((data ?? []).filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return { ok: true, slug: base };
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return { ok: true, slug: candidate };
  }
}

/**
 * Client-callable counterpart to `getLegislativeForEdit` (which is
 * `server-only` and cannot be imported into the "use client" manager). The
 * manager fetches full detail — including `summary` and the file — only when
 * a drawer opens.
 */
export async function getLegislativeForEditAction(id: string) {
  if (!(await checkPermission("manage-transparency"))) return null;
  return getLegislativeForEdit(id);
}

export async function saveLegislative(
  id: string | null,
  values: LegislativeValues,
  fileForm: FormData,
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

  // Upload a newly chosen file (if any) up front — this is the only side
  // effect in this action before the row write below, so every failure past
  // this point must delete the object it just created. `fail()` does that.
  const incomingFile = fileForm.get("file");
  const removeFile = fileForm.get("removeFile") === "1";
  let uploadedPath: string | null = null;
  let uploadedSize: number | null = null;
  if (incomingFile instanceof File && incomingFile.size > 0) {
    const uploadFd = new FormData();
    uploadFd.append("file", incomingFile);
    const uploadResult = await uploadDocumentPdf("legislative", currentStatus, uploadFd);
    if (uploadResult.error) return { error: uploadResult.error, id: null };
    uploadedPath = uploadResult.path;
    uploadedSize = uploadResult.sizeBytes;
  }

  async function fail(error: string): Promise<SaveResult> {
    if (uploadedPath) {
      const removed = await removeStoredDocument("legislative", currentStatus, uploadedPath);
      // The compensating delete failing is a second, independent failure —
      // the caller must still see `error` (the original save failure), not
      // this one. But silently swallowing it means the orphan it leaves
      // behind is invisible to everyone. Log the path so a human can find
      // and clean it up; this is a storage-cleanup fault, not a user
      // action, so it doesn't belong in the user-facing audit_log.
      if (removed.error) {
        console.error(`Orphaned storage object (compensating delete failed): ${uploadedPath}`);
      }
    }
    return { error, id: null };
  }

  if (id) {
    const { data: existing, error: readErr } = await admin
      .from("legislative_documents")
      .select("status, slug, file_path, file_size_bytes")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return fail("Could not save the document.");
    if (!existing) return fail("Document not found.");

    // Lock the slug once published — a published URL must not move under
    // anyone who has already shared or bookmarked it.
    const wasPublished = existing.status === "published";
    let slug = existing.slug as string;
    if (!wasPublished) {
      const slugResult = await uniqueSlug(admin, base, id);
      if (!slugResult.ok) return fail(slugResult.error);
      slug = slugResult.slug;
    }

    // The final file reference: a newly uploaded file wins, otherwise the
    // user's removal request, otherwise whatever was already on the row.
    // Never trust the client's belief of the current path — it hasn't
    // uploaded anything since this drawer opened.
    const finalPath = uploadedPath ?? (removeFile ? null : (existing.file_path as string | null));
    const finalSize = uploadedPath
      ? uploadedSize
      : removeFile
        ? null
        : (existing.file_size_bytes as number | null);

    let query = admin
      .from("legislative_documents")
      .update({
        doc_type: parsed.data.docType,
        number,
        seq_no: parsed.data.seqNo,
        year: parsed.data.year,
        title: parsed.data.title,
        date_approved: normalizeDateApproved(parsed.data.dateApproved),
        summary: parsed.data.summary,
        file_path: finalPath,
        file_size_bytes: finalSize,
        slug,
      })
      .eq("id", id);
    // The slug above was computed against the status just read. If that read
    // saw a non-published status, re-assert it in the WHERE: should the
    // document get published concurrently, this update must not silently
    // apply a slug computed against the now-stale status.
    if (!wasPublished) {
      query = query.in("status", ["draft", "in-review", "archived"]);
    }
    // Optimistic lock on file_path — only when THIS save is uploading a new
    // file. Two admins editing only text fields must keep last-write-wins,
    // exactly as before; but if both replace the PDF, both uploads succeed
    // and both UPDATEs would otherwise match the row, so the second write
    // silently overwrites the first's file_path and orphans the first
    // upload. Require the row to still show the file_path this action read.
    // PostgREST's .eq() never matches NULL, so a currently-fileless row
    // needs .is() instead — get this branch wrong and every attach-to-a-
    // fileless-document save fails.
    if (uploadedPath) {
      const existingFilePath = existing.file_path as string | null;
      query =
        existingFilePath === null
          ? query.is("file_path", null)
          : query.eq("file_path", existingFilePath);
    }
    const { data: updated, error } = await query.select("id").maybeSingle();
    if (error) {
      return fail(
        error.code === "23505"
          ? `${number} already exists.`
          : "Could not save the document.",
      );
    }
    // Zero rows means one of the WHERE guards above didn't hold anymore.
    // Report that explicitly instead of falling through to
    // recordActivity/revalidate, which would log and announce a save that
    // never happened. A freshly uploaded file must not survive this: fail()
    // deletes it.
    if (!updated) {
      if (uploadedPath) {
        // The file guard is the narrowest, most specific condition on this
        // query, so treat a zero-row result as that race when it's active.
        return fail("Someone else changed this document's file. Reopen it and try again.");
      }
      return fail(
        wasPublished
          ? "Document not found."
          : "This document was published while you were editing. Reopen it and try again.",
      );
    }

    // Deferred delete: only once the row no longer references the old file.
    const oldPath = existing.file_path as string | null;
    if (oldPath && oldPath !== finalPath) {
      await removeStoredDocument("legislative", currentStatus, oldPath);
    }

    await recordActivity(actor, {
      type: "update",
      action: "updated document",
      entityType: "legislative document",
      entityId: id,
      entityLabel: number,
    });
    revalidate(slug);
    return { error: null, id };
  }

  const slugResult = await uniqueSlug(admin, base, null);
  if (!slugResult.ok) return fail(slugResult.error);

  const { data, error } = await admin
    .from("legislative_documents")
    .insert({
      slug: slugResult.slug,
      doc_type: parsed.data.docType,
      number,
      seq_no: parsed.data.seqNo,
      year: parsed.data.year,
      title: parsed.data.title,
      date_approved: normalizeDateApproved(parsed.data.dateApproved),
      summary: parsed.data.summary,
      file_path: uploadedPath,
      file_size_bytes: uploadedPath ? uploadedSize : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return fail(
      error?.code === "23505"
        ? `${number} already exists.`
        : "Could not create the document.",
    );
  }

  await recordActivity(actor, {
    type: "create",
    action: "created document",
    entityType: "legislative document",
    entityId: data.id,
    entityLabel: number,
  });
  revalidate(slugResult.slug);
  return { error: null, id: data.id };
}

/**
 * Move a document through draft → in-review → published → archived.
 * `published_at` is set once, on the first transition into published
 * (matching Plan 3); archiving is the normal path for a repealed ordinance.
 */
export async function setLegislativeStatus(
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
    .from("legislative_documents")
    .select("number, slug, status, published_at, file_path")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Document not found." };

  const previousStatus = existing.status as ContentStatus;
  const filePath = existing.file_path as string | null;

  const promotingNow = nextStatus === "published" && previousStatus !== "published";
  if (promotingNow && filePath) {
    const promoted = await promoteMedia("legislative", [filePath]);
    if (promoted.error) return { error: "Could not publish the document's file. Try again." };
  }

  const patch = statusPatch(actor, nextStatus);
  if (nextStatus === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("legislative_documents").update(patch).eq("id", id);
  if (error) return { error: "Could not update the document." };

  if (promotingNow && filePath) {
    await cleanupPromotedMedia("legislative", [filePath], "document published");
  }
  if (nextStatus === "archived" && previousStatus === "published" && filePath) {
    await demoteMedia("legislative", [filePath], "document archived");
  }

  await recordActivity(actor, {
    type: auditTypeForStatus(nextStatus),
    action: `${nextStatus} document`,
    entityType: "legislative document",
    entityId: id,
    entityLabel: existing.number as string,
  });
  revalidate(existing.slug as string);
  return { error: null };
}

/**
 * Hard delete — SuperAdmin only, and only from `archived` (umbrella §3.2).
 * Archiving is the normal path (spec §6): a repealed ordinance is legal history
 * and must stay readable. This removes the PDF too, which is very likely the
 * barangay's only digital copy.
 */
export async function deleteLegislative(id: string): Promise<ActionResult> {
  const guard = await guardDelete<{ number: string; slug: string; file_path: string | null }>(
    "legislative_documents",
    id,
    "number, slug, file_path",
  );
  if (!guard.ok) return { error: guard.error };
  const { actor, row: existing } = guard;
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from("legislative_documents").delete().eq("id", id);
  if (error) return { error: "Could not delete the document." };

  if (existing.file_path) await removeStoredDocument("legislative", "archived", existing.file_path);
  await recordActivity(actor, {
    type: "delete",
    action: "deleted document",
    entityType: "legislative document",
    entityId: id,
    entityLabel: existing.number,
  });
  revalidate(existing.slug);
  return { error: null };
}

/** Bring an archived ordinance back as a draft — not straight back onto the public list. */
export async function restoreLegislative(id: string): Promise<ActionResult> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .update(statusPatch(actor, "draft"))
    .eq("id", id)
    .eq("status", "archived")
    .select("number, slug")
    .maybeSingle();
  if (error) return { error: "Could not restore the document." };
  if (!data) return { error: "That document is not archived. Refresh to see the current state." };

  await recordActivity(actor, {
    type: "restore",
    action: "restored document",
    entityType: "legislative document",
    entityId: id,
    entityLabel: data.number as string,
  });
  revalidate(data.slug as string);
  return { error: null };
}
