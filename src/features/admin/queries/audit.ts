import "server-only";
import type { AuditActionType, AuditEntry } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ilikePattern, quoteFilterValue } from "@/lib/postgrest";

export const AUDIT_PAGE_SIZE = 25;

const COLUMNS =
  "id, actor_name, action_type, action, entity_type, entity_id, entity_label, detail, created_at";

interface Row {
  id: number;
  actor_name: string;
  action_type: AuditActionType;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  detail: string | null;
  created_at: string;
}

function toEntry(row: Row): AuditEntry {
  return {
    id: row.id,
    actorName: row.actor_name,
    actionType: row.action_type,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

/**
 * Recent entries for the dashboard panel.
 *
 * Reads through the SERVICE-ROLE client. Migration 0014 drops the permissive
 * `for select to authenticated` policy migration 0001 created, so audit_log now
 * matches every other table: RLS enabled with no policies, and the explicit
 * permission check in the calling page is the entire gate.
 */
export async function listRecentActivity(limit = 8): Promise<AuditEntry[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("audit_log")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) {
    if (error) console.error("listRecentActivity failed:", error.message);
    return [];
  }
  return (data as Row[]).map(toEntry);
}

export type AuditSortKey = "created_at" | "actor_name" | "action_type" | "entity_type";

export interface AuditSearchParams {
  q: string;
  type: AuditActionType | "all";
  sort: AuditSortKey;
  dir: "asc" | "desc";
  page: number;
}

/**
 * Paginated, filterable audit search.
 *
 * Server-side by necessity, not preference: this table grows without bound, so
 * the client-side filtering the eight admin managers use would eventually ship
 * the whole log to the browser.
 *
 * Matching is substring (`ilike`) for now. Sub-project 4 replaces the matcher
 * with pg_trgm similarity; the parameters, sorting, and pagination here do not
 * change when it does.
 */
export async function searchAuditLog({
  q,
  type,
  sort,
  dir,
  page,
}: AuditSearchParams): Promise<{ entries: AuditEntry[]; total: number; pageSize: number }> {
  const admin = createSupabaseAdminClient();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * AUDIT_PAGE_SIZE;

  let query = admin.from("audit_log").select(COLUMNS, { count: "exact" });

  if (type !== "all") query = query.eq("action_type", type);

  const term = q.trim();
  if (term) {
    const value = quoteFilterValue(ilikePattern(term));
    query = query.or(
      `actor_name.ilike.${value},entity_label.ilike.${value},` +
        `entity_type.ilike.${value},action.ilike.${value},entity_id.ilike.${value}`,
    );
  }

  const { data, count, error } = await query
    .order(sort, { ascending: dir === "asc" })
    // Stable tiebreak: two rows written in the same transaction share a
    // created_at, and without this their relative order varies per request,
    // which makes pagination drop or repeat rows.
    .order("id", { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE - 1);

  if (error || !data) {
    if (error) console.error("searchAuditLog failed:", error.message);
    return { entries: [], total: 0, pageSize: AUDIT_PAGE_SIZE };
  }
  return {
    entries: (data as Row[]).map(toEntry),
    total: count ?? 0,
    pageSize: AUDIT_PAGE_SIZE,
  };
}
