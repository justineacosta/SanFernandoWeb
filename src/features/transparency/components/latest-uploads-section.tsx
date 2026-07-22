import Link from "next/link";
import type { UploadBrowseType } from "@/types";
import { formatOptionalDate } from "@/lib/format";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { listLatestUploads } from "@/features/transparency/queries";
import { FileDownloads } from "./file-downloads";

const TYPE_LABELS: Record<UploadBrowseType, string> = {
  legislative: "Legislative",
  document: "Document",
  project: "Project",
};

/** Short preview of the most recent uploads across legislative, documents, and projects. */
export async function LatestUploadsSection() {
  const uploads = await listLatestUploads(5);
  return (
    <Section id="latest-uploads" tone="white" className="border-t border-ink-200">
      <SectionHeading
        title="Latest Uploads"
        description="Recent documents, legislation, and projects added to the transparency portal."
        action={{ label: "Browse all uploads", href: "/transparency/uploads" }}
      />
      {uploads.length === 0 ? (
        <p className="rounded-2xl bg-ink-50 p-8 text-center text-ink-600">No uploads published yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-ink-200/70 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Latest documents uploaded to the transparency portal</caption>
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
                <th scope="col" className="px-6 py-4">
                  Title
                </th>
                <th scope="col" className="px-6 py-4">
                  Type
                </th>
                <th scope="col" className="px-6 py-4">
                  Date
                </th>
                <th scope="col" className="px-6 py-4 text-right">
                  Files
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200/70">
              {uploads.map((item) => (
                <tr key={item.key} className="transition-colors duration-(--duration-quick) hover:bg-ink-50">
                  <td className="px-6 py-4 font-medium text-ink-900">
                    {item.title}
                    {item.progress !== null ? (
                      <span className="ml-2 text-xs font-normal text-ink-500">({item.progress}%)</span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-ink-600">{TYPE_LABELS[item.type]}</td>
                  <td className="px-6 py-4 tabular-nums text-ink-600">{formatOptionalDate(item.date)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end gap-1">
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="text-sm font-semibold uppercase text-ink-900 hover:underline"
                        >
                          View
                        </Link>
                      ) : null}
                      <FileDownloads files={item.files} recordTitle={item.title} align="right" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
