"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabPill<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

interface TabPillsProps<T extends string> {
  tabs: TabPill<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Names the strip for assistive tech, e.g. "Inbox queue". */
  label: string;
  className?: string;
}

/**
 * The rounded pill strip above a tabbed admin surface.
 *
 * Extracted from `transparency-manager.tsx`, where the same markup was written
 * out once per tab. The wrapper's `overflow-x-auto` is load-bearing: a strip
 * wider than a narrow phone has to scroll inside itself, or the whole document
 * pans sideways — the fix made across the admin portal in the mobile pass.
 *
 * A real `role="tablist"`, unlike ViewToggle's two `aria-pressed` buttons: these
 * do switch between distinct panels, so tab semantics are honest here.
 */
export function TabPills<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: TabPillsProps<T>) {
  return (
    <div className={cn("max-w-full overflow-x-auto no-scrollbar", className)}>
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex rounded-full border border-ink-200/70 bg-white p-1"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.value)}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-(--duration-quick)",
                selected ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
