import { expect, test } from "@playwright/test";

/**
 * The weekend rule (`isClosedDay`, `src/lib/office-days.ts`) is enforced through
 * a refine on `appointmentSchema`, so client-side validation rejects a Saturday
 * before any network call. This test submits nothing and spends no rate-limit
 * budget, and is safe to re-run freely.
 */

test("a weekend date is refused with the reason", async ({ page }) => {
  await page.goto("/appointments/new");

  await page.getByLabel("First name").fill("Testa");
  await page.getByLabel("Last name").fill("Reyes");
  await page.getByLabel("Sitio / street address").fill("Sitio 1, Barangay San Fernando");
  await page.getByLabel("Contact number").fill("(077) 600-0000");
  await page.getByLabel("What is the appointment about?").fill("Consultation with an official");

  // 2026-08-15 is a Saturday, within manilaTodayNextYear()'s window as of
  // 2026-08-10. If this date falls out of range by the time you read this,
  // pick the next in-range Saturday and update this comment.
  await page.getByLabel("Preferred date").fill("2026-08-15");
  await page.getByRole("button", { name: "Request appointment" }).click();

  await expect(page.getByText("The barangay hall is closed on weekends.")).toBeVisible();
});
