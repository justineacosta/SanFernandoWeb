# Hardening backlog

Opened 2026-08-10, immediately after `services-request-flows` merged to `main`
(merge commit `adbdac0`, 27 commits, migration `0035` already applied to staging
**and** production).

This file exists because the SDD ledger that produced most of these findings
(`.superpowers/sdd/2026-08-10-services-request-flows/`) is git-ignored and never
reaches GitHub. Everything below was found during that branch's per-task and
whole-branch reviews and deliberately **deferred** — none of it blocked the
merge. Delete an entry when it ships; don't let the file rot into a wish list.

Section A shipped 2026-08-11 — see
`docs/superpowers/specs/2026-08-11-hardening-a1-a5-design.md` for the design and
`.superpowers/sdd/2026-08-11-hardening-a1-a5/` for the per-task history. Section B
is ordinary polish and can be picked off in any order.

---

## B. Functional follow-ups

From the same reviews. Ordered by leverage, not severity.

1. **Give `AssistanceForm` a hidden `turnstileToken` input** (the shape
   `LoginForm` already uses). `tests/e2e/public/assistance-form.spec.ts`
   currently sleeps a fixed `waitForTimeout(3000)` before submitting because the
   token lives in plain `useState` with no DOM-observable ready signal. A hidden
   input makes the wait deterministic — and the pattern generalises to the other
   eight public forms. **Highest leverage of the six.**

2. **Weekend default date.** `EMPTY.preferredDate = manilaToday()`, so on a
   Saturday or Sunday `/appointments/new` pre-fills a date its own
   `isClosedDay` refine then rejects. Fix: a `nextOpenDay()` beside `isClosedDay`
   in `src/lib/office-days.ts`.

3. **Timeline attribution — widened, priority should be reconsidered.** Resident-supplied
   attachments hang on the intake entry, which is `authorKind: "system"`, so the admin
   drawer attributes them to "Barangay staff". The resident's own `/track` view reads
   correctly. Touches all four ticket flows. As of `feat/ticket-attachments`, this now
   affects three public intake flows, not one: `submitApplication` and `submitComplaint`
   both attach files through the same `recordIntakeWithAttachments` helper `submitAssistance`
   already used, with the same `authorKind: "system"`, no `authorName`. The application flow
   raises the stakes — the admin review drawer there is the surface staff use to check a
   resident's supporting documents before issuing a legal document, so a resident-uploaded ID
   or supporting document showing as authored by "Barangay staff" is a more consequential
   mislabel than it was for assistance alone. Whoever triages this list next should weigh it
   accordingly — this is a documentation-only note; no fix is included here.

4. **`applyPreset` does not focus the textarea.** Design §5.3 asked for it; it
   was silently dropped during implementation.

5. **The empty-category guidance-card e2e case never shipped** — the 5th
   Playwright bullet from design §7. Verified manually only. Submits nothing, so
   it costs no rate-limit budget to add.

6. **Two small ones:** a missing
   `label`/`htmlFor` pair in `assistance-categories-panel.tsx`; and a clarifying
   comment on `services-directory.spec.ts`'s collapsed-accordion assertion.

7. **`allowed_mime_types` on the six status-aware bucket pairs.** Migration `0036` set it on
   `ticket-media`/`feedback-media` only. `promoteMedia` re-uploads with
   `contentType: file.type || undefined`, and it fails closed, so a restrictive allow-list on
   a bucket it promotes into would break publishing. Give `promoteMedia` an explicit
   `contentType` first, then widen. Low priority — `file_size_limit` is already set on all
   of them.

---

## Rate-limit budgets to respect while testing

Re-running e2e suites is not free. See CLAUDE.md's Commands section for the full
picture; the short version:

- `assistance-form.spec.ts` — 1 hit on `assistance:<ip>`, `SUBMIT_LIMIT` = 5/hour.
  Forges a fresh IP per run, so it does not collide with itself. Also spends 1 hit
  on `assistance:contact:<digits>`, same reasoning: the contact-number field is
  filled with a per-run-unique, `Date.now()`-suffixed value. **A failure here
  is a real failure first, not a collision.**
- `login.spec.ts` — spends 6 hits on `login:email:<test-admin>` against a limit
  of 5 per 5 min. Still collides by design; a second run inside the window fails.
- `ticket-updates.spec.ts` — 1 hit on `reply:ip:*`, limit 5/hour. ~5 runs an hour.
- `feedback.spec.ts` — all 3 of `SUBMIT_LIMIT` on `feedback:unknown` per run.
