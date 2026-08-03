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
| Storage | Supabase Storage — 14 status-split public/private buckets |
| Validation | Zod v4 (every Server Action re-validates server-side) |
| Bot Protection | Cloudflare Turnstile (Managed widget) |
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
- No public admin sign-up — accounts are created by a SuperAdmin from `/admin/users`
- 30-minute idle timeout, enforced both client-side (`<IdleTimeout />`) and at the edge
  (`src/proxy.ts`), backed by a single non-`httpOnly` cookie (`sf-activity`) — its *absence*
  is the entire signal, no server-side clock comparison needed
- Every idle sign-out (open tab or closed tab) is written to the audit log

### Rate Limiting & Bot Protection
- Durable, DB-backed rate limiting (survives restarts, works across serverless instances) —
  every public form is capped per hour (3–10 submissions depending on the form)
- Admin login is rate-limited by **both** IP and normalized email (5 attempts / 5 min),
  and only failed attempts count against the budget — a successful login records nothing
- Cloudflare Turnstile verified server-side before any other check on all 8 public,
  anonymous Server Actions — fails **closed** (rejects) on a missing token, a Cloudflare
  failure, or a network error, unlike the rate limiter's fail-open
- IP resolution trusts the last `X-Forwarded-For` hop (or `cf-connecting-ip`), not the
  client-controlled first entry, so IP-based throttling can't be trivially spoofed

### Data & Access Control
- **Row-Level Security on every table**, with (almost) zero policies — the service-role
  client behind an explicit `requirePermission()` check is the entire write-side auth gate
- 14 Supabase Storage buckets split public/private per content type, so draft/archived
  media (which shares `list()`'s RLS policy with `get()`) is never anonymously enumerable
- Signed URLs (10-minute expiry) for any non-published media in the admin preview UI
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
- Look up any ticket's status by reference number (`/track`)
- Contact form (routed inquiries) + newsletter/alert subscription
- Anonymous site-feedback widget with optional screenshot upload — no name, email, or IP
  collected, so there's deliberately no reply path
- News archive, a 3-item announcements teaser with sidebar, a full notices archive with
  detail pages, and a community events calendar (upcoming + past archive)
- Transparency section — legislative documents, disclosure documents, monitored projects
  (real, Storage-hosted PDFs)
- Officials directory with real names, portraits, and role descriptions
- Account self-service (profile, avatar, security)

### For Admin Staff (Permission-Gated)
- Draft → in-review → published → archived workflow for every content type, with
  drawer-based editors that persist through Server Actions
- Active | Archived views on every manager, sortable/searchable tables, row-level actions
  (Edit / Publish / Archive / Delete) via a shared `RowActions` kebab
- Six status-aware content managers: News, Announcements, Events, Officials + Achievements,
  Legislative Documents, Transparency Documents & Projects
- Five ticket queues (Applications, Appointments, Complaints, Assistance, Inquiries &
  Feedback) with review drawers and status transitions
- Autosave draft recovery to `localStorage` (never to the database — editing a published
  record never silently pushes unreviewed text live)
- Real-time-feeling notification bell + per-queue nav badges (60-second poll)
- Global search across every content type and ticket queue
- Home & About page content editor (hero, mission/vision, stats, history) — no code
  deploy needed to change page copy

### For SuperAdmins
- User management (`/admin/users`) — create/archive admin accounts, assign permissions
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
│   │   │   ├── login/
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
│   ├── hooks/                     # useDisclosure, useFormDraft, useTableSort, …
│   ├── lib/                       # supabase clients, auth, rate-limit, turnstile, storage, motion
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
# Apply supabase/baseline/0000_baseline_2026-07-23.sql via the Supabase SQL editor or CLI
node scripts/upload-official-portraits.mjs
node scripts/upload-site-images.mjs
```

For an environment that already has some migrations applied, apply only the numbered
migrations it's missing, in order — the baseline assumes an empty schema and fails against
one that already has any of them.

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

There is no seed script — admin accounts don't exist until a SuperAdmin creates one from
`/admin/users`. To bootstrap the **first** SuperAdmin on a new environment, insert a row into
`profiles` directly (via the Supabase dashboard) with `is_superadmin = true` against a user
created through Supabase Auth. There are no default or well-known credentials in this repo.

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
```

> ⚠️ Without `TURNSTILE_SECRET_KEY`, forms work in development (verification is skipped
> with a console warning) but **every anonymous form throws in production** — deliberate
> fail-closed behavior, not a bug. Rotating the site key needs a rebuild, not just a
> redeploy, since it's inlined at build time.

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
5. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set server-side only, never in a client bundle
6. Migrations are applied **manually** — never assume one is live without confirming with
   whoever owns that environment

---

## Project Status

Deployed and current in production as of 2026-07-28. Known gaps, tracked as not-yet-done
rather than bugs:

- **Transactional email (Resend) isn't wired up yet** — ticket/inquiry confirmations have
  no email leg
- Several content fields are real but still placeholder-shaped: the About page's captain's
  message, and most staff emails/phones/office hours (the barangay's own hotline and
  address are real)
- Most images are still hotlinked from `lh3.googleusercontent.com` rather than owned
  Storage; new uploads go to Storage — only the original seed images haven't migrated
- Two Playwright e2e specs are **not idempotent within their rate-limit window**
  (`admin/login.spec.ts`, `public/feedback.spec.ts`) — a second run within the window
  (~5 minutes for login, ~1 hour for feedback) can fail on rate-limit collision, not a
  real regression

See `CLAUDE.md` for the full architectural history and gotchas, and
`docs/superpowers/specs/` / `docs/superpowers/plans/` for per-feature design history.

---

## License

MIT — © 2026 Justine Acosta
