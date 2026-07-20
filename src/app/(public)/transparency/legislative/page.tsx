import type { Metadata } from "next";
import type { LegislativeType } from "@/types";
import { PageHero } from "@/components/sections/page-hero";
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
  const page = Number.parseInt(params.page ?? "1", 10);

  return (
    <>
      <PageHero
        title="Ordinances & Resolutions"
        description="Search the enacted legislation of the Sangguniang Barangay."
      />
      <LegislativeArchive
        q={params.q ?? ""}
        docType={docType}
        page={Number.isFinite(page) ? page : 1}
      />
    </>
  );
}
