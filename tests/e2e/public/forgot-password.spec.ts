import { expect, test } from "@playwright/test";

/**
 * The admin password-reset request/set flows. No session required — both
 * pages are public by design (the request form is anti-enumeration by
 * construction; the reset form's proof of identity is the emailed code, not
 * a session).
 *
 * `getByRole`, not `getByLabel`, for the email field: AuthLayout mounts both
 * the mobile and desktop trees at once (one hidden via CSS `display:none`),
 * so `getByLabel` would match two legitimately-labeled inputs — the same
 * reason tests/e2e/admin/login.spec.ts and auth.setup.ts use `getByRole`.
 */

test("requesting a reset always shows the same generic message, even for an unknown email", async ({
  page,
}) => {
  await page.goto("/admin/forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill("definitely-not-a-real-account@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(
    page.getByText(/if an account exists for that email, we've sent a link/i),
  ).toBeVisible();
});

test("an invalid email is rejected client-side, before the generic message can show", async ({
  page,
}) => {
  await page.goto("/admin/forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill("not-an-email");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(
    page.getByText(/if an account exists for that email, we've sent a link/i),
  ).not.toBeVisible();
});

test("visiting the reset page with no code shows an invalid-link message", async ({ page }) => {
  await page.goto("/admin/reset-password");

  // .filter({ visible: true }): AuthLayout mounts this paragraph in both the
  // mobile and desktop trees (one hidden via CSS `display:none`), and unlike
  // `getByRole` — which only sees the accessibility tree and so naturally
  // excludes the `display:none` copy — `getByText` matches raw DOM text
  // content regardless of visibility, producing a strict-mode violation
  // (confirmed by running this test unfiltered: two matches). The
  // role-scoped locators below don't need the same filter for the same
  // reason `getByRole("textbox", { name: "Email" })` doesn't elsewhere in
  // this file.
  await expect(
    page.getByText(/this link is invalid or has expired/i).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new one" })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});
