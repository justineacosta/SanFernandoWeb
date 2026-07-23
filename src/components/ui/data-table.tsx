import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  header: string;
  /** Render a cell for the given row. */
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Stable key for each row. */
  rowKey: (row: T) => string;
  caption?: string;
  className?: string;
}

/** Generic, accessible data table inside a scrollable bordered card. */
export function DataTable<T>({ columns, rows, rowKey, caption, className }: DataTableProps<T>) {
  return (
    <div
      className={cn(
        "relative overflow-x-auto rounded-3xl border border-ink-200/70 bg-white",
        className,
      )}
    >
      <table className="w-full text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={cn("px-6 py-4", column.align === "right" && "text-right", column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200/70">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-10 text-center text-ink-600">
                No records have been published yet.
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-ink-50">
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={cn("px-6 py-4 tabular-nums", column.align === "right" && "text-right", column.className)}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
