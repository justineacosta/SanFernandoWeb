import { expect, test } from "@playwright/test";

/**
 * The Inquiries & Feedback page. Uses the stored admin session; the whole file
 * skips when E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are unset.
 */

test("the inbox page offers both queues as tabs", async ({ page }) => {
  await page.goto("/admin/inquiries");
  // Scoped to `main`: the top bar's h1 carries the same name, because
  // `adminPageTitle` reads the very nav label this feature renamed.
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Inquiries & Feedback" }),
  ).toBeVisible();

  const tabs = page.getByRole("tablist", { name: "Inbox queue" });
  await expect(tabs.getByRole("tab", { name: "Inquiries" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await tabs.getByRole("tab", { name: "Feedback" }).click();
  await expect(page.getByText("Website Feedback")).toBeVisible();
  await expect(page.getByText("Average Rating")).toBeVisible();
});

test("?tab=feedback lands on the feedback queue directly", async ({ page }) => {
  await page.goto("/admin/inquiries?tab=feedback");
  await expect(page.getByText("Website Feedback")).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "Inbox queue" }).getByRole("tab", { name: "Feedback" }),
  ).toHaveAttribute("aria-selected", "true");
});
