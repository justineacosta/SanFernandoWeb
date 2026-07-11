import Image from "next/image";
import { Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toTelHref } from "@/lib/format";
import { Card } from "@/components/ui/card";
import type { Official } from "@/types";

interface OfficialCardProps {
  official: Official;
  /** "portrait" — photo-first grid card; "compact" — horizontal row with avatar. */
  variant?: "portrait" | "compact";
  highlighted?: boolean;
}

function ContactIcons({ official }: { official: Official }) {
  return (
    <div className="mt-3 flex justify-center gap-2">
      {official.email ? (
        <a
          href={`mailto:${official.email}`}
          aria-label={`Email ${official.name}`}
          className="p-2 text-outline transition-colors hover:text-primary"
        >
          <Mail className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : null}
      {official.phone ? (
        <a
          href={toTelHref(official.phone)}
          aria-label={`Call ${official.name}`}
          className="p-2 text-outline transition-colors hover:text-primary"
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
      <Card className="flex items-center gap-6 p-6">
        <Image
          src={official.photo}
          alt={official.photoAlt}
          width={96}
          height={96}
          className="h-24 w-24 shrink-0 rounded-full border-2 border-primary/10 object-cover"
        />
        <div>
          <h4 className="font-bold text-ink">{official.name}</h4>
          <p className="text-sm font-medium text-secondary">{official.role}</p>
          <div className="mt-2 flex flex-col gap-1 text-[13px] text-ink-muted">
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
      </Card>
    );
  }

  return (
    <Card className={cn("group overflow-hidden", highlighted && "ring-2 ring-primary/20")}>
      <div className="relative aspect-square overflow-hidden">
        <Image
          src={official.photo}
          alt={official.photoAlt}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {official.badge ? (
          <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-1 text-[10px] font-bold uppercase text-white">
            {official.badge}
          </span>
        ) : null}
      </div>
      <div className="p-4 text-center">
        <h4 className="font-bold text-ink">{official.name}</h4>
        <p
          className={cn(
            "text-sm font-medium",
            highlighted ? "font-bold text-primary" : "text-secondary",
          )}
        >
          {official.role}
        </p>
        <ContactIcons official={official} />
      </div>
    </Card>
  );
}
