import { cn } from "@/lib/utils";

interface BrandStrokeProps {
  children: React.ReactNode;
  /** Animate the stroke drawing itself in (home hero only). */
  draw?: boolean;
  className?: string;
}

/**
 * The site's signature mark: a hand-drawn amber underline beneath one key
 * word. Used sparingly by design (overhaul spec §2) — the home hero, PageHero
 * keywords, the ticket success moment, and the login card. Do not reach for
 * it elsewhere.
 */
export function BrandStroke({ children, draw = false, className }: BrandStrokeProps) {
  return (
    <span className={cn("relative whitespace-nowrap", className)}>
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 300 14"
        className="absolute -bottom-2 left-0 h-2 w-full text-brand-400"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M2 11C57 4 130 4 187 9C229 12 269 11 298 6"
          pathLength={1}
          className={cn(draw && "stroke-draw")}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
