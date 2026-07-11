import { CalendarDays, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { MILESTONES } from "@/features/about/data";

/** Numbered achievement cards ("Community Milestones"). */
export function MilestonesSection() {
  return (
    <Section tone="muted" className="py-16 md:py-24">
      <SectionHeading
        title="Community Milestones"
        description="Key achievements that define our progress."
        action={{ label: "View All Reports", href: "/transparency" }}
      />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {MILESTONES.map(({ icon: Icon, title, description, meta }, index) => (
          <Card key={title} interactive className="rounded-xl p-8">
            <div className="mb-6 flex items-center justify-between">
              <Icon className="h-10 w-10 text-secondary" aria-hidden="true" />
              <span className="text-2xl font-bold text-line">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="mb-4 text-lg font-semibold text-primary">{title}</h3>
            <p className="mb-6 text-ink-muted">{description}</p>
            <div className="flex items-center gap-2 text-sm font-semibold text-secondary">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {meta}
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-8 md:hidden">
        <a
          href="/transparency"
          className="inline-flex items-center gap-2 font-bold text-primary hover:underline"
        >
          View All Reports <FileText className="h-5 w-5" aria-hidden="true" />
        </a>
      </div>
    </Section>
  );
}
