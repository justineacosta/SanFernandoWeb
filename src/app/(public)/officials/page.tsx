import type { Metadata } from "next";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { PageHero } from "@/components/sections/page-hero";
import { ActionCenterBanner, LeadershipDirectory } from "@/features/officials";
import { TERM_LABEL } from "@/features/officials/data";

export const metadata: Metadata = {
  title: "Barangay Officials",
  description:
    "Meet the elected officials and administrative staff of Barangay San Fernando.",
};

export default function OfficialsPage() {
  return (
    <>
      <PageHero
        align="center"
        title={<>Barangay <BrandStroke>Officials</BrandStroke></>}
        description={`Meet the dedicated leaders of Barangay San Fernando serving the community with transparency, integrity, and excellence for the term ${TERM_LABEL}.`}
      />
      <LeadershipDirectory />
      <ActionCenterBanner />
    </>
  );
}
