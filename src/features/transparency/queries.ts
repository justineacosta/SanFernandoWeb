import "server-only";
import type {
  LegislativeDetail,
  LegislativeListItem,
  LegislativeType,
  TransparencyDocumentItem,
  TransparencyFile,
  TransparencyProjectItem,
} from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { documentUrl } from "@/lib/storage";

export const LEGISLATIVE_PAGE_SIZE = 10;

const LIST_COLUMNS =
  "id, slug, doc_type, number, title, date_approved, file_path, file_size_bytes";

interface LegislativeRow {
  id: string;
  slug: string;
  doc_type: LegislativeType;
  number: string;
  title: string;
  date_approved: string | null;
  summary?: string;
  file_path: string | null;
  file_size_bytes: number | null;
}

function toListItem(row: LegislativeRow): LegislativeListItem {
  return {
    id: row.id,
    slug: row.slug,
    docType: row.doc_type,
    number: row.number,
    title: row.title,
    dateApproved: row.date_approved,
    fileUrl: row.file_path ? documentUrl(row.file_path) : null,
    fileSizeBytes: row.file_size_bytes,
  };
}

/**
 * Escape a user search term for a PostgREST `ilike` filter.
 *
 * Two separate hazards, escaped in order:
 *  1. LIKE pattern chars — `%` and `_` are wildcards, `\` is the escape
 *     character. An unescaped `%` matches everything, which is how the same
 *     mistake in /track's surname lookup would have leaked every ticket.
 *     PostgREST *also* treats a bare `*` as an alias for `%` in ilike/like
 *     filter values (its own quoting layer, on top of Postgres LIKE), so `*`
 *     must be escaped to prevent wildcard expansion. When escaped as `\*`,
 *     PostgREST substitutes it to `\%` regardless of the backslash, and
 *     Postgres LIKE (default ESCAPE '\') decodes this as a literal percent
 *     sign. Thus a user searching for a literal `*` matches records with
 *     literal `%` instead—an accepted limitation. The essential property is
 *     that user input cannot expand into a match-everything wildcard, and
 *     this has been verified empirically against the live Supabase project
 *     (2026-07-20).
 *  2. PostgREST filter grammar — `,` `.` `(` `)` and `"` are structural inside
 *     an or() expression. Wrapping the value in double quotes makes them
 *     literal; the quote and backslash themselves then need escaping.
 */
function ilikePattern(raw: string): string {
  const escaped = raw
    .replace(/\\/g, "\\\\")
    .replace(/[%_*]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

/** Recent published documents of one type — the /transparency preview tables. */
export async function listRecentLegislative(
  docType: LegislativeType,
  limit = 5,
): Promise<LegislativeDetail[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select(`${LIST_COLUMNS}, summary`)
    .eq("status", "published")
    .eq("doc_type", docType)
    // Pending (undated) documents sort first — the repo owner's explicit
    // call. Postgres puts NULLs first on a DESC order by default, but say so
    // explicitly rather than lean on that default (see 0010 migration).
    .order("date_approved", { ascending: false, nullsFirst: true })
    .limit(limit);

  if (error || !data) return [];
  return (data as LegislativeRow[]).map((row) => ({
    ...toListItem(row),
    summary: row.summary ?? "",
  }));
}

/** Paginated search over number, title and summary. */
export async function searchLegislative({
  q,
  docType,
  page,
}: {
  q: string;
  docType: LegislativeType | "all";
  page: number;
}): Promise<{ items: LegislativeDetail[]; total: number; pageSize: number }> {
  const admin = createSupabaseAdminClient();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * LEGISLATIVE_PAGE_SIZE;

  let query = admin
    .from("legislative_documents")
    .select(`${LIST_COLUMNS}, summary`, { count: "exact" })
    .eq("status", "published");

  if (docType !== "all") query = query.eq("doc_type", docType);

  const term = q.trim();
  if (term) {
    const value = quoteFilterValue(ilikePattern(term));
    query = query.or(`number.ilike.${value},title.ilike.${value},summary.ilike.${value}`);
  }

  const { data, count, error } = await query
    // Pending (undated) documents sort first — see listRecentLegislative.
    .order("date_approved", { ascending: false, nullsFirst: true })
    .range(from, from + LEGISLATIVE_PAGE_SIZE - 1);

  if (error || !data) return { items: [], total: 0, pageSize: LEGISLATIVE_PAGE_SIZE };
  return {
    items: (data as LegislativeRow[]).map((row) => ({
      ...toListItem(row),
      summary: row.summary ?? "",
    })),
    total: count ?? 0,
    pageSize: LEGISLATIVE_PAGE_SIZE,
  };
}

export async function getPublishedLegislativeBySlug(
  slug: string,
): Promise<LegislativeDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("legislative_documents")
    .select(`${LIST_COLUMNS}, summary`)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as LegislativeRow;
  return { ...toListItem(row), summary: row.summary ?? "" };
}

interface FileRow {
  id: string;
  owner_id: string;
  path: string;
  mime: string;
  size_bytes: number;
  sort_order: number;
}

function toFile(row: FileRow, index: number): TransparencyFile {
  return {
    id: row.id,
    url: documentUrl(row.path),
    label: row.mime === "application/pdf" ? `Document ${index + 1}` : `Image ${index + 1}`,
    mime: row.mime,
    sizeBytes: row.size_bytes,
  };
}

/** Map owner_id → resolved files, for a set of document/project ids. */
export async function filesByOwner(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  ownerType: "document" | "project",
  ownerIds: string[],
): Promise<Map<string, TransparencyFile[]>> {
  const map = new Map<string, TransparencyFile[]>();
  if (ownerIds.length === 0) return map;
  const { data } = await admin
    .from("transparency_files")
    .select("id, owner_id, path, mime, size_bytes, sort_order")
    .eq("owner_type", ownerType)
    .in("owner_id", ownerIds)
    .order("sort_order", { ascending: true });
  for (const row of (data ?? []) as FileRow[]) {
    const list = map.get(row.owner_id) ?? [];
    list.push(toFile(row, list.length));
    map.set(row.owner_id, list);
  }
  return map;
}

interface DocumentRow {
  id: string;
  title: string;
  date_released: string | null;
  transparency_categories: { label: string; icon_name: string } | null;
}

const DOCUMENT_COLUMNS =
  "id, title, date_released, transparency_categories(label, icon_name)";

function toDocumentItem(row: DocumentRow, files: TransparencyFile[]): TransparencyDocumentItem {
  return {
    id: row.id,
    title: row.title,
    categoryLabel: row.transparency_categories?.label ?? "Document",
    categoryIconName: row.transparency_categories?.icon_name ?? "file-text",
    dateReleased: row.date_released,
    files,
  };
}

export async function listPublishedDocumentsByCategory(
  categoryId: string,
  limit = 6,
): Promise<TransparencyDocumentItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("status", "published")
    .eq("category_id", categoryId)
    .order("date_released", { ascending: false, nullsFirst: true })
    .limit(limit);
  if (error || !data) return [];
  const rows = data as unknown as DocumentRow[];
  const files = await filesByOwner(admin, "document", rows.map((r) => r.id));
  return rows.map((r) => toDocumentItem(r, files.get(r.id) ?? []));
}

export async function listLatestPublishedDocuments(
  limit = 4,
): Promise<TransparencyDocumentItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("status", "published")
    .order("date_released", { ascending: false, nullsFirst: true })
    .limit(limit);
  if (error || !data) return [];
  const rows = data as unknown as DocumentRow[];
  const files = await filesByOwner(admin, "document", rows.map((r) => r.id));
  return rows.map((r) => toDocumentItem(r, files.get(r.id) ?? []));
}

export async function listPublishedProjects(): Promise<TransparencyProjectItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("transparency_projects")
    .select("id, name, progress")
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data as TransparencyProjectItem[];
}
