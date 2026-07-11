import Image from "next/image";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { Announcement } from "@/types";

interface AnnouncementCardProps {
  announcement: Announcement;
}

/** Compact announcement list item with thumbnail, date, and excerpt. */
export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  return (
    <article className="group flex gap-4">
      {announcement.image ? (
        <Image
          src={announcement.image}
          alt={announcement.imageAlt ?? ""}
          width={96}
          height={80}
          className="h-20 w-24 shrink-0 rounded-2xl object-cover"
        />
      ) : null}
      <div>
        <h4 className="text-sm font-semibold tracking-tight text-ink-900 transition-colors group-hover:text-brand-700">
          {announcement.isNew ? (
            <Badge variant="new" className="mr-1 px-1.5 text-[10px]">
              New
            </Badge>
          ) : null}
          {announcement.title}
        </h4>
        <p className="mb-1 mt-1 text-xs text-ink-600">{formatDate(announcement.date)}</p>
        <p className="line-clamp-2 text-xs text-ink-600">{announcement.excerpt}</p>
      </div>
    </article>
  );
}
