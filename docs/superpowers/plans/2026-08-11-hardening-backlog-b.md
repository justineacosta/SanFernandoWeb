# Hardening backlog Section B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all seven functional follow-ups in `docs/HARDENING_BACKLOG.md` Section B, then delete the file.

**Architecture:** Seven independent items, one task each (B7 splits into two — code, then migration). Nothing here shares state, so tasks may be reviewed and rejected individually. Only Task 8 touches the database; everything else is app code and tests.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (Postgres + Storage), Vitest (pure functions only), Playwright.

## Global Constraints

- **Branch:** `hardening-backlog-b`, worked **in the main checkout** (no worktree) — matching the A1–A5 session's explicit choice.
- **Design tokens:** only `brand-*` / `ink-*` / `danger*` from `src/app/globals.css`. No blue tokens, no `bg-green-*`. There is no `brand-900`.
- **Vitest is for pure functions only.** A module under test must not transitively import a Supabase client. No jsdom, no React renderer, no component tests.
- **A guard that has never been seen to fail is not a guard** (`.claude/testing.md`). Every new test must be verified to fail with its guard removed, and the plan says how.
- **Every `startTransition(async …)` wraps its Server Action call in `try`/`catch`**, cleanup in `finally`.
- **Every error banner is dismissible** except field-level validation.
- **Docs are updated in the same task as the code**, in the `.claude/*.md` file that owns the area. Prefer correcting an existing bullet over appending.
- **Migrations are applied manually by the owner.** Never assume one is applied. Announce early.
- **The barangay is San Fernando**; its sub-divisions are **Sitios**, not Puroks; San Nicolas is a **municipality**.
- Path alias `@/*` → `src/*`. zod is **v4**.

**Commands:** `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e -- --project=public`.

**Rate-limit budget while testing** (`.claude/testing.md`): `apply-form.spec.ts` and `assistance-form.spec.ts` each forge a fresh IP per run and cannot collide with themselves — **read a failure in either as real**. `services-directory.spec.ts` and `appointment-form.spec.ts` submit nothing and cost nothing.

---

### Task 1: Deterministic Turnstile token signal (backlog B1)

`AssistanceForm` and `ApplyForm` keep their Turnstile token in plain `useState` and pass it as a Server Action argument, so there is no DOM-observable "token ready" signal. Both specs therefore sleep a fixed `page.waitForTimeout(3000)`. Add the hidden input `LoginForm` already carries (`src/features/admin/components/login-form.tsx:105`) purely as that signal, and make both waits deterministic.

The input is **not** read by the server on these two forms — the token still travels as the third/fourth argument to the action. It exists so the DOM reflects React state. Say so in a comment, or a future reader will wire it into a `FormData` read that never happens.

**Files:**
- Modify: `src/features/assistance/components/assistance-form.tsx` (inside `<form>`, beside `<TurnstileWidget>` at line 337)
- Modify: `src/features/services/components/apply-form.tsx` (inside `<form>`, beside `<TurnstileWidget>` at line 322)
- Modify: `tests/e2e/public/assistance-form.spec.ts:55-59`
- Modify: `tests/e2e/public/apply-form.spec.ts:48-51`
- Modify: `.claude/testing.md` (the "Known flake with a known fix" section)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a DOM contract two specs depend on — `input[name="turnstileToken"]`, value `""` until Cloudflare's callback fires, then the token.

- [ ] **Step 1: Add the hidden input to `AssistanceForm`**

In `src/features/assistance/components/assistance-form.tsx`, replace the single `<TurnstileWidget …/>` line with:

```tsx
          {/* Not read by the server — `submitAssistance` takes the token as an
              argument. This mirrors React state into the DOM so Playwright has
              a "token ready" signal to poll instead of a fixed sleep, the shape
              `login-form.tsx` uses for real. */}
          <input type="hidden" name="turnstileToken" value={turnstileToken ?? ""} />
          <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />
```

- [ ] **Step 2: Add the same hidden input to `ApplyForm`**

In `src/features/services/components/apply-form.tsx`, replace the single `<TurnstileWidget …/>` line at 322 with the identical two-element block above (same comment, same input — the state variable is also named `turnstileToken`).

- [ ] **Step 3: Replace the fixed sleep in `assistance-form.spec.ts`**

Replace lines 55–59 (the `page.getByRole("checkbox").check()` call stays):

```ts
  await page.getByRole("checkbox").check();
  // Cloudflare's callback lands the token in React state, which the form
  // mirrors into a hidden input. Polling that beats the fixed 3s sleep this
  // replaced: it returns as soon as the token is real, and it FAILS rather
  // than silently submitting a null token when the widget never resolves.
  await expect(page.locator('input[name="turnstileToken"]')).not.toHaveValue("", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Submit request" }).click();
```

- [ ] **Step 4: Replace the fixed sleep in `apply-form.spec.ts`**

Replace lines 47–52 the same way, keeping that spec's own submit button name:

```ts
  await page.getByRole("checkbox").check();
  // Cloudflare's callback lands the token in React state, which the form
  // mirrors into a hidden input. Polling that beats the fixed 3s sleep this
  // replaced: it returns as soon as the token is real, and it FAILS rather
  // than silently submitting a null token when the widget never resolves.
  await expect(page.locator('input[name="turnstileToken"]')).not.toHaveValue("", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Submit application" }).click();
```

- [ ] **Step 5: Run both specs**

Run: `npm run test:e2e -- --project=public tests/e2e/public/assistance-form.spec.ts tests/e2e/public/apply-form.spec.ts`
Expected: both PASS, and visibly faster than before (the sleep was unconditional; the poll returns as soon as the token arrives).

Requires Cloudflare's always-pass test keys in `.env.local` (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`) — the real keys do not solve on localhost. **The site key is inlined at build time: restart the dev server after switching key sets.**

- [ ] **Step 6: Verify the new wait can actually fail**

Temporarily change the selector to `input[name="turnstileTokenXX"]` in one spec and re-run it. Expected: FAIL on the assertion timeout, not a pass-through. Revert the typo.

This is the `.claude/testing.md` "a guard that has never been seen to fail is not a guard" rule: a `not.toHaveValue("")` against a selector matching zero elements must not quietly resolve.

- [ ] **Step 7: Update `.claude/testing.md`**

Replace the whole "## Known flake with a known fix" section (it describes a flake that no longer exists) with:

```markdown
## Turnstile token waits are deterministic

`AssistanceForm` and `ApplyForm` each render a hidden `input[name="turnstileToken"]`
mirroring their React token state. Neither server action reads it — both take the token
as an argument — it exists so `assistance-form.spec.ts` and `apply-form.spec.ts` can poll
a DOM signal instead of sleeping a fixed 3s. **Do not delete it as dead markup**, and if
you add a submitting spec for another public form, give that form the same input rather
than reintroducing a sleep.
```

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint
git add src/features/assistance/components/assistance-form.tsx src/features/services/components/apply-form.tsx tests/e2e/public/assistance-form.spec.ts tests/e2e/public/apply-form.spec.ts .claude/testing.md
git commit -m "test: poll a hidden turnstile input instead of sleeping a fixed 3s"
```

---

### Task 2: Weekend-safe default appointment date (backlog B2)

`EMPTY.preferredDate = manilaToday()` in `appointment-form.tsx:28`, so on a Saturday or Sunday `/appointments/new` pre-fills a date its own `isClosedDay` refine (`appointment-schema.ts:21-24`) then rejects. A resident who opens the page on a weekend meets a validation error they did not cause.

**Files:**
- Modify: `src/lib/office-days.ts`
- Modify: `src/features/appointments/components/appointment-form.tsx:21-31`
- Test: `tests/unit/office-days.test.ts`
- Modify: `.claude/resident-portal.md`

**Interfaces:**
- Consumes: `isClosedDay(iso: string): boolean` from `src/lib/office-days.ts`.
- Produces: `nextOpenDay(iso: string): string` — same module, same UTC-based day arithmetic. Takes a `YYYY-MM-DD` string, returns the same string when it is already a weekday, otherwise the next Monday.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/office-days.test.ts`:

```ts
describe("nextOpenDay", () => {
  it("returns a weekday unchanged", () => {
    // Mon 2026-08-10 through Fri 2026-08-14.
    for (const iso of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]) {
      expect(nextOpenDay(iso)).toBe(iso);
    }
  });

  it("moves a Saturday to the following Monday", () => {
    expect(nextOpenDay("2026-08-15")).toBe("2026-08-17");
  });

  it("moves a Sunday to the following Monday", () => {
    expect(nextOpenDay("2026-08-16")).toBe("2026-08-17");
  });

  it("crosses a month boundary", () => {
    // Sat 2026-10-31 → Mon 2026-11-02.
    expect(nextOpenDay("2026-10-31")).toBe("2026-11-02");
  });

  it("crosses a year boundary", () => {
    // Sat 2028-12-30 and Sun 2028-12-31 both land on Mon 2029-01-01.
    expect(nextOpenDay("2028-12-30")).toBe("2029-01-01");
    expect(nextOpenDay("2028-12-31")).toBe("2029-01-01");
  });

  it("never consults the runner's local weekday", () => {
    // Same reasoning as isClosedDay's own mechanism test: getUTCDay() vs
    // getDay() is invisible to a behavioural assertion at UTC+0 or east of it,
    // which is this project's entire audience.
    const localDay = vi.spyOn(Date.prototype, "getDay");
    for (const iso of ["2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17"]) {
      nextOpenDay(iso);
    }
    expect(localDay).not.toHaveBeenCalled();
    localDay.mockRestore();
  });
});
```

Every date above was confirmed with `new Date("<iso>T00:00:00Z").getUTCDay()` before being written down. If you add a case, confirm it the same way — a calendar assertion guessed from memory is how a test ends up asserting the bug.

Update the import line at the top of the file to `import { isClosedDay, nextOpenDay } from "@/lib/office-days";`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- office-days`
Expected: FAIL — `nextOpenDay is not a function` / no export named `nextOpenDay`.

- [ ] **Step 3: Implement `nextOpenDay`**

Append to `src/lib/office-days.ts`:

```ts
/**
 * The first weekday on or after `iso` (YYYY-MM-DD).
 *
 * Exists because a form defaulting to "today" pre-fills a date its own
 * validation rejects when today is a weekend. Returns the input unchanged on a
 * weekday, so a caller can apply it unconditionally.
 *
 * Same UTC-only arithmetic as isClosedDay above, for the same reason: parsing
 * at UTC midnight makes the UTC weekday the calendar weekday wherever this
 * runs, and setUTCDate() keeps month and year rollover correct without any
 * calendar branching.
 */
export function nextOpenDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- office-days`
Expected: PASS, all cases including the corrected year-boundary one.

- [ ] **Step 5: Wire it into the form default**

In `src/features/appointments/components/appointment-form.tsx`, add `nextOpenDay` to the imports:

```tsx
import { nextOpenDay } from "@/lib/office-days";
```

and change the `EMPTY` initialiser:

```tsx
  // Not manilaToday(): on a Saturday or Sunday that pre-fills a date
  // appointmentSchema's own isClosedDay refine then rejects, so the resident
  // meets a validation error they did not cause.
  preferredDate: nextOpenDay(manilaToday()),
```

Leave `min={manilaToday()}` on the date input at line 304 **unchanged** — the earliest *selectable* day is still today; only the pre-filled default moves. A resident may legitimately pick any weekday from today onward, and the schema rejects the weekends inside that range.

- [ ] **Step 6: Verify in the browser**

Start the dev server (`npm run dev` — check whether one is already running first) and open `/appointments/new`. Confirm the Preferred date field pre-fills a weekday.

To exercise the weekend path without waiting for Saturday, temporarily change the initialiser to `nextOpenDay("2026-08-15")` (a Saturday), reload, confirm it shows `2026-08-17`, then revert.

- [ ] **Step 7: Update `.claude/resident-portal.md`**

Find the bullet covering the appointment form's date field and correct it to say the default is `nextOpenDay(manilaToday())`, not today, and why. If no such bullet exists, add one to the appointments section:

```markdown
- **The appointment date defaults to `nextOpenDay(manilaToday())`, not today.** The field's
  `min` is still today — only the pre-filled value skips the weekend, since
  `appointmentSchema`'s `isClosedDay` refine would otherwise reject the form's own default
  every Saturday and Sunday.
```

- [ ] **Step 8: Full check and commit**

```bash
npm run typecheck && npm run lint && npm run test:unit
git add src/lib/office-days.ts src/features/appointments/components/appointment-form.tsx tests/unit/office-days.test.ts .claude/resident-portal.md
git commit -m "fix: default the appointment date to the next open weekday"
```

---

### Task 3: `applyPreset` focuses the purpose textarea (backlog B4)

Design §5.3 asked for "then focus the textarea with the caret at the end". It was silently dropped. Today a resident taps a chip, the text appears, and the caret is nowhere — they must click into the box to keep typing.

**Files:**
- Modify: `src/features/appointments/components/appointment-form.tsx:68-74` (and the `<Textarea>` at 284-292)
- Modify: `.claude/resident-portal.md`

**Interfaces:**
- Consumes: `nextOpenDay` wiring from Task 2 lives in the same file — expect the import block to already carry it. Nothing else.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Add a ref for the textarea**

In `src/features/appointments/components/appointment-form.tsx`, beside the existing refs (near line 63):

```tsx
  const purposeRef = useRef<HTMLTextAreaElement>(null);
```

- [ ] **Step 2: Focus and place the caret in `applyPreset`**

Replace the body of `applyPreset`:

```tsx
  function applyPreset(preset: string) {
    // Fill when empty, append on a new line otherwise. Never destructive — a
    // resident who has typed three sentences and taps a chip out of curiosity
    // does not lose them — and never inert, which a fill-only-when-empty rule
    // would make it once they had typed anything.
    const next = values.purpose.trim() ? `${values.purpose.trimEnd()}\n${preset}` : preset;
    set("purpose", next);
    // Design §5.3: the chip is a starting point to edit, so hand the caret back
    // at the end of the text. Deferred a tick because the textarea is
    // controlled — setting the selection before React commits `next` would
    // clamp it to the OLD, shorter value's length.
    requestAnimationFrame(() => {
      const el = purposeRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
    });
  }
```

- [ ] **Step 3: Attach the ref**

On the `<Textarea id="appointment-purpose" …>` element, add `ref={purposeRef}`.

If `Textarea` in `src/components/ui/form.tsx` does not forward refs, fix it there rather than reaching around it — check first, and if it is a plain function component wrapping `<textarea>`, note that React 19 passes `ref` as a normal prop, so a component spreading `{...props}` onto its `<textarea>` already works with no `forwardRef`. Verify by inspection before assuming either way.

- [ ] **Step 4: Verify in the browser**

Open `/appointments/new`:
- Click "Consultation with an official" on an empty textarea → text appears, textarea is focused, caret at end (type a character; it lands after the preset, not before).
- Type a sentence, click a second chip → the preset appends on a new line, focus returns, caret at the very end.
- Confirm no scroll jump and that the chips are still `type="button"` (they must not submit the form).

- [ ] **Step 5: Update `.claude/resident-portal.md`**

Correct the `PURPOSE_PRESETS` bullet — it should state that a chip fills-or-appends **and** returns focus with the caret at the end, per design §5.3. If the file records the focus behaviour as missing/deferred, delete that note.

- [ ] **Step 6: Full check and commit**

```bash
npm run typecheck && npm run lint
git add src/features/appointments/components/appointment-form.tsx .claude/resident-portal.md
git commit -m "fix: return focus to the purpose textarea after applying a preset"
```

---

### Task 4: Attribute a resident's own intake entry to the resident (backlog B3)

`recordIntakeWithAttachments` hardcodes `authorKind: "system"` (`src/lib/ticket-attachments.ts:107`). The admin drawer renders `entry.authorKind === "resident" ? "Resident" : (entry.authorName ?? "Barangay staff")` (`ticket-timeline-panel.tsx:112-114`), so a resident's own uploaded ID shows as authored by **"Barangay staff"** — on the application flow, that is the surface staff use to check supporting documents before issuing a legal document.

The fix is to stop inferring: make the author explicit at every intake site. Public submissions are `"resident"`; walk-in encoding is `"staff"` (those three already pass `authorName: actor.fullName`, which the panel then renders).

**This is safe for `/track`.** `loadTimeline` (`src/features/track/actions.ts:149-173`) selects `author_kind`, but `src/features/track/components/ticket-timeline.tsx` branches only on `entryType` — grep confirms zero `authorKind` reads in the public timeline component. Re-verify with `rg "authorKind" src/features/track/` before you change anything; if that has stopped being true, stop and report rather than proceeding.

**Files:**
- Modify: `src/lib/ticket-attachments.ts:55-120`
- Modify: `src/features/services/actions.ts:115-120` (public application)
- Modify: `src/features/complaints/actions.ts:102-106` (public complaint)
- Modify: `src/features/assistance/actions.ts:150-155` (public assistance)
- Modify: `src/features/appointments/actions.ts:70-85` (public appointment — direct `recordTicketUpdate`, no attachments)
- Modify: `src/features/admin/actions/applications.ts:257-263` (walk-in)
- Modify: `src/features/admin/actions/complaints.ts:286-292` (walk-in)
- Modify: `src/features/admin/actions/assistance.ts:294-300` (walk-in)
- Modify: `.claude/resident-portal.md`

**Interfaces:**
- Consumes: `TicketUpdateAuthorKind = "staff" | "resident" | "system"` from `src/types/index.ts:839`; `recordTicketUpdate(entry: TicketUpdateInput)` from `src/lib/ticket-updates.ts`.
- Produces: `IntakeAttachmentsInput` gains a required `authorKind: "resident" | "staff"` field. Required, not optional-with-default — a default is how this drifted in the first place.

- [ ] **Step 1: Confirm the public timeline does not branch on `authorKind`**

Run: `rg "authorKind" src/features/track/`
Expected: exactly two hits, both in `actions.ts` (the select mapping at 169 and the resident-reply write at 367). **Zero** hits in `components/`. If a component hit exists, stop and report — this task's premise no longer holds.

- [ ] **Step 2: Make the author explicit on `IntakeAttachmentsInput`**

In `src/lib/ticket-attachments.ts`, change the interface:

```ts
export interface IntakeAttachmentsInput {
  /** DB-resolved, never a client string — it becomes a storage path prefix. */
  ticketNo: string;
  kind: TicketKind;
  files: File[];
  /**
   * Who filed this. Required rather than defaulted: the intake entry carries
   * the submitter's own attachments, and defaulting it to "system" is exactly
   * how a resident's uploaded ID came to read as "Barangay staff" in the admin
   * drawer. "resident" for a public submission, "staff" for walk-in encoding.
   */
  authorKind: "resident" | "staff";
  /** The encoding staff member's name. Set for walk-ins; absent for a resident's own submission. */
  authorName?: string;
  /** Identifies the caller in orphan logs, e.g. "submitApplication". */
  context: string;
}
```

- [ ] **Step 3: Thread it through the function**

In the same file, add `authorKind` to the destructured parameters of `recordIntakeWithAttachments` and pass it to `recordTicketUpdate`, replacing the hardcoded `authorKind: "system"` at line 107:

```ts
export async function recordIntakeWithAttachments({
  ticketNo,
  kind,
  files,
  authorKind,
  authorName,
  context,
}: IntakeAttachmentsInput): Promise<{ entryId: string | null; attachmentWarning: string | null }> {
```

```ts
  const entryId = await recordTicketUpdate({
    ticketNo,
    kind,
    entryType: "status",
    status: TICKET_INTAKE_STATUS[kind],
    visibility: "public",
    authorKind,
    authorName,
    attachments: uploaded,
  });
```

- [ ] **Step 4: Run typecheck to enumerate every call site**

Run: `npm run typecheck`
Expected: FAIL with a missing-property error at each of the six `recordIntakeWithAttachments` calls. This is the point of making the field required — the compiler produces the checklist for Step 5.

- [ ] **Step 5: Set the author at all six call sites**

Add `authorKind: "resident",` to the three public actions:
- `src/features/services/actions.ts` (`context: "submitApplication"`)
- `src/features/complaints/actions.ts` (`context: "submitComplaint"`)
- `src/features/assistance/actions.ts` (`context: "submitAssistance"`)

Add `authorKind: "staff",` to the three walk-in actions (each already passes `authorName: actor.fullName`, which is what the drawer renders):
- `src/features/admin/actions/applications.ts` (`context: "createWalkInApplication"`)
- `src/features/admin/actions/complaints.ts` (`context: "createWalkInComplaint"`)
- `src/features/admin/actions/assistance.ts` (`context: "createWalkInAssistance"`)

- [ ] **Step 6: Fix the fourth public flow's intake entry**

`submitAppointment` does not go through `recordIntakeWithAttachments` (appointments accept no attachments) — it calls `recordTicketUpdate` directly at `src/features/appointments/actions.ts:78` with `authorKind: "system"`. Change it to `authorKind: "resident"`.

Leaving it as "system" would make the identical event — a resident filed this — read as "Barangay staff" on appointments while reading "Resident" on the other three. That drift is the thing this task exists to remove.

Do **not** touch the other `authorKind: "system"` sites in `src/features/admin/actions/{applications,complaints,assistance,appointments}.ts` (the review/status-change entries) or `ticket-updates.ts:178`. Those are genuinely machine-written status transitions with no human author, which is what "system" is for.

- [ ] **Step 7: Typecheck and unit tests**

Run: `npm run typecheck && npm run test:unit`
Expected: both PASS.

- [ ] **Step 8: Verify in the browser, both directions**

This is the assertion that matters and it cannot be automated cheaply (walk-in encoding has no e2e coverage on purpose — see `.claude/testing.md`).

1. File a public assistance request at `/assistance/new` with a file attached. Open it in `/admin/assistance` → the intake timeline entry must read **"Resident"** with the brand-tinted background, and the attachment must hang off it.
2. Encode a walk-in from the same manager with a file attached → the intake entry must read the **encoding staff member's name**, not "Resident" and not "Barangay staff".
3. Open the public request's `/track` page with its ticket number + surname → the timeline must be unchanged from before this task (same entries, same copy, no new label).

Record the two ticket numbers in the commit message.

- [ ] **Step 9: Update `.claude/resident-portal.md`**

Correct the ticket-timeline bullet. It should now say: the intake entry is authored by `"resident"` for the four public flows and `"staff"` (plus the encoder's name) for the three walk-in flows; `"system"` is reserved for machine-written status transitions; and the public `/track` timeline branches on `entryType` only, so `authorKind` never reaches a resident-facing label.

- [ ] **Step 10: Lint and commit**

```bash
npm run lint
git add src/lib/ticket-attachments.ts src/features/services/actions.ts src/features/complaints/actions.ts src/features/assistance/actions.ts src/features/appointments/actions.ts src/features/admin/actions/applications.ts src/features/admin/actions/complaints.ts src/features/admin/actions/assistance.ts .claude/resident-portal.md
git commit -m "fix: attribute a resident's intake entry to the resident, not to staff"
```

---

### Task 5: The guidance-card e2e case (backlog B5)

Design §7's 5th Playwright bullet — "`/assistance/new` shows the 'What to prepare' card after picking a category that has requirements, and shows nothing for one that does not" — was verified manually and never shipped.

**The obvious test is not writable as stated.** The guard is `selected && (selected.description || selected.requirements.length > 0)` (`assistance-form.tsx:262`), and every seeded category has `description = ''` / `requirements = '{}'` by default (migration `0035`) — but staff can fill any of them in through the SuperAdmin panel at any time. A test naming "Medical Assistance" as the empty one breaks the day someone edits it.

So assert the **invariant** instead, across every category the picker offers: *the card is never rendered empty*. That is precisely what the guard protects, and it holds against any DB state.

**Files:**
- Create: `tests/e2e/public/assistance-guidance.spec.ts` (its own file — `services-directory.spec.ts` is about routing, not form content)
- Modify: `.claude/testing.md` (the suites list)

**Interfaces:**
- Consumes: the public `/assistance/new` page. No session, no submission, no rate-limit budget.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/public/assistance-guidance.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- --project=public tests/e2e/public/assistance-guidance.spec.ts`
Expected: PASS.

If it fails on the `bareSeen` assertion, every category in the DB this dev server points at has guidance filled in. Do not weaken the assertion — report it and ask, since the fixture question is the owner's call.

- [ ] **Step 3: Verify it fails with the guard removed**

In `src/features/assistance/components/assistance-form.tsx:262`, temporarily change

```tsx
          {selected && (selected.description || selected.requirements.length > 0) ? (
```

to

```tsx
          {selected ? (
```

Re-run the spec. Expected: FAIL with "The guidance card rendered for category … with no description and no requirements."

**Revert the change.** Re-run: PASS.

This step is not optional — `.claude/testing.md`'s "a guard that has never been seen to fail is not a guard" rule is the reason this whole task exists in the shape it does.

- [ ] **Step 4: Update `.claude/testing.md`**

Add the new spec to the `tests/e2e/public/` list in "## The suites", and to the sentence recording which specs cost no rate-limit budget:

```markdown
`public/services-directory.spec.ts` and `public/assistance-guidance.spec.ts` submit nothing,
so they spend no budget either.
```

- [ ] **Step 5: Commit**

```bash
npm run lint
git add tests/e2e/public/assistance-guidance.spec.ts .claude/testing.md
git commit -m "test: assert the assistance guidance card never renders empty"
```

---

### Task 6: Two small ones (backlog B6)

A missing `label`/`htmlFor` pair in the SuperAdmin assistance-categories editor, and a clarifying comment on `services-directory.spec.ts`'s second assertion.

**Files:**
- Modify: `src/features/admin/components/assistance-categories-panel.tsx:201-210`
- Modify: `tests/e2e/public/services-directory.spec.ts:23-31`

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Associate the requirements label with its textarea**

In `src/features/admin/components/assistance-categories-panel.tsx`, the "What to prepare (one per line)" `<label>` at line 202 has no `htmlFor` and the `<Textarea>` below it has no `id`, so clicking the label does nothing and screen readers announce the field unlabelled. The two `<Input>`s above it use `aria-label` instead, which is why only this one was missed.

The `<li>` is rendered per category inside a `.map()`, so a hardcoded id would collide across rows. Derive it from the category id, which is already unique and in scope as `category.id`:

```tsx
                  <div className="space-y-1">
                    <label
                      htmlFor={`category-requirements-${category.id}`}
                      className="text-sm font-medium text-ink-700"
                    >
                      What to prepare (one per line)
                    </label>
                    <Textarea
                      id={`category-requirements-${category.id}`}
                      value={requirementsBuffer}
                      onChange={(event) => setRequirementsBuffer(event.target.value)}
                      rows={4}
                    />
                  </div>
```

Only one row is in edit mode at a time (`editingId` is a single value), but deriving the id costs nothing and removes the question entirely.

- [ ] **Step 2: Comment the collapsed-accordion assertion**

In `tests/e2e/public/services-directory.spec.ts`, the second test asserts `toHaveCount(0)` on the First name field. That reads as "the field is collapsed/hidden" to anyone who does not know `ApplyUnavailable` replaces the form outright. Make it explicit — replace the assertion at line 30 with:

```ts
    // toHaveCount(0), not toBeHidden(): getApplyService returns null for a
    // non-'apply' flow and the page renders <ApplyUnavailable> INSTEAD of the
    // form, so the field is absent from the DOM rather than collapsed. A
    // visibility assertion would pass just as well against a form that merely
    // started collapsed, which is not what this guards.
    await expect(page.getByLabel("First name")).toHaveCount(0);
```

- [ ] **Step 3: Verify both**

Run: `npm run test:e2e -- --project=public tests/e2e/public/services-directory.spec.ts`
Expected: PASS (the comment changes nothing behaviourally — this run confirms you did not disturb the assertion).

For the label: open `/admin/services` as a SuperAdmin, scroll to Assistance Categories, click the pencil on a category, and click the words "What to prepare (one per line)". Expected: the textarea receives focus. Before this change, nothing happened.

- [ ] **Step 4: Commit**

```bash
npm run typecheck && npm run lint
git add src/features/admin/components/assistance-categories-panel.tsx tests/e2e/public/services-directory.spec.ts
git commit -m "fix: label the category requirements textarea; explain a count assertion"
```

---

### Task 7: `promoteMedia` sends an explicit content type (backlog B7, code half)

Migration `0036` set `allowed_mime_types` on `ticket-media` and `feedback-media` only, and its own header says why the other twelve buckets were left alone: `copyObjects` re-uploads with `contentType: file.type || undefined` (`src/lib/media-lifecycle.ts:37`), and when the Storage download yields a blob with no type, Supabase substitutes a default that a restrictive allow-list would reject. `promoteMedia` fails closed, so publishing would break in production.

Fix the content type first. Task 8 then widens the allow-list on top of it.

Resolution order: **sniffed bytes → filename extension → the blob's own type**. Sniffing is first because it is the only one that cannot lie; the extension is a reliable second because every upload path in this codebase builds `<uuid>.<ext>` itself.

**Files:**
- Modify: `src/lib/storage.ts` (new `mimeFromExtension`, beside `sniffMimeType`)
- Modify: `src/lib/media-lifecycle.ts:19-43` (`copyObjects`)
- Test: `tests/unit/storage.test.ts`
- Modify: `.claude/storage.md`

**Interfaces:**
- Consumes: `sniffMimeType(bytes: Uint8Array): string | null` from `src/lib/storage.ts:169`.
- Produces: `mimeFromExtension(path: string): string | null` — pure, dependency-free (it must stay Vitest-importable, same constraint as `sniffMimeType`; `src/lib/storage.ts` must not gain a Supabase import).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/storage.test.ts` (add `mimeFromExtension` to the existing import from `@/lib/storage`):

```ts
describe("mimeFromExtension", () => {
  it("maps the four types this project stores", () => {
    expect(mimeFromExtension("news/abc/photo.png")).toBe("image/png");
    expect(mimeFromExtension("news/abc/photo.jpg")).toBe("image/jpeg");
    expect(mimeFromExtension("news/abc/photo.jpeg")).toBe("image/jpeg");
    expect(mimeFromExtension("news/abc/photo.webp")).toBe("image/webp");
    expect(mimeFromExtension("legislative/abc/ordinance.pdf")).toBe("application/pdf");
  });

  it("is case-insensitive", () => {
    expect(mimeFromExtension("officials/a/PORTRAIT.JPG")).toBe("image/jpeg");
    expect(mimeFromExtension("transparency/a/Report.PDF")).toBe("application/pdf");
  });

  it("returns null for anything else", () => {
    expect(mimeFromExtension("news/abc/notes.txt")).toBeNull();
    expect(mimeFromExtension("news/abc/noextension")).toBeNull();
    expect(mimeFromExtension("news/abc/trailing.")).toBeNull();
    expect(mimeFromExtension("")).toBeNull();
  });

  it("reads the extension, not a dot in a folder name", () => {
    expect(mimeFromExtension("news/v1.2/photo.png")).toBe("image/png");
    expect(mimeFromExtension("news/v1.2/photo")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- storage`
Expected: FAIL — no export named `mimeFromExtension`.

- [ ] **Step 3: Implement `mimeFromExtension`**

Add to `src/lib/storage.ts`, directly below `sniffMimeType`:

```ts
/**
 * Content type from a stored object's path extension.
 *
 * The fallback for `copyObjects` when a Storage download hands back a blob
 * with no type of its own: every upload path in this codebase builds the name
 * as `<uuid>.<ext>` from a type it already validated, so the extension is
 * trustworthy here in a way it would not be for a file straight off a form.
 *
 * Pure and dependency-free for the same reason as `sniffMimeType` — this
 * module has to stay importable by Vitest.
 */
export function mimeFromExtension(path: string): string | null {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  if (dot === -1 || dot < slash || dot === path.length - 1) return null;
  switch (path.slice(dot + 1).toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- storage`
Expected: PASS.

- [ ] **Step 5: Use it in `copyObjects`**

In `src/lib/media-lifecycle.ts`, add `mimeFromExtension` and `sniffMimeType` to the existing import from `@/lib/storage`, and replace the upload call inside `copyObjects`:

```ts
    const buffer = Buffer.from(await file.arrayBuffer());
    // Sniffed bytes first, the path extension second, the blob's own type
    // last. Never `undefined`: Supabase then substitutes a default type that a
    // bucket-level allowed_mime_types rejects, and promoteMedia fails closed —
    // which is precisely why migration 0036 could not put an allow-list on the
    // twelve status-aware buckets. Resolving the type here is what unblocks it.
    const contentType = sniffMimeType(buffer) ?? mimeFromExtension(path) ?? file.type;
    const { error: uploadErr } = await admin.storage
      .from(destBucket)
      .upload(path, buffer, { contentType: contentType || undefined, upsert: true });
```

The trailing `|| undefined` stays: if all three resolve to empty, preserving today's behaviour is right — Task 8's allow-list is what would newly reject it, and Step 6 proves that case does not arise for real content.

- [ ] **Step 6: Verify against real objects, both directions**

`copyObjects` is the shared engine for both `promoteMedia` and `demoteMedia`, so a break here breaks publishing *and* archiving. Neither has e2e coverage.

In the admin portal, for **two** kinds — one image kind (news, officials, events or announcements) and one document kind (legislative or transparency, since those carry PDFs):

1. Create a draft with an uploaded file, publish it, and confirm the file renders on the live public page.
2. Query the destination object's stored type and confirm it is the real one, not a default:
   `select name, metadata->>'mimetype' from storage.objects where bucket_id = '<kind>-media' order by created_at desc limit 5;`
   Expected: `image/png` / `image/jpeg` / `image/webp` / `application/pdf` — **never** `text/plain` or `application/octet-stream`.
3. Archive the same record and confirm the file still resolves in the admin editor (that is `demoteMedia` going the other way through the same function).

Record what you saw in the commit message — Task 8's migration is only safe because of this evidence.

- [ ] **Step 7: Update `.claude/storage.md`**

Correct the bullet describing `copyObjects`/`promoteMedia`'s content-type handling: it now resolves sniff → extension → blob type, and **why** (a bucket allow-list rejects Supabase's substituted default, and `promoteMedia` fails closed). Note that this is the precondition for `allowed_mime_types` on the status-aware pairs.

- [ ] **Step 8: Full check and commit**

```bash
npm run typecheck && npm run lint && npm run test:unit
git add src/lib/storage.ts src/lib/media-lifecycle.ts tests/unit/storage.test.ts .claude/storage.md
git commit -m "fix: resolve an explicit content type when copying media between buckets"
```

---

### Task 8: Widen `allowed_mime_types` to the status-aware buckets (backlog B7, migration half)

**Depends on Task 7 being merged and verified.** Do not start until Step 6 of Task 7 has produced real evidence that promoted objects carry a correct type.

**ANNOUNCE THIS MIGRATION TO THE OWNER AS SOON AS THIS TASK STARTS.** Migrations are applied by hand, staging first. `0037` is safe in either deploy order (it constrains uploads only, and Task 7's code is already live by then), but it must not be silently added to the repo.

**Files:**
- Create: `supabase/migrations/0037_bucket_mime_allowlists.sql`
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:1273-1291` (the two status-aware bucket inserts and the comment at 1295-1301)
- Modify: `.claude/storage.md`, `.claude/deployment.md`

**Interfaces:**
- Consumes: the content-type resolution from Task 7.
- Produces: nothing code-level.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0037_bucket_mime_allowlists.sql`:

```sql
-- 0037 — MIME allow-lists on the twelve status-aware buckets (hardening backlog B7).
--
-- 0036 deliberately stopped short of these, and said why: copyObjects
-- (src/lib/media-lifecycle.ts) re-uploaded with `contentType: file.type ||
-- undefined`, so a Storage download yielding an untyped blob made Supabase
-- substitute a default that an allow-list would reject — and promoteMedia
-- fails closed, so publishing would have broken in production.
--
-- copyObjects now resolves the type explicitly (sniffed bytes → path extension
-- → blob type), verified against real promote and demote round trips on both
-- an image kind and a document kind before this migration was written. That is
-- the precondition; do not apply this without that code deployed.
--
-- Constrains new uploads only. Existing objects are untouched, and every value
-- below equals what app code already enforces, so no legitimate upload changes
-- behaviour.

-- ALLOWED_IMAGE_TYPES — no PDF: these four kinds store photos only.
update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  where id in ('news-media', 'news-drafts',
               'officials-media', 'officials-drafts',
               'events-media', 'events-drafts',
               'announcements-media', 'announcements-drafts');

-- ALLOWED_DOC_FILE_TYPES — legislative and transparency take PDFs *and*
-- images (a scanned ordinance arrives as either).
update storage.buckets
  set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  where id in ('legislative-media', 'legislative-drafts',
               'transparency-media', 'transparency-drafts');
```

- [ ] **Step 2: Fold it into the baseline**

CLAUDE.md: new environments stand up from the baseline, existing ones apply numbered migrations — the two paths must not drift. Because the baseline's bucket inserts use `on conflict (id) do nothing`, the values have to go **inside** the inserts, not into a trailing update.

In `supabase/baseline/0000_baseline_2026-07-23.sql`, replace the two status-aware inserts at 1273-1291 with:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('news-media', 'news-media', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('officials-media', 'officials-media', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('events-media', 'events-media', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('announcements-media', 'announcements-media', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('legislative-media', 'legislative-media', true, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('transparency-media', 'transparency-media', true, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('site-media', 'site-media', true, 2097152, null),
  ('avatars-media', 'avatars-media', true, 2097152, null)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('news-drafts', 'news-drafts', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('officials-drafts', 'officials-drafts', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('events-drafts', 'events-drafts', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('announcements-drafts', 'announcements-drafts', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('legislative-drafts', 'legislative-drafts', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('transparency-drafts', 'transparency-drafts', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;
```

`site-media` and `avatars-media` keep `null` — they are not part of B7 and were not in `0037`'s scope. Do not quietly widen them here; the baseline must equal migrations-applied-in-order, exactly.

- [ ] **Step 3: Correct the stale baseline comment**

The comment at 1295-1301 still reads "allowed_mime_types is set HERE and on ticket-media only, never on the six status-aware pairs above: promoteMedia re-uploads with a possibly-undefined contentType…". That is now false and would mislead the next reader into reverting `0037`. Replace those lines with:

```sql
-- PRIVATE. A screenshot of the page a resident was looking at can contain
-- their own account page, their ticket, or their name; a public bucket would
-- leave that readable by anyone holding the URL, forever. There is
-- deliberately NO read policy below: the service-role client is the only
-- reader and it mints a short-lived signed URL per page load.
-- allowed_mime_types is set on every bucket that takes uploads [0036, 0037].
-- The status-aware pairs above could only join once copyObjects resolved an
-- explicit contentType (sniff → extension → blob type); before that, an
-- untyped promote would have been rejected and promoteMedia fails closed.
```

- [ ] **Step 4: Hand the migration to the owner for staging**

Tell the owner `0037` is ready, and that it must be applied to **staging first**, then verified, then production. Give them the verification query from Step 5.

**Do not proceed to Step 5 until they confirm staging is done.** If they are unavailable, stop here and report the task as blocked — this is not something to work around.

- [ ] **Step 5: Verify against staging, byte for byte**

```sql
select id, file_size_limit, allowed_mime_types
from storage.buckets
order by id;
```

Confirm all 14 rows match what the code enforces: the four image kinds' 8 buckets carry exactly the three image types; legislative/transparency's 4 carry those three plus `application/pdf`; `ticket-media` and `feedback-media` are unchanged from `0036`; `site-media` and `avatars-media` still have `null`.

- [ ] **Step 6: Re-run the promote/demote round trip on staging**

Repeat Task 7 Step 6 against staging **with `0037` applied** — publish a draft with an image on one kind, and a PDF on legislative or transparency, and confirm both still publish and still render. This is the single check that matters: the whole reason `0036` deferred this is that failure only appears here, at publish time, in production-shaped conditions.

If a publish fails now, the allow-list is rejecting a type `copyObjects` resolved wrongly. **Do not widen the allow-list to make it pass** — that reverts the point of the task. Fix the resolution in Task 7's code and re-verify.

- [ ] **Step 7: Update the docs**

- `.claude/storage.md`: the bucket table/bullet now records `allowed_mime_types` on all fourteen upload-taking buckets, with the `0036`-only caveat deleted.
- `.claude/deployment.md`: add `0037` to the migration list, noting it is order-safe in itself but **requires Task 7's `copyObjects` change already deployed**.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0037_bucket_mime_allowlists.sql supabase/baseline/0000_baseline_2026-07-23.sql .claude/storage.md .claude/deployment.md
git commit -m "feat: restrict uploads by MIME type on the status-aware buckets (0037)"
```

Note in the commit body which environments `0037` has reached at commit time.

---

### Task 9: Close out the backlog

Section A was deleted when it shipped, per the file's own policy: "Delete an entry when it ships; don't let the file rot into a wish list." With Section B done, the whole file goes — its only remaining content is the rate-limit budget table, which `.claude/testing.md` already owns.

**Files:**
- Delete: `docs/HARDENING_BACKLOG.md`
- Modify: `CLAUDE.md` (the bullet naming the file)
- Modify: `.claude/testing.md` (only if the budget table has drifted)

**Interfaces:**
- Consumes: Tasks 1-8 all merged.
- Produces: nothing.

- [ ] **Step 1: Confirm every item actually shipped**

Re-read `docs/HARDENING_BACKLOG.md` and check each of B1-B7 against the working tree — not against this plan. Anything not genuinely done stays, and the file stays with it. Report which, if any.

- [ ] **Step 2: Reconcile the rate-limit table before deleting it**

The backlog's "Rate-limit budgets to respect while testing" section duplicates the table in `.claude/testing.md`. Diff them. If the backlog's copy says anything `.claude/testing.md` does not, move that line into `.claude/testing.md` first — deleting the file must not lose a fact.

- [ ] **Step 3: Delete the file**

```bash
git rm docs/HARDENING_BACKLOG.md
```

- [ ] **Step 4: Remove the CLAUDE.md pointer**

CLAUDE.md's Project section carries:

> **`docs/HARDENING_BACKLOG.md` is the one live list of deferred engineering work** — it is tracked in git specifically because the SDD ledgers under `.superpowers/sdd/` are git-ignored and never reach GitHub. Delete entries as they ship rather than letting it accumulate.

Delete those sentences. Keep the surrounding paragraph's other pointers (`docs/superpowers/`, `docs/BACKEND_HANDOFF.md`) intact.

If a future session opens a new backlog, it can recreate the file and the bullet together — that is cheaper than leaving a pointer to a file that no longer exists.

- [ ] **Step 5: Full verification**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run build
npm run test:e2e -- --project=public
```

Expected: all green. `npm run build` is in this list on purpose — it is the only thing that reveals a route silently prerendering static (`○` vs `ƒ`), which dev mode hides completely and which bit this project once already.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "docs: close out the hardening backlog"
```

---

## Self-review notes

**Spec coverage** — B1 → Task 1, B2 → Task 2, B3 → Task 4, B4 → Task 3, B5 → Task 5, B6 → Task 6, B7 → Tasks 7 + 8, file deletion → Task 9. All seven covered.

**Two places this plan deliberately departs from the backlog's own wording:**

1. **B1 says "AssistanceForm"; Task 1 also does ApplyForm.** Both specs carry the identical `waitForTimeout(3000)` (`apply-form.spec.ts:51`, `assistance-form.spec.ts:59`) for the identical reason. Fixing one and leaving the other is the drift this codebase's docs repeatedly complain about. The backlog's "generalises to the other eight public forms" is *not* taken up — the other six have no submitting spec, so a hidden input there would be markup with no reader.

2. **B5's bullet as written is not testable, and Task 5 says so rather than faking it.** Category guidance is live, staff-editable data; a test naming a bare category rots on the next edit. The invariant form ("never render the card empty") is what the guard actually promises. The `bareSeen` assertion is there so the test fails loudly if it ever stops proving anything, rather than going quietly green.

**One decision that is the owner's, taken here with reasoning:** Task 4 changes `submitAppointment`'s intake entry too, which the backlog does not mention (appointments accept no attachments, so B3's attachment framing never reached it). Leaving it as `"system"` would label the same event — a resident filed this — "Barangay staff" on appointments and "Resident" on the other three. Say so at review; it is a one-line revert if the owner disagrees.
