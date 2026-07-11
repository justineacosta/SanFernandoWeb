import { PublicShell } from "@/components/layout/public-shell";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

export default function NotFound() {
  return (
    <PublicShell>
      <Section className="py-24 text-center md:py-32">
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-secondary">
          404 — Page Not Found
        </p>
        <h1 className="mb-4 text-3xl font-bold text-primary md:text-5xl">
          This page is not on our records
        </h1>
        <p className="mx-auto mb-8 max-w-xl text-ink-muted">
          The page you are looking for may have been moved or no longer exists. Please head back
          to the home page or contact the barangay office for assistance.
        </p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Button href="/" size="lg">
            Back to Home
          </Button>
          <Button href="/contact" variant="outline" size="lg">
            Contact Us
          </Button>
        </div>
      </Section>
    </PublicShell>
  );
}
