import type { Permission } from "@/types";

/**
 * Shared shapes for the global admin search.
 *
 * Its own module because `actions/search.ts` carries `"use server"`, and a
 * "use server" file may only export async functions — constants and types
 * exported alongside the action are a build error. The client component needs
 * these too, so they live here where both sides can import them.
 */

/** Every module the global search can reach, in the order results are shown. */
export const SEARCH_MODULES = [
  "news",
  "announcements",
  "events",
  "officials",
  "services",
  "legislative",
  "documents",
  "projects",
  "applications",
  "appointments",
  "complaints",
  "assistance",
] as const;

export type SearchModule = (typeof SEARCH_MODULES)[number];

export interface GlobalSearchHit {
  module: SearchModule;
  id: string;
  label: string;
  sublabel: string;
  status: string;
}

export interface GlobalSearchResult {
  hits: GlobalSearchHit[];
  /** True when the query was too short to run — the UI prompts rather than showing "no results". */
  tooShort: boolean;
}

/**
 * Which permission unlocks which module.
 *
 * `null` means SuperAdmin-only. Services are SuperAdmin-only in
 * `ADMIN_NAV_ITEMS`, so they are here too — the global search must not surface
 * a module whose nav entry the viewer cannot see.
 */
export const MODULE_PERMISSION: Record<SearchModule, Permission | null> = {
  news: "manage-news",
  announcements: "manage-news",
  events: "manage-news",
  officials: "manage-officials",
  services: null,
  legislative: "manage-transparency",
  documents: "manage-transparency",
  projects: "manage-transparency",
  applications: "process-applications",
  appointments: "process-appointments",
  complaints: "handle-complaints",
  assistance: "handle-assistance",
};

/** Group heading and manager page per module. */
export const MODULE_META: Record<SearchModule, { label: string; href: string }> = {
  news: { label: "News", href: "/admin/news" },
  announcements: { label: "Announcements", href: "/admin/news" },
  events: { label: "Events", href: "/admin/events" },
  officials: { label: "Officials", href: "/admin/officials" },
  services: { label: "Services", href: "/admin/services" },
  legislative: { label: "Legislative", href: "/admin/transparency" },
  documents: { label: "Documents", href: "/admin/transparency" },
  projects: { label: "Projects", href: "/admin/transparency" },
  applications: { label: "Applications", href: "/admin/applications" },
  appointments: { label: "Appointments", href: "/admin/appointments" },
  complaints: { label: "Incident Reports", href: "/admin/complaints" },
  assistance: { label: "Assistance Requests", href: "/admin/assistance" },
};

/** Modules whose manager page shows several tabs, and which tab holds them. */
const MODULE_TAB: Partial<Record<SearchModule, string>> = {
  news: "news",
  announcements: "announcements",
  legislative: "legislative",
  documents: "documents",
  projects: "projects",
};

/** Ticket modules open a review drawer rather than an editor. */
const TICKET_MODULES: SearchModule[] = [
  "applications",
  "appointments",
  "complaints",
  "assistance",
];

/**
 * Where a single search hit should land: the manager page, the tab that holds
 * the record, and the parameter that opens it. See `useEditDeepLink`.
 */
export function hrefForHit(module: SearchModule, id: string): string {
  const { href } = MODULE_META[module];
  const params = new URLSearchParams();
  const tab = MODULE_TAB[module];
  if (tab) params.set("tab", tab);
  params.set(TICKET_MODULES.includes(module) ? "review" : "edit", id);
  return `${href}?${params.toString()}`;
}

/**
 * Two characters is the floor. `fuzzy_match` treats an empty query as "match
 * everything", and a single character matches a large share of any table
 * through the edit-distance route — neither is a useful result list.
 */
export const MIN_QUERY_LENGTH = 2;
