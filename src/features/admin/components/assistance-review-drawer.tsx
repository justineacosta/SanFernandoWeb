"use client";

import { useState } from "react";
import type { AdminTicketUpdate, AssistanceDecisionValues, AssistanceReviewValues, AssistanceRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { formatDate } from "@/lib/format";
import { StatusChip } from "./status-chip";
import { TicketTimelinePanel } from "./ticket-timeline-panel";

interface AssistanceReviewDrawerProps {
  record: AssistanceRow;
  onReview: (id: string, values: AssistanceReviewValues) => void;
  onDecide: (id: string, values: AssistanceDecisionValues) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDismissError: () => void;
  updates: AdminTicketUpdate[];
  onPosted: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{value}</dd>
    </div>
  );
}

/** Full request; take up/decline a pending row, grant/decline one under review. */
export function AssistanceReviewDrawer({
  record,
  onReview,
  onDecide,
  onCancel,
  saving,
  error,
  onDismissError,
  updates,
  onPosted,
}: AssistanceReviewDrawerProps) {
  const [remarks, setRemarks] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const dismissError = () => {
    setLocalError(null);
    onDismissError();
  };

  const submitReview = (status: AssistanceReviewValues["status"]) => {
    if (status === "declined" && !remarks.trim()) {
      setLocalError("Remarks are required when declining a request.");
      return;
    }
    setLocalError(null);
    onReview(record.id, { status, remarks: remarks.trim() });
  };

  const submitDecide = (status: AssistanceDecisionValues["status"]) => {
    if (status === "declined" && !remarks.trim()) {
      setLocalError("Remarks are required when declining a request.");
      return;
    }
    setLocalError(null);
    onDecide(record.id, { status, remarks: remarks.trim() });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink-900">{record.ticketNo}</p>
          <StatusChip status={record.status} />
        </div>
        <dl className="space-y-4">
          <DetailRow label="Resident" value={`${record.firstName} ${record.lastName}`} />
          <DetailRow label="Contact Number" value={record.contactNumber} />
          {record.email ? <DetailRow label="Email" value={record.email} /> : null}
          <DetailRow label="Address" value={record.address} />
          <DetailRow label="Category" value={record.categoryLabel} />
          <DetailRow label="Date Filed" value={formatDate(record.submittedAt)} />
          <DetailRow label="Filed" value={record.source === "walk-in" ? "Walk-in (encoded)" : "Online"} />
        </dl>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Their Situation
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{record.details}</p>
        </div>
        {record.status === "pending" ? (
          <Field label="Remarks" htmlFor="assistance-remarks">
            <Textarea
              id="assistance-remarks"
              rows={4}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional when taking it up; required when declining."
              aria-invalid={Boolean(localError)}
            />
          </Field>
        ) : record.status === "under-review" ? (
          <Field label="Remarks" htmlFor="assistance-remarks">
            <Textarea
              id="assistance-remarks"
              rows={4}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional when granting; required when declining."
              aria-invalid={Boolean(localError)}
            />
          </Field>
        ) : (
          <div className="rounded-2xl border border-ink-200/70 bg-ink-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Review Summary
            </p>
            <p className="mt-2 text-sm text-ink-900">{record.remarks ?? "—"}</p>
            {record.reviewedByName && record.reviewedAt ? (
              <p className="mt-2 text-sm text-ink-600">
                Reviewed by {record.reviewedByName} on {formatDate(record.reviewedAt)}
              </p>
            ) : null}
            {record.decidedByName && record.decidedAt ? (
              <p className="mt-1 text-sm text-ink-600">
                Decided by {record.decidedByName} on {formatDate(record.decidedAt)}
              </p>
            ) : null}
          </div>
        )}
        {(localError ?? error) ? (
          <InlineAlert message={localError ?? error!} onDismiss={dismissError} />
        ) : null}
        <TicketTimelinePanel
          kind="assistance"
          ticketId={record.id}
          updates={updates}
          hasEmail={Boolean(record.email)}
          canPost={record.status !== "granted" && record.status !== "declined"}
          onPosted={onPosted}
        />
      </div>
      {record.status === "pending" ? (
        <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
          <Button variant="outline-danger" onClick={() => submitReview("declined")} disabled={saving}>
            Decline
          </Button>
          <Button onClick={() => submitReview("under-review")} disabled={saving}>
            {saving ? "Saving…" : "Take up for review"}
          </Button>
        </div>
      ) : record.status === "under-review" ? (
        <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
          <Button variant="outline-danger" onClick={() => submitDecide("declined")} disabled={saving}>
            Decline
          </Button>
          <Button onClick={() => submitDecide("granted")} disabled={saving}>
            {saving ? "Saving…" : "Grant request"}
          </Button>
        </div>
      ) : (
        <div className="flex justify-end border-t border-ink-200/70 p-6">
          <Button variant="ghost" onClick={onCancel}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
