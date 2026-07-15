import type { SessionUser } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Append to the audit log. Fire-and-forget by design: an audit failure must
 * never roll back the action it records (log and continue).
 */
export async function recordActivity(
  actor: SessionUser,
  action: string,
  entityType: string,
  entityId?: string,
  detail?: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("audit_log").insert({
    actor_id: actor.id,
    actor_name: actor.fullName,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    detail: detail ?? null,
  });
  if (error) {
    console.error("audit_log insert failed:", error.message);
  }
}
