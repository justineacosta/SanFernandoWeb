import { Section } from "@/components/ui/section";
import { DividerHeading } from "@/components/shared/divider-heading";
import { OfficialCard } from "@/components/shared/official-card";
import { getOfficialsByGroup } from "@/features/officials/data";

/** Complete officials directory: chief executive, council, and administrative staff. */
export function LeadershipDirectory() {
  const executive = getOfficialsByGroup("executive");
  const council = getOfficialsByGroup("council");
  const administration = getOfficialsByGroup("administration");

  return (
    <Section>
      <div className="mb-20">
        <DividerHeading>Chief Executive</DividerHeading>
        <div className="flex justify-center">
          <div className="w-full max-w-md">
            {executive.map((official) => (
              <OfficialCard key={official.name} official={official} />
            ))}
          </div>
        </div>
      </div>

      <div className="mb-20">
        <DividerHeading>Barangay Council</DividerHeading>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {council.map((official) => (
            <OfficialCard
              key={official.name}
              official={official}
              highlighted={Boolean(official.badge)}
            />
          ))}
        </div>
      </div>

      <div>
        <DividerHeading>Administration</DividerHeading>
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
          {administration.map((official) => (
            <OfficialCard key={official.name} official={official} variant="compact" />
          ))}
        </div>
      </div>
    </Section>
  );
}
