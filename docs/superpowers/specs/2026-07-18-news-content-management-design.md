# News, Announcements & Events — DB Integration Design (Plan 3)

**Status:** Approved design (2026-07-18). Feeds `writing-plans`.
**Spec source:** `docs/superpowers/specs/2026-07-15-backend-integration-design.md` §5.
**Backend plan sequence:** 1 (auth) → 2A (services) → 2B (applications) → 2C (appointments/complaints/assistance) → **3 (this)** → 2D (Resend email, blocked on account) → officials → transparency → media/storage → hardening → turnover.

---

## 1. Goal

Make the three §5 content types — **news articles, short announcements, and community events** — fully DB-backed, admin-authored, and photo-capable, replacing every mock array behind the home board and the `/announcements` hub. Introduce **Supabase Storage** (the first plan to use it) as the shared photo/file foundation later plans reuse.

## 2. Architecture

- **Three Postgres tables** (`news_articles`, `announcements`, `events`) plus **`news_categories`** (SuperAdmin-managed reference data) and **`news_photos`** (the 0–3 gallery for articles). All in migration `0007_news_content.sql`, applied by Justine by hand.
- **Supabase Storage**: one public bucket `public-media`, prefix `news/<articleId>/<uuid>.<ext>`. Public read; writes only through the service-role admin client after a `manage-news` permission check.
- **Security posture = same as the ticket tables**: every content table has **RLS enabled with zero policies**. Every read (public and admin) and every write goes through the **service-role admin client** after an explicit code-level check. Public Server Component queries filter `status = 'published'` explicitly — no anon policy can leak drafts because there are no anon policies.
- **Server Components + Server Actions** (no REST). Public pages read via a server query module; admin mutations are `"use server"` actions, each opening with `requirePermission("manage-news")` (or `requireSuperAdmin()` for category management) as the literal first statement, mirroring 2B/2C.
- **Rendering/caching**: public news pages read the DB per request and are kept fresh by `revalidatePath` on every publish/archive — the exact pattern the DB-backed services pages established in 2A. Follow that pattern; do not introduce a new caching strategy.

## 3. Tech Stack

Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 (`@theme` tokens) · Supabase Postgres + **Storage** · `@supabase/ssr` · zod v4 · `next/image`. No new runtime dependencies (no `sharp`) — galleries use `fill` layouts, so we store path + alt + order only, never dimensions.

## Global Constraints

- **Design tokens only.** `brand-100`…`brand-800` (no `brand-50`/`brand-900`), `ink-*`, `danger*`. No green/success token. No blue tokens (pre-2026-07 design). Space Grotesk headings, Inter body.
- **Identity:** "Barangay San Fernando, San Nicolas, Ilocos Norte." San Nicolas is a **municipality** ("Municipal", never "City"). Area code **(077)**. Any "Sampaguita" in `src/` is a regression.
- **Real hotline number:** the barangay's real line is **`0776001082`**, formatted **`(077) 600 1082`** to match the existing `EMERGENCY_HOTLINES` style. It replaces the placeholder `(077) 123 4567` in both `SITE.phone` and the "Barangay Hotline" entry.
- **RSC icon boundary:** `icon: LucideIcon` is a React component; never pass it into a `"use client"` component. Icons are chosen/rendered on the server; only serializable data crosses the boundary.
- **Timezone:** Postgres `timestamptz` is UTC; barangay is UTC+8 (Asia/Manila). `timestamptz` → `toManilaDate()`; bare `date` columns (event_date, announcement date) pass straight through / via `formatDate()` (never `toManilaDate` — it shifts a day).
- **No test framework.** Verification = `npm run typecheck` + `npm run lint` + the runtime sweep recipe (playwright-core vs. system Chrome) in `.claude/skills/verify/SKILL.md`.
- **Migrations are applied by Justine by hand.** Agents never run a Supabase CLI or apply SQL. The runtime sweep is gated on her applying `0007` first.
- **Path alias** `@/*` → `src/*`. Content lives in typed modules, never hardcoded in components.

---

## 4. Data model (migration `0007_news_content.sql`)

```sql
create type content_status as enum ('draft', 'in-review', 'published', 'archived');
create type event_category as enum
  ('town-hall', 'health-drive', 'festival', 'youth', 'environment', 'community');
```

### 4.1 `news_categories` (SuperAdmin-managed — mirrors `assistance_categories`)
| column | type | notes |
|---|---|---|
| `id` | text PK | slug, e.g. `governance` |
| `label` | text NOT NULL | e.g. "Governance" |
| `sort_order` | int NOT NULL | display order |
| `is_active` | boolean NOT NULL default true | retired categories hidden from the author dropdown but keep labeling existing articles |
| `created_at` | timestamptz default now() | |

Seed from the existing author dropdown: Governance, Environment, Health & Wellness, Public Health, Events, Advisory, Infrastructure (dedupe/curate to a sensible set; **no green token** concerns here — text only).

### 4.2 `news_articles`
| column | type | notes |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `slug` | text UNIQUE NOT NULL | auto from title, editable before first publish, permanently unique after |
| `title` | text NOT NULL | |
| `category_id` | text NOT NULL REFERENCES news_categories(id) | ON DELETE RESTRICT (categories are retired, not deleted) |
| `excerpt` | text NOT NULL | required before leaving draft |
| `body` | text NOT NULL default '' | plain multi-paragraph text; slug page renders paragraphs split on blank lines |
| `author_id` | uuid REFERENCES profiles(id) | the creating admin |
| `author_name` | text | denormalized byline snapshot (survives profile changes), like `audit_log.actor_name` |
| `status` | content_status NOT NULL default 'draft' | |
| `published_at` | timestamptz | set on first transition to published; drives newest-first + the auto "NEW" badge (<7 days) |
| `created_at` / `updated_at` | timestamptz default now() | |

### 4.3 `news_photos`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `article_id` | uuid NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE | |
| `src` | text NOT NULL | storage object path **or** a full remote URL (seed rows keep the current `lh3` URLs; new uploads store the storage path) |
| `alt` | text NOT NULL default '' | |
| `sort_order` | int NOT NULL | 0–2; first photo = board cover + Open Graph |

**Hard cap of 3 photos per article** enforced in the Server Action (not a DB constraint). Public/admin URL resolution: a helper `photoUrl(src)` returns `src` when it starts with `http`, else the Supabase public URL for the object path.

### 4.4 `announcements`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text NOT NULL | |
| `date` | date NOT NULL | effective/display date; rendered as the calendar tile |
| `excerpt` | text NOT NULL | |
| `image_src` | text | single optional image (path or remote URL) |
| `image_alt` | text NOT NULL default '' | |
| `urgent` | boolean NOT NULL default false | drives the red "Urgent" badge + danger-tinted tile |
| `status` | content_status NOT NULL default 'draft' | |
| `published_at` | timestamptz | newest-first + "New" badge |
| `created_at` / `updated_at` | timestamptz default now() | |

No category, no gallery, no slug page — announcements are short notices.

### 4.5 `events`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text NOT NULL | |
| `category` | event_category NOT NULL default 'community' | |
| `event_date` | date NOT NULL | |
| `start_time` | text NOT NULL | e.g. "8:00 AM" |
| `end_time` | text | e.g. "3:00 PM"; public card composes "start - end" |
| `venue` | text NOT NULL | |
| `capacity` | int | optional (admin already models it) |
| `description` | text NOT NULL default '' | optional; admin-captured, not rendered publicly yet |
| `cover_src` | text | single optional cover image |
| `cover_alt` | text NOT NULL default '' | |
| `status` | content_status NOT NULL default 'draft' | |
| `published_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz default now() | |

All five tables: `alter table … enable row level security;` with **no policies**.

### 4.6 Storage (in the same migration)
Create the public bucket and a public-read policy on its objects; **no** anon/authenticated write policies (service-role bypasses RLS):
```sql
insert into storage.buckets (id, name, public) values ('public-media', 'public-media', true)
  on conflict (id) do nothing;
create policy "public read public-media" on storage.objects
  for select to public using (bucket_id = 'public-media');
```

## 5. Status workflow (all three types)

`draft → in-review → published → archived`. Transitions (Server Actions, each `revalidatePath`-ing home `/`, `/announcements`, and the article slug page):
- **Submit for review**: `draft → in-review`. Requires excerpt (articles/announcements) / required fields (events) present.
- **Publish**: `in-review → published` (also allow `draft → published` and `archived → published` for a re-publish). Sets `published_at` on first publish only.
- **Archive**: any → `archived` (pulled from public, record kept).
- **Return to draft**: `in-review → draft`.

Guards live inside each UPDATE's `WHERE` (`.eq("status", <expected>)`), and `.maybeSingle()` results check `error` first, then `!data` — the 2C convention.

**Scheduling is dropped.** The mock `scheduled` status + `scheduledFor` picker are replaced by the `in-review` stage; there is no future-dated auto-publish in this plan (a possible later enhancement).

## 6. Public rendering (zero visual change on day one)

- **Home board** (`CommunityPulseSection`): the Announcements column reads the latest published announcements (newest first); the Events column reads upcoming published events (`event_date >= today` Manila, soonest first, past auto-drop). Mock imports removed.
- **`/announcements` list** (`NewsFeed`): published articles newest-first; the newest published article renders as the featured hero, the rest as the grid. **"Load More" becomes real pagination** (page query param; page size = 1 featured + 6 grid). The manual `featured` flag is removed — featured = newest published.
- **`/announcements/[slug]`** (news only): full article — body paragraphs, the **count-based photo layout** (0 = neutral text card; 1 = full-width hero; 2 = side-by-side, stacked on mobile; 3 = one lead + two smaller) with a **shared lightbox** (arrows/swipe), category badge, author byline, date. This fixes today's dead `href="#"` "Read More"/"Details" links, which become `/announcements/<slug>`.
- **News sidebar** (`NewsSidebar`): the urgent-announcements widget reads published announcements from the DB. The hotlines widget stops using the divergent `SIDEBAR_HOTLINES` mock (with its wrong `(02)` numbers) and renders the canonical `EMERGENCY_HOTLINES` from `constants/site.ts`.

## 7. Admin (permission `manage-news`)

Gate both nav items — "News & Announcements" (`/admin/news`) and "Event Calendar" (`/admin/events`) — with `permission: "manage-news"` (they are currently ungated).

- **`/admin/news`** — two tabs: **News** and **Announcements** (consolidated under the one existing nav entry). Each tab is a card grid with search + status filter (now including In Review and Archived) + a drawer editor. Status transition controls in the drawer. Slug field on the News editor (auto-filled, editable before first publish).
  - **News editor** adds the **0–3 photo uploader**: drag-drop, thumbnail previews, drag reorder, per-photo remove. 2MB + type (`jpeg`/`png`/`webp`) enforced **client-side** with a human message and **re-checked server-side**; hard cap 3.
  - **Announcement editor**: title, date, excerpt, urgent toggle, single optional image, status.
- **`/admin/events`** — the events grid + drawer editor, single optional cover image, status workflow.
- **News Categories editor** (SuperAdmin-only, mirrors the assistance-categories panel at the bottom of `/admin/services`): add / rename / retire / reorder, each `revalidatePath`-ing the author-facing pages. Lives at the bottom of `/admin/news` (or a clearly SuperAdmin-gated panel there).
- Every mutation writes an `audit_log` entry (helper from `src/lib/audit.ts`), attributed to the acting admin, like the ticket flows.

### Photo upload mechanism
The uploader (client) previews via object URLs and validates size/type before submit. On save, files travel to a Server Action as `FormData`; the action re-validates size/type, uploads via `storage.from("public-media").upload(path, file)` with the service-role client, and inserts/updates `news_photos` rows. Reorder updates `sort_order`; remove deletes the row **and** the storage object. No image processing.

## 8. Seed / migration

Seed so the site looks identical on day one:
- `news_categories` from the curated category list.
- `news_articles` from `FEATURED_ARTICLE` + `NEWS_ARTICLES`, each with its current `lh3` image as a single `news_photos` row (`src` = the remote URL). Include at least one 0-photo, one 2-photo, and one 3-photo article so every gallery layout is demonstrable (spec §9).
- `announcements` from `LATEST_ANNOUNCEMENTS` (+ the `SIDEBAR_ANNOUNCEMENTS` items), preserving `urgent`.
- `events` from `UPCOMING_EVENTS` (+ `EVENT_META` categories/capacity), status published.
- All seed rows `status = 'published'` with a sensible `published_at`.

The mock arrays (`FEATURED_ARTICLE`, `NEWS_ARTICLES`, `SIDEBAR_ANNOUNCEMENTS`, `LATEST_ANNOUNCEMENTS`, `UPCOMING_EVENTS`, `SIDEBAR_HOTLINES`, `ADMIN_NEWS`, `ADMIN_EVENTS`) are removed once their consumers read the DB.

## 9. Hotline correction (content)

- `SITE.phone` → `"(077) 600 1082"`.
- `EMERGENCY_HOTLINES[0]` ("Barangay Hotline") number → `"(077) 600 1082"`.
- Delete `SIDEBAR_HOTLINES` from `announcements/data.ts`; the news sidebar renders `EMERGENCY_HOTLINES` instead.
- The other emergency entries (Tanod, Health Center, Fire, PNP) stay `(077)` placeholders pending real numbers — noted, not invented.

## 10. `next.config.ts` / env

Add the Supabase Storage host to `images.remotePatterns` (derive the hostname from `NEXT_PUBLIC_SUPABASE_URL`, i.e. `<ref>.supabase.co`, path `/storage/v1/object/public/**`). Keep the existing `lh3.googleusercontent.com` entry (seed rows still use it).

## 11. Locked decisions (judgment calls, approved)

1. **Photos:** news = 0–3 gallery + lightbox; announcements = one optional image; events = one optional cover. All via `public-media`.
2. **News categories:** SuperAdmin-managed list (assistance-categories pattern). Events keep their fixed `event_category` enum.
3. **Workflow:** full `draft → in-review → published → archived` on all three types. No scheduling.
4. **Announcements are a separate table from news articles**, surfaced under the one "News & Announcements" nav entry via **News / Announcements tabs**. Rationale: genuinely different shape and public presentation; one table would mean nullable category/gallery + a discriminator + conditional rendering everywhere.
5. **Slug detail pages for news only.** Announcements/events render fully on the board/sidebar; no `/[slug]` page.
6. **News body = plain multi-paragraph text**, not rich text.
7. **Public bucket** (guessable draft-photo URLs accepted; news isn't sensitive) over signed URLs.
8. **Seed keeps current hotlinked images**; `news_photos.src` accepts a full URL or a storage path via `photoUrl()`.
9. **Featured = newest published article** (manual `featured` flag removed).

## 12. Out of scope

Resend email (2D), officials slug pages (later plan), transparency PDFs (later plan), migrating the seed `lh3` images to owned storage (media/storage plan), Turnstile/rate-limit hardening, event registration/RSVP (capacity is stored, not transacted), future-dated scheduling, rich-text editing, real numbers for Tanod/Health/Fire/PNP hotlines.

## 13. Verification

`typecheck` + `lint` clean throughout. Runtime sweep (after Justine applies `0007`), against the live staging DB, using temp `@brgysf-test.ph` accounts cleaned up afterward:
- Create/edit/publish/archive an article with 0, 1, 2, and 3 photos; confirm each gallery layout + lightbox on `/announcements/<slug>`; confirm cover + "NEW" badge on the board.
- Photo 2MB + type rejection client- and server-side; hard cap 3; reorder; remove (row + storage object gone).
- Announcement urgent/non-urgent rendering in the sidebar + home board; event upcoming-sort and past-drop.
- SuperAdmin category add/rename/retire/reorder; retired category hidden from the author dropdown but still labeling its existing articles.
- `manage-news` gating: a staffer without it sees neither nav item and is bounced from both routes; a non-SuperAdmin cannot reach the category editor.
- Draft/in-review never appears on any public page.
- Hotline: `(077) 600 1082` shows in the footer, contact page, and news sidebar; no `(02)` number remains anywhere.
- Clean teardown: all test rows + uploaded storage objects + test accounts removed; seed content and counters untouched.
