import { Download, FileText, Info } from "lucide-react";
import { formatFileSize } from "@/lib/storage";

/**
 * Download affordance for a document. When no PDF is attached the record is
 * still useful — it renders a "available at the barangay hall" note rather
 * than a dead link (spec §4).
 */
export function DocumentDownloadCard({
  fileUrl,
  title,
  fileSizeBytes = null,
}: {
  fileUrl: string | null;
  title: string;
  fileSizeBytes?: number | null;
}) {
  if (!fileUrl) {
    return (
      <p className="flex items-start gap-3 rounded-2xl bg-ink-50 p-4 text-sm text-ink-600">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-ink-500" aria-hidden="true" />
        <span>
          A digital copy is not yet uploaded. The full document is available on request at the
          barangay hall.
        </span>
      </p>
    );
  }

  const size = formatFileSize(fileSizeBytes);
  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-ink-200 p-4 transition-colors hover:border-brand-400 hover:bg-brand-100/40"
    >
      <FileText className="h-6 w-6 shrink-0 text-ink-900" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink-900">{title}</span>
        <span className="text-sm text-ink-500">PDF{size ? ` · ${size}` : ""}</span>
      </span>
      <Download className="h-5 w-5 shrink-0 text-ink-500" aria-hidden="true" />
      <span className="sr-only">Download {title}</span>
    </a>
  );
}
