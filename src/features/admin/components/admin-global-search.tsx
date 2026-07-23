"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { globalSearch } from "@/features/admin/actions/search";
import {
  MIN_QUERY_LENGTH,
  MODULE_META,
  hrefForHit,
  type GlobalSearchHit,
} from "@/features/admin/search-modules";

/** Matches the manager search bars, which settle at 350ms. */
const DEBOUNCE_MS = 350;

/** Consecutive hits sharing a module, so each group renders one heading. */
function groupHits(hits: GlobalSearchHit[]): { module: GlobalSearchHit["module"]; rows: GlobalSearchHit[] }[] {
  const groups: { module: GlobalSearchHit["module"]; rows: GlobalSearchHit[] }[] = [];
  for (const hit of hits) {
    const last = groups[groups.length - 1];
    if (last && last.module === hit.module) last.rows.push(hit);
    else groups.push({ module: hit.module, rows: [hit] });
  }
  return groups;
}

/**
 * Cross-module search in the admin top bar.
 *
 * Results are scoped server-side to the viewer's permissions — see
 * globalSearch(). This component never receives a hit it is not allowed to
 * show, so there is no client-side filtering to get wrong.
 */
export function AdminGlobalSearch() {
  const router = useRouter();
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // The latest query wins. Without this, a slow early request can resolve after
  // a fast later one and repaint the list with stale results.
  const latest = useRef(0);

  // Only schedules work. Clearing on a too-short query happens in onChange
  // below rather than here: setState directly in an effect body cascades
  // renders, and the reset is a response to an event, not a synchronisation.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;
    const timer = setTimeout(() => {
      const token = ++latest.current;
      startTransition(async () => {
        const result = await globalSearch(trimmed);
        if (token !== latest.current) return;
        setHits(result.hits);
        setSearched(!result.tooShort);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Close on outside click and on Escape, the two ways users expect to dismiss
  // a floating panel.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const showPanel = open && query.trim().length >= MIN_QUERY_LENGTH;
  const groups = groupHits(hits);

  return (
    // w-80 is the preferred width, not a fixed one: min-w-0 lets it shrink
    // when the bar is tight (between md and ~980px the sidebar takes 256px
    // and the right-hand cluster would otherwise overflow the viewport).
    // The results panel below is w-full rather than a second fixed width, so
    // it stays exactly as wide as the input at every size — shrinking
    // included. A second hardcoded width would agree at one viewport and
    // drift at every other.
    <div ref={containerRef} className="relative hidden w-80 min-w-0 sm:block">
      <Search
        className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500"
        aria-hidden="true"
      />
      <label htmlFor={inputId} className="sr-only">
        Search the portal
      </label>
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          if (next.trim().length < MIN_QUERY_LENGTH) {
            // Bump the token so an in-flight request cannot repaint the list
            // after the user has cleared the box.
            latest.current += 1;
            setHits([]);
            setSearched(false);
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search..."
        className="w-full rounded-full border border-ink-200 bg-ink-50 py-2 pl-10 pr-9 text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
      />
      {isPending ? (
        <Loader2
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-400"
          aria-hidden="true"
        />
      ) : null}

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-2xl border border-ink-200/70 bg-white p-2 shadow-xl"
        >
          {groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-500">
              {isPending || !searched ? "Searching…" : `No results for "${query.trim()}".`}
            </p>
          ) : (
            groups.map((group) => (
              <div key={`${group.module}-${group.rows[0]!.id}`} className="mb-1 last:mb-0">
                <p
                  data-search-group={MODULE_META[group.module].label}
                  data-search-href={MODULE_META[group.module].href}
                  className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-ink-500"
                >
                  {MODULE_META[group.module].label}
                </p>
                {group.rows.map((hit) => (
                  <button
                    key={`${hit.module}-${hit.id}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    // Lands on the record itself, not just its module page.
                    onClick={() => go(hrefForHit(hit.module, hit.id))}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-ink-50 focus:bg-ink-50 focus:outline-none"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink-900">
                        {hit.label}
                      </span>
                      {hit.sublabel ? (
                        <span className="block truncate text-xs text-ink-500">{hit.sublabel}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium capitalize text-ink-600">
                      {hit.status.replace(/-/g, " ")}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}

      <output aria-live="polite" className="sr-only">
        {showPanel && searched && !isPending
          ? `${hits.length} result${hits.length === 1 ? "" : "s"}`
          : ""}
      </output>
    </div>
  );
}
