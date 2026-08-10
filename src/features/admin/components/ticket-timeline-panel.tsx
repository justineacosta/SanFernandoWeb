"use client";

import { useState, useTransition } from "react";
import { Lock, Paperclip } from "lucide-react";
import type { AdminTicketUpdate, TicketKind, TicketUpdateValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { cn } from "@/lib/utils";
import { postTicketUpdate } from "../actions/ticket-updates";

interface TicketTimelinePanelProps {
  kind: TicketKind;
  ticketId: string;
  updates: AdminTicketUpdate[];
  /** False when the ticket carries no email — the notify toggle is then disabled. */
  hasEmail: boolean;
  /** False once the ticket is closed — the composer is then hidden. */
  canPost: boolean;
  onPosted: () => void;
}

/**
 * The ticket's full timeline plus the staff composer. Shared by all four review
 * drawers — the log, the internal-note treatment and the composer exist once
 * rather than four times.
 *
 * Internal notes are labelled in words, not only by colour: a staff member must
 * never mistake one for something the resident has already seen.
 */
export function TicketTimelinePanel({
  kind,
  ticketId,
  updates,
  hasEmail,
  canPost,
  onPosted,
}: TicketTimelinePanelProps) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<TicketUpdateValues["visibility"]>("public");
  const [notify, setNotify] = useState(true);
  const [setStatus, setSetStatus] = useState<TicketUpdateValues["setStatus"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Asking for information the resident cannot see is incoherent — lock the
  // radio. postTicketUpdate re-checks this server-side rather than trusting it.
  const visibilityLocked = setStatus === "awaiting-info";
  const effectiveVisibility = visibilityLocked ? "public" : visibility;
  const notifyDisabled = !hasEmail || effectiveVisibility === "internal";
  // An information request always emails, for the same reason it is always
  // public: `/track` is pull-only, so a resident who is never told is a ticket
  // blocked on someone who does not know they were asked. Locked on rather
  // than merely defaulted on — the checkbox's state otherwise persists between
  // posts, so unticking it once would silently mute every later request.
  // postTicketUpdate forces the same thing server-side.
  const notifyLocked = visibilityLocked && hasEmail;
  const effectiveNotify = notifyLocked ? true : notifyDisabled ? false : notify;

  const submit = () => {
    if (!body.trim()) {
      setError("Write the update.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await postTicketUpdate(kind, ticketId, {
          body: body.trim(),
          visibility: effectiveVisibility,
          notify: effectiveNotify,
          setStatus,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        setBody("");
        setSetStatus(null);
        // Back to resident-visible for the next post. Left as-is, an internal
        // note silently made the following update internal too, so an update
        // meant for the resident would never reach them.
        setVisibility("public");
        onPosted();
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  };

  return (
    <section className="space-y-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-ink-500">
        Timeline
      </h3>

      <ol className="space-y-3">
        {updates.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              "rounded-lg border p-3 text-sm",
              entry.visibility === "internal"
                ? "border-ink-200 bg-ink-50"
                : entry.authorKind === "resident"
                  ? "border-brand-200 bg-brand-50"
                  : "border-ink-100 bg-white",
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span className="font-semibold text-ink-700">
                {entry.authorKind === "resident"
                  ? "Resident"
                  : (entry.authorName ?? "Barangay staff")}
              </span>
              <span className="tabular-nums">{entry.createdAt}</span>
              {entry.visibility === "internal" ? (
                <span className="inline-flex items-center gap-1 font-semibold text-ink-600">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Internal — not visible to the resident
                </span>
              ) : null}
              {/* "attempted", not "notified": sendEmail is fail-open by design and
                  never reports a delivery failure back, so the stamp only proves we
                  tried. */}
              {entry.notified ? <span>Email attempted</span> : null}
            </div>
            {entry.body ? <p className="mt-1 text-ink-900">{entry.body}</p> : null}
            {entry.attachments.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {entry.attachments.map((file) => (
                  <li key={file.path}>
                    {file.url ? (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 underline"
                      >
                        <Paperclip className="h-3 w-3" aria-hidden="true" />
                        {file.name}
                      </a>
                    ) : (
                      <span className="text-xs text-ink-500">{file.name} (unavailable)</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
        {updates.length === 0 ? <li className="text-sm text-ink-500">No updates yet.</li> : null}
      </ol>

      {canPost ? (
        <div className="space-y-3 rounded-lg border border-ink-200 p-3">
          <Field label="Post an update" htmlFor="ticket-update-body">
            <Textarea
              id="ticket-update-body"
              rows={3}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What should be recorded on this ticket?"
            />
          </Field>

          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">Visibility</legend>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="ticket-update-visibility"
                checked={effectiveVisibility === "public"}
                disabled={visibilityLocked}
                onChange={() => setVisibility("public")}
              />
              Resident-visible
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="ticket-update-visibility"
                checked={effectiveVisibility === "internal"}
                disabled={visibilityLocked}
                onChange={() => setVisibility("internal")}
              />
              Internal note
            </label>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={effectiveNotify}
              disabled={notifyDisabled || notifyLocked}
              onChange={(event) => setNotify(event.target.checked)}
            />
            Email the resident
            {!hasEmail ? (
              <span className="text-xs text-ink-500">(no email on this ticket)</span>
            ) : notifyLocked ? (
              <span className="text-xs text-ink-500">(always sent for an information request)</span>
            ) : null}
          </label>

          <label className="flex flex-wrap items-center gap-2 text-sm">
            Also set status to
            <select
              className="rounded-md border border-ink-200 px-2 py-1"
              value={setStatus ?? ""}
              onChange={(event) =>
                setSetStatus((event.target.value || null) as TicketUpdateValues["setStatus"])
              }
            >
              <option value="">No change</option>
              <option value="under-review">Under Review</option>
              <option value="awaiting-info">Awaiting Information</option>
            </select>
          </label>

          {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}

          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending ? "Posting…" : "Post update"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
