import Image from "next/image";
import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { Announcement } from "@/types";

interface NoticeArchiveCardProps {
  announcement: Announcement;
}

/** Full-size notice card for the /notices archive grid — mirrors NewsCard's sizing. */
export function NoticeArchiveCard({ announcement }: NoticeArchiveCardProps) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-ink-200 bg-white transition-all duration-(--duration-quick) ease-out-soft hover:-translate-y-1 hover:border-brand-300 hover:shadow-floating">
      <div className="relative h-48 overflow-hidden rounded-2xl">
        {announcement.image ? (
          <Image
            src={announcement.image}
            alt={announcement.imageAlt ?? ""}
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover transition-transform duration-(--duration-reveal) ease-out-soft group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-ink-100 text-ink-400">
            <ImageIcon className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {announcement.urgent ? (
          <Badge variant="urgent" className="mb-2 w-fit">
            Urgent
          </Badge>
        ) : null}
        <h3 className="mb-3 text-xl font-semibold tracking-tight">
          {announcement.isNew ? (
            <Badge variant="new" className="mr-1 px-1.5 text-[10px]">
              New
            </Badge>
          ) : null}
          {announcement.title}
        </h3>
        <p className="mb-4 line-clamp-2 text-sm text-ink-600">{announcement.excerpt}</p>
        <div className="mt-auto flex items-center justify-between border-t border-ink-200 pt-4">
          <Badge variant="neutral">{formatDate(announcement.date)}</Badge>
          <Link
            href={`/notices/${announcement.slug}`}
            className="text-sm font-semibold uppercase text-ink-900 hover:underline"
          >
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}
