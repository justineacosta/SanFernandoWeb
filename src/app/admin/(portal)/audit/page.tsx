import type { AuditActionType } from "@/types";
import { AUDIT_ACTIONS } from "@/types";
import { gatedMetadata, requireSuperAdmin } from "@/lib/auth";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { AuditLogManager } from "@/features/admin/components/audit-log-manager";
import type { AuditSortKey } from "@/features/admin/queries/audit";

export const generateMetadata = gatedMetadata("superadmin", "Audit Logs");

const SORT_KEYS: AuditSortKey[] = ["created_at", "actor_name", "action_type", "entity_type"];

/** searchParams are user-controlled — coerce anything unrecognised to a default. */
function parseType(value: string | undefined): AuditActionType | "all" {
  return value && (AUDIT_ACTIONS as readonly string[]).includes(value)
    ? (value as AuditActionType)
    : "all";
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  // SuperAdmin-only: the log contains sign-in records and permission changes
  // for the whole team. Non-SuperAdmins get a 404, not an error.
  await requireSuperAdmin();
  const p = await searchParams;

  return (
    <>
      <AdminPageHeader
        title="Audit Logs"
        description="Every administrative action recorded in the portal. Entries cannot be edited or removed."
      />
      <AuditLogManager
        q={p.q?.trim() ?? ""}
        type={parseType(p.type)}
        sort={SORT_KEYS.includes(p.sort as AuditSortKey) ? (p.sort as AuditSortKey) : "created_at"}
        dir={p.dir === "asc" ? "asc" : "desc"}
        page={Number(p.page) || 1}
      />
    </>
  );
}
