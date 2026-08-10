import { CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { serviceHref } from "@/features/services/flow";
import type { ServiceRecord } from "@/types";

interface ServiceCardProps {
  service: ServiceRecord;
}

/** Service directory card with an expandable requirements checklist. */
export function ServiceCard({ service }: ServiceCardProps) {
  const isDanger = service.tone === "danger";
  const RequirementIcon = isDanger ? Info : CheckCircle2;

  return (
    <Card interactive className="group flex h-full flex-col rounded-3xl p-8 hover:border-brand-300">
      <IconCircle
        icon={service.icon}
        tone={isDanger ? "danger" : "primary"}
        className={cn(
          "mb-4 transition-colors duration-(--duration-quick)",
          !isDanger && "group-hover:bg-brand-200 group-hover:text-brand-800",
        )}
      />
      <h3 className="mb-2 text-xl font-semibold">{service.title}</h3>
      <p className="mb-8 flex-grow text-ink-600">{service.description}</p>
      <Accordion
        className="border-t border-ink-200 pt-4"
        trigger={<span>{service.requirementsLabel}</span>}
        triggerClassName={isDanger ? "text-danger" : "text-ink-900"}
      >
        <ul className="space-y-2 text-sm text-ink-600">
          {service.requirements.map((requirement, index) => (
            <li key={`${index}-${requirement}`} className="flex items-start gap-2">
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
          <Button
            href={serviceHref(service)}
            variant={isDanger ? "outline-danger" : "primary"}
            className="mt-6 w-full"
          >
            {service.ctaLabel}
          </Button>
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
