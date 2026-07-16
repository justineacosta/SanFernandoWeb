import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";

/** Shown when a service exists but the barangay has toggled it off. */
export function ApplyUnavailable({ title }: { title: string }) {
  return (
    <Section>
      <Card className="mx-auto max-w-2xl rounded-3xl p-8 text-center">
        <h2 className="mb-2 font-display text-2xl font-bold text-ink-900">
          {title} is temporarily unavailable
        </h2>
        <p className="mb-6 text-ink-600">
          Online applications for this document are paused right now. You can still apply in
          person at the barangay hall, or check back here later.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button href="/services" variant="primary">
            Back to services
          </Button>
          <Button href="/contact" variant="ghost">
            Contact the barangay
          </Button>
        </div>
      </Card>
    </Section>
  );
}
