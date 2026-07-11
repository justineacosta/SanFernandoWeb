import { Siren } from "lucide-react";
import { EMERGENCY_HOTLINES } from "@/constants/site";
import { toTelHref } from "@/lib/format";
import { IconCircle } from "@/components/ui/icon-circle";
import type { Hotline } from "@/types";

interface EmergencyHotlinesCardProps {
  hotlines?: Hotline[];
}

/** Red-accented emergency hotline directory; used on the home hero and side rails. */
export function EmergencyHotlinesCard({ hotlines = EMERGENCY_HOTLINES }: EmergencyHotlinesCardProps) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-xl">
      <div className="flex items-center gap-3 border-b border-red-100 bg-red-50 px-6 py-4">
        <Siren className="h-6 w-6 text-danger" aria-hidden="true" />
        <h3 className="text-lg font-bold uppercase text-danger">Emergency Hotlines</h3>
      </div>
      <ul className="space-y-6 p-6">
        {hotlines.map((hotline) => (
          <li key={hotline.label} className="flex items-start gap-4">
            <IconCircle icon={hotline.icon} tone="secondary" size="sm" />
            <div>
              <p className="text-sm font-medium text-ink-muted">{hotline.label}</p>
              <a
                href={toTelHref(hotline.number)}
                className="font-bold text-secondary hover:underline"
              >
                {hotline.number}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
