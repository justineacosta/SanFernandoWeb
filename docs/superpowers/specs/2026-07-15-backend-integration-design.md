# Backend Integration — Production Design

**Date:** 2026-07-15
**Status:** Approved by Justine (section-by-section review in brainstorming session)
**Scope:** Everything required to take the site from static frontend to production: platform,
auth/permissions, the four-flow ticketing system, dynamic content (news, officials,
transparency), notifications, security, operations, and turnover.

---

## 1. Decisions locked with the user

| Decision | Choice |
| --- | --- |
| Platform | **Vercel** (hosting) + **Supabase** (Postgres + Auth + Storage) + **Resend** (email). Neon dropped — Supabase covers the database. |
| Backend shape | No separate API server. Server Components read the DB via a server-side Supabase client; all writes are **Server Actions** validated with Zod. |
| Resident accounts | **None.** Anonymous submissions; tracking via ticket number + last name on a public `/track` page. |
| Requirement documents | **Not uploaded.** Residents see the checklist and bring documents in person; staff verify face-to-face. |
| Appointments | Resident requests a preferred date + AM/PM; staff confirm, propose a new time, or decline. No slot calendar. |
| Notifications | **Email-only v1** (optional email field on every form; Resend). SMS (e.g. Semaphore) is a later plug-in to the same notification module. |
| Ticketing data model | **Approach B:** four independent typed tables + shared ticket-number generator + a union view for lookup. |
| Permission model | **SuperAdmin + per-user permission checkboxes.** "Staff"/"Editor" are labels/presets, not enforced roles. |
| Domain | Commercial domain (no `.gov.ph`) — e.g. `brgysanfernando.ph`; mailboxes on Zoho free tier; Resend sends from the same domain. |

## 2. Architecture

One Next.js 16 App Router codebase on Vercel. Supabase project per environment
(**staging** + **production**). CI gate on every PR: `typecheck` + `lint` + `build`.
Public pages keep static/ISR rendering with on-demand `revalidatePath()` fired by admin
save actions.

New public routes:

| Route | Purpose |
| --- | --- |
| `/track` | Ticket lookup (ticket number + last name) |
| `/services/apply/[serviceSlug]` | Application form per permit/certificate/clearance |
| `/appointments/new` | Appointment request form |
| `/complaints/new` | Complaint form |
| `/assistance/new` | Social service assistance form |
| `/announcements/[slug]` | News/announcement detail |
| `/officials/[slug]` | Official profile + achievements |
| `/transparency/legislative/[slug]` | Ordinance/resolution detail + PDF |
| `/admin/login` | Login page (only unguarded admin route) |
| `/admin/help/[slug]` | In-admin user guide, one page per feature |
| Privacy policy + terms pages | Real legal pages replacing `#` footer links |

## 3. Ticketing system (Approach B)

### Tables

`services` (adds `is_available`, `slug`, editable `requirements`), `applications`,
`appointments`, `complaints`, `assistance_requests` — independent, fully-typed tables.
Shared: a Postgres function generates per-year sequential ticket numbers with type
prefixes — `APP-2026-00123`, `APT-`, `CMP-`, `AST-` — collision-safe under concurrency.
A `tickets_view` unions common fields (ticket no., type, status, resident name, dates)
for `/track` and dashboard stats.

### Common form fields

First name, last name (lookup key), purok/address, contact number (**required**),
email (optional — enables notifications), Data Privacy Act consent checkbox (persisted).

### Per-type fields and status flows

| Type | Extra fields | Status flow |
| --- | --- | --- |
| Application | service, purpose | `pending → approved (ready for pickup) → released`, or `rejected` |
| Appointment | purpose, preferred date, AM/PM | `pending → confirmed (final date/time) → completed`, or `declined` |
| Complaint | respondent (optional), incident date, location, narrative | `received → under review → resolved`, or `dismissed` |
| Assistance | category (list: medical/financial/burial/calamity/other — edited by SuperAdmin alongside the service catalog), details | `pending → under review → granted`, or `declined` |

Rules: remarks **required** on every negative decision; every status change timestamped
and attributed to the acting user; application forms display the service's requirements
checklist with "bring these when you claim"; a service toggled off disables its Apply
button with a "temporarily unavailable" notice.

### Track page (`/track`)

Ticket number + matching last name required (privacy gate — numbers are sequential and
guessable alone). Shows a status timeline with staff remarks and next-step instructions.
**Complaints show status only** — never narrative or respondent. Rate-limited against
enumeration.

### Admin queues

Four independent screens following the existing `ApplicationsManager` pattern (stat
cards + filterable/searchable table + review drawer). Type-appropriate actions
(Approve/Reject, Confirm/Decline, Resolve/Dismiss, Grant/Decline) + walk-in encoding
via the same drawer in create mode — one queue, online and office together.

### Service catalog manager

Extends `/admin/services`: availability toggle per service; add/remove/edit/reorder the
requirements list; edits revalidate the public services page instantly.
**SuperAdmin-only.**

## 4. Auth, sessions, permissions

- `/admin/login`: email + password (Supabase Auth). No public signup. Forgot-password
  via Supabase reset flow through Resend SMTP. Minimal amber+ink page.
- Sessions: httpOnly cookies, auto-refresh, 7-day refresh window. Middleware guards the
  entire `/admin` tree.
- **SuperAdmin**: full power always; creates/disables/archives/deletes users; assigns
  the status label (Staff | Editor); ticks permission checkboxes; sole manager of
  service availability + requirements. The system blocks removing the last SuperAdmin.
- **Permissions** (per-user checkboxes; labels are presets only):
  - Tickets: process applications · process appointments · handle complaints · handle assistance
  - Content: manage news & events · manage officials · manage transparency documents
  - Presets: Staff → the four ticket permissions; Editor → the three content permissions.
- Enforcement: server-side check in every Server Action (UI hiding is cosmetic);
  Supabase RLS backs it — anon key can only read published content and insert tickets.
- User management in `/admin/settings`: list (label, permission summary, state),
  create drawer with checkboxes, disable (blocks login, keeps history), archive (hides),
  delete only for users with no recorded actions. **Disable-don't-delete is the default
  for departures** so the audit log never points at a ghost.
- **Audit log**: every write (ticket decisions, publishes, permission changes, user
  management) records who/what/when; feeds the Publishing Activity panel.

## 5. News, announcements & events

- Home board renders published items from the DB, **newest first**; auto "NEW" badge
  under 7 days (replaces manual `isNew`). **Events sort by event date, soonest upcoming
  first**; past events drop off automatically.
- Slug pages `/announcements/[slug]`; slug auto-generated from title, editable before
  publish, permanently unique. "Load More" becomes real pagination.
- **Photos: 0–3 per article, 2MB each**, Supabase Storage, served via `next/image`.
  Layout by count: 0 = text article with neutral card style; 1 = full-width hero;
  2 = side-by-side (stacked mobile); 3 = mosaic (one lead + two smaller). Tap opens a
  shared lightbox (swipe/arrows). First photo = cover for board card + Open Graph.
- Admin drawer: drag-drop uploader, thumbnail previews, drag reorder, per-photo remove;
  2MB enforced client-side with a human message and re-checked server-side; hard cap 3.
- Workflow: `draft → in-review → published`; archive pulls from public, keeps record.
  Publish/archive revalidates home, board, and slug page.

## 6. Officials

- Directory cards link to `/officials/[slug]`: portrait, position, badge, term,
  published contacts, short bio, **achievements timeline** (title, description, date,
  optional photo). **Only achievements with `is_visible = true` appear publicly.**
- Admin manager (permission: manage officials): edit name, position, group, badge,
  photo (2MB, square-crop guidance), term, contacts, bio; achievements sub-list in the
  drawer with per-item show/hide toggle and reorder; drag sort order for directory
  position (Captain first).
- **Archive is the normal path** for departures (hidden publicly, record + achievements
  preserved — becomes term history). Delete = confirmed, for mistakes only.
- Migration: seed the 12 real officials; upload bundled portraits to Storage. Public
  page renders from DB with zero visual change on day one.

## 7. Transparency (ordinances & resolutions)

- Collapsible tables stay, DB-driven, **sorted by Date Approved, newest first**
  (required field on every record).
- Detail slug page `/transparency/legislative/[slug]` (slug from number + title):
  type + official number, title, date approved, summary, **inline PDF viewer**
  (mobile falls back to an open/download card) + always-present Download button.
  Records without a file still render: summary + "full document available at the
  barangay hall" — no dead links.
- Admin drawer (permission: manage transparency documents): PDF upload/replace/remove,
  **PDFs only, 10MB limit** (scanned documents run big; images stay 2MB).
  Add/edit/archive/delete with the same archive-first rule (repealed ordinances are
  legal history). Publish/archive revalidates list + slug pages.
- Same upload mechanism extends to the other transparency documents (budget reports,
  latest uploads) whose links are `#` today. The ordinance **search** goes live
  (number, title, summary).

## 8. Notifications

One notification module every flow calls — the single future SMS plug-in point.
Resident emails (only when provided): ticket created (with number), status changed
(with remarks + next steps). Office email on new inquiry. Sent from the site domain
via Resend (SPF/DKIM/DMARC). Sends happen **after** the DB write and never block it;
the track page is the source of truth.

Also wired: contact inquiry form (persist + office notification) and newsletter signup
(persist + dedupe on mobile number; dispatch pipeline deferred with SMS).

## 9. Security & compliance

- Middleware-guarded `/admin`; server-side permission checks in every action; RLS as
  the last line.
- Rate limits: login 5/15min/IP; per-IP limits on all public forms; `/track`
  anti-enumeration. Cloudflare Turnstile + honeypot on all public forms.
- Security headers (CSP, HSTS, frame-deny); Zod validation server-side everywhere;
  uploads validated by type + size server-side (images 2MB, PDFs 10MB).
- Data Privacy Act (RA 10173): consent persisted with every ticket/inquiry; real
  privacy policy + terms pages; complaints status-only on `/track`; written retention
  policy in the handover document.

## 10. Operations & turnover

- **Supabase Pro in production** (daily backups, no pausing) + **one rehearsed restore
  before launch**. Sentry, uptime monitoring, Vercel analytics.
- Staging carries a full **demo dataset**: fake residents, tickets in every status,
  sample news with 0/1/2/3 photos, draft/published/archived examples of everything —
  client demos and staff training never touch production.
- **Turnover package**:
  1. In-admin Help section (`/admin/help/[slug]`) — illustrated step-by-step guide per
     feature (process an application, publish news with photos, add an achievement,
     upload an ordinance, manage users/permissions). Versioned with the code.
  2. Demo walkthrough script for client presentations, seeded on staging.
  3. Handover document: account inventory (Vercel, Supabase, Resend, registrar, Zoho),
     monthly costs, renewal dates, backup-check routine, support contact.
- Launch-gate content (needed from the barangay, collected in parallel): real contact
  data + chosen mailboxes, the Punong Barangay's actual message (current quotes are
  invented), confirmation of the 8.95 ha figure, real PDFs for published documents.

## 11. Testing

Playwright integration tests, added when the backend lands (the no-test rule expires),
in priority order: the four ticket flows + `/track`, inquiry + newsletter forms,
document search, application review (permission-gated), photo upload limits.

## 12. Build order

1. Foundation: Supabase projects, Vercel envs, CI, domain + DNS + Resend.
2. Auth: login page, middleware guard, SuperAdmin, permission checkboxes, user management, audit log.
3. Ticketing: service catalog (toggle + requirements) → four flows + ticket numbers → `/track` → walk-in encoding.
4. Notifications module (email).
5. News/announcements/events: schema, slugs, photo upload + gallery + lightbox, board, pagination.
6. Officials: schema + seed, slugs, achievements, portraits to Storage.
7. Transparency: schema, PDF upload, slugs, search, other documents.
8. Hardening: rate limits, Turnstile, headers, RLS review, privacy/terms pages, Playwright tests.
9. Turnover: demo dataset, `/admin/help`, handover document, restore rehearsal, staff training.

## 13. Out of scope (v1)

Resident accounts, SMS dispatch, slot-based appointment calendars, requirement-document
uploads, FOI request flow, resident registration, blotter case management beyond the
complaint ticket, citizen-facing dashboards.
