import { CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import type { ServiceRecord } from "@/types";

interface ServiceCardProps {
  service: ServiceRecord;
}

/** Service directory card with an expandable requirements checklist. */
export function ServiceCard({ service }: ServiceCardProps) {
  const isDanger = service.tone === "danger";
  const RequirementIcon = isDanger ? Info : CheckCircle2;

  return (
    <Card interactive className="flex h-full flex-col rounded-3xl p-8">
      <IconCircle
        icon={service.icon}
        tone={isDanger ? "danger" : "primary"}
        className="mb-4"
      />
      <h3 className="mb-2 text-xl font-semibold">{service.title}</h3>
      <p className="mb-8 flex-grow text-ink-600">{service.description}</p>
      <Accordion
        className="border-t border-ink-200 pt-4"
        trigger={<span>{service.requirementsLabel}</span>}
        triggerClassName={isDanger ? "text-danger" : "text-ink-900"}
      >
        <ul className="space-y-2 text-sm text-ink-600">
          {service.requirements.map((requirement) => (
            <li key={requirement} className="flex items-start gap-2">
              <RequirementIcon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  isDanger ? "text-danger" : "text-brand-500",
                )}
                aria-hidden="true"
              />
              <span>{requirement}</span>
            </li>
          ))}
        </ul>
        {service.isAvailable ? (
          isDanger ? (
            // The complaint flow lands in plan 2C. Disabled rather than merely
            // inert: now that "Apply Online" navigates, a live-looking button
            // that does nothing reads as broken.
            <div className="mt-6">
              <Button variant="outline-danger" className="w-full" disabled>
                {service.ctaLabel}
              </Button>
              <p className="mt-2 text-center text-xs font-medium text-ink-500">
                Please file this in person at the barangay hall.
              </p>
            </div>
          ) : (
            <Button
              href={`/services/apply/${service.id}`}
              variant="primary"
              className="mt-6 w-full"
            >
              {service.ctaLabel}
            </Button>
          )
        ) : (
          <div className="mt-6">
            <Button
              variant={isDanger ? "outline-danger" : "primary"}
              className="w-full"
              disabled
            >
              {service.ctaLabel}
            </Button>
            <p className="mt-2 text-center text-xs font-medium text-ink-500">
              Temporarily unavailable — please visit the barangay hall.
            </p>
          </div>
        )}
      </Accordion>
    </Card>
  );
}
