import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { TicketKind, TicketLookupResult, TicketStatus } from "@/types";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

interface Step {
  title: string;
  detail: string;
  date: string | null;
  state: "done" | "current" | "todo" | "failed";
}

const NEGATIVE_STATUSES: TicketStatus[] = ["rejected", "declined", "dismissed"];
const INITIAL_STATUSES: TicketStatus[] = ["pending", "received"];
const FINAL_STATUSES: TicketStatus[] = ["released", "completed", "resolved", "granted"];

interface StageCopy {
  title: string;
  failedTitle: string;
  doneDetail: string;
  failedDetail: string;
  /** Shown while this stage is still ahead of the ticket. */
  waitingDetail: string;
}

/** Every flow is Received → stage 1 → stage 2; only the words differ. */
const COPY: Record<TicketKind, { stage1: StageCopy; stage2: StageCopy }> = {
  application: {
    stage1: {
      title: "Reviewed",
      failedTitle: "Not approved",
      doneDetail: "Approved by barangay staff.",
      failedDetail: "This request was not approved.",
      waitingDetail: "Barangay staff are reviewing your request.",
    },
    stage2: {
      title: "Released",
      failedTitle: "Closed",
      doneDetail: "Claimed at the barangay hall.",
      failedDetail: "This request was closed.",
      waitingDetail: "Bring a valid ID to the barangay hall to claim your document.",
    },
  },
  appointment: {
    stage1: {
      title: "Confirmed",
      failedTitle: "Declined",
      doneDetail: "Barangay staff confirmed your schedule.",
      failedDetail: "This appointment was not granted.",
      waitingDetail: "Barangay staff are checking the schedule you asked for.",
    },
    stage2: {
      title: "Completed",
      failedTitle: "Closed",
      doneDetail: "Thank you for coming in.",
      failedDetail: "This appointment was closed.",
      waitingDetail: "Once confirmed, come to the barangay hall at your scheduled time.",
    },
  },
  complaint: {
    stage1: {
      title: "Under review",
      failedTitle: "Dismissed",
      doneDetail: "The Lupong Tagapamayapa is looking into your report.",
      failedDetail: "This report was not taken up.",
      waitingDetail: "Your report is waiting for review.",
    },
    stage2: {
      title: "Resolved",
      failedTitle: "Dismissed",
      doneDetail: "This report has been settled.",
      failedDetail: "This report was closed without a settlement.",
      waitingDetail: "Barangay staff will contact you about mediation.",
    },
  },
  assistance: {
    stage1: {
      title: "Under review",
      failedTitle: "Declined",
      doneDetail: "The Barangay Social Welfare Desk is assessing your request.",
      failedDetail: "This request was not granted.",
      waitingDetail: "Your request is waiting for review.",
    },
    stage2: {
      title: "Granted",
      failedTitle: "Declined",
      doneDetail: "Your request was granted — barangay staff will contact you.",
      failedDetail: "This request was not granted.",
      waitingDetail: "The Barangay Social Welfare Desk will contact you with a decision.",
    },
  },
};

function buildSteps(ticket: TicketLookupResult): Step[] {
  const copy = COPY[ticket.kind];
  const negative = NEGATIVE_STATUSES.includes(ticket.status);
  const initial = INITIAL_STATUSES.includes(ticket.status);
  const final = FINAL_STATUSES.includes(ticket.status);
  // Complaints and assistance can go negative at either stage; closedAt is what
  // tells them apart. Applications and appointments only ever fail at stage 1,
  // where their stage-2 actions guard on the positive stage-1 status.
  const failedAtStage1 = negative && ticket.closedAt === null;
  const failedAtStage2 = negative && ticket.closedAt !== null;

  const steps: Step[] = [
    {
      title: "Received",
      detail: "Your request reached the barangay office.",
      date: ticket.submittedAt,
      state: "done",
    },
    {
      title: failedAtStage1 ? copy.stage1.failedTitle : copy.stage1.title,
      detail: failedAtStage1
        ? (ticket.remarks ?? copy.stage1.failedDetail)
        : initial
          ? copy.stage1.waitingDetail
          : copy.stage1.doneDetail,
      date: ticket.reviewedAt,
      state: failedAtStage1 ? "failed" : initial ? "current" : "done",
    },
  ];

  // A ticket rejected on receipt has no third step — there is nothing ahead.
  if (failedAtStage1) return steps;

  steps.push({
    title: failedAtStage2 ? copy.stage2.failedTitle : copy.stage2.title,
    detail: failedAtStage2
      ? (ticket.remarks ?? copy.stage2.failedDetail)
      : final
        ? copy.stage2.doneDetail
        : copy.stage2.waitingDetail,
    date: ticket.closedAt,
    state: failedAtStage2 ? "failed" : final ? "done" : "todo",
  });

  return steps;
}

/** Resident-facing status timeline for a ticket. */
export function TicketTimeline({ ticket }: { ticket: TicketLookupResult }) {
  const steps = buildSteps(ticket);

  return (
    <ol>
      {steps.map((step, index) => {
        const Icon = step.state === "failed" ? XCircle : step.state === "done" ? CheckCircle2 : Circle;
        const isLast = index === steps.length - 1;
        return (
          <li key={step.title} className={cn("relative flex gap-4", !isLast && "pb-6")}>
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bottom-0 left-[9px] top-6 w-0.5",
                  step.state === "done" ? "bg-brand-200" : "bg-ink-200",
                )}
              />
            ) : null}
            <Icon
              className={cn(
                "relative mt-0.5 h-5 w-5 shrink-0 bg-white",
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
                  <span className="ml-2 text-xs font-medium tabular-nums text-ink-500">
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
