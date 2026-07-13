import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { WASTE_SCHEDULE } from "@/features/services/data";

/** Garbage collection days for segregated household waste. */
export function WasteScheduleSection() {
  return (
    <Section tone="muted">
      <SectionHeading
        eyebrow="Sanitation"
        align="center"
        title={WASTE_SCHEDULE.title}
        description={WASTE_SCHEDULE.description}
      />
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-2">
        {WASTE_SCHEDULE.slots.map(({ icon: Icon, label, days, note }) => (
          <div
            key={label}
            className="flex flex-col items-center rounded-3xl border border-ink-200 bg-white p-8 text-center"
          >
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
              <Icon className="h-7 w-7 text-brand-700" aria-hidden="true" />
            </span>
            <h3 className="mb-1 text-lg font-semibold tracking-tight text-ink-900">{label}</h3>
            <p className="mb-3 font-display text-2xl font-semibold text-brand-700">{days}</p>
            <p className="text-sm text-ink-600">{note}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
