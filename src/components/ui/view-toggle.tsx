"use client";

import { Archive, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type TableView = "active" | "archived";

interface ViewToggleProps {
  view: TableView;
  archivedCount: number;
  onChange: (view: TableView) => void;
  /** Named in each button's accessible label, e.g. "officials". */
  noun: string;
  className?: string;
}

/**
 * Active | Archived switch above an admin table.
 *
 * Archived records used to sit in the same list behind an "All Statuses"
 * dropdown, which made two things awkward. The default view mixed retired
 * records with live ones; and Delete — which umbrella §3.2 allows only on an
 * already-archived record — had nowhere to live that read as a place rather
 * than a filter value. A view is a place.
 *
 * `aria-pressed` rather than a tablist: these are two buttons that change what
 * the one table below shows, not two panels. A tablist would promise arrow-key
 * navigation between panels that do not exist.
 */
export function ViewToggle({ view, archivedCount, onChange, noun, className }: ViewToggleProps) {
  const base =
    "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors";
  return (
    <div className={cn("inline-flex gap-1 rounded-2xl border border-ink-200/70 p-1", className)}>
      <button
        type="button"
        aria-pressed={view === "active"}
        aria-label={`Show active ${noun}`}
        onClick={() => onChange("active")}
        className={cn(
          base,
          view === "active" ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
        )}
      >
        <List className="h-4 w-4" aria-hidden="true" />
        Active
      </button>
      <button
        type="button"
        aria-pressed={view === "archived"}
        aria-label={`Show archived ${noun}`}
        onClick={() => onChange("archived")}
        className={cn(
          base,
          view === "archived" ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
        )}
      >
        <Archive className="h-4 w-4" aria-hidden="true" />
        Archived
        {archivedCount > 0 ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs",
              view === "archived" ? "bg-ink-900/10" : "bg-ink-100 text-ink-600",
            )}
          >
            {archivedCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
