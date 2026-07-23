import { expect, test } from "@playwright/test";

/**
 * The global admin search (sub-project 4).
 *
 * The security property under test: results are scoped to the viewer's
 * permissions, so a staff member cannot learn that a record exists in a module
 * whose page 404s for them. The e2e account is a non-SuperAdmin precisely so
 * this is meaningful.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/admin");
});

const searchBox = (page: import("@playwright/test").Page) =>
  page.getByRole("combobox", { name: /search/i });

test("a one-character query does not search", async ({ page }) => {
  await searchBox(page).fill("b");
  await expect(page.getByRole("listbox")).toBeHidden();
});

test("a nonsense query reports no results rather than staying blank", async ({ page }) => {
  await searchBox(page).fill("zzzzzz");
  await expect(page.getByRole("listbox")).toContainText(/no results/i);
});

test("a misspelled query still finds records", async ({ page }) => {
  await searchBox(page).fill("baranggay");
  await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();
});

test("Escape closes the panel and returns focus to the box", async ({ page }) => {
  await searchBox(page).fill("barangay");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(searchBox(page)).toBeFocused();
});

test("results are limited to modules the account can open", async ({ page }) => {
  await searchBox(page).fill("barangay");
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();

  // Whatever groups appear, each must have a matching nav item in the sidebar.
  const headings = await listbox.locator("[data-search-group]").allTextContents();
  const nav = page.getByRole("navigation").or(page.getByLabel("Admin navigation"));
  for (const heading of headings) {
    const href = await listbox
      .locator(`[data-search-group="${heading}"]`)
      .first()
      .getAttribute("data-search-href");
    expect(href, `group "${heading}" has no destination`).toBeTruthy();
    await expect(nav.locator(`a[href^="${href}"]`).first()).toBeAttached();
  }
});
