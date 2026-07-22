"use client";

import { useState } from "react";
import { Home, Info } from "lucide-react";
import type { AdminSiteItemRow, SiteBlockKey } from "@/types";
import { cn } from "@/lib/utils";
import {
  SITE_BLOCK_SPECS,
  SITE_SINGLETON_SPECS,
  type SitePage,
} from "@/features/admin/site-blocks";
import { AdminPageHeader } from "./admin-page-header";
import { SiteBlockEditor } from "./site-block-editor";
import { SiteItemsPanel } from "./site-items-panel";

interface SiteContentManagerProps {
  items: AdminSiteItemRow[];
  blocks: Record<string, string | null>;
}

const TABS: { page: SitePage; label: string; icon: typeof Home }[] = [
  { page: "home", label: "Home page", icon: Home },
  { page: "about", label: "About page", icon: Info },
];

/**
 * The Home and About editors, split by the page each block appears on.
 *
 * Blocks are grouped by page rather than by kind because that is how the person
 * editing thinks about them: they have been asked to change something they saw
 * on a page, and the fastest route to it is the page it was on.
 */
export function SiteContentManager({ items, blocks }: SiteContentManagerProps) {
  const [page, setPage] = useState<SitePage>("home");

  const singletons = SITE_SINGLETON_SPECS.filter((spec) => spec.page === page);
  const collections = SITE_BLOCK_SPECS.filter((spec) => spec.page === page);

  return (
    <>
      <AdminPageHeader
        title="Site Content"
        description="Edit what appears on the public Home and About pages. Changes go live as soon as you save."
      />

      <div
        role="tablist"
        aria-label="Public page"
        className="mb-6 inline-flex rounded-full border border-ink-200/70 bg-white p-1"
      >
        {TABS.map(({ page: value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={page === value}
            onClick={() => setPage(value)}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              page === value ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {singletons.map((spec) => (
          <SiteBlockEditor
            key={spec.key}
            spec={spec}
            value={blocks[spec.key as SiteBlockKey] ?? null}
          />
        ))}
        {collections.map((spec) => (
          <SiteItemsPanel
            key={spec.block}
            spec={spec}
            items={items.filter((item) => item.block === spec.block)}
          />
        ))}
      </div>
    </>
  );
}
