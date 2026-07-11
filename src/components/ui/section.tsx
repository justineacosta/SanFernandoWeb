import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";

const tones = {
  default: "bg-surface",
  white: "bg-white",
  muted: "bg-surface-mid",
  raised: "bg-surface-high",
  primary: "bg-primary text-white",
} as const;

export type SectionTone = keyof typeof tones;

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  tone?: SectionTone;
  /** Render children inside the standard page container. */
  contained?: boolean;
}

/** Vertical page section with a background tone and standard rhythm. */
export function Section({
  tone = "default",
  contained = true,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section className={cn("py-12 md:py-16", tones[tone], className)} {...props}>
      {contained ? <Container>{children}</Container> : children}
    </section>
  );
}
