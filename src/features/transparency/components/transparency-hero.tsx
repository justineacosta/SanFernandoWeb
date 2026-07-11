import Image from "next/image";
import { FileText, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { HERO_IMAGE } from "@/features/transparency/data";

/** Split hero for the transparency portal with photo and document shortcuts. */
export function TransparencyHero() {
  return (
    <Section tone="muted" className="py-12 md:py-20">
      <div className="flex flex-col items-center gap-12 md:flex-row">
        <div className="md:w-1/2">
          <Badge variant="soft" className="mb-4 rounded-full px-3 py-1">
            Good Governance
          </Badge>
          <h1 className="mb-4 text-3xl font-bold text-primary md:text-5xl">
            Transparency Portal
          </h1>
          <p className="mb-8 text-lg leading-relaxed text-ink-muted">
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
            className="h-96 w-full rounded-xl border border-line object-cover shadow-sm"
          />
        </div>
      </div>
    </Section>
  );
}
