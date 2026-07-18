import {
  CommunityPulseSection,
  GetInvolvedSection,
  HomeHero,
  QuickServicesSection,
} from "@/features/home";

export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <QuickServicesSection />
      <CommunityPulseSection />
      <GetInvolvedSection />
    </>
  );
}
