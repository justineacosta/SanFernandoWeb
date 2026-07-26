import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/sections/page-hero";
import { NewsArchiveSkeleton } from "@/components/ui/public-skeleton";
import { NewsArchive } from "@/features/announcements";

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
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<NewsArchiveSkeleton />}>
            <NewsArchive />
          </Suspense>
        </div>
      </Container>
    </>
  );
}
