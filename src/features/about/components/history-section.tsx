import Image from "next/image";
import { cn } from "@/lib/utils";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { listHistoryTimeline } from "@/features/site-content/queries";

/** Alternating vertical timeline of the barangay's history. */
export async function HistorySection() {
  const timeline = await listHistoryTimeline();
  // "Our Rich History" over a bare centre rule is worse than no section at all.
  if (timeline.length === 0) return null;
  return (
    <Section tone="white" className="py-16 md:py-24">
      <SectionHeading
        align="center"
        title="Our Rich History"
        description="From an eighteenth-century founding to a modern urban barangay at the heart of San Nicolas."
      />
      <div className="relative">
        <div
          className="absolute left-1/2 hidden h-full w-0.5 -translate-x-1/2 bg-ink-200 md:block"
          aria-hidden="true"
        />
        <ol className="space-y-12">
          {timeline.map((entry, index) => {
            const reversed = index % 2 === 1;
            return (
              <li
                key={entry.year}
                className={cn(
                  "relative flex flex-col items-center gap-8",
                  reversed ? "md:flex-row-reverse" : "md:flex-row",
                )}
              >
                <div className={cn("w-full md:w-1/2", !reversed && "md:text-right")}>
                  <span className="mb-2 inline-block rounded-full bg-ink-100 px-4 py-1 font-bold text-ink-900">
                    {entry.year}
                  </span>
                  <h3 className="mb-2 text-xl font-semibold tracking-tight">{entry.title}</h3>
                  <p className="text-ink-600">{entry.description}</p>
                </div>
                <div
                  className="absolute left-1/2 z-10 hidden h-4 w-4 -translate-x-1/2 rounded-full border-4 border-brand-400 bg-brand-100 md:block"
                  aria-hidden="true"
                />
                <div className="w-full md:w-1/2">
                  <div className="h-48 overflow-hidden rounded-2xl border border-ink-200 bg-brand-100/50">
                    <Image
                      src={entry.image}
                      alt={entry.imageAlt}
                      width={640}
                      height={192}
                      className={cn(
                        "h-full w-full",
                        entry.imageFit === "contain" ? "object-contain p-4" : "object-cover",
                      )}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}
