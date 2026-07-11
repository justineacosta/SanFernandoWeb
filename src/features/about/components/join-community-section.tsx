import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

/** Rounded "Join Our Growing Community" call-to-action panel. */
export function JoinCommunitySection() {
  return (
    <section className="py-16 md:py-24">
      <Container className="text-center">
        <div className="relative overflow-hidden rounded-3xl bg-ink-900 p-12 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
          />
          <Users
            className="absolute right-0 top-0 h-64 w-64 translate-x-1/4 -translate-y-1/4 opacity-10"
            aria-hidden="true"
          />
          <h2 className="relative mb-6 text-3xl font-semibold tracking-tight md:text-5xl">
            Join Our Growing Community
          </h2>
          <p className="relative mx-auto mb-10 max-w-2xl text-lg text-brand-300">
            Stay updated with official announcements and participate in our upcoming community
            assemblies. Your voice matters in shaping Sampaguita&apos;s future.
          </p>
          <div className="relative flex flex-col justify-center gap-4 sm:flex-row">
            <Button href="/contact" variant="primary" size="xl">
              Register as Resident
            </Button>
            <Button href="/contact" variant="outline-white" size="xl">
              Volunteer Programs
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
