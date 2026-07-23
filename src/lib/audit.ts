import type { AuditActionType, ContentStatus, SessionUser } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Classify a `draft → in-review → published → archived` transition. Shared by
 * the four managers whose status actions record `${nextStatus} <entity>` —
 * legislative documents, officials, transparency documents, and projects — so
 * the mapping lives in one place instead of four.
 */
export function auditTypeForStatus(status: ContentStatus): AuditActionType {
  if (status === "published") return "publish";
  if (status === "archived") return "archive";
  if (status === "draft") return "save_draft";
  return "update"; // in-review
}

/**
 * One audit entry. An options object rather than positional arguments — with
 * six fields, `recordActivity(actor, "update", "updated official", "official",
 * id, name)` is unreadable at the call site and easy to mis-order.
 */
export interface AuditInput {
  /** Controlled class, drives the Action Type dropdown filter. */
  type: AuditActionType;
  /** Human sentence kept alongside the type, e.g. "archived announcement". */
  action: string;
  /** What kind of thing was acted on, e.g. "official", "news article". */
  entityType: string;
  /** Row id, or the ticket number for ticket flows. */
  entityId?: string;
  /**
   * The target's human name, captured NOW. Resolving it at read time would
   * break precisely when the row is deleted — the case the trail matters for.
   */
  entityLabel?: string;
  /** Extra context (staff remarks on a decision). Never the entity name. */
  detail?: string;
}

/**
 * Append to the audit log. Fire-and-forget by design: an audit failure must
 * never roll back the action it records (log and continue).
 *
 * The table is append-only at the database level (migration 0014 revokes
 * UPDATE/DELETE and adds rejecting triggers), so this is the only way rows
 * ever enter it.
 */
export async function recordActivity(
  // Only the two fields actually written. Narrower than SessionUser so the
  // sign-in path — which has a user id and profile name but no resolved
  // session yet — can call this without fabricating the rest.
  actor: Pick<SessionUser, "id" | "fullName">,
  entry: AuditInput,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("audit_log").insert({
      actor_id: actor.id,
      actor_name: actor.fullName,
      action_type: entry.type,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      entity_label: entry.entityLabel ?? null,
      detail: entry.detail ?? null,
    });
    if (error) {
      console.error("audit_log insert failed:", error.message);
    }
  } catch (err) {
    console.error("audit_log insert failed:", err instanceof Error ? err.message : err);
  }
}
