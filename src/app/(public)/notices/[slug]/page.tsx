import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { formatDate } from "@/lib/format";
import { getPublishedAnnouncementBySlug } from "@/features/announcements/queries";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const notice = await getPublishedAnnouncementBySlug(slug);
  if (!notice) return { title: "Notice not found" };
  return {
    title: notice.title,
    description: notice.excerpt,
    openGraph: {
      title: notice.title,
      description: notice.excerpt,
      images: notice.image ? [notice.image] : undefined,
    },
  };
}

export default async function NoticePage({ params }: PageProps) {
  const { slug } = await params;
  const notice = await getPublishedAnnouncementBySlug(slug);
  if (!notice) notFound();

  const paragraphs = notice.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  // pt-32/md:pt-44 clears the fixed SiteHeader, matching the News article
  // detail page this route mirrors.
  return (
    <Container className="pb-12 pt-32 md:pb-16 md:pt-44">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/notices"
          className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Notices
        </Link>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {notice.urgent ? <Badge variant="urgent">Urgent</Badge> : null}
          {notice.isNew ? <Badge variant="new">New</Badge> : null}
        </div>
        <h1 className="mb-4 font-display text-3xl font-bold tracking-tight text-ink-900 md:text-4xl">
          {notice.title}
        </h1>
        <p className="mb-8 text-sm text-ink-600">{formatDate(notice.date)}</p>

        {notice.image ? (
          <div className="relative mb-8 aspect-video w-full overflow-hidden rounded-3xl bg-ink-100">
            <Image
              src={notice.image}
              alt={notice.imageAlt ?? ""}
              fill
              sizes="(min-width: 768px) 768px, 100vw"
              className="object-cover"
            />
          </div>
        ) : null}

        <div className="space-y-4 text-lg leading-relaxed text-ink-700">
          {paragraphs.length > 0
            ? paragraphs.map((p, i) => <p key={i}>{p}</p>)
            : <p>{notice.excerpt}</p>}
        </div>
      </div>
    </Container>
  );
}
