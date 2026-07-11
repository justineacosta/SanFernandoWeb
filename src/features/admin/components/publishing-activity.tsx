import Link from "next/link";
import { ExternalLink, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { PUBLISHING_ACTIVITY } from "@/features/admin/data";

/** Timeline of recent publish/update events on the public portal. */
export function PublishingActivity() {
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
      <ol className="relative ml-2 mt-2 space-y-6 border-l-2 border-ink-200 pl-6">
        {PUBLISHING_ACTIVITY.map((entry) => (
          <li key={entry.title} className="relative">
            <span
              className={cn(
                "absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-white",
                entry.highlight ? "bg-ink-900" : "bg-ink-200",
              )}
              aria-hidden="true"
            />
            <p
              className={cn(
                "mb-1 text-sm font-semibold",
                entry.highlight ? "text-ink-900" : "text-ink-600",
              )}
            >
              {entry.dateLabel}
            </p>
            <h4 className="font-semibold text-ink-900">{entry.title}</h4>
            <p className="mt-1 text-sm text-ink-600">{entry.description}</p>
            {entry.liveHref ? (
              <Link
                href={entry.liveHref}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
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
