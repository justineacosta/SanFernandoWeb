"use client";

import { useRef, useState, useTransition } from "react";
import type { TicketLookupResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
import { TicketFileField } from "@/components/shared/ticket-file-field";
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
 * The file picker is `TicketFileField`, shared with every other resident
 * attachment surface: pure, no network call until submit, and it downscales an
 * oversized photo rather than rejecting it.
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
  const [filePreparing, setFilePreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

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

        <TicketFileField
          files={files}
          onFilesChange={setFiles}
          error={fileError}
          onErrorChange={setFileError}
          preparing={filePreparing}
          onPreparingChange={setFilePreparing}
          idPrefix="ticket-reply"
          label="Attach files (optional)"
        />

        <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />

        {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}

        <Button type="submit" variant="primary" disabled={isPending || filePreparing || fileError !== null}>
          {isPending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
