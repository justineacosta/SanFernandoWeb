import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminEmptyStateProps {
  message: string;
  /** Omit when there's nothing to clear — e.g. the table has no records at all. */
  onClear?: () => void;
}

/** Shown inside list cards when active filters match no records, or the table is empty. */
export function AdminEmptyState({ message, onClear }: AdminEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <SearchX className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-ink-600">{message}</p>
      {onClear ? (
        <Button variant="ghost" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
