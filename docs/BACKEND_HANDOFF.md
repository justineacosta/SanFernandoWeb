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

---

## 1. Current State

| Item | Status |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 — amber + ink design tokens (`brand-*`, `ink-*`, `danger*`) in `src/app/globals.css` (`@theme`); Space Grotesk headings + Inter body |
| Rendering | 100% Server Components except a handful of client islands (see §5) |
| Build | `npm run build` ✅ — all routes prerender static |
| Backend | **None.** All data is hardcoded in `src/features/*/data.ts` and `src/constants/site.ts`; both forms fake their submission client-side |
| Auth | None yet — an **admin portal UI shell exists at `/admin`** (unprotected, mock data, `noindex`); it needs auth before any write capability ships |
| Images | Mostly hotlinked from `lh3.googleusercontent.com` (Stitch design exports) — must move to owned storage. Real bundled exceptions (static imports): hero carousel (`src/images/carousel/`), barangay seal (`src/images/logo/`), all 12 officials' portraits (`src/images/officials/`), About history-timeline images (seal + carousel photo) |

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
| `/announcements` | News & Announcements | `NewsFeed`, `NewsSidebar` (announcements, hotlines, newsletter) |
| `/transparency` | Transparency portal | `TransparencyHero`, `DisclosureGrid`, `LatestUploadsSection`, `LegislativeSection`, `FoiSection` |
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
| `/admin/legislative` | Ordinance & Resolution | `LegislativeManager` (stat cards + directory + drawer) |
| `/admin/events` | Event Calendar | `EventsManager` (schedule + `MiniCalendar` + engagement) |
| `/admin/news` | News & Announcements | `NewsManager` (card grid + filters + drawer) |
| `/admin/settings` | Settings | `SettingsPanel` (profile, security, preferences, team) |

Admin mock data lives in `src/features/admin/data.ts`: hub constants (`ADMIN_NAV_ITEMS`,
`ADMIN_USER`, `CONTENT_TYPE_ACTIONS`, `RECENT_DRAFTS`, `PUBLISHING_ACTIVITY`) plus one seed
array per section still on mocks — `ADMIN_LEGISLATIVE`, `ADMIN_EVENTS`, `ADMIN_NEWS`,
`ADMIN_TEAM` — and label maps (`EVENT_CATEGORY_LABELS`, `TEAM_ROLE_LABELS`,
`DRAFT_STATUS_LABELS`). Services and applications are now DB-backed (see the Routes table
and §2); their old mocks (`ADMIN_SERVICES`, `MOCK_SERVICES`, `ADMIN_APPLICATIONS`,
`CERTIFICATE_SERVICES`, `certificateTitle()`) and the `AdminServiceRecord` /
`AdminApplicationRecord` / `ApplicationFormValues` types they used were deleted once the
DB queries replaced every consumer. Admin entity types in `src/types/index.ts`:
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
│                   # EmergencyHotlinesCard, DocumentLink, DividerHeading
├── features/       # home | about | officials | services | announcements |
│                   # transparency | contact — each: data.ts + components/ + index.ts
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
| `Announcement` | Home pulse column, news sidebar | `date` is ISO `YYYY-MM-DD`; flags: `isNew`, `urgent` |
| `CommunityEvent` | Home events column | `date` ISO + `time` + `venue` strings |
| `NewsArticle` | News feed | `dateLabel` is currently a display string ("2 days ago") — backend should return a real timestamp and let the frontend format |
| `Official` | Officials page | `group: "executive" \| "council" \| "administration"`; optional `badge`, `email`, `phone` |
| `Service` | Services page | `requirements: string[]`, `tone: "primary" \| "danger"`; `icon` is a Lucide component — store an **icon name string** server-side and map on the client |
| `QuickService` | Home quick-services grid | Same icon caveat |
| `Stat` | Home "At a Glance" | value/note are display strings |
| `HeroSlide` | Home hero carousel | `src` is a bundled static image import from `src/images/carousel/` (real photos); an API should return image URLs from owned storage instead |
| `TransparencyDocument` | Transparency table | Needs a real `fileUrl` field (currently `#`) |
| `LegislativeDocument` | Ordinances & resolutions tables | Needs real `fileUrl` from file upload; `summary` (expanded row content) comes from CMS |
| `ProjectStatus` | Transparency project monitoring | `progress: number` (0–100) |
| `TimelineEntry`, `Milestone`, `ValueItem` | About page | Mostly CMS-style static content; `TimelineEntry.image` is `string \| StaticImageData` + optional `imageFit: "cover" \| "contain"` — an API should return URLs |
| `WasteCollectionSlot` | Services waste schedule | `days`/`note` are display strings; same icon caveat |
| `Hotline`, `ContactChannel`, `NavItem`, `SocialLink` | Site-wide | Live in `constants/site.ts` |
| `AdminEventRecord`, `AdminNewsRecord`, `AdminLegislativeRecord`, `AdminTeamMember`, `*FormValues` (events/news/legislative) | Admin portal sections still on mock data | Envelope types wrapping the public entities + drawer-form body shapes — the write-side API contract; statuses (`AdminContentStatus`, `AdminLegislativeStatus`, `AdminEventStatus`) map to content-workflow columns |
| `AdminServiceRow` | `/admin/services` | DB-backed (`services` table, `supabase/migrations/0004_services.sql`) — replaced the old `AdminServiceRecord` mock envelope; icon travels as `iconName` |
| `ApplicationRow`, `ApplicationStatus`, `PublicApplicationValues`, `WalkInApplicationValues`, `ApplicationReviewValues`, `TicketLookupResult` | `/services/apply/[slug]`, `/track`, `/admin/applications` | DB-backed (`applications` table, `supabase/migrations/0005_applications.sql`) — replaced the old `AdminApplicationRecord`/`ApplicationFormValues` mocks; status flow `pending → approved → released`, or `pending → rejected`; `PublicApplicationValues`/`WalkInApplicationValues` are the submission bodies (online vs. walk-in), `ApplicationReviewValues` is the approve/reject PATCH body |
| `AppointmentRow`/`ComplaintRow`/`AssistanceRow`, `AssistanceCategoryRow`, `Public*Values`/`WalkIn*Values`, `*ReviewValues`/`ComplaintCloseValues`/`AssistanceDecisionValues`, `TicketKind` | `/appointments/new`, `/complaints/new`, `/assistance/new`, `/admin/appointments`, `/admin/complaints`, `/admin/assistance`, `/admin/services`, `/track` | DB-backed (`appointments`/`complaints`/`assistance_requests`/`assistance_categories` tables, `supabase/migrations/0006_ticketing_flows.sql`) — no mock precursor, built directly against the DB; status flows are `pending/received → confirmed/under-review → completed/resolved/dismissed/granted`, each with a `declined`/`rejected`-style negative branch; `TicketLookupResult` (shared with applications, see the row above) is what `/track` renders — a complaint's `narrative`/`respondent`/`location` are never loaded into it |

⚠️ **Icon fields**: several types carry `icon: LucideIcon` (a React component). An API can't
return components — return an icon name (e.g. `"file-text"`) and add a small
`iconName → component` lookup map on the frontend when wiring up.

### Where the mock data lives (what the backend replaces)

| File | Content |
| --- | --- |
| `src/features/home/data.ts` | Quick services, 3 announcements, 4 events, 4 stats, 4 hero carousel slides (real photos, statically imported), CTA image |
| `src/features/about/data.ts` | Mission, vision (real, from the BDP), core values, captain message (placeholder), history timeline + community programs (real, sourced from the Ecological Profile) |
| `src/features/officials/data.ts` | 12 officials incl. photos/contacts, `TERM_LABEL`, `getOfficialsByGroup()` — all real names with bundled portraits from `src/images/officials/`; emails/phones placeholder-shaped |
| `src/features/services/data.ts` | 4 services with requirements, emergency-assistance block, waste collection schedule (real days from the BDP) |
| `src/features/announcements/data.ts` | Featured article, 2 articles, 3 sidebar announcements, sidebar hotlines |
| `src/features/transparency/data.ts` | Budget docs, 2 projects, 4 latest uploads, 3 ordinances + 3 resolutions |
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

1. **Announcements + events + news articles** (changes weekly) — list endpoints with
   pagination; "LOAD MORE NEWS" button in `news-feed.tsx` is the pagination hook.
2. **Transparency documents** (changes monthly) — document entity with real file storage
   (S3-style bucket), categories, and the ordinance **search** endpoint
   (`disclosure-grid.tsx` has a search form pointing at `#`). Ordinances/resolutions
   (`LegislativeDocument`) additionally carry a `summary` shown in the expandable table rows.
3. **Officials** (changes per term) — CRUD + photo upload.
4. **Services** (rarely changes) — CRUD with requirements list.
5. **Site settings** (hotlines, hours, socials) — key-value settings table.
6. **About-page content** (effectively static) — lowest priority; can stay in code.

### D. File/media storage
All images are hotlinked Google URLs from the design tool — they can expire. Move to owned
storage; `next.config.ts` `images.remotePatterns` must be updated for the new host.
Transparency PDFs need upload + download endpoints.

### E. Admin panel + auth
The admin **UI now exists in full** (`/admin` content hub + interactive mock screens for services, certificate applications, ordinances & resolutions, events, news, and settings), but it is unprotected and shows mock data. Backend needs, in order:

1. **Auth first** — the `/admin` tree must sit behind a login (middleware guard + session);
   `ADMIN_USER` in `features/admin/data.ts` is the placeholder for the session user.
2. **Drafts model** — `ContentDraft` implies a content workflow: `draft → in-review →
   published`, with author + last-edited tracking. Design the content tables with a
   `status` column from day one so "Recent Drafts" and "Publishing Activity" are real queries.
3. **Audit log** — `PublishingActivityEntry` maps to an activity/audit table
   (who, what, when, link to live page).
4. **Editors** — the create/edit forms already exist as drawer UIs (`ServicesManager`,
   `LegislativeManager`, `EventsManager`, `NewsManager`, each with typed `*FormValues`
   contracts) under `/admin/*`; the backend wires them to real endpoints in (C) instead of
   building forms from scratch.
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
`/assistance/new`), "Subscribe to Alerts", "Register as Resident", "Submit FOI Request",
"Download All Forms", per-article "Read More". The rest still link to `/services`,
`/contact`, or `#`. Each is a candidate feature — none has UI beyond the button.

---

## 4. Suggested API Surface (v1)

> **Superseded in part.** This was sketched before the backend existed. The build went with
> **Server Actions + Server Components, not a REST API** (see the changelog entries above),
> so the rows below are a statement of the *data* each surface needs, not endpoints to build.
> Already delivered against the DB: `/api/services` (migration 0004) and the three
> applications rows (migration 0005) — the latter reference `AdminApplicationRecord` /
> `ApplicationFormValues`, types that no longer exist; their live equivalents are
> `ApplicationRow` / `PublicApplicationValues` / `WalkInApplicationValues` in §2.

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
  `NewsletterForm` are the only `"use client"` files (plus `NavLink`/`useDisclosure`
  helpers), plus the admin portal's client surface: the six section managers, their
  drawer forms and the application review drawer, `MiniCalendar`, `ToggleSwitch`, and
  the `Drawer`/`Toast` UI primitives (see §3E). Keep new fetches out of client components.
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

1. `NewsArticle.dateLabel` mixes real dates and relative strings — normalize when backend lands.
2. Icon-as-component in data types (see §2 caveat).
3. Google-hosted images can break at any time (§3D).
4. Placeholder `#` hrefs: legal links, FOI guide, get-directions, article detail pages
   (no `/announcements/[slug]` route yet — needed once news is dynamic).
5. No tests yet — when the backend lands, add integration tests around the two forms and
   the document search first.
6. `CAPTAIN.message` on the About page is invented placeholder text presented as direct quotes
   from the real Punong Barangay — replace with his actual message before launch.
