"use client";

import { useState } from "react";
import type { AdminApplicationRecord, ApplicationReviewValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { certificateTitle } from "@/features/admin/data";
import { StatusChip } from "./status-chip";

interface ApplicationReviewDrawerProps {
  record: AdminApplicationRecord;
  onReview: (id: string, values: ApplicationReviewValues) => void;
  onCancel: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{value}</dd>
    </div>
  );
}

/** Full application submission; approve/reject with remarks on pending rows (mock review). */
export function ApplicationReviewDrawer({
  record,
  onReview,
  onCancel,
}: ApplicationReviewDrawerProps) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ApplicationReviewValues["status"] | null>(null);

  const submit = (status: ApplicationReviewValues["status"]) => {
    if (status === "rejected" && !remarks.trim()) {
      setError("Remarks are required when rejecting an application.");
      return;
    }
    setError(null);
    setSaving(status);
    setTimeout(() => {
      setSaving(null);
      onReview(record.id, { status, remarks: remarks.trim() });
    }, 600);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink-900">{record.referenceNo}</p>
          <StatusChip status={record.status} />
        </div>
        <dl className="space-y-4">
          <DetailRow label="Applicant" value={record.applicantName} />
          <DetailRow label="Contact Number" value={record.contactNumber} />
          {record.email ? <DetailRow label="Email" value={record.email} /> : null}
          <DetailRow label="Address" value={record.address} />
          <DetailRow label="Certificate Type" value={certificateTitle(record.serviceId)} />
          <DetailRow label="Purpose" value={record.purpose} />
          <DetailRow label="Date Applied" value={formatDate(record.dateApplied)} />
        </dl>
        {record.status === "pending" ? (
          <Field label="Remarks" htmlFor="application-remarks">
            <Textarea
              id="application-remarks"
              rows={4}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional for approval; required when rejecting."
              aria-invalid={Boolean(error)}
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </Field>
        ) : (
          <div className="rounded-2xl border border-ink-200/70 bg-ink-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Review Summary
            </p>
            <p className="mt-2 text-sm text-ink-900">{record.remarks ?? "—"}</p>
            {record.reviewedBy && record.reviewedAt ? (
              <p className="mt-2 text-sm text-ink-600">
                Reviewed by {record.reviewedBy} on {formatDate(record.reviewedAt)}
              </p>
            ) : null}
          </div>
        )}
      </div>
      {record.status === "pending" ? (
        <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
          <Button
            variant="outline-danger"
            onClick={() => submit("rejected")}
            disabled={saving !== null}
          >
            {saving === "rejected" ? "Rejecting…" : "Reject"}
          </Button>
          <Button onClick={() => submit("approved")} disabled={saving !== null}>
            {saving === "approved" ? "Approving…" : "Approve"}
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
