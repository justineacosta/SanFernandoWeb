import { cn } from "@/lib/utils";

const variants = {
  accent: "bg-accent text-white",
  urgent: "bg-danger-soft text-danger-soft-fg",
  new: "bg-red-500 text-white",
  soft: "bg-accent-soft text-primary",
  inverse: "bg-white/15 text-white",
  neutral: "bg-surface-high text-ink-muted",
} as const;

export type BadgeVariant = keyof typeof variants;

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/** Status chip / label, e.g. "NEW", "URGENT", section eyebrows. */
export function Badge({ variant = "soft", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-block rounded px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
