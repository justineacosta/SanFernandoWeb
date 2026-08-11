import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Files an assistance request with a supporting document attached, end to
 * end: the file lands in the private `ticket-media` bucket, the row in
 * `ticket_updates` references it, and the resident sees a ticket number.
 *
 * Spends one `assistance:<ip>` hit against `SUBMIT_LIMIT` = 5 per hour — see
 * CLAUDE.md's Commands section. Roughly 5 runs an hour before it fails on the
 * limiter rather than on a regression. Pinned to its own bucket via a forged
 * `x-forwarded-for` (NOT `cf-connecting-ip` — `requestIp()` ignores that
 * header since the A1 hardening pass), following the exact pattern
 * `tests/e2e/admin/login.spec.ts` established: `page.route()` scoped to the
 * app's own origin, deliberately NOT `test.use({ extraHTTPHeaders })`, which
 * would also send the forged header to `challenges.cloudflare.com` and get the
 * Turnstile widget refused by its edge.
 */
test.beforeEach(async ({ page, baseURL }) => {
  const h = randomUUID().replace(/-/g, "");
  const ip = `198.51.${parseInt(h.slice(0, 2), 16)}.${1 + (parseInt(h.slice(2, 4), 16) % 254)}`;
  const origin = new URL(baseURL ?? "http://localhost:3000").origin;
  await page.route(`${origin}/**`, async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), "x-forwarded-for": ip },
    });
  });
});

test("a request with a supporting document is filed and returns a ticket", async ({ page }) => {
  await page.goto("/assistance/new");

  await page.getByLabel("First name").fill("Testc");
  // Date.now()-suffixed, following the rule ticket-updates.spec.ts established:
  // a fixed surname ties with rows previous runs left behind, and this test
  // never re-finds its row, but a unique one costs nothing and keeps the
  // pattern consistent for whoever copies this file next.
  await page.getByLabel("Last name").fill(`Aquino${Date.now()}`);
  await page.getByLabel("Sitio / street address").fill("Sitio 1, Barangay San Fernando");
  // Unique per run, for the same reason the surname above is: `submitAssistance`
  // now also rate-limits on `assistance:contact:<digits>` at 5/hour, so a fixed
  // number would make this suite collide with itself after five runs.
  await page.getByLabel("Contact number").fill(`(077) 600-${String(Date.now()).slice(-4)}`);
  await page
    .getByLabel("Tell us about your situation")
    .fill("We need help with hospital bills after an accident last week.");

  await page.getByLabel("Supporting documents (optional)").setInputFiles({
    name: "abstract.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 test"),
  });

  await page.getByRole("checkbox").check();
  // Turnstile's token arrives asynchronously via a callback into React state —
  // AssistanceForm has no form-action hidden input to poll (unlike LoginForm),
  // so there is no DOM signal to wait on. A short pause covers the always-pass
  // test key's round trip.
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(page.getByText("Request filed")).toBeVisible();
  await expect(page.getByText(/AST-\d{4}-\d{5}/)).toBeVisible();
});
