"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineAlertProps {
  message: string;
  onDismiss: () => void;
  className?: string;
  /** Lets a field wire `aria-describedby` to this banner. */
  id?: string;
}

/**
 * The dismissible `role="alert"` banner every form/drawer renders under its
 * fields on a failed save. `className` can override the default `text-danger`
 * tone or size — twMerge resolves the conflict, so callers don't need a prop
 * for every variant that existed before this was one component.
 */
export function InlineAlert({ message, onDismiss, className, id }: InlineAlertProps) {
  return (
    <p
      id={id}
      role="alert"
      className={cn("flex items-start justify-between gap-3 text-sm font-medium text-danger", className)}
    >
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 shrink-0 rounded-full p-1 text-current opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </p>
  );
}
