import { expect, test } from "@playwright/test";

/**
 * The floating feedback widget. No session required — feedback is anonymous.
 *
 * The submit test writes a real row to whatever database the dev server points
 * at. That is deliberate: the action is the only gate this endpoint has, and a
 * mock would not exercise it.
 */

test("the launcher opens the dialog and Escape closes it", async ({ page }) => {
  await page.goto("/");
  const launcher = page.getByRole("button", { name: /send feedback about this website/i });
  await expect(launcher).toBeVisible();

  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Send Feedback" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Anonymous");

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(launcher).toBeFocused();
});

test("a too-short subject is refused before the action runs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /send feedback about this website/i }).click();
  await page.getByLabel("Subject").fill("abc");
  await page.getByLabel("Message").fill("This message is easily long enough to pass.");
  await page.getByRole("button", { name: /^send feedback$/i }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Give this a short title." })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Send Feedback");
});

test("a complete report reaches the barangay", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /send feedback about this website/i }).click();
  await page.getByRole("radio", { name: "Bug Report" }).click();
  await page.getByLabel("Subject").fill("E2E: dead download link");
  await page
    .getByLabel("Message")
    .fill("Filed by the Playwright suite. The transparency PDF returned a 404.");
  await page.getByRole("radio", { name: "4 stars" }).click();
  await page.getByRole("button", { name: /^send feedback$/i }).click();

  await expect(page.getByText(/this reached the barangay/i)).toBeVisible();
});
