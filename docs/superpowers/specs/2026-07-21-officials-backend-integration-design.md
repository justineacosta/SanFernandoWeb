# Officials Backend Integration — Design

**Date:** 2026-07-21
**Status:** Approved by Justine (brainstorming session)
**Implements:** master spec `2026-07-15-backend-integration-design.md` §6 (build-order item 6)
**Scope:** Move the officials directory from a static `data.ts` array to Supabase, add
`/officials/[slug]` profile pages, move the 12 bundled portraits to Storage, and add a
permission-gated admin manager. **Achievements are explicitly deferred** to a follow-up plan.

---

## 1. Decisions locked with the user

| Decision | Choice |
| --- | --- |
| Achievements timeline (master spec §6) | **Deferred to a follow-up plan.** Profiles ship with portrait, identity, term, contacts, and bio. Rationale: the core profile is the real value, and meaningful achievements need real barangay content we don't have. Adding them later is a self-contained child table + drawer sub-list with no rework. |
| Editable fields | The manager is a **full editor**: name, position, group, badge, portrait, term, email, phone, bio, directory order, and workflow status. |
| Portraits | **All 12 move to Supabase Storage** (`public-media`, `officials/` folder). Bundled static imports are retired from the app — the manager cannot write to the bundle, so a single Storage path is the only coherent source. |
| Public directory appearance | **Zero visual change** on day one. The only interaction change: portrait + name link to the profile page. |
| Departures | **Archive-first** (hidden publicly, record kept as term history). Delete is confirm-gated and for mistakes only. |
| Workflow | `draft → published`, plus `archived`. Reuses the existing `content_status` enum; officials skip `in-review` in the UI. |

## 2. Data model — migration `0012_officials.sql`

New enum `public.official_group` — `'executive' | 'council' | 'administration'`.

New table `public.officials`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | `gen_random_uuid()` |
| `slug` | text not null unique | URL key for `/officials/[slug]` |
| `name` | text not null | e.g. "Hon. Dominic B. Dela Cruz" |
| `role` | text not null | position, e.g. "Punong Barangay" |
| `group` | `official_group` not null | decides the directory section |
| `badge` | text | nullable, e.g. "Youth Leader" |
| `photo_path` | text | `public-media` object path; nullable |
| `photo_alt` | text not null default `''` | |
| `term` | text not null default `''` | e.g. "2023–2026" |
| `email` | text | nullable, published contact |
| `phone` | text | nullable, published contact |
| `bio` | text not null default `''` | profile-page paragraph |
| `sort_order` | int not null default 0 | directory position (Captain first) |
| `status` | `public.content_status` not null default `'draft'` | |
| `published_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz not null default `now()` | `set_updated_at` trigger |

Index on `(status, "group", sort_order)`. **RLS enabled with zero policies** — identical to
every other table; the service-role client behind `requirePermission("manage-officials")` is
the entire gate, and `.eq("status","published")` is the public boundary.

`group` is a reserved word in SQL — it must be quoted (`"group"`) in DDL and in every
PostgREST `select`/`order` that names it.

### Seed

All **12 real officials**, `status = 'published'`, `published_at = now()`, carrying forward
today's exact names, roles, groups, badge, emails, and phones from
`src/features/officials/data.ts` so the public page is byte-identical on day one.
`term` = "2023–2026" for all; `bio` = `''`.

`sort_order` is global `1..12` in the current array order (Punong Barangay 1, Kagawads 2–8,
SK Chairman 9, Secretary 10, Treasurer 11, Admin Assistant 12); the three-section layout
comes from `group`, not from the ordering.

`photo_path` is seeded to the deterministic path `officials/<slug>.<ext>`, where `<ext>`
matches the bundled source file (the Punong Barangay portrait is `.jpg`; the other eleven
are `.png`).

Slugs are the slugified name with honorifics stripped — `dominic-b-dela-cruz`,
`geroly-b-aggasid`, `ronnel-t-paguirigan`, `segundo-t-butay`, `noel-a-ribao`,
`ruthsen-faye-m-gonzales`, `lydia-b-butay`, `mariene-a-butay`, `jake-b-de-la-cruz`,
`sharah-mae-r-lagundi`, `mariela-a-tolentino`, `mary-kaye-a-maltezo`. Note that
`dominic-b-dela-cruz` and `jake-b-de-la-cruz` are distinct — no collision.

## 3. Storage — portraits

Reuse the existing **`public-media`** bucket (no new bucket) under an `officials/` prefix.
Images keep the site-wide 2 MB / JPG-PNG-WebP limits from `src/lib/storage.ts`.

`src/features/admin/actions/media.ts` is generalized rather than duplicated:
`uploadSingleImage` and `removeStoredImage` accept `"officials"` alongside
`"announcements"` and `"events"`, and gate per folder — `manage-news` for the news folders,
**`manage-officials`** for `officials/`. `removeStoredImage`'s path allow-list regex gains
`officials`. `SingleImageUploader`'s `folder` prop widens to match.

### One-time portrait upload

A throwaway script (scratchpad, service-role key read from `.env.local`) uploads the 12
bundled `src/images/officials/*` files to their deterministic seed paths. It only ever
**creates** objects, is idempotent (`upsert: true`), and prints each resulting path.

**Sequencing:** the script runs **before** the migration is applied, so the objects exist by
the time seeded rows reference them. The two are otherwise order-independent because the
paths are fixed in advance. Per project convention the owner applies `0012` manually against
staging; the agent runs the upload script.

After this lands, `src/images/officials/` is referenced only by that script — the app reads
portraits from Storage. The files stay in the repo as the source of truth for re-seeding.

## 4. Public side

**`src/features/officials/queries.ts`** (new, `server-only`, service-role client):

- `listPublishedOfficials()` → published officials ordered by `sort_order`, for the directory.
- `getPublishedOfficialBySlug(slug)` → one published official incl. `bio` and `term`, or `null`.

Both resolve `photo_path` through `photoUrl()` (which already passes full URLs through
unchanged, so a future remote-URL portrait still works).

**`LeadershipDirectory`** becomes an async Server Component reading `listPublishedOfficials()`
and grouping in memory, replacing `getOfficialsByGroup`. The three-section layout
(Chief Executive / Barangay Council / Administration) and all styling are unchanged.

**`OfficialCard`** gains a link: the portrait and name navigate to `/officials/<slug>`.
The contact `mailto:`/`tel:` icons stay **outside** that link (anchors cannot nest) and keep
working as they do today. No layout or token changes — the existing `group-hover` scale
already reads as an affordance.

**`/officials/[slug]/page.tsx`** (new) — Server Component mirroring the legislative
slug-page structure:

- `getPublishedOfficialBySlug`; `notFound()` when missing or unpublished.
- Renders portrait, name, position, badge, term, contacts, and bio. **The bio block is
  omitted entirely when `bio` is empty** (day-one state) — no empty heading, no placeholder.
- `generateMetadata` for title/description and the portrait as the OG image.
- A "Back to Barangay Officials" link.
- Amber+ink tokens only; Space Grotesk headings.

`TERM_LABEL` stays in `src/features/officials/data.ts` as the site-level current term used by
the officials page hero; per-official `term` lives in the DB and renders on profiles. The
`OFFICIALS` array and the bundled portrait imports are deleted from `data.ts`.

## 5. Admin manager

Route `src/app/admin/(portal)/officials/page.tsx` — Server Component,
`requirePermission("manage-officials")`, loads every official (all statuses) and renders the
manager. A nav entry (**Officials**, `/admin/officials`, lucide `Users`,
`permission: "manage-officials"`) is added to `ADMIN_NAV_ITEMS`, placed with the other
content items. The `manage-officials` permission **already exists** in `PERMISSIONS` — no
auth/permission changes are needed anywhere.

**`OfficialsManager`** (client) follows the Transparency/News manager pattern:
stat cards (total / published / drafts / archived), a filter bar (search over name + role,
status filter, group filter), and a table with **drag-reorder** persisting `sort_order`.
Rows open the drawer editor.

**`OfficialForm`** (drawer) edits every field in §1: name, position, group, badge, portrait
(via `SingleImageUploader`, folder `officials`), term, email, phone, and bio. Actions:
Save draft, Publish, Archive, and a confirm-gated Delete.

`photo_path` is nullable so a draft can be saved before the portrait is ready, but
**publishing requires a portrait** — validated server-side in the publish action, not only
in the UI. This keeps `photoUrl` non-null for every record the public queries can return, so
the directory card and profile page never render a broken or placeholder image.

**`src/features/admin/actions/officials.ts`** — Zod-validated (zod v4)
create / update / publish / archive / delete / reorder. Slug is auto-generated from the name
by a local `slugify` (the per-file convention already used by `news.ts`, `legislative.ts`,
`services.ts`), honorifics stripped, de-duplicated with a numeric suffix on collision, and
**frozen once published** (editable while draft). Status strings are re-validated at runtime
with `z.enum(["draft","in-review","published","archived"])` because Server Actions are public
HTTP endpoints. Every write revalidates `/officials`, `/officials/<slug>`, and
`/admin/officials`.

**`src/features/admin/queries/officials.ts`** — the admin list query (all statuses).

## 6. Types

`src/types/index.ts` keeps the existing `OfficialGroup` union and adds:

- `OfficialListItem` — public directory shape: `id`, `slug`, `name`, `role`, `group`,
  `badge`, `photoUrl`, `photoAlt`.
- `OfficialDetail` — `OfficialListItem` plus `term`, `email`, `phone`, `bio`.
- `OfficialRecord` — admin envelope: the detail fields plus `status`, `sortOrder`,
  `photoPath`, timestamps.
- `OfficialFormValues` — the drawer's POST/PUT body contract.

The static `Official` interface (whose `photo` is a `StaticImageData`) is retired along with
the `OFFICIALS` array; `OfficialCard` consumes `OfficialListItem`.

## 7. Verification

No test framework — verification is `npm run typecheck` + `npm run lint` + driving the
running app per `.claude/skills/verify/SKILL.md`:

1. `/officials` renders all 12, visually identical to before, in the correct three sections.
2. A card's portrait/name navigates to the profile; the mail/phone icons still work.
3. `/officials/<slug>` renders correctly, and omits the bio block while `bio` is empty.
4. An unknown or unpublished slug 404s.
5. Admin: create, edit, publish, archive, and reorder all persist across a reload.
6. Portrait upload and replace work; the new image appears publicly after revalidation.
7. Archiving an official removes them from the public directory and 404s their profile.
8. A user without `manage-officials` cannot reach `/admin/officials`.

## 8. Out of scope

Achievements timeline (follow-up plan); term-history / multi-term records; officials'
real contact data and bios (owner-supplied content, entered through the manager once
available); any change to the other `lh3`-hotlinked images outside `src/images/officials/`.
