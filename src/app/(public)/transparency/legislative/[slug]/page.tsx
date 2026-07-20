import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { formatDate } from "@/lib/format";
import { PdfViewer } from "@/features/transparency";
import { getPublishedLegislativeBySlug } from "@/features/transparency/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getPublishedLegislativeBySlug(slug);
  if (!doc) return { title: "Document not found" };
  const description = doc.summary.trim()
    ? doc.summary.slice(0, 160)
    : `${doc.number}: ${doc.title}`.slice(0, 160);
  return {
    title: `${doc.number} — ${doc.title}`,
    description,
  };
}

export default async function LegislativeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = await getPublishedLegislativeBySlug(slug);
  if (!doc) notFound();

  return (
    <Section className="pt-32 md:pt-44">
      <Link
        href="/transparency/legislative"
        className="text-sm font-semibold text-ink-500 hover:text-ink-900 hover:underline"
      >
        ← Back to Ordinances &amp; Resolutions
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Badge variant={doc.docType === "ordinance" ? "soft" : "neutral"}>
          {doc.docType === "ordinance" ? "Ordinance" : "Resolution"}
        </Badge>
        <span className="text-sm font-semibold uppercase tracking-wider text-ink-500">
          {doc.number}
        </span>
      </div>

      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
        {doc.title}
      </h1>
      <p className="mt-2 text-ink-500">
        {doc.dateApproved ? `Approved ${formatDate(doc.dateApproved)}` : "Pending Approval"}
      </p>

      {doc.summary ? (
        <div className="mt-8 max-w-3xl">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink-900">
            Summary
          </h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-600">{doc.summary}</p>
        </div>
      ) : null}

      <div className="mt-10">
        <h2 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink-900">
          Full Document
        </h2>
        <PdfViewer
          fileUrl={doc.fileUrl}
          title={`${doc.number} — ${doc.title}`}
          fileSizeBytes={doc.fileSizeBytes}
        />
      </div>
    </Section>
  );
}
