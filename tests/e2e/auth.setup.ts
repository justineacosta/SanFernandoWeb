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

  // The login page challenges any attempt whose IP or email already carries a
  // recorded failure in the last 5 minutes, and it server-renders that decision
  // (see the adaptive-challenge bullet in CLAUDE.md). `login:ip:*` is shared by
  // every failed login on this machine, so even though THIS sign-in uses the
  // correct password, a wrong-password test that ran earlier — `login.spec.ts`
  // does five on purpose — leaves the widget mounted here. Submitting before
  // Turnstile has issued its token sends an empty one, which the server refuses
  // exactly like a bad password, and the whole `admin` project then fails on its
  // `setup` dependency.
  //
  // Scoped to the visible form: both responsive `<LoginForm />` trees are always
  // mounted, so there can be two of these inputs.
  const visibleForm = page
    .locator("form")
    .filter({ has: page.getByRole("textbox", { name: "Email" }) });
  const token = visibleForm.locator('input[name="turnstileToken"]');

  async function submit() {
    if ((await token.count()) > 0) {
      await expect(token).toHaveValue(/.+/, { timeout: 15_000 });
    }
    await page.getByRole("button", { name: "Sign in" }).click();
  }

  await submit();

  // One retry, mirroring exactly what a real staff member does. The page can
  // only server-render the challenge from the IP key — it cannot see
  // `login:email:*` hits, because no email is known at render time. So when
  // THIS account's address is the flagged one, the first attempt above renders
  // no widget, submits no token, and is turned away with the Turnstile message.
  // The rejection sets challengeRequired, the widget mounts, and the second
  // attempt carries a real token.
  //
  // Must WAIT for that message rather than probing for it: the Server Action
  // round trip means an immediate `isVisible()` reads the pre-submit DOM and
  // always answers false, so the retry would never fire. A successful sign-in
  // simply never shows it and falls through after the timeout.
  const turnedAway = await page
    .getByText("complete the challenge")
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (turnedAway) await submit();

  // The portal, not the login page — proves the session cookie took.
  await expect(page).toHaveURL(/\/admin(?!\/login)/);

  if (!existsSync(dirname(STATE_PATH))) mkdirSync(dirname(STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STATE_PATH });
});
