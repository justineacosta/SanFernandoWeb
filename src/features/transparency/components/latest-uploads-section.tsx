import { formatDate } from "@/lib/format";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { LATEST_UPLOADS } from "@/features/transparency/data";
import type { TransparencyDocument } from "@/types";

const columns: DataTableColumn<TransparencyDocument>[] = [
  {
    header: "Document Title",
    cell: (doc) => {
      const Icon = doc.icon;
      return (
        <span className="flex items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="font-medium text-ink">{doc.title}</span>
        </span>
      );
    },
  },
  { header: "Category", cell: (doc) => doc.category },
  {
    header: "Date Released",
    cell: (doc) => <span className="text-ink-muted">{formatDate(doc.date)}</span>,
  },
  {
    header: "Action",
    align: "right",
    cell: () => (
      <a href="#" className="font-semibold uppercase text-primary hover:underline">
        Download
      </a>
    ),
  },
];

/** Table of the most recent documents added to the portal. */
export function LatestUploadsSection() {
  return (
    <Section tone="white" className="border-t border-line">
      <SectionHeading
        title="Latest Uploads"
        description="Recent documents added to the transparency portal."
      />
      <DataTable
        caption="Latest documents uploaded to the transparency portal"
        columns={columns}
        rows={LATEST_UPLOADS}
        rowKey={(doc) => doc.title}
      />
    </Section>
  );
}
