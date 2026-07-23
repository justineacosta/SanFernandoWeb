import Link from "next/link";
import { Search } from "lucide-react";
import type { LegislativeType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Section } from "@/components/ui/section";
import { Pagination } from "@/components/ui/pagination";
import { LegislativeTable } from "./legislative-table";
import { searchLegislative } from "@/features/transparency/queries";

const TYPE_TABS: { value: LegislativeType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ordinance", label: "Ordinances" },
  { value: "resolution", label: "Resolutions" },
];

function hrefFor(q: string, docType: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (docType !== "all") params.set("type", docType);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/transparency/legislative?${qs}` : "/transparency/legislative";
}

export async function LegislativeArchive({
  q,
  docType,
  page,
}: {
  q: string;
  docType: LegislativeType | "all";
  page: number;
}) {
  const { items, total, pageSize } = await searchLegislative({ q, docType, page });
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), lastPage);

  return (
    <Section tone="white">
      <form action="/transparency/legislative" method="get" className="mb-8 flex flex-col gap-4 md:flex-row">
        {docType !== "all" ? <input type="hidden" name="type" value={docType} /> : null}
        <div className="relative w-full">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <label htmlFor="archive-search" className="sr-only">
            Search ordinances and resolutions
          </label>
          <Input
            id="archive-search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search by number, title, or keyword..."
            className="pl-12"
          />
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full whitespace-nowrap md:w-auto">
          Search
        </Button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {TYPE_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={hrefFor(q, tab.value, 1)}
            aria-current={docType === tab.value ? "page" : undefined}
            className={
              docType === tab.value
                ? "rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 hover:border-brand-400"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <p className="mb-4 text-sm text-ink-500">
        {total === 0
          ? "No documents found."
          : `${total} document${total === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}.`}
      </p>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-ink-50 p-8 text-center text-ink-600">
          No ordinances or resolutions match that search. Try a different number or keyword.
        </p>
      ) : (
        // sort="none": the order comes from the RPC, so client sorting would
        // reorder one page of several and quietly misrepresent the rest. No
        // previewPageSize either — the paging below is URL state.
        <LegislativeTable
          caption="Published ordinances and resolutions"
          documents={items}
          sort="none"
        />
      )}

      {lastPage > 1 ? (
        <Pagination
          className="mt-8"
          page={safePage}
          pageSize={pageSize}
          total={total}
          hrefFor={(target) => hrefFor(q, docType, target)}
          label="Legislative archive"
        />
      ) : null}
    </Section>
  );
}
