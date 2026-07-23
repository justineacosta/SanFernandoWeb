"use client";

import { useState } from "react";
import type { InquiryRow, InquiryStatus, InquiryUpdateValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { StatusChip } from "./status-chip";

interface InquiryDrawerProps {
  record: InquiryRow;
  onSave: (id: string, values: InquiryUpdateValues) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

export const INQUIRY_STATUS_OPTIONS: { value: InquiryStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed (no reply)" },
];

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{value}</dd>
    </div>
  );
}

/**
 * One resident's message, with the reply channels as live links.
 *
 * The reply itself happens in the staff member's own mail client or on the
 * phone — the portal does not send email yet (2D, Resend). So the drawer's job
 * is to make contacting the resident one click, and to record what was said in
 * the note so the next person picking up the inbox is not starting cold.
 */
export function InquiryDrawer({ record, onSave, onCancel, saving, error }: InquiryDrawerProps) {
  const [status, setStatus] = useState<InquiryStatus>(record.status);
  const [staffNote, setStaffNote] = useState(record.staffNote);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink-900">
            {record.firstName} {record.lastName}
          </p>
          <StatusChip status={record.status} />
        </div>
        <dl className="space-y-4">
          <DetailRow
            label="Email"
            value={
              <a href={`mailto:${record.email}`} className="font-semibold text-brand-700 hover:underline">
                {record.email}
              </a>
            }
          />
          {record.phone ? (
            <DetailRow
              label="Phone"
              value={
                <a
                  href={`tel:${record.phone.replace(/\s/g, "")}`}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {record.phone}
                </a>
              }
            />
          ) : null}
          <DetailRow label="Subject" value={record.subjectLabel} />
          <DetailRow label="Received" value={formatDate(record.submittedAt)} />
        </dl>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Message</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{record.message}</p>
        </div>
        <Field label="Status" htmlFor="inquiry-status">
          <Select
            id="inquiry-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as InquiryStatus)}
          >
            {INQUIRY_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Staff note"
          htmlFor="inquiry-note"
          hint="What was said, and by whom. Not sent to the resident."
        >
          <Textarea
            id="inquiry-note"
            rows={4}
            value={staffNote}
            onChange={(event) => setStaffNote(event.target.value)}
            placeholder="e.g. Called back 21 July, requirements explained."
          />
        </Field>
        {record.handledByName && record.handledAt ? (
          <p className="text-sm text-ink-600">
            Last handled by {record.handledByName} on {formatDate(record.handledAt)}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onSave(record.id, { status, staffNote: staffNote.trim() })}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
