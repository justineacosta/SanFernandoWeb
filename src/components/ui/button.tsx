import Link from "next/link";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-gradient-to-br from-brand-400 to-brand-600 text-ink-900 shadow-brand-glow hover:shadow-brand-glow-lg hover:brightness-110",
  accent:
    "bg-ink-900 text-white shadow-raised hover:bg-ink-800 hover:shadow-floating",
  outline:
    "border border-ink-200 bg-white/70 text-ink-900 backdrop-blur hover:border-ink-300 hover:bg-white",
  white: "bg-white text-ink-900 shadow-raised hover:bg-ink-50",
  "outline-white": "border border-white/25 bg-white/5 text-white backdrop-blur hover:bg-white/15",
  "outline-danger":
    "border border-danger text-danger hover:bg-danger-soft hover:text-danger-soft-fg",
  ghost: "text-ink-900 hover:bg-ink-900/5",
} as const;

const sizes = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-12 px-7 text-base",
  xl: "h-14 px-9 text-base",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a Next.js Link styled as a button. */
  href?: string;
  className?: string;
  children: React.ReactNode;
  /**
   * React 19 passes `ref` to function components as an ordinary prop, so no
   * forwardRef wrapper is needed — it just has to be declared. Used by
   * ConfirmDialog to put initial focus on Cancel.
   */
  ref?: React.Ref<HTMLButtonElement>;
}

type ButtonProps = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps>;

/** Core action component. Renders a link when `href` is given, a button otherwise. */
export function Button({
  variant = "primary",
  size = "md",
  href,
  className,
  children,
  type,
  ref,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-(--duration-quick) ease-out-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60",
    variants[variant],
    sizes[size],
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}
