import { Eye, Flag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { Section } from "@/components/ui/section";
import { CORE_VALUES, MISSION, VISION } from "@/features/about/data";

/** Mission & vision bento grid followed by the four core values. */
export function MissionVisionSection() {
  return (
    <Section>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <Card className="flex flex-col justify-center rounded-xl p-10 md:col-span-7">
          <IconCircle icon={Flag} tone="primary" size="lg" className="mb-6" />
          <h2 className="mb-4 text-2xl font-semibold text-primary">Our Mission</h2>
          <p className="text-lg leading-relaxed text-ink-muted">{MISSION}</p>
        </Card>
        <div className="flex flex-col justify-center rounded-xl bg-primary p-10 text-white shadow-md md:col-span-5">
          <IconCircle icon={Eye} tone="inverse" size="lg" className="mb-6" />
          <h2 className="mb-4 text-2xl font-semibold">Our Vision</h2>
          <p className="text-lg leading-relaxed opacity-90">{VISION}</p>
        </div>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4">
        {CORE_VALUES.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-xl border border-line bg-surface-low p-6 text-center"
          >
            <Icon className="mx-auto mb-3 h-8 w-8 text-secondary" aria-hidden="true" />
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">
              {title}
            </h3>
            <p className="text-sm text-ink-muted">{description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
