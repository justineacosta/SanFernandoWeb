import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/sections/page-hero";
import { EventsArchiveSkeleton } from "@/components/ui/public-skeleton";
import { UpcomingEventsSection, PastEventsArchive } from "@/features/events";

export const metadata: Metadata = {
  title: "Community Calendar",
  description:
    "Every civic event, town hall, and festival hosted by Barangay San Fernando — upcoming and past.",
};

export const revalidate = 3600;

export default function EventsPage() {
  return (
    <>
      <PageHero
        eyebrow="Community Calendar"
        title="Barangay Events"
        description="Every civic event, town hall, and festival hosted by Barangay San Fernando — upcoming and past."
      />
      <Container className="py-12 md:py-16">
        <div className="mx-auto max-w-4xl space-y-16">
          <Suspense fallback={<EventsArchiveSkeleton what="upcoming events" />}>
            <UpcomingEventsSection />
          </Suspense>
          <Suspense fallback={<EventsArchiveSkeleton what="past events" />}>
            <PastEventsArchive />
          </Suspense>
        </div>
      </Container>
    </>
  );
}
