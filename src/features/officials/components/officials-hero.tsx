import Image from "next/image";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Container } from "@/components/ui/container";
import officialsPhoto from "@/images/officialimagebg/officialgrouppicture.png";

/**
 * Full-bleed photo hero for the officials directory, replacing the shared
 * `PageHero` on this route only. The group portrait spans the whole section
 * rather than sitting beside the copy, under the same light wash `HeroCarousel`
 * and `TransparencyHero` use: a flat white veil below `md`, a left-weighted
 * gradient at `md`+ so the copy sits under the heavy end while the photo reads
 * through on the right, plus top/bottom fades to solid white so the floating
 * header and the directory below never meet a hard photo edge. Those three
 * numbers are one formula shared with the other two heroes — move them
 * together. `grid-bg` and the radial glow every other `PageHero` layers are
 * dropped here: invisible under a photo, and noise once washed.
 *
 * The copy is left-aligned at `max-w-2xl` (the shared hero is centered at
 * `max-w-3xl`) because legibility depends on the copy column staying inside the
 * gradient's heavy end — a centered block would run out past the 55% stop.
 */
export function OfficialsHero() {
  return (
    <section className="relative overflow-hidden pb-14 pt-32 md:pb-20 md:pt-44">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <Image
          src={officialsPhoto}
          alt=""
          fill
          priority
          sizes="100vw"
          // The section is far wider than the 16:9 source, so `object-cover`
          // crops vertically; centering it would slice the group off at the
          // shoulders. 20% keeps both rows' faces inside the visible band.
          className="object-cover object-[center_20%]"
        />
        <div className="absolute inset-0 bg-white/82 md:hidden" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-white/88 from-20% via-white/72 via-55% to-white/20 md:block" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white to-transparent" />
      </div>
      <Container className="relative">
        <div className="max-w-2xl">
          <h1 className="text-balance font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink-900 md:text-6xl">
            Barangay <BrandStroke>Officials</BrandStroke>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-600 md:text-xl">
            Meet the dedicated leaders of Barangay San Fernando serving the community with
            transparency, integrity, and excellence.
          </p>
        </div>
      </Container>
    </section>
  );
}
