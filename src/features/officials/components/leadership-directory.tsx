import type { OfficialListItem } from "@/types";
import { Section } from "@/components/ui/section";
import { DividerHeading } from "@/components/shared/divider-heading";
import { OfficialCard } from "@/components/shared/official-card";
import { listPublishedOfficials } from "@/features/officials/queries";

/** Shared compact-card grid used by the Administration and Members sections. */
function CompactSection({
  heading,
  officials,
  className,
}: {
  heading: string;
  officials: OfficialListItem[];
  className?: string;
}) {
  return (
    <div className={className}>
      <DividerHeading>{heading}</DividerHeading>
      <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-8">
        {officials.map((official) => (
          <div key={official.id} className="w-full md:w-[calc(50%-1rem)]">
            <OfficialCard official={official} variant="compact" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Complete officials directory: chief executive, council, administration, members. */
export async function LeadershipDirectory() {
  const officials = await listPublishedOfficials();

  if (officials.length === 0) {
    return (
      <Section>
        <p className="text-center text-ink-500">
          The officials directory is being updated. Please check back shortly.
        </p>
      </Section>
    );
  }

  const executive = officials.filter((official) => official.group === "executive");
  const council = officials.filter((official) => official.group === "council");
  const administration = officials.filter((official) => official.group === "administration");
  const members = officials.filter((official) => official.group === "members");

  return (
    <Section>
      {executive.length > 0 ? (
        <div className="mb-20">
          <DividerHeading>Chief Executive</DividerHeading>
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              {executive.map((official) => (
                <OfficialCard key={official.id} official={official} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {council.length > 0 ? (
        <div className="mb-20">
          <DividerHeading>Barangay Council</DividerHeading>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {council.map((official) => (
              <OfficialCard
                key={official.id}
                official={official}
                highlighted={Boolean(official.badge)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {administration.length > 0 ? (
        <CompactSection
          heading="Administration"
          officials={administration}
          className={members.length > 0 ? "mb-20" : undefined}
        />
      ) : null}

      {members.length > 0 ? (
        <CompactSection heading="Barangay Members" officials={members} />
      ) : null}
    </Section>
  );
}
