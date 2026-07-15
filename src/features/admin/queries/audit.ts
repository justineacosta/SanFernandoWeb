import type { AuditEntry } from "@/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function listRecentActivity(limit = 8): Promise<AuditEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_name, action, entity_type, entity_id, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) {
    if (error) console.error("listRecentActivity failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    actorName: row.actor_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}
