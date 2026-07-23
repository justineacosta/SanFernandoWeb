"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { FeedbackRow, FeedbackStatus, FeedbackUpdateValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { StatusChip } from "./status-chip";

interface FeedbackDrawerProps {
  record: FeedbackRow;
  onSave: (id: string, values: FeedbackUpdateValues) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

export const FEEDBACK_STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed (spam or duplicate)" },
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
 * One report, read-only, plus the two fields staff can change.
 *
 * There is no reply affordance here — unlike InquiryDrawer, which puts the
 * resident's email and phone one click away. Feedback is anonymous; the only
 * outward action is fixing the thing it describes.
 *
 * No autosave: two fields with no draft model, the same reason
 * AchievementsEditor is out of `useFormDraft`'s scope.
 */
export function FeedbackDrawer({ record, onSave, onCancel, saving, error }: FeedbackDrawerProps) {
  const [status, setStatus] = useState<FeedbackStatus>(record.status);
  const [staffNote, setStaffNote] = useState(record.staffNote);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink-900">{record.subject}</p>
          <StatusChip status={record.status} />
        </div>
        <dl className="space-y-4">
          <DetailRow label="Category" value={record.categoryLabel} />
          <DetailRow label="Rating" value={record.rating ? `${record.rating} of 5` : "Not rated"} />
          <DetailRow
            label="Sent from"
            value={
              record.pagePath ? (
                <a
                  href={record.pagePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"
                >
                  {record.pagePath}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : (
                "Not recorded"
              )
            }
          />
          <DetailRow label="Received" value={formatDate(record.submittedAt)} />
        </dl>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Message</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{record.message}</p>
        </div>
        {record.screenshotUrl ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Screenshot
            </p>
            <a
              href={record.screenshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-fit overflow-hidden rounded-2xl border border-ink-200/70"
            >
              {/*
                A plain <img>, not next/image: this is a signed URL that expires
                in ten minutes, so there is nothing worth caching or optimizing,
                and the Supabase host would need allow-listing for no gain.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={record.screenshotUrl}
                alt={`Screenshot attached to "${record.subject}"`}
                className="max-h-64 w-auto object-contain"
              />
            </a>
            <p className="mt-2 text-xs text-ink-500">
              This link is signed and expires after ten minutes. Reload the page for a fresh one.
            </p>
          </div>
        ) : null}
        <Field label="Status" htmlFor="feedback-status">
          <Select
            id="feedback-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as FeedbackStatus)}
          >
            {FEEDBACK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Staff note"
          htmlFor="feedback-note"
          hint="What was done about it. Internal only — nobody can be written back to."
        >
          <Textarea
            id="feedback-note"
            rows={4}
            value={staffNote}
            onChange={(event) => setStaffNote(event.target.value)}
            placeholder="e.g. Re-uploaded the 2025 budget PDF, 23 July."
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
