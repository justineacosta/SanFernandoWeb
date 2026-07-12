import type { Metadata } from "next";
import {
  DisclosureGrid,
  FoiSection,
  LatestUploadsSection,
  LegislativeSection,
  TransparencyHero,
} from "@/features/transparency";

export const metadata: Metadata = {
  title: "Transparency Board",
  description:
    "Official records, financial statements, and legislative documents of Barangay San Fernando under the Full Disclosure Policy.",
};

export default function TransparencyPage() {
  return (
    <>
      <TransparencyHero />
      <DisclosureGrid />
      <LatestUploadsSection />
      <LegislativeSection />
      <FoiSection />
    </>
  );
}
