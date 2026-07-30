"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CircleUserRound } from "lucide-react";
import { SITE } from "@/constants/site";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { DesktopNav } from "@/components/navigation/desktop-nav";
import { MobileNav } from "@/components/navigation/mobile-nav";

/** Fixed floating pill header: seal + wordmark, pill nav, staff login CTA. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 py-4 md:py-5">
      <Container>
        <div
          className={cn(
            "flex items-center justify-between rounded-full border px-3 py-2 transition-all duration-300 sm:px-5",
            scrolled
              ? "border-ink-200/70 bg-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md"
              : "border-transparent bg-white/40 backdrop-blur-md",
          )}
        >
          <Link href="/" className="flex items-center gap-2.5" aria-label={SITE.name}>
            <Image
              src={SITE.sealImage}
              alt={`${SITE.name} seal`}
              width={36}
              height={36}
              className="size-9 rounded-full border border-brand-400 object-cover"
            />
            <span className="text-base font-semibold tracking-tight text-ink-900">
              {SITE.name}
            </span>
          </Link>
          <DesktopNav />
          <div className="flex items-center gap-2">
            <Button href="/admin/login" variant="outline" size="sm" className="hidden lg:inline-flex">
              <CircleUserRound className="h-4 w-4" aria-hidden="true" /> Login
            </Button>
            <MobileNav />
          </div>
        </div>
      </Container>
    </header>
  );
}
