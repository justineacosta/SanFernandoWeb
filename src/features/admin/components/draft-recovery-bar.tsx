"use client";

import { RotateCcw } from "lucide-react";

interface DraftRecoveryBarProps {
  /** e.g. "12 minutes ago", fixed by the hook when the copy was found. */
  savedAtLabel: string;
  /** True when the form also holds file state, which a recovery copy cannot carry. */
  hasFileState?: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}

/**
 * Offers an unsaved recovery copy at the top of a drawer form.
 *
 * It offers; it does not apply. For an existing record the server values may
 * have moved on while the copy sat here — another editor may have published a
 * correction — and silently reinstating stale text over that would be a
 * data-loss bug wearing a data-recovery costume (spec §2.4).
 */
export function DraftRecoveryBar({
  savedAtLabel,
  hasFileState = false,
  onRestore,
  onDiscard,
}: DraftRecoveryBarProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-lg border border-brand-300 bg-brand-100 p-3"
    >
      <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900">
          Unsaved changes from {savedAtLabel}
        </p>
        <p className="mt-0.5 text-xs text-ink-600">
          Kept on this device only.
          {hasFileState ? " Text is restored; any chosen images are not." : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onRestore}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-ink-600 transition-colors hover:bg-brand-200 hover:text-ink-900"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

/**
 * The status line beside Save.
 *
 * The wording is load-bearing: never "Saved", which editors would reasonably
 * read as "this is on the site". A recovery copy is not a save.
 */
export function DraftSavedNote({ savedAt }: { savedAt: number | null }) {
  if (!savedAt) return null;
  return (
    <p className="text-xs text-ink-500" aria-live="polite">
      Recovery copy saved on this device
    </p>
  );
}
