import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/constants/site";
import { Container } from "@/components/ui/container";
import { DesktopNav } from "@/components/navigation/desktop-nav";
import { MobileNav } from "@/components/navigation/mobile-nav";

/** Sticky main header with the barangay seal, identity block, and primary navigation. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      <Container className="relative flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-4">
          <Image
            src={SITE.sealImage}
            alt={`${SITE.name} seal`}
            width={64}
            height={64}
            className="h-16 w-16 rounded-full border-2 border-yellow-400 object-cover"
          />
          <span>
            <span className="block text-xs font-medium text-ink-muted">{SITE.republic}</span>
            <span className="block text-xl font-bold uppercase leading-tight text-primary md:text-2xl">
              {SITE.name}
            </span>
            <span className="block text-sm text-ink-muted">{SITE.locality}</span>
          </span>
        </Link>
        <DesktopNav />
        <MobileNav />
      </Container>
    </header>
  );
}
