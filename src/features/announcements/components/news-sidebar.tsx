import { Megaphone, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import { toCalendarParts, toTelHref } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { NewsletterForm } from "@/features/announcements/components/newsletter-form";
import { SIDEBAR_ANNOUNCEMENTS, SIDEBAR_HOTLINES } from "@/features/announcements/data";

function AnnouncementsWidget() {
  return (
    <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white">
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
              className="flex gap-4 border-b border-ink-200 pb-4 last:border-0 last:pb-0"
            >
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl",
                  announcement.urgent
                    ? "bg-danger-soft text-danger-soft-fg"
                    : "bg-brand-100 text-ink-900",
                )}
              >
                <span className="text-lg font-bold leading-tight">{day}</span>
                <span className="text-[10px] font-bold">{month}</span>
              </div>
              <div>
                <h4 className="text-sm font-semibold tracking-tight text-ink-900">{announcement.title}</h4>
                <p className="mt-1 text-xs text-ink-600">{announcement.excerpt}</p>
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
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900 text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
      />
      <div className="relative">
        <div className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-6 py-4">
          <Siren className="h-5 w-5 text-danger-bright" aria-hidden="true" />
          <h3 className="font-display text-lg font-semibold tracking-tight">Emergency Hotlines</h3>
        </div>
        <div className="space-y-4 p-6">
          {SIDEBAR_HOTLINES.map((hotline) => (
            <a
              key={hotline.label}
              href={toTelHref(hotline.number)}
              className={cn(
                "group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3 transition-colors",
                hotline.tone === "danger" ? "hover:border-danger-bright" : "hover:border-brand-400/40",
              )}
            >
              <span className="font-semibold text-ink-300">{hotline.label}</span>
              <span
                className={cn(
                  "font-semibold group-hover:underline",
                  hotline.tone === "danger" ? "text-danger-bright" : "text-brand-300",
                )}
              >
                {hotline.number}
              </span>
            </a>
          ))}
        </div>
        <p className="px-6 pb-6 text-center text-xs text-ink-300">
          Available 24/7 for community assistance.
        </p>
      </div>
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
