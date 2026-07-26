import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/sections/page-hero";
import { NewsArchiveSkeleton, NewsSidebarSkeleton } from "@/components/ui/public-skeleton";
import { NewsArchive, NewsSidebar } from "@/features/announcements";

export const metadata: Metadata = {
  title: "All News",
  description:
    "Browse every news article and public notice published by Barangay San Fernando, newest first.",
};

export default function NewsPage() {
  return (
    <>
      <PageHero
        eyebrow="Official Updates"
        title="All Community News"
        description="Every article and public notice from Barangay San Fernando, newest first."
      />
      <Container className="py-12 md:py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Suspense fallback={<NewsArchiveSkeleton />}>
              <NewsArchive />
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
