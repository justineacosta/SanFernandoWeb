import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/container";

interface CtaBannerProps {
  title: React.ReactNode;
  description: string;
  actions: React.ReactNode;
  /** Extra content rendered beside the copy (e.g. an icon grid). */
  aside?: React.ReactNode;
  /** Optional photo rendered behind a deep-blue overlay. */
  backgroundImage?: string;
  className?: string;
}

/** Full-width deep-blue call-to-action band with title, copy, and action buttons. */
export function CtaBanner({
  title,
  description,
  actions,
  aside,
  backgroundImage,
  className,
}: CtaBannerProps) {
  return (
    <section
      className={cn("bg-primary-strong bg-cover bg-center py-16 text-white", className)}
      style={
        backgroundImage
          ? {
              backgroundImage: `linear-gradient(rgba(0, 56, 168, 0.9), rgba(0, 56, 168, 0.9)), url(${backgroundImage})`,
            }
          : undefined
      }
    >
      <Container
        className={cn(
          "flex flex-col items-center gap-8 text-center",
          aside ? "md:flex-row md:justify-between md:text-left" : "md:text-center",
        )}
      >
        <div className={cn(aside && "md:w-1/2")}>
          <h2 className="mb-4 text-3xl font-bold leading-tight md:text-4xl">{title}</h2>
          <p className={cn("mb-8 text-lg text-blue-100", aside ? "max-w-lg" : "mx-auto max-w-2xl")}>
            {description}
          </p>
          <div className={cn("flex flex-col justify-center gap-4 sm:flex-row", aside && "md:justify-start")}>
            {actions}
          </div>
        </div>
        {aside ? <div className="md:w-1/2">{aside}</div> : null}
      </Container>
    </section>
  );
}
