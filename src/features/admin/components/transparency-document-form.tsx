"use client";

import { useState, useTransition } from "react";
import type { ContentStatus, TransparencyCategoryRow, TransparencyDocumentValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import {
  deleteTransparencyDocument,
  saveTransparencyDocument,
  setTransparencyDocumentStatus,
} from "@/features/admin/actions/transparency-documents";
import { PdfUploader } from "./pdf-uploader";

export interface TransparencyDocumentEditRecord {
  id: string;
  values: TransparencyDocumentValues;
  status: ContentStatus;
  fileUrl: string | null;
}

interface TransparencyDocumentFormProps {
  record: TransparencyDocumentEditRecord | null;
  categories: TransparencyCategoryRow[];
  onSaved: (message: string) => void;
  onCancel: () => void;
}

const EMPTY_VALUES: TransparencyDocumentValues = {
  title: "",
  categoryId: "",
  dateReleased: "",
  filePath: null,
  fileSizeBytes: null,
};

/** Create/edit form for a public transparency document. Mirrors legislative-form.tsx. */
export function TransparencyDocumentForm({
  record,
  categories,
  onSaved,
  onCancel,
}: TransparencyDocumentFormProps) {
  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [status, setStatus] = useState<ContentStatus>(record?.status ?? "draft");
  const [values, setValues] = useState<TransparencyDocumentValues>(() => {
    if (record) return record.values;
    const firstActive = categories.find((c) => c.isActive);
    return { ...EMPTY_VALUES, categoryId: firstActive?.id ?? "" };
  });
  const [previewUrl] = useState<string | null>(record?.fileUrl ?? null);
  // Pending PDF picked in this drawer session — not uploaded until Save. See
  // pdf-uploader.tsx and saveTransparencyDocument for why: nothing touches
  // storage until the row write actually happens.
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Active categories only for new documents; editing keeps the current category
  // selectable even if it has since been retired.
  const categoryOptions = categories.filter(
    (c) => c.isActive || c.id === record?.values.categoryId,
  );

  const set = <K extends keyof TransparencyDocumentValues>(
    key: K,
    value: TransparencyDocumentValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (removeFile) fd.append("removeFile", "1");
      const result = await saveTransparencyDocument(id, values, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) setId(result.id);
      onSaved("Document saved.");
    });
  }

  function runTransition(nextStatus: ContentStatus, message: string) {
    const currentId = id;
    if (!currentId) return;
    setError(null);
    startTransition(async () => {
      const result = await setTransparencyDocumentStatus(currentId, nextStatus);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus(nextStatus);
      onSaved(message);
    });
  }

  function handleDelete() {
    const currentId = id;
    if (!currentId) return;
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTransparencyDocument(currentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved("Document deleted.");
    });
  }

  return (
    <form onSubmit={handleSave} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Title" htmlFor="transparency-doc-title">
          <Input
            id="transparency-doc-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Category" htmlFor="transparency-doc-category">
          <Select
            id="transparency-doc-category"
            value={values.categoryId}
            onChange={(event) => set("categoryId", event.target.value)}
          >
            {categoryOptions.length === 0 ? <option value="">No categories available</option> : null}
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
                {category.isActive ? "" : " (retired)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date Released" htmlFor="transparency-doc-date">
          <Input
            id="transparency-doc-date"
            type="date"
            value={values.dateReleased}
            onChange={(event) => set("dateReleased", event.target.value)}
            required
          />
        </Field>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-700">Document PDF</h3>
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
          {id && status === "published" ? (
            <Button
              type="button"
              variant="outline-danger"
              disabled={pending}
              onClick={() => runTransition("archived", "Archived.")}
            >
              Archive
            </Button>
          ) : null}
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
          {id ? (
            <Button type="button" variant="outline-danger" disabled={pending} onClick={handleDelete}>
              Delete
            </Button>
          ) : null}
        </div>
        <div className="flex gap-3">
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
