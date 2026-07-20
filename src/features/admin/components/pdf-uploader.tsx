"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { MAX_PDF_BYTES, formatFileSize } from "@/lib/storage";
import { uploadDocumentPdf } from "@/features/admin/actions/documents";

export function PdfUploader({
  folder,
  path,
  sizeBytes,
  previewUrl,
  onChange,
}: {
  folder: "legislative" | "documents";
  path: string | null;
  sizeBytes: number | null;
  previewUrl: string | null;
  onChange: (next: {
    path: string | null;
    sizeBytes: number | null;
    previewUrl: string | null;
  }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.type !== "application/pdf") {
      setError("The document must be a PDF.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("The PDF must be 10 MB or smaller.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const res = await uploadDocumentPdf(folder, fd);
      if (res.error) setError(res.error);
      else onChange({ path: res.path, sizeBytes: res.sizeBytes, previewUrl: res.url });
    });
  }

  return (
    <div className="space-y-3">
      {path ? (
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4">
          <FileText className="h-6 w-6 shrink-0 text-ink-900" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink-900">
              {previewUrl ? (
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Attached PDF
                </a>
              ) : (
                "Attached PDF"
              )}
            </span>
            <span className="text-sm text-ink-500">{formatFileSize(sizeBytes)}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange({ path: null, sizeBytes: null, previewUrl: null })}
            disabled={pending}
            aria-label="Remove PDF"
            className="rounded p-2 text-danger hover:bg-ink-100 disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            submit(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 hover:border-brand-400"
        >
          <Upload className="h-6 w-6" aria-hidden="true" />
          <span>
            {pending ? "Uploading…" : "Drag a PDF here or click to choose (PDF only, ≤ 10 MB)."}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              submit(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
