"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The consequence, in plain words. Name the record here. */
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions get the danger treatment and a warning icon. */
  tone?: "danger" | "default";
  /** True while the confirmed action is in flight — the dialog stays open and locked. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Branded replacement for `window.confirm`.
 *
 * `window.confirm` blocks the main thread, cannot be styled, cannot show the
 * record's name in the site's own type, and — the reason it had to go — cannot
 * express a pending state, so a slow Server Action left the user with no
 * feedback and a second click fired a second delete. This dialog stays open and
 * disabled until the caller clears `pending`.
 *
 * `role="alertdialog"` (not `dialog`) is deliberate: it tells assistive tech
 * this interrupts for a consequential decision, and it makes the description
 * part of the initial announcement.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const pendingRef = useRef(pending);

  useEffect(() => {
    onCancelRef.current = onCancel;
    pendingRef.current = pending;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus lands on Cancel, not Confirm: a stray Enter must not delete.
    cancelRef.current?.focus();
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!pendingRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={() => (pending ? undefined : onCancel())}
        className="absolute inset-0 bg-ink-950/50"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        className="animate-fade-up relative w-full max-w-md rounded-3xl bg-white p-6 shadow-floating"
      >
        <div className="flex gap-4">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
              tone === "danger" ? "bg-danger-soft text-danger" : "bg-brand-100 text-brand-700",
            )}
          >
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="font-display text-lg font-semibold tracking-tight text-ink-900"
            >
              {title}
            </h2>
            <div id="confirm-dialog-body" className="mt-2 text-sm text-ink-600">
              {body}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "outline-danger" : "primary"}
            size="sm"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
