import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Clock, ExternalLink, Mail, MapPin, Phone, Siren } from "lucide-react";
import {
  EMERGENCY_HOTLINES,
  GOVERNMENT_LINKS,
  LEGAL_LINKS,
  NAV_ITEMS,
  SITE,
  SOCIAL_LINKS,
} from "@/constants/site";
import { toTelHref } from "@/lib/format";
import { Container } from "@/components/ui/container";

function FooterHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-6 text-xs font-semibold uppercase tracking-wider text-brand-300">
      {children}
    </h3>
  );
}

/** Dark site-wide footer: link columns, contact + hotline, legal. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  const hotline = EMERGENCY_HOTLINES[0];

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-ink-950 text-ink-100">
      <div
        aria-hidden="true"
        className="bg-radial-fade pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60"
      />
      <Container className="relative pt-6 md:pt-8">
        <div className="grid grid-cols-1 gap-12 py-14 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <Image
                src={SITE.sealImage}
                alt={`${SITE.name} seal`}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full border border-brand-400 object-cover"
              />
              <div>
                <p className="font-display text-lg font-semibold leading-tight tracking-tight text-white">
                  {SITE.name}
                </p>
                <p className="text-xs text-ink-400">{SITE.locality}</p>
              </div>
            </div>
            <p className="mb-6 text-sm leading-relaxed text-ink-300">
              We are committed to transparency, accountability, and excellent public service for
              every resident.
            </p>
            <div className="flex gap-3">
              {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="rounded-full border border-white/10 bg-white/5 p-2.5 text-ink-200 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          <nav aria-label="Quick links">
            <FooterHeading>Quick Links</FooterHeading>
            <ul className="space-y-3 text-sm text-ink-300">
              {NAV_ITEMS.filter((item) => item.href !== "/").map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <ChevronRight className="h-3 w-3 text-brand-400" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Government links">
            <FooterHeading>Government Links</FooterHeading>
            <ul className="space-y-3 text-sm text-ink-300">
              {GOVERNMENT_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <ExternalLink className="h-3 w-3 text-brand-400" aria-hidden="true" />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <FooterHeading>Contact Us</FooterHeading>
            <ul className="space-y-4 text-sm text-ink-300">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                <span>
                  {SITE.addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                {SITE.phone}
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                {SITE.email}
              </li>
              <li className="flex items-center gap-3">
                <Clock className="h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
                {SITE.officeHours}
              </li>
              <li className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <Siren className="h-5 w-5 shrink-0 text-danger-bright" aria-hidden="true" />
                <span>
                  <span className="block text-xs uppercase tracking-wider text-ink-400">
                    {hotline.label}
                  </span>
                  <a
                    href={toTelHref(hotline.number)}
                    className="font-semibold text-white hover:text-brand-300"
                  >
                    {hotline.number}
                  </a>
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-8 text-sm text-ink-400 md:flex-row">
          <p>
            © {year} {SITE.name}, {SITE.locality}. All Rights Reserved. {SITE.republic}.
          </p>
          <div className="flex gap-4">
            {LEGAL_LINKS.map((link, index) => (
              <span key={link.label} className="flex items-center gap-4">
                {index > 0 ? <span aria-hidden="true">|</span> : null}
                <Link href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              </span>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
