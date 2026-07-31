# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Every session that changes code updates this file in the same session** — not a
follow-up, not "if there's time." Add or correct whatever bullet the change touches before
calling the work done, the same way the existing sub-project bullets were written. Skip it
only for changes with no architectural, conventions, or "what's real vs. placeholder"
consequence (a typo fix, a comment).

## Project

The official website of **Barangay San Fernando, San Nicolas, Ilocos Norte** (Philippines).
Next.js 16 App Router + React 19 + TypeScript (strict) + Tailwind CSS v4, backed by
**Supabase** (Postgres + Auth + Storage). The frontend was built first as a fully static
mock; backend integration is now well underway (migrations `0001`–`0028` applied to both
staging and production, production code deployed and current as of 2026-07-28). Live and
DB-backed: auth + account self-service, the services catalog, all four ticketing flows
(applications / appointments / complaints / assistance), contact inquiries + alert
subscribers, anonymous site feedback, news + announcements + events, transparency
(legislative documents / disclosure documents / monitored projects), and the officials
directory. What remains
static lives in typed `data.ts` files — the contact channels and inquiry subject list,
the home page's six Quick Services cards, and (since the security-hardening pass) the
`/privacy` and `/terms` placeholder content in `src/features/legal/data.ts`. The Home and
About pages became DB-backed in
sub-project 9 (`0021`). `docs/BACKEND_HANDOFF.md` is the living integration brief;
`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the per-plan history. Remaining
work: 2D email (Resend) and migrating `lh3`-hotlinked images to owned Storage — the
security-hardening pass (all 3 plans, see the Architecture section's bullet) is finished.

## Commands

```bash
npm run dev        # http://localhost:3000 — often already running; check before starting another
npm run build      # production build (mix of static + dynamic/DB-backed routes)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint 9 flat config (eslint.config.mjs) — `next lint` no longer exists in Next 16
npm run test:unit  # Vitest, pure functions only (tests/unit)
npm run test:e2e   # Playwright against the dev server (tests/e2e); `--project=public` needs no login
```

**Tests were added 2026-07-22** (sub-project 5), lifting the earlier no-test rule. Two
frameworks with different jobs: **Vitest** covers pure functions — no jsdom, no React
renderer, so a broken test environment cannot make a broken page look green. **Playwright**
drives the real dev server through system Chrome; the `public` project needs no session, the
`admin` project reuses a storage state from `tests/e2e/auth.setup.ts` and skips unless
`E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` are set in `.env.local`. Component-level tests are
deliberately *not* a thing here — behaviour is verified in the browser. The ad-hoc
verification recipe still applies for one-off checks: `.claude/skills/verify/SKILL.md`.
**Since the rate limiter became durable (migration `0029`, security-hardening pass), two e2e
suites are not idempotent within their rate-limit window:** `tests/e2e/admin/login.spec.ts`
(its five deliberate wrong-password attempts record 5 hits on `login:email:<test-admin>` — a
successful sign-in, like `tests/e2e/auth.setup.ts`'s, records nothing, so it's `login.spec.ts`
itself that spends the budget; `playwright.config.ts` runs `setup` before every `admin`-project
test, so a second run within `LOGIN_WINDOW_MS` = 15 min has `auth.setup.ts` blocked by the
*previous* run's hits, failing the whole `admin` project, not just the login test) and
`tests/e2e/public/feedback.spec.ts` (consumes all 3 of `SUBMIT_LIMIT` on `feedback:unknown` per
run — a second `test:e2e:public` run within an hour can fail the pre-existing "a complete
report reaches the barangay" test too). A failure here after a recent run in the same window is
a rate-limit collision, not a regression.

## Architecture

- **Pages are thin.** Files in `src/app/` only compose named feature sections
  (`<TransparencyHero />`, `<LegislativeSection />`, …) — no inline layout logic or data.
  Public routes live in the `app/(public)` route group (shared header/footer chrome);
  the admin portal has its own `app/admin/layout.tsx` (sidebar chrome, `noindex`). The
  admin portal is **auth-gated** (Supabase Auth) and **permission-gated** — every admin
  route and Server Action goes through `requireSessionUser` / `requirePermission(...)` /
  `requireSuperAdmin()` in `src/lib/auth.ts`. Managers are DB-backed with real
  draft→in-review→published→archived workflows and drawer editors that **persist through
  Server Actions**. Every manager is now DB-backed; the mock Dashboard Overview was deleted
  in the 2026-07-22 polish pass and **`/admin` is a redirect**, not a page — it sends the
  signed-in user to the first nav entry they may reach (`firstPermittedPath`; Settings is
  ungated, so a target always exists and it cannot loop). `ADMIN_TEAM` (the last placeholder
  mock constant in `features/admin/data.ts`) was deleted in a cleanup pass along with its
  `TeamRole`/`AdminTeamMember` types — nothing had rendered it since `TeamManager` shipped.
  User management is its own SuperAdmin-only module at `/admin/users` (`TeamManager`, an
  Active|Archived table like the other managers); **Settings keeps only profile, security
  and preferences** — it no longer holds the team card.
- **The nav gate is one module, not a predicate copied four times.** `src/lib/admin-nav.ts`
  holds pure helpers over `ADMIN_NAV_ITEMS` — `canSeeNavItem` / `visibleNavItems` /
  `groupNavItems` / `firstPermittedPath` / `adminPageTitle` — consumed by the sidebar, the
  mobile drawer, the `/admin` redirect and the top bar's title. It is the only unit-tested
  code in the admin portal (`tests/unit/admin-nav.test.ts`), because it is the only pure
  logic. **`adminPageTitle` is permission-gated on purpose:** the portal 404s on unpermitted
  routes so those modules stay hidden, but the layout renders *above* that 404, so an
  ungated lookup would print the module's name over the not-found page. Nav items are
  grouped **Requests / Content / System**, and the flat order of that table decides where
  each user lands after login. The sidebar collapses to a 72px icon rail; its state is a
  `sf-admin-sidebar` **cookie read server-side in the layout**, never `localStorage` in an
  effect — an effect runs after paint, so the rail would render expanded and snap shut on
  every load. `AdminShell` owns that state because the fixed rail and the main column's
  compensating margin have to move together. **Sign-out lives in the sidebar's and mobile
  nav's own footers, not the top bar.** `SignOutButton` is a bare `{className, children}`
  shell over the form action + draft clear — no visual opinion of its own — rendered from a
  footer pinned below the scrolling nav in both `AdminSidebar` (still inside the peek
  trigger, so hovering it collapsed reveals the label like any other row) and
  `AdminMobileNav`'s menu card. `AdminTopBar` no longer renders it.
- **Admin table standards** (sub-project 5, 2026-07-22) are shared primitives, not per-manager
  code: `RowActions` (the row kebab — Edit / Publish / Archive / Delete; portals to
  `document.body` because every admin table sits in `overflow-x-auto`), `ConfirmDialog`
  (replaces `window.confirm`; focus starts on Cancel, stays locked while the action runs),
  `useToast` (carries an incrementing `id` so a repeated message re-fires, plus an error
  tone), `Skeleton` + a `loading.tsx` per admin route, `Tooltip`, `SortableTh` +
  `useTableSort`, and `useEditDeepLink` (`?edit=` / `?review=` from global search).
  **Destructive actions belong on the row, not in the drawer.** Reorder arrows are hidden
  whenever a filter, a search, or a non-`order` sort is active — "move up" only means
  something when the row above is the one that would be swapped.
- **Archive vs delete** (sub-project 6, migration `0020`): archiving is a soft delete anyone
  with the module permission may do; **permanent deletion is SuperAdmin-only and reachable
  only from a record already `archived`** — both conditions enforced server-side by
  `guardDelete()` in `src/lib/archive.ts`, never by the UI alone. Every manager has an
  **Active | Archived** view (`ViewToggle`); `archived` is not a status-dropdown value.
  Restore returns a record to `draft`, never to `published`, and files a `restore` audit
  entry. News, announcements and events gained their deletes in sub-project 7, on the same
  two-condition gate, each removing its own media (an article's `news_photos` objects
  included — the DB cascade drops the rows, not the files).
- **Feedback is anonymous, and that shapes everything about it** (sub-project 10, migration
  `0023`). The floating widget on the public side stores no name, email or IP, so there is no
  consent field, no reply path and no `/track` entry — `/contact` stays the channel for anything
  needing an answer. Screenshots live in the **private** `feedback-media` bucket and are read
  through ten-minute signed URLs minted in the query layer, because a screenshot can contain the
  sender's own account page; it is the project's only private bucket, so `photoUrl`-style
  helpers deliberately have no twin for it. `feedback` is also the one table whose delete is not
  gated on `archived`: SuperAdmin, from a `dismissed` row only, because an anonymous endpoint
  that accepts images needs a janitor. Inquiries still have no delete at all. The widget is
  mounted once in `PublicShell` as a **sibling** of the header — nesting it inside the
  `backdrop-filter` chrome would break its `position: fixed`.
- **Uploads defer to Save** (sub-project 7, 2026-07-22): every uploader is a *pure file
  picker* making no network calls — `PdfUploader`, `MultiFileUploader`, `SingleImageUploader`,
  and `NewsPhotoUploader`'s pending list. The save Server Action uploads server-side and
  **compensating-deletes** the object if the row write fails, so "a storage object exists only
  if a row references it" holds by construction. Copy `saveLegislative`'s `fail()` helper for
  any new one. **`PdfUploader`/`MultiFileUploader` are still pure pickers, but since
  security-hardening Plan 3 their bytes no longer travel inside the save Server Action** — the
  three document forms upload through a Route Handler first and pass the resulting path to the
  action, which narrows that guarantee for them specifically; see the Plan 3 paragraph in the
  security-hardening bullet below for exactly how far it still holds. `src/lib/media.ts` (not a `"use server"` module, deliberately unaudited) holds
  `uploadSingleImage` / `removeStoredImage` / `discardImage`. The one exception is
  `AchievementPhotoUploader`: its editor has no Save button to defer to, so it stays eager —
  see the sub-project 7 spec §2.4 before "fixing" it. `scripts/report-orphaned-media.mjs`
  lists unreferenced objects and never deletes — **rewritten 2026-07-29** for the media-bucket-
  split below: it had gone stale the moment that split shipped, still hardcoded to one shared
  `public-media` bucket and a `FOLDERS` prefix list, so it silently found zero orphans in every
  run afterward (the objects had all moved to buckets it never looked at, not that none existed).
  It now walks every status-aware `MediaKind`'s public **and** drafts bucket
  (`publicBucketFor`/`draftBucketFor` from `src/lib/storage.ts`, reimplemented as a plain formula
  since the script runs outside the Next/TS build) plus the three single-bucket kinds with no
  draft/publish split (`site-media` against `site_items.image_path`, `avatars-media` against
  `profiles.avatar_src`, `feedback-media` against `feedback.screenshot_path` — none of which the
  old script covered either). Still read-only, still prints instead of deleting. **Every delete path removes the DB row before
  the Storage object, never the reverse** — an object deleted ahead of a failed row delete
  leaves a live row pointing at nothing (a broken image forever), while the reverse failure
  just leaves a logged orphan. `news-photos.ts`, `achievement-photos.ts`, `achievements.ts`,
  and the achievement-photo cascade in `officials.ts`'s `deleteOfficial` had this backwards
  (storage-first) until a 2026-07-27 pass reordered all four to match the pattern the
  record-level deletes (`news.ts`, `announcements.ts`, `events.ts`, `legislative.ts`,
  `transparency-documents.ts`, `transparency-projects.ts`) already used correctly.
- **Media buckets are split per content type and the app is now wired to them** (Plan 1
  foundation, 2026-07-27, `docs/superpowers/specs/2026-07-27-media-bucket-split-design.md` +
  `docs/superpowers/plans/2026-07-27-media-bucket-split-foundation.md`; Plan 2 wiring, same day,
  `docs/superpowers/plans/2026-07-27-media-bucket-split-wiring.md`). Reason: Supabase Storage's
  `list()` rides the same RLS `select` policy as an individual object `get()`, so
  `public-media`/`public-documents`' single "public read" policy made draft/in-review/archived
  media anonymously enumerable even though the site never linked to it. The fix: one public/private
  bucket pair per status-aware content type (`news-media`/`news-drafts`, `officials-media`/
  `officials-drafts`, `events-*`, `announcements-*`, `legislative-*`, `transparency-*`) plus two
  always-public buckets for content with no draft state (`site-media`, `avatars-media`) — migration
  `0028` creates all 14. **All six status-aware content types, plus site content and avatars, now
  read and write through the new buckets**: every public query resolves media via
  `mediaUrl(publicBucketFor(kind), path)`, every upload/delete path targets `bucketForStatus`,
  and `scripts/upload-site-images.mjs`/`scripts/upload-official-portraits.mjs` seed to
  `site-media`/`officials-media` respectively (no longer `public-media`). `PUBLIC_MEDIA_BUCKET`/
  `PUBLIC_DOCUMENTS_BUCKET`/`photoUrl`/`documentUrl` are retired from the admin portal — the
  2026-07-28 signed-preview plan (`docs/superpowers/plans/2026-07-28-media-signed-preview-plan.md`)
  replaced every remaining call site with `resolveMediaUrl`/`resolveMediaUrls`/
  `resolveMediaUrlsForList` (detailed below); `photoUrl`/`documentUrl` remain defined in
  `src/lib/storage.ts` but nothing outside that module calls them anymore. **`src/lib/storage.ts`**:
  `MediaKind`/`publicBucketFor`/`draftBucketFor`/`bucketForStatus`/`mediaUrl`. **`src/lib/
  media-lifecycle.ts`**: `promoteMedia`/`cleanupPromotedMedia`/`demoteMedia` — copy a record's
  files into the right bucket at publish/archive, promote fails closed so a row can never read
  "published" with its media still private. **Publish is three steps, in this order:**
  `promoteMedia` (copy only, deletes nothing) → the DB status update → `cleanupPromotedMedia`
  (best-effort remove the redundant `-drafts` source), and the third step runs *only* if the
  second committed — dropping the private source before the status flip has landed would leave
  the object public and enumerable with nothing left to retry from if that flip failed or
  no-opped. **`demoteMedia` fires on any transition that leaves `published`, not only archiving**
  (fixed 2026-07-28 in the wiring plan's final review): the four generic status setters
  (`setOfficialStatus`, `setLegislativeStatus`, `setTransparencyDocumentStatus`,
  `setTransparencyProjectStatus` — the four content types with no discrete
  submit/publish/archive/return-to-draft action functions, just one setter accepting any
  `ContentStatus`) originally demoted only on `archived` specifically; a direct Server Action
  POST of `published → draft`/`in-review` was accepted by validation and left the file live in
  the public bucket with the row reading non-published — unrecoverable, since a later archive
  wouldn't demote either once `previousStatus` was no longer `"published"`. The guard is now
  `previousStatus === "published" && nextStatus !== "published"`. News, announcements and events
  don't need this guard: they have no generic setter, routing every transition through named
  functions with an explicit allowed-from list (e.g. `returnAnnouncementToDraft` only accepts
  `in-review`), so `published → draft` was never reachable there. `resolveMediaUrl`/
  `resolveMediaUrls` — admin preview URLs, published resolves to a plain public URL, anything
  else mints a signed URL against the drafts bucket via the same pattern
  `features/admin/queries/feedback.ts` already uses for screenshots — plus `resolveMediaUrlsForList`
  (new in the signed-preview plan, batching the same resolution over a list query's rows in one
  pass) are now wired into every admin list thumbnail and edit-drawer preview across all six
  status-aware content types (officials + achievements, events, announcements, news, legislative,
  transparency documents + projects). Mapping the actual code during that plan's design found 13
  direct call sites across 6 query files (`transparency.ts` alone covers both legislative
  documents and transparency documents/projects) plus 3 more disguised as
  `mediaUrl(bucketForStatus(...))` in action files — not just the three admin-preview components
  originally scoped above — so this closes the deferred signed-preview gap in full, not partially. Object path
  *strings* never changed in this redesign, only which bucket holds them — no DB column changes
  anywhere. **Deploy-order hazard, must happen in this sequence, staging first:** apply migration
  `0028` → run `scripts/migrate-media-buckets.mjs` (copies every already-published row's file from
  the old `public-media`/`public-documents` into its new per-type public bucket) → deploy this
  branch's code. Deploying the code before the migration script runs 404s every currently-published
  image and document on the live public site, not just new uploads — the public queries ask a
  bucket the file hasn't been copied into yet. **Done on staging 2026-07-28:** `0028` applied,
  then `migrate-media-buckets.mjs` run (12 objects copied, plus 6 reported "FAIL … Object not
  found" for the `site/*` images — a false negative specific to any environment where
  `scripts/upload-site-images.mjs` (sub-project 9) was never run, since that script now seeds
  `site-media` directly and those objects therefore never existed in the old `public-media` for
  this script to copy *from*; running `upload-site-images.mjs` first resolves it, and both bucket
  sets were spot-checked directly via `storage.list()` to confirm). **Done on production
  2026-07-28 too:** the same sequence (`0028` → `migrate-media-buckets.mjs` →
  `upload-site-images.mjs` → deploy) was run against production, and this branch's code is
  deployed and live. **Cleanup pass, 2026-07-28:** the old `public-media`/`public-documents`
  pair is out of `supabase/baseline/0000_baseline_2026-07-23.sql` now (a fresh environment never
  creates them) and migration `0030` drops their `public read` policy on existing environments —
  confirmed via grep that nothing in the app had called `photoUrl()`/`documentUrl()` or
  referenced `PUBLIC_MEDIA_BUCKET`/`PUBLIC_DOCUMENTS_BUCKET` since the wiring plan, so all four
  were dead code and are now deleted from `src/lib/storage.ts`. Deleting a Storage object's
  actual blob needs the Storage API, not raw SQL against `storage.objects` (that would orphan
  the blob while only deleting its metadata row), hence `scripts/delete-old-media-buckets.mjs`
  (new, dry-run by default / `--yes` to actually delete, and treats a bucket that's already gone
  as a clean no-op rather than erroring). **Both staging/dev and production checked clean,
  2026-07-28:** `listBuckets()` against each of this project's two separate databases (staging/
  dev under one set of keys, production under another) found neither ever carried
  `public-media`/`public-documents` — each has exactly the 15 new-style buckets and nothing
  else. This contradicts this file's own prior claim that both environments still had the old
  pair as of the same day; that claim was wrong (or the buckets were removed outside of tracked
  history before this check). Either way, **the old-bucket cleanup is done on both
  environments** — there was nothing to delete. `0030` (drops their `public read` policy) has
  now been applied to both dev and production (confirmed by Justine, 2026-07-29), even though it
  had no bucket left to act on by the time it ran — the migration history stays contiguous.
  **A final whole-branch review of the signed-preview plan (same day) found the wiring above was
  still broken end-to-end for four of the six content types:** `next.config.ts` only allow-lists
  `next/image`'s remote-pattern check for `/storage/v1/object/public/**`, and a signed URL's path
  is `/storage/v1/object/sign/**` — every `<Image>` that can now receive one (officials/events/
  announcements/news thumbnails and edit-drawer previews; legislative and transparency were
  unaffected, they render links, not `<Image>`) would 400 in production and throw in dev. Fixed by
  adding the `unoptimized` prop to all seven call sites (`single-image-uploader.tsx`,
  `officials-manager.tsx`, `events-manager.tsx`, `news-manager.tsx` ×2, `achievement-photo-
  uploader.tsx`, `news-photo-uploader.tsx`) rather than allow-listing the signed-URL path pattern —
  same rationale `feedback-drawer.tsx` already documented for its plain `<img>`: a URL expiring in
  ten minutes has nothing worth caching or optimizing. The same review found `src/lib/media.ts`'s
  `uploadSingleImage` had the identical disguised bug in its returned (uncalled) `url` field —
  built via `mediaUrl(bucket, path)` where `bucket` can be a private `-drafts` bucket — fixed to
  `resolveMediaUrl` the same way `documents.ts`'s `uploadDocumentPdf` already was.
- **Transactional email (Resend), Plan 1 of 3: foundation, 2026-07-30**
  (`docs/superpowers/specs/2026-07-30-resend-email-integration-design.md`).
  Closes `docs/BACKEND_HANDOFF.md`'s previously-undesigned §2D. `src/lib/email.ts`'s
  `sendEmail()` wraps the `resend` SDK and is **fail-open by construction, in
  every environment** — it never throws to its caller, matching the rate
  limiter's fail-open reasoning: every trigger fires after its own DB write
  already committed, so an email failure must never turn into a failed
  resident submission. Missing `RESEND_API_KEY`/`RESEND_FROM_EMAIL` skips
  sending either way; development warns once via `console.warn`, production
  logs via `console.error` on every call rather than throwing (a deliberate
  divergence from Turnstile's dev-skip/prod-throw asymmetry — Turnstile IS
  the anti-bot layer, so failing open there would defeat its purpose; email
  is a best-effort layer with nothing depending on it succeeding). Templates
  are `react-email` JSX under `src/emails/`, every one composed
  inside the shared `<EmailLayout>` (seal, amber header, footer address/phone)
  — the email equivalent of `AdminShell`. `EMAIL_SITE_URL`
  (`src/emails/site-url.ts`, from `NEXT_PUBLIC_SITE_URL`) exists because email
  clients can't resolve relative paths the way the app's own pages can.
  `staffEmailsFor()` (`src/lib/notifications.ts`) resolves staff recipients
  by reusing the exact `permission` each `NOTIFICATION_QUEUES` entry already
  declares — no new permission model. **`submitInquiry` is the first and,
  as of this plan, only wired trigger**: an acknowledgment to the resident
  plus a staff notification to every `handle-inquiries` holder. Plan 2
  (feedback's staff alert, all four ticketing flows' submission receipts and
  status-change notices) and Plan 3 (delivery monitoring via a dedicated
  `email_log` table + Resend webhook — deliberately not `audit_log`, which
  is built for human staff actions, not automated system events) are not
  yet built. **A final whole-branch review (2026-07-30) found and fixed 5
  cross-cutting gaps.** `EMAIL_SITE_URL` now logs via `console.error` when
  `NEXT_PUBLIC_SITE_URL` is unset in production, the same silent-prod-
  misconfiguration treatment `sendEmail()` already gave a missing
  `RESEND_API_KEY` (never throws — the fallback to `localhost:3000` still
  applies, only louder). `sendEmail()` now races the Resend call against a
  5s `SEND_TIMEOUT_MS` via `Promise.race` (not an SDK-version-dependent
  AbortSignal), so a stalled connection still resolves `{ ok: false }`
  through the existing catch instead of hanging the resident's submission.
  `submitInquiry` now runs the ack email and the `staffEmailsFor` lookup
  concurrently via `Promise.all` (neither depends on the other), and the
  staff-notify `sendEmail()` call now sets `replyTo: parsed.data.email` —
  hitting Reply on that email now reaches the resident, not
  `RESEND_FROM_EMAIL`; `replyTo` is a `sendEmail()`-level field, deliberately
  not a prop on `InquiryStaffNotifyEmailProps`. `docs/BACKEND_HANDOFF.md`'s
  several "nothing emails anyone yet, blocked on §2D" claims (the ticket-flow
  ones, the sub-project 5 inquiries changelog entry, item A's "still needed",
  and the feedback section) are now annotated: closed for the contact-inquiry
  case specifically, still open for feedback/ticketing (Plan 2) and delivery
  monitoring (Plan 3).
  **Plan 2 of 3: remaining triggers, 2026-07-30**
  (`docs/superpowers/plans/2026-07-30-resend-email-remaining-triggers.md`). Wires every
  trigger the design scoped to Plan 2: `submitFeedback` now emails every `handle-inquiries`
  holder via `FeedbackStaffNotifyEmail` (feedback stays anonymous — no resident-facing
  email, matching its no-PII design); all four ticketing flows' public submission actions
  (`submitApplication`, `submitAppointment`, `submitComplaint`, `submitAssistance`) and
  their walk-in siblings (`createWalkInApplication` and its three counterparts in
  `src/features/admin/actions/*.ts`) send a `<Flow>SubmittedEmail` receipt to the
  resident's email when one was given; and all 8 "final outcome" status-change admin
  actions (`reviewApplication`'s approved/rejected, `reviewAppointment`'s
  confirmed/declined, `reviewComplaint`'s dismissed + `closeComplaint`'s
  resolved/dismissed, `reviewAssistance`'s declined + `decideAssistance`'s
  granted/declined) send the matching notice — skipping the non-terminal
  `released`/`completed`/`under-review` transitions the design deliberately excluded.
  Every resident template composes a new shared component, `<TicketNotice>`
  (`src/emails/shared/TicketNotice.tsx`) — the "Track this ticket" button, the ticket-number
  treatment, and the optional remarks/detail-line rendering live there once rather than in
  12 near-identical files, the same DRY reasoning the design used to pick composed JSX
  templates over plain HTML strings in the first place. `src/emails/shared/text.ts` holds
  two small pure helpers reused across templates: `periodLabel()` (the exact
  "Morning (8:00 AM – 12:00 NN)" / "Afternoon (1:00 PM – 5:00 PM)" copy
  `src/features/track/actions.ts` already established, not a second wording of the same
  fact) and `excerpt()` (truncates a long free-text field — assistance's `details` — for an
  email body). A complaint's `narrative` and `respondent` are deliberately never echoed
  into `ComplaintSubmittedEmail` beyond the incident date and location: the same "status
  only" restraint `TicketLookupResult` already documents for why `/track` never surfaces a
  complaint's narrative applies here too, on principle, even though the email goes only to
  the reporter's own inbox. `staffEmailsFor()` needed no changes — Plan 1's final review
  already built and unit-tested it (`tests/unit/notifications.test.ts`) ahead of schedule.
  Every new send follows Plan 1's established shape exactly: `await`ed (never
  fire-and-forget), the resident's `email` column checked for null/`""` before sending (the
  same nullable handling the row insert itself already applies), and the caller never
  inspects `sendEmail()`'s return value. §2D's Plan 3 (delivery monitoring — `email_log` +
  the Resend webhook) is the only piece of the original design still open.
  **Fixed 2026-07-31:** `ApplicationApprovedEmail`'s `closingNote` was a hardcoded
  `"Bring a valid ID when you claim it."` with no mention of the document's actual
  requirements. `TicketNotice` (`src/emails/shared/TicketNotice.tsx`) gained an optional
  `requirements: string[]` (+ `requirementsLabel`, default `"Bring these when you claim it"`)
  rendered as a bulleted list below `closingNote` — the email equivalent of `ApplyForm`'s
  "Bring these when you claim your {serviceTitle}" card (`src/features/services/components/
  apply-form.tsx`). `reviewApplication` (`src/features/admin/actions/applications.ts`) now
  selects `services (title, requirements)` instead of `title` alone and passes the row's
  `requirements` through to `ApplicationApprovedEmail`. `closingNote` itself is unchanged
  (the "bring a valid ID" line is a blanket rule, not itself a per-service requirement — the
  seed data in `src/features/services/data.ts` doesn't uniformly list ID as a requirement).
- **`/admin/login` is a responsive split-screen at `md:` (768px)+, 2026-07-31** — a brand panel
  (currently `w-[55%]`, the form panel takes the rest) beside the form, with a **separate**
  centered-card layout below that breakpoint. `src/app/admin/login/page.tsx` renders both
  responsive trees unconditionally and toggles visibility with `md:hidden`/`hidden md:flex`
  (CSS `display:none`, not conditional mounting), so **`LoginForm`'s form-control ids must
  stay `useId()`-derived, never hardcoded string literals** — two copies of the same static id
  in one DOM breaks label association (a `<label for>` binds to the first same-id element in
  tree order) and breaks Playwright locators like `getByLabel`, whichever tree mounts second.
  The right (form) panel centers its content via `my-auto` on the inner wrapper, not
  `items-center` on the scrollable container — flex `align-items: center` clips the
  overflowing side with no way to scroll back to it, while margin-auto degrades to
  top-aligned-and-scrollable; the outer `<main>` and the desktop split container use
  `min-h-screen`, not a hard `h-screen`, so a short viewport grows the page instead of clipping
  the brand panel's feature list. **Both trees' backgrounds are the same photo**
  (`src/images/loginpageImage/TrickOrTreat.jpg`, a barangay community event), rendered
  `scale-105 object-cover blur-[2px]` under a flat `bg-ink-950/70` scrim for text legibility —
  the desktop brand panel keeps its dot-grid/blur-glow/watermark-seal decoration layered on
  top of that scrim, unchanged from the plain-`bg-ink-950` version. **The mobile card is no
  longer visually frozen** (a prior version of this bullet claimed it was) — it now carries the
  same photo/scrim treatment and its own "Home" link (top-left, in-flow, abbreviated — the
  desktop panel's equivalent reads "Back to home", bottom-left, absolutely positioned); both
  are plain `next/link` to `/` with a leading `ArrowLeft` icon, not styled as buttons. The
  desktop brand-panel heading is a single `<h1>` — "San Fernando – "Onse"" then a `<br/>` then
  "San Nicolas, Ilocos Norte" — with no `BrandStroke` underline and no seal image in that
  panel's header row (only the "Barangay Portal" `Eyebrow`); the seal moved to the **form**
  panel instead, at 240px, above an `Eyebrow`+`BrandStroke` heading+subtext block that
  deliberately mirrors the mobile card's own header copy ("Barangay Portal" / "San Fernando" /
  "Sign in to continue") rather than reading "Welcome back". **"Remember me" is a real,
  interactive checkbox** (`defaultChecked`, `name="remember"`, no `disabled`) as of this same
  day — it was originally shipped `checked disabled` with an explanatory caption as a
  deliberate "honest, not dead, UI" placeholder (see the design spec), but the caption is now
  removed and the checkbox itself un-disabled per explicit follow-up direction. **This reverses
  the honesty rationale without replacing it**: the form still submits a `remember` value, but
  no Server Action reads it, so ticking/unticking currently has zero effect on session
  length — the 30-minute idle-timeout model (`src/lib/session-activity.ts`) is unchanged and is
  still the only thing governing session duration. Wiring `remember` to an actual longer-lived
  session is a real, not-yet-scoped security change, not a UI tweak. "Forgot password?" is a
  real link now, not a placeholder button — see the self-service reset flow bullet below.
- **Self-service "Forgot password?" flow, 2026-07-31**
  (`docs/superpowers/specs/2026-07-31-admin-forgot-password-design.md`). Closes the login
  page's honesty placeholder — "Forgot password?" used to just toast "Contact SuperAdmin"
  because no reset flow existed. Two new public pages, `/admin/forgot-password` and
  `/admin/reset-password`, share the login page's split-screen chrome via a new `AuthLayout`
  (`src/features/admin/components/auth-layout.tsx`, extracted from `login/page.tsx` —
  `subtitle` swaps per page, `children` still mounts twice, once per responsive tree, exactly
  as `<LoginForm />` always has). **No new database table and no new browser-side Supabase
  client** — everything stays server-driven, matching the rest of this app's auth.
  `requestPasswordReset` (`src/features/admin/actions/auth.ts`) is Turnstile-gated like the
  other 8 public forms, then rate-limited via `checkRateLimit`'s record-on-every-call form (not
  `signIn`'s success-doesn't-count split — every request must count identically, real account
  or not, or differential counting itself becomes an enumeration signal; `RESET_LIMIT` = 3 per
  `RESET_WINDOW_MS` = 15 min, on both a `reset:ip:*` and a `reset:email:*` key), then calls the
  service-role `auth.admin.generateLink({type:'recovery', email})` and emails a reset link
  through the existing Resend pipeline via a new `PasswordResetEmail` template — Supabase's own
  mailer is never used. **It always returns the same generic response** ("If an account exists
  for that email...") regardless of whether the email matched a real/active account or whether
  the rate limit was hit; the UI cannot observably distinguish any of those cases, by design.
  `RESET_TIMING_FLOOR_MS` (1200) closes that same leak in the time dimension: every
  post-validation branch returns the identical payload, so without a floor the found-active
  branch — an admin `generateLink` round trip, then a `profiles` query, then max(one Resend
  call, one audit insert) — would answer measurably slower than the rate-limited, unknown-email
  and inactive-account ones, and a script could enumerate staff addresses by stopwatch instead
  of by reading copy. It shipped at 600ms, which those three sequential network hops plausibly
  exceed on their own; 1200 sits above them without making rejected requests wait out
  `sendEmail()`'s full 5s ceiling. The account-existence check is `generateLink`'s own result,
  not a `profiles` lookup by email — `profiles.email` isn't guaranteed to share
  `auth.users.email`'s case normalization (`createTeamUser` inserts whatever case was typed),
  so matching by email risked a false negative for an existing account; `generateLink` returns
  the matching user's id instead, and `profiles` is then queried by that id (exact, no case
  ambiguity). **The emailed link carries `generateLink`'s `properties.hashed_token`, not its
  `action_link`, and `resetPassword` redeems it with `verifyOtp({type:"recovery", token_hash})`
  — NOT `exchangeCodeForSession`.** Do not "simplify" this back: the flow originally shipped on
  `action_link` + `exchangeCodeForSession` and was broken end-to-end for every possible link,
  which six per-task reviews missed because it reads like the documented happy path.
  `@supabase/ssr`'s `createServerClient` hardcodes `flowType: "pkce"`, setting that field
  *after* spreading caller-supplied auth options so `src/lib/supabase/server.ts` cannot
  override it; PKCE's `exchangeCodeForSession` then demands a code-verifier that
  `@supabase/auth-js` reads from that same client's storage, and the verifier is written only
  by the client that *initiated* the flow. Here the flow is initiated entirely server-side by
  the service-role admin client, which writes nothing to the resident's browser — so the
  verifier can never exist and every exchange throws `AuthPKCECodeVerifierMissingError`, even
  on a perfectly fresh link. `verifyOtp` needs no verifier: it POSTs the hash to Supabase's
  `/verify` endpoint and, on success, persists the returned session through the cookie-bound
  client's normal adapter (`setAll` → `cookies().set`, mutable inside a Server Action), which
  is exactly the session `updateUser({password})` then runs against. The URL is built by this
  app — `${EMAIL_SITE_URL}/admin/reset-password?token_hash=…` — so **there is no Supabase
  dashboard prerequisite on any environment**: nothing sends `redirectTo`, nothing uses
  `action_link`, and `verifyOtp` is a server-to-server POST that performs no redirect, so no
  Redirect-URL allow-list entry is involved. (A prior version of this bullet claimed such a
  change was required. It was never true once this fix landed, and the claim is now false in
  full.) Redemption happens **only at submit time, inside the Server Action — never when
  `/admin/reset-password` first renders**, because corporate email "safe link" scanners
  pre-fetch every link in an inbound email before the recipient opens it, which would otherwise
  burn the single-use token before the real user ever clicks; the page only reads the
  `token_hash` search param and forwards it to a hidden input. That name is a wire contract —
  `token_hash` in the URL, in the hidden input's `name`, and in `formData.get("token_hash")`;
  `tokenHash` everywhere internal (Zod key, page destructure, component prop) — and a mismatch
  compiles clean while failing silently at runtime. `RESET_SUBMIT_LIMIT` /
  `RESET_SUBMIT_WINDOW_MS` (10 per 15 min, keyed `reset-submit:ip:*`) is defense-in-depth
  against replay or brute-force of the token itself. After updating the password the session is
  immediately signed back out before redirecting to `/admin/login?reset=success` — the recovery
  session must not linger, and it never touches the custom `sf-activity` idle cookie, so the
  idle-timeout model is unaffected. Both new audit entries reuse the existing
  `"password_reset"` `AuditActionType` (already used by `changeMyPassword`'s
  current-password-required flow, which this doesn't replace) rather than adding a new enum
  value. The request-side entry carries `detail: "requested from the public forgot-password
  form"`, because it is filed against a *real* account by an unidentified anonymous caller —
  anyone who guesses a staff address gets a row attributed to that identity. This does not
  contradict `signIn`'s "a rejected sign-in is deliberately NOT logged" rule 15 lines above it:
  that row would be unbounded and attacker-triggerable at will, whereas this one is capped by
  the email-keyed `RESET_LIMIT` window and holds no attacker-controlled free text (every field
  is a constant or server-derived from the matched account), so it can only ever prove volume.
  "Someone is probing this account" is worth knowing; the `detail` is what stops a reader
  mistaking the row for the holder's own action. **`src/proxy.ts`'s `isPublicAuthPage` constant
  (`isLoginPage || pathname === "/admin/forgot-password" || pathname ===
  "/admin/reset-password"`) exempts two branches, not one.** It was added for the
  `if (!user && !isPublicAuthPage)` redirect-to-login check, and the idle gate was initially
  left keyed on `isLoginPage` reasoning that "a signed-in user landing on either new page isn't
  the case that branch exists to catch" — which was wrong. The `sb-*` refresh token lives for
  days, so a staffer still signed in but idle 30+ minutes (no `sf-activity` cookie) who clicks
  their own emailed reset link hits that gate, and its redirect to
  `/admin/login?reason=timeout` **discards the query string**, throwing away the one-time
  `token_hash` and leaving no route back to the form. The idle gate now tests
  `!isPublicAuthPage`, and a second block right after it handles the same idle condition on the
  two new pages by deleting the stale `sb-*` cookies onto the response that goes on to render
  normally — same hygiene, no redirect, query string intact. That block carries `!isLoginPage`
  so `/admin/login` still falls through to the unchanged redirect-to-`/admin` branch below it,
  and files no audit entry (the redirecting branch records a user bounced *out* of an
  authenticated area; this one is someone arriving at a page that is public by design). It sets
  a `clearedStaleSession` flag the bottom activity-slide block now also checks, so no
  `sf-activity` window is opened for a session that was just deleted. Tested via
  `tests/e2e/public/forgot-password.spec.ts`, which needs no
  `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (both pages are public) — the full emailed-link round
  trip isn't automatable without a live inbox, same limitation the Resend integration design
  already documented.
- **Autosave is a local recovery copy, never a database write** (sub-project 8, 2026-07-22).
  The seven draft-capable drawers call `useFormDraft(userId, scope, recordId, values)`
  (`src/hooks/use-form-draft.ts`; pure helpers in `src/lib/form-draft.ts`), which debounces a
  JSON snapshot of `values` into `localStorage` under
  `sf-draft:v2:<userId>:<scope>:<recordId|new>` (bumped from `v1` when the Notices work below
  added required fields to `AnnouncementValues` — restoring a `v1` snapshot into the widened
  shape would `setValues` a form missing `slug`/`body` and crash the next keystroke;
  `DRAFT_KEY_PREFIX` is the one constant to bump, never migrate, whenever a draft-capable
  form's values shape changes). **It must never write to Postgres:** editing a
  published record does not change its status, so a timed DB write would push unreviewed text
  onto the live site. Files stay out because the hook is handed `values` and `File` state lives
  outside it — don't "fix" that by passing file state in. Restore is **offered, never applied**
  (the server may have moved on). The status line says *"Recovery copy saved on this device"*,
  never "Saved". `AchievementsEditor` is out of scope: it saves each field on blur and has no
  draft model to hook into.
- **The idle timeout is one cookie, and its absence is the whole signal.** `sf-activity`
  (`Max-Age` 1800, `Path=/` — widened from `/admin` so the notification poll's
  `/api/admin/notifications` request would still carry it, since a browser only attaches a
  cookie to a request path that starts with `Path + "/"` — not `httpOnly`, the client
  heartbeat writes it) exists
  *iff* the user interacted in the last 30 minutes. Nothing compares two clocks, and the
  browser expiring the cookie on disk is what makes "window closed for 30 minutes" work
  with no code. Constants live only in `src/lib/session-activity.ts`; `IDLE_MS` and the
  cookie's `Max-Age` are one derived value, never two literals. **Two gates read it:**
  `src/proxy.ts` (renamed from `middleware.ts` in the 2026-07-28 hardening pass — Next 16
  deprecated the `middleware` file convention in favor of `proxy`) for page GETs, and
  `getSessionUser()` for everything else — the second is not redundant, because Server
  Action POSTs are excluded from the Proxy matcher on purpose. `getSessionUserIgnoringIdle`
  exists for exactly one caller,
  `signOutIdle`, which needs an actor for its audit entry at the moment the cookie has
  just died. The warning dialog owns the **final** minute (29:00→30:00), not a 31st, so
  the client deadline and the cookie expiry are the same instant; `<IdleTimeout />` mounts
  as a **sibling** of `AdminShell` for the usual `backdrop-filter` reason. Its keydown
  listener is **capture-phase on purpose**: Escape must not dismiss an inactivity warning,
  but it must not reach a `Drawer` or `ConfirmDialog` open behind it either, and those
  listen on `document` in the bubble phase and were registered first — so the dialog
  swallows the key from capture, where `stopImmediatePropagation()` still comes first.
  **The closed-window idle sign-out is audited too, discovered rather than witnessed:**
  `signOutIdle` (open tab, client-driven) and the Proxy idle-gate branch
  (`src/proxy.ts`, closed tab) both end with the same `audit_log` shape — `type:
  "logout"`, `detail: "signed out for inactivity"` — but the Proxy branch has no
  live client to call `signOutIdle` from, since discovering the expiry *is* the request
  that trips it. It resolves the actor from the Supabase session `getUser()` already
  returned, fetches `full_name` via the service-role admin client (`profiles` has zero
  RLS policies, so nothing else can read it there), and calls `recordActivity` directly.
  This runs safely because Proxy defaults to the Node.js runtime as of Next 16 — a
  service-role client and an audit insert are not something to assume is Edge-safe, and
  unlike the old `middleware.ts` convention (which required an explicit `runtime: "nodejs"`
  opt-in), `proxy.ts` does not accept a `runtime` config at all; setting one throws. A stale
  background tab hitting this branch after the real user already re-authenticated elsewhere
  would file a second, harmless "signed out for inactivity" row; not deduplicated, since two
  rows both being true costs less than the query needed to suppress one.
- **Request notifications are two signals, not one.** The five `requests` nav rows (six queues —
  Inquiries & Feedback sums two) get a count badge for unhandled work (rows still in their
  initial status — `pending`, `received`, or `new`, depending on the table) and the top bar's
  bell gets a dot for "something arrived since you last looked." The count only moves on a status
  change; the dot only clears when the bell is opened (`markNotificationsSeen` stamps
  `profiles.notifications_seen_at`, migration `0026` — manual on production, like every migration
  since `0012`). One registry, `src/lib/notifications.ts`, owns each queue's table, status,
  permission and deep link — deliberately **not** merged into `search-modules.ts`: neither list
  contains the other (search omits `inquiries`; not all six queues are searchable), so a unit
  test checks the two agree on the five keys they share rather than merging them.
  `NotificationProvider` runs the one 60s poll (`GET /api/admin/notifications`, outside
  `src/proxy.ts`'s matcher, so it re-checks `getSessionUser` itself) that feeds the sidebar
  badges, the mobile nav card and the bell — one poll, three consumers. A 401 stops it silently;
  `<IdleTimeout />` alone owns the sign-out UI. Counts and recent items are computed only for
  queues the viewer's permissions allow, the same disclosure rule `adminPageTitle` follows for
  page titles. **The bell's dropdown panel tracks the top bar, not the bell.** It measures
  `[data-admin-topbar-bar]` (the bar's own DOM node, found via the bell's closest ancestor)
  and matches that element's width and left edge, so it reads as an extension of the bar
  rather than a fixed-width menu anchored to the trigger — moving or renaming that data
  attribute breaks the panel's positioning silently.
- **Home and About are database-backed content, not code** (sub-project 9, migration `0021`).
  Nine blocks live in `site_blocks` (four singleton texts) + `site_items` (five ordered
  collections in one table, discriminated by a `site_block` enum with generic
  `label`/`value`/`body` slots whose per-block meaning is fixed in
  `src/features/admin/site-blocks.ts`). **There is no status column and Save writes live** — a
  page section has no lifecycle, so there is no Active|Archived view and no `guardDelete`;
  deletion is direct and takes its storage object with it. Every action must call
  `revalidatePath("/")` **and** `revalidatePath("/about")`, or edits sit invisible for an hour.
  An empty block hides its section (the hero keeps its text and drops the carousel). Section
  headings, the About `PageHero` and the Join-Community panel stay hardcoded — editable
  everything is a page builder. `manage-site-content` is deliberately **not** in
  `STATUS_PRESETS.editor`. `@dnd-kit` is confined to `src/components/ui/sortable-list.tsx`
  (pass a `useId()` as the `DndContext` id or several lists hydrate mismatched); every existing
  up/down list stays as it is. **Migration `0021` requires `node scripts/upload-site-images.mjs`
  once per environment** — without it the seeded rows point at objects that do not exist.
- **Feature modules own everything for a route:** `src/features/<name>/` =
  `data.ts` (typed mock content) + `components/` (section components) + `index.ts`
  (barrel re-exports, kept in page order). Pages import only from the barrel.
- **Shared shapes live in `src/types/index.ts`** — the single source of entity interfaces
  and the de-facto API contract. Site-wide identity/nav/hotlines live in
  `src/constants/site.ts` (`SITE` object).
- **Writes go through Server Actions + a service-role Supabase client.** All tables have
  **RLS enabled with zero policies** — with three narrow, pre-existing read-only exceptions for
  public/staff reference data (`profiles`, `services`, `assistance_categories`; migrations
  `0001`/`0004`/`0006` respectively — see `docs/BACKEND_HANDOFF.md` §6 item 13) that predate the
  2026-07-28 hardening pass and expose no write path. Read this bullet as "no policies on the
  write-bearing/ticketing tables," not literally zero policies anywhere. The service-role client
  (`src/lib/supabase/admin.ts`) behind an explicit `requirePermission(...)` code check is the
  *entire* auth gate for every write-bearing table, and the
  public/published boundary is the `.eq("status","published")` filter in the query layer.
  Server Actions are public HTTP endpoints, so every write re-validates its input with Zod
  at runtime. Never expose the service-role key to the client. Migrations live in
  `supabase/migrations/`; the owner applies them **manually** against live Supabase staging —
  never assume a migration is applied without confirmation. **Two paths to a schema, and they
  don't mix.** For a **new environment** (production, a fresh staging, a local dev database)
  standing up from nothing, apply `supabase/baseline/0000_baseline_2026-07-23.sql` instead of
  replaying the numbered migrations one by one — it is a single-transaction squash of `0001`–
  `0029` that assumes an empty `public` schema and deliberately ships **without** the demo seed
  content those early migrations insert (`0007_news_content.sql` and `0009_transparency.sql`
  seed placeholder news, announcements, events, and legislative/transparency documents), so a
  fresh production apply doesn't land mock content on the live public site. For an **existing
  environment** that already has some of `0001`–`0029` applied, keep applying the individual
  numbered migrations it is missing, in order, exactly as before — the baseline assumes an
  empty schema and will fail loudly against one that already has any of them. Either way, a new
  environment still needs the two upload scripts the baseline's own checklist names
  (`scripts/upload-official-portraits.mjs`, `scripts/upload-site-images.mjs`) before the
  officials directory and the Home/About pages render real images. The baseline is a prepared
  artifact, not a proven one — it has not been executed against any real database yet. zod is
  **v4** (not v3).
- **Server Components by default.** Client components (`"use client"`) only for real
  interactivity: `SiteHeader` scroll state, mobile navs, `Accordion`, `LegislativeTable`
  (collapsible rows), inquiry + newsletter forms, and the admin portal's managers/drawer
  editors (Drawer, Toast, MiniCalendar, ToggleSwitch). Small state helpers live in
  `src/hooks/` (`useDisclosure`).
- **Design system: amber + ink.** All colors/fonts/radii are Tailwind v4 `@theme` tokens in
  `src/app/globals.css` — `brand-*` (amber), `ink-*` (neutrals), `danger*`. Use only these
  tokens; blue tokens are from the pre-2026-07 design and must not reappear. Space Grotesk
  (`font-display`) headings, Inter body. UI primitives (Button, Card, Section,
  SectionHeading, DataTable, Accordion, …) are in `src/components/ui/`.
- **Motion (framer-motion, imported from `"motion/react"`) is for what CSS cannot do** —
  exit animations (`AnimatePresence`), shared-element indicators (the admin sidebar's
  `layoutId` pill), and mount-time staggers over data. The CSS three-pattern system
  (hero-seq, `.reveal-*`, `--duration-quick` micro-interactions) stays CSS; never port it
  to Motion. All springs/durations come from `src/lib/motion.ts` (budget-tested in
  `tests/unit/motion.test.ts`) — never inline them. Every Motion surface wraps in
  `<MotionConfig reducedMotion="user">`. Never put a transform on a wrapper containing
  `position: fixed` descendants — the admin `Drawer` renders in place, which is why the
  route templates animate opacity only, and why the Drawer itself stays CSS (converting
  it to `AnimatePresence` would also unmount closed editors and reset their form state).
- **Icon caveat:** several data shapes carry `icon: LucideIcon` (a React component). A future
  API must return icon *name strings* mapped to components on the frontend.
- **The public header links to `/admin/login` directly** (2026-07-30), so staff don't have to
  know the URL by hand. Desktop: a labeled outline `Button` ("Login" + `CircleUserRound`,
  read "Staff Login" until a final wording pass shortened it) in `SiteHeader`
  (`src/components/layout/site-header.tsx`). It **replaced** the header's standalone accent
  "Contact Us" button rather than sitting alongside it — with both buttons present, the label
  pushed the row past its width budget and wrapped the wordmark and the
  "Track a Request" nav item onto two lines even at 1440px, because `Container`'s
  `--container-page` (80rem/1280px) caps the header's available width the same for *any*
  viewport ≥1280px, so there was no wider breakpoint that ever granted more room — the fix had
  to remove width demand, not defer it. "Contact Us" was redundant with `NAV_ITEMS`' own
  "Contact" entry, so dropping it (rather than shrinking `DesktopNav`'s padding or collapsing
  either button to icon-only) was the cleanest fix; confirmed the residual wrapping right at the
  1024px `lg` boundary is unchanged pre-existing behavior, not something this introduced, by
  diffing against the untouched header at that width. Mobile: a labeled "Login" row (icon
  `LogIn`, kept different from desktop's icon on request) appended in `MobileNav`
  (`src/components/navigation/mobile-nav.tsx`) below the `NAV_ITEMS` list, separated by a
  divider rather than mixed into that array, since it's a staff-only utility link, not public
  nav content — `NAV_ITEMS` stays public-page-only; the mobile hero's own "Contact Us" button is
  untouched. `UserKey` isn't in `lucide-react@0.525.0` (the version this project had pinned
  before this work) — it was added later, so this bumped the dependency to `^0.577.0`, the last
  release still on the pre-1.0 major, deliberately avoiding the newer `1.x` line's larger,
  unvetted diff for a one-icon need; the pin stays at `^0.577.0` even now that the icon settled
  on (`CircleUserRound`) predates it, since downgrading would be pure churn.
- **Security-hardening pass, all 3 plans shipped** (`docs/superpowers/plans/2026-07-28-security-hardening-foundation.md`,
  finished in the `security-hardening-foundation` worktree, including a final whole-branch
  fix round; Plan 2's own plan and spec are
  `docs/superpowers/plans/2026-07-28-security-hardening-turnstile.md` and
  `docs/superpowers/specs/2026-07-28-security-hardening-design.md`, built in the
  `security-hardening-turnstile` worktree; Plan 3's plan is
  `docs/superpowers/plans/2026-07-29-security-hardening-body-size.md`, built in the
  `security-hardening-body-size` worktree, reusing the same design spec's §6 with one
  correction — see below). Task 1 renamed `src/middleware.ts` to `src/proxy.ts` (see the
  idle-timeout bullet above for the file's actual behavior — unchanged, this was a pure Next 16
  file-convention rename). Task 2 bumped `next` to `16.2.12` and added a `package.json`
  `overrides` block pinning `postcss@^8.5.23` (genuinely bundled inside `next`'s own build
  tooling) and `sharp@^0.35.3` (an optional dependency `next/image` loads at **runtime** for
  on-demand image optimization, not build tooling) — neither is a top-level app dependency, and
  both had unpatched-CVE versions npm flagged; the override forces the patched version without
  waiting for `next` itself to bump them. One `npm audit` finding (`brace-expansion`, reachable
  only through ESLint 9's own
  dependency chain, a dev-time-only tool) was deliberately left unfixed — see
  `docs/BACKEND_HANDOFF.md` §6 item 12 for why (the only fix is an ESLint major bump, out of
  scope for a dependency-patch task; confirmed by testing that forcing `brace-expansion` to the
  patched major via `overrides` breaks `eslint .` outright, since the chain's `minimatch@3.1.5`
  calls an API the patched package no longer exports). **Tasks 3+4:** the rate limiter is now
  durable (`rate_limit_hits`, migration `0029`, `checkRateLimit` is `async` and DB-backed,
  replacing the old in-memory Map — fails open on a Supabase error, same reasoning as
  `src/lib/rate-limit.ts`'s own top-of-file comment), and admin login is now rate-limited by
  both IP and normalized email (`src/features/admin/actions/auth.ts`, `LOGIN_LIMIT = 5` /
  `LOGIN_WINDOW_MS = 15 min`). A final whole-branch review found the initial shape counted
  *every* login attempt, including successes, against that budget — fixed by splitting
  `checkRateLimit` (check-and-record-together, unchanged, still used by all 8 public-form call
  sites) from a new read-only `isRateLimited` + explicit `recordRateLimitHit` pair, so `signIn`
  now checks both keys before calling `signInWithPassword` and only records a hit after a
  failed sign-in or a disabled-account rejection — a successful login records nothing.
  **`requestIp()` fixed 2026-07-29** (found in a full-system security audit, not part of the
  original plan): every IP-keyed bucket — all 8 public forms plus admin login's `login:ip:*` —
  derives from this one helper, and it previously trusted the *first* entry of
  `X-Forwarded-For`, which is whatever the client itself put in the header it sent and is
  trivially spoofable by a direct request, making IP-based throttling decorative regardless of
  hosting platform. It now trusts the *last* entry (the hop closest to this app, appended by
  its own immediate reverse proxy/edge — a client can prepend fake IPs but not append after
  its own connection), and prefers `cf-connecting-ip` when present since Cloudflare's edge
  always overwrites that header rather than forwarding a client-supplied value. This assumes
  exactly one trusted hop in front of the app; an additional untrusted proxy in the chain would
  need the Nth-from-last entry instead. Does not affect Turnstile (still requires a valid
  token) or admin login's email-keyed limiter (unaffected by IP spoofing).
  **Task 5:** `next.config.ts` now sets a scoped CSP plus standard security response headers
  (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy). Adding a
  new remote image host now requires editing **two** places in that file —
  `images.remotePatterns` AND the CSP's `img-src` — and `object-src`/`frame-src` are scoped to
  `'self' + supabaseOrigin` specifically because Chrome renders the transparency section's
  inline `<object type="application/pdf">` preview through an internal frame that `frame-src`
  (not just `object-src`) governs. The CSP's `img-src` also carries `blob:` (client-side upload
  previews — the feedback screenshot preview, the avatar cropper, the single-image and
  news-photo uploaders — mint a `blob:` object URL before any network call, and `'self'` does
  not implicitly cover that scheme), and the CSP carries a `form-action 'self'` directive
  alongside `base-uri 'self'` / `frame-ancestors 'none'` — both gaps found in the plan's final
  whole-branch review, since Task 5's own verification never picked a file mid-test and
  `form-action` has no `default-src` fallback. **Task 6:** `/privacy` and `/terms` are new
  placeholder-content routes, backed by `src/features/legal/data.ts` (`LegalDocument`/
  `LegalSection`, same "not yet reviewed by legal counsel" treatment as `about/data.ts`'s
  `CAPTAIN.message`) — also now listed in the Project section's enumeration of still-static
  `data.ts` files above.
  **Plan 2 (Turnstile CAPTCHA, Tasks 1-11, same day):** all 8 public anonymous Server Actions
  (services/apply, track/lookup, contact/inquiry, feedback, assistance, complaints,
  appointments, announcements/subscribe) now verify a Cloudflare Turnstile token before doing
  anything else, through two new shared files. `src/lib/turnstile.ts` exports
  `verifyTurnstileToken(token, ip)` (POSTs to Cloudflare's `siteverify` endpoint) and
  `TURNSTILE_FAILURE_MESSAGE` — one rejection string reused for every failure reason (missing
  key aside, missing token, wrong token, a Cloudflare-reported failure, and a network error to
  `siteverify` all return the same copy) so a script probing the form can't learn which check
  it tripped. `src/components/shared/turnstile-widget.tsx` exports `TurnstileWidget` (and its
  `TurnstileWidgetHandle` ref type carrying `reset()`), a `"use client"` wrapper that loads
  Cloudflare's `challenges.cloudflare.com/turnstile/v0/api.js` as a plain `<script>` (no npm
  package) and renders through the imperative `window.turnstile` API rather than
  data-attribute auto-render, because every one of the 8 forms must call `reset()` after a
  submit attempt — Turnstile tokens are single-use — without remounting the form and losing
  its state. **Every one of the 8 actions calls `verifyTurnstileToken` first, before
  `checkRateLimit` and before Zod validation** (security-hardening spec §5) — e.g.
  `submitInquiry` in `src/features/contact/actions.ts` — so a failed challenge is the cheapest
  possible rejection and never touches the rate-limit budget. **`verifyTurnstileToken` has a
  deliberate dev-skip/prod-throw asymmetry on a missing `TURNSTILE_SECRET_KEY`:** in
  development it returns `true` (skips verification) with a one-time `console.warn`, so a
  contributor without a Cloudflare account isn't blocked; in production it `throw`s instead of
  silently passing, so a misconfigured deploy fails loudly rather than shipping with no
  CAPTCHA. It fails *closed*, not open, on a missing token, a Cloudflare-reported failure, or a
  `siteverify` network error — the opposite of the rate limiter's fail-open, because Turnstile
  IS the anti-bot layer this plan adds, and failing open would silently disable the very
  feature being shipped. `next.config.ts`'s CSP gained `https://challenges.cloudflare.com` on
  three directives — `script-src` (loads the widget script), `frame-src` (renders its
  challenge in an iframe from that origin), `connect-src` (the widget's own XHR calls back to
  it) — verified by code inspection now, and will be exercised for real by `site.spec.ts`'s
  existing CSP tests only **once a real site key is configured**: with
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` unset, `TurnstileWidget`'s effect returns before calling
  `loadTurnstileScript()`, so today those tests pass with zero bytes ever requested from
  `challenges.cloudflare.com` — they prove the CSP header is well-formed, not that Cloudflare's
  actual traffic is allowed through it. **Confirmed 2026-07-28: this is done.** Justine set
  real `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` values in `.env.local`
  (documented in `.env.example`) and confirmed Turnstile is live in production — no longer a
  launch blocker. In development only, an unset `TURNSTILE_SECRET_KEY` makes the widget
  silently render nothing client-side while the server-side dev-skip bypass keeps every form
  working end to end, no CAPTCHA actually enforced — that asymmetry remains relevant for any
  *new* environment (e.g. a fresh staging instance) that hasn't had its keys set yet: in
  production a missing key makes `verifyTurnstileToken` **throw** instead of bypassing, so a
  keyless production deploy still 500s on first submit rather than silently passing. Remember
  the site key is inlined at build time, so a future key *rotation* needs a rebuild, not just
  an env/redeploy. **Fixed 2026-07-28:** all
  8 forms' `handleSubmit` originally wrapped the action call in `try { … } finally { … }` with no
  `catch`, so a throw (rather than a returned `{ error }`) fell through as an unhandled rejection
  to the nearest route `error.tsx` — a full-page crash that also lost whatever the resident had
  typed, instead of the inline message every *expected* failure already got. Each of the 8 now
  has a `catch { setError("Something went wrong. Please try again.") }` between the `try` and
  `finally`, so an unexpected throw degrades to the same inline recoverable message as a normal
  validation failure. The same `try { … } finally { … }`-with-no-`catch` shape existed in 6 admin
  manager "open edit drawer" handlers too (`legislative-manager.tsx`, `news-manager.tsx` ×2 —
  news and announcements each have their own — `officials-manager.tsx`,
  `transparency-manager.tsx`, `transparency-projects-panel.tsx`), each fetching a record's full
  detail via a `get*ForEditAction(id)` call before opening the drawer; fixed the same way, with a
  `catch { showError(...) }` reusing the wording each handler's own null-detail branch already
  used (e.g. "Could not load that post."). **Then swept the whole admin portal the same day:**
  every `startTransition(async () => { … })` in `src/features/admin/components/` — 76 blocks
  across 31 files — called its Server Action with zero exception handling, not even a bare
  `try`/`finally`; each relied entirely on the action returning `{ error }` cleanly and would
  otherwise crash the whole manager to `admin/(portal)/error.tsx` on any unexpected throw. All 76
  now wrap the action call in `try { … } catch { showError(...) / setError(...) }`, reusing
  each handler's own existing error-display mechanism (a few components use a local `error` state
  banner instead of the `showError` toast — matched per-file, not standardized). Handlers that
  already cleared a `pending`/`confirming` state unconditionally right after the `await` (the
  row-action confirm dialogs — e.g. `team-manager.tsx`'s `runConfirmed`, `feedback-panel.tsx`'s
  `runDelete`) had that cleanup moved into a `finally` rather than left to run only on the
  non-throwing path, so a thrown exception can no longer leave a `ConfirmDialog` stuck open and
  locked. Verified via `grep -c 'startTransition(async' file` vs `grep -c '} catch\|try {' file`
  landing at exactly a 1:2 ratio (one `try` + one `catch` per block) across all 31 files — full
  coverage, not spot-checked. The public-form sweep above and this one used the same generic
  fallback copy, `"Something went wrong. Please try again."`, everywhere a handler had no more
  specific message already in hand. **A second pass caught 3 more files the first grep missed**
  (`news-photo-uploader.tsx`, `achievement-photo-uploader.tsx`, `achievements-editor.tsx`) because
  they alias `useTransition`'s setter as `start` instead of `startTransition` — 12 more sites,
  same fix. `grep -rn 'useTransition()' src/` is the reliable way to enumerate every call site;
  grepping for the literal string `startTransition(async` misses aliased destructuring.
  **`login-form.tsx`, `sign-out-button.tsx`, and `idle-timeout.tsx` are deliberately NOT part of
  this pattern and were left alone on purpose:** they call `signIn`/`signOut`/`signOutIdle`
  (`src/features/admin/actions/auth.ts`) via React's native `useActionState`/`<form action={...}>`
  or a fire-and-forget `void signOutIdle()`, never a hand-rolled `try { await action() } finally`.
  All three server actions end with Next's `redirect()`, which works by *throwing* a special
  `NEXT_REDIRECT`-digest error that Next's router catches higher up — wrapping the call site in an
  ordinary `catch` (client- or server-side) would swallow that throw and silently break the
  redirect on every successful sign-in/sign-out, not just on a real failure. If this class of gap
  ever gets closed for auth, the fix belongs *inside* `signIn`/`signOut`/`signOutIdle` themselves,
  guarding only the pre-`redirect()` logic and checking `isRedirectError()` before treating a catch
  as a real failure — not in these three call sites. **Every error banner is now dismissible
  (2026-07-29):** the ~40 near-identical inline `{error ? <p role="alert" className="...">{error}</p>
  : null}` blocks this whole pass had been adding were collapsed into one shared component,
  `src/components/ui/inline-alert.tsx` — a `role="alert"` banner with a close (X) button, `message`/
  `onDismiss`/optional `className`/`id` props, `twMerge` resolving any base-class override (dark-bg
  `text-danger-bright` on `newsletter-form.tsx`, `text-xs` on `achievement-photo-uploader.tsx`,
  `mb-4` on the category panels) so no variant prop was needed. The shared `<Toast>`
  (`src/components/ui/toast.tsx`) got the same treatment — it only auto-dismissed on a timer before
  (3s success / 5s error) and now also closes on click. Two categories were deliberately left as
  plain, non-dismissible `role="alert"` text: **field-level validation** (`v.errorFor("consent")`
  on the four consent checkboxes, `feedback-panel.tsx`'s public `fileError`) clears itself once the
  field becomes valid — a close button on "this field is required" has nothing to dismiss *to*.
  The four admin **review-drawers** (`application-`/`appointment-`/`assistance-`/
  `complaint-review-drawer.tsx`) render `localError ?? error` — a local validation error and the
  parent manager's `formError` prop layered together — so dismissing has to clear both; each gained
  a `dismissError()` wrapper doing `setLocalError(null)` then a new `onDismissError` prop the
  manager wires to `() => setFormError(null)`. The six manager children that only ever showed the
  parent's `error` (the four walk-in create forms plus `feedback-drawer.tsx`/`inquiry-drawer.tsx`)
  needed the same `onDismissError` prop threaded through with no local half. `login-form.tsx` is
  the one true special case: `useActionState` gives no setter to null out `state.error` directly, so
  dismissal is tracked by **object identity**, not the message text — `dismissedState` is compared
  against `state` itself (`useState<AuthFormState | null>`), because a second failed login produces
  a brand-new `state` object even when the copy reads identically, and comparing strings would leave
  that second failure permanently suppressed. `admin-global-search.tsx`'s previously-silent catch
  (noted above as the one exception to "every catch is visible") now sets a dismissible
  `searchError` shown inside the results dropdown, cleared on dismiss or when the query is edited
  back below `MIN_QUERY_LENGTH`. A pre-existing, unrelated test bug surfaced while running the verification battery for this
  task: `tests/e2e/public/feedback.spec.ts`'s "the rate limit blocks a 4th submission within
  the window" test had been broken since before this branch existed — it looked for a radio
  named `"General Feedback"` but `src/features/feedback/data.ts:20`'s actual label is just
  `"General"`, so the locator timed out. Confirmed via `git show` against the pre-branch base
  commit that it predated this plan, not a Turnstile regression. **Fixed 2026-07-29** — both
  `getByRole("radio", { name: ... })` call sites now match `"General"`.
  **Plan 3 (PDF-upload Route Handler / body-size-limit scoping, 2026-07-29, Tasks 1-10):** the
  design spec's original claim (§6) that `next.config.ts`'s
  `experimental.serverActions.bodySizeLimit` could simply be deleted once PDFs moved off the
  Server Action path was wrong, and Task 9 corrects it rather than following it — `saveNewsArticle`
  and `uploadAchievementPhotos` still accept up to `MAX_PHOTOS` = 3 images in one Server Action
  call (~6MB) and `saveOfficial`/`saveEvent`/`saveAnnouncement`/the site-content actions still run
  `uploadSingleImage` (`src/lib/media.ts`, `MAX_IMAGE_BYTES` = 2MB) inline, so the limit is
  right-sized to `"8mb"` instead (down from `"12mb"`, which existed only to fit a 10MB PDF) — this
  was caught and confirmed with the project owner before the plan was written, not discovered
  mid-implementation. The actual fix: a new authenticated Route Handler, `POST
  /api/admin/uploads/document` (`src/app/api/admin/uploads/document/route.ts`), takes over the
  multipart upload for legislative documents and transparency documents/projects — the only
  Server-Action call sites that were forcing the global limit up for every public, unauthenticated
  form too. It gates on `checkPermission("manage-transparency")`, validates against
  `uploadRulesFor(kind)` (new pure function in `src/lib/storage.ts`, alongside the new
  `DocUploadKind` type — `"legislative"` allows exactly one 10MB PDF, `"documents"`/`"projects"`
  allow up to `MAX_FILES_PER_RECORD` = 3 PDF-or-image files at 10MB each), uploads to the bucket
  `bucketForStatus` already resolves, and returns `{ error, files: [{path, sizeBytes, mime}] }` —
  deliberately no `recordActivity` call, mirroring the reasoning `documents.ts` already had for the
  `uploadDocumentPdf`/`uploadTransparencyFile` Server Actions it replaces (both, plus their result
  interfaces, are now deleted; `removeStoredDocument` is untouched and still lives in
  `documents.ts`). A new client-side wrapper, `uploadDocumentFiles`
  (`src/features/admin/lib/document-upload-client.ts`), `fetch`es the Route Handler; the three
  admin forms (`legislative-form.tsx`, `transparency-document-form.tsx`,
  `transparency-project-form.tsx`) now make two calls on Save instead of one — upload first, then
  the (now-changed) save Server Action with the resolved path(s) — rather than putting the raw
  `File` in the Server Action's own `FormData`. `saveLegislative`
  (`src/features/admin/actions/legislative.ts`), `saveTransparencyDocument`
  (`transparency-documents.ts`), and `saveTransparencyProject` (`transparency-projects.ts`)
  changed signature accordingly: they take an already-uploaded `{path, sizeBytes}` (or
  `{keptIds, uploaded}` for the two multi-file ones) instead of a `File` inside `FormData`. Because
  the Route Handler is a public HTTP endpoint and its returned `path` travels back through the
  client before the save action ever sees it, each save action validates that client-supplied path
  against the same prefix/traversal allow-list `removeStoredDocument` already used before trusting
  it — e.g. `saveLegislative` rejects unless `/^legislative\//.test(upload.path)` and no path
  segment is `".."` — and then confirms the path names a real object via `storedObjectExists`
  (`src/lib/media-lifecycle.ts`, added in the final-review fix wave): a well-formed path is not
  evidence that an upload produced it, and a path absent from the bucket the record's *current*
  status points at cannot be the one this save should store, which also catches an object that
  landed in the wrong half of the public/private bucket pair. It deliberately stops short of
  proving the object came from this request's own upload (another record's path in the same
  bucket still passes) — closing that needs a signed upload receipt, disproportionate against an
  already-authenticated `manage-transparency` holder. **The
  compensating-delete-on-row-write-failure guarantee (see the "Uploads defer to Save" bullet
  above) is narrowed by this two-call split, not preserved.** It holds from the point each save
  action's cleanup helper (`fail()` in `legislative.ts`, `cleanupUploads()` in the other two) is
  defined onward — the final-review fix wave hoisted all three above every validation check
  (`schema.safeParse`, the empty-slug check, the category lookup, the second file-cap check),
  which until then ran *before* the helper existed and so orphaned an object on any rejected save;
  reproducible by attaching a file, blanking the title and clicking Save. What remains is a narrow
  window between a successful Route Handler upload and that point being reached in the save action
  — a lost connection, a closed drawer, an idle timeout — where an object is abandoned with
  nothing left to tell the server to clean it up. That is an accepted tradeoff of the two-call
  design, not an open bug; the janitor that surfaces such orphans, `scripts/report-orphaned-
  media.mjs`, was rewritten 2026-07-29 (see below) to actually look in the buckets this window
  can leave one in. **Narrowed (not closed) 2026-07-31:** all three document forms
  (`legislative-form.tsx`, `transparency-document-form.tsx`, `transparency-project-form.tsx`)
  now catch the case where the save Server Action call itself throws — a dropped connection or
  an in-app navigation away, tab still alive — right after the upload succeeded, and fire a new
  `cleanupOrphanedUpload` (`src/features/admin/actions/documents.ts`, next to
  `removeStoredDocument`, same "not audited" reasoning) for whatever just got uploaded. This is
  deliberately **not** the umbrella-spec-rejected sweeper (§2.8 of
  `docs/superpowers/specs/2026-07-22-transactional-uploads-design.md`, "a sweeper that deletes
  on its own judgement... umbrella §3.3 rejected"): it is a targeted compensating action tied to
  one specific failed client call, not a background process scanning storage on its own
  schedule. A thrown client-side call doesn't prove the save never committed server-side — the
  request can still succeed while the response is lost in transit — so `cleanupOrphanedUpload`
  re-checks whether the exact path (`crypto.randomUUID()`-based, so an exact match is reliable)
  is now referenced by `legislative_documents.file_path` or `transparency_files.path` before
  deleting anything, and a failed lookup skips the delete rather than risk removing a file a row
  now legitimately points to. It does not chase the remaining cases — a closed tab, a full page
  reload, an idle timeout killing the request — since no JS survives to catch anything then;
  those still surface only via the report script, unchanged. **The Route Handler derives the destination
  bucket itself and never trusts a client-sent status:** its request contract is `kind` + an
  optional `id` (the record being edited; absent for a new one, which is always `draft`), and it
  reads that record's real `status` from `legislative_documents`/`transparency_documents`/
  `transparency_projects` — an earlier shape took `status` from the client, which let a stale tab
  put a published record's file in the private `-drafts` bucket (permanent 404 on the public site)
  or a draft's file in the anonymously-enumerable `-media` one, with nothing downstream to
  self-heal it since every cleanup and URL-resolution path computes the bucket from the row's
  current status. A missing row returns the same generic upload-failed message as every other
  failure, so the endpoint never answers whether an id exists. `src/proxy.ts`'s Server Action POST matcher exclusion (the
  `missing: [{type: "header", key: "next-action"}]` line) was re-checked against this change and
  deliberately left alone: it was never PDF-specific, it's a blanket exclusion for every Server
  Action POST under `/admin`, and after the `bodySizeLimit` change the largest remaining
  Server-Action-embedded payload (~6-8MB of images) is still comfortably under
  `proxyClientMaxBodySize`'s 10MB default buffer, so the truncation risk the exclusion guards
  against is unchanged in kind.

## Conventions and gotchas

- Path alias `@/*` → `src/*`.
- Content changes for the **still-static** features go in that feature's `data.ts`, never
  hardcoded in components. Content for **DB-backed** features (services, tickets, news,
  transparency, officials, and the Home/About page blocks) is edited through the admin portal
  and lives in Supabase — not in the repo. `src/features/home/data.ts` holds only
  `QUICK_SERVICES`, which **came back out of the CMS** in the 2026-07-22 polish pass
  (migration `0022` deleted its rows): six links to this site's own routes change when the
  routes change, which is a deploy, not an edit. Don't put them back.
  `src/features/about/data.ts` retains only the `CAPTAIN` name/role/photo fallback.
- `/announcements` is a 3-item News teaser (newest featured + 2 grid cards) with a sidebar
  (`NewsSidebar` shows Announcements + Emergency Hotlines + newsletter signup). `/news`
  is the full chronological archive, news-only content with no sidebar and no featured
  card — every article (including the newest) renders as a plain `NewsCard` in a 3-column
  grid, 6 per load, growing via client-side "Load More" (not URL-addressable pages). Both
  pages fetch via `listPublishedArticles(offset, limit)` with results ordered by
  `published_at desc, id desc` (tiebreaker prevents duplicate keys). `ARCHIVE_BATCH = 6`
  is defined once in `src/features/announcements/queries.ts`. The dead "Subscribe to
  Alerts" button is gone from the `/announcements` hero.
- `/notices` is the Announcements equivalent of `/news`'s full archive — every published
  announcement, newest first, `NOTICES_ARCHIVE_BATCH = 6` (own constant, independent of
  `ARCHIVE_BATCH`), same offset/limit "Load More" pattern, `date desc, id desc` ordering
  tiebreaker. Each announcement also gets a real detail page, `/notices/[slug]`, mirroring
  `/announcements/[slug]`'s template (Urgent badge instead of category, a single image
  instead of a `PhotoGallery`, no author line) — `announcements` gained `slug` and `body`
  columns for this (migration `0027`; `body` is a plain `Textarea` in the admin drawer,
  identical to the News article body field, and falls back to the excerpt when empty, since
  every announcement that predates this migration backfilled to `body = ''`). **Two card
  sizes for the same content, on purpose:** the homepage's dashboard widget keeps the
  original compact `AnnouncementCard` (thumbnail + text row, `src/components/shared/
  announcement-card.tsx`), now a link to the detail page and carrying the Urgent badge it
  was missing before; `/notices` itself renders a separate, bigger `NoticeArchiveCard`
  (`src/components/shared/notice-archive-card.tsx`, a structural clone of `NewsCard` —
  `h-48` image-on-top, `ImageIcon` fallback) in a 3-column grid
  (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, matching `/news`'s own breakpoints,
  `max-w-6xl` container) — the same compact-vs-archive split `/events` already established
  with `EventCard` vs `EventArchiveCard`. Don't merge the two cards or resize
  `AnnouncementCard` to make it "bigger everywhere": the homepage widget's narrow column has
  no room for the taller card. The `/announcements` page's `NewsSidebar` widget's rows are
  also links into `/notices/[slug]` now, with a "View All" button under the list; the
  homepage's own "View All"/"View All Announcements" links were repointed from
  `/announcements` (the unrelated News teaser page) to `/notices`. `saveAnnouncement`'s slug
  handling mirrors `saveNewsArticle` exactly (locked once published, `slugify()` + a
  `-2`/`-3`… uniqueness suffix otherwise), and its shared `revalidate()` helper revalidates
  `/notices/[slug]` as a path pattern (`revalidatePath("/notices/[slug]", "page")`) so every
  action that routes through it — save, publish, archive, restore — invalidates every
  detail page in one call, not just the one `deleteAnnouncement` used to touch explicitly.
  `news.ts`'s equivalent `revalidate()` helper had the identical gap for
  `/announcements/[slug]` — closed in a 2026-07-27 pass by adding the same
  `revalidatePath("/announcements/[slug]", "page")` line, which also made
  `deleteNewsArticle`'s old one-off explicit revalidation of the deleted slug redundant
  (removed, since the generic helper it now calls covers every slug).
- `/events` ("Community Calendar") shows every published event: an unpaginated "Upcoming
  Events" section (`event_date >= today`, soonest first) and a paginated "Past Events"
  archive (`event_date < today`, most recent first, `EVENTS_ARCHIVE_BATCH = 6`, same
  offset/limit pattern as `/news` and `event_date desc, id desc` ordering tiebreaker). No
  detail page per event and no literal calendar-grid UI — a richer `EventArchiveCard`
  (category badge + description excerpt) supplements the existing compact `EventCard`,
  which stays unchanged as the homepage widget's card. `EVENT_CATEGORY_LABELS` lives in
  `src/features/events/data.ts` (moved from `src/features/admin/data.ts`, which had no
  other reason to depend on the `EventCategory` type) — both admin consumers now import it
  from there. The previously dead "Community Calendar" button and the homepage's "View
  Calendar"/"View All Events" links now point at `/events`. `src/features/admin/actions/events.ts`'s
  shared `revalidate()` helper calls `revalidatePath("/events")` alongside `/admin/events`
  and `/` — every event action routes through it.
- Placeholder reality: transparency documents now serve **real** Supabase-hosted PDFs/images,
  so the old `"#"` download stubs are gone; Contact's "Get Directions" now links to the
  barangay hall's real Google Earth location (the dead FOI Guide and More Statistics CTAs
  were removed outright rather than wired). Remaining `"#"` hrefs are in-page anchors /
  not-yet-wired links (captain message, hero CTA). The
  barangay hotline is **real** (`(077) 600 1082` in `SITE.phone` / `EMERGENCY_HOTLINES[0]`)
  and the officials page's 24/7 Action Center dials it rather than 911; other phones, emails,
  and office hours are still placeholder-shaped (correct names, not real contact data). Most
  images are hotlinked from `lh3.googleusercontent.com` (allow-listed in `next.config.ts`)
  and must eventually move to owned Storage (`public-media` exists). The home hero carousel and
  the About history images moved to `public-media/site/` in sub-project 9 (`0021`); like
  `src/images/officials/`, the files in `src/images/carousel/` now stay in the repo only as the
  source for `scripts/upload-site-images.mjs`, not as an app dependency. The remaining bundled
  static imports are the barangay seal (`src/images/logo/`, `SITE.sealImage`) and the barangay
  map (`src/images/map/san-fernando-map.png`, `MAP_IMAGE` on the contact page) — the map is
  bundled deliberately: one file, no admin surface, changes only when the boundary does.
  The other 11 officials' portraits live in Supabase Storage (`public-media/officials/`,
  migration `0012`); `src/images/officials/` is likewise script source only. The **Punong
  Barangay's** portrait is still a bundled static import, but only as the *fallback* in the
  About-page `CAPTAIN` block — `CaptainMessageSection` reads the officials table first. Officials' names are real; their bios are empty and emails/phones are
  placeholder-shaped. The favicon `src/app/icon.png` is a 256px circular crop of the seal —
  regenerate it if the seal changes.
- Real content (verified against the barangay's official **Ecological Profile / Barangay
  Development Plan** PDF, 2026-07-13): mission/vision, the About history timeline (1733
  founding) and "Community Programs", home glance stats, and the Services waste-collection
  schedule. Land area is **8.95 ha** — the PDF's own "(0.895 sq. km)" parenthetical is a
  decimal error; don't reintroduce it. The About `CAPTAIN.message` quotes are still invented
  placeholder text, but Justine has said (2026-07-29) this is **not a launch blocker** — it
  can be swapped for his real message post-launch through the same admin-portal edit path
  (`CaptainMessageSection` reads the officials table) at any time. Treat as done/no longer
  owed for launch purposes.
- The barangay identity is San Fernando everywhere (renamed 2026-07-12 from the
  "Barangay Sampaguita" design placeholder) — any "Sampaguita" appearing in `src/` is a
  regression. San Nicolas is a **municipality** (write "Municipal …", not "City …"), and the
  Ilocos Norte area code is (077).
- The admin nav entry is **`Inquiries & Feedback`** at the unchanged `/admin/inquiries` route —
  two tabs, one `handle-inquiries` permission, since the same people work both queues. Its tab
  strip is `src/components/ui/tab-pills.tsx`; `transparency-manager.tsx` now consumes the same
  `<TabPills>` component too (its hand-rolled copy of that markup was the last one — no other
  admin tab strip is left to migrate).
- Design/implementation history (specs and plans) lives in `docs/superpowers/specs/` and
  `docs/superpowers/plans/`; those dated files are historical records — don't retro-edit them.
- Staff avatars are `profiles.avatar_src` → `public-media/avatars/<uuid>.<ext>` (migration
  `0025`), null meaning initials. **Own photo only** — there is no editor for anyone
  else's, and `/admin/users` renders them read-only. `initialsOf` lives in
  `src/lib/initials.ts`; two copies of it existed before this work (`admin-topbar.tsx` and
  `account-profile-form.tsx`) — the users table (`team-manager.tsx`) is a new call site
  that never had one, it previously rendered no avatar at all. `<Avatar>`
  (`src/components/ui/avatar.tsx`) is now the only renderer; don't start a third copy of
  `initialsOf`. The Settings card shows the photo exactly once and it isn't `<Avatar>`:
  `AvatarPicker` displays the current photo itself and owns the change/remove
  affordances. Saving one must `revalidatePath("/admin", "layout")` as well as the
  settings path, or the top bar keeps the stale initials.
- **The avatar is the one uploader with a cropper, and it is not a `SingleImageUploader`
  variant.** `AvatarPicker` (`src/features/admin/components/avatar-picker.tsx`, Settings →
  Profile only) is a 128px circle that *is* the button — no dashed drop-box — and opens
  `ImageCropperDialog` (`src/components/ui/image-cropper-dialog.tsx`, wrapping
  `react-easy-crop`) on whatever you picked. Its empty state is the amber gradient with an
  upload icon rather than initials, because an empty control should say what it does.
  Three things not to undo: (1) the output is normalised to a **512px WebP square**
  (`AVATAR_OUTPUT_PX`), which is the *only* reason its source ceiling may be
  `MAX_AVATAR_SOURCE_BYTES` (5 MB, client-side) rather than `MAX_IMAGE_BYTES` — the 2 MB
  check in `uploadSingleImage` still guards the upload and the ~50 KB crop sails past it.
  The source types are the avatar-only `ALLOWED_AVATAR_SOURCE_TYPES` (JPG/PNG, no WebP —
  the crop re-encodes to WebP regardless), narrower than the shared `ALLOWED_IMAGE_TYPES`;
  (2) `cropFromImage` rotates the whole image onto its bounding box **before** cropping,
  because `croppedAreaPixels` is measured against the rotated image — crop first and every
  non-zero rotation lands offset; (3) the dialog splits into a wrapper plus an inner panel
  so crop/zoom/rotation reset by unmounting, not from an effect on `open` — the React
  Compiler lint rule rejects that setState cascade. It copies `ConfirmDialog`'s focus trap,
  scroll lock and Escape handling on purpose; don't give it its own. `react-easy-crop`
  injects its own stylesheet, so there is nothing to add to `globals.css`.
  `SingleImageUploader` keeps its four other consumers untouched, and its
  `previewShape="circle"` option is now unused — the officials portrait is the obvious next
  consumer if the cropper ever widens.
