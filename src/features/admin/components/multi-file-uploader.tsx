"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Trash2, Upload } from "lucide-react";
import { ALLOWED_DOC_FILE_TYPES, MAX_DOC_FILE_BYTES, MAX_FILES_PER_RECORD, formatFileSize } from "@/lib/storage";
import { InlineAlert } from "@/components/ui/inline-alert";

/** An already-stored file the record currently has. */
export interface ExistingFile {
  id: string;
  url: string;
  label: string;
  mime: string;
  sizeBytes: number;
}

interface MultiFileUploaderProps {
  /** Files already on the record (edit mode). */
  existing: ExistingFile[];
  /** Ids of existing files the user has chosen to keep. */
  keptIds: string[];
  onKeptIdsChange: (ids: string[]) => void;
  /** Newly chosen files, not yet uploaded. */
  newFiles: File[];
  onNewFilesChange: (files: File[]) => void;
}

/**
 * Pure file picker for up to MAX_FILES_PER_RECORD PDF/image files. No network
 * calls: chosen files and kept-file ids live in the parent form and only turn
 * into uploads/deletes on Save (see transparency-document-form / -project-form
 * and their save actions). This keeps "an object exists only if a row
 * references it" true by construction.
 */
export function MultiFileUploader({
  existing,
  keptIds,
  onKeptIdsChange,
  newFiles,
  onNewFilesChange,
}: MultiFileUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const keptExisting = existing.filter((f) => keptIds.includes(f.id));
  const total = keptExisting.length + newFiles.length;

  function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const chosen: File[] = [];
    for (const file of Array.from(list)) {
      if (!ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number])) {
        setError("Files must be a PDF or image.");
        return;
      }
      if (file.size > MAX_DOC_FILE_BYTES) {
        setError("Each file must be 10 MB or smaller.");
        return;
      }
      chosen.push(file);
    }
    if (total + chosen.length > MAX_FILES_PER_RECORD) {
      setError(`Up to ${MAX_FILES_PER_RECORD} files.`);
      return;
    }
    onNewFilesChange([...newFiles, ...chosen]);
  }

  const iconFor = (mime: string) => (mime === "application/pdf" ? FileText : ImageIcon);

  return (
    <div className="space-y-3">
      {keptExisting.map((f) => {
        const Icon = iconFor(f.mime);
        return (
          <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4">
            <Icon className="h-6 w-6 shrink-0 text-ink-900" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-ink-900 hover:underline">
                {f.label}
              </a>
              <span className="text-sm text-ink-500">{formatFileSize(f.sizeBytes)}</span>
            </span>
            <button
              type="button"
              onClick={() => onKeptIdsChange(keptIds.filter((id) => id !== f.id))}
              aria-label={`Remove ${f.label}`}
              className="rounded p-2 text-danger hover:bg-ink-100"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}

      {newFiles.map((file, index) => {
        const Icon = iconFor(file.type);
        return (
          <div key={`new-${index}`} className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4">
            <Icon className="h-6 w-6 shrink-0 text-ink-900" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink-900">{file.name}</span>
              <span className="text-sm text-ink-500">{formatFileSize(file.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => onNewFilesChange(newFiles.filter((_, i) => i !== index))}
              aria-label={`Remove ${file.name}`}
              className="rounded p-2 text-danger hover:bg-ink-100"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}

      {total < MAX_FILES_PER_RECORD ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 hover:border-brand-400"
        >
          <Upload className="h-6 w-6" aria-hidden="true" />
          <span>Drag files here or click to choose (PDF or image, ≤ 10 MB each, up to {MAX_FILES_PER_RECORD}).</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
          />
        </div>
      ) : null}

      {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}
    </div>
  );
}
