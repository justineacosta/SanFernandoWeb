import { ChevronRight } from "lucide-react";
import { SITE } from "@/constants/site";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmergencyHotlinesCard } from "@/components/shared/emergency-hotlines-card";
import { HERO_IMAGE } from "@/features/home/data";

/** Full-bleed hero with the barangay welcome message and the emergency hotline rail. */
export function HomeHero() {
  return (
    <section
      className="relative bg-cover bg-center py-16 md:py-24"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 37, 118, 0.75), rgba(0, 37, 118, 0.75)), url(${HERO_IMAGE})`,
      }}
    >
      <Container className="relative z-10 flex flex-col items-center gap-12 lg:flex-row">
        <div className="text-white lg:w-2/3">
          <Badge variant="accent" className="mb-4 px-4 py-1 text-sm">
            Welcome To
          </Badge>
          <h1 className="mb-4 text-5xl font-extrabold uppercase leading-tight md:text-7xl">
            Barangay
            <br />
            San Fernando
          </h1>
          <p className="mb-6 text-xl font-semibold md:text-2xl">{SITE.tagline}</p>
          <p className="mb-8 max-w-2xl text-base text-blue-100 md:text-lg">{SITE.description}</p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button href="/about" variant="accent" size="lg">
              About Our Barangay <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Button>
            <Button href="/contact" variant="outline-white" size="lg">
              Contact Us
            </Button>
          </div>
        </div>
        <div className="w-full lg:w-1/3">
          <EmergencyHotlinesCard />
        </div>
      </Container>
    </section>
  );
}
