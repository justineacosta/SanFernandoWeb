import { Phone, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SITE } from "@/constants/site";

/** 24/7 emergency action-center strip below the directory — the page's dark anchor moment. */
export function ActionCenterBanner() {
  return (
    <div className="pb-16">
      <Container>
        <div className="relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-3xl bg-ink-950 p-8 text-ink-300 shadow-floating md:flex-row">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/20 blur-3xl"
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
          <div className="relative flex flex-col items-center gap-4 sm:items-end">
            <a
              href={`tel:${SITE.phoneTel}`}
              className="group inline-flex items-center gap-3 rounded-full px-2 py-1"
            >
              <Phone className="h-6 w-6 text-brand-400" aria-hidden="true" />
              <span className="text-left">
                <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-ink-400">
                  Emergency Hotline
                </span>
                <span className="block font-display text-3xl font-semibold tabular-nums tracking-tight text-brand-400 group-hover:underline">
                  {SITE.phone}
                </span>
              </span>
            </a>
            <Button href="/assistance/new" variant="outline-white" size="lg">
              Request Assistance
            </Button>
          </div>
        </div>
      </Container>
    </div>
  );
}
