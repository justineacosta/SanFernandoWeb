import { Suspense } from "react";
import type { Metadata } from "next";
import type { LegislativeType } from "@/types";
import { PageHero } from "@/components/sections/page-hero";
import { PublicTableSkeleton } from "@/components/ui/public-skeleton";
import { LegislativeArchive } from "@/features/transparency";

export const metadata: Metadata = {
  title: "Ordinances & Resolutions",
  description:
    "Searchable archive of ordinances and resolutions enacted by the Sangguniang Barangay of San Fernando.",
};

export default async function LegislativeArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const docType: LegislativeType | "all" =
    params.type === "ordinance" || params.type === "resolution" ? params.type : "all";
  const rawPage = Number.parseInt(params.page ?? "1", 10);
  // Clamp page to valid range (matching safePage logic in queries.ts)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  return (
    <>
      <PageHero
        title="Ordinances & Resolutions"
        description="Search the enacted legislation of the Sangguniang Barangay."
      />
      {/*
        Keyed on the query so changing the search or page re-suspends and the
        skeleton returns, rather than the previous results sitting there looking
        current while the new ones load.
      */}
      <Suspense
        key={`${params.q ?? ""}|${docType}|${page}`}
        fallback={<PublicTableSkeleton what="the legislative archive" />}
      >
        <LegislativeArchive
          q={params.q ?? ""}
          docType={docType}
          page={page}
        />
      </Suspense>
    </>
  );
}
