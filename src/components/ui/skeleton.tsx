import { cn } from "@/lib/utils";

/**
 * Loading placeholders for the admin portal's `loading.tsx` boundaries.
 *
 * Every manager receives its rows as props from an async Server Component, so
 * there is no client fetch to spin on — the App Router's streaming boundary is
 * the right seam. These shapes deliberately mirror the real layouts (same card
 * radii, same column count, same row height) so the swap reads as content
 * arriving rather than the page rebuilding.
 *
 * The pulse is `motion-safe` only; reduced-motion users get a static block.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("motion-safe:animate-pulse rounded-lg bg-ink-100", className)}
    />
  );
}

/** Screen-reader announcement shared by every route skeleton. */
function LoadingLabel({ what }: { what: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      Loading {what}…
    </span>
  );
}

interface PageSkeletonProps {
  /** Named in the screen-reader announcement, e.g. "the officials directory". */
  what: string;
  children: React.ReactNode;
}

export function PageSkeleton({ what, children }: PageSkeletonProps) {
  return (
    <>
      <LoadingLabel what={what} />
      {children}
    </>
  );
}

/** The title + description block every admin page opens with. */
export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {action ? <Skeleton className="h-11 w-40 rounded-full" /> : null}
    </div>
  );
}

export function StatCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="mb-6 grid gap-6 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-3xl border border-ink-200/70 bg-white p-6">
          <Skeleton className="mb-4 h-11 w-11 rounded-full" />
          <Skeleton className="mb-2 h-7 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function FilterBarSkeleton({ selects = 2 }: { selects?: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-3xl border border-ink-200/70 bg-white p-5">
      <Skeleton className="h-11 flex-1 min-w-56 rounded-2xl" />
      {Array.from({ length: selects }, (_, i) => (
        <Skeleton key={i} className="h-11 w-40 rounded-2xl" />
      ))}
    </div>
  );
}

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({ rows = 6, columns = 5, className }: TableSkeletonProps) {
  return (
    <div className={cn("overflow-hidden rounded-3xl border border-ink-200/70 bg-white", className)}>
      <div className="flex gap-6 border-b border-ink-200/70 bg-ink-50 px-6 py-4">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1 bg-ink-200/70" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 border-b border-ink-200/40 px-6 py-5 last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            // The first cell is the record's name — wider, so rows do not read
            // as a uniform grid of identical bars.
            <Skeleton key={c} className={cn("h-4 flex-1", c === 0 && "flex-[2]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-3xl border border-ink-200/70 bg-white">
          <Skeleton className="aspect-4/3 rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
