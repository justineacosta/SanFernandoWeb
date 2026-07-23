import type { AdminNavGroup, Permission } from "@/types";

/**
 * The admin nav gate: who sees which links, where /admin sends them, and what
 * the top bar calls the current page.
 *
 * These are pure functions over a list passed in rather than reads of
 * ADMIN_NAV_ITEMS, for two reasons. They stay unit-testable without dragging
 * lucide-react into the test environment (every nav item carries an icon
 * component), and the gating rule ends up written once instead of copied into
 * the sidebar, the mobile nav, the redirect and the title bar.
 *
 * AdminNavGroup itself is declared in @/types — this module already imports
 * Permission from there, and owning the type here would make the two files
 * import each other.
 */

export type { AdminNavGroup };

export const ADMIN_NAV_GROUP_LABELS: Record<AdminNavGroup, string> = {
  requests: "Requests",
  content: "Content",
  system: "System",
};

/**
 * Render order for grouped sections only. `firstPermittedPath` does not
 * consult this — it walks the flat order of `ADMIN_NAV_ITEMS` via
 * `visibleNavItems(...)[0]`, so the landing page tracks that array's order,
 * not this one.
 */
const GROUP_ORDER: AdminNavGroup[] = ["requests", "content", "system"];

/** Where a user with no permissions at all still lands. Settings has no gate. */
const FALLBACK_PATH = "/admin/settings";

export interface NavGate {
  isSuperAdmin: boolean;
  permissions: Permission[];
}

/** The structural subset of IconNavItem these helpers need. */
export interface GatedNavItem {
  label: string;
  href: string;
  exact?: boolean;
  superAdminOnly?: boolean;
  permission?: Permission;
  group: AdminNavGroup;
}

export function canSeeNavItem(item: GatedNavItem, gate: NavGate): boolean {
  if (gate.isSuperAdmin) return true;
  if (item.superAdminOnly) return false;
  return !item.permission || gate.permissions.includes(item.permission);
}

export function visibleNavItems<T extends GatedNavItem>(items: T[], gate: NavGate): T[] {
  return items.filter((item) => canSeeNavItem(item, gate));
}

/**
 * Grouped for rendering. A group with nothing visible in it is omitted
 * entirely — a heading over an empty list is worse than no heading.
 */
export function groupNavItems<T extends GatedNavItem>(
  items: T[],
  gate: NavGate,
): { group: AdminNavGroup; label: string; items: T[] }[] {
  const visible = visibleNavItems(items, gate);
  return GROUP_ORDER.map((group) => ({
    group,
    label: ADMIN_NAV_GROUP_LABELS[group],
    items: visible.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);
}

/**
 * Where /admin sends someone. Settings is ungated, so a target always exists
 * and the redirect cannot loop.
 */
export function firstPermittedPath(items: GatedNavItem[], gate: NavGate): string {
  return visibleNavItems(items, gate)[0]?.href ?? FALLBACK_PATH;
}

/**
 * The current page's name, for the top bar.
 *
 * Gated deliberately. The portal 404s on routes the viewer lacks permission
 * for, but the layout — and therefore this bar — renders above that 404. An
 * ungated lookup would print "Applications" over the not-found page and
 * disclose the module's existence, which is the whole thing the 404 gating
 * (umbrella §3.1) exists to prevent.
 *
 * Longest match wins so a nested route beats its parent.
 */
export function adminPageTitle(
  items: GatedNavItem[],
  pathname: string,
  gate: NavGate,
): string {
  const match = visibleNavItems(items, gate)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? "Admin";
}
