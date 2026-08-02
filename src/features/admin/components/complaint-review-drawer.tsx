"use client";

import { useState } from "react";
import type { AdminTicketUpdate, ComplaintCloseValues, ComplaintReviewValues, ComplaintRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { formatDate } from "@/lib/format";
import { StatusChip } from "./status-chip";
import { TicketTimelinePanel } from "./ticket-timeline-panel";

/**
 * Mirrors `closeComplaint`'s `.in("status", [...])` guard exactly.
 *
 * `awaiting-info` belongs here, not with the `received` triage branch above it:
 * design §1 requires that staff can close a report the resident never answered.
 * Until the whole-branch review caught this, a complaint parked on
 * `awaiting-info` had no resolve/dismiss buttons at all, so an unanswered
 * report could never be closed.
 */
const CLOSABLE: ComplaintRow["status"][] = ["under-review", "awaiting-info"];

interface ComplaintReviewDrawerProps {
  record: ComplaintRow;
  onReview: (id: string, values: ComplaintReviewValues) => void;
  onClose: (id: string, values: ComplaintCloseValues) => void;
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

/** Full report; take up/dismiss a received row, resolve/dismiss one under mediation. */
export function ComplaintReviewDrawer({
  record,
  onReview,
  onClose,
  onCancel,
  saving,
  error,
  onDismissError,
  updates,
  onPosted,
}: ComplaintReviewDrawerProps) {
  const [remarks, setRemarks] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const dismissError = () => {
    setLocalError(null);
    onDismissError();
  };

  const submitReview = (status: ComplaintReviewValues["status"]) => {
    if (status === "dismissed" && !remarks.trim()) {
      setLocalError("Remarks are required when dismissing a report.");
      return;
    }
    setLocalError(null);
    onReview(record.id, { status, remarks: remarks.trim() });
  };

  const submitClose = (status: ComplaintCloseValues["status"]) => {
    if (status === "dismissed" && !remarks.trim()) {
      setLocalError("Remarks are required when dismissing a report.");
      return;
    }
    setLocalError(null);
    onClose(record.id, { status, remarks: remarks.trim() });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink-900">{record.ticketNo}</p>
          <StatusChip status={record.status} />
        </div>
        <dl className="space-y-4">
          <DetailRow label="Complainant" value={`${record.firstName} ${record.lastName}`} />
          <DetailRow label="Contact Number" value={record.contactNumber} />
          {record.email ? <DetailRow label="Email" value={record.email} /> : null}
          <DetailRow label="Address" value={record.address} />
          <DetailRow
            label="Person Complained About"
            value={record.respondent ?? "Not named"}
          />
          <DetailRow label="Date of Incident" value={formatDate(record.incidentDate)} />
          <DetailRow label="Where It Happened" value={record.location} />
          <DetailRow label="Date Filed" value={formatDate(record.submittedAt)} />
          <DetailRow label="Filed" value={record.source === "walk-in" ? "Walk-in (encoded)" : "Online"} />
        </dl>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            What Happened
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{record.narrative}</p>
        </div>
        {record.status === "received" ? (
          <Field label="Remarks" htmlFor="complaint-remarks">
            <Textarea
              id="complaint-remarks"
              rows={4}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional when taking it up; required when dismissing."
              aria-invalid={Boolean(localError)}
            />
          </Field>
        ) : CLOSABLE.includes(record.status) ? (
          <Field label="Remarks" htmlFor="complaint-remarks">
            <Textarea
              id="complaint-remarks"
              rows={4}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional when resolving; required when dismissing."
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
            {record.closedByName && record.closedAt ? (
              <p className="mt-1 text-sm text-ink-600">
                Closed by {record.closedByName} on {formatDate(record.closedAt)}
              </p>
            ) : null}
          </div>
        )}
        {(localError ?? error) ? (
          <InlineAlert message={localError ?? error!} onDismiss={dismissError} />
        ) : null}
        <TicketTimelinePanel
          kind="complaint"
          ticketId={record.id}
          updates={updates}
          hasEmail={Boolean(record.email)}
          canPost={record.status !== "resolved" && record.status !== "dismissed"}
          onPosted={onPosted}
        />
      </div>
      {record.status === "received" ? (
        <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
          <Button variant="outline-danger" onClick={() => submitReview("dismissed")} disabled={saving}>
            Dismiss
          </Button>
          <Button onClick={() => submitReview("under-review")} disabled={saving}>
            {saving ? "Saving…" : "Take up for mediation"}
          </Button>
        </div>
      ) : CLOSABLE.includes(record.status) ? (
        <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
          <Button variant="outline-danger" onClick={() => submitClose("dismissed")} disabled={saving}>
            Dismiss
          </Button>
          <Button onClick={() => submitClose("resolved")} disabled={saving}>
            {saving ? "Saving…" : "Mark resolved"}
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
