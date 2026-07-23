import Link from "next/link";
import { Search } from "lucide-react";
import type { UploadBrowseType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Section } from "@/components/ui/section";
import { formatOptionalDate } from "@/lib/format";
import { searchUploads } from "@/features/transparency/queries";
import { Pagination } from "@/components/ui/pagination";
import { RecordActions } from "./record-actions";

type SortKey = "date" | "title" | "type";
type SortDir = "asc" | "desc";

const TYPE_TABS: { value: UploadBrowseType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "legislative", label: "Legislative" },
  { value: "document", label: "Documents" },
  { value: "project", label: "Projects" },
];

const TYPE_LABELS: Record<UploadBrowseType, string> = {
  legislative: "Legislative",
  document: "Document",
  project: "Project",
};

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "type", label: "Type" },
  { key: "date", label: "Date" },
];

function hrefFor(
  q: string,
  type: UploadBrowseType | "all",
  sort: SortKey,
  dir: SortDir,
  page: number,
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type !== "all") params.set("type", type);
  if (sort !== "date") params.set("sort", sort);
  if (dir !== "desc") params.set("dir", dir);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/transparency/uploads?${qs}` : "/transparency/uploads";
}

/** Clicking an already-active column flips its direction; a new column starts ascending. */
function sortHrefFor(
  q: string,
  type: UploadBrowseType | "all",
  sort: SortKey,
  dir: SortDir,
  column: SortKey,
): string {
  const nextDir: SortDir = sort === column && dir === "asc" ? "desc" : "asc";
  return hrefFor(q, type, column, nextDir, 1);
}

export async function UploadsBrowse({
  q,
  type,
  sort,
  dir,
  page,
}: {
  q: string;
  type: UploadBrowseType | "all";
  sort: SortKey;
  dir: SortDir;
  page: number;
}) {
  const first = await searchUploads({ q, type, sort, dir, page });
  const lastPage = Math.max(1, Math.ceil(first.total / first.pageSize));
  const safePage = Math.min(Math.max(page, 1), lastPage);
  const { items, total } =
    safePage === page ? first : await searchUploads({ q, type, sort, dir, page: safePage });

  return (
    <Section tone="white">
      <form action="/transparency/uploads" method="get" className="mb-8 flex flex-col gap-4 md:flex-row">
        {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
        {sort !== "date" ? <input type="hidden" name="sort" value={sort} /> : null}
        {dir !== "desc" ? <input type="hidden" name="dir" value={dir} /> : null}
        <div className="relative w-full">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <label htmlFor="uploads-search" className="sr-only">
            Search uploads
          </label>
          <Input
            id="uploads-search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search by title or keyword..."
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
            href={hrefFor(q, tab.value, sort, dir, 1)}
            aria-current={type === tab.value ? "page" : undefined}
            className={
              type === tab.value
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
          ? "No uploads found."
          : `${total} upload${total === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}.`}
      </p>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-ink-50 p-8 text-center text-ink-600">
          No uploads match that search. Try a different title or keyword.
        </p>
      ) : (
        <>
          {/*
            Below md the table becomes stacked cards, matching the two tables on
            /transparency. Five columns cannot fit a phone, and a table that
            scrolls sideways inside the page reads as the page itself sliding.
            The sort headers are desktop-only; sorting here is plain URL state,
            so a phone still lands on whatever order the link carried.
          */}
          <ul className="space-y-3 md:hidden">
            {items.map((item) => (
              <li
                key={item.key}
                className="rounded-2xl border border-ink-200/70 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-ink-900">{item.title}</p>
                  <RecordActions
                    label={item.title}
                    viewHref={item.href}
                    files={item.files}
                    className="-mr-2 -mt-1"
                  />
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-ink-500">Type</dt>
                    <dd className="text-ink-900">{TYPE_LABELS[item.type]}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-ink-500">Date</dt>
                    <dd className="tabular-nums text-ink-900">{formatOptionalDate(item.date)}</dd>
                  </div>
                  {item.progress !== null ? (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-ink-500">Progress</dt>
                      <dd className="tabular-nums text-ink-900">{item.progress}%</dd>
                    </div>
                  ) : null}
                </dl>
                {item.files.length === 0 && !item.href ? (
                  <p className="mt-3 border-t border-ink-200/70 pt-3 text-sm text-ink-500">
                    At the barangay hall
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-3xl border border-ink-200/70 bg-white md:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Published legislative documents, documents, and projects</caption>
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
                {SORT_COLUMNS.map((column) => {
                  const active = sort === column.key;
                  return (
                    <th key={column.key} scope="col" className="px-6 py-4">
                      <Link
                        href={sortHrefFor(q, type, sort, dir, column.key)}
                        className="inline-flex items-center gap-1 hover:text-ink-900"
                      >
                        {column.label}
                        {active ? (
                          <span aria-hidden="true">{dir === "asc" ? "▲" : "▼"}</span>
                        ) : null}
                        <span className="sr-only">
                          {active ? `, sorted ${dir === "asc" ? "ascending" : "descending"}` : ""}
                        </span>
                      </Link>
                    </th>
                  );
                })}
                <th scope="col" className="px-6 py-4">
                  Progress
                </th>
                <th scope="col" className="px-6 py-4 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200/70">
              {items.map((item) => (
                <tr key={item.key} className="transition-colors duration-(--duration-quick) hover:bg-ink-50">
                  <td className="px-6 py-4 font-medium text-ink-900">{item.title}</td>
                  <td className="px-6 py-4 text-ink-600">{TYPE_LABELS[item.type]}</td>
                  <td className="px-6 py-4 tabular-nums text-ink-600">{formatOptionalDate(item.date)}</td>
                  <td className="px-6 py-4 tabular-nums text-ink-600">
                    {item.progress !== null ? `${item.progress}%` : "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="flex items-center justify-end gap-2">
                      {item.files.length === 0 && !item.href ? (
                        <span className="text-sm text-ink-500">At the barangay hall</span>
                      ) : null}
                      <RecordActions
                        label={item.title}
                        viewHref={item.href}
                        files={item.files}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {lastPage > 1 ? (
        <Pagination
          className="mt-8"
          page={safePage}
          pageSize={first.pageSize}
          total={total}
          hrefFor={(target) => hrefFor(q, type, sort, dir, target)}
          label="Transparency uploads"
        />
      ) : null}
    </Section>
  );
}
