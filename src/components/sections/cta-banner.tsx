import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";

interface CtaBannerProps {
  title: React.ReactNode;
  description: string;
  /** Optional action row; omitted entirely when the banner is copy-only. */
  actions?: React.ReactNode;
  /** Extra content rendered beside the copy (e.g. an icon grid). */
  aside?: React.ReactNode;
  /** Optional photo rendered behind a dark ink overlay. */
  backgroundImage?: string;
  className?: string;
}

/** Contained dark call-to-action panel with amber glow, title, copy, and actions. */
export function CtaBanner({
  title,
  description,
  actions,
  aside,
  backgroundImage,
  className,
}: CtaBannerProps) {
  return (
    <section className={cn("py-12 md:py-16", className)}>
      <Container>
        <div
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-ink-900 via-ink-900 to-ink-800 bg-cover bg-center px-6 py-12 text-white sm:px-10 md:px-14 md:py-16"
          style={
            backgroundImage
              ? {
                  backgroundImage: `linear-gradient(rgba(13, 13, 16, 0.88), rgba(13, 13, 16, 0.88)), url(${backgroundImage})`,
                }
              : undefined
          }
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
          />
          <div
            className={cn(
              "relative flex flex-col items-center gap-8 text-center",
              aside ? "md:flex-row md:justify-between md:text-left" : "md:text-center",
            )}
          >
            <div className={cn(aside && "md:w-1/2")}>
              <h2 className="mb-4 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
                {title}
              </h2>
              <p
                className={cn(
                  "text-lg text-ink-300",
                  actions && "mb-8",
                  aside ? "max-w-lg" : "mx-auto max-w-2xl",
                )}
              >
                {description}
              </p>
              {actions ? (
                <div
                  className={cn(
                    "flex flex-col justify-center gap-4 sm:flex-row",
                    aside && "md:justify-start",
                  )}
                >
                  {actions}
                </div>
              ) : null}
            </div>
            {aside ? <div className="md:w-1/2">{aside}</div> : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
