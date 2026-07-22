"use client";

import { useState, useTransition } from "react";
import type { ContentStatus, TransparencyCategoryRow, TransparencyDocumentValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import {
  saveTransparencyDocument,
  setTransparencyDocumentStatus,
} from "@/features/admin/actions/transparency-documents";
import { MultiFileUploader, type ExistingFile } from "./multi-file-uploader";

export interface TransparencyDocumentEditRecord {
  id: string;
  values: TransparencyDocumentValues;
  status: ContentStatus;
  files: ExistingFile[];
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
  dateReleased: null,
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
  // Pending files picked in this drawer session — nothing touches storage
  // until Save (see multi-file-uploader.tsx and saveTransparencyDocument).
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [keptIds, setKeptIds] = useState<string[]>(record?.files.map((f) => f.id) ?? []);
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
      for (const f of newFiles) fd.append("newFile", f);
      for (const id2 of keptIds) fd.append("keptFileId", id2);
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
        <Field label="Date Released (optional)" htmlFor="transparency-doc-date">
          <Input
            id="transparency-doc-date"
            type="date"
            value={values.dateReleased ?? ""}
            onChange={(event) => set("dateReleased", event.target.value || null)}
          />
        </Field>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-700">Files</h3>
          <MultiFileUploader
            existing={record?.files ?? []}
            keptIds={keptIds}
            onKeptIdsChange={setKeptIds}
            newFiles={newFiles}
            onNewFilesChange={setNewFiles}
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
