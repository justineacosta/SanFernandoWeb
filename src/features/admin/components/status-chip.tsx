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
  "awaiting-info": "Awaiting Information",
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
  // Live / positive-terminal → the success pair (green landed with the overhaul).
  published: "bg-success-soft text-success",
  active: "bg-success-soft text-success",
  released: "bg-success-soft text-success",
  completed: "bg-success-soft text-success",
  resolved: "bg-success-soft text-success",
  granted: "bg-success-soft text-success",
  // Answering is the inbox's terminal success; it sits with the other four.
  answered: "bg-success-soft text-success",
  // Stage-1 positives — approved but not yet terminal.
  approved: "bg-brand-100 text-brand-800",
  confirmed: "bg-brand-100 text-brand-800",
  // Attention states are amber, not red: review is workflow, not danger.
  "in-review": "bg-brand-100 text-brand-800",
  "under-review": "bg-brand-100 text-brand-800",
  // Blocked on the resident. Waiting is workflow, not danger — amber, like review.
  "awaiting-info": "bg-brand-100 text-brand-800",
  in_progress: "bg-brand-100 text-brand-800",
  // True negatives keep danger.
  rejected: "bg-danger-soft text-danger-soft-fg",
  declined: "bg-danger-soft text-danger-soft-fg",
  dismissed: "bg-danger-soft text-danger-soft-fg",
  scheduled: "bg-ink-100 text-ink-700",
  pending: "bg-ink-100 text-ink-700",
  // Untouched intake, like `pending`.
  received: "bg-ink-100 text-ink-700",
  new: "bg-ink-100 text-ink-700",
  draft: "bg-ink-100 text-ink-600",
  planning: "bg-ink-100 text-ink-600",
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
