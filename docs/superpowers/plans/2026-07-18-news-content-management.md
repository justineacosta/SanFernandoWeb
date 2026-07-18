# News, Announcements & Events (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make news articles, short announcements, and community events fully DB-backed and admin-authored, with a shared Supabase Storage photo pipeline, SuperAdmin-managed news categories, a `draft→in-review→published→archived` workflow, news slug pages, and the real barangay hotline number.

**Architecture:** Introduces Supabase Storage (public bucket `public-media`) as the first file-storage capability. Five new tables (`news_categories`, `news_articles`, `news_photos`, `announcements`, `events`) carry RLS-with-no-policies; every read and write goes through the service-role admin client after an explicit code-level check, exactly like the 2B/2C ticket tables. Public Server Components read published rows through a query module; admin managers are drawer editors backed by Server Actions. Categories reuse the `assistance_categories` SuperAdmin pattern verbatim.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Supabase (Postgres + **Storage**), Zod v4, Server Actions, `next/image`.

## Global Constraints

- **Design tokens only.** `brand-*` (amber, scale **100–800** — `brand-50`/`brand-900` DO NOT EXIST; Tailwind v4 silently drops utilities naming undeclared steps and typecheck/lint are blind to it), `ink-*`, `danger*`. **No green/success token** (success accents use `bg-brand-200 text-brand-800`). No blue tokens (pre-2026-07 design).
- **Identity:** "Barangay San Fernando, San Nicolas, Ilocos Norte". San Nicolas is a **municipality** — "Municipal …", never "City …". Area code **(077)**. Any "Sampaguita" in `src/` is a regression.
- **Real hotline:** the barangay's real line is `0776001082`, formatted **`(077) 600 1082`**. It replaces the placeholder `(077) 123 4567` in `SITE.phone` and `EMERGENCY_HOTLINES[0]`.
- **RSC boundary:** `icon: LucideIcon` is a React *component*. Passing one into a `"use client"` component throws at runtime and **TypeScript does not catch it**. Icons are chosen/rendered on the server; only serializable data crosses the boundary.
- **Zod v4**, not v3: `z.string().trim().min(n, "…")`, `.email("…")`, `.refine(fn, { error: "…", path: ["field"] })`.
- **Server Components by default.** `"use client"` only for real interactivity (here: the photo uploader and the gallery lightbox).
- **Timezone:** Postgres `timestamptz` is UTC; the barangay is UTC+8 (Asia/Manila). `timestamptz` → `toManilaDate()` from `src/lib/format.ts`. Bare `date` columns (`event_date`, announcement `date`) pass straight through / via `formatDate()` — never `toManilaDate` (it shifts a day).
- **Path alias** `@/*` → `src/*`. Content lives in typed modules, never hardcoded in components.
- **Never `git add -A`.** Intentionally-untracked `proposal/`, `stitch_tabbed_content_manager/`, and a `.zip` sit at root. Always `git add` explicit paths.
- **No test framework exists and none may be added.** Verification is `npm run typecheck`, `npm run lint`, `npm run build`, plus the runtime sweep (Task 18).
- **Migrations are applied by Justine by hand.** No agent runs a Supabase CLI or applies SQL. Task 18 is blocked on her applying `0007`.

---

## Design decisions locked for this plan

Read these before any task. They resolve questions the task text assumes settled. (Full rationale in `docs/superpowers/specs/2026-07-18-news-content-management-design.md`.)

1. **Every content table has RLS enabled with NO policies.** Public pages read via the service-role client filtering `status = 'published'` explicitly. No anon policy exists on any of the five tables — a draft cannot leak because nothing anon-readable exists. (This is stricter than `assistance_categories`, which had an anon `select` policy; do not copy that policy here.)
2. **`news_categories` is SuperAdmin-managed and mirrors `assistance_categories` exactly** — retired via `is_active`, never hard-deleted (`news_articles.category_id` references it). Its actions are a near-verbatim copy of `src/features/admin/actions/assistance-categories.ts`.
3. **Announcements and news articles are separate tables**, surfaced under the one "News & Announcements" nav entry via **News / Announcements tabs**. They render differently in public (full article cards + slug pages vs. compact dated notices).
4. **Slug detail pages are news-only** (`/announcements/[slug]`). Announcements/events have no `/[slug]` page.
5. **Full workflow `draft→in-review→published→archived` on all three types.** No `scheduled` status — the mock `scheduled`/`scheduledFor` is dropped and replaced by `in-review`. `published_at` is set once, on the first transition into `published`, and drives newest-first ordering and the auto "NEW" badge (`published_at` within 7 days).
6. **Featured = the newest published article** (the manual `NewsArticle.featured` flag is removed). The `/announcements` feed renders the newest published article as the hero and the rest as the grid.
7. **Photos:** news = 0–3 gallery (`news_photos`) with count-based layouts + a shared lightbox; announcements = one optional image; events = one optional cover. All live in the public `public-media` bucket. `news_photos.src` (and `announcements.image_src`, `events.cover_src`) hold **either a storage object path or a full remote URL**; `photoUrl()` resolves both. Seed rows keep their current `lh3` URLs.
8. **Photo cap = 3, enforced in the Server Action** (not a DB constraint). Server-side validation rejects files over **2MB** or outside `image/jpeg|png|webp`, re-checking what the client checked.
9. **Photos are managed after the article exists.** Creating a news post saves a draft first (returning its `id`); the photo uploader then operates against that `id` via dedicated actions. This keeps upload/reorder/remove actions simple and keyed by `articleId`.
10. **Thumbnail reordering uses up/down controls, not HTML5 drag** (files are still added by drag-drop onto the dropzone). This avoids a drag-and-drop dependency and matches the accessible reorder pattern already used by the categories panel. Adding drag reorder later is a non-breaking enhancement.
11. **Both content nav items are gated by `manage-news`.** "News & Announcements" (`/admin/news`) and "Event Calendar" (`/admin/events`) currently have no `permission:` — add `permission: "manage-news"` to both. Category management additionally requires `requireSuperAdmin()`.
12. **Public news pages read the DB per request and stay fresh via `revalidatePath`** on every publish/archive — the pattern the DB-backed services pages established in 2A. Do not introduce a new caching strategy.

---

## File structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/0007_news_content.sql` | Enums, 5 tables, RLS (no policies), storage bucket + read policy, seed |
| `src/lib/storage.ts` | `PUBLIC_MEDIA_BUCKET`, `photoUrl()`, `newsPhotoPath()`, `ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_BYTES` |
| `src/features/announcements/queries.ts` | Public reads: articles (paginated), article-by-slug, announcements, active categories |
| `src/features/events/queries.ts` | Public read: `listUpcomingEvents` |
| `src/features/events/index.ts` | Barrel |
| `src/features/announcements/components/news-gallery.tsx` | Count-based photo layout + lightbox (client) |
| `src/app/(public)/announcements/[slug]/page.tsx` | News article detail route |
| `src/features/admin/queries/news-categories.ts` | `listNewsCategories` (all) |
| `src/features/admin/queries/news.ts` | `listNewsArticles`, `getNewsArticleForEdit` |
| `src/features/admin/queries/announcements.ts` | `listAnnouncements`, `getAnnouncementForEdit` |
| `src/features/admin/queries/events.ts` | `listEvents`, `getEventForEdit` |
| `src/features/admin/actions/news-categories.ts` | SuperAdmin category CRUD |
| `src/features/admin/actions/news.ts` | `saveNewsArticle`, `submitNewsForReview`, `publishNewsArticle`, `archiveNewsArticle`, `returnNewsToDraft` |
| `src/features/admin/actions/news-photos.ts` | `uploadNewsPhotos`, `reorderNewsPhotos`, `removeNewsPhoto` |
| `src/features/admin/actions/media.ts` | `uploadSingleImage`, `removeStoredImage` (announcement image, event cover) |
| `src/features/admin/components/single-image-uploader.tsx` | One-slot uploader shared by announcements + events (client) |
| `src/features/admin/actions/announcements.ts` | `saveAnnouncement`, `submit/publish/archive/returnToDraft` |
| `src/features/admin/actions/events.ts` | `saveEvent`, `submit/publish/archive/returnToDraft` |
| `src/features/admin/components/news-categories-panel.tsx` | SuperAdmin category editor |
| `src/features/admin/components/news-photo-uploader.tsx` | Drag-drop uploader (client) |
| `src/features/admin/components/announcement-form.tsx` | Announcement drawer editor |

**Modified:**

| Path | Change |
| --- | --- |
| `src/types/index.ts` | New row/view-model/form types; drop `NewsArticle.featured`; content-status type |
| `next.config.ts` | Add Supabase Storage `remotePatterns` entry |
| `src/constants/site.ts` | Hotline number correction (`SITE.phone`, `EMERGENCY_HOTLINES[0]`) |
| `src/features/announcements/data.ts` | Delete; consumers move to queries (removed in Task 16) |
| `src/features/announcements/index.ts` | Export new query-backed components |
| `src/features/announcements/components/news-feed.tsx` | Read DB, featured = newest, real pagination, link to slug |
| `src/features/announcements/components/news-card.tsx` | Link to slug; take view-model types |
| `src/features/announcements/components/news-sidebar.tsx` | DB announcements + canonical `EMERGENCY_HOTLINES` |
| `src/components/shared/announcement-card.tsx` / `event-card.tsx` | Resolve image via `photoUrl` (announcement); otherwise unchanged shapes |
| `src/features/home/components/community-pulse-section.tsx` | Async; read DB announcements + events |
| `src/features/home/data.ts` | Remove `LATEST_ANNOUNCEMENTS`, `UPCOMING_EVENTS` (Task 16) |
| `src/features/admin/components/news-manager.tsx` | DB list, tabs, status filter incl. in-review/archived |
| `src/features/admin/components/news-form.tsx` | Real save via actions, mount uploader, status transitions |
| `src/features/admin/components/events-manager.tsx` | DB list, status filter/transitions |
| `src/features/admin/components/event-form.tsx` | Real save via actions, cover image |
| `src/features/admin/data.ts` | Nav `permission: "manage-news"` on both items; remove `ADMIN_NEWS`/`ADMIN_EVENTS`/`EVENT_META` (Task 16) |
| `src/features/admin/index.ts` | Export new components |
| `src/app/admin/(portal)/news/page.tsx` | Server component: tabs + SuperAdmin categories panel, `manage-news` gate |
| `src/app/admin/(portal)/events/page.tsx` | Server component: pass DB data, `manage-news` gate |
| `docs/BACKEND_HANDOFF.md` | Changelog, routes, entities, work items |

---

## Task 1: Migration — enums, five tables, storage, seed

**Files:**
- Create: `supabase/migrations/0007_news_content.sql`

**Interfaces:**
- Consumes: `public.set_updated_at()` (migration 0001), `public.profiles`, `auth.users`, `storage.buckets`, `storage.objects`.
- Produces: enums `content_status`, `event_category`; tables `news_categories`, `news_articles`, `news_photos`, `announcements`, `events`; bucket `public-media`. Every later task depends on these exact column names.

**Context:** Read `supabase/migrations/0006_ticketing_flows.sql` first — mirror its comment voice and RLS posture. This migration is **not applied by any agent**; Justine applies it by hand (Task 18 is blocked on that). Seed image URLs come verbatim from `src/features/announcements/data.ts` and `src/features/home/data.ts` — copy the exact `lh3.googleusercontent.com` strings so day one is pixel-identical.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0007_news_content.sql`:

```sql
-- News, announcements & events (Plan 3, spec §5).
--
-- RLS: enabled with NO policies on all five tables, deliberately. Neither anon
-- nor authenticated may touch them. Every read (public pages filter
-- status='published') and every write goes through the service-role client
-- after an explicit check in code, so the gate lives in one reviewable place.
--
-- Storage: one public bucket `public-media`. Public read; no anon/authenticated
-- write policy (the service-role client bypasses RLS for uploads).

create type public.content_status as enum ('draft', 'in-review', 'published', 'archived');
create type public.event_category as enum
  ('town-hall', 'health-drive', 'festival', 'youth', 'environment', 'community');

-- ── News categories ─────────────────────────────────────────────────────────
-- SuperAdmin-editable; retired via is_active, never deleted (news_articles
-- reference them). Mirrors assistance_categories.
create table public.news_categories (
  id text primary key,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index news_categories_sort_order_idx on public.news_categories (sort_order);
alter table public.news_categories enable row level security;
create trigger news_categories_updated_at
  before update on public.news_categories
  for each row execute function public.set_updated_at();

insert into public.news_categories (id, label, sort_order) values
  ('governance', 'Governance', 1),
  ('health-wellness', 'Health & Wellness', 2),
  ('environment', 'Environment', 3),
  ('community', 'Community', 4),
  ('public-safety', 'Public Safety', 5),
  ('advisory', 'Advisory', 6),
  ('infrastructure', 'Infrastructure', 7);

-- ── News articles ───────────────────────────────────────────────────────────
create table public.news_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category_id text not null references public.news_categories (id) on delete restrict,
  excerpt text not null,
  body text not null default '',
  author_id uuid references public.profiles (id) on delete set null,
  author_name text,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index news_articles_status_published_idx
  on public.news_articles (status, published_at desc);
alter table public.news_articles enable row level security;
create trigger news_articles_updated_at
  before update on public.news_articles
  for each row execute function public.set_updated_at();

-- ── News photos (0–3 per article; cap enforced in code) ─────────────────────
create table public.news_photos (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles (id) on delete cascade,
  src text not null,
  alt text not null default '',
  sort_order int not null default 0
);
create index news_photos_article_idx on public.news_photos (article_id, sort_order);
alter table public.news_photos enable row level security;

-- ── Announcements (short dated notices) ─────────────────────────────────────
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  excerpt text not null,
  image_src text,
  image_alt text not null default '',
  urgent boolean not null default false,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_status_date_idx
  on public.announcements (status, date desc);
alter table public.announcements enable row level security;
create trigger announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

-- ── Events ──────────────────────────────────────────────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category public.event_category not null default 'community',
  event_date date not null,
  start_time text not null,
  end_time text,
  venue text not null,
  capacity int,
  description text not null default '',
  cover_src text,
  cover_alt text not null default '',
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_status_date_idx
  on public.events (status, event_date asc);
alter table public.events enable row level security;
create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ── Storage: public-media bucket ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('public-media', 'public-media', true)
  on conflict (id) do nothing;
create policy "public read public-media" on storage.objects
  for select to public using (bucket_id = 'public-media');

-- ── Seed (day-one parity; images keep their current lh3 URLs) ───────────────
insert into public.news_articles (slug, title, category_id, excerpt, body, author_name, status, published_at) values
  ('annual-barangay-health-mission', 'Annual Barangay Health Mission: Serving Over 500 Residents',
   'health-wellness',
   'The Barangay San Fernando council, in collaboration with the Municipal Health Office, successfully concluded its 3-day health mission providing free consultations, medicines, and dental services to the community.',
   'The Barangay San Fernando council, in collaboration with the Municipal Health Office, successfully concluded its 3-day health mission.

Over 500 residents received free consultations, medicines, and dental services across the three days.',
   'Admin Office', 'published', now() - interval '2 days'),
  ('q4-town-hall-budget-presentation', 'Q4 Town Hall Meeting: Budget Presentation',
   'governance',
   'Join us this coming Saturday for the final quarterly report of the year. Transparency in every peso spent.',
   'Join us this coming Saturday for the final quarterly report of the year.', 'Admin Office', 'published', now() - interval '1 day'),
  ('green-san-fernando-tree-planting', 'Green San Fernando: Tree Planting Drive',
   'environment',
   'Over 100 seedlings were planted along the riverside as part of our climate resilience initiative.',
   'Over 100 seedlings were planted along the riverside as part of our climate resilience initiative.', 'Admin Office', 'published', now() - interval '9 days');

-- Photos: article 1 gets 3 (mosaic), article 2 gets 2 (side-by-side), article 3 gets 0 (text card).
insert into public.news_photos (article_id, src, alt, sort_order)
select id, 'https://lh3.googleusercontent.com/aida-public/AB6AXuDQ1ENg0K93q5ytb5OOTgJEY55sIn8nMDOlzJU0htQWmrd7zczGG0qK3G2pZit_pe52gsn8nXZuxFE3GpmYY2BKwIjjlkUW2TZs7B4OAQifFp9FnEGJqEqFQC4DT0kz3KsKbgnHClpLUwgNYUZEVeq4a8EGE_M-7wIlojSNb2nkeAe5yarhLzxsXDrgW7wa--fNBMYQXPZm3dDe3mK68fUwJzVXjyXjfv7HNFtKclIKYXXGmAuF2k49XRRuQ3mDJxIAv7d1Ay4N0ps',
  'Medical professionals providing checkups during a community health mission', 0
from public.news_articles where slug = 'annual-barangay-health-mission';
insert into public.news_photos (article_id, src, alt, sort_order)
select id, 'https://lh3.googleusercontent.com/aida-public/AB6AXuAKfX6kI2fekmRPUd1kE_O3EyuEA3gJBN7KbNJDLjXz1PYGsNn8myyZZFhbbGnpIeJy711seRjFGNjzfgJJdN1_4JCKTETETxt_Qey4QEJ8cyiyPU2l9b_qB-HLlkwi9reMFdSd0b8LbCrY5AkFxFJvPLTHF-UpjNkyazbr4gVeTVo71J3OEJEqVDi46slsj_oc8JcjUShpuGlDyHCccCPsQAkf0lEW4spWv-w4YL9D0fJp_v3CXRVXoSwVDPQWzMXvMg6jDS_CObk',
  'Residents at a community health event', 1
from public.news_articles where slug = 'annual-barangay-health-mission';
insert into public.news_photos (article_id, src, alt, sort_order)
select id, 'https://lh3.googleusercontent.com/aida-public/AB6AXuBQMEWS1CFwllE8d9raqgMitrZe3lxxzWXQ3Bcl2I1HXP7eHqHEK-hqYJgyWkH3UD0brZRExGSa6WZnAViKeIXMh8s0B4saCQjR7DrQUVlkYtWz7hleSkf5wufO4vDDEmqkDlv8z6bMCyl0t04YwZws14Lx0jGXLoOWgFmGq-2O9kHlhu5ab9-ojY4N96RIQVx5QlNdldjOaujdC7lDoqUfEQxtEysVrhbjng7EVEHi9Z_d91NIpXXDZFAILNbLfieTKvuefXZDugY',
  'Health workers during a medical mission', 2
from public.news_articles where slug = 'annual-barangay-health-mission';
insert into public.news_photos (article_id, src, alt, sort_order)
select id, 'https://lh3.googleusercontent.com/aida-public/AB6AXuD6ma96iTbXpL5D8iY00jdQna9_E9Zc9Sz1zRrMTSnNzYAJ8lNmcAZsfdiG3Wyla4IeN5jMONdFhBJlFLpuFfF_TfK_XNjhhgv0CPkqQFbPj6gcrjAaA2_BI1MxwU8erS0Nev1byXqKmBW3krm_NWuIq4WiwGzViYZx3m4q2Hf1FudxjQVYKWDp7thYZJATFUhyPY9ADPr20voWQ8YrCleK1uzP0mlrHUCLZh3bFarIDDLdXiq6fyBtcKmqyhE8mgNMjeWwhiG4n0Q',
  'Residents attending a town hall meeting', 0
from public.news_articles where slug = 'q4-town-hall-budget-presentation';
insert into public.news_photos (article_id, src, alt, sort_order)
select id, 'https://lh3.googleusercontent.com/aida-public/AB6AXuA-DyS7lqlQDwEm2qpytdfuo-xlsf0GzLuTmdrJcxLAhT6yyg4EOtyQ4M6hnBO4G0IS-Kcs3MNwEK3pUCk9j3re7tJgHB45Mh5l4vAMU_Qq83BgZ31mSftlpO5cpPG3NCuzWWwHsEo-S1Kt9lB4SzMjfCMTVXJksgFz_Q1IGK1aDhxAtAAQvLaVCMF7lslaG3XIkdRBHkML-6ZF2Ooh80Yq6fPP0-_GIjq0dThSjfEeIhPzXyZrqPkbFn7izXoWPe8tnlQCzK6g0IM',
  'Volunteers planting trees in a local park', 1
from public.news_articles where slug = 'q4-town-hall-budget-presentation';

insert into public.announcements (title, date, excerpt, image_src, image_alt, urgent, status, published_at) values
  ('Schedule of Barangay Assembly Meeting', '2025-05-20',
   'Please be informed that the monthly barangay assembly meeting will be...',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuAKfX6kI2fekmRPUd1kE_O3EyuEA3gJBN7KbNJDLjXz1PYGsNn8myyZZFhbbGnpIeJy711seRjFGNjzfgJJdN1_4JCKTETETxt_Qey4QEJ8cyiyPU2l9b_qB-HLlkwi9reMFdSd0b8LbCrY5AkFxFJvPLTHF-UpjNkyazbr4gVeTVo71J3OEJEqVDi46slsj_oc8JcjUShpuGlDyHCccCPsQAkf0lEW4spWv-w4YL9D0fJp_v3CXRVXoSwVDPQWzMXvMg6jDS_CObk',
   'Residents gathered for a barangay assembly', false, 'published', now() - interval '1 day'),
  ('Scheduled Power Interruption', '2024-10-26',
   'Maintenance works by the electric cooperative on Puroks 4 and 5 from 8:00 AM to 5:00 PM.', null, '', true, 'published', now() - interval '3 days'),
  ('Free Medical Mission this May 25', '2025-05-18',
   'The barangay will conduct a free medical and dental mission for all...', null, '', false, 'published', now() - interval '5 days');

insert into public.events (title, category, event_date, start_time, end_time, venue, capacity, status, published_at) values
  ('Medical & Dental Mission', 'health-drive', '2025-05-25', '8:00 AM', '3:00 PM', 'Barangay Covered Court', 200, 'published', now()),
  ('Youth Leadership Seminar', 'youth', '2025-05-30', '9:00 AM', '12:00 PM', 'Barangay Hall', 60, 'published', now()),
  ('Environment Clean-up Drive', 'environment', '2025-06-05', '6:00 AM', '10:00 AM', 'Barangay San Fernando', null, 'published', now()),
  ('Senior Citizens Gathering', 'community', '2025-06-12', '1:00 PM', '5:00 PM', 'Barangay Hall', 100, 'published', now());
```

- [ ] **Step 2: Verify SQL parses locally (no apply)**

There is no local Postgres. Verify by eye against `0006_ticketing_flows.sql` that: every table has `enable row level security`, only `news_categories`/`announcements`/`events`/`news_articles` have the `updated_at` trigger (not `news_photos`), and no `create policy` exists on the five content tables. Confirm the file saved:

Run: `git status --short supabase/migrations/0007_news_content.sql`
Expected: `?? supabase/migrations/0007_news_content.sql`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_news_content.sql
git commit -m "feat(db): news, announcements & events schema + storage bucket (0007)"
```

---

## Task 2: Types, storage helper, and `next.config.ts`

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/storage.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `ContentStatus`; view-model types `NewsArticleListItem`, `NewsArticleDetail`, `NewsPhoto`, `NewsCategoryRow`; admin row types `AdminNewsArticleRow`, `AdminAnnouncementRow`, `AdminEventRow`; form types `NewsArticleValues`, `AnnouncementValues`, `EventValues`, `NewsCategoryValues`. Storage helpers `PUBLIC_MEDIA_BUCKET`, `photoUrl(src)`, `newsPhotoPath(articleId, ext)`, `ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_BYTES`.
- Consumes: existing `EventCategory`, `Announcement`, `CommunityEvent` from `src/types/index.ts`.

**Context:** Keep the existing public `Announcement` and `CommunityEvent` interfaces (the sidebar/board cards consume them) — queries will map DB rows into them. Remove only `NewsArticle.featured`.

- [ ] **Step 1: Create `src/lib/storage.ts`**

```ts
export const PUBLIC_MEDIA_BUCKET = "public-media";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB (spec §5)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/**
 * Resolve a stored image reference to a usable `next/image` src. A reference is
 * either a full remote URL (seed rows keep their original lh3 URLs) or a
 * `public-media` object path (uploaded photos).
 */
export function photoUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return `${SUPABASE_URL}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${src}`;
}

/** Storage object path for a news photo: `news/<articleId>/<uuid>.<ext>`. */
export function newsPhotoPath(articleId: string, ext: string): string {
  return `news/${articleId}/${crypto.randomUUID()}.${ext}`;
}

/** Map an allowed image MIME type to a file extension. */
export function extForType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}
```

- [ ] **Step 2: Add types to `src/types/index.ts`**

In the "News & announcements" region, remove `featured?: boolean;` from `NewsArticle`, and add:

```ts
export type ContentStatus = "draft" | "in-review" | "published" | "archived";

export interface NewsCategoryRow {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}
export interface NewsCategoryValues {
  label: string;
}

export interface NewsPhoto {
  id: string;
  src: string; // raw reference; resolve with photoUrl() at render
  alt: string;
}

/** Public news card / feed item. */
export interface NewsArticleListItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  coverSrc: string | null;
  coverAlt: string;
  dateLabel: string;
  isNew: boolean;
  author: string | null;
}
/** Public news detail (slug page). */
export interface NewsArticleDetail extends NewsArticleListItem {
  body: string;
  photos: NewsPhoto[];
}

/** Admin list rows. */
export interface AdminNewsArticleRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  categoryId: string;
  excerpt: string;
  status: ContentStatus;
  coverSrc: string | null;
  coverAlt: string;
  photoCount: number;
  updatedLabel: string;
  publishedLabel: string | null;
}
export interface AdminAnnouncementRow {
  id: string;
  title: string;
  date: string;
  excerpt: string;
  urgent: boolean;
  status: ContentStatus;
  imageSrc: string | null;
  imageAlt: string;
  updatedLabel: string;
}
export interface AdminEventRow {
  id: string;
  title: string;
  category: EventCategory;
  eventDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  capacity: number | null;
  description: string;
  status: ContentStatus;
  coverSrc: string | null;
  coverAlt: string;
}

/** Drawer form values. */
export interface NewsArticleValues {
  title: string;
  slug: string;
  categoryId: string;
  excerpt: string;
  body: string;
}
export interface AnnouncementValues {
  title: string;
  date: string;
  excerpt: string;
  urgent: boolean;
  imageSrc: string | null;
  imageAlt: string;
}
export interface EventValues {
  title: string;
  category: EventCategory;
  eventDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  capacity: number | null;
  description: string;
  coverSrc: string | null;
  coverAlt: string;
}
```

- [ ] **Step 3: Add the Supabase Storage host to `next.config.ts`**

In `images.remotePatterns`, alongside the existing `lh3.googleusercontent.com` entry, add (derive the host from the env URL so it tracks the project):

```ts
// inside next.config.ts, before the config object:
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
```

and in `remotePatterns`:

```ts
...(supabaseHost
  ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
  : []),
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both clean. (Type errors will appear in files still referencing `NewsArticle.featured` — Task 6 owns `news-card.tsx`/`news-feed.tsx`; if `data.ts` sets `featured: true`, remove that property in this task to keep the build green.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/types/index.ts next.config.ts src/features/announcements/data.ts
git commit -m "feat(news): view-model types, storage helper, supabase image host"
```

---

## Task 3: Public content queries

**Files:**
- Create: `src/features/announcements/queries.ts`
- Create: `src/features/events/queries.ts`, `src/features/events/index.ts`

**Interfaces:**
- Consumes: `createSupabaseAdminClient` from `@/lib/supabase/admin`; `photoUrl` from `@/lib/storage`; `formatDate`, `toManilaDate` from `@/lib/format`; types from Task 2.
- Produces:
  - `listPublishedArticles(page: number): Promise<{ items: NewsArticleListItem[]; total: number; pageSize: number }>` (pageSize 7)
  - `getPublishedArticleBySlug(slug: string): Promise<NewsArticleDetail | null>`
  - `listPublishedAnnouncements(limit?: number): Promise<Announcement[]>`
  - `listActiveNewsCategories(): Promise<NewsCategoryRow[]>`
  - `listUpcomingEvents(limit?: number): Promise<CommunityEvent[]>` (events/queries.ts)

**Context:** All reads use the service-role client and **must** filter `status = 'published'`. `isNew` = `published_at` within 7 days. Timestamptz → Manila via `toManilaDate`; `event_date`/announcement `date` are bare dates — pass through to `formatDate` unchanged.

- [ ] **Step 1: Write `src/features/announcements/queries.ts`**

```ts
import "server-only";
import type {
  Announcement,
  NewsArticleDetail,
  NewsArticleListItem,
  NewsCategoryRow,
} from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";
import { formatDate, toManilaDate } from "@/lib/format";

const PAGE_SIZE = 7; // 1 featured + 6 grid

function isWithin7Days(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  const days = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
  return days >= 0 && days < 7;
}

interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body?: string;
  published_at: string | null;
  author_name: string | null;
  news_categories: { label: string } | null;
  news_photos: { id: string; src: string; alt: string; sort_order: number }[];
}

function toListItem(row: ArticleRow): NewsArticleListItem {
  const cover = [...row.news_photos].sort((a, b) => a.sort_order - b.sort_order)[0] ?? null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.news_categories?.label ?? "News",
    excerpt: row.excerpt,
    coverSrc: cover ? photoUrl(cover.src) : null,
    coverAlt: cover?.alt ?? "",
    dateLabel: row.published_at ? formatDate(toManilaDate(row.published_at)) : "",
    isNew: isWithin7Days(row.published_at),
    author: row.author_name,
  };
}

export async function listPublishedArticles(
  page: number,
): Promise<{ items: NewsArticleListItem[]; total: number; pageSize: number }> {
  const admin = createSupabaseAdminClient();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * PAGE_SIZE;

  const { data, count, error } = await admin
    .from("news_articles")
    .select(
      "id, slug, title, excerpt, published_at, author_name, news_categories(label), news_photos(id, src, alt, sort_order)",
      { count: "exact" },
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error || !data) return { items: [], total: 0, pageSize: PAGE_SIZE };
  return {
    items: (data as unknown as ArticleRow[]).map(toListItem),
    total: count ?? 0,
    pageSize: PAGE_SIZE,
  };
}

export async function getPublishedArticleBySlug(slug: string): Promise<NewsArticleDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .select(
      "id, slug, title, excerpt, body, published_at, author_name, news_categories(label), news_photos(id, src, alt, sort_order)",
    )
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as ArticleRow;
  const photos = [...row.news_photos]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ id: p.id, src: photoUrl(p.src), alt: p.alt }));
  return { ...toListItem(row), body: row.body ?? "", photos };
}

export async function listPublishedAnnouncements(limit = 3): Promise<Announcement[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("title, date, excerpt, image_src, image_alt, urgent, published_at")
    .eq("status", "published")
    .order("date", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((r) => ({
    title: r.title,
    date: r.date,
    excerpt: r.excerpt,
    image: r.image_src ? photoUrl(r.image_src) : undefined,
    imageAlt: r.image_alt ?? "",
    urgent: r.urgent,
    isNew: isWithin7Days(r.published_at),
  }));
}

export async function listActiveNewsCategories(): Promise<NewsCategoryRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_categories")
    .select("id, label, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, label: r.label, sortOrder: r.sort_order, isActive: r.is_active }));
}
```

- [ ] **Step 2: Write `src/features/events/queries.ts`**

```ts
import "server-only";
import type { CommunityEvent } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Upcoming published events, soonest first; past events drop off automatically. */
export async function listUpcomingEvents(limit = 4): Promise<CommunityEvent[]> {
  const admin = createSupabaseAdminClient();
  const todayManila = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const { data, error } = await admin
    .from("events")
    .select("title, event_date, start_time, end_time, venue")
    .eq("status", "published")
    .gte("event_date", todayManila)
    .order("event_date", { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data.map((r) => ({
    title: r.title,
    date: r.event_date,
    time: r.end_time ? `${r.start_time} - ${r.end_time}` : r.start_time,
    venue: r.venue,
  }));
}
```

And `src/features/events/index.ts`:

```ts
export { listUpcomingEvents } from "./queries";
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean. (These are pure additions; no consumer imports them yet.)

- [ ] **Step 4: Commit**

```bash
git add src/features/announcements/queries.ts src/features/events/queries.ts src/features/events/index.ts
git commit -m "feat(news): public queries for articles, announcements, events, categories"
```

---

## Task 4: News gallery + lightbox (client)

**Files:**
- Create: `src/features/announcements/components/news-gallery.tsx`

**Interfaces:**
- Consumes: `NewsPhoto[]` (already `photoUrl`-resolved by `getPublishedArticleBySlug`).
- Produces: `<NewsGallery photos={NewsPhoto[]} />` — renders nothing for 0 photos; count-based layout for 1/2/3; opens a shared lightbox on click.

**Context:** `"use client"` (lightbox keyboard/overlay state). Use `next/image` with `fill` inside aspect containers. Layouts (spec §5): 1 = full-width hero; 2 = two equal columns (stacked on mobile); 3 = one lead spanning two columns + two below. Lightbox: overlay with prev/next, `Escape` closes, `ArrowLeft`/`ArrowRight` navigate, click backdrop closes.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { NewsPhoto } from "@/types";
import { cn } from "@/lib/utils";

export function NewsGallery({ photos }: { photos: NewsPhoto[] }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const count = photos.length;

  const close = useCallback(() => setOpenAt(null), []);
  const step = useCallback(
    (delta: number) => setOpenAt((i) => (i === null ? i : (i + delta + count) % count)),
    [count],
  );

  useEffect(() => {
    if (openAt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAt, close, step]);

  if (count === 0) return null;

  const tile = (photo: NewsPhoto, index: number, className: string) => (
    <button
      key={photo.id}
      type="button"
      onClick={() => setOpenAt(index)}
      className={cn("group relative overflow-hidden rounded-2xl bg-ink-100", className)}
      aria-label={`View photo ${index + 1} of ${count}`}
    >
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes="(min-width: 768px) 66vw, 100vw"
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
    </button>
  );

  return (
    <>
      <div
        className={cn(
          "grid gap-3",
          count === 1 && "grid-cols-1",
          count === 2 && "grid-cols-1 sm:grid-cols-2",
          count === 3 && "grid-cols-2",
        )}
      >
        {count === 3
          ? [
              tile(photos[0], 0, "col-span-2 aspect-video"),
              tile(photos[1], 1, "aspect-square"),
              tile(photos[2], 2, "aspect-square"),
            ]
          : photos.map((photo, index) => tile(photo, index, "aspect-video"))}
      </div>

      {openAt !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/90 p-4"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          {count > 1 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); step(-1); }}
              aria-label="Previous photo"
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <ChevronLeft className="h-7 w-7" aria-hidden="true" />
            </button>
          ) : null}
          <div className="relative h-[80vh] w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <Image
              src={photos[openAt].src}
              alt={photos[openAt].alt}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>
          {count > 1 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); step(1); }}
              aria-label="Next photo"
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <ChevronRight className="h-7 w-7" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/features/announcements/components/news-gallery.tsx
git commit -m "feat(news): count-based photo gallery with lightbox"
```

---

## Task 5: Public news slug page

**Files:**
- Create: `src/app/(public)/announcements/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getPublishedArticleBySlug` (Task 3), `NewsGallery` (Task 4), `photoUrl`.
- Produces: the `/announcements/[slug]` route + `generateMetadata` (OG image = first photo).

**Context:** Server Component. `notFound()` when the article is missing or not published. Body renders as paragraphs split on blank lines. Use the `Container`/`PageHero` primitives already used by `announcements/page.tsx`. 0-photo articles render the neutral text layout (no gallery).

- [ ] **Step 1: Write the page**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { NewsGallery } from "@/features/announcements/components/news-gallery";
import { getPublishedArticleBySlug } from "@/features/announcements/queries";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) return { title: "Article not found" };
  return {
    title: article.title,
    description: article.excerpt,
    openGraph: {
      title: article.title,
      description: article.excerpt,
      images: article.photos[0] ? [article.photos[0].src] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) notFound();

  const paragraphs = article.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <Container className="py-12 md:py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/announcements"
          className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to News
        </Link>
        <Badge variant="soft" className="mb-3 w-fit">{article.category}</Badge>
        <h1 className="mb-4 font-display text-3xl font-bold tracking-tight text-ink-900 md:text-4xl">
          {article.title}
        </h1>
        <div className="mb-8 flex items-center gap-3 text-sm text-ink-600">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100">
            <User className="h-4 w-4 text-ink-900" aria-hidden="true" />
          </span>
          <span>{article.author ?? "Barangay San Fernando"}</span>
          <span aria-hidden="true">·</span>
          <span>{article.dateLabel}</span>
        </div>

        {article.photos.length > 0 ? (
          <div className="mb-8">
            <NewsGallery photos={article.photos} />
          </div>
        ) : null}

        <div className="space-y-4 text-lg leading-relaxed text-ink-700">
          {paragraphs.length > 0
            ? paragraphs.map((p, i) => <p key={i}>{p}</p>)
            : <p>{article.excerpt}</p>}
        </div>
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean; `/announcements/[slug]` appears as a dynamic route in the build output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/announcements/[slug]/page.tsx"
git commit -m "feat(news): public article slug page with gallery"
```

---

## Task 6: Public news feed — DB, featured-newest, real pagination

**Files:**
- Modify: `src/features/announcements/components/news-feed.tsx`
- Modify: `src/features/announcements/components/news-card.tsx`
- Modify: `src/app/(public)/announcements/page.tsx`

**Interfaces:**
- Consumes: `listPublishedArticles(page)` (Task 3); `NewsArticleListItem`.
- Produces: `<NewsFeed page={number} />` (async server component) rendering featured hero (item 0) + grid (items 1..) + a link-based pager (`?page=n`). `NewsCard`/`FeaturedNewsCard` link to `/announcements/<slug>` and take `NewsArticleListItem`.

**Context:** `NewsFeed` becomes `async` and receives the current `page` from the route's `searchParams`. The pager is server-rendered `<Link>`s (prev/next + page numbers), not a client button — no client state. Empty state: "No news yet." Featured = the newest published (item 0 of page 1); on pages > 1 there is no separate featured, render all as grid.

- [ ] **Step 1: Rewrite `news-card.tsx`** so both cards take `NewsArticleListItem`, resolve `coverSrc`/`coverAlt`, link to `/announcements/${article.slug}`, and drop the `href="#"` anchors (replace `<a href="#">` with `<Link href={/announcements/${article.slug}}>`). Keep the existing markup/classes; only swap data fields (`article.image`→`coverSrc`, `article.imageAlt`→`coverAlt`, `article.dateLabel` unchanged, `article.author` unchanged) and render a neutral placeholder block when `coverSrc` is null:

```tsx
{article.coverSrc ? (
  <Image src={article.coverSrc} alt={article.coverAlt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
) : (
  <div className="flex h-full items-center justify-center bg-ink-100 text-ink-400">
    <ImageIcon className="h-10 w-10" aria-hidden="true" />
  </div>
)}
```

(import `ImageIcon` from `lucide-react`, `Link` from `next/link`.)

- [ ] **Step 2: Rewrite `news-feed.tsx`**

```tsx
import Link from "next/link";
import { FeaturedNewsCard, NewsCard } from "@/features/announcements/components/news-card";
import { listPublishedArticles } from "@/features/announcements/queries";

export async function NewsFeed({ page }: { page: number }) {
  const { items, total, pageSize } = await listPublishedArticles(page);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showFeatured = page === 1 && items.length > 0;
  const featured = showFeatured ? items[0] : null;
  const grid = showFeatured ? items.slice(1) : items;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between border-b border-ink-200 pb-4">
        <h2 className="text-2xl font-semibold text-ink-900">Community News Feed</h2>
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-ink-500">No news yet. Please check back soon.</p>
      ) : (
        <>
          {featured ? <FeaturedNewsCard article={featured} /> : null}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {grid.map((article) => (
              <NewsCard key={article.id} article={article} />
            ))}
          </div>
          {totalPages > 1 ? (
            <nav className="flex items-center justify-center gap-2 py-4" aria-label="News pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={n === 1 ? "/announcements" : `/announcements?page=${n}`}
                  aria-current={n === page ? "page" : undefined}
                  className={
                    n === page
                      ? "rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-900"
                      : "rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:border-ink-900"
                  }
                >
                  {n}
                </Link>
              ))}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update `announcements/page.tsx`** to read `searchParams` and pass `page`:

```tsx
export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const current = Number(page) > 0 ? Number(page) : 1;
  // ...unchanged hero...
  // <NewsFeed page={current} /> in the lg:col-span-8 column
}
```

Keep the `NewsSidebar` in the right column (Task 7 makes it async).

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean. Drive `/announcements` — featured hero + grid render from seed data; `/announcements?page=2` shows the pager (with 3 seed articles and pageSize 7 there is a single page; verify the pager is hidden). Verify a card's "Details"/"Read More" now links to `/announcements/<slug>`.

- [ ] **Step 5: Commit**

```bash
git add src/features/announcements/components/news-feed.tsx src/features/announcements/components/news-card.tsx "src/app/(public)/announcements/page.tsx"
git commit -m "feat(news): DB-backed news feed with featured-newest and pagination"
```

---

## Task 7: Public sidebar, home board & hotline correction

**Files:**
- Modify: `src/features/announcements/components/news-sidebar.tsx`
- Modify: `src/components/shared/announcement-card.tsx`
- Modify: `src/features/home/components/community-pulse-section.tsx`
- Modify: `src/constants/site.ts`

**Interfaces:**
- Consumes: `listPublishedAnnouncements` (Task 3), `listUpcomingEvents` (Task 3 events), `EMERGENCY_HOTLINES`.
- Produces: async `NewsSidebar` and `CommunityPulseSection` reading the DB; the hotline-corrected `SITE`/`EMERGENCY_HOTLINES`.

**Context:** `announcement-card.tsx` already handles an optional `image`; queries pass an already-resolved URL, so it needs no change except confirming it renders `image` as-is (no double `photoUrl`). The sidebar's hotlines widget switches from the deleted `SIDEBAR_HOTLINES` to the canonical `EMERGENCY_HOTLINES`.

- [ ] **Step 1: Correct the hotline in `src/constants/site.ts`**

- `SITE.phone`: `"(077) 123 4567"` → `"(077) 600 1082"`.
- `EMERGENCY_HOTLINES[0]`: `{ label: "Barangay Hotline", number: "(077) 600 1082", icon: PhoneCall }`.

- [ ] **Step 2: Make `NewsSidebar` async and DB-backed.** Convert `AnnouncementsWidget` to accept `announcements: Announcement[]` (fetched by the async `NewsSidebar`), and change `HotlinesWidget` to map over `EMERGENCY_HOTLINES` (import from `@/constants/site`), dropping the `SIDEBAR_HOTLINES`/`SIDEBAR_ANNOUNCEMENTS` imports. The widget keeps its existing dark styling; each hotline renders `label` + `number` with `toTelHref(number)`.

```tsx
export async function NewsSidebar() {
  const announcements = await listPublishedAnnouncements(3);
  return (
    <aside className="space-y-8">
      <AnnouncementsWidget announcements={announcements} />
      <HotlinesWidget />
      <NewsletterForm />
    </aside>
  );
}
```

- [ ] **Step 3: Make `CommunityPulseSection` async**, replacing the `LATEST_ANNOUNCEMENTS`/`UPCOMING_EVENTS` imports with `await listPublishedAnnouncements(3)` and `await listUpcomingEvents(4)`. Keep `GLANCE_STATS` from `home/data.ts` (out of scope). The JSX map bodies are unchanged.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean. Drive `/` and `/announcements`: the announcements column, events column, and sidebar render from seed data; the sidebar hotlines show `(077) 600 1082` for the Barangay Hotline and **no `(02)` number anywhere**; the footer and `/contact` also show `(077) 600 1082`.

- [ ] **Step 5: Commit**

```bash
git add src/features/announcements/components/news-sidebar.tsx src/components/shared/announcement-card.tsx src/features/home/components/community-pulse-section.tsx src/constants/site.ts
git commit -m "feat(news): DB-backed home board & sidebar; real barangay hotline"
```

---

## Task 8: SuperAdmin news categories — query, actions, panel

**Files:**
- Create: `src/features/admin/queries/news-categories.ts`
- Create: `src/features/admin/actions/news-categories.ts`
- Create: `src/features/admin/components/news-categories-panel.tsx`

**Interfaces:**
- Consumes: `requireSuperAdmin`, `recordActivity`, `createSupabaseAdminClient`, `NewsCategoryRow`, `NewsCategoryValues`, `ActionResult`.
- Produces: `listNewsCategories(): Promise<NewsCategoryRow[]>`; actions `createNewsCategory`, `renameNewsCategory`, `setNewsCategoryActive`, `moveNewsCategory`; `<NewsCategoriesPanel categories={NewsCategoryRow[]} />`.

**Context:** This is a near-verbatim copy of the assistance-categories triplet. Copy `src/features/admin/actions/assistance-categories.ts` and `src/features/admin/components/assistance-categories-panel.tsx`, then rename: table `assistance_categories`→`news_categories`, entity label `"assistance category"`→`"news category"`, and revalidate `/admin/news` (the panel's page) instead of `/admin/services`, plus `/announcements` (public news pages read the category label). Do **not** add an anon policy (decision 1).

- [ ] **Step 1: Write `src/features/admin/queries/news-categories.ts`**

```ts
import "server-only";
import type { NewsCategoryRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** All categories (active and retired) for the SuperAdmin editor. */
export async function listNewsCategories(): Promise<NewsCategoryRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_categories")
    .select("id, label, sort_order, is_active")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, label: r.label, sortOrder: r.sort_order, isActive: r.is_active }));
}
```

- [ ] **Step 2: Write `src/features/admin/actions/news-categories.ts`** by copying `assistance-categories.ts` and applying the renames above. Each action: `requireSuperAdmin()` first statement; the same slugify; `createNewsCategory` rejects on slug collision with `"A category with that name already exists."`; no delete action; `moveNewsCategory` uses the same non-atomic swap with the same explanatory comment. Every action ends with `revalidatePath("/admin/news")` and `revalidatePath("/announcements")`. Entity type string is `"news category"`; verbs `"added/renamed/retired/restored/reordered news category"`.

- [ ] **Step 3: Write `src/features/admin/components/news-categories-panel.tsx`** by copying `assistance-categories-panel.tsx` and swapping the imported action names and the `AssistanceCategoryRow`→`NewsCategoryRow` type. Keep the `ToggleSwitch` `role="switch"` accessible-name pattern (`Retire ${label}` / `Restore ${label}`) and the up/down reorder buttons (`Move ${label} up`/`down`) verbatim.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean. (The panel is mounted in Task 11's page assembly; runtime verification happens there and in Task 18.)

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/queries/news-categories.ts src/features/admin/actions/news-categories.ts src/features/admin/components/news-categories-panel.tsx
git commit -m "feat(admin): SuperAdmin news categories (mirrors assistance categories)"
```

---

## Task 9: News article — admin queries & workflow actions

**Files:**
- Create: `src/features/admin/queries/news.ts`
- Create: `src/features/admin/actions/news.ts`

**Interfaces:**
- Consumes: `requirePermission`, `recordActivity`, `createSupabaseAdminClient`, `formatDate`, `toManilaDate`, `photoUrl`, types from Task 2, `listNewsCategories` (Task 8, for id validation is unnecessary — validate against DB directly).
- Produces:
  - `listNewsArticles(): Promise<AdminNewsArticleRow[]>`
  - `getNewsArticleForEdit(id: string): Promise<{ values: NewsArticleValues; status: ContentStatus; photos: NewsPhoto[] } | null>`
  - actions `saveNewsArticle(id: string | null, values: NewsArticleValues): Promise<{ error: string | null; id: string | null }>`, `submitNewsForReview(id)`, `publishNewsArticle(id)`, `archiveNewsArticle(id)`, `returnNewsToDraft(id)` (each `ActionResult`).

**Context:** Permission `"manage-news"`. Slug: auto from title on create; unique with `-2`/`-3` suffixing (mirror services' collision handling); editable while `draft`/`in-review`, locked once published (reject slug changes on a published row). `author_id`/`author_name` set on create from the actor (`actor.id`, `actor.name`). `published_at` set only when a row first enters `published`. Transition guards live in the UPDATE `WHERE` (`.eq("status", <expected>)`); after `.maybeSingle()`/update, check `error` first, then `!data`. Every action audits and `revalidatePath("/admin/news")`, `"/announcements"`, `"/"`.

- [ ] **Step 1: Write `src/features/admin/queries/news.ts`**

```ts
import "server-only";
import type { AdminNewsArticleRow, ContentStatus, NewsArticleValues, NewsPhoto } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";
import { formatDate, toManilaDate } from "@/lib/format";

interface Row {
  id: string;
  slug: string;
  title: string;
  category_id: string;
  excerpt: string;
  status: ContentStatus;
  published_at: string | null;
  updated_at: string;
  news_categories: { label: string } | null;
  news_photos: { id: string; src: string; alt: string; sort_order: number }[];
}

export async function listNewsArticles(): Promise<AdminNewsArticleRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .select(
      "id, slug, title, category_id, excerpt, status, published_at, updated_at, news_categories(label), news_photos(id, src, alt, sort_order)",
    )
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as Row[]).map((r) => {
    const cover = [...r.news_photos].sort((a, b) => a.sort_order - b.sort_order)[0] ?? null;
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: r.news_categories?.label ?? "—",
      categoryId: r.category_id,
      excerpt: r.excerpt,
      status: r.status,
      coverSrc: cover ? photoUrl(cover.src) : null,
      coverAlt: cover?.alt ?? "",
      photoCount: r.news_photos.length,
      updatedLabel: formatDate(toManilaDate(r.updated_at)),
      publishedLabel: r.published_at ? formatDate(toManilaDate(r.published_at)) : null,
    };
  });
}

export async function getNewsArticleForEdit(
  id: string,
): Promise<{ values: NewsArticleValues; status: ContentStatus; photos: NewsPhoto[] } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .select("id, slug, title, category_id, excerpt, body, status, news_photos(id, src, alt, sort_order)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const photos = [...(data.news_photos ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ id: p.id, src: photoUrl(p.src), alt: p.alt }));
  return {
    values: {
      title: data.title,
      slug: data.slug,
      categoryId: data.category_id,
      excerpt: data.excerpt,
      body: data.body ?? "",
    },
    status: data.status as ContentStatus,
    photos,
  };
}
```

- [ ] **Step 2: Write `src/features/admin/actions/news.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { NewsArticleValues } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

const schema = z.object({
  title: z.string().trim().min(3, "Enter a title."),
  slug: z.string().trim().min(1, "Enter a slug."),
  categoryId: z.string().trim().min(1, "Pick a category."),
  excerpt: z.string().trim().min(1, "Enter an excerpt."),
  body: z.string(),
});

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function revalidate() {
  revalidatePath("/admin/news");
  revalidatePath("/announcements");
  revalidatePath("/");
}

/** Ensure a slug is unique, suffixing -2, -3… (ignoring the row being edited). */
async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
  ignoreId: string | null,
): Promise<string> {
  const { data } = await admin.from("news_articles").select("id, slug");
  const taken = new Set((data ?? []).filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function saveNewsArticle(
  id: string | null,
  values: NewsArticleValues,
): Promise<SaveResult> {
  const actor = await requirePermission("manage-news");
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();

  // category must exist
  const { data: cat } = await admin
    .from("news_categories")
    .select("id")
    .eq("id", parsed.data.categoryId)
    .maybeSingle();
  if (!cat) return { error: "Pick a valid category.", id: null };

  if (id) {
    // Editing: lock the slug once published.
    const { data: existing, error: readErr } = await admin
      .from("news_articles")
      .select("status, slug")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { error: "Could not save the article.", id: null };
    if (!existing) return { error: "Article not found.", id: null };
    const slug =
      existing.status === "published"
        ? existing.slug
        : await uniqueSlug(admin, slugify(parsed.data.slug) || slugify(parsed.data.title), id);
    const { error } = await admin
      .from("news_articles")
      .update({
        title: parsed.data.title,
        slug,
        category_id: parsed.data.categoryId,
        excerpt: parsed.data.excerpt,
        body: parsed.data.body,
      })
      .eq("id", id);
    if (error) return { error: "Could not save the article.", id: null };
    await recordActivity(actor, "updated news article", "news article", id, parsed.data.title);
    revalidate();
    return { error: null, id };
  }

  const slug = await uniqueSlug(admin, slugify(parsed.data.slug) || slugify(parsed.data.title), null);
  const { data: inserted, error } = await admin
    .from("news_articles")
    .insert({
      title: parsed.data.title,
      slug,
      category_id: parsed.data.categoryId,
      excerpt: parsed.data.excerpt,
      body: parsed.data.body,
      author_id: actor.id,
      author_name: actor.name,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: "Could not create the article.", id: null };
  await recordActivity(actor, "created news article", "news article", inserted.id, parsed.data.title);
  revalidate();
  return { error: null, id: inserted.id };
}

async function transition(
  id: string,
  from: string[],
  patch: Record<string, unknown>,
  verb: string,
): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("id, title")
    .maybeSingle();
  if (error) return { error: "Could not update the article." };
  if (!data) return { error: "This article is no longer in a state that allows that action." };
  await recordActivity(actor, verb, "news article", id, data.title);
  revalidate();
  return { error: null };
}

export async function submitNewsForReview(id: string): Promise<ActionResult> {
  return transition(id, ["draft"], { status: "in-review" }, "submitted news article for review");
}
export async function returnNewsToDraft(id: string): Promise<ActionResult> {
  return transition(id, ["in-review"], { status: "draft" }, "returned news article to draft");
}
export async function archiveNewsArticle(id: string): Promise<ActionResult> {
  return transition(id, ["draft", "in-review", "published"], { status: "archived" }, "archived news article");
}

/** Publish; set published_at only on first publish. */
export async function publishNewsArticle(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("news_articles")
    .select("published_at, title, excerpt")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: "Could not publish the article." };
  if (!row) return { error: "Article not found." };
  if (!row.excerpt?.trim()) return { error: "Add an excerpt before publishing." };
  const patch: Record<string, unknown> = { status: "published" };
  if (!row.published_at) patch.published_at = new Date().toISOString();
  const { data, error } = await admin
    .from("news_articles")
    .update(patch)
    .eq("id", id)
    .in("status", ["draft", "in-review", "archived"])
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not publish the article." };
  if (!data) return { error: "This article is already published." };
  await recordActivity(actor, "published news article", "news article", id, row.title);
  revalidate();
  return { error: null };
}
```

> **Implementer note:** confirm `SessionUser` (returned by `requirePermission`) exposes `.id` and `.name`. If the field is `fullName` or similar, use the actual property; `recordActivity`'s existing calls in `assistance-categories.ts` pass `actor` — inspect `src/lib/auth.ts` for the exact shape and match it.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/queries/news.ts src/features/admin/actions/news.ts
git commit -m "feat(admin): news article queries and workflow actions"
```

---

## Task 10: Photo upload actions (news gallery + single image)

**Files:**
- Create: `src/features/admin/actions/news-photos.ts`
- Create: `src/features/admin/actions/media.ts`

**Interfaces:**
- Consumes: `requirePermission`, `createSupabaseAdminClient`, `PUBLIC_MEDIA_BUCKET`, `newsPhotoPath`, `extForType`, `ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_BYTES`, `photoUrl`, `recordActivity`, `NewsPhoto`.
- Produces (`news-photos.ts`):
  - `uploadNewsPhotos(articleId: string, formData: FormData): Promise<{ error: string | null; photos: NewsPhoto[] }>`
  - `reorderNewsPhotos(articleId: string, orderedIds: string[]): Promise<ActionResult>`
  - `removeNewsPhoto(photoId: string): Promise<ActionResult>`
- Produces (`media.ts`) — the single-image path used by announcements and events:
  - `uploadSingleImage(folder: "announcements" | "events", formData: FormData): Promise<{ error: string | null; src: string | null; url: string | null }>` — validates and uploads one file, returning both the **raw storage path** (to persist in `image_src`/`cover_src`) and the **resolved URL** (for immediate preview). It does not write to any table; the owning form persists `src` via `saveAnnouncement`/`saveEvent`.
  - `removeStoredImage(src: string): Promise<ActionResult>` — deletes the object when `src` is an owned storage path; a no-op for a remote seed URL.

**Context:** Permission `"manage-news"`. Enforce the **cap of 3** server-side (count existing + incoming). Reject files over `MAX_IMAGE_BYTES` or outside `ALLOWED_IMAGE_TYPES`. New photos get `sort_order` after the current max. `removeNewsPhoto` deletes the storage object (only if `src` is a `public-media` path, not a seed URL) then the row. Return the full resolved photo list from `uploadNewsPhotos` so the client refreshes.

- [ ] **Step 1: Write the actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { NewsPhoto } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  extForType,
  newsPhotoPath,
  photoUrl,
} from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}

const MAX_PHOTOS = 3;

function revalidate() {
  revalidatePath("/admin/news");
  revalidatePath("/announcements");
}

async function currentPhotos(admin: ReturnType<typeof createSupabaseAdminClient>, articleId: string) {
  const { data } = await admin
    .from("news_photos")
    .select("id, src, alt, sort_order")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function uploadNewsPhotos(
  articleId: string,
  formData: FormData,
): Promise<{ error: string | null; photos: NewsPhoto[] }> {
  const actor = await requirePermission("manage-news");
  const admin = createSupabaseAdminClient();

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose at least one photo.", photos: [] };

  const existing = await currentPhotos(admin, articleId);
  if (existing.length + files.length > MAX_PHOTOS) {
    return { error: `A post can have at most ${MAX_PHOTOS} photos.`, photos: [] };
  }
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { error: "Photos must be JPG, PNG, or WebP.", photos: [] };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: "Each photo must be 2 MB or smaller.", photos: [] };
    }
  }

  let sortOrder = existing.reduce((max, p) => Math.max(max, p.sort_order), -1);
  for (const file of files) {
    const path = newsPhotoPath(articleId, extForType(file.type));
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(PUBLIC_MEDIA_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return { error: "Upload failed. Try again.", photos: [] };
    sortOrder += 1;
    const { error: insErr } = await admin
      .from("news_photos")
      .insert({ article_id: articleId, src: path, alt: "", sort_order: sortOrder });
    if (insErr) return { error: "Upload failed. Try again.", photos: [] };
  }

  await recordActivity(actor, "uploaded news photos", "news article", articleId);
  revalidate();
  const refreshed = await currentPhotos(admin, articleId);
  return { error: null, photos: refreshed.map((p) => ({ id: p.id, src: photoUrl(p.src), alt: p.alt })) };
}

export async function reorderNewsPhotos(
  articleId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  const admin = createSupabaseAdminClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from("news_photos")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("article_id", articleId);
    if (error) return { error: "Could not reorder photos." };
  }
  await recordActivity(actor, "reordered news photos", "news article", articleId);
  revalidate();
  return { error: null };
}

export async function removeNewsPhoto(photoId: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  const admin = createSupabaseAdminClient();
  const { data: photo, error: readErr } = await admin
    .from("news_photos")
    .select("id, src, article_id")
    .eq("id", photoId)
    .maybeSingle();
  if (readErr) return { error: "Could not remove the photo." };
  if (!photo) return { error: null }; // already gone
  // Only delete an object we own (uploaded path), never a seed URL.
  if (!/^https?:\/\//i.test(photo.src)) {
    await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove([photo.src]);
  }
  const { error } = await admin.from("news_photos").delete().eq("id", photoId);
  if (error) return { error: "Could not remove the photo." };
  await recordActivity(actor, "removed news photo", "news article", photo.article_id);
  revalidate();
  return { error: null };
}
```

- [ ] **Step 2: Write `src/features/admin/actions/media.ts`**

```ts
"use server";

import { requirePermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  extForType,
  photoUrl,
} from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}
export interface UploadResult {
  error: string | null;
  /** Raw storage path to persist in image_src / cover_src. */
  src: string | null;
  /** Resolved public URL, for immediate preview. */
  url: string | null;
}

/**
 * Upload one image for a single-slot field (announcement image, event cover).
 * Persisting the returned `src` is the caller's job — this keeps the action
 * reusable across tables without a discriminator.
 */
export async function uploadSingleImage(
  folder: "announcements" | "events",
  formData: FormData,
): Promise<UploadResult> {
  await requirePermission("manage-news");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image.", src: null, url: null };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { error: "Images must be JPG, PNG, or WebP.", src: null, url: null };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "The image must be 2 MB or smaller.", src: null, url: null };
  }

  const path = `${folder}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(PUBLIC_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", src: null, url: null };

  return { error: null, src: path, url: photoUrl(path) };
}

/** Delete an owned storage object. A remote seed URL is left alone. */
export async function removeStoredImage(src: string): Promise<ActionResult> {
  await requirePermission("manage-news");
  if (/^https?:\/\//i.test(src)) return { error: null };
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove([src]);
  if (error) return { error: "Could not remove the image." };
  return { error: null };
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean. (Confirm `Buffer` is available — Server Actions run on the Node runtime by default in this repo; no `edge` runtime export exists on these routes.)

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/actions/news-photos.ts src/features/admin/actions/media.ts
git commit -m "feat(admin): photo upload actions (gallery cap-3 + single image) with 2MB guards"
```

---

## Task 11: Admin news page — News/Announcements tabs, editors, uploader, categories panel

This is the largest task; it wires Tasks 8–10 into UI. Split into the uploader (client), the two forms, the manager, and the page.

**Files:**
- Create: `src/features/admin/components/news-photo-uploader.tsx`
- Create: `src/features/admin/components/single-image-uploader.tsx`
- Create: `src/features/admin/components/announcement-form.tsx`
- Modify: `src/features/admin/components/news-form.tsx`
- Modify: `src/features/admin/components/news-manager.tsx`
- Modify: `src/app/admin/(portal)/news/page.tsx`
- Modify: `src/features/admin/index.ts`, `src/features/admin/data.ts` (nav permission)

**Interfaces:**
- Consumes: everything from Tasks 8–10; `getNewsArticleForEdit`; `listAnnouncements`/announcement actions (Task 12 — **dependency**, see note); `Drawer`, `Toast`, `Field`/`Input`/`Select`/`Textarea`/`Checkbox`, `StatusChip`, `AdminPagination`, `ToggleSwitch`.
- Produces: the fully DB-backed `/admin/news` with News and Announcements tabs + the SuperAdmin `NewsCategoriesPanel`.

> **Ordering note:** the Announcements tab needs Task 12's `announcement-form.tsx` + actions/queries. Reorder if executing strictly: do **Task 12 before Task 11's Announcements tab**. The News tab and page shell depend only on Tasks 8–10. A reviewer may accept Task 11 in two commits (News tab, then Announcements tab after Task 12).

- [ ] **Step 1: `news-photo-uploader.tsx` (client).** A client component taking `articleId: string` and initial `photos: NewsPhoto[]`. Renders a drag-drop dropzone (`onDragOver`/`onDrop` + a hidden `<input type="file" accept="image/*" multiple>`), thumbnail previews for existing photos with **Remove** and **move up/down** buttons, client-side validation (type in `ALLOWED_IMAGE_TYPES`, size ≤ `MAX_IMAGE_BYTES`, count ≤ 3) with a human message, and calls `uploadNewsPhotos`/`reorderNewsPhotos`/`removeNewsPhoto` via `useTransition`. On upload success it replaces local state with the returned `photos`. Full code:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, Trash2, Upload } from "lucide-react";
import type { NewsPhoto } from "@/types";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/storage";
import {
  removeNewsPhoto,
  reorderNewsPhotos,
  uploadNewsPhotos,
} from "@/features/admin/actions/news-photos";

const MAX = 3;

export function NewsPhotoUploader({
  articleId,
  photos: initial,
}: {
  articleId: string;
  photos: NewsPhoto[];
}) {
  const [photos, setPhotos] = useState<NewsPhoto[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(files: File[]): string | null {
    if (photos.length + files.length > MAX) return `A post can have at most ${MAX} photos.`;
    for (const f of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(f.type as (typeof ALLOWED_IMAGE_TYPES)[number]))
        return "Photos must be JPG, PNG, or WebP.";
      if (f.size > MAX_IMAGE_BYTES) return "Each photo must be 2 MB or smaller.";
    }
    return null;
  }

  function submit(files: File[]) {
    setError(null);
    const msg = validate(files);
    if (msg) { setError(msg); return; }
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    start(async () => {
      const res = await uploadNewsPhotos(articleId, fd);
      if (res.error) setError(res.error);
      else setPhotos(res.photos);
    });
  }

  function move(index: number, delta: number) {
    const next = [...photos];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPhotos(next);
    start(async () => { await reorderNewsPhotos(articleId, next.map((p) => p.id)); });
  }

  function remove(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    start(async () => { await removeNewsPhoto(id); });
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); submit(Array.from(e.dataTransfer.files)); }}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 hover:border-brand-400"
      >
        <Upload className="h-6 w-6" aria-hidden="true" />
        <span>Drag photos here or click to choose (JPG/PNG/WebP, ≤ 2 MB, up to {MAX}).</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => { submit(Array.from(e.target.files ?? [])); e.target.value = ""; }}
        />
      </div>

      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3">
          {photos.map((p, i) => (
            <li key={p.id} className="relative overflow-hidden rounded-2xl bg-ink-100">
              <div className="relative aspect-square">
                <Image src={p.src} alt={p.alt} fill sizes="120px" className="object-cover" />
              </div>
              <div className="flex items-center justify-between gap-1 p-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || pending} aria-label={`Move photo ${i + 1} up`} className="rounded p-1 text-ink-600 hover:bg-white disabled:opacity-30">
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1 || pending} aria-label={`Move photo ${i + 1} down`} className="rounded p-1 text-ink-600 hover:bg-white disabled:opacity-30">
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => remove(p.id)} disabled={pending} aria-label={`Remove photo ${i + 1}`} className="rounded p-1 text-danger hover:bg-white disabled:opacity-30">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `news-form.tsx`** to save via `saveNewsArticle` and expose workflow buttons. Behaviour: the form takes `record: { id: string; values: NewsArticleValues; status: ContentStatus; photos: NewsPhoto[] } | null` and `categories: NewsCategoryRow[]`. On submit it calls `saveNewsArticle(record?.id ?? null, values)`; on a successful create it stores the returned `id` in local state and **then reveals** the `NewsPhotoUploader` (decision 9: photos require an existing article). The category `<Select>` lists `categories` (active only for new posts; when editing keep the current category even if retired). Status controls (shown by current status): draft → **Submit for review** / **Publish**; in-review → **Publish** / **Return to draft**; published → **Archive**; archived → **Publish**. Each calls the matching action and then `onSaved()`. Drop the `scheduled`/`scheduledFor` UI entirely. Slug field: an editable `Input` (disabled when `status === "published"`), auto-filled from the title while empty.

- [ ] **Step 2b: `single-image-uploader.tsx` (client)** — the one-slot counterpart to the gallery uploader, shared by announcements and events. Props: `folder: "announcements" | "events"`, `src: string | null` (resolved URL for preview), `alt: string`, and `onChange(next: { src: string | null; alt: string })` so the owning form persists `src` on save. Behaviour: a dropzone identical in styling to `NewsPhotoUploader` but accepting **one** file; client-side type/size validation with the same messages; calls `uploadSingleImage(folder, formData)` and on success calls `onChange({ src: res.src, alt })` while previewing `res.url`; a **Remove** button calls `removeStoredImage(currentSrc)` (only when the current value is an owned path) and `onChange({ src: null, alt: "" })`; an alt-text `Input` bound to `alt`.

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Trash2, Upload } from "lucide-react";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/storage";
import { Field, Input } from "@/components/ui/form";
import { removeStoredImage, uploadSingleImage } from "@/features/admin/actions/media";

export function SingleImageUploader({
  folder,
  src,
  alt,
  previewUrl,
  onChange,
}: {
  folder: "announcements" | "events";
  src: string | null;
  alt: string;
  previewUrl: string | null;
  onChange: (next: { src: string | null; alt: string; previewUrl: string | null }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      setError("Images must be JPG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("The image must be 2 MB or smaller.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const res = await uploadSingleImage(folder, fd);
      if (res.error) setError(res.error);
      else onChange({ src: res.src, alt, previewUrl: res.url });
    });
  }

  function clear() {
    const current = src;
    onChange({ src: null, alt: "", previewUrl: null });
    if (current) start(async () => { await removeStoredImage(current); });
  }

  return (
    <div className="space-y-3">
      {previewUrl ? (
        <div className="flex items-start gap-3">
          <div className="relative h-24 w-32 overflow-hidden rounded-2xl bg-ink-100">
            <Image src={previewUrl} alt={alt} fill sizes="128px" className="object-cover" />
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            aria-label="Remove image"
            className="rounded p-2 text-danger hover:bg-ink-100 disabled:opacity-30"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); submit(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 hover:border-brand-400"
        >
          <Upload className="h-6 w-6" aria-hidden="true" />
          <span>Drag an image here or click to choose (JPG/PNG/WebP, ≤ 2 MB).</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => { submit(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>
      )}
      {error ? <p role="alert" className="text-sm font-medium text-danger">{error}</p> : null}
      {previewUrl ? (
        <Field label="Image description (alt text)" htmlFor="single-image-alt">
          <Input
            id="single-image-alt"
            value={alt}
            onChange={(e) => onChange({ src, alt: e.target.value, previewUrl })}
          />
        </Field>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: `announcement-form.tsx`** — a sibling drawer editor for announcements: `Field`s for title, date (`type="date"`), excerpt, an `urgent` `Checkbox`, a `<SingleImageUploader folder="announcements" …/>` bound to `imageSrc`/`imageAlt`, and the same status controls calling Task 12's announcement actions. The uploaded `src` is persisted by `saveAnnouncement` when the form submits.

- [ ] **Step 4: Rewrite `news-manager.tsx`** to be DB-backed and tabbed. It takes `articles: AdminNewsArticleRow[]`, `announcements: AdminAnnouncementRow[]`, `categories: NewsCategoryRow[]`. A tab switch (`News` / `Announcements`) selects which list renders; keep the existing card grid, search, and `AdminPagination` (client-side, `PAGE_SIZE = 8`, per 2C decision 8 — low volume). The status filter gains `In Review` and `Archived` options. The drawer hosts `NewsForm` or `AnnouncementForm` by active tab. Replace the fake-save toast with the real action results (error → toast the message; success → close drawer, toast "Saved"). Cards read `record.status`, `record.coverSrc`, `record.category`, etc. from the new row types.

- [ ] **Step 5: Rewrite the page** `src/app/admin/(portal)/news/page.tsx` as an async Server Component:

```tsx
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { getSessionUser } from "@/lib/auth"; // confirm the exact export used to read isSuperAdmin
import { NewsManager, NewsCategoriesPanel } from "@/features/admin";
import { listNewsArticles } from "@/features/admin/queries/news";
import { listAnnouncements } from "@/features/admin/queries/announcements";
import { listNewsCategories } from "@/features/admin/queries/news-categories";

export const metadata: Metadata = { title: "News & Announcements" };

export default async function AdminNewsPage() {
  const user = await requirePermission("manage-news");
  const [articles, announcements, categories] = await Promise.all([
    listNewsArticles(),
    listAnnouncements(),
    listNewsCategories(),
  ]);
  return (
    <>
      <NewsManager articles={articles} announcements={announcements} categories={categories} />
      {user.isSuperAdmin ? <NewsCategoriesPanel categories={categories} /> : null}
    </>
  );
}
```

> **Implementer note:** match `requirePermission`'s return shape for the SuperAdmin check — inspect how `/admin/services/page.tsx` decides SuperAdmin (it renders the assistance categories panel the same way). Reuse that exact guard rather than importing a second helper.

- [ ] **Step 6: Gate the nav** in `src/features/admin/data.ts`: add `permission: "manage-news"` to both the `"News & Announcements"` and `"Event Calendar"` `ADMIN_NAV_ITEMS` entries. Export `NewsCategoriesPanel` and `AnnouncementForm` (and any new components) from `src/features/admin/index.ts`.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean. (Full runtime drive is Task 18; a quick smoke: `/admin/news` renders both tabs and the categories panel for a SuperAdmin.)

- [ ] **Step 8: Commit**

```bash
git add src/features/admin/components/news-photo-uploader.tsx src/features/admin/components/single-image-uploader.tsx src/features/admin/components/news-form.tsx src/features/admin/components/announcement-form.tsx src/features/admin/components/news-manager.tsx "src/app/admin/(portal)/news/page.tsx" src/features/admin/index.ts src/features/admin/data.ts
git commit -m "feat(admin): DB-backed news/announcements manager with photo uploader and categories"
```

---

## Task 12: Announcements — admin queries & actions

**Files:**
- Create: `src/features/admin/queries/announcements.ts`
- Create: `src/features/admin/actions/announcements.ts`

**Interfaces:**
- Produces:
  - `listAnnouncements(): Promise<AdminAnnouncementRow[]>`
  - `getAnnouncementForEdit(id): Promise<{ values: AnnouncementValues; status: ContentStatus } | null>`
  - actions `saveAnnouncement(id, values)`, `submitAnnouncementForReview`, `publishAnnouncement`, `archiveAnnouncement`, `returnAnnouncementToDraft`.

**Context:** Mirror Task 9 minus slug/photos/category. Validation: title, date (ISO), excerpt required; `urgent` boolean; `imageSrc` optional (URL text). `published_at` set on first publish. Permission `"manage-news"`. Audit entity type `"announcement"`; revalidate `/admin/news`, `/announcements`, `/`.

- [ ] **Step 1: Write the query** (mirror `queries/news.ts` `listNewsArticles`, selecting `id, title, date, excerpt, urgent, status, image_src, image_alt, updated_at`, mapping to `AdminAnnouncementRow` with `updatedLabel = formatDate(toManilaDate(updated_at))`, `imageSrc = image_src ? photoUrl(image_src) : null`).
- [ ] **Step 2: Write the actions** (mirror `actions/news.ts`: a `saveAnnouncement` upsert + a shared `transition` helper + the four transition actions + a `publishAnnouncement` that checks `excerpt` and sets `published_at` on first publish). Zod schema: `{ title: min 3, date: min 1, excerpt: min 1, urgent: boolean, imageSrc: string nullable, imageAlt: string }`.
- [ ] **Step 3: Verify** `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Commit**

```bash
git add src/features/admin/queries/announcements.ts src/features/admin/actions/announcements.ts
git commit -m "feat(admin): announcement queries and workflow actions"
```

---

## Task 13: Events — admin queries, actions, form, manager, page

**Files:**
- Create: `src/features/admin/queries/events.ts`, `src/features/admin/actions/events.ts`
- Modify: `src/features/admin/components/event-form.tsx`, `src/features/admin/components/events-manager.tsx`
- Modify: `src/app/admin/(portal)/events/page.tsx`

**Interfaces:**
- Produces: `listEvents(): Promise<AdminEventRow[]>`, `getEventForEdit(id)`, actions `saveEvent(id, values)` + the four transitions; DB-backed `EventsManager`, `EventForm`, and events page.

**Context:** Mirror Tasks 9/11 for events. `EventValues` already defined (Task 2). The `event-form.tsx` keeps its current fields (title, category via `EVENT_CATEGORY_LABELS`, date, start/end time, venue, capacity, description) and adds `<SingleImageUploader folder="events" …/>` bound to `coverSrc`/`coverAlt` (the same component the announcement form uses, from Task 11). `EventsManager` mirrors the tabbed news manager's DB list + status filter/transitions (single list, no tabs). The events page gates `manage-news` and passes `listEvents()`.

- [ ] **Step 1: Write `queries/events.ts`** (select all event columns, map to `AdminEventRow`; `coverSrc = cover_src ? photoUrl(cover_src) : null`).
- [ ] **Step 2: Write `actions/events.ts`** (mirror `actions/news.ts`: `saveEvent` upsert with zod `{ title min 3, category enum, eventDate min 1, startTime min 1, venue min 1, endTime string, capacity number nullable, description string, coverSrc nullable, coverAlt string }`; the four transitions + `publishEvent` requiring title/date/start/venue and setting `published_at` on first publish). Permission `"manage-news"`; entity `"event"`; revalidate `/admin/events`, `/`.
- [ ] **Step 3: Rewrite `event-form.tsx`** to save via `saveEvent` + status controls (mirror `news-form.tsx`), keeping the existing fields; add the cover URL field.
- [ ] **Step 4: Rewrite `events-manager.tsx`** to take `events: AdminEventRow[]`, real actions, status filter (incl. In Review/Archived), client pagination.
- [ ] **Step 5: Rewrite `events/page.tsx`** as async server component gating `manage-news` and passing `listEvents()`.
- [ ] **Step 6: Verify** `npm run typecheck && npm run lint && npm run build` → clean.
- [ ] **Step 7: Commit**

```bash
git add src/features/admin/queries/events.ts src/features/admin/actions/events.ts src/features/admin/components/event-form.tsx src/features/admin/components/events-manager.tsx "src/app/admin/(portal)/events/page.tsx"
git commit -m "feat(admin): DB-backed events manager with workflow"
```

---

## Task 14: Remove mock arrays & dead admin data

**Files:**
- Modify/Delete: `src/features/announcements/data.ts`, `src/features/home/data.ts`, `src/features/admin/data.ts`

**Interfaces:** none new — this is the cleanup sweep once every consumer reads the DB.

**Context:** Confirm (via `Grep`) that nothing imports each symbol before deleting it. Remove: `FEATURED_ARTICLE`, `NEWS_ARTICLES`, `SIDEBAR_ANNOUNCEMENTS`, `SIDEBAR_HOTLINES` (announcements/data.ts — likely delete the whole file); `LATEST_ANNOUNCEMENTS`, `UPCOMING_EVENTS` (home/data.ts, keep `HERO_SLIDES`/`QUICK_SERVICES`/`GLANCE_STATS`/`INVOLVEMENT_ITEMS`/`CTA_IMAGE`); `ADMIN_NEWS`, `ADMIN_EVENTS`, `EVENT_META` (admin/data.ts). Keep `EVENT_CATEGORY_LABELS` (the event form still uses it). Remove now-unused type exports (`AdminNewsRecord`, `AdminEventRecord`, `NewsPostFormValues`, `EventFormValues`) from `types/index.ts` only if no file imports them.

- [ ] **Step 1: Grep each symbol**

Run: `grep -rn "FEATURED_ARTICLE\|NEWS_ARTICLES\|SIDEBAR_ANNOUNCEMENTS\|SIDEBAR_HOTLINES\|LATEST_ANNOUNCEMENTS\|UPCOMING_EVENTS\|ADMIN_NEWS\|ADMIN_EVENTS\|EVENT_META" src/` (use the Grep tool)
Expected: only definitions remain (no importers). Where an importer remains, that consumer was missed in an earlier task — fix it there.

- [ ] **Step 2: Delete the dead symbols/files** and fix any resulting import errors.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/announcements/data.ts src/features/home/data.ts src/features/admin/data.ts src/types/index.ts src/features/announcements/index.ts
git commit -m "chore(news): remove mock content arrays now that all reads hit the DB"
```

---

## Task 15: BACKEND_HANDOFF.md

**Files:**
- Modify: `docs/BACKEND_HANDOFF.md`

**Context:** Follow the pattern of the 2B/2C changelog entries. Do not retro-edit dated spec/plan files.

- [ ] **Step 1: Update the doc** — add a changelog entry dated 2026-07-18 for Plan 3; add the new routes (`/announcements/[slug]`) and admin gating (`manage-news`) to the route table; add the `news_articles`/`news_photos`/`announcements`/`events`/`news_categories` entities and the `public-media` bucket; note the storage-URL migration of seed `lh3` images as remaining work; strike the "news is mock" caveats; record that single announcement/event images use a URL field pending an upload widget.
- [ ] **Step 2: Verify** `npm run lint` (markdown unaffected) and re-read the diff for accuracy.
- [ ] **Step 3: Commit**

```bash
git add docs/BACKEND_HANDOFF.md
git commit -m "docs: record news/announcements/events DB integration (Plan 3)"
```

---

## Task 16: Runtime verification sweep

**Files:** none committed (scratchpad scripts only).

**Context:** **Blocked on Justine applying `0007` by hand.** Mirror the 2C sweep: playwright-core against system Chrome, temp `@brgysf-test.ph` accounts (one SuperAdmin, one `manage-news` staffer, one no-permission staffer), created and cleaned up via the service-role client. Never touch Justine's or Sharah Mae's accounts. Reset nothing that belongs to seed content; delete only sweep-created rows and uploaded storage objects. Check the audit log before assuming a row is yours.

- [ ] **Step 1: Confirm the migration is applied** — query `information_schema.tables` for `news_articles` via a service-role script; if absent, stop and report that Justine must apply `0007`.
- [ ] **Step 2: Security posture** — with the **anon** key, confirm `select` on `news_articles`/`announcements`/`events` returns zero rows / permission denied, and that a draft article is invisible on `/announcements` and its slug 404s.
- [ ] **Step 3: News lifecycle** — as the `manage-news` staffer: create a draft, add 1/2/3 photos (verify 2 MB rejection and a 4th-photo rejection, both server messages), reorder, remove one; submit for review; publish; confirm the article, its gallery layout, lightbox, cover, category badge, byline, and "NEW" badge on `/announcements` and `/announcements/<slug>`; archive and confirm it leaves the public feed.
- [ ] **Step 4: Announcements & events** — publish an urgent and a non-urgent announcement (verify urgent badge + sidebar/home placement); publish events with past and future dates (verify past auto-drop and soonest-first order on the home board).
- [ ] **Step 5: Categories & permissions** — as SuperAdmin, add/rename/retire/reorder a news category; confirm a retired category is hidden from the author dropdown but still labels its existing articles; as the no-permission staffer, confirm neither `/admin/news` nor `/admin/events` is reachable (bounced) and no nav links appear; as a non-SuperAdmin `manage-news` staffer, confirm the categories panel is absent.
- [ ] **Step 6: Hotline** — confirm `(077) 600 1082` in the footer, `/contact`, and the news sidebar; no `(02)` number anywhere.
- [ ] **Step 7: Teardown** — delete all sweep rows (articles cascade their photos), remove uploaded storage objects, delete the temp accounts + their audit rows; verify seed content (3 articles, 3 announcements, 4 events, 7 categories) and `blotter-complaints` state are untouched.
- [ ] **Step 8: Report** the pass/fail matrix and the clean teardown to the human.

---

## Self-review (completed by plan author)

**Spec coverage:** §4 storage → T1/T2/T10; data model → T1/T2; categories → T8; workflow → T9/T12/T13; public board → T7; feed+pagination → T6; slug+gallery+lightbox → T4/T5; admin tabs+uploader → T11; announcements → T12; events → T13; permissions/security → T1/T9/T11; seed → T1; hotline → T7; next.config → T2; verification → T16. All spec §11 locked decisions map to tasks. ✔

**Placeholder scan:** No "TBD"/"add error handling"-style gaps. One intentional deviation is stated up front (decision 10: thumbnail reordering uses accessible up/down controls rather than HTML5 drag, avoiding a drag-and-drop dependency; files are still added by drag-drop). Announcements and events use the same real Storage upload as news via `SingleImageUploader` — no URL-paste fallback. ✔

**Type consistency:** `NewsArticleValues`/`AnnouncementValues`/`EventValues`, `AdminNewsArticleRow`/`AdminAnnouncementRow`/`AdminEventRow`, `NewsCategoryRow`, `NewsPhoto`, `ContentStatus`, `photoUrl`/`newsPhotoPath`/`extForType` are defined in T2 and used consistently downstream. Action names match between producer and consumer tasks. ✔
