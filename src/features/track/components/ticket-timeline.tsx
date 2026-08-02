"use client";

import { MotionConfig, motion } from "motion/react";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { TicketKind, TicketLookupResult, TicketStatus, TicketUpdateEntry } from "@/types";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { riseVariants, staggerContainer } from "@/lib/motion";
import { isTerminalStatus, statusEntryCopy } from "@/lib/ticket-updates";

interface Step {
  title: string;
  detail: string;
  date: string | null;
  state: "done" | "current" | "todo" | "failed";
}

const NEGATIVE_STATUSES: TicketStatus[] = ["rejected", "declined", "dismissed"];

/** The step still ahead of a non-terminal ticket. Null once nothing is ahead. */
const NEXT_STEP: Record<TicketKind, Partial<Record<TicketStatus, { title: string; detail: string }>>> = {
  application: {
    pending: { title: "Review", detail: "Barangay staff will review your request." },
    "under-review": { title: "Decision", detail: "Barangay staff are reviewing your request." },
    "awaiting-info": { title: "Waiting for you", detail: "Send what the barangay asked for to continue." },
    approved: { title: "Released", detail: "Bring a valid ID to the barangay hall to claim your document." },
  },
  appointment: {
    pending: { title: "Confirmation", detail: "Barangay staff are checking the schedule you asked for." },
    "under-review": { title: "Confirmation", detail: "Barangay staff are checking the schedule you asked for." },
    "awaiting-info": { title: "Waiting for you", detail: "Send what the barangay asked for to continue." },
    confirmed: { title: "Completed", detail: "Come to the barangay hall at your scheduled time." },
  },
  complaint: {
    received: { title: "Review", detail: "Your report is waiting for review." },
    "under-review": { title: "Resolution", detail: "Barangay staff will contact you about mediation." },
    "awaiting-info": { title: "Waiting for you", detail: "Send what the barangay asked for to continue." },
  },
  assistance: {
    pending: { title: "Review", detail: "Your request is waiting for review." },
    "under-review": { title: "Decision", detail: "The Barangay Social Welfare Desk will contact you with a decision." },
    "awaiting-info": { title: "Waiting for you", detail: "Send what the barangay asked for to continue." },
  },
};

function entryStep(kind: TicketKind, item: TicketUpdateEntry): Step {
  if (item.entryType === "resident-reply") {
    const files =
      item.attachmentCount === 0
        ? ""
        : ` (${item.attachmentCount} ${item.attachmentCount === 1 ? "file" : "files"} attached)`;
    return {
      title: "Your reply",
      detail: `${item.body}${files}`,
      date: item.createdAt,
      state: "done",
    };
  }

  if (item.entryType !== "status") {
    return {
      title: "Update from the barangay",
      detail: item.body,
      date: item.createdAt,
      state: "done",
    };
  }

  const copy = statusEntryCopy(kind, item.status ?? "pending");
  const failed = item.status !== null && NEGATIVE_STATUSES.includes(item.status);
  return {
    title: copy.title,
    detail: item.body || copy.detail,
    date: item.createdAt,
    state: failed ? "failed" : "done",
  };
}

/**
 * The timeline: every resident-visible log entry in order, plus at most ONE
 * greyed step for what is still ahead.
 *
 * A pure log would lose the resident's sense of what happens next; the old
 * fixed three-step diagram lost everything that happened in between. One
 * trailing derived step is the smallest thing that keeps both.
 *
 * Exported for tests/unit/ticket-timeline.test.ts — it is the only pure logic
 * on the public tracking page.
 */
export function buildSteps(ticket: TicketLookupResult): Step[] {
  const steps = ticket.timeline.map((item) => entryStep(ticket.kind, item));

  if (!isTerminalStatus(ticket.kind, ticket.status)) {
    const next = NEXT_STEP[ticket.kind][ticket.status];
    if (next) steps.push({ ...next, date: null, state: "todo" });
  }

  return steps;
}

/** Resident-facing status timeline for a ticket. */
export function TicketTimeline({ ticket }: { ticket: TicketLookupResult }) {
  const steps = buildSteps(ticket);

  return (
    <MotionConfig reducedMotion="user">
      <motion.ol variants={staggerContainer(0.12)} initial="hidden" animate="visible">
        {steps.map((step, index) => {
          const Icon = step.state === "failed" ? XCircle : step.state === "done" ? CheckCircle2 : Circle;
          const isLast = index === steps.length - 1;
          return (
            <motion.li
              key={`${step.title}-${index}`}
              variants={riseVariants}
              className={cn("relative flex gap-4", !isLast && "pb-6")}
            >
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
            </motion.li>
          );
        })}
      </motion.ol>
    </MotionConfig>
  );
}
