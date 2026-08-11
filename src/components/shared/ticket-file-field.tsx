"use client";

import { useRef } from "react";
import {
  ALLOWED_DOC_FILE_TYPES,
  MAX_TICKET_FILES,
  MAX_TICKET_FILE_BYTES,
} from "@/lib/storage";
import { downscaleImageFile } from "@/lib/downscale-image";

interface TicketFileFieldProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** Field-level rejection. Owned here, read by the parent to gate Submit. */
  error: string | null;
  onErrorChange: (error: string | null) => void;
  /** True while downscaling runs; the parent disables Submit on it. */
  preparing: boolean;
  onPreparingChange: (preparing: boolean) => void;
  /** Disambiguates the input id and its label. */
  idPrefix: string;
  label?: string;
}

/**
 * The one file picker for resident ticket attachments — public forms and
 * walk-in encoding both. A PURE picker: no network calls, chosen files live in
 * the parent form's state and become uploads only inside its submit action,
 * which is what keeps "a storage object exists only if a row references it"
 * true by construction.
 *
 * Oversized images are downscaled in the browser rather than rejected: a
 * straight-from-camera photo is routinely 3-5 MB against a 2 MB cap, and a
 * resident on a phone has no easy way to resize one. PDFs are never touched.
 */
export function TicketFileField({
  // `files` is kept in the destructure to document the prop pair
  // symmetrically with onFilesChange; the component itself never needs to
  // read the current selection back.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  files,
  onFilesChange,
  error,
  onErrorChange,
  preparing,
  onPreparingChange,
  idPrefix,
  label = "Supporting documents (optional)",
}: TicketFileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  /** Clears the control AND the state. Leaving an earlier valid pick in `files`
   *  behind an input that now reads "no file chosen" would submit files the
   *  resident can no longer see. */
  function reject(message: string) {
    onErrorChange(message);
    onFilesChange([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length === 0) return;
    if (picked.length > MAX_TICKET_FILES) {
      reject(`You can attach up to ${MAX_TICKET_FILES} files.`);
      return;
    }
    if (
      picked.some(
        (file) =>
          !ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number]),
      )
    ) {
      reject("Attachments must be JPG, PNG, WebP, or PDF.");
      return;
    }

    onPreparingChange(true);
    try {
      const prepared: File[] = [];
      for (const file of picked) {
        const fitted = await downscaleImageFile(file, MAX_TICKET_FILE_BYTES);
        // null means it could not be made to fit, or the browser could not
        // decode it. Say so — never submit silently without the attachment.
        if (!fitted) {
          reject("Each attachment must be 2 MB or smaller.");
          return;
        }
        prepared.push(fitted);
      }
      onErrorChange(null);
      onFilesChange(prepared);
    } finally {
      onPreparingChange(false);
    }
  }

  const inputId = `${idPrefix}-files`;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-semibold text-ink-800">
        {label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleChange}
        className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
      />
      <p className="text-xs text-ink-500">
        Up to {MAX_TICKET_FILES} files, 2 MB each. JPG, PNG, WebP, or PDF. Large photos are
        resized automatically.
      </p>
      {preparing ? (
        <p className="text-xs text-ink-500" aria-live="polite">
          Preparing files…
        </p>
      ) : null}
      {/*
        Plain role="alert" text rather than an <InlineAlert>: this is
        field-level validation that clears itself on the next valid pick, so a
        close button would have nothing to dismiss to. The parent additionally
        disables Submit while this is set — see .claude/frontend.md.
      */}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
