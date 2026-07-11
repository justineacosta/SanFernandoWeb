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
      className="flex items-center justify-between rounded-lg border border-line p-4 transition-colors hover:bg-surface-low"
    >
      <span className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-outline" aria-hidden="true" />
        <span className="text-sm font-semibold">{title}</span>
      </span>
      <Download className="h-5 w-5 text-primary" aria-hidden="true" />
    </a>
  );
}
