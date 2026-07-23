import { HeroSkeleton, LoadingLabel } from "@/components/ui/public-skeleton";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";

/** The application form: hero, then the requirements card and the field stack. */
export default function Loading() {
  return (
    <>
      <LoadingLabel what="this application form" />
      <HeroSkeleton />
      <Section className="pt-0">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-3xl border border-ink-200 bg-white p-8 space-y-3">
            <Skeleton className="h-6 w-48" />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <div className="rounded-3xl border border-ink-200 bg-white p-8">
            <div className="grid gap-6 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-12 w-full rounded-2xl" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-8 h-12 w-44 rounded-full" />
          </div>
        </div>
      </Section>
    </>
  );
}
