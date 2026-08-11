import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Files a document application with a supporting document attached, end to
 * end: the file lands in the private `ticket-media` bucket, the row in
 * `ticket_updates` references it, and the resident sees a ticket number.
 *
 * Spends one `apply:<ip>` hit against `SUBMIT_LIMIT` = 10 per hour, but pins
 * itself to a fresh forged IP per run so no shared budget exists to collide
 * with — copied from `assistance-form.spec.ts`, which copied it from
 * `admin/login.spec.ts`. `page.route()` scoped to the app's own origin,
 * deliberately NOT `test.use({ extraHTTPHeaders })`, which would also send the
 * forged header to `challenges.cloudflare.com` and get the Turnstile widget
 * refused by its edge. NOT `cf-connecting-ip` — `requestIp()` ignores it.
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

test("an application with a supporting document is filed and returns a ticket", async ({
  page,
}) => {
  await page.goto("/services/apply/barangay-clearance");

  await page.getByLabel("First name").fill("Testd");
  // Date.now()-suffixed for the reason ticket-updates.spec.ts established: a
  // fixed surname ties with rows previous runs left behind.
  await page.getByLabel("Last name").fill(`Ramos${Date.now()}`);
  await page.getByLabel("Date of birth").fill("1990-01-15");
  await page.getByLabel("Contact number").fill(`(077) 600-${String(Date.now()).slice(-4)}`);
  await page.getByLabel("Sitio / street address").fill("Sitio 1, Barangay San Fernando");

  await page.getByLabel("Supporting documents (optional)").setInputFiles({
    name: "valid-id.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 test"),
  });

  await page.getByRole("checkbox").check();
  // Cloudflare's callback lands the token in React state, which the form
  // mirrors into a hidden input. Polling that beats the fixed 3s sleep this
  // replaced: it returns as soon as the token is real, and it FAILS rather
  // than silently submitting a null token when the widget never resolves.
  await expect(page.locator('input[name="turnstileToken"]')).not.toHaveValue("", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Submit application" }).click();

  await expect(page.getByText("Application filed")).toBeVisible();
  await expect(page.getByText(/APP-\d{4}-\d{5}/)).toBeVisible();
});
