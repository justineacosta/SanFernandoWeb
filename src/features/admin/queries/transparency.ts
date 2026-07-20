import "server-only";
import type {
  AdminLegislativeRow,
  ContentStatus,
  LegislativeType,
  LegislativeValues,
} from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { documentUrl } from "@/lib/storage";

export async function listAdminLegislative(): Promise<AdminLegislativeRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select("id, slug, doc_type, number, title, date_approved, status, file_path")
    .order("date_approved", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    docType: row.doc_type as LegislativeType,
    number: row.number as string,
    title: row.title as string,
    dateApproved: row.date_approved as string,
    status: row.status as ContentStatus,
    hasFile: Boolean(row.file_path),
    fileUrl: row.file_path ? documentUrl(row.file_path as string) : null,
  }));
}

export async function getLegislativeForEdit(
  id: string,
): Promise<{ values: LegislativeValues; status: ContentStatus; fileUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select("doc_type, number, title, date_approved, summary, file_path, file_size_bytes, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    values: {
      docType: data.doc_type as LegislativeType,
      number: data.number as string,
      title: data.title as string,
      dateApproved: data.date_approved as string,
      summary: (data.summary as string) ?? "",
      filePath: (data.file_path as string) ?? null,
      fileSizeBytes: (data.file_size_bytes as number) ?? null,
    },
    status: data.status as ContentStatus,
    fileUrl: data.file_path ? documentUrl(data.file_path as string) : null,
  };
}
