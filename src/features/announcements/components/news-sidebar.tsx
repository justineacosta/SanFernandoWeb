import { Megaphone, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { toCalendarParts, toTelHref } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { NewsletterForm } from "@/features/announcements/components/newsletter-form";
import { SIDEBAR_ANNOUNCEMENTS, SIDEBAR_HOTLINES } from "@/features/announcements/data";

function AnnouncementsWidget() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex items-center gap-3 bg-danger-deep p-4">
        <Megaphone className="h-5 w-5 text-white" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-white">Latest Announcements</h3>
      </div>
      <div className="space-y-4 p-4">
        {SIDEBAR_ANNOUNCEMENTS.map((announcement) => {
          const { month, day } = toCalendarParts(announcement.date);
          return (
            <div
              key={announcement.title}
              className="flex gap-4 border-b border-line pb-4 last:border-0 last:pb-0"
            >
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded",
                  announcement.urgent
                    ? "bg-danger-soft text-danger-soft-fg"
                    : "bg-accent-soft text-primary",
                )}
              >
                <span className="text-lg font-bold leading-tight">{day}</span>
                <span className="text-[10px] font-bold">{month}</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-ink">{announcement.title}</h4>
                <p className="mt-1 text-xs text-ink-muted">{announcement.excerpt}</p>
                {announcement.urgent ? (
                  <Badge variant="urgent" className="mt-2 text-[10px]">
                    Urgent
                  </Badge>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HotlinesWidget() {
  return (
    <div className="rounded-xl border border-line bg-surface-mid p-6">
      <h3 className="mb-6 flex items-center gap-2 text-xl font-semibold text-primary">
        <Siren className="h-5 w-5" aria-hidden="true" /> Emergency Hotlines
      </h3>
      <div className="space-y-4">
        {SIDEBAR_HOTLINES.map((hotline) => (
          <a
            key={hotline.label}
            href={toTelHref(hotline.number)}
            className={cn(
              "group flex items-center justify-between rounded border border-line bg-white p-3 transition-colors",
              hotline.tone === "danger" ? "hover:border-danger" : "hover:border-secondary",
            )}
          >
            <span className="font-bold text-ink">{hotline.label}</span>
            <span
              className={cn(
                "font-bold group-hover:underline",
                hotline.tone === "danger" ? "text-danger" : "text-secondary",
              )}
            >
              {hotline.number}
            </span>
          </a>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-ink-muted">
        Available 24/7 for community assistance.
      </p>
    </div>
  );
}

/** Right rail: urgent announcements, hotlines, and newsletter signup. */
export function NewsSidebar() {
  return (
    <aside className="space-y-8">
      <AnnouncementsWidget />
      <HotlinesWidget />
      <NewsletterForm />
    </aside>
  );
}
