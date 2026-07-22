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
  pending: "Pending",
  approved: "Approved",
  released: "Released",
  rejected: "Rejected",
  confirmed: "Confirmed",
  completed: "Completed",
  declined: "Declined",
  received: "Received",
  resolved: "Resolved",
  dismissed: "Dismissed",
  granted: "Granted",
  new: "New",
  in_progress: "In Progress",
  answered: "Answered",
  closed: "Closed",
};

const TONES: Record<AdminStatus, string> = {
  published: "bg-brand-100 text-brand-800",
  active: "bg-brand-100 text-brand-800",
  approved: "bg-brand-100 text-brand-800",
  // Stage-1 positives sit with `approved`; terminal successes are the deeper
  // amber `released` already uses (there is no green token).
  confirmed: "bg-brand-100 text-brand-800",
  // Terminal success — a deeper amber than `approved` (there is no green token).
  released: "bg-brand-200 text-brand-800",
  completed: "bg-brand-200 text-brand-800",
  resolved: "bg-brand-200 text-brand-800",
  granted: "bg-brand-200 text-brand-800",
  // Answering is the inbox's terminal success; it sits with the other four.
  answered: "bg-brand-200 text-brand-800",
  scheduled: "bg-ink-100 text-ink-700",
  pending: "bg-ink-100 text-ink-700",
  // Untouched intake, like `pending`.
  received: "bg-ink-100 text-ink-700",
  new: "bg-ink-100 text-ink-700",
  in_progress: "bg-danger-soft text-danger-soft-fg",
  draft: "bg-ink-100 text-ink-600",
  planning: "bg-ink-100 text-ink-600",
  "in-review": "bg-danger-soft text-danger-soft-fg",
  "under-review": "bg-danger-soft text-danger-soft-fg",
  rejected: "bg-danger-soft text-danger-soft-fg",
  declined: "bg-danger-soft text-danger-soft-fg",
  dismissed: "bg-danger-soft text-danger-soft-fg",
  inactive: "bg-ink-100 text-ink-500",
  archived: "bg-ink-100 text-ink-500",
  // Closed without a reply — spam, or a duplicate. Not a success.
  closed: "bg-ink-100 text-ink-500",
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
