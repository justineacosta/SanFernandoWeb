"use client";

import { Fragment, useId } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateApproved } from "@/lib/format";
import { useDisclosure } from "@/hooks/use-disclosure";
import { useTableSort } from "@/components/ui/use-table-sort";
import { SortableTh } from "@/components/ui/sortable-th";
import type { LegislativeDetail } from "@/types";

interface LegislativeTableProps {
  /** Screen-reader caption describing the table. */
  caption: string;
  documents: LegislativeDetail[];
}

/** Legislative document table where each row expands to show the document summary. */
export function LegislativeTable({
  caption,
  documents,
}: LegislativeTableProps) {
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    documents,
    { key: "date", dir: "desc" },
    {
      number: (d) => d.number,
      title: (d) => d.title,
      date: (d) => d.dateApproved,
    },
  );

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
        {sorted.length === 0 ? (
          <li className="rounded-2xl border border-ink-200/70 bg-white px-4 py-10 text-center text-ink-600">
            No documents have been published yet.
          </li>
        ) : (
          sorted.map((doc) => <LegislativeCard key={doc.id} doc={doc} />)
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
              <th scope="col" className="px-6 py-4 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/70">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-ink-600">
                  No documents have been published yet.
                </td>
              </tr>
            ) : (
              sorted.map((doc) => <LegislativeRow key={doc.id} doc={doc} />)
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Phone-width equivalent of one LegislativeRow, summary and all. */
function LegislativeCard({ doc }: { doc: LegislativeDetail }) {
  const { isOpen, toggle } = useDisclosure();
  const panelId = useId();

  return (
    <li className="rounded-2xl border border-ink-200/70 bg-white p-4 shadow-sm">
      <p className="font-medium tabular-nums text-ink-900">{doc.number}</p>
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
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-ink-200/70 pt-3 text-sm">
        {doc.fileUrl ? (
          <a
            href={doc.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold uppercase text-ink-900 hover:underline"
          >
            Download
            <span className="sr-only"> {doc.number}</span>
          </a>
        ) : (
          <span className="text-ink-500">At the barangay hall</span>
        )}
        <Link
          href={`/transparency/legislative/${doc.slug}`}
          className="font-semibold uppercase text-ink-900 hover:underline"
        >
          View
          <span className="sr-only"> {doc.number}</span>
        </Link>
      </div>
    </li>
  );
}

/** One document: a summary row plus a toggleable full-width detail row. */
function LegislativeRow({ doc }: { doc: LegislativeDetail }) {
  const { isOpen, toggle } = useDisclosure();
  const panelId = useId();

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
        <td className="px-6 py-4 text-right">
          <span className="flex items-center justify-end gap-4">
            {doc.fileUrl ? (
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold uppercase text-ink-900 hover:underline"
              >
                Download
                <span className="sr-only"> {doc.number}</span>
              </a>
            ) : (
              <span className="text-sm text-ink-500">At the barangay hall</span>
            )}
            <Link
              href={`/transparency/legislative/${doc.slug}`}
              className="font-semibold uppercase text-ink-900 hover:underline"
            >
              View
              <span className="sr-only"> {doc.number}</span>
            </Link>
          </span>
        </td>
      </tr>
      <tr id={panelId} hidden={!isOpen} className="bg-ink-50/60">
        <td colSpan={5} className="px-6 py-5">
          <p className="max-w-3xl leading-relaxed text-ink-600">
            {doc.summary}
          </p>
        </td>
      </tr>
    </Fragment>
  );
}
