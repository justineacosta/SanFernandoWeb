import Link from "next/link";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { LegislativeTable } from "@/features/transparency/components/legislative-table";
import { listRecentLegislative } from "@/features/transparency/queries";

// Five pages of five. The section is still a preview — the archive link below
// is the route to everything — but a single screenful was too little to be
// worth the trip for most readers.
const PREVIEW_LIMIT = 25;
const PREVIEW_PAGE_SIZE = 5;

/** Ordinances and resolutions of the Sangguniang Barangay, each row expandable to its summary. */
export async function LegislativeSection() {
  const [ordinances, resolutions] = await Promise.all([
    listRecentLegislative("ordinance", PREVIEW_LIMIT),
    listRecentLegislative("resolution", PREVIEW_LIMIT),
  ]);

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
          <LegislativeTable
            caption="Barangay ordinances"
            documents={ordinances}
            previewPageSize={PREVIEW_PAGE_SIZE}
          />
        </div>
        <div>
          <h3 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Resolutions
          </h3>
          <LegislativeTable
            caption="Barangay resolutions"
            documents={resolutions}
            previewPageSize={PREVIEW_PAGE_SIZE}
          />
        </div>
      </div>
      <p className="mt-8 text-center">
        <Link href="/transparency/legislative" className="font-semibold text-ink-900 hover:underline">
          Browse and search the full archive →
        </Link>
      </p>
    </Section>
  );
}
