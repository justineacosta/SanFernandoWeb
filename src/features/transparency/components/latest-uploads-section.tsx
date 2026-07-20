import { formatDate } from "@/lib/format";
import { resolveIcon } from "@/lib/icon-map";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { listLatestPublishedDocuments } from "@/features/transparency/queries";
import type { TransparencyDocumentItem } from "@/types";

const columns: DataTableColumn<TransparencyDocumentItem>[] = [
  {
    header: "Document Title",
    cell: (doc) => {
      const Icon = resolveIcon(doc.categoryIconName);
      return (
        <span className="flex items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-ink-900" aria-hidden="true" />
          <span className="font-medium text-ink-900">{doc.title}</span>
        </span>
      );
    },
  },
  { header: "Category", cell: (doc) => doc.categoryLabel },
  {
    header: "Date Released",
    cell: (doc) => <span className="text-ink-600">{formatDate(doc.dateReleased)}</span>,
  },
  {
    header: "Action",
    align: "right",
    cell: (doc) =>
      doc.fileUrl ? (
        <a
          href={doc.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold uppercase text-ink-900 hover:underline"
        >
          Download
          <span className="sr-only"> {doc.title}</span>
        </a>
      ) : (
        <span className="text-sm text-ink-500">At the barangay hall</span>
      ),
  },
];

/** Table of the most recent documents added to the portal. */
export async function LatestUploadsSection() {
  const documents = await listLatestPublishedDocuments(4);
  return (
    <Section id="latest-uploads" tone="white" className="border-t border-ink-200">
      <SectionHeading
        title="Latest Uploads"
        description="Recent documents added to the transparency portal."
      />
      <DataTable
        caption="Latest documents uploaded to the transparency portal"
        columns={columns}
        rows={documents}
        rowKey={(doc) => doc.id}
      />
    </Section>
  );
}
