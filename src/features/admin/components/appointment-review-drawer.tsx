"use client";

import { useState } from "react";
import type { AdminTicketUpdate, AppointmentPeriod, AppointmentReviewValues, AppointmentRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { formatDate, manilaToday } from "@/lib/format";
import { StatusChip } from "./status-chip";
import { TicketTimelinePanel } from "./ticket-timeline-panel";

interface AppointmentReviewDrawerProps {
  record: AppointmentRow;
  onReview: (id: string, values: AppointmentReviewValues) => void;
  onComplete: (id: string) => void;
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

/** Full request; confirm/decline a pending row, complete a confirmed one. */
export function AppointmentReviewDrawer({
  record,
  onReview,
  onComplete,
  onCancel,
  saving,
  error,
  onDismissError,
  updates,
  onPosted,
}: AppointmentReviewDrawerProps) {
  const [confirmedDate, setConfirmedDate] = useState(record.preferredDate);
  const [confirmedPeriod, setConfirmedPeriod] = useState<AppointmentPeriod>(record.preferredPeriod);
  const [remarks, setRemarks] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const dismissError = () => {
    setLocalError(null);
    onDismissError();
  };

  const submitReview = (status: AppointmentReviewValues["status"]) => {
    if (status === "declined" && !remarks.trim()) {
      setLocalError("Remarks are required when declining an appointment.");
      return;
    }
    setLocalError(null);
    if (status === "declined") {
      onReview(record.id, { status: "declined", confirmedDate: "", confirmedPeriod: "", remarks });
      return;
    }
    onReview(record.id, { status: "confirmed", confirmedDate, confirmedPeriod, remarks });
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
          <DetailRow label="Purpose" value={record.purpose} />
          <DetailRow
            label="Requested Schedule"
            value={`${formatDate(record.preferredDate)} · ${record.preferredPeriod === "am" ? "Morning" : "Afternoon"}`}
          />
          <DetailRow label="Date Filed" value={formatDate(record.submittedAt)} />
          <DetailRow label="Filed" value={record.source === "walk-in" ? "Walk-in (encoded)" : "Online"} />
        </dl>
        {record.status === "pending" ? (
          <>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Confirm this schedule
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Confirmed date" htmlFor="appointment-confirmed-date">
                  <Input
                    id="appointment-confirmed-date"
                    type="date"
                    min={manilaToday()}
                    value={confirmedDate}
                    onChange={(event) => setConfirmedDate(event.target.value)}
                  />
                </Field>
                <Field label="Confirmed time" htmlFor="appointment-confirmed-period">
                  <Select
                    id="appointment-confirmed-period"
                    value={confirmedPeriod}
                    onChange={(event) => setConfirmedPeriod(event.target.value as AppointmentPeriod)}
                  >
                    <option value="am">Morning (8:00 AM – 12:00 NN)</option>
                    <option value="pm">Afternoon (1:00 PM – 5:00 PM)</option>
                  </Select>
                </Field>
              </div>
              <p className="text-xs text-ink-500">
                Pre-filled with what the resident asked for. Change it to propose a different slot.
              </p>
            </div>
            <Field label="Remarks" htmlFor="appointment-remarks">
              <Textarea
                id="appointment-remarks"
                rows={4}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Optional when confirming; required when declining."
                aria-invalid={Boolean(localError)}
              />
            </Field>
          </>
        ) : record.status === "confirmed" ? null : (
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
            {record.completedByName && record.completedAt ? (
              <p className="mt-1 text-sm text-ink-600">
                Completed by {record.completedByName} on {formatDate(record.completedAt)}
              </p>
            ) : null}
          </div>
        )}
        {(localError ?? error) ? (
          <InlineAlert message={localError ?? error!} onDismiss={dismissError} />
        ) : null}
        <TicketTimelinePanel
          kind="appointment"
          ticketId={record.id}
          updates={updates}
          hasEmail={Boolean(record.email)}
          canPost={record.status !== "completed" && record.status !== "declined"}
          onPosted={onPosted}
        />
      </div>
      {record.status === "pending" ? (
        <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
          <Button variant="outline-danger" onClick={() => submitReview("declined")} disabled={saving}>
            Decline
          </Button>
          <Button onClick={() => submitReview("confirmed")} disabled={saving}>
            {saving ? "Saving…" : "Confirm"}
          </Button>
        </div>
      ) : record.status === "confirmed" ? (
        <div className="flex items-center justify-between gap-3 border-t border-ink-200/70 p-6">
          <p className="text-xs text-ink-500">
            Confirmed for {formatDate(record.confirmedDate ?? record.preferredDate)} ·{" "}
            {(record.confirmedPeriod ?? record.preferredPeriod) === "am" ? "Morning" : "Afternoon"}.
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onCancel}>
              Close
            </Button>
            <Button onClick={() => onComplete(record.id)} disabled={saving}>
              {saving ? "Saving…" : "Mark as completed"}
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
