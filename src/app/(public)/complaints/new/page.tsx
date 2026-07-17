import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { ApplyUnavailable } from "@/features/services/components/apply-unavailable";
import { ComplaintForm } from "@/features/complaints";
import { isComplaintFlowAvailable } from "@/features/complaints/queries";

export const metadata: Metadata = {
  title: "File an Incident Report",
  description:
    "Report a neighborhood dispute, peace and order issue, or grievance to Barangay San Fernando for mediation.",
};

export default async function NewComplaintPage() {
  const available = await isComplaintFlowAvailable();

  return (
    <>
      <PageHero
        title="File an Incident Report"
        description="Tell us what happened. The Lupong Tagapamayapa reviews every report and will contact you about mediation."
      />
      {available ? (
        <Section>
          <div className="mx-auto max-w-3xl">
            <ComplaintForm />
          </div>
        </Section>
      ) : (
        <ApplyUnavailable
          title="Online incident reporting"
          body="The barangay is not accepting incident reports online right now. You can still file one in person at the barangay hall, where the Lupong Tagapamayapa can take your report directly."
        />
      )}
    </>
  );
}
