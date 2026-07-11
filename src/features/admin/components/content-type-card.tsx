import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { IconCircle } from "@/components/ui/icon-circle";
import type { ContentTypeAction } from "@/types";

interface ContentTypeCardProps {
  action: ContentTypeAction;
}

/** Quick-action card for starting a new piece of content. */
export function ContentTypeCard({ action }: ContentTypeCardProps) {
  const Icon = action.icon;

  return (
    <Link
      href={action.href}
      className="group flex h-full flex-col items-start gap-4 rounded-3xl border border-ink-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.18)] hover:border-ink-900"
    >
      <IconCircle
        icon={Icon}
        tone="primary"
        className="transition-transform group-hover:scale-110"
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
