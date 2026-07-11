import { FilePenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DRAFT_STATUS_LABELS, RECENT_DRAFTS } from "@/features/admin/data";

/** Panel listing the most recently edited unpublished content. */
export function RecentDrafts() {
  return (
    <Card className="rounded-xl p-6">
      <CardHeader
        title="Recent Drafts"
        icon={<FilePenLine className="h-5 w-5 text-outline" aria-hidden="true" />}
        action={
          <button
            type="button"
            className="text-sm font-semibold text-secondary transition-colors hover:text-primary"
          >
            View All
          </button>
        }
      />
      <div className="flex flex-col gap-3">
        {RECENT_DRAFTS.map((draft) => {
          const Icon = draft.icon;
          return (
            <button
              key={draft.title}
              type="button"
              className="group flex items-start justify-between gap-4 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-line hover:bg-surface-low"
            >
              <span className="flex items-start gap-4">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-mid">
                  <Icon className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold text-ink transition-colors group-hover:text-primary">
                    {draft.title}
                  </span>
                  <span className="block text-sm text-ink-muted">{draft.editedLabel}</span>
                </span>
              </span>
              <Badge variant="neutral" className="shrink-0 normal-case tracking-normal">
                {DRAFT_STATUS_LABELS[draft.status]}
              </Badge>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
