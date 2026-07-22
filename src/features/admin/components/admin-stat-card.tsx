import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";

interface AdminStatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "primary" | "secondary" | "danger";
}

/** Compact metric card: icon housing, uppercase label, display-font value. */
export function AdminStatCard({ icon, label, value, tone = "primary" }: AdminStatCardProps) {
  return (
    <Card className="flex items-center gap-4 p-6">
      <IconCircle icon={icon} tone={tone} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</p>
        <p className="font-display text-3xl font-bold tabular-nums text-ink-900">{value}</p>
      </div>
    </Card>
  );
}
