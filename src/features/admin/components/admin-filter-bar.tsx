import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/form";

export interface FilterSelectConfig {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

interface AdminFilterBarProps {
  /**
   * `id` is required rather than hardcoded because the transparency manager
   * renders two filter bars on one page; duplicate DOM ids would break the
   * <label for> association for screen readers on both.
   */
  search?: { id: string; value: string; placeholder: string; onChange: (value: string) => void };
  selects?: FilterSelectConfig[];
  date?: { label: string; value: string; onChange: (value: string) => void };
  className?: string;
}

/** Wrapping row of list filters: optional search, selects, and date input. */
export function AdminFilterBar({ search, selects, date, className }: AdminFilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {search ? (
        <div className="relative min-w-56 flex-1">
          <Search
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <label htmlFor={search.id} className="sr-only">
            {search.placeholder}
          </label>
          <input
            id={search.id}
            type="search"
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder}
            className="w-full rounded-full border border-ink-200 bg-white py-2.5 pl-10 pr-4 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-400/20"
          />
        </div>
      ) : null}
      {selects?.map((select) => (
        <div key={select.id}>
          <label htmlFor={select.id} className="sr-only">
            {select.label}
          </label>
          <Select
            id={select.id}
            value={select.value}
            onChange={(event) => select.onChange(event.target.value)}
            className="w-auto rounded-full py-2.5 text-sm"
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
      {date ? (
        <div>
          <label htmlFor="admin-filter-date" className="sr-only">
            {date.label}
          </label>
          <input
            id="admin-filter-date"
            type="date"
            value={date.value}
            onChange={(event) => date.onChange(event.target.value)}
            className="rounded-full border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-600 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-400/20"
          />
        </div>
      ) : null}
    </div>
  );
}
