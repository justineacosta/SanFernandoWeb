import { Suspense } from "react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { PageHero } from "@/components/sections/page-hero";
import { NewsFeedSkeleton, NewsSidebarSkeleton } from "@/components/ui/public-skeleton";
import { NewsTeaser, NewsSidebar } from "@/features/announcements";

export const metadata: Metadata = {
  title: "News & Announcements",
  description:
    "The latest announcements, public notices, and community highlights from Barangay San Fernando.",
};

export default function AnnouncementsPage() {
  return (
    <>
      <PageHero
        eyebrow="Official Updates"
        title={<><BrandStroke>News Hub</BrandStroke>: Stay Informed, Stay Connected</>}
        description="Access the latest announcements, public notices, and community highlights from the heart of Barangay San Fernando."
      >
        <div className="flex flex-wrap gap-4">
          <Button variant="outline" size="lg">
            Community Calendar
          </Button>
        </div>
      </PageHero>
      <Container className="py-12 md:py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/*
            Two independent queries, so two boundaries: the sidebar's three
            announcements should not be held back by the news teaser.
          */}
          <div className="lg:col-span-8">
            <Suspense fallback={<NewsFeedSkeleton count={2} />}>
              <NewsTeaser />
            </Suspense>
          </div>
          <div className="lg:col-span-4">
            <Suspense fallback={<NewsSidebarSkeleton />}>
              <NewsSidebar />
            </Suspense>
          </div>
        </div>
      </Container>
    </>
  );
}
