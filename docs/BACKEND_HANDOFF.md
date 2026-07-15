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
| `/announcements` | News & Announcements | `NewsFeed`, `NewsSidebar` (announcements, hotlines, newsletter) |
| `/transparency` | Transparency portal | `TransparencyHero`, `DisclosureGrid`, `LatestUploadsSection`, `LegislativeSection`, `FoiSection` |
| `/contact` | Contact | `ContactDetails`, `InquiryForm`, `MapSection` |

**Admin portal** (from `stitch/barangay_admin_create_content_hub`; own layout — sidebar + app bar, no public chrome, `robots: noindex`):

| Route | Page | Composed from |
| --- | --- | --- |
| `/admin` | Create Content hub | `ContentHub` → `ContentTypeCard` ×3, `RecentDrafts`, `PublishingActivity` |
| `/admin/services` | Services Management | `ServicesManager` (table + drawer editor) |
| `/admin/applications` | Certificate Applications | `ApplicationsManager` (stat cards + queue + review/create drawers) |
| `/admin/legislative` | Ordinance & Resolution | `LegislativeManager` (stat cards + directory + drawer) |
| `/admin/events` | Event Calendar | `EventsManager` (schedule + `MiniCalendar` + engagement) |
| `/admin/news` | News & Announcements | `NewsManager` (card grid + filters + drawer) |
| `/admin/settings` | Settings | `SettingsPanel` (profile, security, preferences, team) |

Admin mock data lives in `src/features/admin/data.ts`: hub constants (`ADMIN_NAV_ITEMS`,
`ADMIN_USER`, `CONTENT_TYPE_ACTIONS`, `RECENT_DRAFTS`, `PUBLISHING_ACTIVITY`) plus one seed
array per section — `ADMIN_SERVICES`, `ADMIN_APPLICATIONS` (with `CERTIFICATE_SERVICES` /
`certificateTitle()` derived from the public catalog), `ADMIN_LEGISLATIVE`, `ADMIN_EVENTS`,
`ADMIN_NEWS`, `ADMIN_TEAM` — and label maps (`EVENT_CATEGORY_LABELS`, `TEAM_ROLE_LABELS`,
`DRAFT_STATUS_LABELS`). Admin entity types in `src/types/index.ts`: `ContentDraft`
(status: `draft | in-review`), `PublishingActivityEntry`, `ContentTypeAction`, plus the
envelope/record and `*FormValues` contract types listed in §2. Public routes sit in the
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
| `AdminServiceRecord`, `AdminEventRecord`, `AdminNewsRecord`, `AdminLegislativeRecord`, `AdminTeamMember`, `*FormValues` | Admin portal sections | Envelope types wrapping the public entities + drawer-form body shapes — the write-side API contract; statuses (`AdminContentStatus`, `AdminServiceStatus`, `AdminLegislativeStatus`, `AdminEventStatus`) map to content-workflow columns |
| `AdminApplicationRecord`, `ApplicationStatus`, `ApplicationFormValues`, `ApplicationReviewValues` | Admin applications queue | First-class transactional entity (not an envelope): references `Service` by `serviceId` FK; status flow `pending → approved \| rejected`; form values = submission POST body, review values = review PATCH body |

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
5. **Application processing** — `/admin/applications` models the certificate-request
   queue end-to-end: `POST /api/applications` (`ApplicationFormValues`) for walk-in or
   citizen submissions and `PATCH /api/applications/:id/review`
   (`ApplicationReviewValues`) for approve/reject with remarks (remarks required on
   rejection). Status flow: `pending → approved | rejected`. The mock mutates session
   state only; the reviewer identity comes from `ADMIN_USER` pending real auth (item 1).

Citizen accounts are **not** required by any current UI.

### Dangling CTAs that imply future endpoints
"Apply Online" per service, "Set an Appointment", "File a Complaint" (blotter),
"Subscribe to Alerts", "Register as Resident", "Submit FOI Request", "Download All Forms",
per-article "Read More". All currently link to `/services`, `/contact`, or `#`. Each is a
candidate feature — none has UI beyond the button.

---

## 4. Suggested API Surface (v1)

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
