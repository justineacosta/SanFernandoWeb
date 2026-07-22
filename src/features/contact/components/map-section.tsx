import { BadgeCheck, Navigation } from "lucide-react";
import Image from "next/image";
import { SITE } from "@/constants/site";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { MAP_IMAGE } from "@/features/contact/data";

/** Barangay hall location panel with a map preview and info overlay. */
export function MapSection() {
  return (
    <Section>
      <Card className="rounded-3xl p-6 md:p-8">
        <div className="flex flex-col justify-between gap-4 pb-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
              Barangay Hall Location
            </h2>
            <p className="text-ink-600">Visit us during office hours: {SITE.officeHours}</p>
          </div>
          <Button href="#" variant="accent" size="sm">
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Get Directions
          </Button>
        </div>
        <div className="relative h-[450px] overflow-hidden rounded-[2rem] border border-ink-200/70 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.25)]">
          <Image
            src={MAP_IMAGE}
            alt="Map showing the location of the San Fernando Barangay Hall"
            fill
            sizes="(min-width: 768px) 100vw, 100vw"
            className="object-cover"
          />
          <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-ink-200 bg-white/95 p-6 shadow-xl backdrop-blur-md md:right-auto md:w-80">
            <h3 className="mb-2 text-lg font-semibold">San Fernando Barangay Hall</h3>
            <p className="mb-4 text-sm text-ink-600">
              The main administrative hub for all citizen services and local council sessions.
            </p>
            <div className="flex items-center gap-2 text-ink-900">
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
