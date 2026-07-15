import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import type { AuditEntry } from "@/types";

interface PublishingActivityProps {
  entries: AuditEntry[];
}

/** Timeline of recent publish/update events on the public portal, from the audit log. */
export function PublishingActivity({ entries }: PublishingActivityProps) {
  return (
    <Card className="rounded-3xl p-6">
      <CardHeader
        title="Publishing Activity"
        icon={<History className="h-5 w-5 text-ink-500" aria-hidden="true" />}
        action={
          <button
            type="button"
            className="text-sm font-semibold text-brand-700 transition-colors hover:text-ink-900"
          >
            Filter
          </button>
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
                {formatDate(entry.createdAt.slice(0, 10))}
              </p>
              <h4 className="font-semibold text-ink-900">
                {entry.actorName} {entry.action}
              </h4>
              {entry.detail ? <p className="mt-1 text-sm text-ink-600">{entry.detail}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
