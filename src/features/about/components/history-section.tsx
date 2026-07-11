import Image from "next/image";
import { cn } from "@/lib/utils";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { HISTORY_TIMELINE } from "@/features/about/data";

/** Alternating vertical timeline of the barangay's history. */
export function HistorySection() {
  return (
    <Section tone="white" className="py-16 md:py-24">
      <SectionHeading
        align="center"
        title="Our Rich History"
        description="Tracing our roots from a small agricultural settlement to a thriving urban center."
      />
      <div className="relative">
        <div
          className="absolute left-1/2 hidden h-full w-0.5 -translate-x-1/2 bg-line md:block"
          aria-hidden="true"
        />
        <ol className="space-y-12">
          {HISTORY_TIMELINE.map((entry, index) => {
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
                  <span className="mb-2 inline-block rounded-full bg-surface-high px-4 py-1 font-bold text-primary">
                    {entry.year}
                  </span>
                  <h3 className="mb-2 text-xl font-semibold">{entry.title}</h3>
                  <p className="text-ink-muted">{entry.description}</p>
                </div>
                <div
                  className="absolute left-1/2 z-10 hidden h-4 w-4 -translate-x-1/2 rounded-full border-4 border-white bg-primary md:block"
                  aria-hidden="true"
                />
                <div className="w-full md:w-1/2">
                  <div className="h-48 overflow-hidden rounded-lg border border-line">
                    <Image
                      src={entry.image}
                      alt={entry.imageAlt}
                      width={640}
                      height={192}
                      className={cn(
                        "h-full w-full object-cover",
                        index === 0 && "opacity-80 grayscale",
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
