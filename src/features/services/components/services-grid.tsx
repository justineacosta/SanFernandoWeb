import { Section } from "@/components/ui/section";
import { ServiceCard } from "@/features/services/components/service-card";
import { listServices } from "@/features/services/queries";

/** Directory grid of citizen services. */
export async function ServicesGrid() {
  const services = await listServices();
  return (
    <Section>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </div>
    </Section>
  );
}
