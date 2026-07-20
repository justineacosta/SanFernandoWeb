import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { NewsGallery } from "@/features/announcements/components/news-gallery";
import { getPublishedArticleBySlug } from "@/features/announcements/queries";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) return { title: "Article not found" };
  return {
    title: article.title,
    description: article.excerpt,
    openGraph: {
      title: article.title,
      description: article.excerpt,
      images: article.photos[0] ? [article.photos[0].src] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) notFound();

  const paragraphs = article.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <Container className="py-12 md:py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/announcements"
          className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to News
        </Link>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="soft" className="w-fit">{article.category}</Badge>
          {article.isNew ? <Badge variant="new">New</Badge> : null}
        </div>
        <h1 className="mb-4 font-display text-3xl font-bold tracking-tight text-ink-900 md:text-4xl">
          {article.title}
        </h1>
        <div className="mb-8 flex items-center gap-3 text-sm text-ink-600">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100">
            <User className="h-4 w-4 text-ink-900" aria-hidden="true" />
          </span>
          <span>{article.author ?? "Barangay San Fernando"}</span>
          <span aria-hidden="true">·</span>
          <span>{article.dateLabel}</span>
        </div>

        {article.photos.length > 0 ? (
          <div className="mb-8">
            <NewsGallery photos={article.photos} />
          </div>
        ) : null}

        <div className="space-y-4 text-lg leading-relaxed text-ink-700">
          {paragraphs.length > 0
            ? paragraphs.map((p, i) => <p key={i}>{p}</p>)
            : <p>{article.excerpt}</p>}
        </div>
      </div>
    </Container>
  );
}
