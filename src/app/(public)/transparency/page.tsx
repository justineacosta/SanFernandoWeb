import type { Metadata } from "next";
import {
  DisclosureGrid,
  FoiSection,
  LatestUploadsSection,
  TransparencyHero,
} from "@/features/transparency";

export const metadata: Metadata = {
  title: "Transparency Board",
  description:
    "Official records, financial statements, and legislative documents of Barangay Sampaguita under the Full Disclosure Policy.",
};

export default function TransparencyPage() {
  return (
    <>
      <TransparencyHero />
      <DisclosureGrid />
      <LatestUploadsSection />
      <FoiSection />
    </>
  );
}
