import Image from "next/image";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import transparencyPhoto from "@/images/transparencyimage/transparencyImage.png";

/**
 * Light page-level hero for the transparency portal: barangay staff reviewing
 * records, used as the section's own background rather than a card beside the
 * copy. The photo carries the same light-wash treatment `HeroCarousel` uses on
 * the home page — a white gradient heaviest under the text column — so the
 * ink-900/ink-600 type, the soft badge and the amber button all stay on the
 * light theme every other page hero shares. The top and bottom fades keep the
 * floating header and the disclosure grid below from butting against a hard
 * photo edge.
 */
export function TransparencyHero() {
  return (
    <section className="relative overflow-hidden pb-14 pt-32 md:pb-20 md:pt-44">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <Image
          src={transparencyPhoto}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-white/82 md:hidden" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-white/88 from-20% via-white/72 via-55% to-white/20 md:block" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white to-transparent" />
      </div>
      <Container className="relative">
        <div className="max-w-2xl">
          <Badge variant="soft" className="mb-4">
            Good Governance
          </Badge>
          <h1 className="mb-4 text-balance font-display text-3xl font-semibold tracking-tight text-ink-900 md:text-5xl">
            Transparency Portal
          </h1>
          <p className="mb-8 text-lg leading-relaxed text-ink-600">
            The Full Disclosure Policy of Barangay San Fernando. Access official records, financial
            statements, and legislative documents as we uphold accountability in public service.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button href="#documents" size="lg">
              <FileText className="h-5 w-5" aria-hidden="true" /> View Documents
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
