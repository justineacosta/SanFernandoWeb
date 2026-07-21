import "server-only";
import type {
  AdminLegislativeRow,
  AdminTransparencyDocumentRow,
  AdminTransparencyProjectRow,
  ContentStatus,
  LegislativeType,
  LegislativeValues,
  TransparencyDocumentValues,
  TransparencyProjectValues,
} from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { documentUrl } from "@/lib/storage";

export async function listAdminLegislative(): Promise<AdminLegislativeRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select("id, slug, doc_type, number, title, date_approved, status, file_path")
    // Pending (undated) documents sort first — the repo owner's explicit
    // call, stated explicitly rather than relying on Postgres's NULLS FIRST
    // default for DESC (see 0010 migration).
    .order("date_approved", { ascending: false, nullsFirst: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    docType: row.doc_type as LegislativeType,
    number: row.number as string,
    title: row.title as string,
    dateApproved: row.date_approved as string | null,
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
      dateApproved: data.date_approved as string | null,
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
    .select("id, title, category_id, date_released, status, transparency_categories(label)")
    .order("date_released", { ascending: false, nullsFirst: true });
  if (error || !data) return [];
  const rows = data as unknown as {
    id: string; title: string; category_id: string; date_released: string | null;
    status: ContentStatus; transparency_categories: { label: string } | null;
  }[];
  const counts = new Map<string, number>();
  if (rows.length > 0) {
    // Guard the empty case: `.in("owner_id", [])` on a uuid column can error.
    const { data: fileRows } = await admin
      .from("transparency_files")
      .select("owner_id")
      .eq("owner_type", "document")
      .in("owner_id", rows.map((r) => r.id));
    for (const fr of (fileRows ?? []) as { owner_id: string }[]) {
      counts.set(fr.owner_id, (counts.get(fr.owner_id) ?? 0) + 1);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    categoryLabel: row.transparency_categories?.label ?? "Document",
    dateReleased: row.date_released,
    status: row.status,
    fileCount: counts.get(row.id) ?? 0,
  }));
}

export async function getTransparencyDocumentForEdit(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select("title, category_id, date_released, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const { data: fileRows } = await admin
    .from("transparency_files")
    .select("id, path, mime, size_bytes, sort_order")
    .eq("owner_type", "document")
    .eq("owner_id", id)
    .order("sort_order", { ascending: true });
  const files = ((fileRows ?? []) as { id: string; path: string; mime: string; size_bytes: number }[]).map(
    (f, i) => ({
      id: f.id,
      url: documentUrl(f.path),
      label: f.mime === "application/pdf" ? `Document ${i + 1}` : `Image ${i + 1}`,
      mime: f.mime,
      sizeBytes: f.size_bytes,
    }),
  );
  return {
    values: {
      title: data.title as string,
      categoryId: data.category_id as string,
      dateReleased: data.date_released as string | null,
    } satisfies TransparencyDocumentValues,
    status: data.status as ContentStatus,
    files,
  };
}

export async function listAdminTransparencyProjects(): Promise<AdminTransparencyProjectRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_projects")
    .select("id, name, progress, sort_order, status, date")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  const rows = data as unknown as {
    id: string; name: string; progress: number; sort_order: number;
    status: ContentStatus; date: string | null;
  }[];
  const counts = new Map<string, number>();
  if (rows.length > 0) {
    // Guard the empty case: `.in("owner_id", [])` on a uuid column can error.
    const { data: fileRows } = await admin
      .from("transparency_files")
      .select("owner_id")
      .eq("owner_type", "project")
      .in("owner_id", rows.map((r) => r.id));
    for (const fr of (fileRows ?? []) as { owner_id: string }[]) {
      counts.set(fr.owner_id, (counts.get(fr.owner_id) ?? 0) + 1);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    progress: row.progress,
    sortOrder: row.sort_order,
    status: row.status,
    date: row.date,
    fileCount: counts.get(row.id) ?? 0,
  }));
}

export async function getTransparencyProjectForEdit(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_projects")
    .select("name, progress, date, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const { data: fileRows } = await admin
    .from("transparency_files")
    .select("id, path, mime, size_bytes, sort_order")
    .eq("owner_type", "project")
    .eq("owner_id", id)
    .order("sort_order", { ascending: true });
  const files = ((fileRows ?? []) as { id: string; path: string; mime: string; size_bytes: number }[]).map(
    (f, i) => ({
      id: f.id,
      url: documentUrl(f.path),
      label: f.mime === "application/pdf" ? `Document ${i + 1}` : `Image ${i + 1}`,
      mime: f.mime,
      sizeBytes: f.size_bytes,
    }),
  );
  return {
    values: {
      name: data.name as string,
      progress: data.progress as number,
      date: data.date as string | null,
    } satisfies TransparencyProjectValues,
    status: data.status as ContentStatus,
    files,
  };
}
