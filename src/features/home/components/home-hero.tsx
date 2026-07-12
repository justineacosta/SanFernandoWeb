import { ArrowUpRight, Sparkles } from "lucide-react";
import { SITE } from "@/constants/site";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { HeroCarousel } from "./hero-carousel";
import { HERO_SLIDES } from "@/features/home/data";

/** Full-panel hero: sliding images fading at the edges behind the welcome text. */
export function HomeHero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-28 md:pb-24 md:pt-36">
      <div
        aria-hidden="true"
        className="grid-bg pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="bg-radial-fade pointer-events-none absolute -top-32 left-1/2 -z-10 h-[600px] w-[1100px] -translate-x-1/2 rounded-full blur-2xl"
      />
      <Container>
        <div className="relative">
          <div className="pointer-events-none relative z-10 grid items-center gap-8 p-6 pb-20 sm:p-10 sm:pb-24 lg:min-h-[600px] lg:grid-cols-12 lg:p-14 lg:pb-24">
            <div className="pointer-events-auto lg:col-span-7">
              <Badge variant="soft" className="mb-5">
                <Sparkles className="size-3.5 text-brand-500" aria-hidden="true" />
                Welcome To
              </Badge>
              <h1 className="text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl md:text-6xl">
                Barangay{" "}
                <span className="relative whitespace-nowrap">
                  <span className="text-gradient-brand">San Fernando</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 300 14"
                    className="absolute -bottom-2 left-0 h-2 w-full text-brand-400"
                    fill="none"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M2 11C57 4 130 4 187 9C229 12 269 11 298 6"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>
              <p className="mt-6 text-lg font-medium text-ink-700 md:text-xl">{SITE.tagline}</p>
              <p className="mt-3 max-w-2xl text-balance text-base leading-relaxed text-ink-600 md:text-lg">
                {SITE.description}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button href="/about" size="lg">
                  About Our Barangay <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button href="/contact" variant="outline" size="lg">
                  Contact Us
                </Button>
              </div>
            </div>
          </div>
          <HeroCarousel slides={HERO_SLIDES} />
        </div>
      </Container>
    </section>
  );
}
