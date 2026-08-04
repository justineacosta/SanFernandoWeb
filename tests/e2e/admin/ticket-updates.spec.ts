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
 * Rate-limit note — this suite is NOT cheap to re-run any more. Per run it
 * spends two `track:*` lookup hits (LOOKUP_LIMIT = 10 per 10 minutes, so ~5
 * runs per 10 minutes) AND, from the reply round trip below, one `reply:ip:*`
 * hit (REPLY_LIMIT = 5 per HOUR — the binding constraint, roughly 5 runs an
 * hour before the reply test starts failing on the limiter rather than on a
 * regression). The reply's other budget, `reply:ticket:*`, is keyed on a
 * ticket this test just created, so it can never collide. See CLAUDE.md's
 * Commands section.
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
  await drawer.getByLabel("Address").fill("Sitio 1, San Fernando");
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

/**
 * Regression guard for the bug the whole-branch review caught: the four review
 * drawers gated their decision buttons on the pre-branch status set, so moving
 * a ticket to `awaiting-info` (which this feature's own composer does) removed
 * every button that could decide it. Applications and appointments could not
 * come back — the composer offers no route to `pending` — leaving the ticket
 * permanently un-approvable.
 *
 * Complaints are the cheapest kind to drive here (no service lookup, no
 * schedule fields) and exercise the same widened gate.
 */
test("a ticket parked on awaiting-info can still be decided", async ({ page }) => {
  await page.goto("/admin/complaints");
  await page.getByRole("button", { name: "New Report" }).click();

  const drawer = page.getByRole("dialog", { name: "New Report" });
  await drawer.getByLabel("First Name").fill("Testb");
  await drawer.getByLabel("Last Name").fill("Bautista");
  await drawer.getByLabel("Address").fill("Sitio 2, San Fernando");
  await drawer.getByLabel("Contact Number").fill("0917 000 0001");
  await drawer.getByLabel("Where It Happened").fill("Barangay hall");
  await drawer.getByLabel("Date of Incident").fill("2026-08-01");
  await drawer.getByLabel("What Happened").fill("A second test incident for the decidability guard.");
  await drawer.getByLabel(/consent/i).check();
  await drawer.getByRole("button", { name: "Encode report" }).click();

  const row = page.getByRole("row").filter({ hasText: "Testb Bautista" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /review/i }).click();

  // Park it on awaiting-info through the composer, exactly as staff would.
  const reviewDrawer = page.getByRole("dialog", { name: "Report Details" });
  await reviewDrawer.getByLabel("Post an update").fill("Please send the blotter number.");
  await reviewDrawer.getByLabel("Also set status to").selectOption("awaiting-info");
  await reviewDrawer.getByRole("button", { name: "Post update" }).click();

  // The status actually moved...
  await expect(reviewDrawer.getByText("Awaiting Information").first()).toBeVisible();
  // ...and the ticket is still closeable. Before the fix this footer was gone
  // entirely, so an unanswered report could never be resolved or dismissed —
  // which design §1 explicitly requires staff to be able to do.
  await expect(reviewDrawer.getByRole("button", { name: "Dismiss" })).toBeVisible();
  await expect(reviewDrawer.getByRole("button", { name: /resolve/i })).toBeVisible();
});

/**
 * The resident reply round trip, end to end: staff ask for information, the
 * resident answers through `/track` with a file attached, and the answer comes
 * back on the admin timeline.
 *
 * `submitTicketReply` is the most exposed surface this feature added — public,
 * unauthenticated, and it accepts file uploads — and every layer of it was
 * proven only by inspection until this test: the surname gate, the
 * `awaiting-info` reply gate, the upload into the private `ticket-media`
 * bucket, the `resident-reply` log row, the `awaiting-info → under-review`
 * flip, and the `replied_at` stamp that raises the "New reply" pill.
 *
 * A 1×1 PNG carried as an in-memory buffer rather than a checked-in fixture —
 * Playwright accepts one directly, and the bytes are incidental here; what is
 * being tested is that an attachment survives the trip, not what is in it.
 */
const REPLY_BODY = `resident-reply-${Date.now()}`;
const REPLY_FILE_NAME = "blotter-copy.png";
/**
 * Unique per run, unlike the fixed surnames the two tests above use. Those two
 * never look their row up again after navigating away; this one returns to the
 * list to check the "New reply" pill, and the queue's newest-first sort keys on
 * `submittedAt` — a DATE, so every row a previous run left behind ties with
 * this one and `.first()` silently resolves to whichever the DB happened to
 * return first. A surname nothing else can match removes the tie entirely.
 * It doubles as the /track surname gate, so it must be used in both places.
 */
const REPLY_SURNAME = `Castillo${Date.now()}`;
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("a resident's reply reaches the admin timeline", async ({ page }) => {
  // 1. Encode a walk-in complaint, as in the tests above.
  await page.goto("/admin/complaints");
  await page.getByRole("button", { name: "New Report" }).click();

  const drawer = page.getByRole("dialog", { name: "New Report" });
  await drawer.getByLabel("First Name").fill("Testc");
  await drawer.getByLabel("Last Name").fill(REPLY_SURNAME);
  await drawer.getByLabel("Address").fill("Sitio 3, San Fernando");
  await drawer.getByLabel("Contact Number").fill("0917 000 0002");
  await drawer.getByLabel("Where It Happened").fill("Barangay plaza");
  await drawer.getByLabel("Date of Incident").fill("2026-08-01");
  await drawer.getByLabel("What Happened").fill("A third test incident for the reply round trip.");
  await drawer.getByLabel(/consent/i).check();
  await drawer.getByRole("button", { name: "Encode report" }).click();

  const row = page.getByRole("row").filter({ hasText: REPLY_SURNAME });
  await expect(row).toBeVisible();
  const ticketNo = (await row.textContent())?.match(/CMP-\d{4}-\d{5}/)?.[0];
  expect(ticketNo).toBeTruthy();
  await row.getByRole("button", { name: /review/i }).click();

  // 2. Park it on awaiting-info. The reply form is gated on this status alone —
  // without this step TicketReplyForm never renders and the rest proves nothing.
  const reviewDrawer = page.getByRole("dialog", { name: "Report Details" });
  const composerBody = reviewDrawer.getByLabel("Post an update");
  await composerBody.fill("Please send a copy of the blotter entry.");
  await reviewDrawer.getByLabel("Also set status to").selectOption("awaiting-info");
  await reviewDrawer.getByRole("button", { name: "Post update" }).click();
  await expect(reviewDrawer.getByText("Awaiting Information").first()).toBeVisible();
  // Same composer-clearing race the first test documents: wait for the post to
  // have actually resolved before navigating away, or the reply below can race
  // the status write it depends on.
  await expect(composerBody).toHaveValue("");

  // 3. Answer it as the resident would, from the public page, with no session.
  await page.goto("/track");
  await page.getByLabel("Ticket number").fill(ticketNo!);
  await page.getByLabel("Last name").fill(REPLY_SURNAME);
  await page.getByRole("button", { name: "Check status" }).click();

  const replyHeading = page.getByRole("heading", {
    name: "Send the information the barangay asked for",
  });
  await expect(replyHeading).toBeVisible();

  await page.getByLabel("Your reply").fill(REPLY_BODY);
  await page.getByLabel("Attach files (optional)").setInputFiles({
    name: REPLY_FILE_NAME,
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
  await page.getByRole("button", { name: "Send reply" }).click();

  // 4. The reply is on the resident's own timeline, attachment counted...
  await expect(page.locator("ol").getByText(`${REPLY_BODY} (1 file attached)`)).toBeVisible();
  // ...and the composer is gone, because the reply moved the ticket off
  // awaiting-info and the refreshed result the action returns is no longer
  // repliable. This is also the barrier proving the whole round trip resolved.
  await expect(replyHeading).toHaveCount(0);

  // 5. Back on the staff side. The pill is the only signal staff get that a
  // reply landed — the notification queues match on initial status, and
  // under-review is not one, which is the entire reason replied_at exists.
  await page.goto("/admin/complaints");
  const repliedRow = page.getByRole("row").filter({ hasText: REPLY_SURNAME });
  await expect(repliedRow.getByText("New reply")).toBeVisible();
  await repliedRow.getByRole("button", { name: /review/i }).click();

  const replyEntry = reviewDrawer.locator("ol > li").filter({ hasText: REPLY_BODY });
  await expect(replyEntry).toBeVisible();
  // Attributed to the resident, not to staff — the timeline renders authorKind,
  // and an inbound reply mislabelled as a staff update would be read as the
  // barangay having already answered.
  //
  // `exact` is load-bearing, not tidiness: getByText's default is a
  // case-INSENSITIVE substring match, so a bare "Resident" also matches this
  // entry's own body ("resident-reply-<ts>") and fails on strict mode.
  await expect(replyEntry.getByText("Resident", { exact: true })).toBeVisible();
  // The attachment survived the trip and is reachable: the stored object is
  // UUID-named, so seeing the original filename proves the jsonb row travelled
  // with it, and the link proves a signed URL was minted for the private bucket.
  await expect(replyEntry.getByRole("link", { name: REPLY_FILE_NAME })).toBeVisible();
});
