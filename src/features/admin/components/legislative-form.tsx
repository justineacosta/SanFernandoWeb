"use client";

import { useState } from "react";
import type { AdminLegislativeRecord, LegislativeFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

interface LegislativeFormProps {
  record: AdminLegislativeRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

/** Create/edit form for an ordinance or resolution. Validates, then fake-saves. */
export function LegislativeForm({ record, onSaved, onCancel }: LegislativeFormProps) {
  const [values, setValues] = useState<LegislativeFormValues>({
    type: record?.type ?? "ordinance",
    number: record?.document.number ?? "",
    title: record?.document.title ?? "",
    datePassed: record?.document.date ?? "",
    summary: record?.document.summary ?? "",
    status: record?.status ?? "under-review",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof LegislativeFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof LegislativeFormValues>(key: K, value: LegislativeFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.number.trim()) nextErrors.number = "Document number is required.";
    if (!values.title.trim()) nextErrors.title = "Title is required.";
    if (!values.datePassed) nextErrors.datePassed = "Date passed is required.";
    if (!values.summary.trim()) nextErrors.summary = "Summary is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onSaved();
    }, 600);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Type" htmlFor="legislative-type">
            <Select
              id="legislative-type"
              value={values.type}
              onChange={(event) => set("type", event.target.value as LegislativeFormValues["type"])}
            >
              <option value="ordinance">Ordinance</option>
              <option value="resolution">Resolution</option>
            </Select>
          </Field>
          <Field label="Status" htmlFor="legislative-status">
            <Select
              id="legislative-status"
              value={values.status}
              onChange={(event) =>
                set("status", event.target.value as LegislativeFormValues["status"])
              }
            >
              <option value="active">Active</option>
              <option value="under-review">Under Review</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        </div>
        <Field label="Document Number" htmlFor="legislative-number">
          <Input
            id="legislative-number"
            placeholder="e.g. Ordinance No. 01-2025"
            value={values.number}
            onChange={(event) => set("number", event.target.value)}
            aria-invalid={Boolean(errors.number)}
          />
          {errors.number ? <p className="text-sm text-danger">{errors.number}</p> : null}
        </Field>
        <Field label="Title" htmlFor="legislative-title">
          <Input
            id="legislative-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title ? <p className="text-sm text-danger">{errors.title}</p> : null}
        </Field>
        <Field label="Date Passed" htmlFor="legislative-date">
          <Input
            id="legislative-date"
            type="date"
            value={values.datePassed}
            onChange={(event) => set("datePassed", event.target.value)}
            aria-invalid={Boolean(errors.datePassed)}
          />
          {errors.datePassed ? <p className="text-sm text-danger">{errors.datePassed}</p> : null}
        </Field>
        <Field label="Summary" htmlFor="legislative-summary">
          <Textarea
            id="legislative-summary"
            rows={5}
            value={values.summary}
            onChange={(event) => set("summary", event.target.value)}
            aria-invalid={Boolean(errors.summary)}
          />
          {errors.summary ? <p className="text-sm text-danger">{errors.summary}</p> : null}
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : record ? "Save Changes" : "Add Document"}
        </Button>
      </div>
    </form>
  );
}
