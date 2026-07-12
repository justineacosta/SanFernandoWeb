import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import {
  CaptainMessageSection,
  HistorySection,
  JoinCommunitySection,
  MilestonesSection,
  MissionVisionSection,
} from "@/features/about";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Discover the history, mission, vision, and milestones of Barangay San Fernando.",
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Public Office & Community"
        title="The Heart of Service: Understanding Barangay San Fernando"
        description="Dedicated to fostering a safe, transparent, and progressive community for all residents. Discover our history, our purpose, and our commitment to you."
      />
      <MissionVisionSection />
      <CaptainMessageSection />
      <HistorySection />
      <MilestonesSection />
      <JoinCommunitySection />
    </>
  );
}
