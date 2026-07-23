import type { AuditActionType } from "@/types";

/**
 * Human labels for the Action Type dropdown and the table's badge column.
 *
 * Its own module rather than living in audit-log-manager.tsx: that file is a
 * Server Component importing `server-only` query code, and the client-side
 * AuditFilters needs these labels too. Importing across that boundary would
 * pull the query layer into the browser bundle.
 */
export const AUDIT_ACTION_LABELS: Record<AuditActionType, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
  archive: "Archive",
  restore: "Restore",
  publish: "Publish",
  unpublish: "Unpublish",
  save_draft: "Save Draft",
  approve: "Approve",
  reject: "Reject",
  login: "Login",
  logout: "Logout",
  file_upload: "File Upload",
  file_delete: "File Delete",
  role_change: "Role Change",
  password_reset: "Password Reset",
  reorder: "Reorder",
};
