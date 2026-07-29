import { NextResponse } from "next/server";
import { z } from "zod";
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
  const statusResult = statusSchema.safeParse(formData.get("status"));
  if (!kindResult.success || !statusResult.success) {
    return fail("Upload failed. Try again.", 400);
  }
  const kind: DocUploadKind = kindResult.data;
  const status = statusResult.data;
  const rules = uploadRulesFor(kind);

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return fail("Choose a file.", 400);
  if (files.length > rules.maxFiles) {
    return fail(rules.maxFiles === 1 ? "Choose one file." : `Up to ${rules.maxFiles} files.`, 400);
  }

  const admin = createSupabaseAdminClient();
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
