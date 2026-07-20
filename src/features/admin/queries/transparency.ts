import "server-only";
import type {
  AdminLegislativeRow,
  AdminTransparencyDocumentRow,
  AdminTransparencyProjectRow,
  ContentStatus,
  LegislativeType,
  LegislativeValues,
  TransparencyDocumentValues,
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

export async function listAdminTransparencyDocuments(): Promise<AdminTransparencyDocumentRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select("id, title, category_id, date_released, status, file_path, transparency_categories(label)")
    .order("date_released", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as {
    id: string;
    title: string;
    category_id: string;
    date_released: string;
    status: ContentStatus;
    file_path: string | null;
    transparency_categories: { label: string } | null;
  }[]).map((row) => ({
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    categoryLabel: row.transparency_categories?.label ?? "Document",
    dateReleased: row.date_released,
    status: row.status,
    hasFile: Boolean(row.file_path),
    fileUrl: row.file_path ? documentUrl(row.file_path) : null,
  }));
}

export async function getTransparencyDocumentForEdit(
  id: string,
): Promise<{ values: TransparencyDocumentValues; status: ContentStatus; fileUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select("title, category_id, date_released, file_path, file_size_bytes, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    values: {
      title: data.title as string,
      categoryId: data.category_id as string,
      dateReleased: data.date_released as string,
      filePath: (data.file_path as string) ?? null,
      fileSizeBytes: (data.file_size_bytes as number) ?? null,
    },
    status: data.status as ContentStatus,
    fileUrl: data.file_path ? documentUrl(data.file_path as string) : null,
  };
}

export async function listAdminTransparencyProjects(): Promise<AdminTransparencyProjectRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_projects")
    .select("id, name, progress, sort_order, status")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    progress: row.progress as number,
    sortOrder: row.sort_order as number,
    status: row.status as ContentStatus,
  }));
}
