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
> `StaticImageData | string`. Remaining council/administration portraits will be dropped
> into `src/images/officials/` the same way (an unused `BagongPilipinasLogo.png` also sits
> in `src/images/logo/`). Like the carousel, a future API should serve these as image URLs
> from owned storage.

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
| Images | Mostly hotlinked from `lh3.googleusercontent.com` (Stitch design exports) — must move to owned storage. Real bundled exceptions (static imports): hero carousel (`src/images/carousel/`), barangay seal (`src/images/logo/`), Punong Barangay portrait (`src/images/officials/`) |

### Routes

| Route | Page | Composed from |
| --- | --- | --- |
| `/` | Home | `HomeHero`, `QuickServicesSection`, `CommunityPulseSection`, `GetInvolvedSection` |
| `/about` | About Us | `MissionVisionSection`, `CaptainMessageSection`, `HistorySection`, `MilestonesSection`, `JoinCommunitySection` |
| `/officials` | Officials directory | `LeadershipDirectory`, `ActionCenterBanner` |
| `/services` | Services directory | `ServicesGrid` (accordion requirements), `HelpSection` |
| `/announcements` | News & Announcements | `NewsFeed`, `NewsSidebar` (announcements, hotlines, newsletter) |
| `/transparency` | Transparency portal | `TransparencyHero`, `DisclosureGrid`, `LatestUploadsSection`, `LegislativeSection`, `FoiSection` |
| `/contact` | Contact | `ContactDetails`, `InquiryForm`, `MapSection` |

**Admin portal** (from `stitch/barangay_admin_create_content_hub`; own layout — sidebar + app bar, no public chrome, `robots: noindex`):

| Route | Page | Composed from |
| --- | --- | --- |
| `/admin` | Create Content hub | `ContentHub` → `ContentTypeCard` ×3, `RecentDrafts`, `PublishingActivity` |
| `/admin/services` | Services Management | `AdminPlaceholder` stub — awaiting backend module |
| `/admin/events` | Event Calendar | `AdminPlaceholder` stub |
| `/admin/news` | News & Announcements | `AdminPlaceholder` stub |
| `/admin/settings` | User Settings | `AdminPlaceholder` stub |

Admin mock data lives in `src/features/admin/data.ts` (`ADMIN_NAV_ITEMS`, `ADMIN_USER`,
`CONTENT_TYPE_ACTIONS`, `RECENT_DRAFTS`, `PUBLISHING_ACTIVITY`). Admin entity types in
`src/types/index.ts`: `ContentDraft` (status: `draft | in-review`), `PublishingActivityEntry`,
`ContentTypeAction`. Public routes sit in the `app/(public)` route group; admin has its own
`app/admin/layout.tsx`.

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
| `TimelineEntry`, `Milestone`, `ValueItem` | About page | Mostly CMS-style static content |
| `Hotline`, `ContactChannel`, `NavItem`, `SocialLink` | Site-wide | Live in `constants/site.ts` |

⚠️ **Icon fields**: several types carry `icon: LucideIcon` (a React component). An API can't
return components — return an icon name (e.g. `"file-text"`) and add a small
`iconName → component` lookup map on the frontend when wiring up.

### Where the mock data lives (what the backend replaces)

| File | Content |
| --- | --- |
| `src/features/home/data.ts` | Quick services, 3 announcements, 4 events, 4 stats, 4 hero carousel slides (real photos, statically imported), CTA image |
| `src/features/about/data.ts` | Mission, vision, core values, captain message, history timeline, milestones |
| `src/features/officials/data.ts` | 11 officials incl. photos/contacts, `TERM_LABEL`, `getOfficialsByGroup()` — Punong Barangay (Hon. Dominic B. Dela Cruz) has his real bundled portrait; the other 10 are placeholder names/photos |
| `src/features/services/data.ts` | 4 services with requirements, emergency-assistance block |
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
The admin **UI shell now exists** (`/admin` content hub + stub pages for services, events,
news, settings), but it is unprotected and shows mock data. Backend needs, in order:

1. **Auth first** — the `/admin` tree must sit behind a login (middleware guard + session);
   `ADMIN_USER` in `features/admin/data.ts` is the placeholder for the session user.
2. **Drafts model** — `ContentDraft` implies a content workflow: `draft → in-review →
   published`, with author + last-edited tracking. Design the content tables with a
   `status` column from day one so "Recent Drafts" and "Publishing Activity" are real queries.
3. **Audit log** — `PublishingActivityEntry` maps to an activity/audit table
   (who, what, when, link to live page).
4. **Editors** — the three `ContentTypeCard` actions (ordinance/resolution, event,
   news/announcement) need create/edit forms wired to the content APIs in (C); the stub
   pages under `/admin/*` are their mount points.

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
  helpers). Keep new fetches out of client components.
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
