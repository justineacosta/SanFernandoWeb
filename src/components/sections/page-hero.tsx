import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Container } from "@/components/ui/container";

interface PageHeroProps {
  title: React.ReactNode;
  description?: string;
  eyebrow?: string;
  align?: "left" | "center";
  children?: React.ReactNode;
}

/**
 * Light page banner used by every inner page.
 * Renders a blueprint-grid texture, optional eyebrow pill, and optional actions.
 * Provides the top padding that clears the fixed floating header.
 */
export function PageHero({ title, description, eyebrow, align = "left", children }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden pb-14 pt-32 md:pb-20 md:pt-44">
      <div
        aria-hidden="true"
        className="grid-bg pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="bg-radial-fade pointer-events-none absolute -top-32 left-1/2 -z-10 h-[480px] w-[900px] -translate-x-1/2 rounded-full blur-2xl"
      />
      <Container className={cn("relative", align === "center" && "text-center")}>
        <div className={cn("max-w-3xl", align === "center" && "mx-auto")}>
          {eyebrow ? (
            <Eyebrow className={cn("mb-5", align === "center" && "justify-center")}>
              {eyebrow}
            </Eyebrow>
          ) : null}
          <h1 className="text-balance font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink-900 md:text-6xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-5 text-lg leading-relaxed text-ink-600 md:text-xl">{description}</p>
          ) : null}
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </Container>
    </section>
  );
}
