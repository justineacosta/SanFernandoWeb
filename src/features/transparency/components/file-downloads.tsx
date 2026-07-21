import type { TransparencyFile } from "@/types";

interface FileDownloadsProps {
  files: TransparencyFile[];
  /** For screen-reader context on the links. */
  recordTitle: string;
  align?: "left" | "right";
}

/** 0 files → barangay-hall note; 1 → a Download link; >1 → an expandable list. */
export function FileDownloads({ files, recordTitle, align = "left" }: FileDownloadsProps) {
  if (files.length === 0) {
    return <span className="text-sm text-ink-500">At the barangay hall</span>;
  }
  if (files.length === 1) {
    const file = files[0];
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="font-semibold uppercase text-ink-900 hover:underline">
        Download<span className="sr-only"> {recordTitle}</span>
      </a>
    );
  }
  return (
    <details className={align === "right" ? "text-right" : ""}>
      <summary className="cursor-pointer font-semibold uppercase text-ink-900 hover:underline">
        {files.length} files
      </summary>
      <ul className="mt-2 space-y-1">
        {files.map((file, index) => (
          <li key={file.id}>
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm text-ink-700 hover:underline">
              {file.label || `File ${index + 1}`}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
