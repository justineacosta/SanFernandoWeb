import { PhoneCall, Stethoscope, TriangleAlert } from "lucide-react";
import { Section } from "@/components/ui/section";
import { ServiceCard } from "@/features/services/components/service-card";
import { EMERGENCY_ASSISTANCE, SERVICES } from "@/features/services/data";

/** Directory grid of citizen services plus the emergency assistance card. */
export function ServicesGrid() {
  return (
    <Section>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}

        <div className="flex flex-col items-center gap-8 rounded-[2rem] border border-ink-200 bg-brand-100 p-8 text-ink-900 md:flex-row lg:col-span-2">
          <div className="flex-grow">
            <h3 className="mb-2 text-xl font-semibold">{EMERGENCY_ASSISTANCE.title}</h3>
            <p className="mb-4 text-ink-600">{EMERGENCY_ASSISTANCE.description}</p>
            <div className="flex flex-wrap gap-4">
              {EMERGENCY_ASSISTANCE.hotlines.map((hotline, index) => (
                <span
                  key={hotline.label}
                  className="flex items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2"
                >
                  {index === 0 ? (
                    <PhoneCall className="h-5 w-5 text-danger" aria-hidden="true" />
                  ) : (
                    <Stethoscope className="h-5 w-5 text-ink-900" aria-hidden="true" />
                  )}
                  <span className="font-bold">
                    {hotline.label}: {hotline.number}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <TriangleAlert className="h-20 w-20 shrink-0 opacity-30" aria-hidden="true" />
        </div>
      </div>
    </Section>
  );
}
