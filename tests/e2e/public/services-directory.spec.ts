import { expect, test } from "@playwright/test";

/**
 * Service cards route by an explicit `flow` column now, not by inferring the
 * destination from `tone` (migration 0035). No session required, and neither
 * test submits anything, so this spends no rate-limit budget and is safe to
 * re-run freely.
 */

test.describe("services directory", () => {
  test("both request flows are listed and route to their forms", async ({ page }) => {
    await page.goto("/services");

    const assistance = page.getByRole("link", { name: "Request Now" });
    await expect(assistance).toBeVisible();
    await expect(assistance).toHaveAttribute("href", "/assistance/new");

    const appointment = page.getByRole("link", { name: "Book Now" });
    await expect(appointment).toBeVisible();
    await expect(appointment).toHaveAttribute("href", "/appointments/new");
  });

  test("a request flow cannot be opened as a document application", async ({ page }) => {
    // getApplyService guards on `flow`, not `tone`. Both new rows are tone
    // 'primary', so the pre-0035 tone check would have passed them straight
    // through to a full application form for a row with no application table
    // behind it. Verified to fail with the guard reverted to `tone`.
    await page.goto("/services/apply/social-services-assistance");

    // toHaveCount(0), not toBeHidden(): getApplyService returns null for a
    // service whose flow isn't 'apply' (queries.ts:53), which triggers
    // Next's notFound() at page.tsx:27 — a 404 page, not <ApplyUnavailable>.
    // (ApplyUnavailable only renders when a flow==='apply' service resolves
    // but has been toggled off by staff.) Either way the field is absent
    // from the DOM rather than collapsed, but a visibility assertion would
    // pass just as well against a form that merely started collapsed, which
    // is not what this guards.
    await expect(page.getByLabel("First name")).toHaveCount(0);
  });
});
