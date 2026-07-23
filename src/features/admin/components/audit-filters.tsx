"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import type { AuditActionType } from "@/types";
import { AUDIT_ACTIONS } from "@/types";
import { Input, Select } from "@/components/ui/form";
import { AUDIT_ACTION_LABELS } from "./audit-action-labels";

const DEBOUNCE_MS = 350;

interface AuditFiltersProps {
  q: string;
  type: AuditActionType | "all";
  /** Preserved across filter changes so a chosen column sort survives. */
  sort: string;
  dir: string;
}

/**
 * Search + Action Type filters for the audit log.
 *
 * No submit button: the dropdown navigates on change and the search box
 * navigates on a debounced keystroke. Both `replace` rather than `push` so
 * typing a query does not bury the previous page under a stack of history
 * entries. Page always resets to 1 — staying on page 4 of a result set that
 * just shrank to one page shows an empty table.
 */
export function AuditFilters({ q, type, sort, dir }: AuditFiltersProps) {
  const router = useRouter();
  const [term, setTerm] = useState(q);
  const [pending, startTransition] = useTransition();
  // Skip the debounce effect on mount and on any change that came from the
  // URL rather than from typing — otherwise a back-navigation re-navigates.
  const typed = useRef(false);

  function urlFor(nextQ: string, nextType: string): string {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextType !== "all") params.set("type", nextType);
    if (sort !== "created_at") params.set("sort", sort);
    if (dir !== "desc") params.set("dir", dir);
    const qs = params.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  }

  // Keep the input in sync when the URL changes underneath us (back button,
  // or the Clear-by-emptying case).
  useEffect(() => {
    if (!typed.current) setTerm(q);
  }, [q]);

  useEffect(() => {
    if (!typed.current) return;
    const id = setTimeout(() => {
      typed.current = false;
      startTransition(() => router.replace(urlFor(term, type)));
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
    // urlFor closes over sort/dir/type, all of which are in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, type, sort, dir, router]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-ink-200/70 px-6 py-5">
      <div className="relative min-w-56 flex-1">
        {pending ? (
          <Loader2
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-brand-600"
            aria-hidden="true"
          />
        ) : (
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
        )}
        <label htmlFor="audit-search" className="sr-only">
          Search audit logs
        </label>
        <Input
          id="audit-search"
          type="search"
          value={term}
          onChange={(event) => {
            typed.current = true;
            setTerm(event.target.value);
          }}
          placeholder="Search by user, target, or action..."
          className="pl-12"
        />
        <output className="sr-only" aria-live="polite">
          {pending ? "Searching…" : ""}
        </output>
      </div>

      <div>
        <label htmlFor="audit-type" className="sr-only">
          Action type
        </label>
        <Select
          id="audit-type"
          value={type}
          onChange={(event) =>
            startTransition(() => router.replace(urlFor(term, event.target.value)))
          }
          className="w-auto"
        >
          <option value="all">All Action Types</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {AUDIT_ACTION_LABELS[action]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
