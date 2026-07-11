import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  primary: "bg-accent-soft text-primary",
  secondary: "bg-blue-50 text-secondary",
  danger: "bg-danger-soft text-danger",
  white: "bg-white text-secondary border border-line",
  inverse: "bg-white/15 text-white",
} as const;

const sizes = {
  sm: "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5",
  md: "h-12 w-12 [&>svg]:h-6 [&>svg]:w-6",
  lg: "h-16 w-16 [&>svg]:h-8 [&>svg]:w-8",
} as const;

interface IconCircleProps {
  icon: LucideIcon;
  tone?: keyof typeof tones;
  size?: keyof typeof sizes;
  /** Square housing instead of circular. */
  square?: boolean;
  className?: string;
}

/** Soft circular (or square) icon housing used across cards and lists. */
export function IconCircle({
  icon: Icon,
  tone = "secondary",
  size = "md",
  square = false,
  className,
}: IconCircleProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        square ? "rounded-lg" : "rounded-full",
        tones[tone],
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
