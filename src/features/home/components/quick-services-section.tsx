import Link from "next/link";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { QUICK_SERVICES } from "@/features/home/data";

/** Six-up grid of the most requested citizen services. */
export function QuickServicesSection() {
  return (
    <Section tone="white">
      <SectionHeading
        title="Quick Services"
        underline
        action={{ label: "View All Services", href: "/services" }}
      />
      <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6">
        {QUICK_SERVICES.map((service) => (
          <Card key={service.title} interactive className="rounded-xl p-6 text-center">
            <IconCircle icon={service.icon} tone="secondary" size="lg" className="mb-4" />
            <h3 className="mb-2 font-sans font-bold leading-tight text-ink">{service.title}</h3>
            <Link
              href={service.href}
              className="text-sm font-medium text-secondary hover:underline"
            >
              {service.ctaLabel}
            </Link>
          </Card>
        ))}
      </div>
    </Section>
  );
}
