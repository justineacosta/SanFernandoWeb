# Backend Handoff — Barangay San Fernando Website

> **Current status (2026-07-28):** backend integration is well underway on **Supabase**
> (Postgres + Auth + Storage) — migrations `0001`–`0028` are applied to **both staging and
> production**, and production's deployed code is current with `main` (including the media
> bucket split's required `migrate-media-buckets.mjs` / `upload-site-images.mjs` run on both
> environments). Auth, the services catalog, all four ticket flows, news/announcements/events,
> transparency (documents + projects, multi-file + optional dates), the officials directory,
> each official's achievements timeline, inquiries + alert subscribers, anonymous site
> feedback, and the Home/About CMS are DB-backed and live in production. See **§1 Current
> State** for the accurate live picture; the dated blockquotes below are a running changelog
> and are left as historical record — where a blockquote says a migration is "staging only"
> or "still needs production," that has since been resolved (all migrations through `0028`
> are on production as of 2026-07-28) — and the original "fully static" framing that follows
> describes the *starting* point, not today.

> Snapshot of the frontend as of **2026-07-11**, written as the starting brief for backend
> development. The frontend is complete, fully static, and every piece of content that the
> backend will eventually own is isolated in typed `data.ts` files — the integration work is
> "replace constants with fetches," not a refactor.
>
> **Updated 2026-07-12:** the site was fully re-skinned to the **amber + ink** design system
> (spec: `docs/superpowers/specs/2026-07-11-amber-ink-reskin-design.md`). This was a pure
> visual change — all routes, data files, types, and form contracts below are unchanged.
> The `TopBar` component was deleted (hotline/hours moved to the footer) and the header is
> now a fixed floating pill (client component).
>
> **Updated 2026-07-12 (later the same day):**
> 1. `/transparency` gained collapsible **Ordinances & Resolutions** tables
>    (`LegislativeSection` + `LegislativeDocument` entity — see §2 and the API surface in §4;
>    spec: `docs/superpowers/specs/2026-07-12-legislative-tables-design.md`).
> 2. Site identity switched from the "Barangay Sampaguita" design placeholder to the real
>    **Barangay San Fernando, San Nicolas, Ilocos Norte**: official emails are now
>    `@sanfernando.gov.ph` / `info@brgy-sanfernando.gov.ph`, phone placeholders use the
>    Ilocos Norte `(077)` area code, and "City …" office references became "Municipal …"
>    (San Nicolas is a municipality). ⚠️ Phone numbers, emails, and office hours are still
>    **placeholder-shaped** — collect the real values before launch.
> 3. `npm run lint` was restored via the ESLint CLI (`eslint.config.mjs` flat config) after
>    Next 16 removed `next lint`. Both tables also gained empty-state rows and
>    screen-reader-differentiated Download links.
>
> **Updated 2026-07-13:** the home hero was rebuilt as a full-panel **auto-sliding photo
> carousel** (`HeroCarousel` client component; edge-faded image layer with a left white
> wash; 3s cross-fade, dot controls, hover/focus pause, reduced-motion guard). It went
> through three same-day iterations (specs: `2026-07-12-hero-carousel-design.md`,
> `2026-07-12-hero-redesign-design.md`, `2026-07-12-hero-fade-design.md`). Slides are
> **real barangay photos** bundled from `src/images/carousel/` via static imports —
> `HeroSlide.src` is `StaticImageData | string`, so a future API should return image URLs
> from owned storage. `EmergencyHotlinesCard` was removed from the hero (the shared
> component and `EMERGENCY_HOTLINES` in `constants/site.ts` remain; hotlines still render
> in the news sidebar and footer).
>
> **Updated 2026-07-13 (later the same day):** real branding assets landed as static
> imports. The **barangay seal** is now `src/images/logo/BarangaySFLogo.png`, wired as
> `SITE.sealImage` (header, footer, admin sidebar) and downsized into the favicon at
> `src/app/icon.png` (App Router icon convention; regenerate it if the seal changes —
> circular crop, 256px). The **Punong Barangay** is the real official, **Hon. Dominic B.
> Dela Cruz**, with his bundled portrait from `src/images/officials/` used in both
> `features/officials/data.ts` and the About-page `CAPTAIN` block; `Official.photo` is now
> `StaticImageData | string`. Later the same day the **full officials directory went real**:
> all 12 officials (PB, 7 Kagawads, SK Chairman, Secretary, Treasurer, and a new
> **Barangay Administrative Assistant** role) now use real names and bundled portraits from
> `src/images/officials/`; their emails/phones remain placeholder-shaped, now on the (077)
> area code. The Administration block in `LeadershipDirectory` is a wrapping flex row that
> centers an odd last card, so any number of admin staff lays out correctly. An unused
> `BagongPilipinasLogo.png` also sits in `src/images/logo/`. Like the carousel, a future
> API should serve these as image URLs from owned storage.
>
> **Updated 2026-07-13 (evening):** first pass of **verified real content** landed, sourced
> from the barangay's official **Ecological Profile / Barangay Development Plan** PDF (the
> authoritative content source for stats and programs — get a copy from the barangay when
> seeding the CMS; spec: `docs/superpowers/specs/2026-07-13-ecological-profile-content-design.md`):
> 1. About **history timeline** is now two verified entries (1733 founding per *History of
>    San Nicolas* by Atty. Manuel F. Aurelio; a "Today" profile entry) using bundled images
>    (barangay seal + a carousel photo). `TimelineEntry.image` is now
>    `string | StaticImageData` with an optional `imageFit` (`"contain"` for the seal).
> 2. About **"Community Milestones" became "Community Programs"** — three documented
>    programs (weekly clean-up drive, 100% waste segregation, canal-rehab flood mitigation)
>    with source citations in `meta` instead of invented awards.
> 3. `/services` gained a **`WasteScheduleSection`** (new `WasteCollectionSlot` type +
>    `WASTE_SCHEDULE` in `features/services/data.ts`): perishables Wed & Sun AM,
>    non-perishables Fri.
> 4. Mission/vision typos fixed; home land-area stat corrected to **8.95 ha** (⚠️ the PDF
>    itself says "8.95 hectares (0.895 sq. km)" — internally inconsistent; 8.95 ha was
>    adjudicated correct from the barangay map and population density. Confirm with the
>    barangay before using either figure elsewhere).
> 5. The announcements hero was renamed **"News Hub"** (was "Civic Hub").
> Still placeholder: captain's quoted message (§6 item 6), all contact data, document
> `fileUrl`s, and the remaining Google-hotlinked images.
>
> **Updated 2026-07-13 (admin buildout):** the four `/admin` placeholder stubs became
> interactive mock screens (spec: `docs/superpowers/specs/2026-07-13-admin-dashboard-buildout-design.md`),
> plus a new **Ordinance & Resolution** section at `/admin/legislative`. Each section is a
> client "manager" over typed seed data in `features/admin/data.ts` that **wraps the same
> records the public site renders** (services, home events, news articles, transparency
> ordinances/resolutions) in admin envelope types — `AdminServiceRecord`, `AdminEventRecord`,
> `AdminNewsRecord`, `AdminLegislativeRecord` in `src/types/index.ts` — alongside
> `*FormValues` types that define the future POST/PUT body shapes. Search, filters,
> pagination, and drawer create/edit forms all work client-side; saves are faked (toast, no
> persistence). Still unprotected + `noindex` — auth remains work item E1.
>
> **Updated 2026-07-14 (applications CMS):** new **Certificate Applications** section at
> `/admin/applications` (spec: `docs/superpowers/specs/2026-07-14-admin-applications-cms-design.md`).
> Unlike the other managers it introduces a first-class transactional entity —
> `AdminApplicationRecord` in `src/types/index.ts`, referencing the public services catalog
> by `serviceId` FK — plus `ApplicationFormValues` (submission POST body) and
> `ApplicationReviewValues` (approve/reject PATCH body). Approve/reject and walk-in
> encoding mutate **React session state only** (a refresh resets them); saves are
> toast-faked like the rest of the portal.

> **Updated 2026-07-15 (auth foundation):** `/admin` is now behind real Supabase Auth
> (spec: `docs/superpowers/specs/2026-07-15-backend-integration-design.md`). Middleware
> guard + `(portal)` route group; `/admin/login`; SuperAdmin + per-user permission
> checkboxes (`profiles` table, unique email), team management in Settings
> (SuperAdmin-only), and a real `audit_log` feeding Publishing Activity. Work item E1
> is DONE. `ADMIN_USER` seed remains only where later plans replace it (applications
> reviewer name); `ADMIN_TEAM`/`PUBLISHING_ACTIVITY` seeds are now unused. Migrations
> live in `supabase/migrations/`; env contract in `.env.example`.

> **Updated 2026-07-16 (account self-service):** Settings is now reachable by every
> signed-in admin user (spec: `docs/superpowers/specs/2026-07-16-account-self-service-design.md`).
> Users edit their own **name + cellphone** (new `profiles.phone`, migration 0003) and
> **change their own password** (current-password verified, min 10); password fields and the
> login page have show/hide **eye toggles**. **Manage Users** (renamed from "Team") renders
> only for SuperAdmins. A SuperAdmin **cannot demote themselves** (UI lock + server guard);
> **email is never self-editable** — only a SuperAdmin edits *others'* emails (via the auth
> admin API, unique constraint enforced). Photo upload is still deferred to the media plan
> (initials badge + "coming soon"). Mock 2FA toggle removed.

> **Updated 2026-07-17 (applications flow):** residents can now apply online for a
> certificate/clearance and track it — the whole loop is DB-backed end to end (plan:
> `docs/superpowers/plans/2026-07-16-applications-flow.md`). New `applications` table
> (`supabase/migrations/0005_applications.sql`) plus `next_ticket_number(prefix)`, a
> per-prefix, per-year counter serialized through `INSERT .. ON CONFLICT DO UPDATE` so
> concurrent submissions can't collide; tickets read **`APP-2026-00001`** (Asia/Manila
> calendar year, 5-digit zero-padded sequence — plan 2C reuses the same function for
> APT-/CMP-/AST- prefixes). `/services/apply/[slug]` is the public application form,
> DB-backed via `getApplyService()`; the routing rule is **tone-based** — only services
> with `tone === "primary"` route here, `tone === "danger"` (currently only
> `blotter-complaints`) is the **complaint** flow deferred to plan 2C and its CTA stays
> inert. `/track` looks up a ticket by number + last name; the last name is deliberately
> matched in JS rather than in the query — PostgREST reads an `ilike` value as a LIKE
> pattern, so a stray `%` (or `*`, which PostgREST rewrites to `%`) would have matched
> every surname and turned a guessed ticket number into a privacy leak. `/admin/applications`
> now reads and writes the same table: **approve → release**, or **reject** (both actions
> attributed to the acting user; rejecting requires remarks), plus **walk-in encoding**
> into the same queue. `applications` has RLS enabled with **no policies at all** — neither
> anon nor authenticated can touch it directly; every read and write, public and admin,
> goes through the service-role client after an explicit permission check in code, so the
> privacy gate lives in one reviewable place rather than in a row policy. The public
> endpoints share `src/lib/rate-limit.ts`, an in-memory sliding-window limiter — a real
> speed bump against naive enumeration, but explicitly a placeholder for the hardening
> plan (spec §12 step 8) to replace with a durable store. Now that the DB owns both
> catalogs, the mocks it replaced were deleted: `ADMIN_APPLICATIONS`, `CERTIFICATE_SERVICES`,
> `certificateTitle()` (this plan) and `ADMIN_SERVICES`/`MOCK_SERVICES` (dead since the
> services-catalog-DB plan, cleaned up in the same sweep) from `features/admin/data.ts`,
> plus the `AdminApplicationRecord`, `ApplicationFormValues`, and `AdminServiceRecord`
> types they used from `src/types/index.ts`. `ApplicationReviewValues` remains — the
> review actions and drawer still use it.

> **Updated 2026-07-17 (ticketing flows):** three more resident request flows join
> applications as DB-backed end to end (plan:
> `docs/superpowers/plans/2026-07-17-ticketing-flows-2c.md`). New tables
> (`supabase/migrations/0006_ticketing_flows.sql`): **`appointments`** (`APT-` prefix),
> **`complaints`** (`CMP-`), **`assistance_requests`** (`AST-`, referencing a new
> **`assistance_categories`** SuperAdmin-managed picker seeded with medical/financial/
> burial/calamity/other). All three reuse `next_ticket_number()` and, like
> `applications`, have RLS enabled with **no policies at all** — every read and write
> goes through the service-role client after an explicit permission check in code. A
> new **`tickets_view`** (`union all` over all four ticket tables, common columns
> only — a complaint's narrative, respondent, and location are structurally absent
> from it, not merely filtered) backs `/track`; it is declared
> `with (security_invoker = true)` because a default Postgres view runs with its
> owner's privileges and would bypass the tables' RLS, handing anon every ticket in
> the barangay — `security_invoker` makes it run as the querying role instead, so
> the no-policy RLS keeps denying anon and authenticated (a `revoke` from both is
> belt-and-braces on top). Three new public routes: `/appointments/new` (preferred
> date + AM/PM only — there is no slot calendar, so staff confirm that slot or
> propose a different one), `/complaints/new` (its own form, gated by the
> `blotter-complaints` service row's `is_available` toggle — the same row whose
> `tone === "danger"` already routed its service-card CTA away from
> `/services/apply/[slug]`), and `/assistance/new` (category picker
> sourced from `assistance_categories`; shows an unavailable notice if every
> category is retired). Each ends in an on-screen ticket-number receipt — **and now also an
> emailed one**, when the resident gave an email address (§2D's Plan 2,
> `docs/superpowers/plans/2026-07-30-resend-email-remaining-triggers.md`, shipped
> 2026-07-30 — see item 6 below).
> Three
> new admin queues mirror `/admin/applications`'s pattern: `/admin/appointments`
> (confirm/reschedule/decline, then mark completed; permission
> `process-appointments`), `/admin/complaints` (take up for mediation, then resolve
> or dismiss; permission `handle-complaints`), `/admin/assistance` (take up for
> review, then grant or decline; permission `handle-assistance`) — all three also
> support walk-in encoding. A new **SuperAdmin category editor**
> (`AssistanceCategoriesPanel`) sits at the bottom of `/admin/services`: add,
> rename, reorder, and retire categories via `is_active` (never delete — past
> requests keep their category label). `/track` now resolves all four ticket kinds
> through `tickets_view`; a complaint result shows **status only** — its narrative,
> respondent, and location never reach the public page.

> **Updated 2026-07-18 (news, announcements & events):** the last three mock content
> types are now fully DB-backed and admin-authored, with a shared photo pipeline
> (plan: `docs/superpowers/plans/2026-07-18-news-content-management.md`). New tables
> (`supabase/migrations/0007_news_content.sql`): **`news_articles`** (full posts,
> `slug`-addressable), **`news_photos`** (0–3 per article), **`announcements`**
> (short dated notices, one optional image), **`events`** (one optional cover), and
> **`news_categories`** (a SuperAdmin-managed picker, seeded governance/health-wellness/
> environment/community/public-safety/advisory/infrastructure, retired via `is_active`
> like `assistance_categories`). All five have RLS enabled with **no policies at
> all** — same pattern as the ticket tables: every read and write goes through the
> service-role client after an explicit permission check in code, and public pages
> additionally filter `status = 'published'` explicitly. Content moves through
> **`draft → in-review → published → archived`** — there is **no scheduling
> feature**; the old mock's `scheduled` status is gone. `published_at` is set once,
> on the first transition into `published`, and drives newest-first ordering and the
> auto "NEW" badge (within 7 days). Migration **0008** (`0008_refresh_seed_event_dates.sql`)
> repoints the four seeded demo events onto dates relative to whenever it's applied
> (`current_date + 7/12/18/25`), because the original mock dates were already in the
> past and `listUpcomingEvents()` correctly filters to `event_date >= today` — without
> the refresh the home page's "Upcoming Events" column would render empty on a fresh
> apply. New public route **`/announcements/[slug]`** (`getPublishedArticleBySlug()`)
> renders a full article with a count-based photo gallery + lightbox (`NewsGallery`);
> `/announcements` itself now reads real DB pagination (`listPublishedArticles()`,
> 1 featured + 6 per page, link-based pager — the old "LOAD MORE NEWS" button is
> gone) and the newest published article is always the featured hero — the old mock's
> manual `featured` flag is gone too. The home board (`CommunityPulseSection`) and the
> news sidebar (`NewsSidebar`) both now read live from `listPublishedAnnouncements()` /
> `listUpcomingEvents()` instead of `features/home/data.ts` constants. New admin
> surface: **`/admin/news`** (`NewsManager` — tabbed News / Announcements card grids,
> search/category/status filters, drawer editors backed by real Server Actions, photo
> uploader; SuperAdmin-only `NewsCategoriesPanel` renders beneath it, mirroring
> `AssistanceCategoriesPanel`) and **`/admin/events`** (`EventsManager`, now DB-backed).
> **Both are gated by the `manage-news` permission** (`requirePermission("manage-news")`
> in each page file; same permission on both nav entries in `ADMIN_NAV_ITEMS`).
> **Supabase Storage** is in use for the first time: a public bucket **`public-media`**
> (public-read via the one RLS policy this migration adds — `storage.objects` is the
> only table in Plan 3 that gets a policy at all; every other table stays policy-free).
> Images are capped at **2MB**, restricted to **JPEG/PNG/WebP**, validated **both**
> client-side (`NewsPhotoUploader`, `SingleImageUploader`) and server-side (the upload
> Server Actions re-check type and size, never trusting the client). News photos cap
> at **3 per article**, enforced in the Server Action rather than a DB constraint.
> Thumbnail reordering uses accessible **up/down buttons**, not drag-and-drop
> (deliberate — avoids a drag-and-drop dependency; new photos can still be dropped
> onto the dropzone). Announcement and event images now go through the same
> `SingleImageUploader` widget — the "URL field pending an upload widget" gap once
> planned for these never shipped that way; there's no free-text URL field. The seed
> rows (3 articles' worth of photos, 1 announcement image) keep their original `lh3`
> URLs rather than being re-hosted — `photoUrl()` passes a full `http(s)` URL through
> unchanged and only resolves bare storage paths, so seed and uploaded images render
> side by side. The real barangay hotline landed alongside this plan: `SITE.phone`
> and the `EMERGENCY_HOTLINES` "Barangay Hotline" entry are now **`(077) 600 1082`**;
> the other hotline entries are still placeholder-shaped. Mock content arrays are
> gone: `features/home/data.ts` no longer carries announcements/events, and
> `features/announcements/data.ts` was deleted outright (only `queries.ts` and
> `components/` remain) — content is now edited exclusively through `/admin/news`
> and `/admin/events`. `ADMIN_NEWS`/`ADMIN_EVENTS` and the `AdminNewsRecord`/
> `AdminEventRecord`/`NewsFormValues`/`EventFormValues` types they used are deleted
> from `features/admin/data.ts` / `src/types/index.ts`, replaced by
> `NewsArticleListItem`/`NewsArticleDetail`/`NewsPhoto`/`NewsCategoryRow` (public) and
> `AdminNewsArticleRow`/`AdminAnnouncementRow`/`AdminEventRow`/`NewsArticleValues`/
> `AnnouncementValues` (admin) in §2. The old mock `NewsArticle` type in
> `src/types/index.ts` is now dead code — nothing imports it — since the public feed
> renders `NewsArticleListItem`/`NewsArticleDetail` instead; it wasn't removed this
> plan and is worth deleting in a follow-up sweep. ~~**Still remaining**: the seeded
> demo images are still hotlinked from `lh3.googleusercontent.com` — migrating them
> to owned `public-media` storage is future work, same as every other still-hotlinked
> image on the site (§3D, §6).~~ **DROPPED 2026-08-10** — they stay hotlinked; see §3D.

> **Updated 2026-07-20 (transparency documents):** every content block on
> `/transparency` — ordinances & resolutions, budget/financial documents, and project
> monitoring — is now DB-backed end to end (plan:
> `docs/superpowers/plans/2026-07-20-transparency-documents.md`; spec:
> `docs/superpowers/specs/2026-07-20-transparency-documents-design.md`). New migration
> **`0009_transparency.sql`** adds four tables — **`legislative_documents`**,
> **`transparency_documents`**, **`transparency_projects`**, and a SuperAdmin-managed
> **`transparency_categories`** picker (financials/legislative/projects/awards, retired
> via `is_active` like `news_categories`/`assistance_categories`) — all RLS-enabled with
> **no policies at all**, same pattern as every other content table: every read and
> write goes through the service-role client after an explicit permission check in code.
> A second public Storage bucket, **`public-documents`**, holds PDFs separately from
> `public-media` because the size caps differ — **10MB** per PDF (`MAX_PDF_BYTES` in
> `src/lib/storage.ts`) vs. 2MB for images — and keeping them in one bucket's upload
> actions invited applying the wrong limit. Two new public routes:
> **`/transparency/legislative`** (searchable, paginated archive with type filter —
> `LegislativeArchive`) and **`/transparency/legislative/[slug]`** (detail page with an
> inline `PdfViewer`, falls back to a "available at the barangay hall" note when no PDF
> is attached yet); `/transparency` itself is unchanged as a route but every section
> (`DisclosureGrid`, `LatestUploadsSection`, `LegislativeSection`) now reads live instead
> of `features/transparency/data.ts` constants. The admin surface moved from
> **`/admin/legislative` to a tabbed `/admin/transparency`** (`TransparencyManager` —
> Legislative / Public Documents / Projects tabs, the legislative tab reusing
> `LegislativeManager` against real `AdminLegislativeRow` data; a `TransparencyCategoriesPanel`
> renders beneath it for SuperAdmins only), gated by a new **`manage-transparency`**
> permission (its own nav entry in `ADMIN_NAV_ITEMS`, replacing the old ungated
> `/admin/legislative` entry). Notable implementation details:
> 1. **Next.js caps Server Action bodies at 1MB by default**, which silently
>    pre-empted the app's own 10MB PDF check. `next.config.ts` now sets
>    `experimental.serverActions.bodySizeLimit: "12mb"` to make the check reachable.
>    **This limit is global** — it also raises the accepted body size for every other
>    Server Action, including the public, unauthenticated contact/application/
>    appointment/complaint/assistance endpoints, which sit behind only the in-memory
>    placeholder rate limiter (`src/lib/rate-limit.ts`). Follow-up for the hardening
>    plan (build-order step 8): move PDF upload to a dedicated Route Handler with its
>    own limit so the other actions return to the 1MB default. `MAX_PDF_BYTES` in
>    `src/lib/storage.ts` and `bodySizeLimit` in `next.config.ts` must move together —
>    nothing in `storage.ts` points back at the config, so raising the constant alone
>    would silently reintroduce the original unreachable-cap bug.
> 2. **Middleware was truncating large upload bodies — fixed.** Uploads over ~10MB used
>    to fail with a crash screen ("Unexpected end of form") instead of the app's own
>    "The PDF must be 10 MB or smaller." message. The cause was **`proxyClientMaxBodySize`**
>    (10MB default): because `middleware.ts` matched `/admin/:path*`, Next buffered and
>    **silently truncated** the request body for admin Server Action POSTs, corrupting the
>    multipart stream before the action's own parser — and its own size check — ever ran.
>    It reproduced in a production build; it was never a dev-server artifact.
>    The matcher now excludes Server Action POSTs via the `Next-Action` header:
>    `[{ source: "/admin/:path*", missing: [{ type: "header", key: "next-action" }] }]`.
>    **This does not weaken auth.** Middleware only ever did two things — redirect
>    unauthenticated users and refresh the Supabase session — and neither is lost:
>    every admin page and every admin Server Action independently calls
>    `requirePermission(...)` / `requireSuperAdmin()` (`src/lib/auth.ts`), and because
>    `cookies()` is mutable inside a Server Action (unlike a Server Component), the
>    action's own Supabase client refreshes the session when it calls `getUser()`.
>    A forged `Next-Action` header therefore skips only the redirect convenience, never
>    the real gate. Header matching is case-insensitive (verified in Next 16.2.10's
>    `matchHas`), so the lowercase matcher key is correct.
>    *Not evaluated:* raising `proxyClientMaxBodySize` explicitly may be a simpler
>    config-only alternative — worth revisiting if the matcher exclusion ever causes
>    trouble. Note this fix is more general than the Route Handler follow-up in (1):
>    it protects every admin Server Action with a large payload, not just PDF upload.
> 3. **Uploads are deferred to Save.** `PdfUploader` is a pure file picker making no
>    network calls; the save Server Actions upload server-side and compensating-delete
>    the storage object if the row write fails, so "a storage object exists only if a
>    row references it" holds by construction. This replaced an earlier design that
>    uploaded on file-select and orphaned an object every time a drawer was cancelled.
> 4. **Optimistic locking on `file_path`** guards concurrent file replacements — applied
>    only when a new file is uploaded, so ordinary simultaneous text edits are
>    unaffected.
> 5. **Search-term escaping quirk:** PostgREST substitutes `*` for `%` in `ilike`
>    values even when the `*` is backslash-escaped, so a searched `*` matches a literal
>    `%` rather than a literal asterisk. Safe — no user input can expand into a
>    match-everything wildcard, verified against the live database — but semantically
>    imperfect; documented in `src/features/transparency/queries.ts`.
> 6. Seeded transparency content is placeholder, same caveat as the Plan 3 seed
>    content — still needs real PDFs attached and an editorial pass.
> 7. **`date_approved` is optional (migration `0010_legislative_date_approved_optional.sql`,
>    unapplied as of 2026-07-21 — the repo owner applies migrations herself).** An
>    ordinance/resolution can be uploaded before it's approved: the draft PDF, number,
>    and title exist ahead of the approval date. `LegislativeListItem`/`LegislativeDetail`/
>    `AdminLegislativeRow`/`LegislativeValues` all carry `dateApproved: string | null`;
>    the save action converts an empty form value to SQL `NULL` explicitly
>    (`normalizeDateApproved` in `src/features/admin/actions/legislative.ts`) so "pending"
>    has one representation, not two. Every list/table shows **"Pending Approval"** in
>    place of a date (`formatDateApproved()` in `src/lib/format.ts`). **Pending documents
>    sort first**, above approved ones — an explicit product decision, not just the
>    Postgres NULLS-FIRST-on-DESC default: every `.order("date_approved", ...)` call
>    (`listRecentLegislative`/`searchLegislative` in `features/transparency/queries.ts`,
>    `listAdminLegislative` in `features/admin/queries/transparency.ts`) now passes
>    `{ ascending: false, nullsFirst: true }`, and the two `date_approved desc` indexes
>    from `0009_transparency.sql` are recreated with `nulls first` in migration 0010.
> Mocks and dead types deleted this plan: `src/features/transparency/data.ts` in full
> (`HERO_IMAGE`, `BUDGET_DOCUMENTS`, `PROJECTS`, `LATEST_UPLOADS`, `ORDINANCES`,
> `RESOLUTIONS` — `HERO_IMAGE`'s value moved inline into `TransparencyHero`),
> `ADMIN_LEGISLATIVE` from `features/admin/data.ts`, and from `src/types/index.ts`:
> `LegislativeDocument`, `TransparencyDocument`, `ProjectStatus`, `AdminLegislativeRecord`,
> `AdminLegislativeStatus`, `LegislativeFormValues`, and the long-dead `NewsArticle`
> interface flagged in the Plan 3 entry above. `AdminLegislativeStatus` is also gone from
> the `StatusChip` status union (`AdminStatus`) — its values (`active`/`under-review`/
> `archived`) are already covered by `AdminServiceStatus`, `ComplaintStatus`/
> `AssistanceStatus`, and the newly-added `ContentStatus` respectively, so `AdminStatus`
> now unions in `ContentStatus` directly.

> **Updated 2026-07-21 (transparency enhancements):** documents and projects moved from
> one file to **up to 3 files each** (PDF or image, 10 MB each — `MAX_DOC_FILE_BYTES` /
> `MAX_FILES_PER_RECORD` in `src/lib/storage.ts`), dates on both became optional, and a
> new unified browse route landed (plan: `docs/superpowers/plans/2026-07-21-transparency-enhancements.md`;
> spec: `docs/superpowers/specs/2026-07-21-transparency-enhancements-design.md`). New
> migration **`0011_transparency_enhancements.sql`** (applied by the repo owner,
> 2026-07-21):
> 1. **`transparency_files`** — a polymorphic child table (`owner_type`:
>    `'document' | 'project'`, `owner_id`, `path`, `mime`, `size_bytes`, `sort_order`),
>    replacing the single `file_path`/`file_size_bytes` columns dropped from
>    `transparency_documents`. There is **no DB foreign key** on `owner_id` — it points at
>    two different parent tables — so referential integrity (no orphaned rows, no rows past
>    the ≤3 cap) is enforced entirely in application code: the save actions cap at 3 files
>    and the delete actions remove a record's file rows *and* storage objects
>    before/with the parent row. RLS is enabled with no policies, same pattern as every
>    other content table. `transparency_projects` files use the same child table with
>    `owner_type = 'project'`.
> 2. **Optional dates.** `transparency_documents.date_released` dropped its `NOT NULL`
>    (existing `(status, date_released desc)` indexes already order NULLS FIRST, so no
>    index change was needed), and `transparency_projects` gained a new nullable `date`
>    column. Both render **"Undated"** in place of a missing date on every public and
>    admin surface, mirroring the "Pending Approval" treatment `date_approved` got in
>    Plan 4.
> 3. **Multi-file save stays orphan-free.** Extending the Plan-4 "upload on Save, not on
>    file-select" pattern from a single file to a file *set*: the picker makes no network
>    calls, the save Server Action uploads all new files and compensating-deletes the
>    whole set from storage if the row/file-row write fails, so "a storage object exists
>    only if a `transparency_files` row references it" still holds by construction.
> 4. **`/transparency/uploads`** — a new public route unifying legislative documents,
>    transparency documents, and project files into one browsable, paginated list.
>    `searchUploads()` (`src/features/transparency/queries.ts`) fetches all three
>    published sources and unions/sorts/paginates them **in memory** rather than in a
>    single SQL query (they come from three different tables with different shapes).
>    Fine at current seed-data volume; revisit with a DB-side union/materialized view if
>    the combined row count grows large enough to make in-memory sorting expensive. This
>    route replaced the dead `listLatestPublishedDocuments()` query (removed this plan —
>    superseded by `listLatestUploads()` for the `/transparency` preview section).
> 5. **Sortable tables.** Column-header sorting landed client-side on the public
>    legislative archive table and the admin content tables (`SortableTh` in
>    `src/components/ui/`), and server-side (via query params) on the new
>    `/transparency/uploads` browse. Projects deliberately keep **manual drag-free
>    up/down `sort_order`** reordering instead of column sorting — progress tracking reads
>    better in a curated order than an alphabetically- or date-sorted one.
> Dead code removed this plan: the orphaned `src/components/shared/document-link.tsx`
> (unused since an earlier rewrite) and `listLatestPublishedDocuments()` in
> `src/features/transparency/queries.ts` (superseded by `listLatestUploads()`, see (4)
> above). The legislative archive page also picked up a UI-only clamp
> (`safePage = Math.min(Math.max(1, page), lastPage)` in `LegislativeArchive`) so a
> `?page=9999` URL shows "Page N of N" instead of "Page 9999 of N" — the query already
> clamped internally; this was a display-only follow-up flagged in the Plan 4 review.

> **Updated 2026-07-21 (officials directory):** the barangay officials directory moved
> off the hardcoded `OFFICIALS` array onto Supabase, the last content type to make that
> move (plan 6). New migration **`0012_officials.sql`** — **applied to staging only; still
> needs to be applied to production at deploy time** — adds an `officials` table (RLS
> enabled, no policies, same pattern as every other content table) seeded with all 12
> officials (executive 1, council 8, administration 3), all `published`, `sort_order`
> preserving the existing directory order. New public routes: `/officials` (unchanged URL,
> now DB-backed via `listPublishedOfficials()`) and a new **`/officials/[slug]`** detail
> page (`getPublishedOfficialBySlug()`, `src/features/officials/queries.ts`) — both exclude
> any row without a portrait as a belt-and-braces guard, since publishing already requires
> one. New admin surface **`/admin/officials`** (`src/app/admin/(portal)/officials/page.tsx`),
> gated by a new **`manage-officials`** permission (`src/features/admin/queries/officials.ts`,
> `src/features/admin/actions/officials.ts`; own `ADMIN_NAV_ITEMS` entry). The 12 portraits
> that used to be bundled static imports now live in Supabase Storage at
> `public-media/officials/`, uploaded by a one-time helper script
> (`scripts/upload-official-portraits.mjs`); `src/images/officials/` stays in the repo only
> as that script's source, not as an app dependency. **Unchanged:** the Punong Barangay's
> portrait is still a bundled static import, used by the About page's `CAPTAIN` block — that
> did not move. Also unchanged: all 12 officials have an **empty `bio`**, and emails/phones
> remain placeholder-shaped, pending real content from the barangay. The achievements
> timeline sketched in the master spec (§6) was deliberately deferred to a follow-up plan —
> not part of this work.

> **Updated 2026-07-21 (officials achievements):** each official's profile page now carries
> a lightweight achievements timeline — the piece the officials-directory entry above
> explicitly deferred (plan: `docs/superpowers/plans/2026-07-21-officials-achievements.md`;
> spec: `docs/superpowers/specs/2026-07-21-officials-achievements-design.md`). New migration
> **`0013_official_achievements.sql`** — **applied to staging only; production needs both
> `0012` and `0013` at deploy time** — adds two tables mirroring the established
> `news_articles` → `news_photos` shape: **`official_achievements`** (`title`,
> `description`, `date_label` — free text like "March 2024" or "Ongoing", not a real date,
> since ordering is owned by `sort_order`, not this field; `is_visible`, `sort_order`) and
> **`official_achievement_photos`** (`src`, `alt`, `sort_order`), cascading two hops —
> `officials` → `official_achievements` → `official_achievement_photos`, both `on delete
> cascade`. RLS is enabled with no policies on both tables, same pattern as everything else.
> Photos reuse the existing `public-media` bucket under a new `achievements/<achievementId>/`
> prefix (no new bucket), with the same 2MB/JPEG-PNG-WebP limits news photos use, capped at
> 3 photos per achievement and 20 achievements per official. Nine new Server Actions, all
> behind `requirePermission("manage-officials")`: `createAchievement`, `updateAchievement`,
> `setAchievementVisibility`, `reorderAchievements`, `deleteAchievement`
> (`src/features/admin/actions/achievements.ts`) and `uploadAchievementPhotos`,
> `reorderAchievementPhotos`, `updateAchievementPhotoAlt`, `removeAchievementPhoto`
> (`src/features/admin/actions/achievement-photos.ts`). The public boundary stacks on top
> of the official's own `status = 'published'`: an achievement only reaches
> `/officials/[slug]` when **`is_visible = true` and `title` is non-empty** — a freshly
> "added" achievement row starts blank (the photo uploader needs a stable id to attach
> uploads to before staff type anything), so an unfinished entry must never leak public.
> The filter is applied twice, deliberately redundant — once in the embedded-resource
> query and again in plain TypeScript (`src/features/officials/queries.ts`) — so a silently
> ignored embedded filter can't publish something the barangay hid. `/admin/officials`
> gained an achievements sub-list inside the existing drawer (`AchievementsEditor`,
> `AchievementPhotoUploader`): each achievement is its own card — title/date/description
> fields that save on blur, a visibility toggle, reorder arrows, delete, and its own
> 3-photo uploader — persisting per-field immediately, the same pattern `NewsManager`
> already uses for articles; a brand-new official shows "Save the official first to add
> achievements." until it has an id for achievement rows to attach to. Deleting an official
> now also sweeps its achievements' Storage photos before the row delete, for the same
> reason Plan 3's news-article delete does — the DB cascade removes the
> `official_achievement_photos` rows but has no idea Storage objects exist. Along the way
> the news-article lightbox was generalized and relocated:
> `src/features/announcements/components/news-gallery.tsx` is gone, replaced by
> `PhotoGallery` in `src/components/shared/photo-gallery.tsx` (a `variant: "feature" |
> "thumbs"` prop covers both the news-article grid+hero layout and the more compact
> achievements-timeline row), and the `NewsPhoto` type in `src/types/index.ts` was renamed
> **`GalleryPhoto`** — news and achievement photo lists now share one type. **No
> achievement content is seeded** — migration 0013 inserts no rows — so every official's
> timeline is empty until barangay staff add real achievements through `/admin/officials`.

> **Updated 2026-07-22 (portal overhaul — sub-projects 1 & 2):** the first two slices of a
> nine-part programme covering permission-gated 404s, fuzzy search, audit logs,
> transactional uploads, archive/restore, autosave, a Home/About CMS, and resident-portal
> fixes. Cross-cutting decisions and the sequence live in
> `docs/superpowers/specs/2026-07-22-portal-overhaul-design.md`; each sub-project has its
> own dated spec.
> 1. **Resident portal fixes** (spec: `2026-07-22-resident-portal-fixes-design.md`). The
>    `/announcements/[slug]` "Back to News" link was rendering *inside* the fixed
>    `SiteHeader`'s band — not partly obscured but fully occluded at 375px and 1440px, with
>    `elementFromPoint()` at its centre returning the header, so a mobile tap hit the site
>    logo and navigated home. The page now uses `pt-32 md:pt-44`, the clearance convention
>    §5 already documents and the officials/legislative detail pages already followed.
>    Separately, an audit of all 16 public routes at 375px found **exactly one** horizontal
>    overflow: `/about`, +8px, from the Punong Barangay name card's `-right-6` (24px)
>    overhang against `Container`'s `px-4` (16px) gutter. Pinned to `right-0` below `md`
>    (the overhang is deliberate and correct at `md+`, where the column is `w-1/3`). Fixed
>    at the source — **not** with a global `overflow-x: hidden`, which would break `sticky`
>    positioning site-wide and hide the next such bug. The dead
>    `href="#"` "View Executive Agenda 2024-2027" stub is gone.
> 2. **Permission-gated 404s** (spec: `2026-07-22-permission-404-gating-design.md`). A
>    staff member without a module's permission was redirected to `/admin`, which neither
>    looked like a missing page nor hid that the route existed. **The gates now split by
>    execution context:** `requirePermission` / `requireSuperAdmin` call `notFound()` for
>    page loads, rendering a new `src/app/admin/(portal)/not-found.tsx` *inside* the portal
>    layout so the sidebar still offers the modules the user can reach. Server Actions
>    cannot use the same gate — they are POSTs, and a thrown `notFound()` there surfaces as
>    an unhandled digest error rather than a 404 — so new **`checkPermission` /
>    `checkSuperAdmin`** return `null`, and all **86 gate call sites across 21 action
>    files** return `{ error: NOT_FOUND }` in their own result shape. `tsc` verifies every
>    one, since excess-property checks fire on direct returns. `requireSessionUser`
>    deliberately still redirects to `/admin/login`: a signed-out visitor may hold the
>    permission once authenticated. Also fixed a navigation leak found while mapping call
>    sites — `ContentHub` rendered all three `CONTENT_TYPE_ACTIONS` cards unconditionally,
>    so a user holding only `handle-complaints` saw News, Events, and Transparency cards on
>    the dashboard they land on after login; `ContentTypeAction` gained an optional
>    `permission` and the cards now filter on the same predicate `AdminSidebar` uses. The
>    `PUBLISHING_ACTIVITY` mock constant is still present and still dead — sub-project 3
>    removes it. **Note for future readers:** `src/middleware.ts` is a second auth layer
>    over the whole `/admin` tree and is easy to miss when reasoning about admin access.

> **Updated 2026-07-22 (audit logs v2 — sub-project 3):** migration **`0014_audit_log_v2.sql`**
> — **applied to staging by the repo owner, 2026-07-22; production still needs it** —
> turns the append-only activity feed from migration `0001` into a real audit log
> (spec: `docs/superpowers/specs/2026-07-22-audit-logs-v2-design.md`).
> 1. A **`public.audit_action` enum** (17 values) backs the required Action Type dropdown;
>    the free-text `action` column is kept alongside it as secondary human-readable detail.
>    Existing rows were backfilled from their `action` text. `action_type` is `NOT NULL`
>    with **no default** — `recordActivity()` is the only writer and must always classify.
> 2. **`entity_label`** captures the target's human name at *write* time. Resolving it at
>    read time would break exactly when the record is deleted, which is the case the trail
>    exists for — and master spec §4's "the audit log never points at a ghost".
> 3. **`recordActivity()` now takes an options object** (`{ type, action, entityType,
>    entityId?, entityLabel?, detail? }`); seven positional arguments were unreadable. All
>    **75 call sites across 20 action files** were converted, and `tsc` enforces the enum at
>    every one. `auditTypeForStatus()` in `src/lib/audit.ts` maps a
>    `draft → in-review → published → archived` transition to its action type for the four
>    managers that record `${nextStatus} <entity>`.
> 4. **Three coverage gaps closed.** `actions/auth.ts` had zero audit calls — sign-in and
>    sign-out are now recorded (a *failed* sign-in deliberately is not: it would let anyone
>    append rows to an append-only table). `actions/media.ts` had none — image upload and
>    delete are now recorded. `updateTeamUser` reads the prior grant and emits
>    **`role_change`** rather than a generic `update` when permissions or SuperAdmin status
>    actually changed. `actions/documents.ts` is deliberately **not** audited: every function
>    there is a step inside a larger save action that records its own entry, and
>    `removeStoredDocument` doubles as the compensating-delete path, so an entry from there
>    would claim a deletion for a save that failed. That reasoning is in the file.
> 5. **Immutability is enforced, not assumed**: `REVOKE update, delete` from `anon`,
>    `authenticated`, and `service_role`, plus `before update`/`before delete` triggers that
>    fire even for the table owner. Verified against the live database — `service_role`
>    itself gets `permission denied for table audit_log` on both, while INSERT still works.
>    Deliberate escape hatch: `alter table public.audit_log disable trigger …`.
>    **Consequence: no future migration can retro-edit audit rows without disabling the
>    trigger first.**
> 6. **`audit_log.actor_id`'s foreign key was dropped.** Migration `0001` declared it
>    `references auth.users (id) on delete set null` — an UPDATE against `audit_log`, which
>    the new trigger rejects, so deleting any staff member who had ever acted would have
>    raised instead of succeeding. An append-only record should not be mutable by another
>    table's lifecycle; `actor_name` is denormalised onto every row for exactly this reason.
> 7. **RLS aligned.** Migration `0001`'s `"audit log readable by signed-in staff"` policy let
>    any signed-in staff read the whole log via the anon key. It is dropped, and reads move
>    to the service-role client, so `audit_log` now matches every other table: RLS enabled
>    with no policies, the explicit code check as the entire gate.
> 8. New **SuperAdmin-only `/admin/audit`** (`AuditLogManager`) with the required
>    User / Action Type / Target Entity / Date & Time columns, an Action Type dropdown,
>    sorting, and pagination. It is **server-driven via searchParams**, not a client manager
>    holding the full dataset — the one table in the portal that grows without bound, so the
>    pattern the other eight managers use would eventually ship the whole log to the browser.
>    Search is substring (`ilike`) for now; **sub-project 4 swaps in `pg_trgm` fuzzy matching
>    without changing the UI** — a sequenced partial against the requirement, not an omission.
>    *(Superseded: fuzzy search landed for the audit log in migration `0015` and everywhere
>    else in `0016`, and `src/lib/postgrest.ts` has since been deleted — see the sub-project
>    4 entry below.)*
> 9. The dashboard's **Publishing Activity became Audit Logs**, and — corrected during
>    verification — is **SuperAdmin-only**. It renders the same rows `/admin/audit` does,
>    so showing it to every signed-in user leaked exactly what the sub-project 2 gating
>    hides. The dead `PUBLISHING_ACTIVITY` mock and `PublishingActivityEntry` type are gone.
> 10. **Known cosmetic wart:** the `entity_label` backfill copies `detail` without clearing
>    it, so *historical* rows carry the same string in both columns. The table was already
>    immutable by the time this surfaced, so `detailOf()` in `audit-log-manager.tsx`
>    suppresses a `detail` that merely repeats the label. Rows written by the new code set
>    the two from different sources and never collide. There is also one permanent
>    `"Migration Verification"` row from the immutability test — it cannot be deleted, by
>    design.

> **Updated 2026-07-22 (fuzzy search — sub-project 4):** every search input in the portal,
> admin and public, now matches forgivingly. Spec:
> `docs/superpowers/specs/2026-07-22-fuzzy-search-design.md`. Migration
> **`0016_fuzzy_search.sql`** — **staging only so far**, and required before
> `/transparency/legislative` search returns anything.
>
> 1. **One matching contract, stated once.** Split the query on whitespace; a record
>    matches only if **every** term matches it; a term matches by substring, or by a small
>    edit distance against an individual **word** of the record. So `cert` finds
>    *certificate*, `offcal` finds *official*, `juan dela` narrows, and `juan banana`
>    returns nothing.
> 2. **`public.fuzzy_match(haystack, q)`** extracts the predicate migration `0015` inlined
>    inside `search_audit_log`, which is rewritten to call it — one definition in the
>    database, as the requirement covers "all future tables". It is deliberately
>    `language sql` and a single `SELECT` so Postgres **inlines** it and the trigram
>    indexes stay eligible; a plpgsql body would force a sequential scan.
> 3. **`public.search_legislative_documents(...)`** backs `/transparency/legislative`,
>    replacing the PostgREST `ilike` filter, with a trigram GIN index over
>    `number || title || summary`. It applies `status = 'published'` itself so the public
>    boundary stays in one place. `searchUploads()` instead uses the JS matcher — it
>    already merges three tables into memory, so there is nothing left to push down.
> 4. **`src/lib/fuzzy.ts`** (`fuzzyFilter`, `haystack`) is the JavaScript half, used by
>    every admin manager and by `searchUploads`.
> 5. **Fuse.js was installed, measured, and removed.** It scores a pattern against the
>    whole concatenated haystack, so no threshold accepted `sanots` → *Santos* without also
>    accepting `juan banana` → *Juan Dela Cruz*. Matching per word has no such conflict.
>    This reverses the library choice in umbrella §3.4, not its hybrid decision.
>    **One deliberate asymmetry:** the SQL side keeps a third `word_similarity` recall
>    route that the JS side omits — nearly free against a GIN index, but a hand-rolled
>    approximation of Postgres internals in JavaScript with no measured benefit.
> 6. **Search inputs added where there were none:** officials, legislative, transparency
>    documents, transparency projects, and users. `AdminFilterBar` now takes a
>    per-instance `search.id` — transparency renders two bars on one page, and the
>    hardcoded id broke the `<label for>` association for both.
> 7. **Project reorder arrows hide while a search is active.** "Move up" means "swap with
>    the row above"; with rows filtered out, the row above on screen is not the neighbour
>    the action would move.
> 8. **`src/lib/postgrest.ts` is deleted.** It was extracted three days earlier for the two
>    `ilike` callers; both are gone and no `.ilike()`/`.or()` filter remains anywhere in
>    `src/`. The escaping quirk it guarded is still recorded in §6 below, so the knowledge
>    outlives the file.
> 9. **Migration `0017_fuzzy_match_literal_substring.sql` — also staging only.** Found
>    while verifying `0016`: its substring route was `haystack like '%' || term || '%'`,
>    so `%` and `_` **in the user's query** acted as LIKE wildcards.
>    `fuzzy_match('totally unrelated text', '_')` returned true — a one-character search
>    returned the whole table, and `form_data` matched `formXdata`. Not an injection (the
>    term is a bound parameter), but wrong results, and the very trap
>    `src/lib/postgrest.ts` had guarded on the PostgREST side before item 8 deleted it.
>    Fixed with `strpos(...) > 0`: no pattern language, nothing to escape, and identical to
>    `String.includes` in `src/lib/fuzzy.ts`, so both halves now agree character for
>    character on that route. Only the substring route changed. **Trade-off:** a GIN
>    trigram index can serve `LIKE '%term%'` but not `strpos`; those indexes were already
>    unlikely to be used (indexed expression `lower(a || ' ' || b)` vs the inlined
>    predicate's `lower(coalesce(a || ' ' || b, ''))`), and the tables are small. Whether
>    to drop them belongs to the hardening pass.
> 10. **The global admin search is real** (migration `0018_admin_global_search.sql`, also
>    staging only). `AdminTopBar`'s input had been a dead stub since the design export; it
>    is now `AdminGlobalSearch`, a debounced type-ahead over
>    `search_admin_global(p_q, p_modules, p_limit)` returning grouped results across
>    twelve modules. **Permission scoping is an input to the query, not a filter on its
>    output:** `globalSearch()` in `features/admin/actions/search.ts` builds the module
>    allow-list from `checkPermission()`/`checkSuperAdmin()` and passes it in, so the
>    database never scans a module the viewer cannot open and nothing the client sends can
>    widen the search. Services are SuperAdmin-only, matching their `superAdminOnly` nav
>    entry. Shared constants live in `features/admin/search-modules.ts` because a
>    `"use server"` file may only export async functions. ~~**Known limit:** results link to
>    the module page, not the record.~~ **Resolved in sub-project 5 — see below.** Unlike
>    the public search functions this one does **not** filter to `published`; the portal is
>    where drafts are managed.

> **Updated 2026-07-22 (table standards — sub-project 5):** eleven behaviours that every
> admin manager had implemented differently, or not at all, are now shared primitives. **No
> migration**; no Server Action contract changed.
> 1. **Destructive actions moved out of the drawers.** Archiving or deleting used to require
>    opening the record's editor first. Every content manager's rows now carry a `RowActions`
>    kebab (Edit / Publish / Archive / Delete as the record's state allows). It renders
>    through `createPortal` into `document.body` at `position: fixed`, because every admin
>    table sits inside `overflow-x-auto`, which would clip an absolutely-positioned menu;
>    scroll and resize dismiss it rather than re-anchoring. Full menu keyboard contract
>    (↑/↓/Home/End/Escape, focus returns to the trigger).
> 2. **The four ticket managers deliberately keep the review drawer as their only action.**
>    Umbrella §3.6 excludes tickets from archive and §3.2 puts delete in sub-project 6, so
>    there is nothing yet to put in a menu for them.
> 3. **`window.confirm` is gone**, replaced by `ConfirmDialog` (`role="alertdialog"`). It
>    names the record, focus starts on **Cancel** so a stray Enter cannot destroy anything,
>    and it stays open and disabled while the Server Action runs — the native dialog could
>    not express that, so a slow delete gave no feedback and a second click fired a second
>    delete.
> 4. **Two real defects fixed on the way.** Team users could be archived or deleted with a
>    single click and *no confirmation at all*. Services and Team both passed the error
>    string to the success toast, so a failed action arrived with a green tick beside it.
> 5. **Toasts gained an id and a tone.** Managers held `useState<string | null>` keyed by the
>    message text, so re-firing an identical message was not a state change — React never
>    re-rendered and the dismiss timer never restarted, which made a second save look like a
>    no-op. `useToast` carries an incrementing `id` used as the Toast's key. Failures use
>    `role="alert"`; successes stay `role="status"`.
> 6. **Skeletons.** There was no `loading.tsx` anywhere in the app, so a DB-backed admin
>    route showed the *previous* page until the server finished. All twelve admin routes now
>    have one, built from a shared `Skeleton` set that mirrors each real layout. Managers get
>    their rows as props from async Server Components, so the App Router's streaming boundary
>    is the correct seam — there is no client fetch to spin on. Pulse is `motion-safe` only.
> 7. **Sorting everywhere.** `SortableTh` + `useTableSort` were previously used by two
>    managers; they now cover Officials, Services, and all four ticket queues (ticket tables
>    default to newest-first — the queue is worked from the top).
> 8. **Reorder vs. sort.** Officials and Transparency Projects persist a manual order.
>    Reorder arrows are hidden whenever a filter, a search, **or a non-`order` sort** is
>    active: "move up" means "swap with the row above", which is only true when the rows on
>    screen are the whole list in stored order.
> 9. **Deep-linking closes sub-project 4's known limit.** `hrefForHit()` builds
>    `/admin/<module>?tab=…&edit=<id>` (or `?review=<id>` for tickets) and `useEditDeepLink`
>    opens the drawer for that record, then strips the parameter with `router.replace` so a
>    refresh does not re-open it. Tabbed pages pass `enabled` so only the panel that owns the
>    record consumes the link. No permission check in the hook — the page is already gated by
>    `requirePermission`, and the search cannot hand out an id for a module the viewer
>    cannot open.
> 10. **One global `:focus-visible` ring** in `globals.css`. Tailwind emits utilities in a
>    later cascade layer, so anything with its own focus treatment keeps it; this only
>    reaches controls that previously showed nothing. Icon-only buttons also gained visible
>    `Tooltip`s to match the `aria-label`s screen readers already had.
> 11. **Tests exist now** (`npm run test:unit`, `npm run test:e2e`), lifting the old no-test
>    rule ahead of sub-project 7. Vitest covers pure functions only — 21 cases pinning the
>    fuzzy matcher's contract and the global search's permission map against the sidebar.
>    Playwright drives the real dev server; the `admin` project **skips** until
>    `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` are set in `.env.local`. **Action for the
>    owner: create one dedicated staging staff account (not a SuperAdmin) for the e2e
>    suite.**
>
> **Follow-up, same day.** Two call sites survived the first sweep and were fixed after the
> owner asked whether archiving or deleting a user was confirmed: the transparency **project**
> drawer still carried its own Archive/Delete pair with a `window.confirm` (removed — the
> row kebab already had both), and the **achievements** sub-list inside the officials drawer
> confirmed a delete natively (now a `ConfirmDialog`; it keeps an inline trash button rather
> than a kebab, because achievements are sub-records inside an open editor, not table rows).
> Team users already had the dialog on both actions, plus a rule that nobody may archive,
> delete, or disable their own account. `window.confirm` is now absent from `src/` entirely.
>
> **Disabling a user now confirms too, and archived users can be restored.** Disabling locks
> a colleague out of the portal on their next page load — the same class of act as archiving
> — so it goes through `ConfirmDialog`. Enabling and restoring stay one click: they hand
> access back, and confirming harmless actions trains people to click through the ones that
> matter. The archive dialog had been promising the account "is kept and can be restored"
> while `listTeamUsers` filtered `is_archived = false` and nothing else read the archived
> rows — there was no route back short of SQL. Settings now renders an **Archived accounts**
> disclosure below the roster (only when non-empty) with a Restore per row, backed by
> `listArchivedTeamUsers()` and `restoreTeamUser()`. **Restore clears `is_archived` but
> deliberately leaves `is_active` false**: archiving turns sign-in off, and returning someone
> to the roster is a smaller decision than handing them a working login, so the row comes
> back marked disabled and enabling it is a separate act. Also **moves `listTeamUsers` onto
> the service-role client** — it was the last read in the portal going through the anon
> client and leaning on an RLS policy for its filtering, which is why a stubbed session used
> to show an empty team list.

> **Scope correction 2026-07-22 — the public site is in the programme too.** Sub-projects
> 2–9 are all admin-side, which wrongly implied the UI/UX standards stop at the portal. A
> tenth sub-project, **Public-side UI/UX**, is now on the sequence table (umbrella spec
> §4.1). It carries no migration and shares no code with 6–9, so it can run at any point.
> What the survey found on the public side today:
> - **No `loading.tsx` under `app/(public)`** — five DB-backed routes (services, officials,
>   announcements, transparency, track) stream with no fallback, the same defect the admin
>   portal had before sub-project 5.
> - **No `error.tsx` anywhere in the app.** A failed Supabase query on a public page is an
>   unstyled crash, not a recoverable "something went wrong" with a retry.
> - **Six public forms, six validation styles** — `apply-form`, `appointment-form`,
>   `complaint-form`, `assistance-form`, `inquiry-form`, `newsletter-form`, plus
>   `track-lookup`. None use the blur-then-live contract or the shared toast.
>
> It reuses the primitives sub-project 5 built rather than growing public equivalents, so
> both halves of the site behave the same way. It gets its own spec first.

> **Sub-project 10, phases A and B shipped 2026-07-22.** Spec:
> `docs/superpowers/specs/2026-07-22-public-side-uiux-design.md`. No migration.
> 1. **Streaming, not whole-page skeletons.** Every public list route is a static `PageHero`
>    followed by one async leaf section, so a route-level `loading.tsx` would have flashed
>    the heading — which needs no data — as a grey block on every navigation. The async
>    sections are wrapped in `<Suspense>` instead. The archive and uploads boundaries are
>    keyed on the query, so changing a search re-suspends rather than leaving stale rows
>    looking current. Detail routes (`[slug]`) do get `loading.tsx`: they await the record
>    before they can render their own title.
> 2. **Three error boundaries** where there were none: `(public)/error.tsx`,
>    `admin/(portal)/error.tsx`, and `global-error.tsx` (own `<html>`, inline styles — a
>    root-layout crash may be the design system itself failing). **None print
>    `error.message`**; all show `digest` so a resident's report matches a log line.
> 3. **The four public schemas left their `"use server"` files.** A `"use server"` module may
>    only export async functions, so no client component could import them — the real reason
>    the forms had no inline validation. Each now lives in `schema.ts` beside its action,
>    with the five shared identity fields in `src/lib/public-forms.ts`. Action and form
>    import the same object; the server still validates and remains the authority.
> 4. **Blur-then-live validation** on all four forms, plus `aria-invalid` (which *is* the red
>    treatment, so the two cannot drift), `role="alert"` messages, `aria-describedby`, and
>    focus moving to the first invalid field on submit. Verified at 390 px: zero POSTs fired
>    for an empty form, no horizontal overflow.
> 5. **14 new unit tests** pin the extracted schemas (35 total).
>
> **Sub-project 10, phase D shipped 2026-07-22 — the two theatre forms now have a backend.**
> The owner chose "build it" over "point at the hotline". **Migration `0019` (applied to
> staging)** adds `inquiries` and `alert_subscribers`, both RLS-enabled with zero policies.
> 1. **`/contact` persists.** `submitInquiry` rate-limits (5/hour/IP), validates with a
>    schema the form shares, and inserts through the service-role client. The email is
>    **required** here, unlike the ticket forms: an inquiry has no ticket number and nothing
>    to track, so the reply address is the whole mechanism. No ticket number comes back —
>    handing over one `/track` cannot find would be the same lie in a new shape.
> 2. **The alert signup persists**, with the mobile number normalised to one form
>    (`normaliseMobile`) so the unique index actually de-duplicates `0917 555 0101` and
>    `+63 917 555 0101`. Re-subscribing an opted-out number reactivates it.
> 3. **A new `handle-inquiries` permission and `/admin/inquiries` inbox**, built from the
>    sub-project 5 primitives. **Existing staff accounts do not have the new permission** —
>    a SuperAdmin has to tick it in Settings before anyone but a SuperAdmin sees the module.
> 4. **No delete, only close.** Spam is closed; nothing lets staff make a resident's message
>    disappear with no record it arrived. Status moves are not guarded in the WHERE clause
>    (unlike the ticket queues) so a mistake can be undone by picking "New" again.
> 5. **Consent is enforced but not stored** — see the spec §8.2 for why, and what a
>    different DPA reading would cost (one column).
> 6. **17 new unit tests** (45 total) pin the inquiry schema and the mobile normaliser.
>
> ~~**Still open:** inquiries are not in the global admin search (`search_admin_global` is a
> Postgres function — another migration).~~ **DROPPED 2026-08-10** — inquiries stay out of
> the global search. The inbox has its own fuzzy search over name, email and message body,
> which is where staff work the queue; adding a branch to `search_admin_global` means
> another migration and a 13th haystack to keep in step with `src/lib/fuzzy.ts` (see
> CLAUDE.md's two-engines bullet for what drift there costs). Email was open when this
> entry was written;
> §2D's Plan 1 (2026-07-30) closed it for this queue specifically — `submitInquiry` now
> sends the resident an acknowledgment. ~~It also sent every `handle-inquiries` holder a
> staff notification, `replyTo`-wired back to the resident.~~ **REMOVED 2026-08-06** — no
> staff email is sent for an inquiry any more; the bell and count badge are the only signal.
> See item A below.

> **Sub-project 6 shipped 2026-07-22 — archive & restore.** Spec:
> `docs/superpowers/specs/2026-07-22-archive-restore-design.md`. **Migration `0020`**
> (applied to staging) adds `archived_at` / `archived_by` to the seven content tables.
>
> Reading the code first showed this was mostly a **safety fix**, not a build: the archive
> substrate already existed on all seven tables, restore-by-republish worked, the public
> boundary already filtered on `published`, and the category hide-flag from umbrella §3.6
> shipped long ago. What was missing was the rule on top.
> 1. **Delete now requires SuperAdmin *and* an already-archived record.** Before this, every
>    content delete sat behind `checkPermission(<module>)` and ignored the record's status —
>    so anyone with `manage-transparency` could permanently erase a *published* ordinance and
>    its PDF in one click. `guardDelete()` in `src/lib/archive.ts` enforces both conditions in
>    one read; it is a shared helper because a check repeated in four places gets forgotten in
>    one, and Server Actions are public HTTP endpoints a stale tab reaches directly.
> 2. **Restore is a first-class action on all seven types, and returns the record to
>    `draft`** — never straight back to `published`. It also fills in the `restore` audit
>    type, which had been in `AUDIT_ACTIONS` since `0014` with nothing ever writing it.
> 3. **An Active | Archived view toggle** (`src/components/ui/view-toggle.tsx`) replaces
>    "archived" as a status-dropdown value across six manager surfaces. Delete only ever
>    appears in the Archived view, only for a SuperAdmin — a non-SuperAdmin sees no Delete
>    rather than a disabled one. Reorder arrows hide there, same rule as under a filter.
> 4. **News, announcements and events get Restore but still no Delete.** They have none today;
>    adding three new destructive actions here is backwards, and their media lives behind
>    `image_src`/`cover_src` URLs plus child photo rows, so a correct delete needs the
>    URL→Storage-path work sub-project 7 owns. Deferred there deliberately.
> 5. `deleteAchievement` is deliberately untouched — a sub-record inside a parent's drawer,
>    whose soft state is the existing `is_visible` toggle.

> **Sub-project 7 shipped 2026-07-22 — transactional uploads.** Spec:
> `docs/superpowers/specs/2026-07-22-transactional-uploads-design.md`. **No migration.**
>
> Three uploaders still wrote to Storage the moment a file was picked, so cancelling a drawer
> left an object no row referenced. They now follow the defer-to-Save pattern the transparency
> work established on 2026-07-20.
> 1. **`SingleImageUploader` is a pure file picker** (announcement image, event cover, official
>    portrait). It holds a `File` and a local `blob:` preview; `saveAnnouncement` / `saveEvent`
>    / `saveOfficial` take a `FormData` beside their values, upload server-side, and
>    compensating-delete the object if the row write fails — the `fail()` helper from
>    `saveLegislative`, copied deliberately rather than reinvented.
> 2. **Announcements and events now clean up a replaced or removed image.** Neither save action
>    called `removeStoredImage` at all before, so every replaced image since the feature
>    shipped is still in the bucket. `discardImage()` in `src/lib/media.ts` is the best-effort
>    cleanup: it never fails the user's save, and logs the path when it cannot tidy up.
> 3. **News photos are a pending list flushed on Save.** Saved photos keep their immediate
>    reorder/remove/alt actions (they act on rows that exist); photos chosen in the session
>    travel with the form. A new post and its photos now commit in one pass, so the *"save this
>    post as a draft first"* message is gone. `attachPendingPhotos` is all-or-nothing per batch.
> 4. **`media.ts` moved to `src/lib/` and is no longer a Server Action module**, because nothing
>    client-side imports it any more — leaving it as one would keep a public endpoint whose only
>    job is putting an unreferenced object in the bucket. It also stopped writing audit entries:
>    every caller is now a step inside an action that records its own, and the compensating path
>    would otherwise claim a deletion for a save that never completed (the reasoning already at
>    the top of `documents.ts`).
> 5. **News, announcements and events gained the deletes deferred from sub-project 6** — same
>    `guardDelete()`, SuperAdmin + archived only. Each removes its own media; deleting an
>    article also removes its `news_photos` objects, which Postgres's cascade cannot do.
> 6. **`AchievementPhotoUploader` was deliberately not converted.** The achievements editor has
>    no Save button — rows are created on "Add" and fields save on blur — so there is no commit
>    event to defer to and no Cancel to orphan an object. Its cleanup already works via
>    `deleteAchievement` / `deleteOfficial`. Revisit with autosave (sub-project 8).
> 7. **`scripts/report-orphaned-media.mjs`** lists objects no row references. **Read-only** —
>    it never deletes, because a sweeper acting on its own judgement is what umbrella §3.3
>    rejected. Staging currently reports 0 orphans.

> **Sub-project 8 shipped 2026-07-22 — autosave.** Spec:
> `docs/superpowers/specs/2026-07-22-autosave-design.md`. **No migration.**
>
> `Drawer` closes on Esc and on an overlay click with no confirmation, so three paragraphs into
> a news body one stray keypress lost the lot. The seven draft-capable drawers now keep a local
> recovery copy.
> 1. **It writes to the browser, never to Postgres — for existing records as much as new ones.**
>    Umbrella §3.7 allows a database write once a record exists; reading the save actions says
>    that is unsafe. Editing a published record does not change its status: `saveAnnouncement`
>    updates the row in place and calls `revalidatePath("/")`, so a timed database write would
>    push half-rewritten text onto the live home page with no click and no review. Browser
>    storage satisfies §3.7 by construction. Cross-device resume is the accepted cost.
> 2. **No new Server Actions**, therefore no new public endpoints to gate and nothing to exclude
>    from the audit log (§3.7's third bullet dissolves rather than being implemented).
> 3. **`useFormDraft(userId, scope, recordId, values)`** (`src/hooks/use-form-draft.ts`) owns all
>    storage access; the pure key/expiry/cap/compare helpers live in `src/lib/form-draft.ts` and
>    are unit-tested. Each form gained about four lines and keeps its own `useState`.
> 4. **Text only, by construction.** The hook is handed `values`, and `File` state lives outside
>    `values` in all seven forms — so staged uploads stay staged (§3.7) without a rule anyone has
>    to remember. The recovery bar says images are not restored.
> 5. **Restore is offered, never applied.** For an existing record the server may have moved on;
>    silently reinstating a stale snapshot over someone else's correction would be data loss
>    dressed as recovery.
> 6. **Keys are `sf-draft:v2:<userId>:<scope>:<recordId|new>`** (bumped from `v1` when the
>    Notices work widened `AnnouncementValues` with required fields — old snapshots are
>    abandoned, never migrated), scoped to the user because a
>    barangay workstation is plausibly shared, and cleared on sign-out (`SignOutButton`).
>    7-day expiry, 256 KB cap, every storage call wrapped so private browsing degrades to
>    "no autosave" rather than a broken form.
> 7. **The status line reads "Recovery copy saved on this device", never "Saved."** The wording is
>    load-bearing: an editor must not read it as "this is on the site".
> 8. **Achievements were re-examined and stayed out.** Sub-project 7 deferred its missing commit
>    point here. It already persists every field on blur; what it lacks is a *draft* model, which
>    is a redesign of how achievements are created, not a use of this hook.

> **Sub-project 9 shipped 2026-07-22 — Home & About CMS.** Spec:
> `docs/superpowers/specs/2026-07-22-home-about-cms-design.md`. **Migration `0021`.**
>
> ⚠️ **`0021` needs `node scripts/upload-site-images.mjs` run once per environment**, in the same
> sitting. The migration seeds rows pointing at `public-media/site/…`; without the objects the
> home page renders broken images. Applied to staging (script run); **production still owes both**,
> alongside `0012`–`0020`.
>
> The two pages a visitor sees first were the two the barangay could not edit. Ten blocks moved
> out of `src/features/{home,about}/data.ts` and into the database.
> 1. **Two tables, not seven.** `site_blocks` (four singleton texts, keyed by dotted path) and
>    `site_items` (all seven ordered collections, discriminated by a `site_block` enum with
>    generic `label`/`value`/`body` slots). Seven tables would have meant seven near-identical
>    managers. The per-block meaning of those slots is fixed in one descriptor table,
>    `src/features/admin/site-blocks.ts`, mirroring the migration.
> 2. **A CHECK constraint carries the shape** the generic columns would otherwise lose — Postgres
>    rejects a glance stat with no figure or a hero slide with no image. **Maintenance trap,
>    documented at the constraint:** it is a `CASE` over the enum with no `ELSE`, so a block added
>    to the enum without extending the `CASE` is silently unvalidated (unmatched `CASE` → `NULL`
>    → `CHECK` passes).
> 3. **No status column, and Save writes live.** A page section is not a record with a lifecycle;
>    a live/draft pair would double every read path and permit an About page with no published
>    mission because someone left one in review. Consequently there is no **Active | Archived**
>    toggle here and no `guardDelete` — deletion is direct, behind `ConfirmDialog`, and removes
>    the item's storage object (sub-project 7's invariant still binds).
> 4. **Revalidation is the whole requirement.** Umbrella §3.8 framed this as making the pages
>    dynamic; `/` was already DB-backed under ISR. Every action calls `revalidatePath("/")` and
>    `revalidatePath("/about")`, without which an edit is invisible for up to an hour and reads
>    as a broken CMS. `/about` also gained `revalidate = 3600` — it was prerendered once with no
>    window, so a build made before `0021` landed would have served the empty state indefinitely.
> 5. **An empty block hides its section**, since §3.8 requires mission and vision to be blankable
>    and a blank string in a bordered card looks like a bug. The hero is the exception: with no
>    slides it keeps its heading and buttons rather than leaving the page starting mid-air.
> 6. **`manage-site-content` is granted to nobody.** Deliberately omitted from
>    `STATUS_PRESETS.editor` — presets pre-tick boxes for every account created afterwards, so
>    including it would hand the front page to the next editor without anyone deciding to.
>    SuperAdmins bypass the array and see the manager on deploy.
> 7. **`@dnd-kit` arrived, confined to one primitive.** §6.7 below records that avoiding it was a
>    deliberate choice; the owner asked for it, so `src/components/ui/sortable-list.tsx` is the
>    only file that imports it, keyboard sensor wired. Every existing up/down list — news photos,
>    achievements, officials, projects — is untouched. **Pass a `useId()` as the `DndContext` id:**
>    dnd-kit numbers its `aria-describedby` ids from a module-level counter, so several lists on
>    one page hydrate mismatched without it.
> 8. **The carousel and history images left the bundle** for `public-media/site/`. The Punong
>    Barangay's portrait did **not** need migrating — §3.8 listed it, but `0012` already moved it
>    and `CaptainMessageSection` reads the officials table with the static import as a fallback.
>    The get-involved banner is seeded as its existing `lh3` hotlink and is now replaceable, so
>    the first edit removes one hotlink from the codebase.
> 9. **Still hardcoded, by design:** section headings and standfirsts and the About `PageHero`.
>    Making every string editable is a page builder, not a CMS. Individual headings can be
>    promoted to fields on request. (The Join-Community panel was a third item here until it
>    was deleted from `/about` on 2026-08-05.)

> **Admin polish pass shipped 2026-07-22.** Spec:
> `docs/superpowers/specs/2026-07-22-admin-polish-design.md`. **Migration `0022`.**
> Not a sub-project of the portal-overhaul umbrella — that programme finished at nine. This is
> the list of defects and rough edges found by *using* the finished portal.
>
> 1. **Officials could not be published, and the reason was invisible.** Two independent causes.
>    `OfficialsManager` was one of three managers with no **Publish** in its row menu (News,
>    Events and Projects have one; Legislative and Transparency also do not), so the only
>    control lived in the drawer behind an `id &&` guard — a new official had to be saved,
>    closed and reopened before a publish button existed anywhere. And when `setOfficialStatus`
>    refused (no portrait, or no portrait alt text) the message rendered as the last child of a
>    scrolling body while the button sat in a fixed footer, so nobody ever saw it. **The two
>    server-side guards are correct and were not touched** — the public card leads with the
>    portrait and a government site cannot ship an empty `alt`. What changed is that the
>    refusal now arrives as an error toast, and the drawer's error moved into the footer beside
>    the button it explains. Legislative and disclosure documents gained the same row-level
>    Publish in a 2026-07-23 follow-up — they shared the missing-action half of the pattern,
>    though neither hides its drawer button behind a prior save.
> 2. **A fourth directory section, `members`** (`0022`), rendered as **"Barangay Members"** below
>    Administration and labelled just "Members" in the admin. `ALTER TYPE … ADD VALUE` cannot
>    have its new label *used* in the transaction that adds it, so `0022` only declares it —
>    **never add a seed row using `'members'` to that migration.**
> 3. **Quick Services left the CMS and went back to code**, reversing that one-tenth of
>    sub-project 9. Six links to this site's own routes change when the routes change, which is
>    a deploy, not an edit; `src/features/home/data.ts` exists again to hold them. The block was
>    removed from **both** `SITE_BLOCKS` and `SITE_BLOCK_SPECS` — `specFor` ends in a non-null
>    assertion whose invariant is "every `SiteBlock` has a spec", so removing one alone is a
>    silent crash. **Documented drift:** Postgres cannot drop an enum value, so `quick_services`
>    survives in the SQL `site_block` enum and as an unreachable branch of `0021`'s CHECK. The
>    TS union no longer mirrors the enum exactly, and the drift runs one way only — every value
>    in the union must still exist in the enum.
> 4. **`/admin` is a redirect, not a dashboard.** The Content Hub's three panels were a mock
>    "Recent Drafts" list, a duplicate of the audit log `/admin/audit` already owns, and three
>    shortcut cards; with the first two removed at the owner's request there was nothing to land
>    on. It now sends each user to the first nav entry they may reach. Settings is ungated, so a
>    target always exists and the redirect cannot loop. `ADMIN_USER` went with the hub — the last
>    `lh3` hotlink in the admin seed data.
> 5. **One nav gate, in `src/lib/admin-nav.ts`.** The predicate deciding which links a user sees
>    was inline in the sidebar and about to be copied into the redirect and the title bar. It is
>    now pure functions over a list, and **the only unit-tested code in the admin portal** —
>    which is the point of keeping them pure: they take the list as an argument, so the tests
>    never load a React component or lucide-react. Nav items are grouped Requests / Content /
>    System, and the flat order of that table decides where each user lands after login.
> 6. **`adminPageTitle` is permission-gated, and that is a disclosure control, not politeness.**
>    The portal 404s on unpermitted routes so those modules stay hidden — but the layout, and
>    therefore the top bar, renders *above* that 404. An ungated lookup would print
>    "Applications" over the not-found page and undo the gating. A test pins this. The same
>    leak existed one layer up: a gated page's static `metadata.title` is resolved regardless
>    of what the render throws, naming the module in the browser tab over the 404. Since
>    2026-07-23 every gated page exports `gatedMetadata(<permission>, <title>)` from
>    `src/lib/auth.ts` instead — the title resolves only for a session holding the permission,
>    and otherwise falls back to the layout's generic "Admin".
> 7. **The sidebar collapses to a 72px icon rail, and its state is a cookie read server-side.**
>    Not `localStorage` in an effect: an effect runs after paint, so the rail would render
>    expanded and snap shut on every single load. `AdminShell` owns the state because the fixed
>    rail and the main column's compensating margin have to move together or the layout tears.
> 8. **Three dead stubs deleted:** the sidebar's Emergency Response button and the top bar's
>    Notifications and Help buttons. All three were wired to nothing. A control that never works
>    teaches people to stop trying controls.
> 9. **The real barangay map** replaced the `lh3` placeholder on `/contact`, bundled like the
>    seal and rendered through `next/image` rather than a CSS background. Its greyscale wash is
>    gone — that existed to make a stock photo recede, and a real map is content. The officials
>    page's 24/7 Action Center now dials `(077) 600 1082` from `SITE.phone` instead of `911`.

> **Production baseline added 2026-07-23.** `supabase/baseline/0000_baseline_2026-07-23.sql` is
> a single-transaction squash of migrations `0001`–`0024`, building the *final* schema state on
> an **empty** `public` schema — it is not a replay, and it deliberately ships **without** the
> demo seed content `0007_news_content.sql` and `0009_transparency.sql` insert, so a fresh
> production apply doesn't land placeholder news/announcements/events/legislative/transparency
> content on the live public site. **Two paths, and they don't mix:**
> 1. **New environment** (production, a fresh staging, a local dev database) standing up from
>    nothing: apply the baseline file alone, not the numbered migrations in sequence. It assumes
>    an empty schema and fails loudly against one that already has any of `0001`–`0024` applied —
>    that's intended, not a bug to work around.
> 2. **Existing environment** that already has some of `0001`–`0024`: keep applying the
>    individual numbered migrations it is missing, in order, exactly as every entry above
>    describes. The baseline is not a substitute for that path.
> Either way, the same two upload scripts already required by `0012` and `0021` are still
> required once per environment — `scripts/upload-official-portraits.mjs` and
> `scripts/upload-site-images.mjs` — or the officials directory and the Home/About pages render
> broken images. **The baseline is a prepared artifact, not a proven one:** it has not been
> executed against any real database yet.

---

## 1. Current State

| Item | Status |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 — amber + ink design tokens (`brand-*`, `ink-*`, `danger*`) in `src/app/globals.css` (`@theme`); Space Grotesk headings + Inter body |
| Rendering | 100% Server Components except a handful of client islands (see §5) |
| Build | `npm run build` ✅ — static where possible; DB-backed routes (services, tickets, news/announcements/events, `/admin/*`) render dynamically |
| Backend | **Supabase** (Postgres + Auth + Storage), reached through Server Actions and server-only query modules. Services, the four ticket flows, news/announcements/events, transparency documents (ordinances & resolutions, budget/financial documents, projects), the officials directory, and each official's achievements timeline are DB-backed. Still hardcoded: `src/constants/site.ts` and the remaining `src/features/*/data.ts` (about, home stats) |
| Auth | **Supabase Auth**, live. Two layers: `src/proxy.ts` redirects unauthenticated `/admin` GETs to `/admin/login` and refreshes the session cookie (its matcher excludes Server Action POSTs via the `Next-Action` header — see the 2026-07-20 entry), and `src/lib/auth.ts` holds the real gate. Since 2026-07-22 those gates split by context: **pages** call `requirePermission(<permission>)` / `requireSuperAdmin()`, which `notFound()` so an unauthorized module is indistinguishable from a missing one; **Server Actions** call `checkPermission()` / `checkSuperAdmin()`, which return `null` so the action can hand back `{ error: NOT_FOUND }`. `requireSessionUser()` still redirects to login. Per-user permission checkboxes + a SuperAdmin role; portal stays `noindex` |
| Images | News/announcement/event uploads go to Supabase Storage (public bucket `public-media`, 2MB, JPEG/PNG/WebP); the 12 official portraits also live in `public-media/officials/` now (uploaded once via `scripts/upload-official-portraits.mjs`), and each official's achievement photos live under `public-media/achievements/<achievementId>/` (same 2MB/JPEG-PNG-WebP limits, migration 0013, staging only). Transparency PDFs go to a separate public bucket `public-documents` (10MB cap). Seed rows and the rest of the site are still hotlinked from `lh3.googleusercontent.com` (Stitch design exports) — moving those to owned storage is outstanding. Real bundled exceptions (static imports): hero carousel (`src/images/carousel/`), barangay seal (`src/images/logo/`), the Punong Barangay's portrait reused by the About-page `CAPTAIN` block, About history-timeline images (seal + carousel photo) |

### Routes

| Route | Page | Composed from |
| --- | --- | --- |
| `/` | Home | `HomeHero`, `QuickServicesSection`, `CommunityPulseSection`, `GetInvolvedSection` |
| `/about` | About Us | `MissionVisionSection`, `CaptainMessageSection`, `HistorySection`, `MilestonesSection` |
| `/officials` | Officials directory | `LeadershipDirectory`, `ActionCenterBanner` — DB-backed via `listPublishedOfficials()` since 2026-07-21 |
| `/officials/[slug]` | Official detail | `getPublishedOfficialBySlug()` (`src/features/officials/queries.ts`); 404s for a non-existent, non-published, or portrait-less slug. Renders an `AchievementsTimeline` below the bio for any `is_visible` achievements with a non-empty title (empty on every official today — see the officials-achievements changelog entry) |
| `/services` | Services directory | `ServicesGrid` (accordion requirements), `WasteScheduleSection`, `HelpSection` |
| `/services/apply/[slug]` | Certificate application form | `ApplyForm` (DB-backed via `getApplyService()`); serves `tone === "primary"` services only — `getApplyService()` returns `null` for `tone === "danger"` (`blotter-complaints`), so this route 404s for it; its service-card CTA now links straight to `/complaints/new` (plan 2C) instead |
| `/appointments/new` | Appointment request form | `AppointmentForm` — preferred date + AM/PM, DB-backed; ends in an on-screen ticket receipt |
| `/complaints/new` | Incident report form | `ComplaintForm`, gated by the `blotter-complaints` service row's `is_available` toggle; renders `ApplyUnavailable` when off |
| `/assistance/new` | Social-service assistance form | `AssistanceForm` — category picker sourced from `assistance_categories`; renders `ApplyUnavailable` if every category is retired |
| `/track` | Ticket status lookup | `TrackLookup` — ticket number + last name, DB-backed via `lookupTicket()`; resolves all four ticket kinds through `tickets_view` (a complaint result shows status only) |
| `/announcements` | News & Announcements | `NewsFeed` (DB-backed via `listPublishedArticles()`; 1 featured + 6/page, real link-based pagination), `NewsSidebar` (DB-backed via `listPublishedAnnouncements()`; hotlines, newsletter) |
| `/announcements/[slug]` | News article detail | `getPublishedArticleBySlug()`; article body + `PhotoGallery` (shared; count-based layout, lightbox) for its 0–3 `news_photos`; 404s for a non-existent or non-published slug |
| `/transparency` | Transparency portal | `TransparencyHero`, `DisclosureGrid`, `LatestUploadsSection`, `LegislativeSection`, `FoiSection` — all DB-backed since 2026-07-20 |
| `/transparency/legislative` | Ordinances & resolutions archive | `LegislativeArchive` — searchable (`q`), type-filtered, paginated (`LEGISLATIVE_PAGE_SIZE = 10`) |
| `/transparency/legislative/[slug]` | Ordinance/resolution detail | `getPublishedLegislativeBySlug()`; summary + `PdfViewer` (falls back to an "available at the barangay hall" note when no PDF is attached); 404s for a non-existent or non-published slug |
| `/contact` | Contact | `ContactDetails`, `InquiryForm`, `MapSection` |

**Admin portal** (from `stitch/barangay_admin_create_content_hub`; own layout — sidebar + app bar, no public chrome, `robots: noindex`):

| Route | Page | Composed from |
| --- | --- | --- |
| `/admin` | Redirect (no page) | `firstPermittedPath()` (`src/lib/admin-nav.ts`) sends the user straight to the first module their permissions allow; the Create Content hub this used to render is deleted |
| `/admin/officials` | Officials Directory | `OfficialsManager` (table + drawer editor, portrait upload, achievements sub-list — `AchievementsEditor` + `AchievementPhotoUploader`); permission `manage-officials` |
| `/admin/services` | Services Management | `ServicesManager` (table + drawer editor) + `AssistanceCategoriesPanel` (SuperAdmin add/rename/reorder/retire the assistance category picker) |
| `/admin/applications` | Certificate Applications | `ApplicationsManager` (stat cards + queue + review/create drawers) |
| `/admin/appointments` | Appointments | `AppointmentsManager` (confirm/reschedule/decline, mark completed, walk-in encoding) |
| `/admin/complaints` | Incident Reports | `ComplaintsManager` (take up for mediation, resolve/dismiss, walk-in encoding) |
| `/admin/assistance` | Assistance Requests | `AssistanceManager` (take up for review, grant/decline, walk-in encoding) |
| `/admin/transparency` | Transparency | `TransparencyManager` (tabbed: Legislative — `LegislativeManager`, stat cards + directory + drawer; Public Documents; Projects) + `TransparencyCategoriesPanel` (SuperAdmin add/rename/reorder/retire the transparency category picker); permission `manage-transparency`. DB-backed, renamed from `/admin/legislative` 2026-07-20 |
| `/admin/events` | Event Calendar | `EventsManager` (DB-backed — schedule + category/status filters + `MiniCalendar` + drawer editor with cover-image upload); permission `manage-news` |
| `/admin/news` | News & Announcements | `NewsManager` (DB-backed — tabbed News / Announcements card grids + filters + drawer editors + photo uploader) + `NewsCategoriesPanel` (SuperAdmin add/rename/reorder/retire the news category picker); permission `manage-news` |
| `/admin/settings` | Settings | `SettingsPanel` (profile, security, preferences, team) |

Admin mock data lives in `src/features/admin/data.ts`: the real nav constant
(`ADMIN_NAV_ITEMS`) plus one seed array still on mocks — `ADMIN_TEAM`, which nothing renders
— and label maps (`EVENT_CATEGORY_LABELS`, `TEAM_ROLE_LABELS`; `EVENT_CATEGORY_LABELS` is
still a mock-era label map but is now used to label the DB-backed `events.category` enum, not
a mock field). `ADMIN_USER`, `CONTENT_TYPE_ACTIONS`, `RECENT_DRAFTS`, `PUBLISHING_ACTIVITY`,
and `DRAFT_STATUS_LABELS` were deleted along with the `/admin` content hub they backed.
Services, applications, news, announcements, events, and (as of 2026-07-20) transparency
documents are now DB-backed (see the Routes table
and §2); their old mocks (`ADMIN_SERVICES`, `MOCK_SERVICES`, `ADMIN_APPLICATIONS`,
`CERTIFICATE_SERVICES`, `certificateTitle()`, `ADMIN_NEWS`, `ADMIN_EVENTS`, `ADMIN_LEGISLATIVE`)
and the `AdminServiceRecord` / `AdminApplicationRecord` / `ApplicationFormValues` /
`AdminNewsRecord` / `AdminEventRecord` / `NewsFormValues` / `EventFormValues` /
`AdminLegislativeRecord` / `LegislativeFormValues` / `AdminLegislativeStatus` types they
used were deleted once the DB queries replaced every consumer — as was the whole
`src/features/announcements/data.ts` file (only `queries.ts` and `components/` remain in
that feature), `src/features/transparency/data.ts` (deleted outright — only `queries.ts`
and `components/` remain in that feature too), and the announcements/events seed arrays in
`src/features/home/data.ts`.
Admin entity types in `src/types/index.ts`: the envelope/record and `*FormValues` contract
types listed in §2. `ContentDraft`, `PublishingActivityEntry`, and `ContentTypeAction` were
deleted along with the `/admin` content hub they backed. Public routes sit in the
`app/(public)` route group; admin has its own `app/admin/layout.tsx`.

### Folder architecture

```
src/
├── app/            # Routes (thin — compose feature sections only)
├── components/
│   ├── ui/         # Primitives: Button, Badge, Card, Container, Section,
│   │               # SectionHeading, IconCircle, DataTable, form fields, Accordion
│   ├── layout/     # SiteHeader (fixed floating pill, client), SiteFooter, PublicShell
│   ├── navigation/ # DesktopNav, MobileNav, NavLink (active-route aware)
│   ├── sections/   # PageHero, CtaBanner (cross-page shells)
│   └── shared/     # AnnouncementCard, EventCard, OfficialCard, StatCard,
│                   # EmergencyHotlinesCard, DividerHeading
├── features/       # home | about | officials | services | announcements | events |
│                   # transparency | contact — each: components/ + index.ts, plus
│                   # data.ts (static mock content) or queries.ts (DB-backed reads,
│                   # `import "server-only"`) depending on whether the feature has
│                   # been migrated off mocks yet (see the changelog above for which)
├── hooks/          # useDisclosure
├── lib/            # cn(), formatDate(), toCalendarParts(), toTelHref()
├── types/          # All shared interfaces (single source of entity shapes)
└── constants/      # SITE identity, NAV_ITEMS, EMERGENCY_HOTLINES, footer links
```

---

## 2. Data Model (already typed)

All entity shapes live in **`src/types/index.ts`**. These interfaces are the de-facto API
contract — design DB tables / API responses to match (or evolve them deliberately).

| Type | Used by | Notes for backend |
| --- | --- | --- |
| `Announcement` | Home pulse column, news sidebar | `date` is ISO `YYYY-MM-DD`; flags: `isNew`, `urgent`. DB-backed since Plan 3 — `listPublishedAnnouncements()` reads the `announcements` table (`supabase/migrations/0007_news_content.sql`) |
| `CommunityEvent` | Home events column | `date` ISO + `time` + `venue` strings. DB-backed since Plan 3 — `listUpcomingEvents()` reads the `events` table, filtered `event_date >= today` |
| `NewsCategoryRow`, `GalleryPhoto`, `NewsArticleListItem`, `NewsArticleDetail` | `/announcements`, `/announcements/[slug]`, news sidebar | Public read shapes (`src/features/announcements/queries.ts`), DB-backed since Plan 3 (`news_articles`/`news_photos`/`news_categories` tables). `NewsArticleDetail extends NewsArticleListItem` with `body` + full `photos: GalleryPhoto[]`; `coverSrc`/`GalleryPhoto.src` are resolved through `photoUrl()`, which passes a full `http(s)` URL through unchanged or builds a `public-media` storage URL from a bare object path. `GalleryPhoto` was `NewsPhoto` until the 2026-07-21 officials-achievements plan renamed it so achievement photo lists could share the same type and the same `PhotoGallery` component (`src/components/shared/photo-gallery.tsx`, moved there from `features/announcements/components/news-gallery.tsx` in the same plan) |
| `ContentStatus` | News/announcements/events workflow | `"draft" \| "in-review" \| "published" \| "archived"` — no `scheduled` status; `published_at` is set once, on first transition into `published` |
| `AdminNewsArticleRow`, `AdminAnnouncementRow`, `AdminEventRow`, `NewsArticleValues`, `AnnouncementValues`, `NewsCategoryValues` | `/admin/news`, `/admin/events` | DB-backed admin list rows + drawer-form body shapes (replaced the deleted `AdminNewsRecord`/`AdminEventRecord`/`NewsFormValues`/`EventFormValues` mock envelopes) |
| `OfficialGroup`, `OfficialListItem`, `OfficialDetail` | `/officials`, `/officials/[slug]` | Public read shapes (`src/features/officials/queries.ts`), DB-backed since 2026-07-21 (`officials` table, `supabase/migrations/0012_officials.sql`). `group: "executive" \| "council" \| "administration"`; `photoUrl` is always resolved (publishing requires a portrait); `OfficialDetail extends OfficialListItem` with `term`, `bio` (empty on every seeded row today), and `achievements: PublicAchievement[]` (added 2026-07-21, see the achievements row below) |
| `AdminOfficialRow`, `OfficialValues` | `/admin/officials` | DB-backed admin list row + drawer-form body shape (replaces the old static `Official` array) |
| `AchievementValues`, `AdminAchievement`, `PublicAchievement` | `/officials/[slug]`, `/admin/officials` | DB-backed since 2026-07-21 (`official_achievements`/`official_achievement_photos` tables, `supabase/migrations/0013_official_achievements.sql`, **staging only**) — see the officials-achievements changelog entry above. `AchievementValues` (`title`/`description`/`dateLabel`) is the shared field set; `AdminAchievement` adds `id`/`isVisible`/`photos: GalleryPhoto[]` for the drawer, `PublicAchievement` adds `id`/`photos: GalleryPhoto[]` for the profile page. Public boundary: `is_visible = true` and non-empty `title`, on top of the owning official's `status = 'published'` |
| `Service` | Services page | `requirements: string[]`, `tone: "primary" \| "danger"`; `icon` is a Lucide component — store an **icon name string** server-side and map on the client |
| `QuickService` | Home quick-services grid | Same icon caveat |
| `Stat` | Home "At a Glance" | value/note are display strings |
| `HeroSlide` | Home hero carousel | `src` is a bundled static image import from `src/images/carousel/` (real photos); an API should return image URLs from owned storage instead |
| `LegislativeType`, `LegislativeListItem`, `LegislativeDetail` | `/transparency`, `/transparency/legislative`, `/transparency/legislative/[slug]` | Public read shapes (`src/features/transparency/queries.ts`), DB-backed since 2026-07-20 (`legislative_documents` table). `LegislativeDetail extends LegislativeListItem` with `summary`; `fileUrl` is resolved through `documentUrl()` (null when no PDF is attached yet) |
| `TransparencyDocumentItem`, `TransparencyProjectItem`, `TransparencyCategoryRow` | `/transparency` (`DisclosureGrid`, `LatestUploadsSection`) | Public read shapes, DB-backed since 2026-07-20 (`transparency_documents`/`transparency_projects`/`transparency_categories` tables); `categoryIconName` is an icon name string, resolved via `resolveIcon()` |
| `AdminLegislativeRow`, `AdminTransparencyDocumentRow`, `AdminTransparencyProjectRow`, `LegislativeValues`, `TransparencyDocumentValues`, `TransparencyProjectValues`, `TransparencyCategoryValues` | `/admin/transparency` | DB-backed admin list rows + drawer-form body shapes (replaced the deleted `AdminLegislativeRecord`/`LegislativeFormValues` mock envelopes); `status: ContentStatus` on every row |
| `TimelineEntry`, `Milestone`, `ValueItem` | About page | Mostly CMS-style static content; `TimelineEntry.image` is `string \| StaticImageData` + optional `imageFit: "cover" \| "contain"` — an API should return URLs |
| `WasteCollectionSlot` | Services waste schedule | `days`/`note` are display strings; same icon caveat |
| `Hotline`, `ContactChannel`, `NavItem` | Site-wide | Live in `constants/site.ts` (`SocialLink` and `SOCIAL_LINKS` were deleted 2026-08-05 — the site has no social links) |
| `AdminTeamMember` | Team management in Settings, still on mock data | Envelope type wrapping team roster — the write-side API contract |
| `AdminServiceRow` | `/admin/services` | DB-backed (`services` table, `supabase/migrations/0004_services.sql`) — replaced the old `AdminServiceRecord` mock envelope; icon travels as `iconName` |
| `ApplicationRow`, `ApplicationStatus`, `PublicApplicationValues`, `WalkInApplicationValues`, `ApplicationReviewValues`, `TicketLookupResult` | `/services/apply/[slug]`, `/track`, `/admin/applications` | DB-backed (`applications` table, `supabase/migrations/0005_applications.sql`) — replaced the old `AdminApplicationRecord`/`ApplicationFormValues` mocks; status flow `pending → approved → released`, or `pending → rejected`; `PublicApplicationValues`/`WalkInApplicationValues` are the submission bodies (online vs. walk-in), `ApplicationReviewValues` is the approve/reject PATCH body |
| `AppointmentRow`/`ComplaintRow`/`AssistanceRow`, `AssistanceCategoryRow`, `Public*Values`/`WalkIn*Values`, `*ReviewValues`/`ComplaintCloseValues`/`AssistanceDecisionValues`, `TicketKind` | `/appointments/new`, `/complaints/new`, `/assistance/new`, `/admin/appointments`, `/admin/complaints`, `/admin/assistance`, `/admin/services`, `/track` | DB-backed (`appointments`/`complaints`/`assistance_requests`/`assistance_categories` tables, `supabase/migrations/0006_ticketing_flows.sql`) — no mock precursor, built directly against the DB; status flows are `pending/received → confirmed/under-review → completed/resolved/dismissed/granted`, each with a `declined`/`rejected`-style negative branch; `TicketLookupResult` (shared with applications, see the row above) is what `/track` renders — a complaint's `narrative`/`respondent`/`location` are never loaded into it |

⚠️ **Icon fields**: several types carry `icon: LucideIcon` (a React component). An API can't
return components — return an icon name (e.g. `"file-text"`) and add a small
`iconName → component` lookup map on the frontend when wiring up.

### Where the mock data lives (what the backend replaces)

| File | Content |
| --- | --- |
| `src/features/home/data.ts` | Quick services, 4 stats, 4 hero carousel slides (real photos, statically imported), CTA image. ~~3 announcements, 4 events~~ — removed in Plan 3; `CommunityPulseSection` now reads `listPublishedAnnouncements()` / `listUpcomingEvents()` live from the DB |
| `src/features/about/data.ts` | Mission, vision (real, from the BDP), core values, captain message (placeholder), history timeline + community programs (real, sourced from the Ecological Profile) |
| `src/features/officials/data.ts` | **Reduced to `TERM_LABEL` only, 2026-07-21.** The 12-official array and `getOfficialsByGroup()` are gone — reads go through `src/features/officials/queries.ts` (`import "server-only"`) against the `officials` table (`supabase/migrations/0012_officials.sql`); content is edited exclusively through `/admin/officials`. Portraits moved from bundled static imports to `public-media/officials/`, except the Punong Barangay's, still bundled for the About-page `CAPTAIN` block |
| `src/features/services/data.ts` | 4 services with requirements, emergency-assistance block, waste collection schedule (real days from the BDP) |
| ~~`src/features/announcements/data.ts`~~ | **Deleted in Plan 3.** News articles, announcements, and events are all DB-backed now — reads go through `src/features/announcements/queries.ts` (`import "server-only"`) and `src/features/events/queries.ts` against `news_articles`/`news_photos`/`announcements`/`events` (`supabase/migrations/0007_news_content.sql`); content is edited exclusively through `/admin/news` and `/admin/events` |
| ~~`src/features/transparency/data.ts`~~ | **Deleted 2026-07-20.** Ordinances/resolutions, budget/financial documents, and projects are all DB-backed now — reads go through `src/features/transparency/queries.ts` (`import "server-only"`) against `legislative_documents`/`transparency_documents`/`transparency_projects`/`transparency_categories` (`supabase/migrations/0009_transparency.sql`); content is edited exclusively through `/admin/transparency` |
| `src/features/contact/data.ts` | Contact channels, inquiry subject options, map image |
| `src/constants/site.ts` | Site identity, address/phone/email/hours, nav, 5 emergency hotlines, social + government + legal links |

---

## 3. Backend Work Items (in priority order)

### A. ~~Contact inquiry form~~ — **BUILT 2026-07-22** (migration `0019`)
`src/features/contact/` now holds `schema.ts` + `actions.ts` beside the form. `submitInquiry`
rate-limits, validates, and writes to `inquiries`; staff answer from `/admin/inquiries`
behind the new `handle-inquiries` permission. See the sub-project 10 phase D changelog entry
above and spec §8.

**Still needed**: ~~the email half~~ **BUILT 2026-07-30** (§2D Plan 1,
`docs/superpowers/specs/2026-07-30-resend-email-integration-design.md`). `submitInquiry`
sends the resident an acknowledgment (`InquiryAcknowledgedEmail`) — this is what makes the
form's "within 24-48 business hours" promise real. The send is best-effort: `sendEmail()`
fails open by construction (`src/lib/email.ts`), so an email outage never turns into a failed
submission. ~~It also emails every `handle-inquiries` holder a staff notification
(`InquiryStaffNotifyEmail`, `replyTo` set to the resident's own address so hitting Reply
reaches them, not the notifications inbox), resolved through
`staffEmailsFor()` (`src/lib/notifications.ts`).~~ **REMOVED 2026-08-06** on the project
owner's request (`docs/superpowers/specs/2026-08-06-superadmin-password-and-staff-email-
removal-design.md`): that staff notification, its template, `replyTo`, and
`staffEmailsFor()`/`staffQualifies()` are all deleted — `src/lib/notifications.ts` is now
pure functions over a static registry with no database access at all. **Staff learn a new
inquiry arrived only from the in-portal bell and the sidebar count badge** (the existing
60-second poll over `NOTIFICATION_QUEUES`, unchanged); nothing emails them. §2D's
Plan 2 (~~feedback's staff alert~~, the four ticketing flows' own receipts and status notices —
`docs/superpowers/plans/2026-07-30-resend-email-remaining-triggers.md`) shipped 2026-07-30
too.

### B. ~~Newsletter / SMS alerts signup~~ — **BUILT 2026-07-22** (migration `0019`)
`subscribeToAlerts` in `src/features/announcements/actions.ts` writes to
`alert_subscribers`, normalising the mobile number so the unique index de-duplicates.

**Dispatch pipeline and unsubscribe path: dropped 2026-08-10, not deferred.** Nothing sends
to `alert_subscribers` and nothing will until someone reopens the decision; the only
unsubscribe is a direct DB edit (`is_active`, `unsubscribed_at` exist for it). Both were
prerequisites before the list could be used, and the list is not being used — the public
site lost its last signup entry point on 2026-08-05 when both `NewsletterForm` call sites
were removed, so the table stopped gaining rows anyway. `subscribeToAlerts` stays live,
Turnstile-gated and rate-limited, reachable from no UI. Broadcasting to residents is a new
feature to design (and an SMS provider decision), not a gap to close here.

### B2. ~~Site feedback widget~~ — **BUILT 2026-07-23** (migration `0023`)
A floating button on every public page (mounted once in `PublicShell`) opens an anonymous
form for feedback about the **website** — bugs, broken pages, suggestions, praise.
`submitFeedback` in `src/features/feedback/actions.ts` rate-limits (3/hour/IP), validates with
Zod, uploads an optional screenshot, and writes to `feedback`. Staff triage it from the
**Feedback** tab of `/admin/inquiries`, behind the same `handle-inquiries` permission.

`feedback` columns: `category` (enum: general/bug/feature/complaint/praise), `subject`,
`message`, `rating` (1–5, null = unrated), `page_path` (captured, path only), `screenshot_path`,
`status` (enum: new/in_progress/resolved/dismissed), `staff_note`, `handled_by`, `handled_at`.

**No PII by design** — no name, no email, no stored IP. So there is no DPA consent field and
**no reply path**: staff cannot follow up on a report, ever. `/contact` remains the channel for
anything a resident needs an answer to.

Screenshots live in a **private** `feedback-media` bucket with no read policy; the admin query
mints ten-minute signed URLs in one batch per page load. This is the only private bucket in the
project, because a screenshot can contain the sender's own account page or ticket.

**Nothing is still needed here — both items below are settled decisions, not gaps**:
- **Staff notification on arrival — deliberately none.** ~~Built 2026-07-30 (§2D Plan 2):
  `submitFeedback` emailed every `handle-inquiries` holder via `FeedbackStaffNotifyEmail`,
  reusing `staffEmailsFor()` from item A above.~~ **REMOVED 2026-08-06** on the project
  owner's request, with the same design doc as item A. `submitFeedback` now emails **nobody**
  — it never had a resident-facing send (feedback stays anonymous by design), so its entire
  email path is gone. Staff see new feedback only in the Feedback tab's count badge and the
  bell. Treat this as settled, not as a gap to close: re-adding a staff alert here reverses an
  explicit decision.
- **Spam housekeeping — dropped 2026-08-10, manual by design.** The endpoint is anonymous
  and accepts images, so a flood needs a human: `deleteFeedback` is SuperAdmin-only and
  reachable only from a `dismissed` row, and it removes the screenshot with the row.
  Automatic pruning is not planned — nothing may delete a resident's report on its own
  judgement, the same reasoning that rejected a storage sweeper in the transactional-uploads
  spec (§2.8 / umbrella §3.3). The rate limit (3/hour/IP) is the actual flood control, and
  `scripts/report-orphaned-media.mjs` **does** cover `feedback-media` now — it gained that
  case in the 2026-07-29 rewrite, so the note that it doesn't is stale as well as closed.

### C. Content management (read APIs or CMS)
Replace the `data.ts` constants, roughly in order of how often the content changes:

1. ~~**Announcements + events + news articles** (changes weekly) — list endpoints with
   pagination; "LOAD MORE NEWS" button in `news-feed.tsx` is the pagination hook.~~
   **BUILT 2026-07-18 — see the news-content-management changelog entry above.**
   `news_articles`/`news_photos`/`announcements`/`events`/`news_categories` tables,
   real link-based pagination (not a "load more" button), photo uploads to a new
   `public-media` Storage bucket, and a `draft → in-review → published → archived`
   workflow (no scheduling). `/announcements/[slug]` article detail pages exist now.
2. ~~**Transparency documents** (changes monthly) — document entity with real file storage
   (S3-style bucket), categories, and the ordinance **search** endpoint
   (`disclosure-grid.tsx` has a search form pointing at `#`). Ordinances/resolutions
   (`LegislativeDocument`) additionally carry a `summary` shown in the expandable table rows.~~
   **BUILT 2026-07-20 — see the transparency-documents changelog entry above.**
   `legislative_documents`/`transparency_documents`/`transparency_projects`/
   `transparency_categories` tables, PDF upload to the new `public-documents` Storage
   bucket (10MB cap), a real searchable `/transparency/legislative` archive (type filter +
   pagination), and slug detail pages with an inline PDF viewer.
3. ~~**Officials** (changes per term) — CRUD + photo upload.~~ **BUILT 2026-07-21 — see the
   officials-directory changelog entry above.** `officials` table (migration 0012), CRUD
   through `/admin/officials`, portraits uploaded to `public-media/officials/`. New
   `/officials/[slug]` detail route. Bios are empty and emails/phones remain
   placeholder-shaped pending real content from the barangay.
4. **Services** (rarely changes) — CRUD with requirements list.
5. **Site settings** (hotlines, hours, socials) — key-value settings table.
6. **About-page content** (effectively static) — lowest priority; can stay in code.

### D. File/media storage
Most site images are still hotlinked Google URLs from the design tool — they can expire.
A public Supabase Storage bucket, **`public-media`**, now exists (added by Plan 3,
`supabase/migrations/0007_news_content.sql`) and is live for news/announcement/event
photo uploads (2MB cap, JPEG/PNG/WebP, validated client- and server-side) — the "move to
owned storage" destination this item asked for is built, and every *new* upload has gone
there since. **Migrating the remaining hotlinked `lh3` seed images was dropped as tracked
work on 2026-08-10** — the hotlinks stay. They render, and the resolvers pass a full
`http(s)` URL straight through rather than treating it as a storage path, so nothing
depends on the migration happening. `next.config.ts` `images.remotePatterns` and the CSP's
`img-src` both allow-list `lh3.googleusercontent.com` alongside the Supabase storage host,
and both must keep doing so. Note the bucket names below are pre-`0028`: `public-media` and
`public-documents` were replaced by the per-content-type pairs and deleted (see item 11 of
§6). ~~Transparency PDFs still need upload + download endpoints —
`public-media` is images-only today (the upload actions reject anything outside
`image/jpeg|png|webp`).~~ **BUILT 2026-07-20** — a second bucket, **`public-documents`**,
now handles PDF upload + download (10MB cap), separate from `public-media` precisely
because it needed a different type/size policy than images.

### E. Admin panel + auth
The admin **UI now exists in full** (`/admin` redirects to the first module the signed-in user is permitted to reach; sections for services, certificate applications, appointments, complaints, assistance requests, transparency documents, events, news, and settings) and sits behind real auth. Services, applications, the three ticket queues, news, announcements, events, and (as of 2026-07-20) transparency documents are all DB-backed now; only team management (in Settings) remains on mock data (`ADMIN_TEAM` in `features/admin/data.ts`) — nothing renders it yet. The old "Recent Drafts" hub widget and its `RECENT_DRAFTS` mock were deleted along with the `/admin` content hub. Remaining backend work, in order:

1. ~~**Auth first** — the `/admin` tree must sit behind a login (middleware guard + session);
   `ADMIN_USER` in `features/admin/data.ts` is the placeholder for the session user.~~
   **BUILT 2026-07-15 — see the auth-foundation changelog entry above.** Middleware guard,
   `/admin/login`, SuperAdmin + per-permission checks; `ADMIN_USER` remains only where a
   later plan hasn't replaced it yet.
2. **Drafts model** — `ContentDraft`/`RECENT_DRAFTS` (the hub's "Recent Drafts" widget) is
   still mock; the workflow it implied (`draft → in-review → published`) has since shipped
   as the real `ContentStatus` (`draft → in-review → published → archived`) on news,
   announcements, events, applications, and the three ticket types — only the hub widget
   itself hasn't been wired to a real cross-table query yet.
3. ~~**Audit log** — `PublishingActivityEntry` maps to an activity/audit table
   (who, what, when, link to live page).~~ **BUILT 2026-07-15** — a real `audit_log` table
   feeds `/admin`'s Publishing Activity via `listRecentActivity()`
   (`src/features/admin/queries/audit.ts`); the old `PUBLISHING_ACTIVITY` mock constant is
   unused now.
4. **Editors** — ~~the create/edit forms already exist as drawer UIs (`ServicesManager`,
   `LegislativeManager`, `EventsManager`, `NewsManager`, each with typed `*FormValues`
   contracts) under `/admin/*`; the backend wires them to real endpoints in (C) instead of
   building forms from scratch.~~ Done for `ServicesManager`, `NewsManager`,
   `EventsManager`, and (as of 2026-07-20) `LegislativeManager` and the rest of the
   `TransparencyManager` tabs — every admin section is now wired to real Server Actions.
5. **Application processing** — ~~`/admin/applications` models the certificate-request
   queue end-to-end~~ **BUILT 2026-07-17 — see the applications-flow changelog entry above.**
   Delivered as Server Actions rather than the REST sketch proposed here: residents apply at
   `/services/apply/[slug]`, track at `/track`, staff approve → release / reject and encode
   walk-ins. Status flow is `pending → approved → released`, or `rejected` — a `released`
   step this item did not anticipate. Remarks are required on rejection as proposed, and the
   reviewer identity is the real signed-in user, not `ADMIN_USER`.
6. **Appointment / complaint / assistance processing** — ~~`/admin/appointments`,
   `/admin/complaints`, and `/admin/assistance` model the remaining three ticket
   queues end-to-end~~ **BUILT 2026-07-17 — see the ticketing-flows changelog entry
   above.** Same pattern as (5): Server Actions, service-role client, walk-in
   encoding, real reviewer identity. ~~**Still outstanding: emailing residents their
   ticket number or a status update**~~ **BUILT 2026-07-30** (§2D Plan 2,
   `docs/superpowers/plans/2026-07-30-resend-email-remaining-triggers.md`). All four flows
   — applications, appointments, complaints, assistance, online and walk-in alike — now
   email a submission receipt when the resident gave an email address, and the 8
   "final outcome" status transitions (approved/rejected, confirmed/declined,
   resolved/dismissed, granted/declined) each email a matching notice.
   **Mid-flow updates now email too, 2026-08-02** (the ticket-timeline-updates feature —
   see CLAUDE.md's "Progressive ticket timeline" bullet). Staff can post a resident-visible
   update or an information request to any of the four queues without it being a terminal
   decision; `postTicketUpdate` sends `TicketUpdateEmail` when the resident has an email and
   the "Email the resident" toggle is on. ~~A resident's `/track` reply back emailed every
   holder of that queue's permission via `TicketReplyStaffNotifyEmail`.~~ **REMOVED
   2026-08-06** on the project owner's request (same design doc as item A above):
   `submitTicketReply` now emails nobody, and `REPLY_KINDS` in
   `src/features/track/actions.ts` narrowed to `Record<TicketKind, { table: string }>` because
   its `permission`/`label`/`path` fields existed only to address and link that email. **Staff
   learn a resident replied only from the `replied_at` column and the "New reply" pill it
   drives in the queue table** — a reply flips the ticket to `under-review`, which the
   notification registry correctly does not count as untouched work, so that pill is now the
   only signal there is. Everything resident-facing above is untouched. This was the one gap
   Plan 2 left: it fired only on submission and the 8 terminal transitions, never on anything
   in between, because there was no mid-flow event in the data model to email about until this
   feature added `ticket_updates` and `awaiting-info`.

Citizen accounts are **not** required by any current UI.

### Dangling CTAs that imply future endpoints
~~"Apply Online" per service~~ (**live since 2026-07-17** — links to `/services/apply/[slug]`
on `tone === "primary"` services), ~~"Set an Appointment"~~ (**live since 2026-07-17** —
links to `/appointments/new`), ~~"File a Complaint"~~ (**live since 2026-07-17** — the
blotter `tone === "danger"` CTA now links to `/complaints/new`, gated by the
`blotter-complaints` service row's `is_available` toggle), ~~"Social Services
Assistance"~~ / ~~"Request Assistance"~~ (**live since 2026-07-17** — links to
`/assistance/new`), ~~per-article "Read More"~~ (**live since 2026-07-18** — links to
`/announcements/[slug]`), "Subscribe to Alerts", "Register as Resident", "Submit FOI
Request", "Download All Forms". The rest still link to `/services`, `/contact`, or `#`.
Each is a candidate feature — none has UI beyond the button.

---

## 4. Suggested API Surface (v1)

> **Superseded in part.** This was sketched before the backend existed. The build went with
> **Server Actions + Server Components, not a REST API** (see the changelog entries above),
> so the rows below are a statement of the *data* each surface needs, not endpoints to build.
> Already delivered against the DB: `/api/services` (migration 0004) and the three
> applications rows (migration 0005) — the latter reference `AdminApplicationRecord` /
> `ApplicationFormValues`, types that no longer exist; their live equivalents are
> `ApplicationRow` / `PublicApplicationValues` / `WalkInApplicationValues` in §2. The
> `/api/announcements`, `/api/events`, and `/api/news` rows below are also delivered
> (migration 0007) as query functions, not routes: `listPublishedAnnouncements()` /
> `listUpcomingEvents()` / `listPublishedArticles()` + `getPublishedArticleBySlug()` in
> `src/features/announcements/queries.ts` and `src/features/events/queries.ts`. The
> `/api/documents` and `/api/legislative` rows are likewise delivered (migration 0009) as
> query functions against `transparency_documents`/`legislative_documents`, including the
> search — `listRecentLegislative()` / `getPublishedLegislativeBySlug()` and friends in
> `src/features/transparency/queries.ts`. The `NewsArticle[]`, `TransparencyDocument[]`,
> and `LegislativeDocument[]` return types shown below are all stale — those types were
> deleted outright (2026-07-20) as dead code; the live shapes are `NewsArticleListItem[]`/
> `NewsArticleDetail`, `TransparencyDocumentItem[]`, and `LegislativeListItem[]`/
> `LegislativeDetail` in §2.

```
GET  /api/announcements?page=&limit=      → Announcement[]
GET  /api/events?upcoming=true            → CommunityEvent[]
GET  /api/news?page=&featured=            → NewsArticle[]
GET  /api/officials                       → Official[] (grouped client-side)
GET  /api/services                        → Service[]
GET  /api/documents?category=&q=&page=    → TransparencyDocument[] (drives table + ordinance search)
GET  /api/legislative?type=               → LegislativeDocument[] (type: ordinance | resolution; drives collapsible tables)
GET  /api/stats                           → Stat[]
GET  /api/settings                        → site identity, hotlines, hours, socials
GET  /api/admin/applications?status=&serviceId=&q=&page= → AdminApplicationRecord[]
POST /api/applications                    → ApplicationFormValues (new pending application)
PATCH /api/admin/applications/:id/review  → ApplicationReviewValues (approve/reject)
POST /api/inquiries                       → contact form
POST /api/subscriptions                   → newsletter/SMS signup
```

Since the frontend is Server Components, "API" can equally be **direct DB access in
server components + Server Actions for the two forms** — no REST layer strictly required
if the backend lives in this Next.js app. Choose based on whether other clients (mobile
app, kiosk) will consume the same data.

### Rendering consequence
Pages are currently `○ static`. Once data comes from a DB, pick per-route:
- ISR (`revalidate = 3600`) for announcements/news/transparency — good default.
- Keep about/services/officials static with on-demand revalidation from the admin panel.

---

## 5. Frontend Conventions (keep these when integrating)

- **Pages stay thin** — data fetching should happen in feature section components (they're
  async-ready Server Components) or in the page and passed down; don't put JSX logic in `app/`.
- **Client islands only when interactive**: `SiteHeader` (scroll state), `MobileNav`,
  `AdminMobileNav`, `Accordion`, `LegislativeTable`, `HeroCarousel`, `InquiryForm`,
  `NewsletterForm`, and `PhotoGallery` (`src/components/shared/photo-gallery.tsx` — the
  lightbox shared by the `/announcements/[slug]` gallery and, since 2026-07-21, the
  `/officials/[slug]` achievements timeline; added by Plan 3 as `NewsGallery`, generalized
  and relocated by the officials-achievements plan) are the only public `"use client"`
  files (plus `NavLink`/`useDisclosure` helpers), plus the admin portal's client surface:
  the section managers, their drawer forms and the application/ticket review drawers,
  `NewsPhotoUploader`, `SingleImageUploader` (also Plan 3), `AchievementsEditor` and
  `AchievementPhotoUploader` (2026-07-21), `MiniCalendar`, `ToggleSwitch`, and the
  `Drawer`/`Toast` UI primitives (see §3E). Keep new fetches out of client components.
- **Fixed header clearance**: the header is `fixed`, not in-flow — every page's first
  section must provide generous top padding (`pt-32 md:pt-44` for text-first heroes;
  the home hero panel uses `pt-28 md:pt-36`). New pages/heroes must follow this.
- `NewsletterForm` takes `variant?: "card" | "inline"` — the footer used `inline`, the news
  sidebar the default `card`. **Both call sites were removed on 2026-08-05 on request**, so
  the component and both variants are still in the repo but rendered nowhere, and the public
  site has no alert-signup entry point. `subscribeToAlerts` and `alert_subscribers` are
  untouched; the action is simply unreachable from the UI now.
- Path alias `@/*` → `src/*`. Shared shapes go in `src/types`, shared values in `src/constants`.
- Design tokens only — no raw hex values in components; extend `@theme` in `globals.css`.
- Dates: store/transport ISO strings; format with `lib/format.ts` helpers.
- Verify with `npm run typecheck` and `npm run build` before merging.

---

## 6. Known Gaps / Tech Debt

1. ~~`NewsArticle.dateLabel` mixes real dates and relative strings — normalize when backend
   lands.~~ Resolved by Plan 3: `NewsArticleListItem.dateLabel` is now always derived from
   the real `published_at` timestamp via `formatDate(toManilaDate(...))` — no relative
   strings. ~~The dead `NewsArticle` type itself is unrelated leftover cleanup (see §2).~~
   **Deleted 2026-07-20** along with the rest of the transparency mock cleanup — see the
   transparency-documents changelog entry above.
2. Icon-as-component in data types (see §2 caveat).
3. ~~Most images are still Google-hosted and can break at any time~~ (§3D). **Dropped as
   tracked work 2026-08-10** — the hotlinks are accepted as they are, not queued for
   migration. The inventory below is kept because it is still an accurate map of what is
   hotlinked (minus the admin mock avatar, deleted with `ADMIN_USER`), and because the two
   allow-lists it depends on — `images.remotePatterns` and the CSP's `img-src` — must both
   keep the host. Plan 3 stood up
   owned storage (`public-media`) and news/announcement photo uploads now write there;
   transparency documents got their own bucket (`public-documents`) in the 2026-07-20 plan;
   the 12 official portraits moved off bundled static imports onto `public-media/officials/`
   in the 2026-07-21 officials plan (the Punong Barangay's portrait is the one exception —
   still bundled, reused by the About-page `CAPTAIN` block). What's left hotlinked from
   `lh3.googleusercontent.com` (verified 2026-07-21 by grepping `src/`): the home CTA image
   (`features/home/data.ts`), the contact-page map (`features/contact/data.ts`), the
   transparency hero (`features/transparency/components/transparency-hero.tsx`), the admin
   Dashboard Overview mock avatar (`features/admin/data.ts`), and the seeded news/
   announcement photos from migration 0007 — none migrated onto owned storage yet.
4. ~~Placeholder `#` hrefs: legal links, FOI guide, get-directions, article detail pages
   (no `/announcements/[slug]` route yet — needed once news is dynamic).~~
   `/announcements/[slug]` shipped in Plan 3 with a photo gallery + lightbox; legal links,
   the FOI guide, and get-directions are still `#`. ~~Document `fileUrl`s were also `#`
   placeholders (the old mock `LegislativeDocument`/`TransparencyDocument` types).~~
   **Resolved 2026-07-20** — every document link now resolves through `documentUrl()`
   against the real `file_path` column, `null` (not `#`) when no PDF is attached yet, with
   a graceful "available at the barangay hall" fallback in the UI.
5. No tests yet — when the backend lands, add integration tests around the two forms and
   the document search first.
6. `CAPTAIN.message` on the About page is invented placeholder text presented as direct quotes
   from the real Punong Barangay — replace with his actual message before launch. As of
   2026-07-21, the surrounding captain block (name, role, portrait) reads live from
   `getPublishedExecutiveOfficial()` — the officials-table row with `"group" = 'executive'` —
   with the static `CAPTAIN` values as a fallback if that query returns null; only the quoted
   message itself remains hardcoded, since it still isn't sourced anywhere in the database.
7. Photo thumbnail reordering in `/admin/news` uses accessible up/down buttons rather than
   drag-and-drop — a deliberate choice (§ Plan 3 changelog above) to avoid adding a
   drag-and-drop dependency, not an oversight; revisit only if editors ask for it.
8. Seeded demo content still needs a real editorial pass: the three news articles, three
   announcements, and four events inserted by migration 0007 (and re-dated by 0008), and
   the six legislative documents, six transparency documents, and two projects inserted by
   migration 0009, are all placeholder barangay content, not verified real posts — same
   caveat as the rest of the site's placeholder-shaped data (see the top-of-file summary).
   The migration 0009 seed rows additionally have no PDFs attached (`file_path` is `null`)
   — real documents still need to be uploaded through `/admin/transparency`.
9. All 12 officials seeded by migration 0012 have an **empty `bio`**, and their emails/phones
   remain placeholder-shaped (same caveat as every other placeholder contact field on the
   site) — both pending real content from the barangay.
10. The officials-page achievements timeline (migration 0013, 2026-07-21) shipped with
    **no seeded content** — every official's timeline is empty until barangay staff add
    real achievements through `/admin/officials`. Migration 0013 is on both staging and
    production as of 2026-07-28 (see the top-of-file summary); the empty-timeline gap itself
    is still open.
11. ~~**Media bucket split deploy-order hazard**~~ (migration `0028`, 2026-07-27/28 — see
    CLAUDE.md's media-bucket-split bullet for the full design). **Resolved 2026-07-28** — the
    required sequence (apply `0028` → `scripts/migrate-media-buckets.mjs` →
    `scripts/upload-site-images.mjs` → deploy) was completed on staging and then production;
    both environments are on the new per-content-type public buckets (`news-media`,
    `officials-media`, `events-media`, `announcements-media`, `legislative-media`,
    `transparency-media`, `site-media`, `avatars-media`) with production code deployed and
    current. **Cleanup pass, 2026-07-28:** the old `public-media`/`public-documents` pair is
    now out of the baseline (a fresh environment never creates them) and migration `0030`
    revokes their `public read` policy on existing environments; the dead `photoUrl()`/
    `documentUrl()`/`PUBLIC_MEDIA_BUCKET`/`PUBLIC_DOCUMENTS_BUCKET` code that used to target
    them is deleted from `src/lib/storage.ts`. Deleting the actual blobs needs the Storage API,
    not raw SQL, hence `scripts/delete-old-media-buckets.mjs` (dry-run by default, `--yes` to
    delete, no-ops cleanly if a bucket is already gone). **Checked clean on both staging/dev and
    production, 2026-07-28** (two separate databases in this project, checked under each one's
    own keys): `listBuckets()` found neither `public-media` nor `public-documents` on either
    one — just the 15 new-style buckets. This contradicts item 11's own prior claim that both
    environments still had the old pair; that claim was stale (or the buckets were removed
    outside of tracked history). The old-bucket cleanup is done on both environments — nothing
    was left to delete. `0030` has since been applied to both dev and production (confirmed by
    Justine, 2026-07-29), even though it had no bucket left to act on by the time it ran.
12. **One `npm audit` finding left unfixed on purpose** (security-hardening Plan 1, Task 2,
    2026-07-28): a DoS advisory (GHSA-mh99-v99m-4gvg) against `brace-expansion` reaches this
    project only through ESLint 9's own dependency chain (`eslint` → `@eslint/config-array` →
    `minimatch@3.1.5` → `brace-expansion@1.x`) — a devDependency that never runs against
    production or user-supplied input, only developer-authored glob patterns at lint time. The
    only fix is a same-major-line patch that doesn't exist for the 1.x line; clearing it means
    bumping ESLint to a version whose chain resolves `minimatch` to 10.x / `brace-expansion` to
    5.x, which is a breaking API change (confirmed: pinning `brace-expansion` to `^5.0.8` via
    `overrides` alone breaks `eslint .` outright — `minimatch@3.1.5` calls the old
    `braceExpand()` API the 5.x package no longer exports). Out of scope for a dependency-bump
    task; revisit as its own task when someone is ready to validate an ESLint major upgrade
    across the whole flat-config + `eslint-config-next` + plugin set. The two other advisories
    audit surfaced alongside it — `postcss` (genuinely bundled inside `next`'s own build
    tooling) and `sharp` (an optional dependency `next/image` loads at **runtime** for
    on-demand image optimization, not build tooling) — are fixed with zero breaking changes
    via the same `overrides` block (`package.json`): `postcss@^8.5.23`, `sharp@^0.35.3`.
13. **RLS + CSRF verification pass (2026-07-28 security-hardening Plan 1).** Querying
    `pg_policies` against staging found the `public` schema is **not** fully policy-free as
    CLAUDE.md's "RLS enabled, zero policies" line implies at face value: three rows exist —
    `profiles readable by signed-in staff` (`profiles`, `select to authenticated using (true)`),
    `services readable by anyone` (`services`, `select using (true)`), and
    `assistance categories readable by anyone` (`assistance_categories`, `select using (true)`).
    All three predate this hardening pass — they're from migrations `0001`, `0004`, and `0006`
    respectively (also present in the `0000` baseline squash), each commented in its own
    migration as a deliberate exception for read-only public/staff reference data with no write
    path exposed (every write still goes through the service-role client after a code-level
    permission check). Every other table remains policy-free as documented. This isn't a new
    gap this pass introduced; it's a correction to CLAUDE.md's architecture description, which
    should be read as "no policies on the write-bearing/ticketing tables," not literally zero
    policies anywhere. `storage.objects` carries exactly the expected 8 public-read `SELECT`
    policies, one per public bucket (`announcements-media`, `avatars-media`, `events-media`,
    `legislative-media`, `news-media`, `officials-media`, `site-media`, `transparency-media`) —
    no policy on any `-drafts` bucket or on `feedback-media`, matching the media-bucket-split
    design exactly. Separately, confirmed Next Server Actions reject a forged `Origin` header
    before the action's own permission check runs: a same-origin POST carrying a bogus
    `Next-Action` id reached action-resolution (`404 Not Found`, body `Server action not found.`
    — proves the framework tried to resolve it); the identical request with
    `Origin: https://evil.example.com` was rejected earlier, before resolution (`500 Internal
    Server Error`, body containing `"message":"Invalid Server Actions request."`). The status
    code (500, not the "typically 403" this doc and CLAUDE.md previously assumed) differs from
    expectation but the security property holds: the Origin check runs, and it runs before
    any app-level auth or action logic. No code change resulted from this pass; it verifies
    assumptions this file and CLAUDE.md already documented, and corrects one of them.
14. **Baseline now includes `rate_limit_hits` (fixed 2026-07-28, final whole-branch review pass).**
    Migration `0029` (added by this hardening plan's Task 3) had not been folded into
    `supabase/baseline/0000_baseline_2026-07-23.sql`, breaking the pattern every migration
    through `0028` had followed — a fresh environment (production, a new staging, local dev)
    stood up from the baseline would have gotten a site with **no rate limiting at all**, and
    silently: `checkRateLimit` fails open on the resulting missing-table error, so nothing would
    have errored loudly to reveal the gap. Fixed: the baseline now creates `rate_limit_hits` in
    its own section (placed before the audit-log-immutability section, which must stay last),
    and the file's header comments now say `0001`–`0029` throughout. Any environment that
    already applied the baseline *before* this fix still needs migration `0029` applied
    manually, like every other numbered migration — staging first, then production, per this
    repo's standing rule.
15. **The PDF `<object>` preview was never exercised with real content (security-hardening Plan
    1, Task 5).** No legislative document in the current dev/staging environment has an actual
    uploaded PDF, so the real `<object type="application/pdf">` element in `pdf-viewer.tsx` was
    verified only via injected test elements and a third-party negative control, never real
    content end to end. Worth a real spot-check once a real PDF is uploaded through
    `/admin/transparency`.
16. **Known limitations of the durable rate limiter, accepted rather than fixed (security-
    hardening Plan 1, Tasks 3/4, final whole-branch review pass).**
    - `checkRateLimit`'s check-then-insert is two separate round trips to Postgres, not one
      atomic operation, so a burst of concurrent requests for the same key can all pass the
      count check before any of their inserts land. Accepted as a low-stakes risk: the public
      forms this protects still have their own Zod validation as the real correctness gate
      regardless, and for admin login a sequential attacker (the realistic case) still gets
      exactly the configured limit — `signInWithPassword` itself still gates on real Supabase
      Auth even in the narrow window where the limiter could be raced.
    - Email-keyed login rate limiting (`login:email:<address>`) is a deliberate trade-off, not
      a defect: an attacker who knows an admin's email can lock that admin out of their own
      login by intentionally tripping the limit with 5 wrong passwords every 5 minutes. This
      hardening pass chose to prioritize stopping credential stuffing over guaranteeing
      availability.
    - `requestIp()` falls back to a shared `"unknown"` bucket whenever no reverse proxy sets
      `x-forwarded-for` (host-dependent). On such a host every admin shares one IP-side
      rate-limit budget, so one admin's failed logins can tighten the budget for every other
      admin signing in from that same host.
17. **Turnstile CAPTCHA (security-hardening Plan 2) is code-complete but blocked on a real
    Cloudflare account + site/secret key pair before any deploy**, the same shape as the
    Resend gating in §2D above but with a sharper failure mode. All 8 public anonymous Server
    Actions (`src/lib/turnstile.ts`'s `verifyTurnstileToken`) now verify a Turnstile token
    before doing anything else. With `TURNSTILE_SECRET_KEY` unset: in **development** only,
    verification is skipped (returns `true`, one-time `console.warn`) so a contributor without
    a Cloudflare account isn't blocked. In **production**, the same missing key makes
    `verifyTurnstileToken` **throw** instead of bypassing — every one of the 8 forms
    (certificate applications, appointments, complaints, assistance requests, inquiries,
    feedback, alert subscriptions, ticket lookups) fails on first submit. **This is not caught
    by a build or a smoke test of page loads** — the throw is per-request, so a keyless deploy
    looks perfectly healthy (build succeeds, every page renders) until the first resident
    actually submits a form. Six of the 8 forms only handle a `{ error }` return shape and have
    no error boundary tuned for an unhandled Server Action rejection. **Do not deploy this
    branch to production or staging before `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and
    `TURNSTILE_SECRET_KEY` are both set** (Dashboard → Turnstile → add a site, "Managed" widget
    mode; documented in `.env.example`). Note also that `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is
    inlined into the client bundle at **build** time — setting it in a hosting dashboard after
    a build already happened requires a rebuild, not just a redeploy/restart, or the server
    will enforce verification against a page that never rendered a challenge.
18. **Migration `0031` (`first_name`/`middle_name`/`last_name` on `profiles`, added by the
    2026-08-01 admin-account feature — then still invite-based) must be applied before this
    feature's code deploys** — see CLAUDE.md's "Admin account creation is password-based: the
    SuperAdmin types the new staff member's password" bullet for the silent-failure mode if
    it's skipped. **This requirement is unchanged by the 2026-08-06 reversal**, which removed
    the invite emails but not the split name columns: `listTeamUsers`/`listArchivedTeamUsers`
    still select all three, and `createTeamUser`/`updateTeamUser` still write them via
    `buildFullName()`, so a skipped `0031` still silently yields an empty roster (the query's
    error is caught and `console.error`'d, not thrown) and a create that fails with "Could not
    save the profile. The account was not created." Confirmed applied to the Supabase project this
    repo's `.env.local` points at as of 2026-08-02 (confirmed by Justine); status on any
    other environment (e.g. production, if different) has not been separately confirmed —
    verify before deploying this branch there, per this repo's standing "never assume a
    migration is applied without confirmation" rule.
