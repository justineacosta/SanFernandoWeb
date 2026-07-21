import Link from "next/link";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAuditTimestamp } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import type { AuditEntry } from "@/types";
import { AUDIT_ACTION_LABELS } from "./audit-log-manager";

interface AuditLogPanelProps {
  entries: AuditEntry[];
}

/**
 * Recent administrative actions, from the audit log.
 *
 * SuperAdmin-only — ContentHub does not render it for anyone else. These rows
 * name modules the viewer may have no permission for, so gating happens at the
 * call site rather than by hiding the "View all" link here.
 */
export function AuditLogPanel({ entries }: AuditLogPanelProps) {
  return (
    <Card className="rounded-3xl p-6">
      <CardHeader
        title="Audit Logs"
        icon={<History className="h-5 w-5 text-ink-500" aria-hidden="true" />}
        action={
          <Link
            href="/admin/audit"
            className="text-sm font-semibold text-brand-700 transition-colors hover:text-ink-900"
          >
            View all
          </Link>
        }
      />
      {entries.length === 0 ? (
        <p className="px-6 py-10 text-center text-ink-600">No activity yet.</p>
      ) : (
        <ol className="relative ml-2 mt-2 space-y-6 border-l-2 border-ink-200 pl-6">
          {entries.map((entry, index) => (
            <li key={entry.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-white",
                  index === 0 ? "bg-ink-900" : "bg-ink-200",
                )}
                aria-hidden="true"
              />
              <p
                className={cn(
                  "mb-1 text-sm font-semibold",
                  index === 0 ? "text-ink-900" : "text-ink-600",
                )}
              >
                {formatAuditTimestamp(entry.createdAt)}
              </p>
              <h4 className="font-semibold text-ink-900">
                {entry.actorName} {entry.action}
              </h4>
              <p className="mt-1 text-sm text-ink-600">
                {AUDIT_ACTION_LABELS[entry.actionType]}
                {entry.entityLabel ? ` · ${entry.entityLabel}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
