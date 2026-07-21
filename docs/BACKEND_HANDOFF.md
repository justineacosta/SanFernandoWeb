# Backend Handoff — Barangay San Fernando Website

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
> category is retired). Each ends in an on-screen ticket-number receipt only —
> **no email is sent** (that remains plan 2D, blocked on a Resend account). Three
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
> plan and is worth deleting in a follow-up sweep. **Still remaining**: the seeded
> demo images are still hotlinked from `lh3.googleusercontent.com` — migrating them
> to owned `public-media` storage is future work, same as every other still-hotlinked
> image on the site (§3D, §6).

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
>    `listUploadsPage()` (`src/features/transparency/queries.ts`) fetches all three
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

---

## 1. Current State

| Item | Status |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 — amber + ink design tokens (`brand-*`, `ink-*`, `danger*`) in `src/app/globals.css` (`@theme`); Space Grotesk headings + Inter body |
| Rendering | 100% Server Components except a handful of client islands (see §5) |
| Build | `npm run build` ✅ — static where possible; DB-backed routes (services, tickets, news/announcements/events, `/admin/*`) render dynamically |
| Backend | **Supabase** (Postgres + Auth + Storage), reached through Server Actions and server-only query modules. Services, the four ticket flows, news/announcements/events, and transparency documents (ordinances & resolutions, budget/financial documents, projects) are DB-backed. Still hardcoded: `src/constants/site.ts` and the remaining `src/features/*/data.ts` (officials, about, home stats) |
| Auth | **Supabase Auth**, live. `/admin` is protected; pages gate on `requirePermission(<permission>)` or `requireSuperAdmin()` (`src/lib/auth.ts`), with per-user permission checkboxes and a SuperAdmin role. Portal stays `noindex` |
| Images | News/announcement/event uploads go to Supabase Storage (public bucket `public-media`, 2MB, JPEG/PNG/WebP). Transparency PDFs go to a separate public bucket `public-documents` (10MB cap). Seed rows and the rest of the site are still hotlinked from `lh3.googleusercontent.com` (Stitch design exports) — moving those to owned storage is outstanding. Real bundled exceptions (static imports): hero carousel (`src/images/carousel/`), barangay seal (`src/images/logo/`), all 12 officials' portraits (`src/images/officials/`), About history-timeline images (seal + carousel photo) |

### Routes

| Route | Page | Composed from |
| --- | --- | --- |
| `/` | Home | `HomeHero`, `QuickServicesSection`, `CommunityPulseSection`, `GetInvolvedSection` |
| `/about` | About Us | `MissionVisionSection`, `CaptainMessageSection`, `HistorySection`, `MilestonesSection`, `JoinCommunitySection` |
| `/officials` | Officials directory | `LeadershipDirectory`, `ActionCenterBanner` |
| `/services` | Services directory | `ServicesGrid` (accordion requirements), `WasteScheduleSection`, `HelpSection` |
| `/services/apply/[slug]` | Certificate application form | `ApplyForm` (DB-backed via `getApplyService()`); serves `tone === "primary"` services only — `getApplyService()` returns `null` for `tone === "danger"` (`blotter-complaints`), so this route 404s for it; its service-card CTA now links straight to `/complaints/new` (plan 2C) instead |
| `/appointments/new` | Appointment request form | `AppointmentForm` — preferred date + AM/PM, DB-backed; ends in an on-screen ticket receipt |
| `/complaints/new` | Incident report form | `ComplaintForm`, gated by the `blotter-complaints` service row's `is_available` toggle; renders `ApplyUnavailable` when off |
| `/assistance/new` | Social-service assistance form | `AssistanceForm` — category picker sourced from `assistance_categories`; renders `ApplyUnavailable` if every category is retired |
| `/track` | Ticket status lookup | `TrackLookup` — ticket number + last name, DB-backed via `lookupTicket()`; resolves all four ticket kinds through `tickets_view` (a complaint result shows status only) |
| `/announcements` | News & Announcements | `NewsFeed` (DB-backed via `listPublishedArticles()`; 1 featured + 6/page, real link-based pagination), `NewsSidebar` (DB-backed via `listPublishedAnnouncements()`; hotlines, newsletter) |
| `/announcements/[slug]` | News article detail | `getPublishedArticleBySlug()`; article body + `NewsGallery` (count-based layout, lightbox) for its 0–3 `news_photos`; 404s for a non-existent or non-published slug |
| `/transparency` | Transparency portal | `TransparencyHero`, `DisclosureGrid`, `LatestUploadsSection`, `LegislativeSection`, `FoiSection` — all DB-backed since 2026-07-20 |
| `/transparency/legislative` | Ordinances & resolutions archive | `LegislativeArchive` — searchable (`q`), type-filtered, paginated (`LEGISLATIVE_PAGE_SIZE = 10`) |
| `/transparency/legislative/[slug]` | Ordinance/resolution detail | `getPublishedLegislativeBySlug()`; summary + `PdfViewer` (falls back to an "available at the barangay hall" note when no PDF is attached); 404s for a non-existent or non-published slug |
| `/contact` | Contact | `ContactDetails`, `InquiryForm`, `MapSection` |

**Admin portal** (from `stitch/barangay_admin_create_content_hub`; own layout — sidebar + app bar, no public chrome, `robots: noindex`):

| Route | Page | Composed from |
| --- | --- | --- |
| `/admin` | Create Content hub | `ContentHub` → `ContentTypeCard` ×3, `RecentDrafts`, `PublishingActivity` |
| `/admin/services` | Services Management | `ServicesManager` (table + drawer editor) + `AssistanceCategoriesPanel` (SuperAdmin add/rename/reorder/retire the assistance category picker) |
| `/admin/applications` | Certificate Applications | `ApplicationsManager` (stat cards + queue + review/create drawers) |
| `/admin/appointments` | Appointments | `AppointmentsManager` (confirm/reschedule/decline, mark completed, walk-in encoding) |
| `/admin/complaints` | Incident Reports | `ComplaintsManager` (take up for mediation, resolve/dismiss, walk-in encoding) |
| `/admin/assistance` | Assistance Requests | `AssistanceManager` (take up for review, grant/decline, walk-in encoding) |
| `/admin/transparency` | Transparency | `TransparencyManager` (tabbed: Legislative — `LegislativeManager`, stat cards + directory + drawer; Public Documents; Projects) + `TransparencyCategoriesPanel` (SuperAdmin add/rename/reorder/retire the transparency category picker); permission `manage-transparency`. DB-backed, renamed from `/admin/legislative` 2026-07-20 |
| `/admin/events` | Event Calendar | `EventsManager` (DB-backed — schedule + category/status filters + `MiniCalendar` + drawer editor with cover-image upload); permission `manage-news` |
| `/admin/news` | News & Announcements | `NewsManager` (DB-backed — tabbed News / Announcements card grids + filters + drawer editors + photo uploader) + `NewsCategoriesPanel` (SuperAdmin add/rename/reorder/retire the news category picker); permission `manage-news` |
| `/admin/settings` | Settings | `SettingsPanel` (profile, security, preferences, team) |

Admin mock data lives in `src/features/admin/data.ts`: hub constants (`ADMIN_NAV_ITEMS`,
`ADMIN_USER`, `CONTENT_TYPE_ACTIONS`, `RECENT_DRAFTS`, `PUBLISHING_ACTIVITY`) plus one seed
array still on mocks — `ADMIN_TEAM` — and label maps (`EVENT_CATEGORY_LABELS`,
`TEAM_ROLE_LABELS`, `DRAFT_STATUS_LABELS`; `EVENT_CATEGORY_LABELS` is still a mock-era label
map but is now used to label the DB-backed `events.category` enum, not a mock field).
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
Admin entity types in `src/types/index.ts`:
`ContentDraft` (status: `draft | in-review`), `PublishingActivityEntry`, `ContentTypeAction`,
plus the envelope/record and `*FormValues` contract types listed in §2. Public routes sit in
the `app/(public)` route group; admin has its own `app/admin/layout.tsx`.

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
| `NewsCategoryRow`, `NewsPhoto`, `NewsArticleListItem`, `NewsArticleDetail` | `/announcements`, `/announcements/[slug]`, news sidebar | Public read shapes (`src/features/announcements/queries.ts`), DB-backed since Plan 3 (`news_articles`/`news_photos`/`news_categories` tables). `NewsArticleDetail extends NewsArticleListItem` with `body` + full `photos: NewsPhoto[]`; `coverSrc`/`NewsPhoto.src` are resolved through `photoUrl()`, which passes a full `http(s)` URL through unchanged or builds a `public-media` storage URL from a bare object path |
| `ContentStatus` | News/announcements/events workflow | `"draft" \| "in-review" \| "published" \| "archived"` — no `scheduled` status; `published_at` is set once, on first transition into `published` |
| `AdminNewsArticleRow`, `AdminAnnouncementRow`, `AdminEventRow`, `NewsArticleValues`, `AnnouncementValues`, `NewsCategoryValues` | `/admin/news`, `/admin/events` | DB-backed admin list rows + drawer-form body shapes (replaced the deleted `AdminNewsRecord`/`AdminEventRecord`/`NewsFormValues`/`EventFormValues` mock envelopes) |
| `Official` | Officials page | `group: "executive" \| "council" \| "administration"`; optional `badge`, `email`, `phone` |
| `Service` | Services page | `requirements: string[]`, `tone: "primary" \| "danger"`; `icon` is a Lucide component — store an **icon name string** server-side and map on the client |
| `QuickService` | Home quick-services grid | Same icon caveat |
| `Stat` | Home "At a Glance" | value/note are display strings |
| `HeroSlide` | Home hero carousel | `src` is a bundled static image import from `src/images/carousel/` (real photos); an API should return image URLs from owned storage instead |
| `LegislativeType`, `LegislativeListItem`, `LegislativeDetail` | `/transparency`, `/transparency/legislative`, `/transparency/legislative/[slug]` | Public read shapes (`src/features/transparency/queries.ts`), DB-backed since 2026-07-20 (`legislative_documents` table). `LegislativeDetail extends LegislativeListItem` with `summary`; `fileUrl` is resolved through `documentUrl()` (null when no PDF is attached yet) |
| `TransparencyDocumentItem`, `TransparencyProjectItem`, `TransparencyCategoryRow` | `/transparency` (`DisclosureGrid`, `LatestUploadsSection`) | Public read shapes, DB-backed since 2026-07-20 (`transparency_documents`/`transparency_projects`/`transparency_categories` tables); `categoryIconName` is an icon name string, resolved via `resolveIcon()` |
| `AdminLegislativeRow`, `AdminTransparencyDocumentRow`, `AdminTransparencyProjectRow`, `LegislativeValues`, `TransparencyDocumentValues`, `TransparencyProjectValues`, `TransparencyCategoryValues` | `/admin/transparency` | DB-backed admin list rows + drawer-form body shapes (replaced the deleted `AdminLegislativeRecord`/`LegislativeFormValues` mock envelopes); `status: ContentStatus` on every row |
| `TimelineEntry`, `Milestone`, `ValueItem` | About page | Mostly CMS-style static content; `TimelineEntry.image` is `string \| StaticImageData` + optional `imageFit: "cover" \| "contain"` — an API should return URLs |
| `WasteCollectionSlot` | Services waste schedule | `days`/`note` are display strings; same icon caveat |
| `Hotline`, `ContactChannel`, `NavItem`, `SocialLink` | Site-wide | Live in `constants/site.ts` |
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
| `src/features/officials/data.ts` | 12 officials incl. photos/contacts, `TERM_LABEL`, `getOfficialsByGroup()` — all real names with bundled portraits from `src/images/officials/`; emails/phones placeholder-shaped |
| `src/features/services/data.ts` | 4 services with requirements, emergency-assistance block, waste collection schedule (real days from the BDP) |
| ~~`src/features/announcements/data.ts`~~ | **Deleted in Plan 3.** News articles, announcements, and events are all DB-backed now — reads go through `src/features/announcements/queries.ts` (`import "server-only"`) and `src/features/events/queries.ts` against `news_articles`/`news_photos`/`announcements`/`events` (`supabase/migrations/0007_news_content.sql`); content is edited exclusively through `/admin/news` and `/admin/events` |
| ~~`src/features/transparency/data.ts`~~ | **Deleted 2026-07-20.** Ordinances/resolutions, budget/financial documents, and projects are all DB-backed now — reads go through `src/features/transparency/queries.ts` (`import "server-only"`) against `legislative_documents`/`transparency_documents`/`transparency_projects`/`transparency_categories` (`supabase/migrations/0009_transparency.sql`); content is edited exclusively through `/admin/transparency` |
| `src/features/contact/data.ts` | Contact channels, inquiry subject options, map image |
| `src/constants/site.ts` | Site identity, address/phone/email/hours, nav, 5 emergency hotlines, social + government + legal links |

---

## 3. Backend Work Items (in priority order)

### A. Contact inquiry form — the only true "write" today
`src/features/contact/components/inquiry-form.tsx` (client component).
Currently `setTimeout`-fakes success. Fields: `firstName`, `lastName`, `email`,
`phone?`, `subject` (enum: general | documents | complaint | emergency | others),
`message`, consent checkbox.

**Needed**: `POST /api/inquiries` (or a Next.js Server Action). Add server-side
validation, rate limiting, spam protection, and persistence + email notification to the
barangay office. The Data Privacy Act consent checkbox is already in the UI — log consent
with the record.

### B. Newsletter / SMS alerts signup
`src/features/announcements/components/newsletter-form.tsx` (client). Takes a mobile
number. **Needed**: `POST /api/subscriptions` + dedupe + (later) an SMS/email dispatch
pipeline.

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
3. **Officials** (changes per term) — CRUD + photo upload.
4. **Services** (rarely changes) — CRUD with requirements list.
5. **Site settings** (hotlines, hours, socials) — key-value settings table.
6. **About-page content** (effectively static) — lowest priority; can stay in code.

### D. File/media storage
Most site images are still hotlinked Google URLs from the design tool — they can expire.
A public Supabase Storage bucket, **`public-media`**, now exists (added by Plan 3,
`supabase/migrations/0007_news_content.sql`) and is live for news/announcement/event
photo uploads (2MB cap, JPEG/PNG/WebP, validated client- and server-side) — the "move to
owned storage" destination this item asked for is built, but only the *seed* news/
announcement images were migrated onto it; every other still-hotlinked `lh3` image on the
site (hero-adjacent CTA image, transparency uploads, etc.) remains to be moved. `photoUrl()`
in `src/lib/storage.ts` already handles both a full remote URL and a bare `public-media`
object path, so migrating a field is a data change, not a code change.
`next.config.ts` `images.remotePatterns` already allow-lists both `lh3.googleusercontent.com`
and the Supabase storage host. ~~Transparency PDFs still need upload + download endpoints —
`public-media` is images-only today (the upload actions reject anything outside
`image/jpeg|png|webp`).~~ **BUILT 2026-07-20** — a second bucket, **`public-documents`**,
now handles PDF upload + download (10MB cap), separate from `public-media` precisely
because it needed a different type/size policy than images.

### E. Admin panel + auth
The admin **UI now exists in full** (`/admin` content hub + sections for services, certificate applications, appointments, complaints, assistance requests, transparency documents, events, news, and settings) and sits behind real auth. Services, applications, the three ticket queues, news, announcements, events, and (as of 2026-07-20) transparency documents are all DB-backed now; only team management (in Settings) and the "Recent Drafts" hub widget remain on mock data (`ADMIN_TEAM`, `RECENT_DRAFTS` in `features/admin/data.ts`). Remaining backend work, in order:

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
   encoding, real reviewer identity. **Still outstanding: emailing residents their
   ticket number or a status update** — that is plan 2D, blocked on a Resend
   account; today every flow ends in an on-screen receipt only.

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
  `NewsletterForm`, and (added by Plan 3) `NewsGallery` (the `/announcements/[slug]`
  photo lightbox) are the only public `"use client"` files (plus `NavLink`/`useDisclosure`
  helpers), plus the admin portal's client surface: the section managers, their
  drawer forms and the application/ticket review drawers, `NewsPhotoUploader` and
  `SingleImageUploader` (also Plan 3), `MiniCalendar`, `ToggleSwitch`, and the
  `Drawer`/`Toast` UI primitives (see §3E). Keep new fetches out of client components.
- **Fixed header clearance**: the header is `fixed`, not in-flow — every page's first
  section must provide generous top padding (`pt-32 md:pt-44` for text-first heroes;
  the home hero panel uses `pt-28 md:pt-36`). New pages/heroes must follow this.
- `NewsletterForm` takes `variant?: "card" | "inline"` — the footer uses `inline`, the news
  sidebar uses the default `card`. Both instances hit the same (future) subscribe endpoint.
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
3. Most images are still Google-hosted and can break at any time (§3D). Plan 3 stood up
   owned storage (`public-media`) and news/announcement photo uploads now write there;
   transparency documents got their own bucket (`public-documents`) in the 2026-07-20 plan.
   The seed news/announcement images and every other still-hotlinked image on the site
   (the home CTA image, etc.) haven't been migrated onto owned storage yet.
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
   from the real Punong Barangay — replace with his actual message before launch.
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
