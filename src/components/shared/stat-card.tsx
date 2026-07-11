import { IconCircle } from "@/components/ui/icon-circle";
import type { Stat } from "@/types";

interface StatCardProps {
  stat: Stat;
}

/** Key-figure tile ("Barangay at a Glance") with icon, value, and note. */
export function StatCard({ stat }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-ink-200 bg-ink-50 p-3">
      <IconCircle icon={stat.icon} tone="white" square />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">{stat.label}</p>
        <p className="mt-1 font-display text-4xl font-semibold leading-none tracking-tight text-ink-900">
          {stat.value}{" "}
          {stat.note ? (
            <span className="text-xs font-normal text-ink-600">{stat.note}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
