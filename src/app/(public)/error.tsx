"use client";

import { useEffect } from "react";
import { PhoneCall, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SITE } from "@/constants/site";

/**
 * The public site had no error boundary at all: a thrown Supabase query on any
 * DB-backed page produced an unstyled crash. Residents get this instead.
 *
 * `error.message` is deliberately not shown. It can carry Postgres detail and
 * this page is public. The `digest` is shown so a resident who reports the
 * problem gives us something that matches a server log line.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged before rendering, so a real bug is still visible in development
    // rather than hidden behind the friendly page.
    console.error("Public route error:", error);
  }, [error]);

  return (
    <section className="pb-24 pt-32 md:pt-44">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-brand-100">
            <TriangleAlert className="size-8 text-brand-600" aria-hidden="true" />
          </span>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
            Something went wrong on our end
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-600">
            This page could not be loaded. It is not something you did — please try again, and
            if it keeps happening, call the barangay hall and we will help you directly.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button variant="primary" size="lg" onClick={reset}>
              <RotateCcw className="size-5" aria-hidden="true" />
              Try again
            </Button>
            <Button variant="outline" size="lg" href="/">
              Back to the homepage
            </Button>
          </div>

          <p className="mt-8 flex flex-wrap items-center justify-center gap-2 text-ink-600">
            <PhoneCall className="size-5 text-brand-600" aria-hidden="true" />
            <span>
              Barangay hotline:{" "}
              <a href={`tel:${SITE.phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-ink-900 underline underline-offset-4">
                {SITE.phone}
              </a>
            </span>
          </p>

          {error.digest ? (
            <p className="mt-6 text-xs text-ink-400">
              Reference code: <code className="font-mono">{error.digest}</code>
            </p>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
