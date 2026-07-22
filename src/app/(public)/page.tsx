import {
  CommunityPulseSection,
  GetInvolvedSection,
  HomeHero,
  QuickServicesSection,
} from "@/features/home";
import { Reveal } from "@/components/ui/reveal";

export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <Reveal>
        <QuickServicesSection />
      </Reveal>
      {/* CommunityPulse reveals its three cards individually — no outer wrap */}
      <CommunityPulseSection />
      <Reveal>
        <GetInvolvedSection />
      </Reveal>
    </>
  );
}
