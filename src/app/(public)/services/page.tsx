import { Suspense } from "react";
import type { Metadata } from "next";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { PageHero } from "@/components/sections/page-hero";
import { PublicCardGridSkeleton } from "@/components/ui/public-skeleton";
import { HelpSection, ServicesGrid, WasteScheduleSection } from "@/features/services";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Access essential public services, document requests, and community support programs of Barangay San Fernando.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        title={<>Official <BrandStroke>Services</BrandStroke> Directory</>}
        description="Access essential public services, document requests, and community support programs. We are committed to providing efficient and transparent governance for every citizen."
      />
      {/*
        Only the grid waits on Supabase. The hero above and the two sections
        below need no data, so they paint immediately instead of being replaced
        by a whole-page skeleton.
      */}
      <Suspense fallback={<PublicCardGridSkeleton what="the services directory" />}>
        <ServicesGrid />
      </Suspense>
      <WasteScheduleSection />
      <HelpSection />
    </>
  );
}
