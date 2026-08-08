import type { Metadata } from "next";
import { ActionCenterBanner, LeadershipDirectory, OfficialsHero } from "@/features/officials";

export const metadata: Metadata = {
  title: "Barangay Officials",
  description:
    "Meet the elected officials and administrative staff of Barangay San Fernando.",
};

export default function OfficialsPage() {
  return (
    <>
      <OfficialsHero />
      <LeadershipDirectory />
      <ActionCenterBanner />
    </>
  );
}
