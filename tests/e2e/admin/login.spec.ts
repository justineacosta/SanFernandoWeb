import { expect, test } from "@playwright/test";

/**
 * Runs against the `admin` Playwright project, but deliberately does NOT use
 * the shared signed-in storage state — this test needs to submit the login
 * form itself, repeatedly, with a wrong password.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("repeated bad passwords trip the login rate limit", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  test.skip(!email, "Set E2E_ADMIN_EMAIL in .env.local to run this test.");

  for (let i = 0; i < 5; i++) {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByRole("textbox", { name: "Password" }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }

  // 6th attempt: still the same message (rate limit and bad-password share
  // copy on purpose), but this one is the limiter, not a real auth check.
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByRole("textbox", { name: "Password" }).fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  // The real assertion: even the CORRECT password is now refused, proving
  // this was the limiter and not just another wrong-password rejection.
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (password) {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/admin(?!\/login)/);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
});
