import { expect, test } from "@playwright/test";

/**
 * The notification bell and nav count badges. Real unhandled counts depend
 * on live queue data (this suite reuses the same seeded admin session as
 * every other `admin` project spec), so these assert structure and
 * behaviour rather than exact numbers — a badge that reads "0" would be a
 * bug (NavCountBadge must render nothing instead), and that is what is
 * actually checked.
 */

test("the bell opens a panel and Escape closes it", async ({ page }) => {
  await page.goto("/admin");
  const bell = page.getByRole("button", { name: /Notifications/ });
  await bell.click();

  const panel = page.getByRole("menu", { name: "Notifications" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("New requests")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(bell).toBeFocused();
});

test("a nav count badge, if shown, never reads zero", async ({ page }) => {
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Admin navigation" });
  const badges = nav.locator("a[href^='/admin/'] span", { hasText: /^\d+\+?$/ });
  const count = await badges.count();
  for (let i = 0; i < count; i += 1) {
    await expect(badges.nth(i)).not.toHaveText("0");
  }
});
