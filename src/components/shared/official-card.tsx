import Image from "next/image";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toTelHref } from "@/lib/format";
import { Card } from "@/components/ui/card";
import type { OfficialListItem } from "@/types";

interface OfficialCardProps {
  official: OfficialListItem;
  /** "portrait" — photo-first grid card; "compact" — horizontal row with avatar. */
  variant?: "portrait" | "compact";
  highlighted?: boolean;
}

function ContactIcons({ official }: { official: OfficialListItem }) {
  return (
    <div className="mt-3 flex justify-center gap-2">
      {official.email ? (
        <a
          href={`mailto:${official.email}`}
          aria-label={`Email ${official.name}`}
          className="p-2 text-ink-400 transition-colors hover:text-brand-600"
        >
          <Mail className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : null}
      {official.phone ? (
        <a
          href={toTelHref(official.phone)}
          aria-label={`Call ${official.name}`}
          className="p-2 text-ink-400 transition-colors hover:text-brand-600"
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

/** Directory card for barangay officials, in portrait and compact layouts. */
export function OfficialCard({ official, variant = "portrait", highlighted = false }: OfficialCardProps) {
  if (variant === "compact") {
    return (
      <Card className="p-0">
        {/* Compact contacts are plain text, not links, so the whole card can be one link. */}
        <Link href={`/officials/${official.slug}`} className="flex items-center gap-6 p-6">
          <Image
            src={official.photoUrl}
            alt={official.photoAlt}
            width={96}
            height={96}
            className="h-24 w-24 shrink-0 rounded-full border-2 border-ink-900/10 object-cover"
          />
          <div>
            <h4 className="font-display font-semibold tracking-tight text-ink-900">{official.name}</h4>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">{official.role}</p>
            <div className="mt-2 flex flex-col gap-1 text-[13px] text-ink-600">
              {official.email ? (
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4" aria-hidden="true" /> {official.email}
                </span>
              ) : null}
              {official.phone ? (
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4" aria-hidden="true" /> {official.phone}
                </span>
              ) : null}
            </div>
          </div>
        </Link>
      </Card>
    );
  }

  return (
    <Card className={cn("group overflow-hidden", highlighted && "ring-2 ring-brand-400/20")}>
      <Link href={`/officials/${official.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden rounded-2xl">
          <Image
            src={official.photoUrl}
            alt={official.photoAlt}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-(--duration-reveal) ease-out-soft group-hover:scale-[1.03]"
          />
          {official.badge ? (
            <span className="absolute right-2 top-2 rounded-full bg-ink-900 px-2 py-1 text-[10px] font-bold uppercase text-white">
              {official.badge}
            </span>
          ) : null}
        </div>
        <div className="px-4 pt-4 text-center">
          <h4 className="font-display font-semibold tracking-tight text-ink-900">{official.name}</h4>
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-wider text-brand-700",
              highlighted && "font-bold text-ink-900",
            )}
          >
            {official.role}
          </p>
        </div>
      </Link>
      <div className="px-4 pb-4 text-center">
        <ContactIcons official={official} />
      </div>
    </Card>
  );
}
