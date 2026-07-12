"use client";

import { Fragment, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useDisclosure } from "@/hooks/use-disclosure";
import type { LegislativeDocument } from "@/types";

interface LegislativeTableProps {
  /** Screen-reader caption describing the table. */
  caption: string;
  documents: LegislativeDocument[];
}

/** Legislative document table where each row expands to show the document summary. */
export function LegislativeTable({ caption, documents }: LegislativeTableProps) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-ink-200/70 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-600">
            <th scope="col" className="w-12 px-4 py-4">
              <span className="sr-only">Expand</span>
            </th>
            <th scope="col" className="px-6 py-4">
              Number
            </th>
            <th scope="col" className="px-6 py-4">
              Title
            </th>
            <th scope="col" className="px-6 py-4">
              Date Approved
            </th>
            <th scope="col" className="px-6 py-4 text-right">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200/70">
          {documents.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-10 text-center text-ink-600">
                No documents have been published yet.
              </td>
            </tr>
          ) : (
            documents.map((doc) => <LegislativeRow key={doc.number} doc={doc} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

/** One document: a summary row plus a toggleable full-width detail row. */
function LegislativeRow({ doc }: { doc: LegislativeDocument }) {
  const { isOpen, toggle } = useDisclosure();
  const panelId = useId();

  return (
    <Fragment>
      <tr className="transition-colors hover:bg-ink-50">
        <td className="px-4 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform duration-300", isOpen && "rotate-180")}
              aria-hidden="true"
            />
            <span className="sr-only">
              {isOpen ? "Hide" : "Show"} summary of {doc.number}
            </span>
          </button>
        </td>
        <td className="whitespace-nowrap px-6 py-4 font-medium text-ink-900">{doc.number}</td>
        <td className="px-6 py-4 text-ink-900">{doc.title}</td>
        <td className="whitespace-nowrap px-6 py-4 text-ink-600">{formatDate(doc.date)}</td>
        <td className="px-6 py-4 text-right">
          <a href={doc.fileUrl} className="font-semibold uppercase text-ink-900 hover:underline">
            Download
            <span className="sr-only"> {doc.number}</span>
          </a>
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
