import { IconCircle } from "@/components/ui/icon-circle";
import type { Stat } from "@/types";

interface StatCardProps {
  stat: Stat;
}

/** Key-figure tile ("Barangay at a Glance") with icon, value, and note. */
export function StatCard({ stat }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded border border-surface-high bg-surface-low p-3">
      <IconCircle icon={stat.icon} tone="white" square />
      <div>
        <p className="text-xs font-medium text-ink-muted">{stat.label}</p>
        <p className="mt-1 text-2xl font-bold leading-none text-primary">
          {stat.value}{" "}
          {stat.note ? (
            <span className="text-xs font-normal text-ink-muted">{stat.note}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
