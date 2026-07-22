import "server-only";
import type { AuditActionType, AuditEntry } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const AUDIT_PAGE_SIZE = 10;

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

export type AuditSortKey = "created_at" | "actor_name" | "action_type" | "entity_type";

export interface AuditSearchParams {
  q: string;
  type: AuditActionType | "all";
  sort: AuditSortKey;
  dir: "asc" | "desc";
  page: number;
}

/**
 * Paginated fuzzy audit search, via the `search_audit_log` RPC (migration
 * 0015).
 *
 * Server-side by necessity, not preference: this table grows without bound, so
 * the client-side filtering the eight admin managers use would eventually ship
 * the whole log to the browser.
 *
 * The matching itself lives in SQL because it is per-term rather than per-row
 * (every term must match, by substring OR edit distance OR trigram
 * similarity), which PostgREST's filter grammar cannot express. See the
 * migration for why all three routes are needed.
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

  const { data, error } = await admin.rpc("search_audit_log", {
    p_q: q.trim(),
    p_type: type === "all" ? null : type,
    p_sort: sort,
    p_dir: dir,
    p_limit: AUDIT_PAGE_SIZE,
    p_offset: (safePage - 1) * AUDIT_PAGE_SIZE,
  });

  if (error || !data) {
    if (error) console.error("searchAuditLog failed:", error.message);
    return { entries: [], total: 0, pageSize: AUDIT_PAGE_SIZE };
  }

  const rows = data as (Row & { total_count: number })[];
  return {
    entries: rows.map(toEntry),
    // total_count is a window function over the full match set, so it is
    // identical on every row; zero rows means zero matches.
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    pageSize: AUDIT_PAGE_SIZE,
  };
}
