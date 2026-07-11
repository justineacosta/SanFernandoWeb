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
        <Card className="flex flex-col justify-center rounded-3xl p-10 md:col-span-7">
          <IconCircle icon={Flag} tone="primary" size="lg" className="mb-6" />
          <h2 className="mb-4 text-2xl font-semibold tracking-tight text-ink-900">Our Mission</h2>
          <p className="text-lg leading-relaxed text-ink-600">{MISSION}</p>
        </Card>
        <div className="relative flex flex-col justify-center overflow-hidden rounded-3xl bg-ink-900 p-10 text-white shadow-md md:col-span-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
          />
          <div className="relative">
            <IconCircle icon={Eye} tone="inverse" size="lg" className="mb-6" />
            <h2 className="mb-4 text-2xl font-semibold tracking-tight">Our Vision</h2>
            <p className="text-lg leading-relaxed opacity-90">{VISION}</p>
          </div>
        </div>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4">
        {CORE_VALUES.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-3xl border border-ink-200 bg-ink-50 p-6 text-center"
          >
            <Icon className="mx-auto mb-3 h-8 w-8 text-brand-700" aria-hidden="true" />
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-900">
              {title}
            </h3>
            <p className="text-sm text-ink-600">{description}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
