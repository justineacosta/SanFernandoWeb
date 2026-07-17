import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/sections/page-hero";
import { Section } from "@/components/ui/section";
import { ApplyForm } from "@/features/services/components/apply-form";
import { ApplyUnavailable } from "@/features/services/components/apply-unavailable";
import { getApplyService } from "@/features/services/queries";

interface ApplyPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ApplyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = await getApplyService(slug);
  if (!service) return { title: "Apply" };
  return {
    title: `Apply — ${service.title}`,
    description: `File an online request for a ${service.title} from Barangay San Fernando.`,
  };
}

export default async function ApplyPage({ params }: ApplyPageProps) {
  const { slug } = await params;
  const service = await getApplyService(slug);
  if (!service) notFound();

  return (
    <>
      <PageHero title={`Apply for a ${service.title}`} description={service.description} />
      {service.isAvailable ? (
        <Section>
          <div className="mx-auto max-w-3xl">
            <ApplyForm
              serviceId={service.id}
              serviceTitle={service.title}
              requirements={service.requirements}
            />
          </div>
        </Section>
      ) : (
        <ApplyUnavailable title={service.title} />
      )}
    </>
  );
}
