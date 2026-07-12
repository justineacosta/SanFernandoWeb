import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/sections/page-hero";
import { ContactDetails, InquiryForm, MapSection } from "@/features/contact";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Reach out to Barangay San Fernando for inquiries, feedback, or official requests.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        align="center"
        title="Connect with Your Barangay"
        description="We are here to serve you. Reach out for inquiries, feedback, or official requests. Our team is ready to assist the citizens of San Fernando."
      />
      <Container className="py-12 md:py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <ContactDetails />
          </div>
          <div className="lg:col-span-8">
            <InquiryForm />
          </div>
        </div>
      </Container>
      <MapSection />
    </>
  );
}
