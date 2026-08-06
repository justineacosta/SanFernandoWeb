import { ArrowUpRight, Sparkles } from "lucide-react";
import { SITE } from "@/constants/site";
import { Badge } from "@/components/ui/badge";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { HeroCarousel } from "./hero-carousel";
import { listHeroSlides } from "@/features/site-content/queries";

/** Full-bleed hero: sliding images as the section's background behind the welcome text. */
export async function HomeHero() {
  const slides = await listHeroSlides();
  return (
    <section className="relative overflow-hidden pb-16 pt-28 md:pb-24 md:pt-36">
      {/*
        The one section that survives an empty block (design §2.6): the
        heading, tagline and buttons below carry the page on their own, so
        with no slides the hero just loses its image layer instead of
        leaving the home page starting mid-air.

        It renders BEFORE the copy and spans the whole section rather than the
        Container, so the photo is the section's background (matching
        `TransparencyHero`). It is not `-z-10`: the dots and the hover-pause
        need pointer events, which is why the copy wrapper below stays
        `pointer-events-none` with only its text column `pointer-events-auto`.
      */}
      {slides.length > 0 ? <HeroCarousel slides={slides} /> : null}
      <Container className="relative">
        <div className="pointer-events-none relative z-10 grid items-center gap-8 pb-20 sm:pb-24 lg:min-h-[600px] lg:grid-cols-12 lg:pb-24">
          <div className="pointer-events-auto lg:col-span-7">
            <Badge variant="soft" className="hero-seq hero-seq-1 mb-5">
              <Sparkles className="size-3.5 text-brand-500" aria-hidden="true" />
              Welcome To
            </Badge>
            <h1 className="hero-seq hero-seq-2 text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl md:text-7xl">
              Barangay{" "}
              <BrandStroke draw>
                <span className="text-gradient-brand">San Fernando</span>
              </BrandStroke>
            </h1>
            <p className="hero-seq hero-seq-3 mt-6 text-lg font-medium text-ink-700 md:text-xl">
              {SITE.tagline}
            </p>
            <p className="hero-seq hero-seq-3 mt-3 max-w-2xl text-balance text-base leading-relaxed text-ink-600 md:text-lg">
              {SITE.description}
            </p>
            <div className="hero-seq hero-seq-4 mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/about" size="lg">
                About Our Barangay <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button href="/contact" variant="outline" size="lg">
                Contact Us
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
