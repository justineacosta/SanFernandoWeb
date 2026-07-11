import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentTypeAction } from "@/types";

const tones = {
  primary: "bg-accent-soft text-primary",
  secondary: "bg-blue-50 text-secondary",
  deep: "bg-accent-muted/40 text-primary-strong",
} as const;

interface ContentTypeCardProps {
  action: ContentTypeAction;
}

/** Quick-action card for starting a new piece of content. */
export function ContentTypeCard({ action }: ContentTypeCardProps) {
  const Icon = action.icon;

  return (
    <Link
      href={action.href}
      className="group flex h-full flex-col items-start gap-4 rounded-xl border border-line bg-white p-6 transition-all hover:border-primary hover:shadow-md"
    >
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-lg transition-transform group-hover:scale-110",
          tones[action.tone],
        )}
        aria-hidden="true"
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="flex-1">
        <h3 className="mb-2 text-xl font-semibold text-ink transition-colors group-hover:text-primary">
          {action.title}
        </h3>
        <p className="text-ink-muted">{action.description}</p>
      </span>
      <span className="mt-auto flex w-full justify-end">
        <ArrowRight
          className="h-5 w-5 text-outline transition-colors group-hover:text-primary"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
