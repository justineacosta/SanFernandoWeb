import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { TrackLookup } from "@/features/track";

export const metadata: Metadata = {
  title: "Track a Request",
  description:
    "Check the status of your Barangay San Fernando application using your ticket number and last name.",
};

interface TrackPageProps {
  searchParams: Promise<{ ticket?: string }>;
}

export default async function TrackPage({ searchParams }: TrackPageProps) {
  const { ticket } = await searchParams;
  return (
    <>
      <PageHero
        title="Track Your Request"
        description="Enter the ticket number from your application together with the last name you filed it under."
      />
      <Section>
        <TrackLookup initialTicket={ticket ?? ""} />
      </Section>
    </>
  );
}
