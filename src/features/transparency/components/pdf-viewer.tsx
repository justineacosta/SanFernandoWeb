import { DocumentDownloadCard } from "./document-download-card";

/**
 * Inline PDF preview. `<object>` renders natively on desktop browsers; mobile
 * browsers and anything without a PDF plugin fall back to the element's
 * children, which is the same download card used elsewhere — there is never a
 * viewer-shaped hole on the page.
 */
export function PdfViewer({
  fileUrl,
  title,
  fileSizeBytes = null,
}: {
  fileUrl: string | null;
  title: string;
  fileSizeBytes?: number | null;
}) {
  if (!fileUrl) {
    return <DocumentDownloadCard fileUrl={null} title={title} />;
  }

  return (
    <div className="space-y-4">
      <object
        data={fileUrl}
        type="application/pdf"
        aria-label={`${title} (PDF preview)`}
        className="hidden h-[70vh] w-full rounded-2xl border border-ink-200 md:block"
      >
        <DocumentDownloadCard fileUrl={fileUrl} title={title} fileSizeBytes={fileSizeBytes} />
      </object>
      <DocumentDownloadCard fileUrl={fileUrl} title={title} fileSizeBytes={fileSizeBytes} />
    </div>
  );
}
