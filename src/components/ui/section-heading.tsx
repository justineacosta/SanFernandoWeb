import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/eyebrow";

interface SectionHeadingProps {
  title: string;
  description?: string;
  /** Small uppercase pill rendered above the title. */
  eyebrow?: string;
  /** Optional "view all" style link rendered on the right. */
  action?: { label: string; href: string };
  align?: "left" | "center";
  className?: string;
}

/** Standard section title row with optional eyebrow pill, description, and action link. */
export function SectionHeading({
  title,
  description,
  eyebrow,
  action,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "mb-8 md:mb-12",
        align === "center"
          ? "text-center"
          : "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        {eyebrow ? (
          <Eyebrow className={cn("mb-4", align === "center" && "justify-center")}>
            {eyebrow}
          </Eyebrow>
        ) : null}
        <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className={cn("mt-3 text-ink-600", align === "center" && "mx-auto max-w-2xl")}>
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:border-ink-300 hover:bg-ink-50"
        >
          {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
