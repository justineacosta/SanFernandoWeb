import type { ArchiveMeta } from "@/types";
import { formatDate } from "@/lib/format";

/**
 * "Archived 22 July 2026 by Maria Santos" under a row in the Archived view.
 *
 * The audit log holds the same facts, but it is SuperAdmin-only — the staff
 * member working the Archived view holds a module permission and nothing more,
 * so without this they cannot tell a record retired last week from one retired
 * two years ago.
 *
 * Rows archived before migration 0020 have neither column. They say so plainly
 * rather than showing a date nobody recorded.
 */
export function ArchivedNote({ archivedAt, archivedByName }: ArchiveMeta) {
  if (!archivedAt && !archivedByName) {
    return <p className="mt-1 text-xs text-ink-500">Archived earlier</p>;
  }
  return (
    <p className="mt-1 text-xs text-ink-500">
      Archived{archivedAt ? ` ${formatDate(archivedAt)}` : ""}
      {archivedByName ? ` by ${archivedByName}` : ""}
    </p>
  );
}
