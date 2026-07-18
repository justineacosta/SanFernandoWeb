import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { AppointmentForm } from "@/features/appointments";

export const metadata: Metadata = {
  title: "Set an Appointment",
  description:
    "Request an appointment with the officials and staff of Barangay San Fernando, San Nicolas, Ilocos Norte.",
};

export default function NewAppointmentPage() {
  return (
    <>
      <PageHero
        title="Set an Appointment"
        description="Tell us when you would like to visit and what you need. Staff will confirm your schedule before you come."
      />
      <Section>
        <div className="mx-auto max-w-3xl">
          <AppointmentForm />
        </div>
      </Section>
    </>
  );
}
