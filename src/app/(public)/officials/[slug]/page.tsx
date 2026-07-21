import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { toTelHref } from "@/lib/format";
import { getPublishedOfficialBySlug } from "@/features/officials/queries";
import { AchievementsTimeline } from "@/features/officials";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const official = await getPublishedOfficialBySlug(slug);
  if (!official) return { title: "Official not found" };
  const description = official.bio.trim()
    ? official.bio.slice(0, 160)
    : `${official.name}, ${official.role} of Barangay San Fernando, San Nicolas, Ilocos Norte.`;
  return {
    title: `${official.name} — ${official.role}`,
    description,
    openGraph: { images: [{ url: official.photoUrl }] },
  };
}

export default async function OfficialProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const official = await getPublishedOfficialBySlug(slug);
  if (!official) notFound();

  return (
    <Section className="pt-32 md:pt-44">
      <Link
        href="/officials"
        className="text-sm font-semibold text-ink-500 hover:text-ink-900 hover:underline"
      >
        ← Back to Barangay Officials
      </Link>

      <div className="mt-8 grid gap-10 md:grid-cols-[280px_1fr]">
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-ink-200/70">
          <Image
            src={official.photoUrl}
            alt={official.photoAlt}
            fill
            sizes="(min-width: 768px) 280px, 100vw"
            className="object-cover"
            priority
          />
        </div>

        <div>
          {official.badge ? (
            <Badge variant="soft" className="mb-4">
              {official.badge}
            </Badge>
          ) : null}
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
            {official.name}
          </h1>
          <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-brand-700">
            {official.role}
          </p>
          {official.term ? (
            <p className="mt-1 text-ink-500">Term {official.term}</p>
          ) : null}

          {official.email || official.phone ? (
            <div className="mt-6 flex flex-col gap-2">
              {official.email ? (
                <a
                  href={`mailto:${official.email}`}
                  className="flex items-center gap-2 text-ink-600 transition-colors hover:text-brand-700"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {official.email}
                </a>
              ) : null}
              {official.phone ? (
                <a
                  href={toTelHref(official.phone)}
                  className="flex items-center gap-2 text-ink-600 transition-colors hover:text-brand-700"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {official.phone}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {official.bio ? (
        <div className="mt-12 max-w-3xl">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink-900">About</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-600">{official.bio}</p>
        </div>
      ) : null}

      <AchievementsTimeline achievements={official.achievements} />
    </Section>
  );
}
