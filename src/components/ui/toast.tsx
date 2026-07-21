"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error";

interface ToastProps {
  message: string;
  tone?: ToastTone;
  onDismiss: () => void;
}

/**
 * Transient bottom-right notice; auto-dismisses after 3 seconds (5 for errors,
 * which carry information the user may need to act on).
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
        "fixed bottom-6 right-6 z-60 flex max-w-sm items-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-medium text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.4)]",
        tone === "error" ? "bg-danger-deep" : "bg-ink-900",
      )}
    >
      <Icon
        className={cn("h-5 w-5 shrink-0", tone === "error" ? "text-danger-soft" : "text-brand-400")}
        aria-hidden="true"
      />
      {message}
    </div>
  );
}
