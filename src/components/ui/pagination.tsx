import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { pageWindow } from "@/lib/pagination";

interface PaginationBaseProps {
  page: number;
  pageSize: number;
  total: number;
  /** Names the <nav> for screen readers, e.g. "Ordinances". */
  label?: string;
  className?: string;
}

type PaginationProps = PaginationBaseProps &
  (
    | {
        /** Callback mode: the parent holds `page` in local state. */
        onPageChange: (page: number) => void;
        hrefFor?: never;
      }
    | {
        /** Link mode: `page` is URL state and every slot is a real <Link>. */
        hrefFor: (page: number) => string;
        onPageChange?: never;
      }
  );

interface SlotProps {
  target: number;
  ariaLabel: string;
  isCurrent?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  onPageChange?: (page: number) => void;
  hrefFor?: (page: number) => string;
}

/**
 * One clickable slot.
 *
 * Link mode renders a real <a> so middle-click and open-in-new-tab work on the
 * public archives, where a page is a URL. Both modes live here so they cannot
 * drift apart visually.
 */
function Slot({
  target,
  ariaLabel,
  isCurrent,
  disabled,
  className,
  children,
  onPageChange,
  hrefFor,
}: SlotProps) {
  if (disabled) {
    return (
      <span aria-hidden="true" className={cn(className, "pointer-events-none opacity-40")}>
        {children}
      </span>
    );
  }
  if (hrefFor) {
    return (
      <Link
        href={hrefFor(target)}
        aria-label={ariaLabel}
        aria-current={isCurrent ? "page" : undefined}
        className={className}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-current={isCurrent ? "page" : undefined}
      onClick={() => onPageChange?.(target)}
      className={className}
    >
      {children}
    </button>
  );
}

const SLOT_BASE = "flex h-8 w-8 items-center justify-center rounded-full transition-colors";
const ARROW = cn(SLOT_BASE, "text-ink-500 hover:bg-ink-50 hover:text-ink-900");
const NUMBER = cn(SLOT_BASE, "text-sm font-semibold");

/** "Showing X to Y of Z entries" footer with windowed numbered page controls. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  hrefFor,
  label = "results",
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), totalPages);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  const mode = { onPageChange, hrefFor };

  return (
    <nav
      aria-label={`${label} pagination`}
      className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)}
    >
      <p className="text-sm text-ink-600">
        Showing <span className="font-semibold text-ink-900">{start}</span> to{" "}
        <span className="font-semibold text-ink-900">{end}</span> of{" "}
        <span className="font-semibold text-ink-900">{total}</span> entries
      </p>
      <div className="flex items-center gap-1">
        <Slot
          {...mode}
          target={current - 1}
          ariaLabel="Previous page"
          disabled={current === 1}
          className={ARROW}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Slot>
        {pageWindow(current, totalPages).map((slot, index) =>
          slot === "gap" ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-ink-500">
              &hellip;
            </span>
          ) : (
            <Slot
              key={slot}
              {...mode}
              target={slot}
              ariaLabel={`Page ${slot}`}
              isCurrent={slot === current}
              className={cn(
                NUMBER,
                slot === current
                  ? "bg-brand-500 text-ink-900"
                  : "text-ink-600 hover:bg-ink-50",
              )}
            >
              {slot}
            </Slot>
          ),
        )}
        <Slot
          {...mode}
          target={current + 1}
          ariaLabel="Next page"
          disabled={current === totalPages}
          className={ARROW}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Slot>
      </div>
    </nav>
  );
}
