import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminEmptyStateProps {
  message: string;
  onClear: () => void;
}

/** Shown inside list cards when active filters match no records. */
export function AdminEmptyState({ message, onClear }: AdminEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
      <SearchX className="h-10 w-10 text-ink-400" aria-hidden="true" />
      <p className="text-ink-600">{message}</p>
      <Button variant="ghost" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
