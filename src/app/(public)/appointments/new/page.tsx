import type { Metadata } from "next";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { AppointmentForm } from "@/features/appointments";
import { loadAppointmentDemand } from "@/features/appointments/queries";

export const metadata: Metadata = {
  title: "Set an Appointment",
  description:
    "Request an appointment with the officials and staff of Barangay San Fernando, San Nicolas, Ilocos Norte.",
};

export default async function NewAppointmentPage() {
  const demand = await loadAppointmentDemand();
  return (
    <>
      <PageHero
        title={<>Set an <BrandStroke>Appointment</BrandStroke></>}
        description="Tell us when you would like to visit and what you need. Staff will confirm your schedule before you come."
      />
      <Section>
        <div className="mx-auto max-w-3xl">
          <AppointmentForm demand={demand} />
        </div>
      </Section>
    </>
  );
}
