import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { LegislativeTable } from "@/features/transparency/components/legislative-table";
import { ORDINANCES, RESOLUTIONS } from "@/features/transparency/data";

/** Ordinances and resolutions of the Sangguniang Barangay, each row expandable to its summary. */
export function LegislativeSection() {
  return (
    <Section tone="white" className="border-t border-ink-200">
      <SectionHeading
        title="Ordinances & Resolutions"
        description="Enacted legislation of the Sangguniang Barangay. Expand a row to read the document summary."
      />
      <div className="space-y-10">
        <div>
          <h3 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Ordinances
          </h3>
          <LegislativeTable caption="Barangay ordinances" documents={ORDINANCES} />
        </div>
        <div>
          <h3 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Resolutions
          </h3>
          <LegislativeTable caption="Barangay resolutions" documents={RESOLUTIONS} />
        </div>
      </div>
    </Section>
  );
}
