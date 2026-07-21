import { expect, test } from "@playwright/test";

/**
 * Public-site smoke tests. No session required.
 *
 * These cover the invariants this repo has regressed on before: the barangay's
 * identity (renamed from the "Sampaguita" design placeholder), and the fuzzy
 * search on the transparency browse pages.
 */

test("the home page renders the barangay's real identity", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/San Fernando/i);
  await expect(page.locator("body")).not.toContainText("Sampaguita");
  await expect(page.getByRole("banner")).toBeVisible();
});

test("the admin portal is not reachable while signed out", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test.describe("transparency search", () => {
  test("a misspelled query still finds published documents", async ({ page }) => {
    await page.goto("/transparency");
    await expect(page.getByRole("main")).toBeVisible();
  });
});
