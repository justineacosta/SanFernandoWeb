import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { listLatestUploads } from "@/features/transparency/queries";
import { UploadsPreviewTable } from "./uploads-preview-table";

// Five pages of five. "Browse all uploads" remains the route to everything;
// this is a cap on the preview, not the archive.
const PREVIEW_LIMIT = 25;
const PREVIEW_PAGE_SIZE = 5;

/** Short preview of the most recent uploads across legislative, documents, and projects. */
export async function LatestUploadsSection() {
  const uploads = await listLatestUploads(PREVIEW_LIMIT);
  return (
    <Section id="latest-uploads" tone="white" className="border-t border-ink-200">
      <SectionHeading
        title="Latest Uploads"
        description="Recent documents, legislation, and projects added to the transparency portal."
        action={{ label: "Browse all uploads", href: "/transparency/uploads" }}
      />
      {uploads.length === 0 ? (
        <p className="rounded-2xl bg-ink-50 p-8 text-center text-ink-600">
          No uploads published yet.
        </p>
      ) : (
        <UploadsPreviewTable items={uploads} pageSize={PREVIEW_PAGE_SIZE} />
      )}
    </Section>
  );
}
