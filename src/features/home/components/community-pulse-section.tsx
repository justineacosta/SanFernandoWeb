import Link from "next/link";
import { ArrowRight, BarChart2, Calendar, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { Section } from "@/components/ui/section";
import { AnnouncementCard } from "@/components/shared/announcement-card";
import { EventCard } from "@/components/shared/event-card";
import { StatCard } from "@/components/shared/stat-card";
import { listPublishedAnnouncements } from "@/features/announcements/queries";
import { listUpcomingEvents } from "@/features/events/queries";
import { listGlanceStats } from "@/features/site-content/queries";

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
  const [announcements, events, stats] = await Promise.all([
    listPublishedAnnouncements(3),
    listUpcomingEvents(4),
    listGlanceStats(),
  ]);
  return (
    <Section tone="muted">
      {/*
        Only the glance card is content-managed, so an empty stats block hides
        that card alone (design §2.6) — announcements and events still belong
        here. Two columns then, rather than a third of empty row.
      */}
      <div className={cn("grid grid-cols-1 gap-8", stats.length > 0 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        <Reveal>
        <Card className="h-full p-6">
          <CardHeader
            title="Announcements"
            icon={<Megaphone className="h-5 w-5 text-brand-500" aria-hidden="true" />}
            action={<ViewAllLink label="View All" href="/notices" />}
          />
          <div className="space-y-6">
            {announcements.map((announcement) => (
              <AnnouncementCard key={announcement.id} announcement={announcement} />
            ))}
          </div>
        </Card>
        </Reveal>

        <Reveal delay={80}>
        <Card className="h-full p-6">
          <CardHeader
            title="Upcoming Events"
            icon={<Calendar className="h-5 w-5 text-brand-500" aria-hidden="true" />}
            action={<ViewAllLink label="View Events" href="/events" />}
          />
          <div className="space-y-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </Card>
        </Reveal>

        {stats.length > 0 ? (
          <Reveal delay={160}>
          <Card className="h-full p-6">
            <CardHeader
              title="Barangay at a Glance"
              icon={<BarChart2 className="h-5 w-5 text-brand-500" aria-hidden="true" />}
            />
            <div className="space-y-4">
              {stats.map((stat) => (
                <StatCard key={stat.label} stat={stat} />
              ))}
            </div>
          </Card>
          </Reveal>
        ) : null}
      </div>
    </Section>
  );
}
