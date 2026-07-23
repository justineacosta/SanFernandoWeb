"use client";

import { useState, useTransition } from "react";
import type { ContentStatus, LegislativeValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useFormDraft } from "@/hooks/use-form-draft";
import { saveLegislative, setLegislativeStatus } from "@/features/admin/actions/legislative";
import { useAdminUserId } from "./admin-user-context";
import { DraftRecoveryBar, DraftSavedNote } from "./draft-recovery-bar";
import { FormSectionLabel } from "@/components/ui/form-section-label";
import { PdfUploader } from "./pdf-uploader";
import { MAX_SEQ_NO, formatLegislativeNumber } from "@/lib/legislative-number";

export interface LegislativeEditRecord {
  id: string;
  values: LegislativeValues;
  status: ContentStatus;
  fileUrl: string | null;
}

interface LegislativeFormProps {
  record: LegislativeEditRecord | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

const EMPTY_VALUES: LegislativeValues = {
  docType: "ordinance",
  seqNo: 1,
  year: new Date().getFullYear(),
  title: "",
  dateApproved: "",
  summary: "",
  filePath: null,
  fileSizeBytes: null,
};

/** Create/edit form for an ordinance or resolution. Saves via `saveLegislative`; workflow buttons drive status transitions. */
export function LegislativeForm({ record, onSaved, onCancel }: LegislativeFormProps) {
  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [status, setStatus] = useState<ContentStatus>(record?.status ?? "draft");
  const [values, setValues] = useState<LegislativeValues>(record?.values ?? EMPTY_VALUES);
  const [previewUrl] = useState<string | null>(record?.fileUrl ?? null);
  // Pending PDF picked in this drawer session — not uploaded until Save. See
  // pdf-uploader.tsx and saveLegislative for why: nothing touches storage
  // until the row write actually happens.
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const draft = useFormDraft(useAdminUserId(), "legislative-v2", id, values);

  const set = <K extends keyof LegislativeValues>(key: K, value: LegislativeValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (removeFile) fd.append("removeFile", "1");
      const result = await saveLegislative(id, values, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) setId(result.id);
      draft.clear();
      onSaved("Document saved.");
    });
  }

  function runTransition(nextStatus: ContentStatus, message: string) {
    const currentId = id;
    if (!currentId) return;
    setError(null);
    startTransition(async () => {
      const result = await setLegislativeStatus(currentId, nextStatus);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus(nextStatus);
      onSaved(message);
    });
  }

  return (
    <form onSubmit={handleSave} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        {draft.recovered && draft.recoveredLabel ? (
          <DraftRecoveryBar
            savedAtLabel={draft.recoveredLabel}
            hasFileState={file !== null}
            onRestore={() => {
              setValues(draft.recovered!.values);
              draft.dismiss();
            }}
            onDiscard={draft.discard}
          />
        ) : null}
        <Field label="Type" htmlFor="legislative-type">
          <Select
            id="legislative-type"
            value={values.docType}
            onChange={(event) => set("docType", event.target.value as LegislativeValues["docType"])}
          >
            <option value="ordinance">Ordinance</option>
            <option value="resolution">Resolution</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Number" htmlFor="legislative-seq-no">
            <Input
              id="legislative-seq-no"
              type="number"
              min={1}
              max={MAX_SEQ_NO}
              value={values.seqNo}
              onChange={(event) => set("seqNo", event.target.valueAsNumber || 0)}
              required
            />
          </Field>
          <Field label="Year" htmlFor="legislative-year">
            <Input
              id="legislative-year"
              type="number"
              min={1900}
              max={2200}
              value={values.year}
              onChange={(event) => set("year", event.target.valueAsNumber || 0)}
              required
            />
          </Field>
        </div>
        {/*
          The composed number is what the public sees and what search matches,
          but nobody types it — show it so the encoder can check the three
          fields produced what they meant.
        */}
        <p className="-mt-2 text-sm text-ink-600">
          Document number:{" "}
          <span className="font-semibold text-ink-900">
            {formatLegislativeNumber(values.docType, values.seqNo, values.year)}
          </span>
        </p>
        <Field label="Title" htmlFor="legislative-title">
          <Input
            id="legislative-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Date Approved (optional)" htmlFor="legislative-date">
          <Input
            id="legislative-date"
            type="date"
            value={values.dateApproved ?? ""}
            onChange={(event) => set("dateApproved", event.target.value)}
          />
          <p className="text-xs text-ink-500">
            Leave this blank to upload the document before it&rsquo;s approved — it will show as
            &ldquo;Pending Approval&rdquo; until a date is entered.
          </p>
        </Field>
        <FormSectionLabel>Content</FormSectionLabel>
        <Field label="Summary" htmlFor="legislative-summary">
          <Textarea
            id="legislative-summary"
            rows={5}
            value={values.summary}
            onChange={(event) => set("summary", event.target.value)}
          />
        </Field>
        <div className="space-y-3">
          <FormSectionLabel>Document PDF</FormSectionLabel>
          <PdfUploader
            existingPath={values.filePath}
            existingSizeBytes={values.fileSizeBytes}
            existingPreviewUrl={previewUrl}
            file={file}
            onFileChange={setFile}
            removeExisting={removeFile}
            onRemoveExistingChange={setRemoveFile}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 p-6">
        <div className="flex flex-wrap gap-2">
          {id && status === "draft" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => runTransition("in-review", "Submitted for review.")}
              >
                Submit for review
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={pending}
                onClick={() => runTransition("published", "Published.")}
              >
                Publish
              </Button>
            </>
          ) : null}
          {id && status === "in-review" ? (
            <>
              <Button
                type="button"
                variant="accent"
                disabled={pending}
                onClick={() => runTransition("published", "Published.")}
              >
                Publish
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => runTransition("draft", "Returned to draft.")}
              >
                Return to draft
              </Button>
            </>
          ) : null}
          {/* Archive and Delete live in the row's actions menu (sub-project 5). */}
          {id && status === "archived" ? (
            <Button
              type="button"
              variant="accent"
              disabled={pending}
              onClick={() => runTransition("published", "Published.")}
            >
              Publish
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <DraftSavedNote savedAt={draft.savedAt} />
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : id ? "Save Changes" : "Add Document"}
          </Button>
        </div>
      </div>
    </form>
  );
}
