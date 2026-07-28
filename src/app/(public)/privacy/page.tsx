import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Container } from "@/components/ui/container";
import { PRIVACY_POLICY } from "@/features/legal/data";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Barangay San Fernando handles information submitted through this website.",
};

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title={PRIVACY_POLICY.title} description={PRIVACY_POLICY.intro} />
      <Container className="pb-20">
        <div className="mx-auto max-w-3xl space-y-10">
          {PRIVACY_POLICY.sections.map((section) => (
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
