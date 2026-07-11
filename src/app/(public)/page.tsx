import {
  CommunityPulseSection,
  GetInvolvedSection,
  HomeHero,
  QuickServicesSection,
} from "@/features/home";

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
