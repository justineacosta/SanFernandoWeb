import { Button } from "@/components/ui/button";
import { CtaBanner } from "@/components/sections/cta-banner";
import { photoUrl } from "@/lib/storage";
import { getSiteBlocks, listInvolvementItems } from "@/features/site-content/queries";

/** Community call-to-action band with the four ways to get involved. */
export async function GetInvolvedSection() {
  const [blocks, items] = await Promise.all([getSiteBlocks(), listInvolvementItems()]);
  // The banner's own ink gradient stands on its own, so a cleared image drops
  // the prop entirely rather than passing "" — CtaBanner then skips the inline
  // background-image style instead of building one from an empty url().
  const ctaImage = blocks["home.cta_image"];
  return (
    <CtaBanner
      backgroundImage={ctaImage ? photoUrl(ctaImage) : undefined}
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
        items.length > 0 ? (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {items.map(({ icon: Icon, title, description }) => (
              <div key={title} className="text-center">
                <Icon className="mx-auto mb-3 h-10 w-10 text-ink-300" aria-hidden="true" />
                <h4 className="mb-1 text-sm font-semibold tracking-tight">{title}</h4>
                <p className="text-xs text-ink-300">{description}</p>
              </div>
            ))}
          </div>
        ) : undefined
      }
    />
  );
}
