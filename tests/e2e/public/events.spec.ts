import { expect, test } from "@playwright/test";

/**
 * Community Calendar (/events): upcoming events and the past-events archive.
 */

test("events page renders", async ({ page }) => {
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Barangay Events" })).toBeVisible();
});

test("past events archive loads more on demand", async ({ page }) => {
  await page.goto("/events");

  const pastHeading = page.getByRole("heading", { name: "Past Events" });
  test.skip((await pastHeading.count()) === 0, "no published past events in this environment");

  const cards = page.getByRole("article");
  const initialCount = await cards.count();

  const loadMore = page.getByRole("button", { name: "Load More" });
  if ((await loadMore.count()) === 0) {
    return; // fewer than 6 past events total — nothing more to load
  }

  await loadMore.click();
  await expect
    .poll(async () => cards.count(), { timeout: 10_000 })
    .toBeGreaterThan(initialCount);
});

test("Community Calendar button and homepage links point to /events", async ({ page }) => {
  await page.goto("/announcements");
  await page.getByRole("link", { name: "Community Calendar" }).click();
  await expect(page).toHaveURL(/\/events$/);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "View Calendar" })).toHaveAttribute(
    "href",
    "/events",
  );
  await expect(page.getByRole("link", { name: "View All Events" })).toHaveAttribute(
    "href",
    "/events",
  );
});
