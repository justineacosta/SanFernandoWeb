# Home & About CMS — Design

**Sub-project 9 of the portal overhaul.** Umbrella: `2026-07-22-portal-overhaul-design.md`
§3.8. Date: 2026-07-22. Migration: **`0021`** (the umbrella's §4 table says `0018`; §4.0 already
records that the column is the plan, not the register).

## 1. The problem

The two pages a visitor sees first are the two the barangay cannot edit. `/` and `/about`
render from `src/features/home/data.ts` and `src/features/about/data.ts` — typed TypeScript
files. Changing the mission statement, swapping a carousel photo, or correcting the household
count is a code edit, a commit, and a deploy. Every other content type in the portal has had a
manager since sub-project 3.

## 2. Decisions

### 2.1 Ten blocks become editable; the page's structure does not

Editable:

| Page | Block | Kind |
| --- | --- | --- |
| Home | Hero carousel slides | ordered, images |
| Home | Quick services | ordered, icons |
| Home | Barangay at a glance | ordered, icons |
| Home | Get-involved items | ordered, icons |
| Home | Get-involved banner image | singleton |
| About | Mission | singleton text |
| About | Vision | singleton text |
| About | Core values | ordered, icons |
| About | Punong Barangay's message | singleton text |
| About | History timeline | ordered, images |
| About | Community programs | ordered, icons |

**Not editable, deliberately:** section headings and their standfirsts ("Our Rich History",
"Community Programs", "Quick Services"), the About page hero, and the Join-Our-Community
panel. These are structural labels, not content — they change once a decade, whereas the items
beneath them change monthly. Making every string editable is a page builder: a much larger
build, a much worse editing experience, and a standing invitation to break the layout from a
textarea. Individual headings can be promoted to fields later, one at a time, on request.

### 2.2 Two tables, not seven

Seven ordered collections could each have a table. They would also each need a query, an
action module, a manager, and a drawer — and the managers in this repo run to several hundred
lines apiece. Instead:

**`site_blocks`** — singleton values, `key text primary key`, `value text` (nullable, because
§3.8 requires mission and vision to be blankable). Four rows: `about.mission`, `about.vision`,
`about.captain_message`, `home.cta_image`. The captain's message is multi-paragraph and stored
as one text value split on blank lines at render time; a textarea is the right editor for it
and a second collection table would not be.

**`site_items`** — every ordered collection, discriminated by a `block` enum, with three text
slots (`label`, `value`, `body`), `icon_name`, `href`, and an image trio (`image_path`,
`image_alt`, `image_fit`). What each slot means per block is fixed and documented in the
migration:

| block | `label` | `value` | `body` |
| --- | --- | --- | --- |
| `hero_slides` | — | — | — |
| `quick_services` | title | CTA label | — |
| `glance_stats` | stat label | stat figure | note |
| `involvement_items` | title | — | description |
| `core_values` | title | — | description |
| `history_entries` | title | year | description |
| `milestones` | title | source | description |

Generic columns invite an EAV mess, so the shape is enforced at the database level: a single
`CHECK` constraint switches on `block` and requires exactly the columns that block uses. A
glance stat with no figure, or a hero slide with no image, is rejected by Postgres, not merely
by the form. That is what buys back the safety seven tables would have given.

### 2.3 No draft→published workflow, and Save is live

Every other manager has `draft → in-review → published → archived` because its records are
published individually and a half-written one must not appear. Site content is not like that.
"The mission statement" is a page section, not a record with a lifecycle; giving it a draft
copy and a live copy doubles every read path to solve a problem nobody has, and produces the
absurdity of a barangay whose About page has no published mission because someone left one in
review.

So **Save writes live**, exactly as saving an already-published announcement does today.

Autosave still applies. The seven new drawer scopes plug into sub-project 8's
`useFormDraft`, so Esc still does not cost the text — and, as ever, the recovery copy is
browser-local and never a database write.

Consequences: `archived` is not a state here, and the **Active | Archived** `ViewToggle` does
not appear. This is the first manager without one; that is a property of the content, not an
omission.

### 2.4 Deletion is direct, and takes its image with it

Sub-project 6 established that permanent deletion is SuperAdmin-only and reachable only from an
`archived` record. That rule protects records with a lifecycle and an audit history. A carousel
slide has neither — it is a list item, and "archive the third slide" is not a thing anyone
means. So deletion here is direct, behind `ConfirmDialog`, gated on `manage-site-content`.

Sub-project 7's invariant still binds: deleting an item deletes its storage object, and a save
that fails after an upload compensating-deletes the object. New uploaders are pure file
pickers; the action uploads server-side, copying `saveLegislative`'s `fail()` helper.

### 2.5 Revalidation is the requirement, not "making the pages dynamic"

§3.8 says backing these pages with the database "changes them from statically generated to
dynamic". `/` is **already** database-backed — it reads announcements and events — under
`export const revalidate = 3600`. The conversion is therefore smaller than the umbrella
assumed.

The concern underneath it is real and sharper than stated: with a one-hour ISR window and no
explicit invalidation, an editor saves the mission statement, reloads the About page, sees the
old text, and concludes the CMS is broken. **Every site-content action calls
`revalidatePath("/")` and `revalidatePath("/about")`.**

### 2.6 An empty block hides its section

§3.8 requires mission and vision to be blankable. A blank string inside a bordered card looks
like a rendering bug, so a singleton with no value hides its card, and a collection with no
items hides its section entirely.

The hero is the exception: with no slides it keeps its heading, tagline, and buttons and simply
renders no image layer. Hiding the hero would leave the home page starting mid-air.

### 2.7 Images follow the officials-portrait pattern exactly

The four carousel photos and the two history images are **static imports** from `src/images/`
— real assets, bundled at build time. They move to `public-media/site/`, uploaded by
`scripts/upload-site-images.mjs`, mirroring `scripts/upload-official-portraits.mjs` from
migration `0012`.

This carries `0012`'s operational catch, which must be stated loudly rather than discovered:
**the script has to be run once per environment.** Applying `0021` alone seeds rows pointing at
storage objects that do not exist, and the home page renders broken images. Migration then
script, per environment, both times.

`src/images/carousel/` and `src/images/logo/` stay in the repo as the script's source, not as
an app dependency — the same status `src/images/officials/` has held since `0012`.

The get-involved banner is currently an `lh3.googleusercontent.com` hotlink. It is seeded as
that URL verbatim and becomes replaceable through the CMS, so the first time anyone edits it,
one hotlink leaves the codebase. Migrating the rest stays outside this programme.

The Punong Barangay's portrait needs no work: `CaptainMessageSection` already reads name, role
and photo from the officials table, with the static import as a fallback for when that query
returns null. §3.8 lists it for migration; re-reading the code, it was migrated in `0012` and
what remains is a deliberate resilience path. It stays.

### 2.8 The migration seeds every current value

Applying `0021` must leave both pages byte-identical to today. An unseeded migration blanks the
home page of a live barangay site. Every row above is seeded from the current `data.ts`
contents, including the Ecological-Profile-verified figures (`1,228`, `248`, `8.95 ha`, `7`)
and the 1733 founding entry.

§3.8 accepted that those figures carry no provenance field and may drift from the source
document. That acceptance is recorded here so a later reader does not mistake the drift for a
regression.

### 2.9 Icons resolve through the existing name-string map

`GLANCE_STATS`, `MILESTONES`, `CORE_VALUES`, `INVOLVEMENT_ITEMS` and `QUICK_SERVICES` carry
`icon: LucideIcon` — a React component, neither serializable across the client boundary nor
storable in Postgres. `src/lib/icon-map.ts` already solves this for services.

The eighteen icons these blocks use are added to the shared `ICONS` map, so `resolveIcon` stays
the single resolution point. The picker gets a **second options list**, `SITE_ICON_OPTIONS`,
rather than being merged into `ICON_OPTIONS`: the service picker's labels are service-flavoured
("Residency / Home", "Permit / Stamp") and are wrong for a core value.

### 2.10 A new permission, granted to nobody

`manage-site-content`, added to `PERMISSIONS`, `PERMISSION_LABELS`, and the **Content** group in
`PERMISSION_GROUPS`.

It is deliberately **left out of `STATUS_PRESETS.editor`**. Presets pre-tick boxes when a
SuperAdmin picks a status label, so including it would hand the front page to the next editor
created without anyone deciding to. §3.8's "nobody holds it but SuperAdmins until the owner
grants it" is implemented by that omission.

### 2.11 `@dnd-kit`, in this manager only

§3.8 authorises the dependency for carousel and history reordering, and `BACKEND_HANDOFF` §6.7
records that avoiding it was a deliberate earlier choice. It arrives as **one** shared
`SortableList` primitive used by all seven collections here — they are short visual lists where
dragging is the obvious gesture, and a manager with two drag lists and five button lists would
be incoherent.

Every existing up/down list — news photos, achievements, officials, transparency projects —
stays exactly as it is. The dependency is not a licence to convert them.

The primitive must keep dnd-kit's keyboard sensor wired, so reordering stays operable without a
mouse. Losing that would trade an accessible control for an inaccessible one.

## 3. Sequence

Two commits inside the one sub-project, so there is a working checkpoint rather than a single
enormous drop.

| Phase | Content |
| --- | --- |
| A | Migration `0021` + seed, permission, types, icon-map extension, upload script |
| B | Query layer, `site_blocks`/`site_items` actions, `SortableList` primitive |
| C | **Commit A** — About: mission, vision, core values, captain's message, history, programs |
| D | **Commit B** — Home: carousel, quick services, glance stats, involvement, banner |
| E | Verification, `BACKEND_HANDOFF.md`, `CLAUDE.md` |

## 4. Risks

- **An unseeded or half-applied migration blanks the front page.** Addressed by §2.8, and by
  running the image script in the same sitting as the migration (§2.7).
- **Nine public components change.** Each becomes an `async` server component reading its
  block. Verified page-by-page against the current rendering, not in aggregate.
- **The `CHECK` constraint is the only shape guarantee.** If a block is added later without
  extending the constraint's `CASE`, it silently accepts anything. The migration comments say
  so at the constraint.
- **`@dnd-kit` is a new dependency** in a repo that had deliberately avoided one. Confined to
  one primitive (§2.11) so removing it later touches one file.
- **Editors can empty the home page.** §2.6 makes that degrade to a hidden section rather than
  a broken layout, but it remains possible by design — the owner asked for editable content.

## 5. Not in scope

- Section headings, the About hero, and the Join-Community panel (§2.1).
- The remaining `lh3` hotlinks beyond the get-involved banner (§2.7).
- A draft/review workflow for site content (§2.3), and therefore archive/restore for it (§2.4).
- `SITE.tagline` / `SITE.description`, which live in `src/constants/site.ts` alongside identity
  and navigation. Site-wide identity is not page content and does not belong in this manager.

## 6. What the browser confirmed

*(filled in after verification)*
