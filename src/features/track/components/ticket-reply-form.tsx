"use client";

import { useRef, useState, useTransition } from "react";
import type { TicketLookupResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
import { ALLOWED_DOC_FILE_TYPES, MAX_TICKET_FILE_BYTES, MAX_TICKET_FILES } from "@/lib/storage";
import { submitTicketReply } from "../actions";

interface TicketReplyFormProps {
  ticketNo: string;
  lastName: string;
  /** The refreshed ticket, rebuilt server-side after the status update. */
  onSent: (ticket: TicketLookupResult) => void;
}

/**
 * The resident's answer to an information request. Rendered only when the
 * ticket is `awaiting-info` — /track is not a general-purpose inbox, and
 * /contact stays the channel for anything else.
 *
 * The file picker is pure: no network call until submit, matching every other
 * uploader in this codebase. File type/size are checked here too, with the
 * same wording the server uses, so an oversized or wrong-type file fails
 * instantly instead of burning an upload round trip.
 */
export function TicketReplyForm({ ticketNo, lastName, onSent }: TicketReplyFormProps) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // Field-level validation, deliberately separate from `error` below and with
  // no dismiss button — same split feedback-panel.tsx's own fileError follows.
  // The only way past a rejected file is to fix the file input, not to click
  // past a banner: without that, Send stayed clickable and a resident who
  // ignored the message got a filed reply with the attachment silently gone.
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length === 0) return;
    if (picked.length > MAX_TICKET_FILES) {
      setFiles([]);
      setFileError(`You can attach up to ${MAX_TICKET_FILES} files.`);
      event.target.value = "";
      return;
    }
    const oversized = picked.some((file) => file.size > MAX_TICKET_FILE_BYTES);
    if (oversized) {
      setFiles([]);
      setFileError("Each attachment must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }
    const wrongType = picked.some(
      (file) => !ALLOWED_DOC_FILE_TYPES.includes(file.type as (typeof ALLOWED_DOC_FILE_TYPES)[number]),
    );
    if (wrongType) {
      setFiles([]);
      setFileError("Attachments must be JPG, PNG, WebP, or PDF.");
      event.target.value = "";
      return;
    }
    setFileError(null);
    setFiles(picked);
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("ticketNo", ticketNo);
        form.set("lastName", lastName);
        form.set("body", body);
        form.set("turnstileToken", turnstileToken ?? "");
        for (const file of files) form.append("files", file);
        const result = await submitTicketReply(form);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.ticket) {
          setBody("");
          setFiles([]);
          onSent(result.ticket);
        } else {
          // The reply was recorded (error is null) but the immediate re-read
          // failed — rare, since the reply's own write just committed moments
          // earlier. Say so rather than silently leaving the composer's state
          // out of sync with what the DB now holds. Worded so the alert's
          // error styling is honest: the refresh IS what failed, and the
          // resident is told first that the part they care about worked.
          setError("Your reply was sent, but this page could not be refreshed. Reload to see it.");
        }
      } catch {
        // Never let a throw reach error.tsx — that loses what the resident typed.
        setError("Something went wrong. Please try again.");
      } finally {
        // Turnstile tokens are single-use; reset without remounting the form.
        turnstileRef.current?.reset();
        setTurnstileToken(null);
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5"
    >
      <h3 className="font-display text-base font-bold text-ink-900">
        Send the information the barangay asked for
      </h3>
      <div className="mt-4 space-y-4">
        <Field label="Your reply" htmlFor="ticket-reply-body">
          <Textarea
            id="ticket-reply-body"
            rows={4}
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>

        <div>
          <label htmlFor="ticket-reply-files" className="text-sm font-semibold text-ink-800">
            Attach files (optional)
          </label>
          <input
            id="ticket-reply-files"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="mt-1 block w-full text-sm"
            onChange={handleFiles}
          />
          <p className="mt-1 text-xs text-ink-500">
            Up to {MAX_TICKET_FILES} files, 2 MB each. JPG, PNG, WebP, or PDF.
          </p>
          {fileError ? (
            <p role="alert" className="mt-1 text-sm font-medium text-danger">
              {fileError}
            </p>
          ) : null}
        </div>

        <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />

        {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}

        <Button type="submit" variant="primary" disabled={isPending || fileError !== null}>
          {isPending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
