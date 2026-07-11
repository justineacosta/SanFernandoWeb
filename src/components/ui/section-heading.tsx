import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  title: string;
  description?: string;
  /** Optional "view all" style link rendered on the right. */
  action?: { label: string; href: string };
  /** Underlined home-page style vs. plain display heading. */
  underline?: boolean;
  align?: "left" | "center";
  className?: string;
}

/** Standard section title row with optional description and trailing action link. */
export function SectionHeading({
  title,
  description,
  action,
  underline = false,
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
        <h2
          className={cn(
            "text-2xl font-bold text-primary md:text-3xl",
            underline && "inline-block border-b-4 border-accent pb-2 uppercase",
          )}
        >
          {title}
        </h2>
        {description ? (
          <p className={cn("mt-3 text-ink-muted", align === "center" && "mx-auto max-w-2xl")}>
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1 text-sm font-bold uppercase text-secondary transition-colors hover:text-primary"
        >
          {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
