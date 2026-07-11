import { FilePenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DRAFT_STATUS_LABELS, RECENT_DRAFTS } from "@/features/admin/data";

/** Panel listing the most recently edited unpublished content. */
export function RecentDrafts() {
  return (
    <Card className="rounded-3xl p-6">
      <CardHeader
        title="Recent Drafts"
        icon={<FilePenLine className="h-5 w-5 text-ink-500" aria-hidden="true" />}
        action={
          <button
            type="button"
            className="text-sm font-semibold text-brand-700 transition-colors hover:text-ink-900"
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
              className="group flex items-start justify-between gap-4 rounded-2xl border border-transparent p-3 text-left transition-colors hover:border-ink-200 hover:bg-ink-50"
            >
              <span className="flex items-start gap-4">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100">
                  <Icon className="h-4 w-4 text-ink-600" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold text-ink-900 transition-colors group-hover:text-ink-900">
                    {draft.title}
                  </span>
                  <span className="block text-sm text-ink-600">{draft.editedLabel}</span>
                </span>
              </span>
              <Badge
                variant={draft.status === "draft" ? "soft" : "neutral"}
                className="shrink-0 normal-case tracking-normal"
              >
                {DRAFT_STATUS_LABELS[draft.status]}
              </Badge>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
