import { SITE } from "@/constants/site";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

/** "Don't see the service you need?" help strip. */
export function HelpSection() {
  return (
    <Section tone="raised" className="py-16 md:py-20">
      <div className="text-center">
        <h2 className="mb-4 text-2xl font-semibold">Don&apos;t see the service you need?</h2>
        <p className="mx-auto mb-8 max-w-xl text-ink-600">
          Visit the Barangay Hall {SITE.officeHours.replace("Mon - Fri:", "from Monday to Friday,")}
          , or message us through our citizen help desk for personalized assistance.
        </p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Button href="/contact" size="lg">
            Message Help Desk
          </Button>
          <Button variant="outline" size="lg">
            Download All Forms
          </Button>
        </div>
      </div>
    </Section>
  );
}
