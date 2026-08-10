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
test, so a second run within `LOGIN_WINDOW_MS` = 5 min has `auth.setup.ts` blocked by the
*previous* run's hits, failing the whole `admin` project, not just the login test) and
`tests/e2e/public/feedback.spec.ts` (consumes all 3 of `SUBMIT_LIMIT` on `feedback:unknown` per
run — a second `test:e2e:public` run within an hour can fail the pre-existing "a complete
report reaches the barangay" test too). A failure here after a recent run in the same window is
a rate-limit collision, not a regression. **Since the adaptive login challenge shipped (2026-08-03), `login.spec.ts` also needs
Turnstile keys that solve headlessly** — attempts 2-6 of its five-failure test are
challenged, as is its correct-password attempt. Use Cloudflare's always-pass test keys
(`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`, documented in
`.env.example`); the project owner cannot register `localhost` with the real widget, so
the real keys will not solve locally at all. The site key is inlined at **build** time,
so switching between real and test keys needs the dev server restarted, not just a saved
file. Both tests in that file now pin each run to its own `login:ip:*` bucket via a
forged `cf-connecting-ip` (a `page.route()` interception scoped to the app's own origin —
deliberately NOT `test.use({ extraHTTPHeaders })`, which would also send the forged header
to `challenges.cloudflare.com`, whose edge then refuses to serve the widget script), so
runs no longer poison each other's IP key or `auth.setup.ts`. The **email** key still
collides by design: the five-failure test spends 6 hits on `login:email:<test-admin>`
against `LOGIN_LIMIT` = 5 per 5 min, so a second run inside that window still fails —
unchanged, and still a collision rather than a regression. `auth.setup.ts` gained a
token wait plus **one retry**, because the page cannot see the email key at render time:
when the test account's own address is the flagged one, its first attempt renders no
widget, sends no token, and is turned away with the Turnstile message. **`tests/e2e/admin/ticket-updates.spec.ts` joined
that list when the reply round trip was added** (it was previously the cheap one — an earlier
version of this note said it spent one `/track` lookup and no `reply:*` budget at all; that
stopped being true): per run it now spends **two** `track:*` lookups (`LOOKUP_LIMIT` = 10 per
10 minutes, so ~5 runs per 10 min) and **one `reply:ip:*` hit** (`REPLY_LIMIT` = 5 per **hour**
— the binding constraint, so roughly 5 runs an hour before the reply test starts failing on
the limiter rather than on a regression). The reply's other budget, `reply:ticket:*`, is keyed
on a ticket the test just created, so it can never collide. Same rule as the two suites above:
a failure here shortly after a recent run is a rate-limit collision first, a regression second.
**Row identity in that spec is not uniform, on purpose.** The two older tests use fixed
surnames (`Testa Reyes`, `Testb Bautista`) and never re-find their row after navigating away;
the reply test returns to the list to check the "New reply" pill, so it uses a `Date.now()`-
suffixed surname instead. A fixed one is genuinely unsafe there: the queue's newest-first sort
keys on `submittedAt`, a **date**, so every row a previous run left behind ties with the new
one, and — worse — `expect(row).toBeVisible()` resolves instantly against the *stale* pre-insert
list when a matching older row already exists, which had the test silently drive the previous
run's ticket and then assert against the current run's. Copy the unique-surname pattern, not
the fixed one, for any new test that looks its own row up twice.

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
  Active|Archived table like the other managers); **Settings keeps only profile and
  security** — it no longer holds the team card, and the Preferences card (language select +
  three notification toggles) was **deleted 2026-08-05 on request**. That card was pure local
  `useState` wired to nothing — no column, no action, no persistence — so its removal is a
  UI-only change with no schema or behaviour consequence; `ToggleSwitch` stays, its four
  category/achievement-panel consumers untouched. `SettingsPanel` dropped `"use client"` in
  the same pass (both remaining cards are their own client components). **The two cards sit
  side by side at `xl`, not `lg`** — with the sidebar and page padding removed, a half track
  at `lg` is ~276px inside the card, too narrow for the profile card's avatar-beside-fields
  row; measured in-browser, `xl` gives ~404px and 1440px gives ~484px. Two inner layouts
  undo themselves at that same `xl` to pay for the narrower track: the profile row restacks
  the avatar above the form (`xl:flex-col xl:items-stretch`, handing the fields the card's
  full width) and the security form's new/confirm password pair goes one-column
  (`xl:grid-cols-1`, since "New Password (min 10 characters)" wraps to two lines at ~195px
  and drops its input out of line with Confirm's). **Container queries would be the natural
  tool here and are unusable:** `container-type: inline-size` makes the card a containing
  block for `position: fixed` descendants — the same trap as `backdrop-filter` — and both
  `Toast` and `AvatarPicker`'s `ImageCropperDialog` render `fixed` **in place** rather than
  portaling to `document.body`, so an `@container` on either card would reposition the
  cropper overlay and the toast against the card instead of the viewport.
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
  `AdminMobileNav`'s menu card. `AdminTopBar` no longer renders it. **The rail's brand
  header (seal + "Barangay Portal / San Fernando") is a `Link` to `/`** (2026-08-05, on
  request) — the whole block, seal included, so the collapsed rail keeps the same target
  when the seal is all that renders; its padding, gap and sizes are unchanged from the
  `div` it replaced, since the "nothing in the rail may move between the two states" rule
  applies to it like every row below it. The seal's `alt` is now `""`: the link carries
  the accessible name, and an alt there would have appended a second one.
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
  **Reversed 2026-08-06 — every staff-directed email is gone; read the two paragraphs above
  as history, not as current behaviour.** On the project owner's explicit request (design:
  `docs/superpowers/specs/2026-08-06-superadmin-password-and-staff-email-removal-design.md`)
  the three sends that notified *staff* rather than residents were deleted along with their
  templates: `InquiryStaffNotifyEmail` (from `submitInquiry`, `src/features/contact/
  actions.ts`), `FeedbackStaffNotifyEmail` (from `submitFeedback`, `src/features/feedback/
  actions.ts`), and `TicketReplyStaffNotifyEmail` (from `submitTicketReply`,
  `src/features/track/actions.ts`). **Four claims above are now false and are corrected
  here rather than deleted:** (1) `staffEmailsFor()` — and its `staffQualifies()` helper —
  no longer exist; `src/lib/notifications.ts` no longer imports
  `createSupabaseAdminClient` and is now **pure functions over a static registry with no
  database access at all**, which is worth knowing before adding anything to it. (2)
  `submitInquiry` sends only the resident acknowledgment, so the `Promise.all` that ran the
  ack and the recipient lookup concurrently collapsed back to a single `await
  sendEmail(...)`, and the `replyTo: parsed.data.email` went with it — it was a field on the
  *staff* notification, so there is no longer any email for "hit Reply to reach the
  resident" to apply to. (3) `submitFeedback` now emails **nobody**; feedback's anonymity
  meant it never had a resident-facing send, so that action's entire email path is gone.
  (4) `tests/unit/notifications.test.ts` still exists and is still the file that stops
  `NOTIFICATION_QUEUES` and `search-modules.ts` drifting apart — but it no longer covers
  `staffEmailsFor`, so Plan 1's "already built and unit-tested it ahead of schedule" now
  describes a test that was removed with the function. `REPLY_KINDS` in `track/actions.ts`
  narrowed to `Record<TicketKind, { table: string }>` in the same pass: its `permission`,
  `label` and `path` fields existed only to address and link that staff email.
  **Everything resident-facing is untouched** — the four ticket submission receipts,
  `InquiryAcknowledgedEmail`, the eight terminal-decision notices, `TicketUpdateEmail`, and
  `PasswordResetEmail` all still send exactly as described above, and `src/lib/email.ts`'s
  fail-open contract, `EmailLayout`, `TicketNotice` and `EMAIL_SITE_URL` are unchanged.
  **The consequence is deliberate, not an oversight, and it is the thing to remember:**
  staff now learn of a new inquiry, new feedback, or a resident reply **only** from the
  in-portal bell and the sidebar count badges — the existing 60-second poll. Nobody is
  emailed when work arrives. `NOTIFICATION_QUEUES` and the whole in-portal notification
  system are unchanged and are now the single channel, so a regression in that poll is no
  longer a degraded signal but the total loss of one. Don't "restore" a staff notification
  email as a fix for a missed queue; it was removed on purpose. §2D's Plan 3 (delivery
  monitoring — `email_log` + the Resend webhook) is still the only piece of the original
  design open, and now has three fewer send paths to monitor.
- **Progressive ticket timeline, `awaiting-info`, and resident replies, 2026-08-02**
  (`docs/superpowers/specs/2026-08-02-ticket-timeline-updates-design.md`, migration `0032`).
  All four ticketing flows (`applications`/`appointments`/`complaints`/`assistance_requests`)
  now share one status shape: `<intake>` → `under-review` ⇄ `awaiting-info` → `<stage-1>` →
  `<stage-2>`. **`under-review` is optional, not mandatory** — a clerk can still approve
  straight from the intake status in one click; the transition guards widened from
  `.eq("status","pending")` to `.in("status", ["pending","under-review","awaiting-info"])`
  (and the equivalent for complaints' `received`) rather than forcing every ticket through
  it, and `awaiting-info` is reachable from any non-terminal status, including intake. An
  append-only `ticket_updates` table (migration `0032`) is now the single source of the
  resident-facing timeline, replacing the old three-step diagram derived from
  `status`/`created_at`/`reviewed_at`/`closed_at`. **It is keyed on `ticket_no`, not a
  polymorphic `(kind, uuid)` pair or four nullable FKs** — `next_ticket_number` (migration
  `0005`) already makes `ticket_no` globally unique by construction across all four
  prefixes, `lookupTicket` already depends on that uniqueness
  (`.eq("ticket_no", ticket).maybeSingle()` against the `tickets_view` union), and a text key
  needs no join in either direction; accepted tradeoff, no cascade delete, since no ticket in
  this app has a delete path at all yet. **`visibility` (`'public' | 'internal'`), filtered
  in the query layer, is the entire privacy gate that keeps a staff internal note off
  `/track`** — `loadTimeline` in `src/features/track/actions.ts` filters
  `.eq("visibility","public")` and the component never re-checks it; do not move this check
  into `ticket-timeline.tsx` "for clarity," since that would make the guarantee depend on the
  component being rendered correctly rather than on the query never returning the row at all.
  `author_name` is deliberately NOT selected into that same public payload either, for the
  same reason `loadExtras` withholds a complaint's narrative/respondent/location: an
  anonymous endpoint ships every column it selects whether or not anything renders it, and
  naming the staff member who handled a complaint to the reporter invites pressure on that
  person. `replied_at` (one column added to all four ticket tables) exists because a
  resident's reply flips a ticket from `awaiting-info` back to `under-review` — correctly NOT
  "untouched work" by the existing `NOTIFICATION_QUEUES` status match — so without it a reply
  raises no in-portal signal at all; it clears whenever staff next post an update and renders
  as a "New reply" pill beside the status chip. **Strengthened 2026-08-06:** this column
  originally shipped with the weaker justification that staff would otherwise learn of a reply
  "only from an email, the channel most likely to be missed". That email —
  `TicketReplyStaffNotifyEmail`, sent from `submitTicketReply` — was **removed** on request
  (see the Resend bullet's "Reversed 2026-08-06" paragraph), so there is no second channel to
  be redundant with: `replied_at` and the pill it drives are now the **only** way staff find
  out a resident answered. Treat it as load-bearing rather than as a convenience — dropping
  the `replied_at` write, or filtering it out of the queue query, silently strands every
  awaiting-info ticket whose resident already responded, with nothing anywhere to notice. **`notified_at` is the log's other stamp, and it is not automatic** — nothing
  in `recordTicketUpdate` writes it, so every caller that emails the resident must call
  `markTicketUpdateNotified(entryId)` itself, immediately after its own `sendEmail`, **inside
  the same `if (email)` guard**. It shipped 2026-08-02 with exactly one such call
  (`postTicketUpdate`'s), which left all 14 other resident emails — the four public
  submissions, the four walk-in creates, and the six terminal-decision notices — raising no
  "Email attempted" chip on the entry they belong to; closed 2026-08-03. The consequence was
  never a duplicate send (nothing reads the stamp to decide whether to email): it is
  human-driven, staff reading a missing chip as "the resident was never told" and messaging
  them again by hand. Three deliberate non-callers, all for the same reason — no resident
  email was attempted: `releaseApplication` and `completeAppointment` (non-terminal
  transitions the email design excludes on purpose), and `submitTicketReply`'s own
  resident-reply entry — which until 2026-08-06 emailed **staff** (a chip there would have
  read as the barangay having already answered), and now **emails nobody at all**, so the
  reason it skips `markTicketUpdateNotified` collapses into the same one the other two have:
  no resident email is attempted, so there is nothing for an "Email attempted" chip to
  record. Guard on the id (`if (entryId)`) at every call site —
  `recordTicketUpdate` is fire-and-forget and returns null on failure, and a log write must
  never turn a committed decision into a failed action. `postTicketUpdate`
  (`src/features/admin/actions/ticket-updates.ts`) **never
  writes `reviewed_*`/`closed_*`/`released_*`/`decided_*` or `remarks`** — those columns
  record who decided what, when, and moving a ticket to `under-review` or `awaiting-info` is
  not a decision; `remarks` keeps holding the latest decision's own reason, unchanged. The
  reply path (`submitTicketReply`, same file as `lookupTicket`) checks its ticket-keyed rate
  limit (`reply:ticket:<ticket_no>`) **only after** the surname gate passes, never before:
  ticket numbers are sequential and guessable (the entire reason the surname gate exists at
  all), so checking that budget first would let anyone enumerate ticket numbers and burn
  every resident's reply budget without ever knowing a single surname. It also returns the
  refreshed `TicketLookupResult` directly (built by a `buildTicketResult` helper shared with
  `lookupTicket`) rather than having the client re-run the lookup — `track-lookup.tsx` nulls
  its Turnstile token the instant a lookup succeeds, so a second round trip right after a
  successful reply would show the resident a CAPTCHA error immediately after their reply
  worked. Every storage write and DB filter past the surname gate uses the **DB-resolved
  `view.ticket_no`**, never the client-submitted ticket string — it becomes a storage path
  prefix (`uploadTicketAttachment`), and the client string is only an accident of the
  `.eq()` match that found the row, not a guarantee that survives the rest of the function.
  Attachments land in a new **private** `ticket-media` bucket (Supabase Storage's `list()`
  rides the same RLS `select` policy as an individual `get()`, so a public bucket would make
  every resident's uploaded ID anonymously enumerable — the same reasoning `feedback-media`
  already established), capped at **3 files × 2 MB, chosen specifically to stay under the
  existing `"8mb"` Server Action `bodySizeLimit`** (security-hardening Plan 3) rather than
  raise it — raising it would also mean building a second, anonymous, public-facing sibling
  to the authenticated `/api/admin/uploads/document` Route Handler, the single largest new
  attack surface this feature could have added, for a resident who only needs to attach a
  scan of an ID. `scripts/report-orphaned-media.mjs` gained a `ticket-media` case with its
  own jsonb-array extraction (`ticket_updates.attachments`), since every other bucket in that
  script reads a plain text column. **Deploy-order hazard, same class as `0031`:** apply
  migration `0032` before this code reaches an environment — the list queries select
  `replied_at` and the drawers write `ticket_updates`; a missing column fails every update
  write at runtime. Staging first, verified, then production.
  **e2e coverage is `tests/e2e/admin/ticket-updates.spec.ts`, three tests**: the internal-note
  privacy boundary (a staff `internal` entry must never appear on `/track`), the decidability
  guard (a ticket parked on `awaiting-info` must still be closeable — the whole-branch review's
  Critical), and, added 2026-08-03, the **resident reply round trip**: staff request info →
  the resident answers through `/track` with a file attached → the answer lands on the admin
  timeline attributed to `Resident`, with the attachment reachable and the "New reply" pill
  raised. That third one exists because `submitTicketReply` is the most exposed surface here —
  public, unauthenticated, accepts uploads — and every layer of it was previously proven only
  by inspection. Both new assertions were verified to fail without their fix (forcing
  `canReply` false kills the reply form; dropping the `replied_at` write kills the pill), the
  same "a guard that has never been seen to fail is not a guard" discipline the decidability
  test got. See the Commands section for the rate-limit budget this now spends per run.
- **Applications collect a middle name and a date of birth, and purpose/remarks went
  optional, 2026-08-05** (migration `0033`,
  `docs/superpowers/specs/2026-08-05-ticket-resident-name-parts-design.md`). **Applications
  only** — appointments, complaints and assistance are untouched, which is why the two new
  field schemas live in `src/features/services/schema.ts` and NOT in `residentFields`
  (`src/lib/public-forms.ts`), whose contract is "the identity block every public ticket form
  opens with". `middle_name` is optional and stores `null`, never `""`; `birth_date` is
  **required** in Zod but **nullable in the DB**, because every pre-`0033` row has no value and
  `not null` would fail the alter — the requirement lives in the public schema and the
  duplicated `walkInSchema`, the same place every other bound on this table lives. `birthDate`
  is modelled on `complaintSchema.incidentDate`: a `YYYY-MM-DD` regex plus two **lexicographic**
  string comparisons (`<= manilaToday()`, `>= "1900-01-01"`), never a parsed `Date`.
  `purpose` dropped its `.min(4)` and `alter column purpose drop not null`, keeping only the
  500 cap — the cap is what `public-forms.ts` requires of any free-text field on an
  unauthenticated endpoint; only the floor was a policy choice. **`remarks` on a rejection
  went optional too, and that is a deliberate reversal** of "spec §3: every negative decision
  must carry a reason the resident can read" — the `reviewSchema` refine and the matching
  client guard in `application-review-drawer.tsx` are both gone, so a rejection email can now
  arrive with **no Reason block** (`TicketNotice` already skips a falsy `remarks`) and its
  `/track` timeline entry has an empty body. No fallback copy was invented to hide that;
  don't add one. **The non-obvious part of this change is the Postgres null trap, and it is
  the reason `0033` redefines `search_admin_global`:** that function builds each row's search
  haystack by concatenating columns with `||`, and `text || null` is `NULL` in Postgres — the
  moment `purpose` became nullable, every application without one produced a NULL haystack,
  `fuzzy_match(NULL, q)` returned NULL, and the row vanished from admin global search
  entirely. `coalesce(ap.purpose, '')` restores it, and `middle_name` joined the same haystack.
  Only the applications branch changed; the other eleven are verbatim `0018`. The same
  nullability bit `src/features/admin/queries/notifications.ts`, where `sublabel: row.purpose`
  fed a non-nullable `NotificationItem.sublabel` — Supabase rows are untyped there, so
  `npm run typecheck` could not have caught it; it is `?? ""` now. **`residentDisplayName`
  (`src/lib/resident-name.ts`, unit-tested) renders `First M. Last` in the applications queue
  table** — one function, not an inline template, because the middle name is absent in three
  different ways (null on a pre-`0033` row, `""` when skipped, whitespace when fat-fingered)
  and each would otherwise render `Juan  Cruz` or `Juan . Cruz`. A multi-word middle name
  ("Dela Cruz") yields one initial. **The review drawer deliberately does NOT use it** — it
  shows the middle name in full, because that is where staff read the record before issuing a
  document carrying the applicant's full legal name; a queue table is a scanning surface. The
  `applicant` sort key stays `last + first` (sorting by a middle initial is meaningless), and
  the global-search dropdown's label and the notification bell's labels both stay `First
  Last` — glance surfaces, not records. `tickets_view` is **not** extended: it carries only
  the fields common to all four kinds so a type-specific column cannot leak to `/track`, and
  a birthday is a stronger identifier than anything currently in it. **Deploy order, same
  hazard class as `0031`/`0032`:** apply `0033` to staging, verify, then production, *before*
  this code reaches either — `listApplications` selects the new columns and both inserts
  write them, so a missing column fails at runtime, not at build.
- **Fuzzy search is two engines and exactly one rule, and as of `0034` that is finally
  true, 2026-08-05.** The JS half is `fuzzyFilter` (`src/lib/fuzzy.ts`, unit-tested), used
  by every in-table search box in the admin portal; the SQL half is `public.fuzzy_match()`
  (`0016`/`0017`, final form `0034`), used by `search_admin_global` (the top-bar global
  search), `search_audit_log`, and the **public** `search_legislative_documents`. Both now
  implement the same two routes — literal substring, plus per-word Levenshtein with a
  budget of 1 for terms ≤ 4 characters and 2 for longer. **The SQL half carried a third
  route until `0034`, `word_similarity(term, haystack) >= 0.45`, which the JS half never
  had.** The 2026-07-22 fuzzy-search spec (§3.1) recorded that asymmetry as a *deliberate*
  decision — nearly free in Postgres, and the other two routes "already cover every case in
  §1" — so `0034` reverses a documented decision rather than fixing an oversight, and the
  spec is left as the historical record it is. It was reversed because the route was
  measurably wrong, not merely redundant: measured over every transparency record against
  40 realistic queries (560 SQL-vs-JS pairs on identical haystacks), the two halves
  disagreed 7 times, **always** SQL-matches-where-JS-does-not, and 6 of the 7 were nonsense
  — `"tax"` → *Curfew Hours for Minors*, `"housing"`/`"meeting"`/`"election"` → *Solid Waste
  Management*, `"renovation"` → *Streetlight Installation*. Only `"renovate"` → *Barangay
  Hall Renovation* was worth having, and it is not worth the other six. **This is why
  `/admin/transparency` looked broken while each of its three tabs behaved perfectly**: the
  tab searches run the JS half and were always correct; the global search ran the SQL half
  and was not. The route was **removed rather than re-tuned to a higher threshold**
  deliberately — picking 0.6 or 0.7 requires reading the actual `word_similarity` scores of
  the good and bad matches, and nothing here can: every path to the database in this project
  is PostgREST, which invokes existing functions and cannot evaluate an arbitrary
  expression, so a new constant would be as unmeasured as `0.45` was. Typo tolerance is
  untouched (it rides Levenshtein), and all five of the spec's own acceptance cases were
  re-verified against the post-`0034` rule. `pg_trgm` is still a required extension even
  though no match route uses it — the `gin_trgm_ops` indexes are declared with it. **Don't
  add a trigram route to `src/lib/fuzzy.ts` to "restore parity"** — parity holds now, in the
  other direction. This class of bug (the two halves silently drifting) is invisible to
  `npm run typecheck` and to every existing test, since Vitest covers only the JS half;
  catching it needs the two engines run against the same haystack and diffed.
- **`/appointments/new` shows a coarse demand hint, computed server-side once at render,
  2026-08-10.** Split across two modules on purpose — `src/features/appointments/demand.ts`
  exports the pure `demandLabel(count)` (`Light` < 3, `Moderate` < 6, `Busy` ≥ 6, named
  constants) with no imports beyond types, because Vitest's unit tests run with no jsdom and
  no React renderer, and a transitive import of the Supabase client would break that
  environment; `src/features/appointments/queries.ts` holds `loadAppointmentDemand()`, the
  DB half, kept out of `demand.ts` for the same reason. `AppointmentDemand` (`src/types/
  index.ts`) is `Record<YYYY-MM-DD, {am, pm}>` of `DemandLabel`, tallied in JS over the next
  60 days (`HORIZON_DAYS`) rather than an RPC — a small result set, no new SQL function to
  maintain. **`loadAppointmentDemand` reduces every count to its `demandLabel` before
  returning — only `Light`/`Moderate`/`Busy` ever crosses into `AppointmentDemand`, never a
  number.** This isn't just about what renders: the map is a prop threaded into the client
  component `AppointmentForm`, so it serializes whole into the RSC payload — a raw count there
  would publish the barangay's exact 60-day volume in page source even though nothing ever
  displays it, so the coarsening has to happen server-side before the map crosses the
  server/client boundary, not merely before the UI renders it. **A date absent from the map
  renders no hint at all, never "Light"** (`AppointmentForm`'s `slotLabel === undefined`
  check) — absence of data and genuine quiet look identical in the map, and only one of them
  is a claim worth making to a resident. **The route needs an explicit `export const dynamic =
  "force-dynamic"` in `page.tsx`, and that line is load-bearing, not decoration.**
  `loadAppointmentDemand` uses the service-role client (`createSupabaseAdminClient`), which
  calls no Next.js Dynamic API (no `cookies()`, no `headers()`) — unlike the cookie-bound
  client every other public query in this app uses, which forces dynamic rendering as a side
  effect of reading the session cookie. Without the explicit export, `next build` prerenders
  `/appointments/new` as a static route (confirmed via `npx next build`, which printed `○` for
  it before the fix), freezing the demand map — and `manilaToday()` — at build time forever;
  the hint would work in `npm run dev` (every request is rendered on demand there) and be
  silently dead within a day of a production deploy. **`loadAppointmentDemand` uses the
  service-role client, not the cookie-bound one, for a second reason** — found by verifying
  the feature live rather than trusting the query in isolation: `appointments` has RLS
  enabled with zero policies like every other write-bearing table, so the anon-key client
  silently returns zero rows for every date (no error to catch) and the hint would never
  appear for anyone. This is the same "deliberately-public action, gates in code instead"
  carve-out `src/lib/supabase/admin.ts`'s own doc comment already grants `lookupTicket`; no
  permission check guards this read because it only ever returns a coarse label, never a row
  — matching how `announcements`/`transparency`/`officials`/`events` queries already read
  their own non-exception tables for the public site (`services`, by contrast, is one of the
  three RLS-exception tables with its own public-read policy, so its public query uses the
  anon client — the counterexample to this pattern, not an instance of it). Declined and
  completed requests are excluded from the tally; neither still occupies staff time on that
  day.
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
  the brand panel's feature list. **Both trees share ONE background photo**
  (`src/images/loginpageImage/TrickOrTreat.jpg`, a barangay community event), rendered
  `scale-105 object-cover blur-[2px]` under a flat `bg-ink-950/70` scrim for text legibility —
  the desktop brand panel keeps its dot-grid/blur-glow/watermark-seal decoration layered on
  top of that scrim, unchanged from the plain-`bg-ink-950` version. **That photo is a single
  `absolute inset-0 md:w-[55%]` layer in `<main>`, not one `<Image>` per tree** (changed
  2026-08-05; it shipped as a copy inside each). Because both trees are always mounted and
  hidden with `display:none`, a per-tree copy left a permanently hidden `<Image>` on every
  render: a second download of the same photo, and — since `next/image`'s dev check measures
  that hidden copy at 0px wide — a permanent false `has "fill" prop and "sizes" prop of
  "100vw", but image is not rendered at full viewport width` console warning that no honest
  `sizes` value on the mobile copy could remove (`1px` at md+ silences it but buys an unused
  preload of a smaller variant instead). The layer's `md:w-[55%]`, the brand panel's own
  `w-[55%]`, and the `sizes="(min-width: 768px) 55vw, 100vw"` are one measurement written
  three times — move them together. Both containers dropped their own `bg-ink-950` and scrim,
  which the layer now carries. One pre-existing dev warning is untouched and expected: Next's
  preload picks a narrower variant (`w=828` at 1440px) than the browser's srcset pick
  (`w=1920`), so Chrome reports that preload "not used" — present identically before this
  change, at both widths. **The mobile card is no
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
- **Admin login is challenged adaptively, not always, 2026-08-03**
  (`docs/superpowers/specs/2026-08-03-admin-login-captcha-design.md`). `/admin/login`
  shows a Turnstile challenge **only after a failed attempt** on that IP or email —
  the trigger is ≥ 1 hit on `login:ip:*`/`login:email:*` inside `LOGIN_WINDOW_MS`, read
  off the same `rate_limit_hits` rows (migration `0029`) that already drive the
  5-failure block. No new table, column, or key namespace. **`LOGIN_WINDOW_MS` was
  shortened from 15 min to 5 min later the same day**, on explicit direction, and it is
  the one knob that moves both thresholds at once: a blocked attacker now gets their 5
  guesses back three times as often (60/hour per account, up from 20) and a failed
  attempt keeps the challenge raised for a third as long. `LOGIN_LIMIT` is untouched, so
  no single burst gets more guesses than before, and the shorter wait is what makes a
  locked-out staff member tolerable without a break-glass bypass — which this design
  deliberately still does not have. It also cuts the e2e rerun friction below from 15
  minutes to 5.
  **Always-on was deliberately rejected**: `verifyTurnstileToken` fails closed and
  throws in production on a missing key, so an unconditional widget would put a hard
  Cloudflare dependency in front of the only door into the portal — an outage, a
  blocked network, or a key rotation (the site key is inlined at build time, so
  rotation needs a rebuild) would lock out every staffer including the SuperAdmin,
  with nobody able to sign in and fix it. Adaptive keeps that door open for anyone who
  types their password correctly. **There is deliberately no break-glass bypass flag.**
  `isRateLimited` is **gone**, replaced by `countRateLimitHits(key, windowMs)` returning
  `number | null`: `signIn` reads two thresholds off each key, and a boolean helper meant
  running the same count query twice per key. The two thresholds interpret `null`
  (Supabase unreachable) in **opposite** directions, and that asymmetry is the point —
  `isOverLoginLimit` fails **open** (unchanged: a limiter outage must not lock out real
  staff), `needsChallenge` fails **closed**, so the outage that previously removed *all*
  brute-force protection now makes login challenge every attempt instead. Both predicates
  are pure and unit-tested (`tests/unit/login-challenge.test.ts`), living in
  `src/features/admin/lib/login-challenge.ts` (beside `build-full-name.ts`) because
  `actions/auth.ts` is `"use server"` and Vitest cannot import it. **`signIn` recomputes
  the condition server-side every call** — `SignInFormState.challengeRequired` is a UI
  hint only, so a client that never mounts the widget is refused identically.
  `SignInFormState extends AuthFormState` deliberately: the base type stays the
  password-reset flow's, which has no challenge concept and must not carry an inert
  field. **The Turnstile check runs AFTER the count reads, inverting the
  security-hardening spec's §5 "verify first" rule**, because whether a challenge is
  required at all depends on state only those reads reveal; commented at the call site so
  it doesn't get "fixed" back. **A failed or missing token records no rate-limit hit** —
  hits are keyed partly on email, so counting them would let anyone lock a known staff
  address out with five tokenless POSTs.
  **`/admin/login` server-renders the initial challenge state** (`page.tsx` reads
  `countRateLimitHits` for the request IP and passes `initialChallengeRequired` into
  `LoginForm`, which shows the widget on `initialChallengeRequired || state.challengeRequired`).
  Without this the widget only appeared *after* a rejection, so a staffer whose shared
  office IP a colleague had just flagged submitted correct credentials with no token and
  was refused — for a barangay hall behind one public IP, the ordinary case. It passes
  `0`, never `null`, for the email count: `needsChallenge` treats `null` as fail-closed,
  which would put a widget on every first load and destroy the adaptive behaviour.
  **The email half of that gap is unfixable at render time and is closed by copy
  instead:** no email is known when the page renders, so `login:email:*` hits stay
  invisible to it, and the failed-challenge branch therefore returns
  `TURNSTILE_FAILURE_MESSAGE` rather than the generic `"Incorrect email or password."` —
  otherwise a staffer whose own address is flagged is told a working password is wrong
  and goes off to reset it. That copy leaks nothing the widget's own appearance doesn't.
  Client-side this form cannot follow the 8 public forms' pattern: it is `useActionState`
  + a native `<form action={...}>` with no `handleSubmit`, so the token rides in a hidden
  `turnstileToken` input and the single-use widget is `reset()` from a `useEffect` keyed
  on `state` **identity** (a second failure yields a new state object with identical copy
  — the same reason `dismissedState` compares identity). That effect only fires on
  failures, since a successful sign-in throws `NEXT_REDIRECT` and never returns a new
  state, keeping `login-form.tsx` clear of the standing "never wrap `signIn` in a catch"
  rule. `LoginForm` mounts twice (both responsive trees), so two widget instances exist
  once challenged; the hidden one may never solve and nothing depends on it.
  **Open follow-up this feature raises the stakes on:** `requestIp()` prefers
  `cf-connecting-ip` unconditionally (2026-07-29, pre-existing), and
  `tests/e2e/admin/login.spec.ts` forging that header from a bare Playwright client is
  direct proof any caller can — there is no Cloudflare hop in that path. Nothing in the
  code, config or `.env.example` asserts that production actually sits behind Cloudflare.
  Before this bullet, a forged value bought one unchallenged guess total; now, since
  `login:ip:*` is both the CAPTCHA trigger and the sole input to
  `initialChallengeRequired`, rotating it buys **one unchallenged guess per account** in a
  spraying attack. Still bounded — the email key caps per-account brute force at one free
  guess and blocks at five — so this is degradation, not a hole. The fix, when someone
  picks it up, is to gate the preference behind an explicit deployment assertion (an env
  flag, or validating the peer against Cloudflare's published ranges) and to document
  which topology the app is deployed behind.
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
- **Admin account creation is password-based: the SuperAdmin types the new staff member's
  password, 2026-08-06** (`docs/superpowers/specs/2026-08-06-superadmin-password-and-staff-
  email-removal-design.md`). **This reverses the invite-based design of 2026-08-01**
  (`docs/superpowers/specs/2026-08-01-admin-account-invite-design.md`), on the project
  owner's explicit request, and that spec is now a historical record like every other dated
  file in `specs/` — don't implement from it. **What it used to do, so the reversal reads
  clearly:** `createTeamUser` accepted no password, created the Supabase Auth user with an
  unguessable `crypto.randomUUID()` credential nobody knew, and then emailed a "set your
  password" link built from `generateLink({type: "recovery"})` → this app's own
  `/admin/reset-password?token_hash=...` URL → `resetPassword`'s `verifyOtp` redemption; a
  `sendAccountInvite` helper served both that call and a `resendTeamUserInvite` row action,
  and an "Invite pending" badge (inferred from `auth.users.last_sign_in_at is null`) gated
  the resend. **What it does now:** `createTeamUser` (`/admin/users`, SuperAdmin-only)
  takes a `password` on `TeamUserInput`, validated `.min(10)` with the message `"Password
  needs at least 10 characters."` — chosen to match the floor `resetPassword` and
  `changeMyPassword` already enforce, so all three doors into a password agree rather than
  each carrying its own number. The create drawer gained Password + Confirm password fields
  (`PasswordInput` + `PasswordStrength`) in **create mode only**; edit mode still cannot set
  another user's password, which is unchanged. The confirm field is a client-side typo guard
  and nothing more — the server keeps only `.min(10)`, so don't go looking for a matching
  server-side confirm check. `email_confirm: true` on the admin create call is unchanged and
  is what suppresses Supabase's own address-verification mail, so **account creation now
  sends no email whatsoever**; the credential travels out of band, SuperAdmin to staff
  member. **Deleted with the reversal:** `sendAccountInvite`, `resendTeamUserInvite`, the
  `AccountInviteEmail` template, the "Resend invite" row action, the "Invite pending" badge,
  `TeamUser.invitePending`, and `invitePendingFlags()` — the last of which removes the N+1
  `auth.admin.getUserById` per roster row that the 2026-08-01 bullet had explicitly accepted
  as fine because rosters are small; `/admin/users` now renders from one query.
  `tests/e2e/admin/users.spec.ts` was rewritten for this design (it had been written for the
  invite one). **Recovery is unchanged and is the answer to "what if the password is lost or
  mistyped":** `/admin/forgot-password`. The entire recovery-link mechanism —
  `generateLink` → `/admin/reset-password?token_hash=…` → `verifyOtp`, with every subtlety
  the self-service reset bullet above documents — **survives untouched**; only its
  account-invite consumer went away, so nothing in that bullet needs re-reading. `profiles` gained
  `first_name`/`middle_name`/`last_name` (migration `0031`) alongside the unchanged
  `full_name`, which the new `buildFullName()` helper
  (`src/features/admin/lib/build-full-name.ts`) keeps in sync on every SuperAdmin-driven
  write. Settings → Profile's self-service "Full Name" field is deliberately untouched and
  still writes `full_name` directly — a user who renames themselves there will drift the
  split columns out of sync with it (accepted, see the spec's "Accepted drift" section).
  `profiles.phone` (already existed, migration `0003`) is now also captured at
  account-creation time and editable by a SuperAdmin for someone else's account, gated the
  same "only when editing someone else" way the email field already was. **Deploy order
  matters**: apply migration `0031`
  before this code reaches an environment — `listTeamUsers`/`listArchivedTeamUsers` select
  the new name columns, and a missing-column error there is caught and logged, not thrown,
  so a skipped migration doesn't fail loud: `/admin/users` silently renders an empty roster
  and `createTeamUser` fails with a generic "Could not save the profile."
- **Service cards route by an explicit `flow` column, not by inferring it from `tone`,
  2026-08-10** (migration `0035`, `docs/superpowers/sdd/2026-08-10-services-request-flows/`).
  `services.flow` (`text not null default 'apply' check (flow in ('apply', 'complaint',
  'assistance', 'appointment'))`) replaces the old inference where `tone === 'danger'` meant
  the complaint form and anything else meant the document-application form — that scheme had
  no room for a third destination. `ServiceFlow` (`@/types`) is the union; `serviceHref`
  (`src/features/services/flow.ts`) is a pure function taking a structural `{id, flow}` and
  switching **exhaustively, no `default`**, so a fifth flow added to the union without a route
  added here is a compile error, not a silent fallthrough to the apply page. `Service` and
  `AdminServiceRow` (`@/types`) both carry `flow`, populated by all three query mappers
  (`src/features/services/queries.ts`'s `listServices`/`getApplyService`,
  `src/features/admin/queries/services.ts`'s `listServiceCatalog`). Two new catalog rows exist
  for the flows that previously had no service-directory entry at all: `social-services-
  assistance` (flow `assistance`, routes to `/assistance/new`) and `set-an-appointment` (flow
  `appointment`, routes to `/appointments/new`) — both are tone `primary` (they read as
  ordinary cards, not danger-styled), which is exactly why `getApplyService`'s guard could not
  stay tone-based: `data.tone !== "primary"` would have passed both straight through into a
  full document-application form backed by no application table. **That guard is now `data.flow
  !== "apply"`** — the security-relevant fix, not cosmetic — and it turned out to be one of
  **three**, not one. `submitApplication` (`src/features/services/actions.ts`) — a **public**
  Server Action a resident's browser can hit directly, independently of what any page links to
  — and `createWalkInApplication` (`src/features/admin/actions/applications.ts`, where
  `process-applications` gates *who* may call it but nothing gated *which* service row the
  drawer submitted) carried the identical tone-based gap and were found and fixed after
  `getApplyService`: before the fix, a `serviceId: "social-services-assistance"` request to
  either returned a real ticket number for a document application that does not exist. The
  lesson worth keeping: when routing moves off a field, the render path is the obvious call
  site and the write paths are the ones that get missed. **All three guards read `flow` off a
  `.select()` that must name the column explicitly** — drop it from any one of the three and
  `service.flow` reads `undefined`, `undefined !== "apply"` evaluates `true`, and every
  application on the site starts getting rejected, silently, with no line anywhere that looks
  wrong in review. `tone` still decides the card's
  visual variant (`isDanger ? "outline-danger" : "primary"` in `service-card.tsx`) and nothing
  else — true now that all three guards read `flow`, not before; `serviceHref(service)` alone
  decides the href. The card's two labels carry a matching trap on the write side:
  `labelsForFlow` (`src/features/admin/actions/services.ts`, replacing the old
  `labelsForTone`) recomputes `requirements_label`/`cta_label` on every create *and* update
  rather than persisting an edit, so the first no-op SuperAdmin save on either new row would
  have silently rewritten its card copy back to "View Requirements"/"Apply Online" — days after
  anyone touched it, nowhere near the save that caused it — had its four label pairs not been
  kept character-identical to `0035`'s seed values, which is why saving an untouched row is a
  no-op rather than a rewrite. Covered by `tests/e2e/public/services-directory.spec.ts` (2
  tests, `public` project, no login, submits nothing so it spends no rate-limit budget). The
  pre-backend `SERVICES` mock array in
  `src/features/services/data.ts` was deleted in the same change (dead — nothing imported it;
  `WASTE_SCHEDULE` and its `Leaf`/`Recycle`/`WasteCollectionSlot` imports are untouched, that
  half of the file is live).
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
- **Request notifications are two signals, not one — and since 2026-08-06 they are the *only*
  signal.** The three staff-directed notification emails were removed that day (see the Resend
  bullet's "Reversed 2026-08-06" paragraph), so nothing outside this poll tells anyone that work
  arrived. The mechanism below is unchanged; its stakes are not. The five `requests` nav rows
  (six queues —
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
  headings and the About `PageHero` stay hardcoded — editable everything is a page builder.
  (The Join-Community CTA panel used to be the third example here; it was **deleted**
  2026-08-05 on request — `join-community-section.tsx` is gone, along with its barrel export
  and its render in `app/(public)/about/page.tsx`. It was never DB-backed, so nothing in
  `site_blocks`/`site_items` changed.) `manage-site-content` is deliberately **not** in
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
  `0034` (a prior version of this bullet said `0001`–`0029`, then `0001`–`0031`, then
  `0001`–`0033`; the file's own header is authoritative). **`0032` and `0033` were folded in on
  2026-08-05**, closing the one
  gap this rule ever had: the ticket-timeline work landed `0032` without touching the baseline,
  so a fresh environment silently missed `ticket_updates`, `replied_at`, the four widened status
  CHECKs and the `ticket-media` bucket. **`0034` was then folded in as it landed, the same
  day**, keeping the streak. The baseline is contiguous and needs no "run X after" companion
  step — keep it that way for whatever lands next. `0032`'s timeline backfill is omitted
  for the same reason `0014`'s backfills are: it rewrote rows a new database does not have.
  The baseline
  assumes an empty `public` schema and deliberately ships **without** the demo seed
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
  `LOGIN_WINDOW_MS = 15 min`, shortened to **5 min** on 2026-08-03 — see the adaptive-login-
  challenge bullet above for why). A final whole-branch review found the initial shape counted
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
  an env/redeploy.
  **The widget reports its own failure states, 2026-08-03** (`turnstile-widget.tsx`,
  `tests/e2e/public/turnstile.spec.ts`). `appearance: "interaction-only"` means a healthy
  widget and a dead one look **identical** — both are a zero-height empty box — so every
  failure path used to be completely silent: a blocked script `console.error`'d and
  swallowed the rejection, and Cloudflare's `error-callback` only nulled the token. The
  resident's sole feedback was the server's `TURNSTILE_FAILURE_MESSAGE`, which says
  "complete the challenge and try again" about a challenge that is not on the page and
  never will be — leaving all 10 surfaces permanently unsubmittable with instructions
  impossible to follow. `TurnstileWidget` now tracks an `unavailable` flag set by both the
  script-load rejection and `error-callback`, rendering a `role="alert"` banner plus a
  **Try again** button; the fix lives entirely in the widget, so all 10 call sites (9
  public forms + `LoginForm`) got it with no call-site change. Three things not to undo:
  (1) **Try again bumps an `attempt` counter the mount effect keys on**, re-running script
  load and render — `window.turnstile.reset()` cannot recover a script that never loaded,
  which is the more common failure; (2) the success `callback` clears `unavailable`,
  because Cloudflare retries most errors itself (`retry: "auto"`) and a self-healed widget
  must stop accusing itself; (3) `expired-callback` deliberately does **not** raise the
  banner — an expiring token is the widget working, and it refreshes itself. A missing
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` also deliberately raises no banner: that is
  development-only, where the server-side bypass keeps the form working, so there is
  nothing to tell the resident. The banner carries its own `bg-danger-soft` /
  `text-danger-soft-fg` pill rather than `InlineAlert`'s bare `text-danger`, because it
  renders inside the **dark** newsletter card as well as the light forms. Error **110200**
  is the code to recognise: the hostname is not on the site key's allow-list — what the
  real key returns on `localhost` (confirmed in-browser, and why `.env.example` documents
  the always-pass test keys), and equally what a key rotated without a rebuild looks like.
  **`waitForLoadState("networkidle")` is unusable on any page carrying a form**: the
  widget holds a `blob:` request open for the page's lifetime, so idle never arrives
  (measured — ~700ms with `challenges.cloudflare.com` blocked, never otherwise). That had
  silently killed `site.spec.ts`'s "the home page produces no CSP violations" test since
  Turnstile shipped: it timed out at 30s on the wait and **never reached its assertion**.
  It now waits for `window.turnstile` to be defined — the CSP-sensitive condition it
  actually cares about, since that proves Cloudflare's cross-origin script was allowed to
  load *and* execute — with the timeout caught so a keyless environment still runs the
  assertion. Re-verified as a real guard by inducing a violation, per this repo's own "a
  guard that has never been seen to fail is not a guard" rule. Neither new
  `turnstile.spec.ts` test submits anything, so that spec spends **no** rate-limit budget
  and is safe to re-run. **Fixed 2026-07-28:** all
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
- **`NewsletterForm` is no longer rendered anywhere, and that moved a Turnstile
  assumption** (2026-08-05, both removals on request). `SiteFooter` used to open with a
  rounded "Stay Notified" panel wrapping `<NewsletterForm variant="inline" />`, and
  `NewsSidebar` closed with the `variant="card"` version of the same form (its own "Stay
  Notified" heading); both are gone — the footer now starts at the four link columns, and the
  `/announcements` rail ends at Emergency Hotlines. **The component, both its variants, and
  `subscribeToAlerts` are all still in the repo, simply unreferenced**, deliberately kept
  rather than deleted in case signup returns somewhere else; the practical effect is that
  **the public site has no alert-signup entry point at all**, so `alert_subscribers` stops
  gaining rows. Nothing dispatches to that table anyway (see the baseline's own §note), so
  this costs a collection path, not a working notification feature. `subscribeToAlerts`
  remains a live public Server Action with no UI in front of it — still Turnstile-gated and
  rate-limited like the other seven, so it is an orphan, not a hole. **The consequence worth
  knowing is in the tests, not the UI:** that footer instance was the reason a Turnstile
  widget mounted on every public page, so `site.spec.ts`'s "the home page produces no CSP
  violations" test could prove Cloudflare's cross-origin script was allowed to load *and*
  execute. The home page now mounts no widget at all, which (a) makes
  `waitForLoadState("networkidle")` usable there again — the blob: request that made it hang
  forever is gone, so that test is back on the plain idle wait — and (b) would have quietly
  reduced that test to proving nothing, the exact failure mode the previous fix existed to
  correct. The Cloudflare-script check therefore moved to its own test against `/contact`
  (verified to clear in ~3s, i.e. actually resolving, not falling through its 15s catch).
  `turnstile.spec.ts`'s rejected-site-key test also counted **2** banners on `/contact` (the
  inquiry form's plus the footer's) and now expects **1**. `next.config.ts`'s CSP comment
  claiming the Cloudflare directives are exercised sitewide was corrected for the same reason.
- **The site has no social links at all** (2026-08-05, on request). `SOCIAL_LINKS` in
  `src/constants/site.ts` and the `SocialLink` interface in `src/types/index.ts` are
  **deleted**, not emptied — an empty array would have left two render blocks silently
  drawing nothing. Both consumers lost their markup too: `SiteFooter`'s icon row under the
  seal/description column (the description `<p>` dropped its now-dangling `mb-6`) and
  `ContactDetails`' entire "Follow Us" section including its `border-t` divider. The
  barangay's real Facebook page is `https://www.facebook.com/brgy.onse.san.fernando` if a
  link is ever wanted back; the other three entries (Twitter, YouTube, Messenger) were
  always `href="#"` placeholders and have no real destination to restore.
- `/announcements` is a 3-item News teaser (newest featured + 2 grid cards) with a sidebar
  (`NewsSidebar` shows Announcements + Emergency Hotlines; its newsletter signup was removed
  2026-08-05 — see the `NewsletterForm` bullet above). `/news`
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
- **The Home, Transparency and Officials heroes share one full-bleed photo-background
  treatment** (2026-08-06, on request — transparency first, home matched to it in the same
  session; **officials joined 2026-08-08**, same request, same formula).
  `TransparencyHero` replaced an `lh3`-hotlinked stock image in a right-hand column with a
  real barangay-office photo (staff reviewing records, bundled — see the "Placeholder
  reality" bullet's static-import list) rendered `fill` in a `-z-10` layer spanning the whole
  section, and its copy widened to a single `max-w-2xl` block. `HomeHero`'s `HeroCarousel`
  already sat behind its copy but was scoped to a `Container`-width card with an all-edge
  `mask-image`; it now renders as a direct child of the `<section>`, full-bleed, and the card
  padding (`p-6 sm:p-10 lg:p-14`) came off the copy grid so the text starts at the Container
  gutter like transparency's. **Both stay on the light theme** — `text-ink-900`/`text-ink-600`
  type, `variant="soft"` badge, default amber button — because the photo carries a white wash
  rather than the dark scrim `AuthLayout` uses. **That wash is one formula written in two
  files and they are meant to stay identical:** a flat `bg-white/82` below `md`, a
  left-weighted `from-white/88 (20%) → via-white/72 (55%) → to-white/20` gradient at `md`+ so
  the copy sits under the heavy end while the photo reads through on the right, plus two 28px
  `inset-x-0` top/bottom fades to solid white. Those numbers were lowered from
  `/90` and `/95 → /88 → /45` on request the same day ("less white'ish") — the photos now
  read clearly rather than sitting behind a veil, so **this is near the legibility floor for
  `text-ink-600` body copy, not a starting point to keep cutting from**. The mobile veil is
  deliberately ~10 points heavier than the desktop gradient's midpoint: below `md` there is
  no gradient, so the entire copy block — body copy included — sits over whatever the photo
  happens to be doing there, which is the worst case in the whole layout. Those fades are what a full-bleed hero needs
  and a `PageHero` doesn't: there is no page background left showing at the boundaries, so
  without them the floating header and the next section butt against a hard photo edge. Both
  heroes dropped the `grid-bg` texture and `bg-radial-fade` glow every other page hero
  layers — invisible under a photo, and only noise once washed. Three things not to undo:
  (1) **`HeroCarousel` is not `-z-10`** (transparency's static layer is) — its dots and
  hover-pause need pointer events, which is the standing reason `HomeHero`'s copy wrapper is
  `pointer-events-none` with only its text column `pointer-events-auto`; (2) the dots moved
  into their own `Container` with a `-ml-1.5` cancelling the buttons' padding, so they line
  up with the copy's left edge instead of the viewport's, and the copy grid keeps its
  `pb-20 sm:pb-24` purely as their clearance; (3) `sizes` went from
  `(min-width: 1280px) 1200px, 100vw` to a plain `100vw`, since the 1200px was describing the
  card width that no longer exists. Legibility depends on the gradient's stops matching the
  copy column's width — move them together, and re-check at 1440px and 390px, the two widths
  all three heroes were measured at.
  **`/officials` is the third one, and it is the only page that left `PageHero` to get it**
  (`src/features/officials/components/officials-hero.tsx`, 2026-08-08 — the shared `PageHero`
  is untouched and every other inner page still uses it). Its photo is the council's group
  portrait (`src/images/officialimagebg/officialgrouppicture.png`, bundled like the other
  three static imports), and the four wash/fade layers are copied from `TransparencyHero`
  verbatim — the same one formula, now written in three files. Two things differ from the
  `PageHero` it replaced, both forced by the wash rather than chosen: the copy is
  **left-aligned at `max-w-2xl`** instead of centered at `max-w-3xl` (a centered block runs
  out past the gradient's 55% stop into the part of the photo that reads through, so the copy
  column has to sit inside the heavy end), and the `grid-bg` texture plus radial glow are
  dropped for the same reason the other two dropped them. The heading keeps its
  `text-5xl`/`md:text-6xl` `BrandStroke` treatment and its original copy — nothing was
  reworded. `object-position` is **`center 20%`, not the other two heroes' `object-center`**:
  the section is ~3.8:1 while the source is 16:9, so `object-cover` crops vertically and
  centering slices the group off at the shoulders (seen in-browser before the fix); 20% keeps
  both rows' faces inside the visible band. Re-derive that number if the photo is ever
  swapped — it is specific to where the faces sit in this one file.
- Placeholder reality: transparency documents now serve **real** Supabase-hosted PDFs/images,
  so the old `"#"` download stubs are gone; Contact's "Get Directions" now links to the
  barangay hall's real Google Earth location (the dead FOI Guide and More Statistics CTAs
  were removed outright rather than wired). The Services page's `HelpSection` had a third
  such dead button — "Download All Forms", no `href` at all — deleted 2026-08-05 on the same
  principle; "Message Help Desk" is now that strip's only action, and there is no
  bulk-forms download anywhere on the site to restore it to. The home page's "Get Involved"
  CTA went the same day, but for a different reason: it was a **working** `/contact` link,
  removed on request, not for being dead. That left `CtaBanner`
  (`src/components/sections/cta-banner.tsx`) with no actions at all — its `actions` prop is
  now optional, and it drops both the action row's wrapper and the description's `mb-8` when
  omitted, so a copy-only banner keeps no dangling gap. `GetInvolvedSection` is still its
  only consumer. Remaining `"#"` hrefs are in-page anchors /
  not-yet-wired links (captain message, hero CTA). The
  barangay hotline is **real** (`(077) 600 1082` in `SITE.phone` / `EMERGENCY_HOTLINES[0]`)
  and the officials page's 24/7 Action Center dials it rather than 911; other phones, emails,
  and office hours are still placeholder-shaped (correct names, not real contact data). The two
  service-directory rows added for the request-flow work (`social-services-assistance`,
  `set-an-appointment`, migration `0035`) are on the same real-content footing as the hotline —
  live catalog entries routing to working forms, not placeholders standing in for something
  still to come. Most
  images are hotlinked from `lh3.googleusercontent.com` (allow-listed in `next.config.ts`)
  and must eventually move to owned Storage (`public-media` exists). The home hero carousel and
  the About history images moved to `public-media/site/` in sub-project 9 (`0021`); like
  `src/images/officials/`, the files in `src/images/carousel/` now stay in the repo only as the
  source for `scripts/upload-site-images.mjs`, not as an app dependency. The remaining bundled
  static imports are the barangay seal (`src/images/logo/`, `SITE.sealImage`), the barangay
  map (`src/images/map/san-fernando-map.png`, `MAP_IMAGE` on the contact page), the admin
  login photo (`src/images/loginpageImage/TrickOrTreat.jpg`), the transparency hero photo
  (`src/images/transparencyimage/transparencyImage.png`, 2026-08-06) and the officials hero
  photo (`src/images/officialimagebg/officialgrouppicture.png`, 2026-08-08) — all five
  bundled deliberately, on the same reasoning: one file each, no admin surface, changing only
  when the thing they depict does.
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
- **The barangay's sub-divisions are Sitios, not Puroks** (renamed 2026-08-05) — any
  "Purok"/"Puroks" appearing in `src/` or `tests/` is a regression. It was never a data
  model, only user-facing copy: the four public ticket forms' and four walk-in forms'
  address label/placeholder ("Sitio / street address", `placeholder="Sitio 1, Barangay San
  Fernando"`), the complaint location placeholder, `addressField`'s Zod message in
  `src/lib/public-forms.ts` plus the four admin actions' own address messages, and
  `SITE_ICON_OPTIONS`' `layout-grid` label in `src/lib/icon-map.ts`. No column, enum or key
  ever carried the word. **The applied migrations were deliberately not retro-edited** (they
  are historical records, and rewriting them changes nothing in a database that already ran
  them), so `0007`/`0009`/`0021` still read "Purok" — only
  `supabase/baseline/0000_baseline_2026-07-23.sql` was updated, so a *fresh* environment
  seeds `Sitios`/`Active Sitios`. **Existing environments keep the old label in the DB until
  someone edits it**: the Home page's fourth glance stat is a `site_items` row
  (`glance_stats`, sort 3), so it is fixed through Site Content in the admin portal, per the
  "Home and About are database-backed content" rule — on staging *and* production, separately.
  The `0007`/`0009` demo seeds (an announcement about "Puroks 4 and 5", two legislative
  document summaries) are placeholder content on the same portal-edit footing.
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
