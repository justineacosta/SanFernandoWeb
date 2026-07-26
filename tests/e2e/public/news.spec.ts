import { expect, test } from "@playwright/test";

/**
 * News teaser (/announcements) and full archive (/news).
 */

test("announcements page shows a news teaser without the old Subscribe CTA", async ({ page }) => {
  await page.goto("/announcements");
  await expect(page.getByRole("heading", { name: "Community News Feed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Subscribe to Alerts" })).toHaveCount(0);

  const cards = page.getByRole("article");
  const count = await cards.count();
  test.skip(count === 0, "no published news articles in this environment");
  expect(count).toBeLessThanOrEqual(3);

  const seeMore = page.getByRole("link", { name: "See More" });
  if ((await seeMore.count()) > 0) {
    await seeMore.click();
    await expect(page).toHaveURL(/\/news$/);
  }
});
