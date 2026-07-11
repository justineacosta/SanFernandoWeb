import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

/** Freedom of Information request call-to-action panel. */
export function FoiSection() {
  return (
    <Section>
      <div className="flex flex-col items-center justify-between gap-8 rounded-xl bg-danger p-8 text-white md:flex-row md:p-12">
        <div className="max-w-2xl">
          <h2 className="mb-4 text-2xl font-semibold">Request a Document</h2>
          <p className="opacity-90">
            Can&apos;t find what you&apos;re looking for? You can submit a formal Freedom of
            Information (FOI) request to our records officer.
          </p>
        </div>
        <Button href="/contact" variant="white" size="xl" className="shrink-0">
          Submit FOI Request
        </Button>
      </div>
    </Section>
  );
}
