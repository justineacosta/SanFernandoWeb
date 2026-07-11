import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconCircle } from "@/components/ui/icon-circle";
import type { ContentTypeAction } from "@/types";

/** Maps the content action's tone to an IconCircle tone + optional accent override. */
const iconTones: Record<
  ContentTypeAction["tone"],
  { tone: "primary" | "secondary"; className?: string }
> = {
  primary: { tone: "primary" },
  secondary: { tone: "secondary" },
  deep: { tone: "primary", className: "bg-brand-200 text-ink-950" },
};

interface ContentTypeCardProps {
  action: ContentTypeAction;
}

/** Quick-action card for starting a new piece of content. */
export function ContentTypeCard({ action }: ContentTypeCardProps) {
  const Icon = action.icon;
  const iconTone = iconTones[action.tone];

  return (
    <Link
      href={action.href}
      className="group flex h-full flex-col items-start gap-4 rounded-3xl border border-ink-200 bg-white p-6 transition-all hover:border-ink-900 hover:shadow-md"
    >
      <IconCircle
        icon={Icon}
        tone={iconTone.tone}
        className={cn("transition-transform group-hover:scale-110", iconTone.className)}
      />
      <span className="flex-1">
        <h3 className="mb-2 text-xl font-semibold text-ink-900 transition-colors group-hover:text-ink-900">
          {action.title}
        </h3>
        <p className="text-ink-600">{action.description}</p>
      </span>
      <span className="mt-auto flex w-full justify-end">
        <ArrowRight
          className="h-5 w-5 text-ink-500 transition-colors group-hover:text-ink-900"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
