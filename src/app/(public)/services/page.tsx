import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { HelpSection, ServicesGrid } from "@/features/services";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Access essential public services, document requests, and community support programs of Barangay San Fernando.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        title="Official Services Directory"
        description="Access essential public services, document requests, and community support programs. We are committed to providing efficient and transparent governance for every citizen."
      />
      <ServicesGrid />
      <HelpSection />
    </>
  );
}
