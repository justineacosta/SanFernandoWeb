"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableThProps {
  label: string;
  sortKey: string;
  activeKey: string;
  dir: "asc" | "desc";
  onToggle: (key: string) => void;
  align?: "left" | "right";
  className?: string;
}

export function SortableTh({ label, sortKey, activeKey, dir, onToggle, align = "left", className }: SortableThProps) {
  const active = sortKey === activeKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn("px-6 py-4", align === "right" && "text-right", className)}>
      <button type="button" onClick={() => onToggle(sortKey)}
              className={cn("inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-ink-900",
                            align === "right" && "flex-row-reverse")}>
        {label}
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </th>
  );
}
