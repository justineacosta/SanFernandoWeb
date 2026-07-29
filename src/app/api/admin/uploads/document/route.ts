import { NextResponse } from "next/server";
import { z } from "zod";
import type { ContentStatus } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bucketForStatus, extForDocType, uploadRulesFor, type DocUploadKind } from "@/lib/storage";

export interface UploadedDocumentFile {
  path: string;
  sizeBytes: number;
  mime: string;
}
interface UploadDocumentResponse {
  error: string | null;
  files: UploadedDocumentFile[];
}

const kindSchema = z.enum(["legislative", "documents", "projects"]);
const statusSchema = z.enum(["draft", "in-review", "published", "archived"]);

/** Which table owns a record of each upload kind — the source of truth for its status. */
const TABLE_FOR_KIND: Record<DocUploadKind, string> = {
  legislative: "legislative_documents",
  documents: "transparency_documents",
  projects: "transparency_projects",
};

function fail(error: string, status: number): NextResponse<UploadDocumentResponse> {
  return NextResponse.json({ error, files: [] }, { status });
}

/**
 * Authenticated multipart upload for legislative/transparency documents,
 * moved off the Server Action body path (security-hardening Plan 3): a
 * single 10 MB PDF was forcing next.config.ts's global
 * serverActions.bodySizeLimit up for every public, unauthenticated form too.
 * Not audited (no recordActivity call) — see this plan's Global Constraints
 * for why, mirroring documents.ts's former uploadDocumentPdf/
 * uploadTransparencyFile.
 *
 * Request contract: `kind` (legislative | documents | projects), an optional
 * `id` (the record being edited; omitted for a new one), and one or more
 * `file` parts. The destination bucket is derived from the record's own
 * status, read here — never from anything the client sends.
 */
export async function POST(request: Request): Promise<NextResponse<UploadDocumentResponse>> {
  const actor = await checkPermission("manage-transparency");
  if (!actor) return fail(NOT_FOUND, 404);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Upload failed. Try again.", 400);
  }

  const kindResult = kindSchema.safeParse(formData.get("kind"));
  if (!kindResult.success) return fail("Upload failed. Try again.", 400);
  const kind: DocUploadKind = kindResult.data;
  const rules = uploadRulesFor(kind);

  // The record being edited, or null for a new one. The status is deliberately
  // NOT accepted from the client: it decides which bucket of the public/private
  // pair the object lands in, and a stale tab (or a status that moved between
  // page load and Save) would otherwise put a published record's file in the
  // private `-drafts` bucket — a permanent 404 on the public site — or a
  // draft's file in the anonymously-enumerable `-media` bucket. Nothing
  // downstream self-heals that: every cleanup and URL-resolution path computes
  // the bucket from the row's current status, never from what the upload used.
  const rawId = formData.get("id");
  const recordId = typeof rawId === "string" && rawId.length > 0 ? rawId : null;

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return fail("Choose a file.", 400);
  if (files.length > rules.maxFiles) {
    return fail(rules.maxFiles === 1 ? "Choose one file." : `Up to ${rules.maxFiles} files.`, 400);
  }

  const admin = createSupabaseAdminClient();

  // A new record has no row to read and is always a draft — the same default
  // the three save actions apply to their own `currentStatus` lookup.
  let status: ContentStatus = "draft";
  if (recordId) {
    const { data: statusRow, error: statusErr } = await admin
      .from(TABLE_FOR_KIND[kind])
      .select("status")
      .eq("id", recordId)
      .maybeSingle();
    // A missing row gets the same generic message as every other failure here
    // rather than a "not found" — this endpoint must not answer whether an id
    // exists.
    if (statusErr || !statusRow) return fail("Upload failed. Try again.", 400);
    const statusResult = statusSchema.safeParse(statusRow.status);
    if (!statusResult.success) return fail("Upload failed. Try again.", 500);
    status = statusResult.data;
  }

  const bucket = bucketForStatus(rules.mediaKind, status);
  const uploaded: UploadedDocumentFile[] = [];

  async function cleanupUploaded() {
    if (uploaded.length === 0) return;
    const { error } = await admin.storage.from(bucket).remove(uploaded.map((u) => u.path));
    if (error) {
      console.error(`Orphaned storage object(s) (upload cleanup failed): ${uploaded.map((u) => u.path).join(", ")}`);
    }
  }

  for (const file of files) {
    if (!rules.allowedTypes.includes(file.type as (typeof rules.allowedTypes)[number])) {
      await cleanupUploaded();
      return fail(kind === "legislative" ? "The document must be a PDF." : "Files must be a PDF or image.", 400);
    }
    if (file.size > rules.maxBytes) {
      await cleanupUploaded();
      return fail(`Each file must be ${rules.maxBytes / (1024 * 1024)} MB or smaller.`, 400);
    }

    const path = `${kind}/${crypto.randomUUID()}.${extForDocType(file.type)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(bucket).upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      await cleanupUploaded();
      return fail("Upload failed. Try again.", 500);
    }
    uploaded.push({ path, sizeBytes: file.size, mime: file.type });
  }

  return NextResponse.json({ error: null, files: uploaded });
}
