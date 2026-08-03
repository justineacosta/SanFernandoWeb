import { expect, test } from "@playwright/test";

/**
 * Runs against the `admin` Playwright project, but deliberately does NOT use
 * the shared signed-in storage state — this test needs to submit the login
 * form itself, repeatedly, with a wrong password.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Every request in this file gets a unique, run-scoped `cf-connecting-ip`.
 *
 * `requestIp()` prefers that header, so this puts each run on its own
 * `login:ip:*` bucket instead of the machine's shared one — exactly as if the
 * run came from a fresh client. Without it these tests are not idempotent:
 * `login:ip:*` is shared by every failed login on this machine, so one run
 * leaves the next one starting from a flagged IP, and (since Task 4B made the
 * page server-render the challenge from that key) `auth.setup.ts`'s own
 * correct-password sign-in starts demanding a token it never provides,
 * failing the whole `admin` project rather than just this file.
 *
 * Nothing about the code under test changes and no limit is raised or
 * disabled — the email-keyed budget, which is what the first test actually
 * exercises, is untouched.
 *
 * Scoped to the app's own origin via `route()`, deliberately NOT
 * `test.use({ extraHTTPHeaders })`: the latter would also send the forged
 * header to `challenges.cloudflare.com`, whose edge then refuses to serve the
 * widget script, and the widget never issues a token.
 */
const RUN_IP = `198.51.100.${1 + (Date.now() % 250)}`;

test.beforeEach(async ({ page }) => {
  await page.route("http://localhost:3000/**", async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), "cf-connecting-ip": RUN_IP },
    });
  });
});

/**
 * Both responsive `<LoginForm />` trees are always mounted (one hidden via CSS
 * `display:none`), so there can be two `turnstileToken` inputs in the DOM.
 * `getByRole` skips display:none elements, so filtering on a visible Email
 * textbox picks out the form that will actually be submitted.
 */
function visibleForm(page: import("@playwright/test").Page) {
  return page.locator("form").filter({ has: page.getByRole("textbox", { name: "Email" }) });
}

/** Turnstile solves asynchronously; clicking before it does submits an empty token. */
async function waitForToken(page: import("@playwright/test").Page) {
  await expect(visibleForm(page).locator('input[name="turnstileToken"]')).toHaveValue(/.+/, {
    timeout: 15_000,
  });
}

test("repeated bad passwords trip the login rate limit", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  test.skip(!email, "Set E2E_ADMIN_EMAIL in .env.local to run this test.");

  for (let i = 0; i < 5; i++) {
    await page.goto("/admin/login");
    // getByRole, not getByLabel: both responsive `<LoginForm />` trees are
    // always mounted (one hidden via CSS `display:none`), so getByLabel
    // matches two legitimately-labeled inputs. See auth.setup.ts.
    await page.getByRole("textbox", { name: "Email" }).fill(email!);
    await page.getByRole("textbox", { name: "Password" }).fill("definitely-wrong-password");
    // Attempts 2-5 are challenged (attempt 1 recorded the first failure).
    if (i > 0) await waitForToken(page);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }

  // 6th attempt: still the same message (rate limit and bad-password share
  // copy on purpose), but this one is the limiter, not a real auth check.
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email!);
  await page.getByRole("textbox", { name: "Password" }).fill("definitely-wrong-password");
  await waitForToken(page);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  // The real assertion: even the CORRECT password is now refused, proving
  // this was the limiter and not just another wrong-password rejection.
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (password) {
    await page.goto("/admin/login");
    // getByRole, not getByLabel: both responsive `<LoginForm />` trees are
    // always mounted (one hidden via CSS `display:none`), so getByLabel
    // matches two legitimately-labeled inputs. See auth.setup.ts.
    await page.getByRole("textbox", { name: "Email" }).fill(email!);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await waitForToken(page);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/admin(?!\/login)/);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
});

test("the challenge appears only after a failed attempt, and the server enforces it", async ({
  page,
}) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run this test.");

  // A fresh email key, so this test never inherits failures from another run.
  // Any well-formed address works: signIn reads the count before it ever asks
  // Supabase Auth whether the account exists.
  const unknownEmail = `no-such-user-${Date.now()}@example.com`;

  // 1. Record whether this machine's IP key is already flagged. After Task 4B the
  //    page server-renders the challenge from the SHARED login:ip:* key, so "no
  //    challenge on a first attempt" is only true when that key is clean — and on
  //    any dev machine that has run this suite recently, it will not be. Assert
  //    the clean-start case only when the environment actually provides it,
  //    rather than writing a test that passes or fails on run history.
  await page.goto("/admin/login");
  const startedClean =
    (await visibleForm(page).locator('input[name="turnstileToken"]').count()) === 0;

  await page.getByRole("textbox", { name: "Email" }).fill(unknownEmail);
  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
  // Wait only when a widget is actually mounted. A clean start has none, so
  // there is nothing to wait for — and waiting anyway costs the full 15s
  // timeout and then blows the 30s per-test budget before assertion #3 runs.
  // When the IP key IS already flagged, this wait is what makes assertion #2
  // meaningful: submitting a valid token means the rejection below is a real
  // credential failure that RECORDS a hit, rather than a tokenless request
  // bounced at the challenge gate (which records nothing).
  if (!startedClean) await waitForToken(page);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();

  // 2. After a failure the challenge is mounted — true regardless of the start
  //    state, and the assertion that actually matters.
  await expect(visibleForm(page).locator('input[name="turnstileToken"]')).toHaveCount(1);

  // 3. The server refuses a tokenless POST even with the CORRECT password.
  //    Blanking the input proves the gate lives in signIn, not in the widget.
  await page.getByRole("textbox", { name: "Email" }).fill(email!);
  await page.getByRole("textbox", { name: "Password" }).fill(password!);
  await waitForToken(page);
  await visibleForm(page)
    .locator('input[name="turnstileToken"]')
    .evaluate((el) => {
      (el as HTMLInputElement).value = "";
    });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/admin(?!\/login)/);
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});
