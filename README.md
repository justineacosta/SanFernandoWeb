# Barangay San Fernando — Official Website

The official website of **Barangay San Fernando, San Nicolas, Ilocos Norte** (Philippines) —
a production-grade Next.js application with a full permission-gated admin portal, real-time
ticketing workflows, and a security-hardened public-facing site, backed by Supabase.

---

## Tech Stack

### Framework & Backend
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Runtime | React 19 Server Components + Server Actions |
| Language | TypeScript 5 (strict) |
| Database | Supabase Postgres |
| Auth | Supabase Auth (session cookies), permission-gated RBAC |
| Storage | Supabase Storage — 16 buckets (6 status-split public/private pairs + 4 standalone, 2 of them private) |
| Email | Resend + `react-email` JSX templates (`src/emails/`) |
| Validation | Zod v4 (every Server Action re-validates server-side) |
| Bot Protection | Cloudflare Turnstile (Managed widget) — always on public forms, adaptive on admin login |
| Rate Limiting | Durable, DB-backed (`rate_limit_hits` table) |

### Frontend
| Layer | Technology |
|---|---|
| Styling | Tailwind CSS v4 (`@theme` tokens — amber + ink design system) |
| Animation | Motion (`motion/react`) |
| Drag & Drop | `@dnd-kit` (sortable admin lists) |
| Image Cropping | `react-easy-crop` (avatar cropper) |
| Icons | Lucide React |
| Fonts | Space Grotesk (display) + Inter (body) |
| Utilities | clsx, tailwind-merge |

### Testing & Tooling
| Layer | Technology |
|---|---|
| Unit tests | Vitest (pure functions only — `tests/unit`) |
| E2E tests | Playwright, driven against the real dev server (`tests/e2e`) |
| Linting | ESLint 9 flat config |
| Type checking | `tsc --noEmit` |

---

## Security Features

### Authentication & Authorization
- Supabase Auth session cookies, no client-exposed service-role key
- Role-Based Access Control — **SuperAdmin** (unrestricted) + granular per-user permissions
  (`process-applications`, `manage-news`, `handle-inquiries`, …)
- No public admin sign-up, and **no password ever travels between staff** — a SuperAdmin
  creates the account from `/admin/users` with an unguessable random password nobody knows,
  and the new user sets their own via an emailed one-time invite link (resendable per row)
- Self-service password reset (`/admin/forgot-password` → `/admin/reset-password`), which
  answers identically for a real account, an unknown email, a disabled account, and a
  rate-limited request — including a timing floor, so staff addresses can't be enumerated
  by stopwatch either. The one-time token is redeemed only on submit, never on page render,
  so corporate "safe link" scanners can't burn it before the recipient clicks
- 30-minute idle timeout, enforced both client-side (`<IdleTimeout />`) and at the edge
  (`src/proxy.ts`), backed by a single non-`httpOnly` cookie (`sf-activity`) — its *absence*
  is the entire signal, no server-side clock comparison needed
- Every idle sign-out (open tab or closed tab) is written to the audit log

### Rate Limiting & Bot Protection
- Durable, DB-backed rate limiting (survives restarts, works across serverless instances) —
  every public form is capped per window (3–10 submissions depending on the form), and the
  resident-reply path is capped on **two** keys, by IP and by ticket number
- Admin login is rate-limited by **both** IP and normalized email (5 attempts / 5 min),
  and only failed attempts count against the budget — a successful login records nothing
- Cloudflare Turnstile verified server-side before any other check on all 10 public,
  anonymous Server Actions — fails **closed** (rejects) on a missing token, a Cloudflare
  failure, or a network error, unlike the rate limiter's fail-open
- **Admin login is challenged adaptively, not always** — the widget appears only once an
  attempt on that IP or email has already failed inside the window, read off the same
  rate-limit rows. Always-on was rejected deliberately: Turnstile fails closed, so an
  unconditional widget would put a hard Cloudflare dependency in front of the only door
  into the portal. The server recomputes the requirement on every call, so a client that
  simply never mounts the widget is refused identically
- The Turnstile widget reports its **own** failures (blocked script, error callback) as a
  visible banner with a Try again button — an `interaction-only` widget that is dead looks
  exactly like one that is healthy, so silence would leave a form permanently unsubmittable
- IP resolution trusts the last `X-Forwarded-For` hop (or `cf-connecting-ip`), not the
  client-controlled first entry, so IP-based throttling can't be trivially spoofed

### Data & Access Control
- **Row-Level Security on every table**, with (almost) zero policies — the service-role
  client behind an explicit `requirePermission()` check is the entire write-side auth gate
- 16 Supabase Storage buckets, split public/private per content type, so draft/archived
  media (which shares `list()`'s RLS policy with `get()`) is never anonymously enumerable
- Two buckets are private outright — `feedback-media` (an anonymous screenshot can contain
  the sender's own account page) and `ticket-media` (residents attach scans of IDs)
- Signed URLs (10-minute expiry) for any non-published or private media in the admin UI
- A scoped Content-Security-Policy plus standard security headers (`X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, HSTS, `Permissions-Policy`) in `next.config.ts`
- Archive-before-delete on every content type — permanent deletion is SuperAdmin-only and
  reachable only from an already-archived record, enforced server-side (`guardDelete()`)
- Compensating-delete uploads — a Server Action that fails to write its DB row deletes the
  Storage object it just uploaded, so an object never exists without a row referencing it
- Full audit log (`/admin/audit`) for every write and every sign-out

### Validation
- Zod v4 schemas re-validate every Server Action at runtime, regardless of client-side
  validation — Server Actions are public HTTP endpoints
- Path/prefix allow-list validation on any client-supplied Storage path (the document
  upload Route Handler's two-call design) before a save action trusts it

---

## Features

### For Residents (Public Site)
- Browse the services catalog and submit applications
- Four ticketing flows with status tracking: **applications**, **appointments**,
  **complaints**, **assistance requests**
- Applications collect the applicant's middle name and date of birth (applications only —
  the other three flows keep the shared identity block), and a stated purpose is optional
- Look up any ticket's status by reference number + surname (`/track`), and read a
  **progressive timeline** of everything that has happened to it — rendered from an
  append-only log, not inferred from timestamps. Staff internal notes are filtered out in
  the query layer, so they never reach the page at all
- When staff mark a ticket **awaiting info**, the resident can reply directly from `/track`
  (up to 3 attachments × 2 MB), which flips the ticket back to under review and raises a
  "New reply" badge on the staff queue
- Email receipts and outcome notices at every point that matters — submission, approval,
  rejection, confirmation, dismissal, resolution — plus a contact-form acknowledgment
- Contact form (routed inquiries) — the channel for anything needing an answer
- Anonymous site-feedback widget with optional screenshot upload — no name, email, or IP
  collected, so there's deliberately no reply path
- News archive, a 3-item announcements teaser with sidebar, a full notices archive with
  detail pages, and a community events calendar (upcoming + past archive)
- Transparency section — legislative documents, disclosure documents, monitored projects
  (real, Storage-hosted PDFs)
- Officials directory with real names, portraits, and role descriptions
- A staff **Login** entry in the site header (desktop button + mobile row), so staff don't
  have to know the portal URL by hand

### For Admin Staff (Permission-Gated)
- Draft → in-review → published → archived workflow for every content type, with
  drawer-based editors that persist through Server Actions
- Active | Archived views on every manager, sortable/searchable tables, row-level actions
  (Edit / Publish / Archive / Delete) via a shared `RowActions` kebab
- Six status-aware content managers: News, Announcements, Events, Officials + Achievements,
  Legislative Documents, Transparency Documents & Projects
- Five ticket queues (Applications, Appointments, Complaints, Assistance, Inquiries &
  Feedback) with review drawers and status transitions
- A timeline panel in every review drawer — post a public update the resident sees on
  `/track`, or an internal note only staff can read, and request more information without
  blocking the ticket (`under-review` stays optional; a clerk can still decide in one click)
- Autosave draft recovery to `localStorage` (never to the database — editing a published
  record never silently pushes unreviewed text live)
- Real-time-feeling notification bell + per-queue nav badges (60-second poll)
- Global search across every content type and ticket queue, plus a search box in every
  manager's table — both halves (the SQL `fuzzy_match()` and the in-browser `fuzzyFilter`)
  implement one shared rule, so the same query returns the same rows in either surface
- Home & About page content editor (hero, mission/vision, stats, history) — no code
  deploy needed to change page copy
- Account self-service in Settings (profile, avatar with a crop/zoom/rotate dialog,
  password) — own photo only, nobody edits anyone else's

### For SuperAdmins
- User management (`/admin/users`) — invite/archive admin accounts, assign permissions,
  see who hasn't accepted their invite yet, and resend it
- Full audit log viewer
- Permanent deletion (only reachable from an already-archived record)
- Services catalog enable/disable toggles

---

## Project Structure
<details>
  <summary>📂 Project Structure</summary>

```text
SanFernandoWeb/
├── src/
│   ├── app/
│   │   ├── (public)/              # Public site — shared header/footer chrome
│   │   │   ├── page.tsx           # Home
│   │   │   ├── about/  officials/  services/
│   │   │   ├── announcements/  news/  notices/  events/
│   │   │   ├── transparency/  contact/
│   │   │   ├── track/                                  # ticket status lookup
│   │   │   ├── applications/  appointments/  assistance/  complaints/
│   │   │   └── privacy/  terms/
│   │   ├── admin/                 # Admin portal — auth + permission gated, noindex
│   │   │   ├── login/  forgot-password/  reset-password/   # public, shared AuthLayout
│   │   │   └── (portal)/          # sidebar chrome; each folder is a DB-backed manager
│   │   │       ├── services/  officials/  news/  events/  transparency/
│   │   │       ├── applications/  appointments/  assistance/  complaints/  inquiries/
│   │   │       ├── site-content/  users/  audit/  settings/
│   │   └── api/admin/
│   │       ├── notifications/route.ts       # 60s poll: badges, bell, mobile nav
│   │       └── uploads/document/route.ts    # authenticated multipart PDF/image upload
│   ├── components/
│   │   ├── ui/                    # Button, Card, DataTable, Drawer, Toast, Accordion, …
│   │   ├── layout/                 # SiteHeader, SiteFooter, PublicShell
│   │   ├── navigation/              # DesktopNav, MobileNav, NavLink
│   │   ├── sections/                # PageHero, CtaBanner
│   │   └── shared/                   # AnnouncementCard, EventCard, OfficialCard, …
│   ├── features/                  # data.ts + components/ + actions.ts + queries.ts per feature
│   │   ├── home/  about/  officials/  services/  announcements/  events/  transparency/
│   │   ├── contact/  track/  applications/  appointments/  assistance/  complaints/
│   │   ├── feedback/  legal/
│   │   └── admin/                 # Managers, admin shell, Server Actions, queries
│   ├── emails/                    # react-email templates, all inside <EmailLayout>
│   │   └── shared/                # TicketNotice, text helpers
│   ├── hooks/                     # useDisclosure, useFormDraft, useTableSort, …
│   ├── lib/                       # supabase clients, auth, rate-limit, turnstile, storage,
│   │                              #   email, notifications, media-lifecycle, motion
│   ├── types/                     # Shared entity interfaces — the de-facto API contract
│   ├── constants/                 # Site identity, navigation, hotlines (SITE object), permissions
│   └── proxy.ts                   # Idle-timeout + auth gate for page GETs (Next 16 middleware)
├── supabase/
│   ├── baseline/                  # Single-transaction schema squash for a fresh environment
│   └── migrations/                # Numbered migrations for an existing environment
├── scripts/                       # upload-site-images.mjs, report-orphaned-media.mjs, …
├── tests/
│   ├── unit/                      # Vitest — pure functions
│   └── e2e/                       # Playwright — public + admin projects
└── docs/
    ├── BACKEND_HANDOFF.md          # Living integration brief
    └── superpowers/{specs,plans}/  # Per-feature design history
```
</details>

---

## Route Handlers Reference

Almost all writes go through **Server Actions**, not a REST API — there is no conventional
`/api` surface to enumerate. The two Route Handlers that do exist:

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/admin/notifications` | Session-gated | Feeds the sidebar badges, mobile nav card, and bell (60s poll) |
| POST | `/api/admin/uploads/document` | `manage-transparency` permission | Multipart upload for legislative/transparency PDFs & images, ahead of the save Server Action |

---

## Quick Start

### Prerequisites
- Node.js 20+
- A Supabase project (Postgres + Auth + Storage)
- A Cloudflare Turnstile site (free tier — "Managed" widget mode)

### Setup

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**
```bash
cp .env.example .env.local
# Edit .env.local with your Supabase and Turnstile values
```

**3. Set up the database**

For a **fresh** Supabase project:
```bash
# 1. Apply supabase/baseline/0000_baseline_2026-07-23.sql (Supabase SQL editor or CLI)
#    — a single-transaction squash of migrations 0001–0034 against an empty schema.
#    It is contiguous: there is no "and then run X on top" companion step.
node scripts/upload-official-portraits.mjs
node scripts/upload-site-images.mjs
```

For an environment that already has some migrations applied, apply only the numbered
migrations it's missing, in order — the baseline assumes an empty schema and fails against
one that already has any of them. Migrations are numbered through `0034`.

**4. Start the dev server**
```bash
npm run dev
```

Open: `http://localhost:3000`

### Commands
```bash
npm run dev        # http://localhost:3000
npm run build      # production build (mix of static + dynamic/DB-backed routes)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint 9 flat config
npm run test:unit  # Vitest — pure functions only
npm run test:e2e   # Playwright against the dev server
```

Ad-hoc verification recipe for one-off checks: `.claude/skills/verify/SKILL.md`.

---

## Admin Accounts

There is no seed script — admin accounts don't exist until a SuperAdmin invites one from
`/admin/users`. Account creation is **invite-based**: the SuperAdmin fills in the name,
email, phone and permissions, and the account is created with a random password nobody
(including the SuperAdmin) ever sees. The new staff member receives a one-time link and
sets their own password through `/admin/reset-password`. Until they do, the roster shows
them as *Invite pending* and the invite can be resent from the row.

To bootstrap the **first** SuperAdmin on a new environment, insert a row into `profiles`
directly (via the Supabase dashboard) with `is_superadmin = true` against a user created
through Supabase Auth. There are no default or well-known credentials in this repo.

> Invites and password resets both go out through Resend, so `RESEND_API_KEY` /
> `RESEND_FROM_EMAIL` must be set before the first invite — the send is fail-open and will
> otherwise be skipped silently, leaving an account nobody can sign into.

---

## Environment Variables

Full template in `.env.example`. Key variables:

```env
# Supabase — Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY   # server-only, never expose to the client

# Cloudflare Turnstile — Dashboard → Turnstile → add a site (Managed widget)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=YOUR-TURNSTILE-SITE-KEY   # inlined at BUILD time
TURNSTILE_SECRET_KEY=YOUR-TURNSTILE-SECRET-KEY            # server-only

# Resend — transactional email (receipts, outcome notices, invites, password resets)
RESEND_API_KEY=YOUR-RESEND-API-KEY                        # server-only
RESEND_FROM_EMAIL="Barangay San Fernando <notifications@yourdomain>"   # verified sender

# Absolute base URL — email clients can't resolve relative paths, so every link
# and image inside a template is built from this. Inlined at BUILD time.
NEXT_PUBLIC_SITE_URL=https://yourdomain
```

> ⚠️ Without `TURNSTILE_SECRET_KEY`, forms work in development (verification is skipped
> with a console warning) but **every anonymous form throws in production** — deliberate
> fail-closed behavior, not a bug. Rotating the site key needs a rebuild, not just a
> redeploy, since it's inlined at build time. To run the admin e2e suite locally, use
> Cloudflare's always-pass test keys (documented in `.env.example`) — the real key can't
> solve on `localhost`.

> ⚠️ Email is the opposite: `sendEmail()` **never throws**, in any environment. A missing
> `RESEND_API_KEY` skips every send and logs it, because every trigger fires after its own
> DB write already committed — an email failure must never turn into a failed resident
> submission. The cost is that a misconfigured deploy is silent, so check the logs.

---

## Design System

The UI follows an **amber + ink** civic/municipal aesthetic:

- **Typography**: Space Grotesk (display/headings) + Inter (body)
- **Color**: Amber `brand-*` primary accent, neutral `ink-*` surfaces, `danger*` for
  destructive actions — all defined once as Tailwind v4 `@theme` tokens in `globals.css`
- **Motion**: CSS for what CSS can do (hero sequences, reveal-on-scroll, micro-interactions);
  Motion (`motion/react`) only for exit animations, shared-element indicators, and
  data-driven staggers — the two systems are deliberately not mixed
- **Components**: Server Components by default; client components only for real
  interactivity (forms, scroll state, the admin portal's managers/drawers)

---

## Production Deployment

1. Apply the schema (baseline for a fresh environment, or missing numbered migrations for
   an existing one) — **before** deploying the code, not after
2. Run `scripts/upload-official-portraits.mjs` and `scripts/upload-site-images.mjs` once
   per environment
3. If migrating from an older per-bucket layout, run `scripts/migrate-media-buckets.mjs`
   **before** deploying code that expects the new bucket layout — deploying first 404s
   every currently-published image and document on the live public site
4. Set real `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` values — production
   throws on first submit without them, rather than silently passing
5. Set `RESEND_API_KEY` / `RESEND_FROM_EMAIL` (verified sender) and `NEXT_PUBLIC_SITE_URL`
   — nothing throws without them, so this one has to be checked rather than discovered
6. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set server-side only, never in a client bundle
7. Migrations are applied **manually** — never assume one is live without confirming with
   whoever owns that environment. `0032` and `0033` in particular must land **before** the
   code that reads them: the ticket lists select `replied_at`, the drawers write
   `ticket_updates`, and the applications queue selects the new name/birth-date columns —
   each is a runtime failure, not a build failure, so a skipped migration ships green

---

## Project Status

Deployed to production 2026-07-28; the ticket-timeline, invite, password-reset, adaptive-
login, application name-parts and search-parity work has landed on `main` since. Known gaps,
tracked as not-yet-done rather than bugs:

- **Email delivery monitoring isn't built** — transactional email itself is live (receipts,
  outcome notices, staff alerts, invites, password resets), but there's no `email_log` table
  and no Resend webhook, so a bounced or dropped message is invisible from inside the app
- **The public site has no alert-signup entry point** — the footer and news-sidebar
  newsletter panels were removed on request, so `alert_subscribers` stops gaining rows. The
  form component and its Server Action are kept (still Turnstile-gated and rate-limited) in
  case signup returns elsewhere; nothing dispatched to that table in the first place
- `requestIp()` prefers `cf-connecting-ip` unconditionally, and nothing in the code or
  config asserts that production actually sits behind Cloudflare. Bounded rather than open
  (the email-keyed limiter still caps per-account brute force), but the fix is to gate that
  preference behind an explicit deployment assertion
- Several content fields are real but still placeholder-shaped: the About page's captain's
  message, and most staff emails/phones/office hours (the barangay's own hotline and
  address are real)
- Most images are still hotlinked from `lh3.googleusercontent.com` rather than owned
  Storage; new uploads go to Storage — only the original seed images haven't migrated
- Three Playwright e2e specs are **not idempotent within their rate-limit window**
  (`admin/login.spec.ts`, `admin/ticket-updates.spec.ts`, `public/feedback.spec.ts`) — a
  second run within the window (~5 min for login, ~1 hour for the reply test and for
  feedback) can fail on rate-limit collision, not a real regression

See `CLAUDE.md` for the full architectural history and gotchas, and
`docs/superpowers/specs/` / `docs/superpowers/plans/` for per-feature design history.

---

## License

MIT — © 2026 Justine Acosta
