import Link from "next/link";
import { ArrowRight, BarChart2, Calendar, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { AnnouncementCard } from "@/components/shared/announcement-card";
import { EventCard } from "@/components/shared/event-card";
import { StatCard } from "@/components/shared/stat-card";
import { GLANCE_STATS } from "@/features/home/data";
import { listPublishedAnnouncements } from "@/features/announcements/queries";
import { listUpcomingEvents } from "@/features/events/queries";

function ViewAllLink({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 text-xs font-bold uppercase text-brand-700 transition-colors hover:text-ink-900"
    >
      {label} <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}

/** Three-column dashboard: announcements, upcoming events, and barangay statistics. */
export async function CommunityPulseSection() {
  const [announcements, events] = await Promise.all([
    listPublishedAnnouncements(3),
    listUpcomingEvents(4),
  ]);
  return (
    <Section tone="muted">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Card className="p-6">
          <CardHeader
            title="Announcements"
            icon={<Megaphone className="h-5 w-5 text-brand-500" aria-hidden="true" />}
            action={<ViewAllLink label="View All" href="/announcements" />}
          />
          <div className="space-y-6">
            {announcements.map((announcement) => (
              <AnnouncementCard key={announcement.title} announcement={announcement} />
            ))}
          </div>
          <Button href="/announcements" variant="outline" className="mt-6 w-full">
            View All Announcements
          </Button>
        </Card>

        <Card className="p-6">
          <CardHeader
            title="Upcoming Events"
            icon={<Calendar className="h-5 w-5 text-brand-500" aria-hidden="true" />}
            action={<ViewAllLink label="View Calendar" href="/announcements" />}
          />
          <div className="space-y-6">
            {events.map((event) => (
              <EventCard key={event.title} event={event} />
            ))}
          </div>
          <Button href="/announcements" variant="outline" className="mt-6 w-full">
            View All Events
          </Button>
        </Card>

        <Card className="p-6">
          <CardHeader
            title="Barangay at a Glance"
            icon={<BarChart2 className="h-5 w-5 text-brand-500" aria-hidden="true" />}
          />
          <div className="space-y-4">
            {GLANCE_STATS.map((stat) => (
              <StatCard key={stat.label} stat={stat} />
            ))}
          </div>
          <Button href="/transparency" className="mt-6 w-full">
            More Statistics
          </Button>
        </Card>
      </div>
    </Section>
  );
}
