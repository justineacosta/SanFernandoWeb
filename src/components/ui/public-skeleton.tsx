import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholders for the public site.
 *
 * These are `Suspense` fallbacks, not `loading.tsx` bodies, for everything with
 * a `PageHero`. Every public list page is a static hero followed by one async
 * section, so replacing the whole route would flash the hero — which needs no
 * data — as a grey block on each navigation. Wrapping only the async section
 * keeps the heading on screen and shimmers just the part that is waiting.
 *
 * Detail routes (`/officials/[slug]` and friends) do use `loading.tsx`: they
 * await the record before they can render anything at all, including the title.
 *
 * Shapes mirror the real layouts, and the pulse inside `Skeleton` is
 * `motion-safe` only.
 */

/** Screen-reader announcement, mirroring the portal's PageSkeleton. */
export function LoadingLabel({ what }: { what: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      Loading {what}…
    </span>
  );
}

/** The hero block, for detail routes whose title comes from the record. */
export function HeroSkeleton() {
  return (
    <section className="pb-14 pt-32 md:pb-20 md:pt-44">
      <Container>
        <div className="max-w-3xl space-y-5">
          <Skeleton className="h-5 w-32 rounded-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-6 w-full max-w-xl" />
        </div>
      </Container>
    </section>
  );
}

interface CardGridProps {
  count?: number;
  /** Tailwind column classes, matched to the real grid. */
  columns?: string;
  what: string;
}

/** Services directory, officials directory — a grid of equal cards. */
export function PublicCardGridSkeleton({
  count = 6,
  columns = "md:grid-cols-2 lg:grid-cols-3",
  what,
}: CardGridProps) {
  return (
    <Section>
      <LoadingLabel what={what} />
      <div className={`grid grid-cols-1 gap-8 ${columns}`}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="rounded-[2rem] border border-ink-200 bg-white p-8">
            <Skeleton className="mb-5 h-12 w-12 rounded-2xl" />
            <Skeleton className="mb-3 h-6 w-3/4" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-6 h-4 w-5/6" />
            <Skeleton className="h-11 w-36 rounded-full" />
          </div>
        ))}
      </div>
    </Section>
  );
}

/** The news feed: a lead story then a stack of article rows. */
export function NewsFeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-8">
      <LoadingLabel what="the latest news" />
      <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white">
        <Skeleton className="aspect-16/9 rounded-none" />
        <div className="space-y-3 p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-5 rounded-3xl border border-ink-200 bg-white p-5">
          <Skeleton className="size-28 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-3 py-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The full News archive: a 3-column grid of image-topped cards. */
export function NewsArchiveSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-8">
      <LoadingLabel what="the news archive" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-3xl border border-ink-200 bg-white">
            <Skeleton className="h-48 rounded-none" />
            <div className="space-y-3 p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The Events archive: a stack of two-column event rows. */
export function EventsArchiveSkeleton({ count = 4, what }: { count?: number; what: string }) {
  return (
    <div className="space-y-6">
      <LoadingLabel what={what} />
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex gap-4 rounded-3xl border border-ink-200 bg-white p-5">
            <Skeleton className="h-24 w-20 shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The announcements rail beside the news feed. */
export function NewsSidebarSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-white p-6">
        <Skeleton className="mb-5 h-6 w-40" />
        <div className="space-y-5">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The Notices archive: a 3-column grid of announcement rows. */
export function NoticesArchiveSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-6">
      <LoadingLabel what="the notices archive" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex gap-4 rounded-3xl border border-ink-200 bg-white p-5">
            <Skeleton className="h-20 w-24 shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The legislative archive and uploads browser: filter bar over a table. */
export function PublicTableSkeleton({
  rows = 8,
  what,
}: {
  rows?: number;
  what: string;
}) {
  return (
    <Section>
      <LoadingLabel what={what} />
      <div className="mb-6 flex flex-wrap gap-3">
        <Skeleton className="h-12 min-w-64 flex-1 rounded-2xl" />
        <Skeleton className="h-12 w-40 rounded-2xl" />
      </div>
      <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-6 border-b border-ink-200/60 px-6 py-5 last:border-b-0"
          >
            <Skeleton className="h-4 flex-[2]" />
            <Skeleton className="hidden h-4 flex-1 sm:block" />
            <Skeleton className="hidden h-4 w-28 md:block" />
          </div>
        ))}
      </div>
    </Section>
  );
}

/** A prose article or record page, used by the detail routes' loading.tsx. */
export function ArticleSkeleton({ what }: { what: string }) {
  return (
    <>
      <LoadingLabel what={what} />
      <HeroSkeleton />
      <Section className="pt-0">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="aspect-16/9 w-full rounded-3xl" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className={i % 4 === 3 ? "h-4 w-2/3" : "h-4 w-full"} />
          ))}
        </div>
      </Section>
    </>
  );
}
