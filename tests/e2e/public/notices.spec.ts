import { expect, test } from "@playwright/test";

/**
 * Notices (/notices): the announcements archive and its detail pages.
 */

test("clicking Details on a homepage announcement opens its notice page", async ({ page }) => {
  await page.goto("/");
  const detailsLinks = page.getByRole("link", { name: "Details" });
  const count = await detailsLinks.count();
  test.skip(count === 0, "no published announcements in this environment");

  await detailsLinks.first().click();
  await page.waitForURL(/\/notices\/.+/);
  await expect(page.getByRole("link", { name: "Back to Notices" })).toHaveAttribute(
    "href",
    "/notices",
  );
});

test("notices archive page renders and loads more on demand", async ({ page }) => {
  await page.goto("/notices");
  await expect(page.getByRole("heading", { name: "Community Notices" })).toBeVisible();

  const detailsLinks = page.getByRole("link", { name: "Details" });
  try {
    await expect(detailsLinks.first()).toBeVisible({ timeout: 10_000 });
  } catch {
    test.skip(true, "no published announcements in this environment");
  }
  const initialCount = await detailsLinks.count();

  const loadMore = page.getByRole("button", { name: "Load More" });
  if ((await loadMore.count()) === 0) {
    return; // fewer than 6 announcements total — nothing more to load
  }

  await loadMore.click();
  await expect
    .poll(async () => detailsLinks.count(), { timeout: 10_000 })
    .toBeGreaterThan(initialCount);
});

test("homepage and sidebar 'View All' links point to /notices", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "View All", exact: true })).toHaveAttribute(
    "href",
    "/notices",
  );

  await page.goto("/announcements");
  const viewAll = page.getByRole("link", { name: "View All" });
  try {
    await expect(viewAll.first()).toBeVisible({ timeout: 10_000 });
  } catch {
    test.skip(true, "no published announcements in this environment");
  }
  await expect(viewAll.last()).toHaveAttribute("href", "/notices");
});
