import { Button } from "@/components/ui/button";
import { CtaBanner } from "@/components/sections/cta-banner";
import { CTA_IMAGE, INVOLVEMENT_ITEMS } from "@/features/home/data";

/** Community call-to-action band with the four ways to get involved. */
export function GetInvolvedSection() {
  return (
    <CtaBanner
      backgroundImage={CTA_IMAGE}
      title={
        <>
          Together, We Build
          <br />A Stronger Community
        </>
      }
      description="Your participation today shapes our better tomorrow."
      actions={
        <Button href="/contact" variant="primary" size="lg">
          Get Involved
        </Button>
      }
      aside={
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {INVOLVEMENT_ITEMS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="text-center">
              <Icon className="mx-auto mb-3 h-10 w-10 text-ink-300" aria-hidden="true" />
              <h4 className="mb-1 text-sm font-semibold tracking-tight">{title}</h4>
              <p className="text-xs text-ink-300">{description}</p>
            </div>
          ))}
        </div>
      }
    />
  );
}
