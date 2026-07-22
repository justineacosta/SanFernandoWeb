import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lift the card slightly on hover. */
  interactive?: boolean;
}

/** White surface card with the design system's 1px soft border. */
export function Card({ interactive = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-ink-200/70 bg-white shadow-raised",
        interactive &&
          "transition-all duration-(--duration-quick) ease-out-soft hover:-translate-y-1 hover:shadow-floating",
        className,
      )}
      {...props}
    />
  );
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

/** Card title row with optional leading icon and trailing action. */
export function CardHeader({ title, icon, action, className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn("mb-6 flex items-center justify-between border-b border-ink-200/70 pb-4", className)}
      {...props}
    >
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink-900">
        {icon}
        {title}
      </h3>
      {action}
    </div>
  );
}
