"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, LegislativeValues } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  number: z.string().trim().min(3, "Enter the official document number."),
  title: z.string().trim().min(3, "Enter a title."),
  dateApproved: z.string().trim().min(1, "Pick the date approved."),
  summary: z.string(),
  filePath: z.string().nullable(),
  fileSizeBytes: z.number().nullable(),
});

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
  await requirePermission("manage-transparency");
  return getLegislativeForEdit(id);
}

export async function saveLegislative(
  id: string | null,
  values: LegislativeValues,
  fileForm: FormData,
): Promise<SaveResult> {
  const actor = await requirePermission("manage-transparency");
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };
  }

  const admin = createSupabaseAdminClient();
  const base = slugify(`${parsed.data.number} ${parsed.data.title}`);
  if (!base) return { error: "Enter a number and title with letters or numbers.", id: null };

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
    const uploadResult = await uploadDocumentPdf("legislative", uploadFd);
    if (uploadResult.error) return { error: uploadResult.error, id: null };
    uploadedPath = uploadResult.path;
    uploadedSize = uploadResult.sizeBytes;
  }

  async function fail(error: string): Promise<SaveResult> {
    if (uploadedPath) await removeStoredDocument(uploadedPath);
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
        number: parsed.data.number,
        title: parsed.data.title,
        date_approved: parsed.data.dateApproved,
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
    const { data: updated, error } = await query.select("id").maybeSingle();
    if (error) return fail("Could not save the document.");
    // A non-published row re-asserts status in the WHERE above, so a zero-row
    // result here means someone published it out from under this edit — the
    // UPDATE matched nothing and nothing changed. Report that explicitly
    // instead of falling through to recordActivity/revalidate, which would
    // log and announce a save that never happened. A freshly uploaded file
    // must not survive this: fail() deletes it.
    if (!updated) {
      return fail(
        wasPublished
          ? "Document not found."
          : "This document was published while you were editing. Reopen it and try again.",
      );
    }

    // Deferred delete: only once the row no longer references the old file.
    const oldPath = existing.file_path as string | null;
    if (oldPath && oldPath !== finalPath) {
      await removeStoredDocument(oldPath);
    }

    await recordActivity(actor, "updated document", "legislative document", id, parsed.data.number);
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
      number: parsed.data.number,
      title: parsed.data.title,
      date_approved: parsed.data.dateApproved,
      summary: parsed.data.summary,
      file_path: uploadedPath,
      file_size_bytes: uploadedPath ? uploadedSize : null,
    })
    .select("id")
    .single();
  if (error || !data) return fail("Could not create the document.");

  await recordActivity(
    actor,
    "created document",
    "legislative document",
    data.id,
    parsed.data.number,
  );
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
  const actor = await requirePermission("manage-transparency");

  const statusResult = statusSchema.safeParse(status);
  if (!statusResult.success) {
    return { error: statusResult.error.issues[0]?.message ?? "Invalid status." };
  }
  const nextStatus = statusResult.data;

  const admin = createSupabaseAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("legislative_documents")
    .select("number, slug, published_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Document not found." };

  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("legislative_documents").update(patch).eq("id", id);
  if (error) return { error: "Could not update the document." };

  await recordActivity(
    actor,
    `${nextStatus} document`,
    "legislative document",
    id,
    existing.number as string,
  );
  revalidate(existing.slug as string);
  return { error: null };
}

/**
 * Hard delete — for mistakes only. Archiving is the normal path (spec §6):
 * a repealed ordinance is legal history and must stay readable.
 */
export async function deleteLegislative(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-transparency");
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("legislative_documents")
    .select("number, slug, file_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("legislative_documents").delete().eq("id", id);
  if (error) return { error: "Could not delete the document." };

  if (existing?.file_path) await removeStoredDocument(existing.file_path as string);
  await recordActivity(
    actor,
    "deleted document",
    "legislative document",
    id,
    (existing?.number as string) ?? "",
  );
  revalidate((existing?.slug as string) ?? undefined);
  return { error: null };
}
