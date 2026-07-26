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

test("news archive loads more articles on demand", async ({ page }) => {
  await page.goto("/news");
  await expect(page.getByRole("heading", { name: "All Community News" })).toBeVisible();

  const cards = page.getByRole("article");
  const initialCount = await cards.count();
  test.skip(initialCount === 0, "no published news articles in this environment");

  const loadMore = page.getByRole("button", { name: "Load More" });
  if ((await loadMore.count()) === 0) {
    return; // fewer than 6 articles total — nothing more to load
  }

  await loadMore.click();
  await expect
    .poll(async () => cards.count(), { timeout: 10_000 })
    .toBeGreaterThan(initialCount);
});

test("article detail page 'Back to News' link points to the archive", async ({ page }) => {
  await page.goto("/news");

  const cards = page.getByRole("article");
  const cardCount = await cards.count();
  test.skip(cardCount === 0, "no published news articles in this environment");

  // Click into the first article via its "Details" link
  const detailsLink = page.getByRole("link", { name: "Details" }).first();
  await detailsLink.click();
  await page.waitForURL(/\/announcements\/.*/, { timeout: 5000 });

  // Assert the "Back to News" link points to /news, not /announcements
  const backLink = page.getByRole("link", { name: "Back to News" });
  await expect(backLink).toHaveAttribute("href", "/news");
});
