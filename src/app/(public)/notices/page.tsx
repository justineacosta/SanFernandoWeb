import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/sections/page-hero";
import { NoticesArchiveSkeleton } from "@/components/ui/public-skeleton";
import { NoticesArchive } from "@/features/announcements";

export const metadata: Metadata = {
  title: "All Notices",
  description:
    "Browse every announcement and public notice from Barangay San Fernando, newest first.",
};

export default function NoticesPage() {
  return (
    <>
      <PageHero
        eyebrow="Official Updates"
        title="Community Notices"
        description="Every notice, advisory, and update from Barangay San Fernando — current and past."
      />
      <Container className="py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<NoticesArchiveSkeleton />}>
            <NoticesArchive />
          </Suspense>
        </div>
      </Container>
    </>
  );
}
