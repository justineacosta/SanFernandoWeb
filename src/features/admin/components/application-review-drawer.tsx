"use client";

import { useState } from "react";
import type { ApplicationReviewValues, ApplicationRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { StatusChip } from "./status-chip";

interface ApplicationReviewDrawerProps {
  record: ApplicationRow;
  onReview: (id: string, values: ApplicationReviewValues) => void;
  onRelease: (id: string) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{value}</dd>
    </div>
  );
}

/** Full submission; approve/reject a pending row, release an approved one. */
export function ApplicationReviewDrawer({
  record,
  onReview,
  onRelease,
  onCancel,
  saving,
  error,
}: ApplicationReviewDrawerProps) {
  const [remarks, setRemarks] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (status: ApplicationReviewValues["status"]) => {
    if (status === "rejected" && !remarks.trim()) {
      setLocalError("Remarks are required when rejecting an application.");
      return;
    }
    setLocalError(null);
    onReview(record.id, { status, remarks: remarks.trim() });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink-900">{record.ticketNo}</p>
          <StatusChip status={record.status} />
        </div>
        <dl className="space-y-4">
          <DetailRow label="Applicant" value={`${record.firstName} ${record.lastName}`} />
          <DetailRow label="Contact Number" value={record.contactNumber} />
          {record.email ? <DetailRow label="Email" value={record.email} /> : null}
          <DetailRow label="Address" value={record.address} />
          <DetailRow label="Document Type" value={record.serviceTitle} />
          <DetailRow label="Purpose" value={record.purpose} />
          <DetailRow label="Date Applied" value={formatDate(record.submittedAt)} />
          <DetailRow label="Filed" value={record.source === "walk-in" ? "Walk-in (encoded)" : "Online"} />
        </dl>
        {record.status === "pending" ? (
          <Field label="Remarks" htmlFor="application-remarks">
            <Textarea
              id="application-remarks"
              rows={4}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional for approval; required when rejecting."
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
            {record.releasedByName && record.releasedAt ? (
              <p className="mt-1 text-sm text-ink-600">
                Released by {record.releasedByName} on {formatDate(record.releasedAt)}
              </p>
            ) : null}
          </div>
        )}
        {(localError ?? error) ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {localError ?? error}
          </p>
        ) : null}
      </div>
      {record.status === "pending" ? (
        <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
          <Button variant="outline-danger" onClick={() => submit("rejected")} disabled={saving}>
            Reject
          </Button>
          <Button onClick={() => submit("approved")} disabled={saving}>
            {saving ? "Saving…" : "Approve"}
          </Button>
        </div>
      ) : record.status === "approved" ? (
        <div className="flex items-center justify-between gap-3 border-t border-ink-200/70 p-6">
          <p className="text-xs text-ink-500">Ready for pickup.</p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onCancel}>
              Close
            </Button>
            <Button onClick={() => onRelease(record.id)} disabled={saving}>
              {saving ? "Saving…" : "Mark as released"}
            </Button>
          </div>
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
