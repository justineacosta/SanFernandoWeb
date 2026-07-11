import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

/** Freedom of Information request call-to-action panel. */
export function FoiSection() {
  return (
    <Section>
      <div className="relative flex flex-col items-center justify-between gap-8 overflow-hidden rounded-[2rem] bg-danger p-8 text-white md:flex-row md:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <h2 className="mb-4 text-2xl font-semibold">Request a Document</h2>
          <p className="text-ink-300">
            Can&apos;t find what you&apos;re looking for? You can submit a formal Freedom of
            Information (FOI) request to our records officer.
          </p>
        </div>
        <Button href="/contact" variant="primary" size="xl" className="relative shrink-0">
          Submit FOI Request
        </Button>
      </div>
    </Section>
  );
}
