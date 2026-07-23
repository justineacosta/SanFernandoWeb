"use client";

import { useState } from "react";
import type { UploadBrowseItem, UploadBrowseType } from "@/types";
import { formatOptionalDate } from "@/lib/format";
import { Pagination } from "@/components/ui/pagination";
import { RecordActions } from "./record-actions";

const TYPE_LABELS: Record<UploadBrowseType, string> = {
  legislative: "Legislative",
  document: "Document",
  project: "Project",
};

interface UploadsPreviewTableProps {
  items: UploadBrowseItem[];
  pageSize: number;
}

/**
 * The /transparency Latest Uploads table.
 *
 * Client-side because paging here is local state, not URL state: three
 * paginated tables share this page, and three competing `?page=` params would
 * be unreadable and would reload the whole route on every click. The archive
 * pages, where a page genuinely is an address, use link mode instead.
 */
export function UploadsPreviewTable({ items, pageSize }: UploadsPreviewTableProps) {
  const [page, setPage] = useState(1);
  const lastPage = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), lastPage);
  const rows = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      {/*
        Below md the table becomes stacked cards. Four columns cannot fit a
        phone, and a table that scrolls sideways inside the page reads as the
        page itself sliding. The two lists render the same rows, so only one is
        ever in the accessibility tree.
      */}
      <ul className="space-y-3 md:hidden">
        {rows.map((item) => (
          <li
            key={item.key}
            className="rounded-2xl border border-ink-200/70 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-ink-900">
                {item.title}
                {item.progress !== null ? (
                  <span className="ml-2 text-xs font-normal text-ink-500">
                    ({item.progress}%)
                  </span>
                ) : null}
              </p>
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
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-3xl border border-ink-200/70 bg-white md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Latest documents uploaded to the transparency portal
          </caption>
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
              <th scope="col" className="px-6 py-4">
                Title
              </th>
              <th scope="col" className="px-6 py-4">
                Type
              </th>
              <th scope="col" className="px-6 py-4">
                Date
              </th>
              <th scope="col" className="px-6 py-4 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/70">
            {rows.map((item) => (
              <tr
                key={item.key}
                className="transition-colors duration-(--duration-quick) hover:bg-ink-50"
              >
                <td className="px-6 py-4 font-medium text-ink-900">
                  {item.title}
                  {item.progress !== null ? (
                    <span className="ml-2 text-xs font-normal text-ink-500">
                      ({item.progress}%)
                    </span>
                  ) : null}
                </td>
                <td className="px-6 py-4 text-ink-600">{TYPE_LABELS[item.type]}</td>
                <td className="px-6 py-4 tabular-nums text-ink-600">
                  {formatOptionalDate(item.date)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end">
                    <RecordActions
                      label={item.title}
                      viewHref={item.href}
                      files={item.files}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > pageSize ? (
        <Pagination
          className="mt-4"
          page={safePage}
          pageSize={pageSize}
          total={items.length}
          onPageChange={setPage}
          label="Latest uploads"
        />
      ) : null}
    </>
  );
}
