import { BadgeCheck, Navigation } from "lucide-react";
import { SITE } from "@/constants/site";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { MAP_IMAGE } from "@/features/contact/data";

/** Barangay hall location panel with a map preview and info overlay. */
export function MapSection() {
  return (
    <Section>
      <Card className="overflow-hidden rounded-xl p-0">
        <div className="flex flex-col justify-between gap-4 border-b border-line p-8 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold text-primary">Barangay Hall Location</h2>
            <p className="text-ink-muted">
              Visit us during office hours: {SITE.officeHours}
            </p>
          </div>
          <a
            href="#"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-secondary hover:underline"
          >
            <Navigation className="h-5 w-5" aria-hidden="true" />
            Get Directions
          </a>
        </div>
        <div className="relative h-[450px] overflow-hidden bg-surface-high">
          <div
            role="img"
            aria-label="Map showing the location of the Sampaguita Barangay Hall"
            className="h-full w-full bg-cover bg-center opacity-80 grayscale-20"
            style={{ backgroundImage: `url(${MAP_IMAGE})` }}
          />
          <div className="absolute bottom-6 left-6 right-6 rounded-lg border border-line bg-white/95 p-6 shadow-xl backdrop-blur-md md:right-auto md:w-80">
            <h3 className="mb-2 text-lg font-semibold">Sampaguita Barangay Hall</h3>
            <p className="mb-4 text-sm text-ink-muted">
              The main administrative hub for all citizen services and local council sessions.
            </p>
            <div className="flex items-center gap-2 text-primary">
              <BadgeCheck className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Official Government Site
              </span>
            </div>
          </div>
        </div>
      </Card>
    </Section>
  );
}
