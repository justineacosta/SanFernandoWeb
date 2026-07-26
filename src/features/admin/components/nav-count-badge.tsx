import { cn } from "@/lib/utils";

interface NavCountBadgeProps {
  count: number;
  /**
   * True inside the collapsed 72px rail: renders an absolutely-positioned
   * dot instead of a pill, so it adds zero layout. The rail's peek must not
   * move or resize anything — a peek opens under the pointer, and anything
   * that shifts takes the row you were aiming at out from under you.
   */
  collapsed?: boolean;
  className?: string;
}

/**
 * Unhandled-work count for a request nav row.
 *
 * Not `Badge` (`src/components/ui/badge.tsx`) — that is a large uppercase
 * status chip (`rounded-full px-3 py-1 uppercase tracking-wider`), sized for
 * a table cell, not a 40px-tall nav row.
 *
 * Renders nothing for a zero count: an empty queue should look exactly like
 * a module with no notifications feature at all, not like a "0" nobody
 * asked to see.
 */
export function NavCountBadge({ count, collapsed, className }: NavCountBadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);

  if (collapsed) {
    return (
      <>
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-ink-950",
            className,
          )}
        />
        <span className="sr-only">, {count} unhandled</span>
      </>
    );
  }

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-[0.7rem] font-semibold tabular-nums text-white",
          className,
        )}
      >
        {label}
      </span>
      <span className="sr-only">, {count} unhandled</span>
    </>
  );
}
