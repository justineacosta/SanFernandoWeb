import { Phone, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SITE } from "@/constants/site";

/** Red 24/7 emergency action-center strip below the directory. */
export function ActionCenterBanner() {
  return (
    <div className="pb-16">
      <Container>
        <div className="relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-3xl bg-danger p-8 text-danger-soft shadow-lg md:flex-row">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/15 blur-3xl"
          />
          <div className="relative flex items-center gap-4">
            <span className="rounded-full bg-danger-deep p-3">
              <Siren className="h-6 w-6 text-white" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-xl font-semibold tracking-tight text-white">24/7 Action Center</h3>
              <p className="opacity-90">
                Our council members and response teams are on standby for any emergencies.
              </p>
            </div>
          </div>
          <div className="relative flex flex-col gap-4 sm:flex-row">
            <Button href="tel:+63776001082" variant="primary" size="lg">
              <Phone className="h-5 w-5" aria-hidden="true" />
              Emergency Hotline: {SITE.phone}
            </Button>
            <Button href="/assistance/new" variant="outline-white" size="lg">
              Request Assistance
            </Button>
          </div>
        </div>
      </Container>
    </div>
  );
}
