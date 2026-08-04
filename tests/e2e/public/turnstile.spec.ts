import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    /** Set by the stubbed api.js in the rejected-site-key test below. */
    __turnstileRenders: number;
  }
}

/**
 * The Turnstile widget's *failure* states, which no other spec covers.
 *
 * Every happy-path spec in this suite runs against Cloudflare's always-pass
 * test key, so the widget clears non-interactively and its `appearance:
 * "interaction-only"` box stays zero-height — exactly what a healthy render
 * looks like. That means a widget that never renders at all looks identical
 * from the outside, and the only thing the resident sees is the server's
 * "complete the challenge and try again" message pointing at a challenge that
 * is not on the page.
 *
 * These two tests pin the two ways that happens in production — the script is
 * blocked before it loads, and Cloudflare rejects the site key once it has —
 * and assert the widget says so itself. Neither test submits anything, so
 * neither spends a rate-limit budget; they are safe to re-run.
 */

const CF_ORIGIN = "https://challenges.cloudflare.com/**";

/** Matches the widget's own unavailable banner, not a form's validation alert. */
const unavailableBanner = /security check (could not|couldn’t) load/i;

test("a blocked Turnstile script tells the resident, instead of failing silently", async ({
  page,
}) => {
  // An ad blocker, a privacy extension, or a network that filters Cloudflare —
  // the widget script simply never arrives. Aborting the request is the same
  // thing the browser sees in all three cases.
  await page.route(CF_ORIGIN, (route) => route.abort());

  await page.goto("/contact");

  const banner = page.getByRole("alert").filter({ hasText: unavailableBanner });
  await expect(banner.first()).toBeVisible();
  await expect(banner.first()).toContainText(/ad blocker|connection/i);
});

test("a rejected site key surfaces as a retryable error, not an empty box", async ({ page }) => {
  // The api.js response is stubbed rather than driven onto one of Cloudflare's
  // always-fails test keys. Patching the real script's render() from an init
  // script does not survive: Cloudflare installs `window.turnstile` as a plain
  // data property, replacing any accessor defined ahead of it (verified in the
  // browser). What this test is actually about is the component's reaction to
  // an error-callback, not Cloudflare's decision to send one — the genuine
  // network-failure path is covered by the test above.
  //
  // 110200 is the code a real deployment hits most: the hostname is not on the
  // site key's allow-list, which is also what a key rotated without a rebuild
  // looks like, since the site key is inlined at build time.
  await page.route("**/turnstile/v0/api.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.__turnstileRenders = 0;
        window.turnstile = {
          render: function (container, options) {
            window.__turnstileRenders++;
            setTimeout(function () { options["error-callback"]("110200"); }, 0);
            return "stub-widget-id";
          },
          reset: function () {},
          remove: function () {},
        };
      `,
    }),
  );

  await page.goto("/contact");

  // One widget, the inquiry form's. This was 2 until the footer's newsletter
  // panel was removed (2026-08-05) and took the site-wide second widget with
  // it; the delta assertion below is deliberately written so it does not need
  // updating again if that count changes.
  const banner = page.getByRole("alert").filter({ hasText: unavailableBanner });
  await expect(banner).toHaveCount(1);
  await expect(banner.first()).toBeVisible();

  // The resident gets a way out that does not involve reloading the page and
  // losing everything they typed — and it must re-run the whole mount, since
  // turnstile.reset() cannot recover a script that never loaded. Counted as a
  // delta so this does not re-encode how many widgets the page happens to have.
  const before = await page.evaluate(() => window.__turnstileRenders);
  const tryAgain = page.getByRole("button", { name: /try again/i }).first();
  await expect(tryAgain).toBeVisible();
  await tryAgain.click();
  await expect
    .poll(async () => page.evaluate(() => window.__turnstileRenders))
    .toBe(before + 1);
});
