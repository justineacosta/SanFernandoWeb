import { Download, FileText } from "lucide-react";

interface DocumentLinkProps {
  title: string;
  href?: string;
}

/** Downloadable-document row with a PDF icon and download affordance. */
export function DocumentLink({ title, href = "#" }: DocumentLinkProps) {
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-3xl border border-ink-200 p-4 transition-colors hover:bg-ink-50"
    >
      <span className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-ink-500" aria-hidden="true" />
        <span className="text-sm font-semibold">{title}</span>
      </span>
      <Download className="h-5 w-5 text-ink-900" aria-hidden="true" />
    </a>
  );
}
