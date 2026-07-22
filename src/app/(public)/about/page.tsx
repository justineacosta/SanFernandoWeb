import type { Metadata } from "next";
import { BrandStroke } from "@/components/ui/brand-stroke";
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

/**
 * Matches the home page's window. Every site-content action already calls
 * `revalidatePath("/about")`, so an editor's save appears immediately and this
 * is not what keeps the page current — it is the backstop. Without it the page
 * is prerendered once and never re-checked, so a build made before migration
 * 0021 was applied would serve the empty-state About page indefinitely, with
 * nothing short of a CMS save or a redeploy to shift it.
 */
export const revalidate = 3600;

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Public Office & Community"
        title={<>The Heart of <BrandStroke>Service</BrandStroke>: Understanding Barangay San Fernando</>}
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
