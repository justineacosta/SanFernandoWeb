"use client";

import { useState, useTransition } from "react";
import type { ContentStatus, TransparencyProjectValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import {
  saveTransparencyProject,
  setTransparencyProjectStatus,
} from "@/features/admin/actions/transparency-projects";
import { MultiFileUploader, type ExistingFile } from "./multi-file-uploader";

export interface TransparencyProjectEditRecord {
  id: string;
  values: TransparencyProjectValues;
  status: ContentStatus;
  files: ExistingFile[];
}

interface TransparencyProjectFormProps {
  record: TransparencyProjectEditRecord | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

const EMPTY_VALUES: TransparencyProjectValues = {
  name: "",
  progress: 0,
  date: null,
};

/** Create/edit form for a monitored project. Mirrors transparency-document-form.tsx. */
export function TransparencyProjectForm({ record, onSaved, onCancel }: TransparencyProjectFormProps) {
  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [status, setStatus] = useState<ContentStatus>(record?.status ?? "draft");
  const [values, setValues] = useState<TransparencyProjectValues>(record?.values ?? EMPTY_VALUES);
  // Pending files picked in this drawer session — nothing touches storage
  // until Save (see multi-file-uploader.tsx and saveTransparencyProject).
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [keptIds, setKeptIds] = useState<string[]>(record?.files.map((f) => f.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof TransparencyProjectValues>(
    key: K,
    value: TransparencyProjectValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      for (const f of newFiles) fd.append("newFile", f);
      for (const id2 of keptIds) fd.append("keptFileId", id2);
      const result = await saveTransparencyProject(id, values, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) setId(result.id);
      onSaved("Project saved.");
    });
  }

  function runTransition(nextStatus: ContentStatus, message: string) {
    const currentId = id;
    if (!currentId) return;
    setError(null);
    startTransition(async () => {
      const result = await setTransparencyProjectStatus(currentId, nextStatus);
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
        <Field label="Name" htmlFor="transparency-project-name">
          <Input
            id="transparency-project-name"
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Progress (0–100)" htmlFor="transparency-project-progress">
          <Input
            id="transparency-project-progress"
            type="number"
            min={0}
            max={100}
            value={values.progress}
            onChange={(event) => set("progress", Number(event.target.value))}
          />
        </Field>
        <Field label="Date (optional)" htmlFor="transparency-project-date">
          <Input
            id="transparency-project-date"
            type="date"
            value={values.date ?? ""}
            onChange={(event) => set("date", event.target.value || null)}
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
          {/*
            Archive and Delete moved to the row's actions menu (sub-project 5): a
            destructive action should not require opening an editor you did not
            want to open. Publish stays here because it must persist the
            on-screen values first.
          */}
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
            {pending ? "Saving…" : id ? "Save Changes" : "Add Project"}
          </Button>
        </div>
      </div>
    </form>
  );
}
