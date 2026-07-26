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
