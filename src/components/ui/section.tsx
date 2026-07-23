import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";

const tones = {
  default: "bg-white",
  white: "bg-white",
  muted: "bg-ink-50",
  raised: "bg-ink-100",
  primary: "bg-ink-950 text-white",
} as const;

export type SectionTone = keyof typeof tones;

const spacings = {
  normal: "py-12 md:py-16",
  spacious: "py-16 md:py-24",
} as const;

export type SectionSpacing = keyof typeof spacings;

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  tone?: SectionTone;
  /** `spacious` for a page's major landing moments; default keeps the current rhythm. */
  spacing?: SectionSpacing;
  /** Render children inside the standard page container. */
  contained?: boolean;
}

/** Vertical page section with a background tone and standard rhythm. */
export function Section({
  tone = "default",
  spacing = "normal",
  contained = true,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section className={cn(spacings[spacing], tones[tone], className)} {...props}>
      {contained ? <Container>{children}</Container> : children}
    </section>
  );
}
