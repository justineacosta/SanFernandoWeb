"use client";

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

/** Transient bottom-right notice; auto-dismisses after 3 seconds. */
export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-60 flex items-center gap-2.5 rounded-2xl bg-ink-900 px-5 py-3.5 text-sm font-medium text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.4)]"
    >
      <CheckCircle2 className="h-5 w-5 text-brand-400" aria-hidden="true" />
      {message}
    </div>
  );
}
