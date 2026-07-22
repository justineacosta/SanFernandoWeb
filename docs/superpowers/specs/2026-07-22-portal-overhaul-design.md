# Portal Overhaul — Umbrella Decision Record

**Date:** 2026-07-22
**Status:** Approved (decisions locked; sub-projects specced individually)
**Master spec:** `docs/superpowers/specs/2026-07-15-backend-integration-design.md`

## 1. What this document is

The owner requested a large body of work spanning permission-gated 404s, fuzzy search,
audit logs, transactional uploads, an archive system, autosave, a Home/About CMS, and a
set of resident-portal fixes.

That is **nine largely independent sub-projects**, not one feature. Attempting them as a
single change set — touching ~75 audit call sites, 5 upload action contracts, 10
static→DB component rewrites, and every admin manager, with **no test framework** in the
repo — would almost certainly regress something silently.

This document therefore does two things and nothing else:

1. Records the decisions that apply **across** sub-projects, so they are not re-litigated.
2. Fixes the sequence in which the sub-projects ship.

Each sub-project gets its own dated design spec and implementation plan, written and
approved immediately before it is built. **This document contains no implementation
detail** — look in the per-sub-project spec for that.

## 2. Codebase facts the decisions rest on

Established by a full read-through on 2026-07-22. Recorded because several decisions
below only make sense against them.

- **There is no HTTP API.** Zero `route.ts` files. Every mutation is a Server Action —
  24 files in `src/features/admin/actions/`. "Gate the API endpoints" therefore means
  "gate the Server Actions".
- **Authorization is already permission-based**, not role-name based. `src/lib/auth.ts`
  is 52 lines; `PERMISSIONS` in `src/types/index.ts` holds 7 slugs; `status_label`
  (`staff` | `editor`) is a display title with no power. The requested "use a
  permission-based architecture" is already satisfied structurally.
- **Nav filtering already works.** `AdminSidebar` filters `ADMIN_NAV_ITEMS` by
  `superAdminOnly` and `permission`. Unauthorized modules already do not appear in
  navigation. The only gap is the direct-URL response (currently a redirect).
- **An audit log already exists.** `public.audit_log` (migration `0001`) and
  `recordActivity()` in `src/lib/audit.ts`, called ~75 times across 20 of the 24 action
  files. It is not a greenfield build — it is an upgrade.
- **The archive substrate already exists.** `public.content_status`
  (`draft | in-review | published | archived`) is used by 7 content tables, `archiveX()`
  actions exist, and publish actions already accept `archived` as an input state, so
  restore-by-republish works today.
- **Uploads are eager in three of five uploaders, not all five.** `SingleImageUploader`,
  `NewsPhotoUploader`, and `AchievementPhotoUploader` write to Storage the instant a file
  is picked, so cancelling the drawer orphans the object. `PdfUploader` and
  `MultiFileUploader` already defer to Save (2026-07-20 / 2026-07-21 plans) and are the
  model the other three should follow — see §3.3.
- **`src/middleware.ts` exists** and guards the whole `/admin` tree: it redirects
  unauthenticated GETs to `/admin/login` and refreshes the Supabase session cookie. Its
  matcher deliberately excludes Server Action POSTs via the `Next-Action` header, because
  Next's `proxyClientMaxBodySize` was silently truncating large upload bodies. This is a
  second auth layer above `src/lib/auth.ts` and must be accounted for when reasoning
  about admin access — it was missed in the first pass of this analysis.
- **`next.config.ts` already sets `experimental.serverActions.bodySizeLimit: "12mb"`**,
  globally, so the 10 MB PDF check is reachable. This raises the accepted body size for
  every Server Action including the public unauthenticated ones — a known follow-up for
  the hardening pass, recorded in `BACKEND_HANDOFF.md`.
- **Only two real searches exist:** `searchLegislative()` (PostgREST `ilike` with a
  documented escaping layer) and `searchUploads()` (in-memory substring). Everything else
  is `.toLowerCase().includes()` in a client manager. The `AdminTopBar` search input is a
  dead stub with no state and no handler.
- **Home and About are 100% static** typed `data.ts` files with no DB backing.
- **No fuzzy-search library, no DnD library, and no test framework** are installed.
- Migrations `0001`–`0013` are applied to **both staging and production**. Next is `0014`.

## 3. Cross-cutting decisions

### 3.1 Unauthorized access returns 404, but only where 404 is meaningful

`requirePermission` / `requireSuperAdmin` switch from `redirect("/admin")` to
`notFound()` for **page loads**. A staff member without `manage-news` who types
`/admin/news` gets a genuine 404 — the portal does not confirm the module exists.

**Server Actions get a different failure mode.** A 404 is meaningless on a POST, and a
thrown `notFound()` inside an action surfaces as an unhandled digest error rather than a
rendered page. Actions instead return the typed refusal the codebase already uses —
`{ error: "Not found." }` — which the calling form renders and which leaks nothing.

`requireSessionUser()` keeps `redirect("/admin/login")`. A signed-out user hitting
`/admin/news` should be asked to sign in, not told the page does not exist.

The root `src/app/not-found.tsx` renders `PublicShell` — public header, footer, and
emergency hotlines. That is wrong inside the admin portal, so a dedicated
`src/app/admin/not-found.tsx` with admin chrome is required.

### 3.2 Delete is archive-then-delete, SuperAdmin only

Archive is a soft delete: the row stays in Postgres, disappears from public and default
admin listings, and is restorable. Delete is permanent — the row leaves Postgres and its
Storage objects are removed. There is no undo.

**Staff holding a module permission may Archive. Only a SuperAdmin may Delete, and only a
record already in `archived` state.**

The rejected alternative was delete-in-one-click for anyone with the module permission.
Under that model a staff member with `manage-transparency` could permanently destroy an
ordinance PDF — a public legal record, and very likely the barangay's only digital copy —
with no recovery path. Archive-then-delete preserves an "oops" window on every
destructive act while still allowing a genuine purge.

Consequence: every manager needs an Archived view in which a SuperAdmin, and only a
SuperAdmin, sees the Delete action.

### 3.3 Uploads defer to Save, following the pattern already in this repo

> **Revised 2026-07-22, after reading `docs/BACKEND_HANDOFF.md`.** The original decision
> here was a `_staging/<token>/` quarantine prefix plus a sweeper. That was chosen against
> two premises that a documentation read proved false, and it is withdrawn. The reasoning
> is kept below rather than deleted, because the reversal is the useful record.

**What the repo already does.** The 2026-07-20 transparency plan hit exactly this problem
and solved it: *"Uploads are deferred to Save. `PdfUploader` is a pure file picker making
no network calls; the save Server Actions upload server-side and compensating-delete the
storage object if the row write fails, so 'a storage object exists only if a row
references it' holds by construction. This replaced an earlier design that uploaded on
file-select and orphaned an object every time a drawer was cancelled."* The 2026-07-21
plan extended the same pattern from one file to a file *set*. Both are live and verified.

So the codebase has already tried the eager approach, found the exact bug this
sub-project exists to fix, and replaced it with defer-to-Save.

**Why the staging prefix was wrong.** It rested on two false premises:

1. *"Deferring to Save needs the Server Action body limit raised to ~32 MB, which is an
   abuse surface."* — `next.config.ts` **already sets
   `experimental.serverActions.bodySizeLimit: "12mb"`**, and has since the 2026-07-20
   plan, precisely so the 10 MB PDF check is reachable. The remaining eager uploaders
   carry 2 MB images, at most 3 at a time — 6 MB, comfortably inside the existing limit.
   No config change is needed at all.
2. *"No transactional pattern exists, so one must be invented."* — one exists, is
   documented, and is the established convention for exactly this problem.

Introducing a second, different mechanism alongside it would have left the codebase with
two upload models and a sweeper job that has no other reason to exist.

**The decision.** The three remaining eager uploaders — `SingleImageUploader`
(`media.ts`), `NewsPhotoUploader` (`news-photos.ts`), and `AchievementPhotoUploader`
(`achievement-photos.ts`) — convert to the existing defer-to-Save + compensating-delete
pattern. No staging prefix, no sweeper, no new config.

The news and achievement photo cases carry a real wrinkle the transparency ones did not:
their photos are child-table rows keyed by a parent id, uploaded one file at a time
against an already-saved parent. Converting them means holding a pending list in form
state and flushing it on Save. Sub-project 7's spec owns that detail.

Overwrite safety is already guaranteed and must stay so: all paths are UUID-based and
every upload uses `upsert: false`.

### 3.4 Search is hybrid, and that is deliberate

- **Fuse.js in the browser** for the 8 admin managers. They already ship their full
  dataset to the client, so filtering is instant with no network round-trip, and Fuse
  handles the requested cases natively — `"juan dela"` → *Juan Dela Cruz*, `"offcal"` →
  *official*, transposed characters.
- **Postgres `pg_trgm` server-side** for audit logs, the two public transparency browse
  pages, and the new global search. These either grow unbounded or are already
  server-paginated.

Implementation consistency was considered and rejected. Fuse.js is an in-memory scorer:
running it "server-side" still means loading the whole table on every keystroke, which is
slower than the browser for small tables and impossible for large ones. Meanwhile
`pg_trgm` everywhere would make the small, instant manager searches into ~250 ms debounced
round-trips and lose match quality on short prefixes.

What must be consistent is **how search feels** — every input fuzzy and forgiving. A user
cannot tell which engine answered. If a manager's table ever outgrows client-side
filtering, it moves to `pg_trgm` individually; the UI does not change.

`pg_trgm` needs two known compensations, to be specified in sub-project 4: a prefix-match
fallback so `"cert"` finds *certificate*, and term-splitting so `"juan dela"` matches as
multiple terms rather than one string.

### 3.5 The audit log gains structure and real immutability

- A `public.audit_action` **enum** column (`create`, `update`, `delete`, `archive`,
  `restore`, `publish`, `unpublish`, `save_draft`, `approve`, `reject`, `login`, `logout`,
  `file_upload`, `file_delete`, `role_change`, `password_reset`, `reorder`) — the
  requested Action Type dropdown needs controlled values, and the existing `action` column
  holds free-text prose (`"archived announcement"`).
- The existing `action` column is **kept** as secondary human-readable detail alongside
  the enum, not dropped.
- A new `entity_label` column captures the human name at write time (`"Maria Santos"`).
  The required Target Entity column reads `Official: Maria Santos`, but the table stores
  only `entity_type` and a UUID today. Joining at read time would break precisely when a
  record is deleted — the case where the audit trail matters most.
- **Immutability is enforced, not assumed.** RLS blocks nothing for the service-role
  client, so today any future action file could `UPDATE` the log. `REVOKE update, delete`
  from all roles plus a rejecting trigger makes it real.
- Audit logs are **SuperAdmin-only**. They will contain login records and role changes for
  the whole team.
- **Admin actions only.** Anonymous resident submissions have no actor and are not logged.
- Coverage gaps to close: `auth.ts` has zero `recordActivity` calls (no login/logout), and
  `media.ts` / `documents.ts` have zero (no file upload/delete events).

### 3.6 Archive applies to content, not to tickets

The four ticket flows — applications, appointments, complaints, assistance — are **out of
scope for archive**. They have their own service lifecycle (submitted → reviewed →
released / resolved). A resident's complaint is a case with a resolution, not content to be
published and archived.

Services keep their existing active/inactive toggle, which already expresses "stop
accepting applications for this" correctly; a third state would muddy it.

Categories (news, assistance, transparency) get a **hide-from-new-record-dropdowns flag**
rather than a full archive. A real archive would force a decision about the records
already filed under the category; a hide flag lets existing posts keep their label while
the category stops being offered for new ones.

### 3.7 Autosave never touches the database before a manual save

- Autosave persists **text fields only**. Staged uploads stay staged until a manual Save.
  Otherwise autosave would commit files every 30 seconds and defeat §3.3 outright.
- On a **new, never-saved record**, autosave writes to **browser storage**, not Postgres.
  Creating draft rows on a 30-second timer would litter the database with abandoned empty
  records.
- Autosave must be **excluded from the audit log**, or it will emit one entry per form per
  30 seconds and drown the real signal.
- Autosave never publishes. It applies only to draft-capable forms: news, announcements,
  events, officials, legislative, transparency documents, transparency projects.

### 3.8 Home/About CMS gets its own permission and its own images

- A new `manage-site-content` permission. Nobody holds it but SuperAdmins until the owner
  grants it — the safe default, since existing staff gain nothing on deploy.
- The carousel images and the Punong Barangay portrait are currently **static imports**
  from `src/images/` (real assets, not hotlinked). They migrate to `public-media`.
- The About page's `CAPTAIN` block stays **independent** of the Punong Barangay's record
  in the Officials directory. They are edited separately.
- Mission and Vision are **editable single fields that may be blanked**, not multi-entry
  collections.
- Carousel / Fade / Slide / Zoom / Static Banner **change the interaction model**, not
  merely the transition style.
- Glance stats are freely editable with no provenance field, despite currently holding
  figures verified against the Ecological Profile PDF. The owner accepted that they may
  drift from the source document.
- `@dnd-kit` is added for carousel and history reordering. Note that avoiding a
  drag-and-drop dependency was a **deliberate** earlier choice, recorded in
  `BACKEND_HANDOFF.md` §6.7: photo reordering uses accessible up/down buttons, *"not an
  oversight; revisit only if editors ask for it."* The owner has now asked for it, so the
  dependency is warranted — but only where it was asked for. Existing up/down reordering
  (news photos, achievements, officials, projects) stays as it is; this is not a licence
  to convert every list in the portal.
- The RSC icon boundary applies: `GLANCE_STATS`, `MILESTONES`, `CORE_VALUES`, and
  `INVOLVEMENT_ITEMS` carry `icon: LucideIcon`, which is neither serializable across the
  client boundary nor storable in Postgres. The CMS must use the existing
  `src/lib/icon-map.ts` name-string pattern.
- Backing `/` and `/about` with the database changes them from statically generated to
  dynamic. Revalidation must be wired deliberately.

### 3.9 The global admin search becomes real

The `AdminTopBar` search input is a non-functional stub. It becomes a working
cross-module search whose results are **scoped to the viewer's permissions** — a staff
member without `manage-officials` must not see officials in the results, which would leak
the existence of records §3.1 is designed to hide.

## 4. Sequence

Each row is independently shippable and independently verifiable. Later rows depend on
earlier ones; the order is not arbitrary.

| # | Sub-project | Migration |
| --- | --- | --- |
| 1 | Resident portal fixes | — |
| 2 | Permission → 404 | — |
| 3 | Audit Logs v2 | `0014` |
| 4 | Fuzzy search | `0015` |
| 5 | Table standards | — |
| 6 | Archive & restore | `0016` |
| 7 | Transactional uploads | `0017` |
| 8 | Autosave | — |
| 9 | Home & About CMS | `0018` |
| 10 | Public-side UI/UX | — |

Rationale for the ordering:

- **1 first** because it is user-visible, carries zero schema risk, and establishes the
  browser-verification loop before anything structural moves.
- **2 before 3** because audit logging should record actions in a portal whose
  authorization semantics are already final.
- **3 before everything that logs** — 5, 6, 7, and 9 all add audit entries, and doing
  them after the enum lands avoids writing call sites twice.
- **4 before 5** because the table standards work consumes the search primitives.
- **6 before 7** because archive/restore defines the record states that upload commit and
  cleanup must respect.
- **7 before 8** because autosave's contract (§3.7) is defined in terms of staged uploads.
- **9 last** — it is the largest new build and depends on the upload, autosave, and table
  primitives all being settled.
- **10 is order-independent.** It adds no migration and shares no code with 6–9, so it can
  run at any point. It is numbered last only because it was added to the programme after
  the other nine; see §4.1.

### 4.1 Sub-project 10 — the public side is in scope too

**Added 2026-07-22, on the owner's instruction, after sub-project 5 shipped.** The original
brief listed "resident portal fixes" as sub-project 1 and everything after it was admin
work, which left the impression that the UI/UX standards were an admin-only concern. They
are not. The owner's words: *"improve also the UI/UX in the client side, I didn't mean to
be at the Admin side only."*

The public site is what residents actually use, and the survey done when this section was
written shows it is behind the portal on exactly the standards sub-project 5 just
established:

| Standard | Admin (after 5) | Public today |
| --- | --- | --- |
| Loading feedback | 12 × `loading.tsx` | **none** — 5 DB-backed routes stream with no fallback |
| Error boundary | route `not-found.tsx` | **no `error.tsx` anywhere in the app** — a failed query is a blank crash |
| Toasts | `useToast`, tones, ids | per-form inline text only |
| Focus ring | global `:focus-visible` | inherits the same global rule ✅ |
| Inline validation | blur-then-live | the six public forms each do their own thing |
| Confirmation | branded `alertdialog` | n/a — the public side has no destructive actions |

The six public client components in scope: `apply-form`, `appointment-form`,
`complaint-form`, `assistance-form`, `inquiry-form`, `newsletter-form`, plus
`track-lookup` and the `legislative-table` disclosure rows.

This sub-project reuses the primitives sub-project 5 built rather than inventing public
equivalents — `Skeleton`, `useToast`/`Toast`, and the shared Zod schemas — so the two
halves of the site behave the same way. It gets its own spec before implementation.

## 5. Risks carried across the whole programme

- **No test framework.** Verification is `npm run typecheck`, `npm run lint`, and driving
  the running app per `.claude/skills/verify/SKILL.md`. Every sub-project must state its
  own runtime verification steps, and no sub-project may claim completion without them.

  **Unresolved tension, for the owner to settle.** `CLAUDE.md` says *"There is no test
  framework. Do not add one casually."* But the master spec §11 says Playwright
  integration tests are to be added *"when the backend lands (the no-test rule expires)"*,
  in priority order — the four ticket flows and `/track` first — and `BACKEND_HANDOFF.md`
  §6.5 repeats it. The backend has substantially landed. Nothing in this programme adds
  tests, and every sub-project is verified by hand instead; that is a deliberate reading
  of `CLAUDE.md` as the more current instruction, not an oversight. It is worth an
  explicit decision before sub-project 7, which is the riskiest change and the one that
  would benefit most from a regression net.

  **Resolved 2026-07-22.** The owner lifted the no-test rule. Sub-project 5 added Vitest
  (pure functions, 21 cases) and Playwright (`public` + `admin` projects), and `CLAUDE.md`
  was updated to match. The paragraph above is left standing as the record of why.
- **Migrations are applied manually by the owner** against live Supabase. No sub-project
  may assume a migration is applied without explicit confirmation.
- **Sub-project 3 rewrites ~75 existing call sites.** Mechanical but wide.
- **Sub-project 7 is the highest-risk item** and must ship alone. News photos and
  achievement photos are keyed by `articleId` / `achievementId` and inserted into child
  tables immediately on upload; making them transactional means restructuring to a
  pending-list-in-form-state model, changing both the action contracts and every consuming
  form.
- **Sub-project 9 changes build output** for `/` and `/about`.

## 6. Open items deliberately deferred

Not part of this programme, still outstanding from the master spec:

- 2D email (Resend).
- Migrating remaining `lh3.googleusercontent.com` hotlinked images to owned Storage.
  Sub-project 9 migrates the carousel and captain portrait only.
- The security-hardening pass.
- The Punong Barangay's real message, still invented content in `about/data.ts`.
- The admin **Dashboard Overview** seed (`RECENT_DRAFTS`, `ADMIN_TEAM`), which stays mock.
  `PUBLISHING_ACTIVITY` is retired by sub-project 3.
