"use client";

import { useCallback, useState } from "react";
import type { ToastTone } from "@/components/ui/toast";

export interface ToastState {
  /** Monotonic. Used as the Toast's React key so a repeat message remounts. */
  id: number;
  message: string;
  tone: ToastTone;
}

/**
 * Single-slot toast state for the admin managers.
 *
 * The bug this replaces was structural, not cosmetic: managers held
 * `useState<string | null>` keyed by the message itself, so calling
 * `setToast("Saved.")` while state was already `"Saved."` was not a state
 * change. React did not re-render, the dismiss timer never restarted, and the
 * second save appeared to do nothing. Carrying an incrementing `id` makes every
 * call a distinct state, and `<Toast key={toast.id}>` remounts to restart the
 * timer.
 *
 * One slot rather than a stack: these are confirmations of an action the user
 * just took, and stacking them would mean the newest — the one they are waiting
 * on — is the one pushed furthest from the pointer.
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    setToast((current) => ({ id: (current?.id ?? 0) + 1, message, tone }));
  }, []);

  const showError = useCallback(
    (message: string) => showToast(message, "error"),
    [showToast],
  );

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, showToast, showError, dismissToast };
}
