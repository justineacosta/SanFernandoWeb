import { cn } from "@/lib/utils";

const variants = {
  accent: "border-transparent bg-brand-500 text-ink-900",
  urgent: "border-transparent bg-danger-soft text-danger-soft-fg",
  new: "border-transparent bg-danger text-white",
  soft: "border-brand-200 bg-brand-100 text-brand-800",
  inverse: "border-white/15 bg-white/5 text-brand-300",
  neutral: "border-ink-200 bg-ink-50 text-ink-600",
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
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
