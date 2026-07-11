import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Clock, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import {
  GOVERNMENT_LINKS,
  LEGAL_LINKS,
  NAV_ITEMS,
  SITE,
  SOCIAL_LINKS,
} from "@/constants/site";
import { Container } from "@/components/ui/container";

function FooterHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-6 text-sm font-bold uppercase tracking-wider text-blue-200">{children}</h3>
  );
}

/** Site-wide footer: brand, quick links, government links, contact details, legal. */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t-4 border-accent bg-primary pb-8 pt-16 text-white">
      <Container>
        <div className="mb-12 grid grid-cols-1 gap-12 border-b border-primary-strong pb-12 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <Image
                src={SITE.sealImage}
                alt={`${SITE.name} seal`}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full border-2 border-yellow-400 object-cover"
              />
              <div>
                <p className="text-lg font-bold uppercase leading-tight">{SITE.name}</p>
                <p className="text-xs text-blue-200">{SITE.locality}</p>
              </div>
            </div>
            <p className="mb-6 text-sm leading-relaxed text-blue-100">
              We are committed to transparency, accountability, and excellent public service for
              every resident.
            </p>
            <div className="flex gap-4">
              {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="rounded-full bg-primary-strong p-2 transition-colors hover:bg-secondary"
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          <nav aria-label="Quick links">
            <FooterHeading>Quick Links</FooterHeading>
            <ul className="space-y-3 text-sm text-blue-100">
              {NAV_ITEMS.filter((item) => item.href !== "/").map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <ChevronRight className="h-3 w-3" aria-hidden="true" /> {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Government links">
            <FooterHeading>Government Links</FooterHeading>
            <ul className="space-y-3 text-sm text-blue-100">
              {GOVERNMENT_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" /> {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <FooterHeading>Contact Us</FooterHeading>
            <ul className="space-y-4 text-sm text-blue-100">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <span>
                  {SITE.addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                {SITE.phone}
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                {SITE.email}
              </li>
              <li className="flex items-center gap-3">
                <Clock className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                {SITE.officeHours}
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between text-sm text-blue-300 md:flex-row">
          <p>
            © {year} {SITE.name}. All Rights Reserved.
          </p>
          <div className="mt-4 flex gap-4 md:mt-0">
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
