import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { TicketLookupResult } from "@/types";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

interface Step {
  title: string;
  detail: string;
  date: string | null;
  state: "done" | "current" | "todo" | "failed";
}

function buildSteps(ticket: TicketLookupResult): Step[] {
  const rejected = ticket.status === "rejected";
  const reviewed = ticket.status !== "pending";
  const released = ticket.status === "released";

  return [
    {
      title: "Received",
      detail: "Your request reached the barangay office.",
      date: ticket.submittedAt,
      state: "done",
    },
    {
      title: rejected ? "Not approved" : "Reviewed",
      detail: rejected
        ? (ticket.remarks ?? "This request was not approved.")
        : reviewed
          ? "Approved — your document is ready to claim."
          : "Barangay staff are reviewing your request.",
      date: ticket.reviewedAt,
      state: rejected ? "failed" : reviewed ? "done" : "current",
    },
    ...(rejected
      ? []
      : [
          {
            title: "Released",
            detail: released
              ? "Claimed at the barangay hall."
              : "Bring a valid ID to the barangay hall to claim your document.",
            date: ticket.releasedAt,
            state: released ? ("done" as const) : ("todo" as const),
          },
        ]),
  ];
}

/** Resident-facing status timeline for a ticket. */
export function TicketTimeline({ ticket }: { ticket: TicketLookupResult }) {
  const steps = buildSteps(ticket);

  return (
    <ol className="space-y-6">
      {steps.map((step) => {
        const Icon = step.state === "failed" ? XCircle : step.state === "done" ? CheckCircle2 : Circle;
        return (
          <li key={step.title} className="flex gap-4">
            <Icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                step.state === "failed" && "text-danger",
                step.state === "done" && "text-brand-500",
                step.state === "current" && "text-brand-400",
                step.state === "todo" && "text-ink-300",
              )}
              aria-hidden="true"
            />
            <div>
              <p
                className={cn(
                  "font-semibold",
                  step.state === "todo" ? "text-ink-400" : "text-ink-900",
                )}
              >
                {step.title}
                {step.date ? (
                  <span className="ml-2 text-xs font-medium text-ink-500">
                    {formatDate(step.date)}
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-ink-600">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
