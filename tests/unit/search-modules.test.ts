import { describe, expect, it } from "vitest";
import {
  MIN_QUERY_LENGTH,
  MODULE_META,
  MODULE_PERMISSION,
  SEARCH_MODULES,
} from "@/features/admin/search-modules";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";

/**
 * The global search's allow-list is a security boundary: it is passed INTO the
 * `search_admin_global` RPC, so a module missing from `MODULE_PERMISSION` would
 * not be "ungated" — it would be unreachable — but a module mapped to the WRONG
 * permission would leak records to staff who cannot open the page that holds
 * them. These tests pin the map against the nav, which is the same rule stated
 * in a second place.
 */
describe("global search module map", () => {
  it("maps every module to a permission (or SuperAdmin)", () => {
    for (const name of SEARCH_MODULES) {
      expect(MODULE_PERMISSION, name).toHaveProperty(name);
      expect(MODULE_META, name).toHaveProperty(name);
    }
  });

  it("has no entries for modules that do not exist", () => {
    expect(Object.keys(MODULE_PERMISSION).sort()).toEqual([...SEARCH_MODULES].sort());
    expect(Object.keys(MODULE_META).sort()).toEqual([...SEARCH_MODULES].sort());
  });

  it("agrees with the sidebar about what each permission unlocks", () => {
    // A result must never be reachable through search when its page is not
    // reachable through the nav.
    for (const name of SEARCH_MODULES) {
      const href = MODULE_META[name].href;
      const navItem = ADMIN_NAV_ITEMS.find((item) => item.href === href);
      expect(navItem, `no nav item for ${name} (${href})`).toBeDefined();
      if (!navItem) continue;

      if (MODULE_PERMISSION[name] === null) {
        expect(navItem.superAdminOnly, `${name} should be SuperAdmin-only`).toBe(true);
      } else {
        expect(navItem.permission, `${name} permission mismatch`).toBe(
          MODULE_PERMISSION[name],
        );
      }
    }
  });

  it("keeps the minimum query length above one character", () => {
    // One character reaches a large share of any table through edit distance.
    expect(MIN_QUERY_LENGTH).toBeGreaterThanOrEqual(2);
  });
});
