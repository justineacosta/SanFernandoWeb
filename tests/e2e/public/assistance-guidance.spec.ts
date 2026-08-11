import { expect, test } from "@playwright/test";

/**
 * The per-category "What to prepare" card (design §7, 5th Playwright bullet).
 *
 * Asserts an invariant rather than naming a category, deliberately: every
 * seeded category ships with an empty description and requirements (migration
 * 0035), but a SuperAdmin can fill any of them in through /admin/services at
 * any time, so a test pinned to "Medical Assistance is the bare one" rots the
 * day someone edits it. The guard under test is
 *
 *   selected && (selected.description || selected.requirements.length > 0)
 *
 * in assistance-form.tsx — i.e. "never render the card with nothing in it" —
 * and that is exactly what this checks, for every option the picker offers.
 *
 * Submits nothing, so it spends no rate-limit budget and is safe to re-run.
 */
test("the guidance card never renders empty", async ({ page }) => {
  await page.goto("/assistance/new");

  const picker = page.getByLabel("What kind of assistance?");
  await expect(picker).toBeVisible();
  const values = await picker.locator("option").evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value),
  );
  expect(values.length).toBeGreaterThan(0);

  const card = page.locator("div").filter({ hasText: /^What to prepare/ }).last();
  let bareSeen = 0;

  for (const value of values) {
    await picker.selectOption(value);
    // The card is conditional markup, not a hidden node, so count() is the
    // question — not visibility.
    if ((await page.getByText("What to prepare", { exact: true }).count()) === 0) {
      bareSeen += 1;
      continue;
    }
    // Rendered: it must carry something. A description paragraph, a bullet, or
    // both — an empty shell is the regression.
    const bullets = await card.locator("li").count();
    const text = ((await card.textContent()) ?? "").replace("What to prepare", "").trim();
    expect(
      bullets > 0 || text.length > 0,
      `The guidance card rendered for category "${value}" with no description and no requirements.`,
    ).toBe(true);
  }

  // If every category now carries guidance, the negative half of design §7's
  // bullet has no subject and this test can no longer prove the guard works.
  // That is a real gap, not a pass — surface it loudly rather than going green.
  expect(
    bareSeen,
    "Every assistance category now has guidance text, so nothing exercises the " +
      "empty-category path. Add a dedicated bare fixture category, or drop this assertion " +
      "deliberately and say why.",
  ).toBeGreaterThan(0);
});
