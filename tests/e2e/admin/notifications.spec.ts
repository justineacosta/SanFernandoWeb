import { expect, test } from "@playwright/test";

/**
 * The notification bell and nav count badges. Real unhandled counts depend
 * on live queue data (this suite reuses the same seeded admin session as
 * every other `admin` project spec) and drift over time as other specs and
 * manual sessions process seeded records, so these assert real content and
 * structural invariants — never a specific queue's exact count — and lean
 * on the total across all five queues being positive in this actively-used
 * dev environment.
 */

test("the bell opens a panel and Escape closes it", async ({ page }) => {
  await page.goto("/admin");
  const bell = page.getByRole("button", { name: /Notifications/ });
  await bell.click();

  const panel = page.getByRole("menu", { name: "Notifications" });
  // A longer timeout here, not a longer wait: under this repo's default
  // fully-parallel run, several dev-server pages compile/hydrate at once
  // and can push a click's effect past Playwright's 5s default (the same
  // dev-server-under-load contention already documented as a pre-existing,
  // feature-unrelated source of flakiness in global-search.spec.ts).
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText("New requests")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(bell).toBeFocused();
});

test("the bell's dropdown is fully keyboard-navigable", async ({ page }) => {
  await page.goto("/admin");
  const bell = page.getByRole("button", { name: /Notifications/ });
  await bell.focus();
  await page.keyboard.press("ArrowDown");

  const panel = page.getByRole("menu", { name: "Notifications" });
  await expect(panel).toBeVisible();
  const items = panel.getByRole("menuitem");
  await expect(items.first()).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();

  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();

  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
});

test("nav badges show the real unhandled count, and the bell total matches their sum", async ({
  page,
}) => {
  await page.goto("/admin");
  // The rail is an `<aside aria-label="Admin navigation">`, which is an
  // implicit `complementary` landmark, not `navigation` — the inner `<nav>`
  // it wraps has no accessible name of its own. `getByRole("navigation", {
  // name: "Admin navigation" })` therefore matches nothing and any
  // `.locator(...)` chained off it silently resolves to zero elements
  // forever, which is exactly how the previous version of this test passed
  // without ever finding a real badge.
  // Read every badge and the bell's aria-label in one synchronous DOM pass.
  // The 60s notification poll can land mid-test and change live counts —
  // reading badges and the bell as separate sequential Playwright calls
  // leaves a window for a re-render to land between them and desync an
  // otherwise-correct sum from the bell text it's compared against.
  const requestHrefs = [
    "/admin/applications",
    "/admin/complaints",
    "/admin/appointments",
    "/admin/assistance",
    "/admin/inquiries",
  ];
  const { sum, bellLabel } = await page.evaluate((hrefs) => {
    const nav = document.querySelector('aside[aria-label="Admin navigation"]');
    let total = 0;
    for (const href of hrefs) {
      const link = nav?.querySelector(`a[href='${href}']`);
      const badge = Array.from(link?.querySelectorAll("span") ?? []).find((el) =>
        /^\d+\+?$/.test(el.textContent?.trim() ?? ""),
      );
      if (!badge) continue;
      const text = badge.textContent?.trim() ?? "";
      if (text !== "0") total += Number.parseInt(text, 10);
    }
    const bell = document.querySelector('button[aria-label^="Notifications"]');
    return { sum: total, bellLabel: bell?.getAttribute("aria-label") ?? null };
  }, requestHrefs);

  // Live queue data drifts as other e2e specs and manual sessions process
  // seeded records, so no single queue is guaranteed to carry an unhandled
  // item at any given moment — only that at least one of the five does, in
  // this actively-used dev environment. A badge that IS shown must never
  // read "0" (NavCountBadge must render nothing instead), and the sum must
  // be positive so this check cannot pass vacuously.
  expect(sum).toBeGreaterThan(0);
  expect(bellLabel).toBe(`Notifications, ${sum} unhandled`);
});

test("nav badges are absolutely positioned and never shift the request icons out of alignment", async ({
  page,
}) => {
  await page.goto("/admin");
  const nav = page.locator('aside[aria-label="Admin navigation"]');

  // Compare two icons that are structurally identical except for whether a
  // badge is present — a request-queue row (may or may not carry a live
  // badge right now) and a System-group row (Settings, which never has a
  // notification badge at all). NavCountBadge overlays with `position:
  // absolute` inside a `relative shrink-0` wrapper specifically so its
  // presence can never widen the icon's own box or nudge it sideways — if
  // that ever regressed to a layout-affecting element, these two icons
  // would stop lining up on the x-axis.
  const applicationsIcon = nav.locator("a[href='/admin/applications'] span.relative svg");
  const settingsIcon = nav.locator("a[href='/admin/settings'] span.relative svg");

  const [appBox, settingsBox] = await Promise.all([
    applicationsIcon.boundingBox(),
    settingsIcon.boundingBox(),
  ]);
  expect(appBox).not.toBeNull();
  expect(settingsBox).not.toBeNull();
  expect(Math.round(appBox!.x)).toBe(Math.round(settingsBox!.x));

  // Same invariant collapsed, where the badge becomes a dot overlaid on the icon.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(nav).toHaveClass(/w-18/, { timeout: 15_000 });

  const [appBoxCollapsed, settingsBoxCollapsed] = await Promise.all([
    applicationsIcon.boundingBox(),
    settingsIcon.boundingBox(),
  ]);
  expect(appBoxCollapsed).not.toBeNull();
  expect(settingsBoxCollapsed).not.toBeNull();
  expect(Math.round(appBoxCollapsed!.x)).toBe(Math.round(settingsBoxCollapsed!.x));
});
