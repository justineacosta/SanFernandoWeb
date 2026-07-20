"use client";

import { useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { MAX_PDF_BYTES, formatFileSize } from "@/lib/storage";

interface PdfUploaderProps {
  /** Storage path already on the record being edited, or null for a new record / no file. */
  existingPath: string | null;
  existingSizeBytes: number | null;
  /** Public URL for the already-stored file, for the "Attached PDF" link. */
  existingPreviewUrl: string | null;
  /** The newly chosen (not yet uploaded) file, or null. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** True once the user has asked to drop the existing stored file; takes effect only on save. */
  removeExisting: boolean;
  onRemoveExistingChange: (remove: boolean) => void;
}

/**
 * Pure file picker — no network calls. The chosen `File` and the "remove the
 * existing file" flag are held by the parent form and only turn into a real
 * upload/delete when the form is saved (see legislative-form.tsx /
 * transparency-document-form.tsx and their save actions). This is what makes
 * "a storage object exists only if a database row references it" true by
 * construction: nothing is written to storage until Save runs server-side.
 */
export function PdfUploader({
  existingPath,
  existingSizeBytes,
  existingPreviewUrl,
  file,
  onFileChange,
  removeExisting,
  onRemoveExistingChange,
}: PdfUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(candidate: File | undefined) {
    if (!candidate) return;
    setError(null);
    if (candidate.type !== "application/pdf") {
      setError("The document must be a PDF.");
      return;
    }
    if (candidate.size > MAX_PDF_BYTES) {
      setError("The PDF must be 10 MB or smaller.");
      return;
    }
    onFileChange(candidate);
  }

  const hasExisting = Boolean(existingPath);
  const showExisting = !file && hasExisting && !removeExisting;
  const showRemovedNotice = !file && hasExisting && removeExisting;

  return (
    <div className="space-y-3">
      {file ? (
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4">
          <FileText className="h-6 w-6 shrink-0 text-ink-900" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink-900">{file.name}</span>
            <span className="text-sm text-ink-500">{formatFileSize(file.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onFileChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            aria-label="Remove chosen PDF"
            className="rounded p-2 text-danger hover:bg-ink-100"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : showExisting ? (
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4">
          <FileText className="h-6 w-6 shrink-0 text-ink-900" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink-900">
              {existingPreviewUrl ? (
                <a
                  href={existingPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Attached PDF
                </a>
              ) : (
                "Attached PDF"
              )}
            </span>
            <span className="text-sm text-ink-500">{formatFileSize(existingSizeBytes)}</span>
          </span>
          <button
            type="button"
            onClick={() => onRemoveExistingChange(true)}
            aria-label="Remove PDF"
            className="rounded p-2 text-danger hover:bg-ink-100"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <>
          {showRemovedNotice ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-danger/40 bg-danger/5 p-3 text-sm text-ink-600">
              <span>The current PDF will be removed when you save.</span>
              <button
                type="button"
                onClick={() => onRemoveExistingChange(false)}
                className="font-semibold text-brand-600 hover:underline"
              >
                Undo
              </button>
            </div>
          ) : null}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 hover:border-brand-400"
          >
            <Upload className="h-6 w-6" aria-hidden="true" />
            <span>Drag a PDF here or click to choose (PDF only, ≤ 10 MB).</span>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
