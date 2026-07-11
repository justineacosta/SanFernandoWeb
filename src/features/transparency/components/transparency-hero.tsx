import Image from "next/image";
import { FileText, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { HERO_IMAGE } from "@/features/transparency/data";

/** Light page-level hero for the transparency portal with photo and document shortcuts. */
export function TransparencyHero() {
  return (
    <section className="relative overflow-hidden pb-14 pt-32 md:pb-20 md:pt-44">
      <div
        aria-hidden="true"
        className="grid-bg pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="bg-radial-fade pointer-events-none absolute -top-32 left-1/2 -z-10 h-[480px] w-[900px] -translate-x-1/2 rounded-full blur-2xl"
      />
      <Container className="relative">
        <div className="flex flex-col items-center gap-12 md:flex-row">
          <div className="md:w-1/2">
            <Badge variant="soft" className="mb-4">
              Good Governance
            </Badge>
            <h1 className="mb-4 text-balance font-display text-3xl font-semibold tracking-tight text-ink-900 md:text-5xl">
              Transparency Portal
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-ink-600">
              The Full Disclosure Policy of Barangay Sampaguita. Access official records, financial
              statements, and legislative documents as we uphold accountability in public service.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button href="#documents" size="lg">
                <FileText className="h-5 w-5" aria-hidden="true" /> View Documents
              </Button>
              <Button href="#" variant="outline" size="lg">
                <HelpCircle className="h-5 w-5" aria-hidden="true" /> FOI Guide
              </Button>
            </div>
          </div>
          <div className="w-full md:w-1/2">
            <Image
              src={HERO_IMAGE}
              alt="Organized office files representing government transparency"
              width={640}
              height={384}
              className="h-96 w-full rounded-3xl border border-ink-200/70 object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.3)]"
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
