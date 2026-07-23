import { describe, expect, it } from "vitest";
import type { Permission } from "@/types";
import {
  type GatedNavItem,
  adminPageTitle,
  canSeeNavItem,
  firstPermittedPath,
  groupNavItems,
  visibleNavItems,
} from "@/lib/admin-nav";

/**
 * The admin nav gate (admin polish, 2026-07-22).
 *
 * These helpers decide three things that fail quietly when wrong: which links a
 * staff member sees, where /admin sends them, and what the top bar calls the
 * page. The last one is a disclosure surface — the portal 404s on unpermitted
 * routes precisely so their existence stays hidden, and a title bar naming the
 * module would undo that from inside the layout that renders above the 404.
 */

const ITEMS: GatedNavItem[] = [
  { label: "Applications", href: "/admin/applications", permission: "process-applications", group: "requests" },
  { label: "Inquiries", href: "/admin/inquiries", permission: "handle-inquiries", group: "requests" },
  { label: "Officials", href: "/admin/officials", permission: "manage-officials", group: "content" },
  { label: "Services Management", href: "/admin/services", superAdminOnly: true, group: "system" },
  { label: "Settings", href: "/admin/settings", group: "system" },
];

const superAdmin = { isSuperAdmin: true, permissions: [] as Permission[] };
const editor = { isSuperAdmin: false, permissions: ["manage-officials"] as Permission[] };
const nobody = { isSuperAdmin: false, permissions: [] as Permission[] };

describe("canSeeNavItem", () => {
  it("lets an ungated item through for everyone", () => {
    expect(canSeeNavItem(ITEMS[4]!, nobody)).toBe(true);
  });

  it("hides a permission-gated item from someone without it", () => {
    expect(canSeeNavItem(ITEMS[2]!, nobody)).toBe(false);
  });

  it("shows a permission-gated item to someone holding it", () => {
    expect(canSeeNavItem(ITEMS[2]!, editor)).toBe(true);
  });

  it("hides a SuperAdmin-only item from a permission holder", () => {
    expect(canSeeNavItem(ITEMS[3]!, editor)).toBe(false);
  });

  it("gives SuperAdmins everything, permissions array notwithstanding", () => {
    expect(ITEMS.every((item) => canSeeNavItem(item, superAdmin))).toBe(true);
  });
});

describe("visibleNavItems", () => {
  it("preserves source order", () => {
    expect(visibleNavItems(ITEMS, superAdmin).map((i) => i.label)).toEqual([
      "Applications",
      "Inquiries",
      "Officials",
      "Services Management",
      "Settings",
    ]);
  });

  it("filters to what the gate allows", () => {
    expect(visibleNavItems(ITEMS, editor).map((i) => i.label)).toEqual([
      "Officials",
      "Settings",
    ]);
  });
});

describe("groupNavItems", () => {
  it("groups in Requests / Content / System order", () => {
    expect(groupNavItems(ITEMS, superAdmin).map((g) => g.group)).toEqual([
      "requests",
      "content",
      "system",
    ]);
  });

  it("drops a group whose every item is gated away, label included", () => {
    const groups = groupNavItems(ITEMS, editor);
    expect(groups.map((g) => g.group)).toEqual(["content", "system"]);
    expect(groups[1]!.items.map((i) => i.label)).toEqual(["Settings"]);
  });

  it("carries a human label for each group", () => {
    expect(groupNavItems(ITEMS, superAdmin)[0]!.label).toBe("Requests");
  });
});

describe("firstPermittedPath", () => {
  it("sends a SuperAdmin to the first item overall", () => {
    expect(firstPermittedPath(ITEMS, superAdmin)).toBe("/admin/applications");
  });

  it("sends an editor to the first item they can actually reach", () => {
    expect(firstPermittedPath(ITEMS, editor)).toBe("/admin/officials");
  });

  it("falls back to Settings for someone with no permissions", () => {
    expect(firstPermittedPath(ITEMS, nobody)).toBe("/admin/settings");
  });

  it("falls back to Settings rather than crashing on an empty list", () => {
    expect(firstPermittedPath([], nobody)).toBe("/admin/settings");
  });
});

describe("adminPageTitle", () => {
  it("names the page from its route", () => {
    expect(adminPageTitle(ITEMS, "/admin/officials", editor)).toBe("Officials");
  });

  it("matches nested routes by prefix", () => {
    expect(adminPageTitle(ITEMS, "/admin/officials/some-id", editor)).toBe("Officials");
  });

  it("refuses to name a module the viewer may not see", () => {
    // The portal 404s here, but this layout renders above the 404 — naming the
    // module would leak exactly what the 404 exists to hide.
    expect(adminPageTitle(ITEMS, "/admin/applications", editor)).toBe("Admin");
  });

  it("falls back for a route with no nav entry", () => {
    expect(adminPageTitle(ITEMS, "/admin", superAdmin)).toBe("Admin");
  });

  it("prefers the longest matching href", () => {
    const nested: GatedNavItem[] = [
      { label: "Transparency", href: "/admin/transparency", group: "content" },
      { label: "Projects", href: "/admin/transparency/projects", group: "content" },
    ];
    expect(adminPageTitle(nested, "/admin/transparency/projects", superAdmin)).toBe("Projects");
  });
});
