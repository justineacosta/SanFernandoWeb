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
    <div className={cn("overflow-x-auto rounded-lg border border-line bg-white", className)}>
      <table className="w-full text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line bg-surface-mid text-xs font-semibold uppercase tracking-wider text-ink-muted">
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
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-surface-low">
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={cn("px-6 py-4", column.align === "right" && "text-right", column.className)}
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
