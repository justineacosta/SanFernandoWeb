import { Siren } from "lucide-react";
import { EMERGENCY_HOTLINES } from "@/constants/site";
import { toTelHref } from "@/lib/format";
import { IconCircle } from "@/components/ui/icon-circle";
import type { Hotline } from "@/types";

interface EmergencyHotlinesCardProps {
  hotlines?: Hotline[];
}

/** Dark glassy emergency hotline directory; used on the home hero and side rails. */
export function EmergencyHotlinesCard({ hotlines = EMERGENCY_HOTLINES }: EmergencyHotlinesCardProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-ink-900 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-6 py-4">
        <Siren className="h-5 w-5 text-danger-bright" aria-hidden="true" />
        <h3 className="font-display text-lg font-semibold tracking-tight">Emergency Hotlines</h3>
      </div>
      <ul className="space-y-5 p-6">
        {hotlines.map((hotline) => (
          <li key={hotline.label} className="flex items-start gap-4">
            <IconCircle icon={hotline.icon} tone="inverse" size="sm" />
            <div>
              <p className="text-sm text-ink-300">{hotline.label}</p>
              <a
                href={toTelHref(hotline.number)}
                className="font-semibold text-white transition-colors hover:text-brand-300"
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
