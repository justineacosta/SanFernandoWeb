import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { ActionCenterBanner, LeadershipDirectory } from "@/features/officials";
import { TERM_LABEL } from "@/features/officials/data";

export const metadata: Metadata = {
  title: "Barangay Officials",
  description:
    "Meet the elected officials and administrative staff of Barangay Sampaguita.",
};

export default function OfficialsPage() {
  return (
    <>
      <PageHero
        align="center"
        title="Barangay Officials"
        description={`Meet the dedicated leaders of Barangay Sampaguita serving the community with transparency, integrity, and excellence for the term ${TERM_LABEL}.`}
      />
      <LeadershipDirectory />
      <ActionCenterBanner />
    </>
  );
}
