import type { Metadata } from "next";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { ApplyUnavailable } from "@/features/services/components/apply-unavailable";
import { AssistanceForm } from "@/features/assistance";
import { listActiveAssistanceCategories } from "@/features/assistance/queries";

export const metadata: Metadata = {
  title: "Request Assistance",
  description:
    "Request medical, financial, burial or calamity assistance from Barangay San Fernando, San Nicolas, Ilocos Norte.",
};

export default async function NewAssistancePage() {
  const categories = await listActiveAssistanceCategories();

  return (
    <>
      <PageHero
        title={<>Request <BrandStroke>Assistance</BrandStroke></>}
        description="Tell us what you need. The Barangay Social Welfare Desk reviews every request and will contact you."
      />
      {categories.length > 0 ? (
        <Section>
          <div className="mx-auto max-w-3xl">
            <AssistanceForm categories={categories} />
          </div>
        </Section>
      ) : (
        <ApplyUnavailable
          title="Requesting assistance"
          body="The barangay is not accepting assistance requests online right now. You can still make one in person at the barangay hall."
        />
      )}
    </>
  );
}
