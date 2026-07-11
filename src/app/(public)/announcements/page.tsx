import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/sections/page-hero";
import { NewsFeed, NewsSidebar } from "@/features/announcements";

export const metadata: Metadata = {
  title: "News & Announcements",
  description:
    "The latest announcements, public notices, and community highlights from Barangay Sampaguita.",
};

export default function AnnouncementsPage() {
  return (
    <>
      <PageHero
        eyebrow="Official Updates"
        title="Civic Hub: Stay Informed, Stay Connected"
        description="Access the latest announcements, public notices, and community highlights from the heart of Barangay Sampaguita."
      >
        <div className="flex flex-wrap gap-4">
          <Button variant="primary" size="lg">
            Subscribe to Alerts
          </Button>
          <Button variant="outline" size="lg">
            Community Calendar
          </Button>
        </div>
      </PageHero>
      <Container className="py-12 md:py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <NewsFeed />
          </div>
          <div className="lg:col-span-4">
            <NewsSidebar />
          </div>
        </div>
      </Container>
    </>
  );
}
