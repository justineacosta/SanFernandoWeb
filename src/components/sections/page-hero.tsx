import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";

interface PageHeroProps {
  title: string;
  description?: string;
  eyebrow?: string;
  align?: "left" | "center";
  children?: React.ReactNode;
}

/**
 * Deep-blue page banner used by every inner page.
 * Renders a dotted texture, optional eyebrow chip, and optional actions.
 */
export function PageHero({ title, description, eyebrow, align = "left", children }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden bg-primary-strong py-16 text-white md:py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <Container className={cn("relative", align === "center" && "text-center")}>
        <div className={cn("max-w-3xl", align === "center" && "mx-auto")}>
          {eyebrow ? (
            <Badge variant="soft" className="mb-6 rounded-full px-3 py-1">
              {eyebrow}
            </Badge>
          ) : null}
          <h1 className="mb-6 text-3xl font-bold leading-tight md:text-5xl">{title}</h1>
          {description ? (
            <p className="text-lg leading-relaxed text-accent-muted md:text-xl">{description}</p>
          ) : null}
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </Container>
    </section>
  );
}
