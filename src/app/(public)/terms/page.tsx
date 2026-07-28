import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Container } from "@/components/ui/container";
import { TERMS_OF_USE } from "@/features/legal/data";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for using the Barangay San Fernando website.",
};

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title={TERMS_OF_USE.title} description={TERMS_OF_USE.intro} />
      <Container className="pb-20">
        <div className="mx-auto max-w-3xl space-y-10">
          {TERMS_OF_USE.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-xl font-semibold text-ink-900">{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-ink-600">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
