import { test as setup, expect } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Signs in once per run and saves the session for the `admin` project.
 *
 * Credentials come from the environment (`.env.local` is gitignored; CI reads
 * secrets). The account is a dedicated staging staff user — deliberately NOT a
 * SuperAdmin, so the permission-gating specs exercise the real code path
 * instead of the "sees everything" shortcut.
 */
const STATE_PATH = "tests/e2e/.auth/admin.json";

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  setup.skip(
    !email || !password,
    "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in .env.local to run the admin suite.",
  );

  await page.goto("/admin/login");
  // Addressed by role, not label, for both fields: the login page always
  // mounts both the mobile and desktop `<LoginForm />` trees at once (one
  // hidden via `md:hidden`/`hidden md:flex` CSS, never unmounted), so
  // `getByLabel("Email")` matches two legitimately-labeled inputs — a strict
  // mode violation. `getByRole` doesn't have that problem because Playwright's
  // accessibility tree excludes `display:none` elements outright, leaving
  // only the one actually visible for the current viewport. Password already
  // used role for a different, older reason: `getByLabel("Password")` also
  // matches the show/hide toggle's "Show password" aria-label.
  await page.getByRole("textbox", { name: "Email" }).fill(email!);
  await page.getByRole("textbox", { name: "Password" }).fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The portal, not the login page — proves the session cookie took.
  await expect(page).toHaveURL(/\/admin(?!\/login)/);

  if (!existsSync(dirname(STATE_PATH))) mkdirSync(dirname(STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STATE_PATH });
});
