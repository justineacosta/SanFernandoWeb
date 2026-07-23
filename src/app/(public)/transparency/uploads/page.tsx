import { Suspense } from "react";
import type { Metadata } from "next";
import type { UploadBrowseType } from "@/types";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { PageHero } from "@/components/sections/page-hero";
import { PublicTableSkeleton } from "@/components/ui/public-skeleton";
import { UploadsBrowse } from "@/features/transparency";

export const metadata: Metadata = {
  title: "Transparency Uploads",
  description:
    "Browse and search every published document, ordinance, resolution, and project of Barangay San Fernando.",
};

export default async function UploadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const p = await searchParams;
  const type: UploadBrowseType | "all" =
    p.type === "legislative" || p.type === "document" || p.type === "project" ? p.type : "all";
  const sort: "date" | "title" | "type" = p.sort === "title" || p.sort === "type" ? p.sort : "date";
  const dir: "asc" | "desc" = p.dir === "asc" ? "asc" : "desc";
  const rawPage = Number.parseInt(p.page ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  return (
    <>
      <PageHero
        title={<>Transparency <BrandStroke>Uploads</BrandStroke></>}
        description="Search every published record of the barangay."
      />
      <Suspense
        key={`${p.q ?? ""}|${type}|${sort}|${dir}|${page}`}
        fallback={<PublicTableSkeleton what="the transparency uploads" />}
      >
        <UploadsBrowse q={p.q ?? ""} type={type} sort={sort} dir={dir} page={page} />
      </Suspense>
    </>
  );
}
