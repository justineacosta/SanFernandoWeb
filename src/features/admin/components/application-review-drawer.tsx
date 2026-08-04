"use client";

import { useState } from "react";
import type { AdminTicketUpdate, ApplicationReviewValues, ApplicationRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { formatDate } from "@/lib/format";
import { StatusChip } from "./status-chip";
import { TicketTimelinePanel } from "./ticket-timeline-panel";

/**
 * Mirrors `reviewApplication`'s `.in("status", [...])` guard exactly.
 *
 * These must stay in step: the timeline composer can move a ticket to
 * `under-review` or `awaiting-info` from here, and the composer offers no way
 * back to `pending`. Gating the decision buttons on `pending` alone — as this
 * drawer did until the whole-branch review caught it — left every ticket the
 * composer touched permanently un-approvable and un-rejectable.
 */
const DECIDABLE: ApplicationRow["status"][] = ["pending", "under-review", "awaiting-info"];

interface ApplicationReviewDrawerProps {
  record: ApplicationRow;
  onReview: (id: string, values: ApplicationReviewValues) => void;
  onRelease: (id: string) => void;
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

/** Full submission; approve/reject a pending row, release an approved one. */
export function ApplicationReviewDrawer({
  record,
  onReview,
  onRelease,
  onCancel,
  saving,
  error,
  onDismissError,
  updates,
  onPosted,
}: ApplicationReviewDrawerProps) {
  const [remarks, setRemarks] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const dismissError = () => {
    setLocalError(null);
    onDismissError();
  };

  // Remarks are optional on every decision, including a rejection — the server
  // schema dropped the matching refine on 2026-08-05. A rejection sent with no
  // remarks reaches the resident with no reason attached, by design.
  const submit = (status: ApplicationReviewValues["status"]) => {
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
          {/* The middle name in FULL, unlike the queue table's initial: this is
              where staff read the record before issuing a document carrying the
              applicant's full legal name. */}
          <DetailRow
            label="Applicant"
            value={[record.firstName, record.middleName, record.lastName]
              .filter((part) => part && part.trim() !== "")
              .join(" ")}
          />
          <DetailRow label="Date of Birth" value={record.birthDate ? formatDate(record.birthDate) : "—"} />
          <DetailRow label="Contact Number" value={record.contactNumber} />
          {record.email ? <DetailRow label="Email" value={record.email} /> : null}
          <DetailRow label="Address" value={record.address} />
          <DetailRow label="Document Type" value={record.serviceTitle} />
          <DetailRow label="Purpose" value={record.purpose ?? "—"} />
          <DetailRow label="Date Applied" value={formatDate(record.submittedAt)} />
          <DetailRow label="Filed" value={record.source === "walk-in" ? "Walk-in (encoded)" : "Online"} />
        </dl>
        {DECIDABLE.includes(record.status) ? (
          <Field label="Remarks" htmlFor="application-remarks">
            <Textarea
              id="application-remarks"
              rows={4}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="Optional. A rejection with no remarks reaches the applicant with no reason."
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
          <InlineAlert message={localError ?? error!} onDismiss={dismissError} />
        ) : null}
        <TicketTimelinePanel
          kind="application"
          ticketId={record.id}
          updates={updates}
          hasEmail={Boolean(record.email)}
          canPost={record.status !== "released" && record.status !== "rejected"}
          onPosted={onPosted}
        />
      </div>
      {DECIDABLE.includes(record.status) ? (
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
