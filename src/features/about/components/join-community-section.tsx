import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

/** Rounded "Join Our Growing Community" call-to-action panel. */
export function JoinCommunitySection() {
  return (
    <section className="py-16 md:py-24">
      <Container className="text-center">
        <div className="relative overflow-hidden rounded-3xl bg-primary p-12 text-white">
          <Users
            className="absolute right-0 top-0 h-64 w-64 translate-x-1/4 -translate-y-1/4 opacity-10"
            aria-hidden="true"
          />
          <h2 className="relative mb-6 text-3xl font-bold md:text-5xl">
            Join Our Growing Community
          </h2>
          <p className="relative mx-auto mb-10 max-w-2xl text-lg text-accent-muted">
            Stay updated with official announcements and participate in our upcoming community
            assemblies. Your voice matters in shaping Sampaguita&apos;s future.
          </p>
          <div className="relative flex flex-col justify-center gap-4 sm:flex-row">
            <Button href="/contact" variant="white" size="xl">
              Register as Resident
            </Button>
            <Button href="/contact" variant="outline-white" size="xl" className="border">
              Volunteer Programs
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
