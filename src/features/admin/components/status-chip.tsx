import type { AdminStatus } from "@/types";
import { cn } from "@/lib/utils";

const LABELS: Record<AdminStatus, string> = {
  published: "Published",
  scheduled: "Scheduled",
  draft: "Draft",
  "in-review": "In Review",
  active: "Active",
  inactive: "Inactive",
  "under-review": "Under Review",
  archived: "Archived",
  planning: "Planning",
};

const TONES: Record<AdminStatus, string> = {
  published: "bg-brand-100 text-brand-800",
  active: "bg-brand-100 text-brand-800",
  scheduled: "bg-ink-100 text-ink-700",
  draft: "bg-ink-100 text-ink-600",
  planning: "bg-ink-100 text-ink-600",
  "in-review": "bg-danger-soft text-danger-soft-fg",
  "under-review": "bg-danger-soft text-danger-soft-fg",
  inactive: "bg-ink-100 text-ink-500",
  archived: "bg-ink-100 text-ink-500",
};

interface StatusChipProps {
  status: AdminStatus;
  className?: string;
}

/** Soft tinted status pill with a leading dot; one tone map for every admin status. */
export function StatusChip({ status, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold",
        TONES[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
