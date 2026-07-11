import Link from "next/link";
import { ExternalLink, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { PUBLISHING_ACTIVITY } from "@/features/admin/data";

/** Timeline of recent publish/update events on the public portal. */
export function PublishingActivity() {
  return (
    <Card className="rounded-xl p-6">
      <CardHeader
        title="Publishing Activity"
        icon={<History className="h-5 w-5 text-outline" aria-hidden="true" />}
        action={
          <button
            type="button"
            className="text-sm font-semibold text-secondary transition-colors hover:text-primary"
          >
            Filter
          </button>
        }
      />
      <ol className="relative ml-2 mt-2 space-y-6 border-l-2 border-surface-highest pl-6">
        {PUBLISHING_ACTIVITY.map((entry) => (
          <li key={entry.title} className="relative">
            <span
              className={cn(
                "absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-white",
                entry.highlight ? "bg-primary" : "bg-line",
              )}
              aria-hidden="true"
            />
            <p
              className={cn(
                "mb-1 text-sm font-semibold",
                entry.highlight ? "text-primary" : "text-ink-muted",
              )}
            >
              {entry.dateLabel}
            </p>
            <h4 className="font-semibold text-ink">{entry.title}</h4>
            <p className="mt-1 text-sm text-ink-muted">{entry.description}</p>
            {entry.liveHref ? (
              <Link
                href={entry.liveHref}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-secondary hover:underline"
              >
                View live page <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
