import { expect, test } from "@playwright/test";

/**
 * Covers the create-account form's split-name/phone fields, the removed
 * password field, and the invite-pending badge + resend action introduced by
 * the 2026-08-01 admin-account-invite design. The emailed set-password link
 * itself is not asserted — not automatable without a live inbox, the same
 * limitation every other email-touching flow in this app already documents.
 *
 * Creates a real Supabase Auth user + profiles row against the shared dev
 * database this suite runs against (same live-data tradeoff
 * notifications.spec.ts documents for queue counts), then archives and
 * permanently deletes it at the end so repeated runs don't accumulate test
 * accounts.
 */
test("creating a user has no password field, and shows an invite-pending badge until first sign-in", async ({
  page,
}) => {
  const email = `e2e-invite-${Date.now()}@example.com`;
  const fullName = "Test E2E Invitee";

  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Add user" }).click();

  const dialog = page.getByRole("dialog", { name: "Add user" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("First name")).toBeVisible();
  await expect(dialog.getByLabel("Middle name", { exact: false })).toBeVisible();
  await expect(dialog.getByLabel("Last name")).toBeVisible();
  await expect(dialog.getByLabel("Mobile number")).toBeVisible();
  await expect(dialog.getByText(/temporary password/i)).toHaveCount(0);

  await dialog.getByLabel("First name").fill("Test");
  await dialog.getByLabel("Middle name", { exact: false }).fill("E2E");
  await dialog.getByLabel("Last name").fill("Invitee");
  await dialog.getByLabel("Mobile number").fill("09171234567");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Create user" }).click();

  // The admin top bar's global-search live region is also `role="status"`
  // (an `<output>` with no text, for screen-reader announcements only), so
  // scope to the visible toast to avoid a strict-mode match on both.
  await expect(page.getByRole("status").filter({ hasText: "User created." })).toHaveText(
    "User created.",
  );
  // The drawer (src/components/ui/drawer.tsx) never unmounts — it closes via
  // a CSS transform (translate-x-full) plus `inert` on its wrapper, so the
  // dialog element stays technically "visible" to Playwright's toBeVisible
  // (non-empty bounding box, no display:none/visibility:hidden). Assert it
  // has left the viewport instead, which is what "closed" actually means here.
  await expect(dialog).not.toBeInViewport();

  // Filter down to the one row this test created — the shared roster can
  // otherwise span multiple pages and push it off the first one.
  await page.getByLabel("Search users...").fill(email);
  const row = page.locator("tbody tr", { hasText: email });
  await expect(row).toBeVisible();
  await expect(row.getByText("Invite pending")).toBeVisible();

  // Cleanup: archive then permanently delete the account this test created.
  await row.getByRole("button", { name: `Actions for ${fullName}` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  const archiveDialog = page.getByRole("alertdialog", { name: "Archive this user?" });
  await archiveDialog.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Archived ${fullName}.` })).toHaveText(
    `Archived ${fullName}.`,
  );

  await page.getByRole("button", { name: "Show archived users" }).click();
  await page.getByLabel("Search users...").fill(email);
  const archivedRow = page.locator("tbody tr", { hasText: email });
  await expect(archivedRow).toBeVisible();
  await archivedRow.getByRole("button", { name: `Actions for ${fullName}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete this user?" });
  await deleteDialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Deleted ${fullName}.` })).toHaveText(
    `Deleted ${fullName}.`,
  );
  await expect(archivedRow).toHaveCount(0);
});
