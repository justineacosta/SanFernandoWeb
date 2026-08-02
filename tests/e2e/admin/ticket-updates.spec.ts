import { expect, test } from "@playwright/test";

/**
 * The ticket timeline's central privacy boundary. This feature has already
 * produced two near-misses around an internal staff note leaking to the
 * resident (see CLAUDE.md's ticket-timeline bullet) — this test is the
 * machine-checkable guarantee that a third one doesn't ship.
 *
 * Runs against the `admin` project (it needs a session to encode a walk-in
 * report and post updates) but its second half drives the public `/track`
 * page in the same browser context — no session is needed there, and using
 * one browser context for both halves is what lets the test carry the ticket
 * number from the admin side to the public side without re-deriving it.
 *
 * The whole `admin` project skips when E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * are unset (auth.setup.ts skips, so this file never gets a storage state to
 * run with) — no separate guard is needed here, matching inbox-tabs.spec.ts.
 *
 * Rate-limit note: this spends exactly one `track:*` lookup hit
 * (LOOKUP_LIMIT = 10 per 10 minutes) on the public side. It never submits a
 * reply, so it spends no `reply:*` budget at all — see CLAUDE.md's Commands
 * section for why that makes this suite far less collision-prone than
 * login.spec.ts or feedback.spec.ts.
 */

const INTERNAL_NOTE = `internal-only-${Date.now()}`;
const PUBLIC_UPDATE = `public-update-${Date.now()}`;

test("an internal note never reaches the public /track timeline", async ({ page }) => {
  // 1. Encode a walk-in complaint so the test owns its own ticket.
  await page.goto("/admin/complaints");
  await page.getByRole("button", { name: "New Report" }).click();

  const drawer = page.getByRole("dialog", { name: "New Report" });
  await drawer.getByLabel("First Name").fill("Testa");
  await drawer.getByLabel("Last Name").fill("Reyes");
  await drawer.getByLabel("Address").fill("Purok 1, San Fernando");
  await drawer.getByLabel("Contact Number").fill("0917 000 0000");
  await drawer.getByLabel("Where It Happened").fill("Barangay road");
  await drawer.getByLabel("Date of Incident").fill("2026-08-01");
  await drawer.getByLabel("What Happened").fill("A test incident narrative for the e2e suite.");
  await drawer.getByLabel(/consent/i).check();
  await drawer.getByRole("button", { name: "Encode report" }).click();

  // 2. Open it and capture the ticket number. Newest-first sort puts it on
  // page 1 regardless of how many older rows exist.
  const row = page.getByRole("row").filter({ hasText: "Testa Reyes" }).first();
  await expect(row).toBeVisible();
  const ticketNo = (await row.textContent())?.match(/CMP-\d{4}-\d{5}/)?.[0];
  expect(ticketNo).toBeTruthy();
  // aria-label on the row's action button is "Review <ticketNo>", not the
  // plain "Review" its visible text reads — match by substring.
  await row.getByRole("button", { name: /review/i }).click();

  // 3. Post a public update, then an internal note.
  //
  // Scoped to the `<ol>` timeline list, not the whole drawer: the composer's
  // own textarea briefly still holds the just-submitted text after the click
  // (postTicketUpdate's success handler clears it via setBody("") only once
  // the Server Action round trip resolves), so an unscoped getByText(body)
  // can match BOTH the persisted timeline entry and the not-yet-cleared
  // composer, a strict-mode violation that is really a race, not a real
  // ambiguity — the timeline entry is the one durable signal.
  const reviewDrawer = page.getByRole("dialog", { name: "Report Details" });
  const timeline = reviewDrawer.locator("ol");
  const composerBody = reviewDrawer.getByLabel("Post an update");

  await composerBody.fill(PUBLIC_UPDATE);
  await reviewDrawer.getByRole("radio", { name: "Resident-visible" }).check();
  await reviewDrawer.getByRole("button", { name: "Post update" }).click();
  await expect(timeline.getByText(PUBLIC_UPDATE)).toBeVisible();
  // Wait for the composer to actually clear before typing the next update —
  // otherwise the first post's still-in-flight setBody("") can land after our
  // next fill() and wipe it, which reads as though the update was never typed.
  await expect(composerBody).toHaveValue("");

  await composerBody.fill(INTERNAL_NOTE);
  await reviewDrawer.getByRole("radio", { name: "Internal note" }).check();
  await reviewDrawer.getByRole("button", { name: "Post update" }).click();
  await expect(timeline.getByText("Internal — not visible to the resident")).toBeVisible();
  await expect(timeline.getByText(INTERNAL_NOTE)).toBeVisible();

  // 4. Look the same ticket up publicly, with no session — a fresh context
  // would prove nothing extra here since /track is unauthenticated either way,
  // but reusing this page keeps the ticket number in scope without re-parsing it.
  await page.goto("/track");
  await page.getByLabel("Ticket number").fill(ticketNo!);
  await page.getByLabel("Last name").fill("Reyes");
  await page.getByRole("button", { name: "Check status" }).click();

  // The public update is there...
  await expect(page.getByText(PUBLIC_UPDATE)).toBeVisible();
  // ...and the internal note is not. This is the assertion the whole feature
  // rests on: `visibility` is filtered in the query, not the component.
  await expect(page.getByText(INTERNAL_NOTE)).toHaveCount(0);
});
