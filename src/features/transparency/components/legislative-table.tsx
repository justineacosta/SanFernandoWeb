"use client";

import { Fragment, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateApproved } from "@/lib/format";
import { useDisclosure } from "@/hooks/use-disclosure";
import { useTableSort } from "@/components/ui/use-table-sort";
import { SortableTh } from "@/components/ui/sortable-th";
import { Pagination } from "@/components/ui/pagination";
import { RecordActions } from "./record-actions";
import type { LegislativeDetail, TransparencyFile } from "@/types";

interface LegislativeTableProps {
  /** Screen-reader caption describing the table. */
  caption: string;
  documents: LegislativeDetail[];
  /**
   * Set on the /transparency previews: the table pages itself over the rows it
   * was handed and renders its own footer. Omitted on the archive page, which
   * pages on the server and supplies the footer itself.
   */
  previewPageSize?: number;
  /**
   * "none" on the archive page: its order comes from the server, so sorting
   * one page of four would quietly lie about the other three.
   */
  sort?: "client" | "none";
}

type Accessors = Record<string, (row: LegislativeDetail) => string | number | null>;

// Hoisted out of the render: useTableSort memoises on the accessors object, so
// a fresh literal every render would re-sort every render.
const SORT_ACCESSORS: Accessors = {
  number: (doc) => doc.number,
  title: (doc) => doc.title,
  date: (doc) => doc.dateApproved,
};

// useTableSort returns rows untouched when it finds no accessor for the key,
// which is exactly what the archive wants: the server already chose the order.
const NO_ACCESSORS: Accessors = {};

/** The single PDF a legislative document may carry, in the shape the kebab wants. */
function filesFor(doc: LegislativeDetail): TransparencyFile[] {
  if (!doc.fileUrl) return [];
  return [
    {
      id: doc.id,
      url: doc.fileUrl,
      label: "Download PDF",
      mime: "application/pdf",
      sizeBytes: doc.fileSizeBytes ?? 0,
    },
  ];
}

/** Legislative document table where each row expands to show the document summary. */
export function LegislativeTable({
  caption,
  documents,
  previewPageSize,
  sort = "client",
}: LegislativeTableProps) {
  const sortable = sort === "client";
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    documents,
    { key: sortable ? "date" : "", dir: "desc" },
    sortable ? SORT_ACCESSORS : NO_ACCESSORS,
  );

  const [page, setPage] = useState(1);
  // A new sort re-orders every row, so whatever page the reader was on no
  // longer points at the same records. Reset during render (React's
  // documented "adjusting state when a prop changes" pattern) rather than in
  // an effect: an effect firing after paint would flash the old, now-wrong
  // page for one frame, and eslint-plugin-react-hooks flags a setState that
  // only ever mirrors a render-time value as an effect that shouldn't exist.
  const [prevSortKey, setPrevSortKey] = useState(sortKey);
  const [prevSortDir, setPrevSortDir] = useState(sortDir);
  if (sortKey !== prevSortKey || sortDir !== prevSortDir) {
    setPrevSortKey(sortKey);
    setPrevSortDir(sortDir);
    setPage(1);
  }

  const lastPage = previewPageSize
    ? Math.max(1, Math.ceil(sorted.length / previewPageSize))
    : 1;
  const safePage = Math.min(Math.max(page, 1), lastPage);
  const rows = previewPageSize
    ? sorted.slice((safePage - 1) * previewPageSize, safePage * previewPageSize)
    : sorted;

  const empty = sorted.length === 0;

  return (
    <>
      {/*
        Below md the table becomes stacked cards carrying the same data and the
        same expandable summary. Five columns cannot fit a phone, and a table
        that scrolls sideways inside the page reads as the page itself sliding.
        Sorting controls are omitted on mobile: the rows arrive newest-first,
        which is the useful order, and a sort bar would cost more room than it
        earns. Only one of the two renderings is ever in the a11y tree.
      */}
      <ul className="space-y-3 md:hidden">
        {empty ? (
          <li className="rounded-2xl border border-ink-200/70 bg-white px-4 py-10 text-center text-ink-600">
            No documents have been published yet.
          </li>
        ) : (
          rows.map((doc) => <LegislativeCard key={doc.id} doc={doc} />)
        )}
      </ul>
      <div className="relative hidden overflow-x-auto rounded-3xl border border-ink-200/70 bg-white md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
              <th scope="col" className="w-12 px-4 py-4">
                <span className="sr-only">Expand</span>
              </th>
              {sortable ? (
                <>
                  <SortableTh
                    label="Number"
                    sortKey="number"
                    activeKey={sortKey}
                    dir={sortDir}
                    onToggle={toggle}
                  />
                  <SortableTh
                    label="Title"
                    sortKey="title"
                    activeKey={sortKey}
                    dir={sortDir}
                    onToggle={toggle}
                  />
                  <SortableTh
                    label="Date Approved"
                    sortKey="date"
                    activeKey={sortKey}
                    dir={sortDir}
                    onToggle={toggle}
                  />
                </>
              ) : (
                <>
                  <th scope="col" className="px-6 py-4">
                    Number
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Title
                  </th>
                  <th scope="col" className="px-6 py-4">
                    Date Approved
                  </th>
                </>
              )}
              <th scope="col" className="px-6 py-4 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/70">
            {empty ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-ink-600">
                  No documents have been published yet.
                </td>
              </tr>
            ) : (
              rows.map((doc) => <LegislativeRow key={doc.id} doc={doc} />)
            )}
          </tbody>
        </table>
      </div>
      {previewPageSize && sorted.length > previewPageSize ? (
        <Pagination
          className="mt-4"
          page={safePage}
          pageSize={previewPageSize}
          total={sorted.length}
          onPageChange={setPage}
          label={caption}
        />
      ) : null}
    </>
  );
}

/** Phone-width equivalent of one LegislativeRow, summary and all. */
function LegislativeCard({ doc }: { doc: LegislativeDetail }) {
  const { isOpen, toggle } = useDisclosure();
  const panelId = useId();
  const files = filesFor(doc);

  return (
    <li className="rounded-2xl border border-ink-200/70 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium tabular-nums text-ink-900">{doc.number}</p>
        <RecordActions
          label={doc.number}
          viewHref={`/transparency/legislative/${doc.slug}`}
          files={files}
          className="-mr-2 -mt-1"
        />
      </div>
      <p className="mt-1 text-sm text-ink-900">{doc.title}</p>
      <p className="mt-2 text-sm tabular-nums text-ink-600">
        {formatDateApproved(doc.dateApproved)}
      </p>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-ink-900 hover:underline"
      >
        {isOpen ? "Hide" : "Show"} summary
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-300",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
        <span className="sr-only"> of {doc.number}</span>
      </button>
      <p
        id={panelId}
        hidden={!isOpen}
        className="mt-2 text-sm leading-relaxed text-ink-600"
      >
        {doc.summary}
      </p>
    </li>
  );
}

/** One document: a summary row plus a toggleable full-width detail row. */
function LegislativeRow({ doc }: { doc: LegislativeDetail }) {
  const { isOpen, toggle } = useDisclosure();
  const panelId = useId();
  const files = filesFor(doc);

  return (
    <Fragment>
      <tr className="transition-colors duration-(--duration-quick) hover:bg-ink-50">
        <td className="px-4 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-300",
                isOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
            <span className="sr-only">
              {isOpen ? "Hide" : "Show"} summary of {doc.number}
            </span>
          </button>
        </td>
        <td className="whitespace-nowrap px-6 py-4 font-medium tabular-nums text-ink-900">
          {doc.number}
        </td>
        <td className="px-6 py-4 text-ink-900">{doc.title}</td>
        <td className="whitespace-nowrap px-6 py-4 tabular-nums text-ink-600">
          {formatDateApproved(doc.dateApproved)}
        </td>
        <td className="px-6 py-4">
          <div className="flex justify-end">
            <RecordActions
              label={doc.number}
              viewHref={`/transparency/legislative/${doc.slug}`}
              files={files}
            />
          </div>
        </td>
      </tr>
      <tr id={panelId} hidden={!isOpen} className="bg-ink-50/60">
        <td colSpan={5} className="px-6 py-5">
          <p className="max-w-3xl leading-relaxed text-ink-600">{doc.summary}</p>
        </td>
      </tr>
    </Fragment>
  );
}
