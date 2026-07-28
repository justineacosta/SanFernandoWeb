"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error";

interface ToastProps {
  message: string;
  tone?: ToastTone;
  onDismiss: () => void;
}

/**
 * Transient bottom-right notice; auto-dismisses after 3 seconds (5 for errors,
 * which carry information the user may need to act on) or immediately on a
 * manual close.
 *
 * Failures use `role="alert"` so assistive tech interrupts, successes
 * `role="status"` so they do not. Render with `key={toast.id}` — see
 * `useToast`, which exists because keying on the message text alone made a
 * repeated message a no-op.
 */
export function Toast({ message, tone = "success", onDismiss }: ToastProps) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), tone === "error" ? 5000 : 3000);
    return () => clearTimeout(timer);
  }, [tone]);

  const Icon = tone === "error" ? AlertCircle : CheckCircle2;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "animate-fade-up fixed bottom-6 right-6 z-60 flex max-w-sm items-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-medium text-white shadow-floating",
        tone === "error" ? "bg-danger-deep" : "bg-ink-900",
      )}
    >
      <Icon
        className={cn("h-5 w-5 shrink-0", tone === "error" ? "text-danger-soft" : "text-brand-400")}
        aria-hidden="true"
      />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 shrink-0 rounded-full p-1 text-white/70 transition-colors hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
