# Admin Polish — publish, chrome, and the shell

**Date:** 2026-07-22
**Status:** Approved
**Migration:** `0022`

## 1. What this is

A polish pass over the admin portal, requested by the owner after sub-project 9 shipped.
It is not a sub-project of the portal-overhaul umbrella
(`2026-07-22-portal-overhaul-design.md`) — that programme is complete. It is a list of
defects and rough edges found by using the finished portal, plus the two shell components
that were never revisited after the amber+ink reskin.

Eleven changes in four groups. They share no code and could ship in any order; they are
one spec because they are one sitting of work.

## 2. The defect

**Officials cannot be published from the directory.** Reported as "they remain draft when
I try to publish".

Two independent causes, both real:

1. **No Publish in the row menu.** `officials-manager.tsx`'s `actionsFor` offers Edit,
   then Archive (published only), Restore and Delete (archived only). It never offers
   Publish. Three managers do — `news-manager.tsx:306`, `events-manager.tsx:208`,
   `transparency-projects-panel.tsx:217` — and three do not: Officials, Legislative and
   Transparency all publish from inside the drawer instead. The portal is simply
   inconsistent here; no spec records a decision either way. Worse for Officials, the
   drawer's button is gated on `id && status !== "published"`, so a newly created official
   must be saved, closed, and reopened before a publish control exists anywhere on screen.

2. **The failure is silent.** `setOfficialStatus` refuses to publish an official with no
   `photo_path`, and refuses again with no `photo_alt`. Both are correct — the public card
   leads with the portrait, and a government site cannot ship an empty `alt`. But
   `OfficialForm` renders `error` as the last child of the scrolling body, below the
   achievements editor, while Publish sits in the fixed footer. On a form this long the
   message is reliably off-screen. The user clicks Publish, the row stays Draft, and
   nothing appears to have happened.

The alt-text gate is not the bug and stays. Being unable to see it is the bug.

### 2.1 The fix

- Add **Publish** to `actionsFor` for any non-archived record whose status is not
  `published`, calling `setOfficialStatus(id, "published")`. On error, `showError(...)` —
  the toast has an error tone precisely for this. On success, `showToast` + `router.refresh()`.
  This puts Officials with News, Events and Projects rather than with the drawer-only three.
  **Legislative and Transparency are left alone.** They share the pattern but not the
  report, and neither hides its publish button behind a prior save the way Officials does.
  Bringing them across is a follow-up, not a polish-pass drive-by.
- Drop the `id &&` guard on the drawer's Publish button. `handlePublish` already saves
  first and reads `saveResult.id ?? id`, so it handles the brand-new case; the guard only
  enforced a save-close-reopen round trip that nothing needed.
- Move the drawer's `role="alert"` error out of the scrolling body and into the footer,
  above the button row. An error attached to a control must be visible from that control.

## 3. Barangay Members

A fourth directory section, below Administration.

**Migration `0022`:** `alter type public.official_group add value 'members';`. The value
appends after `administration`, which is the wanted order; the public page orders its
sections explicitly in code regardless.

Postgres permits `ADD VALUE` inside a transaction since 12, but the new value cannot be
*used* in the same transaction. `0022` only declares it — no seed rows use `'members'` —
so this is safe. **Do not add a seed insert using `'members'` to this migration.**

Touch points, all mechanical:

| File | Change |
| --- | --- |
| `src/types/index.ts:89` | `OfficialGroup` gains `\| "members"` |
| `src/features/admin/actions/officials.ts:32` | Zod `z.enum` gains `"members"` |
| `official-form.tsx` | Directory Section select gains an option |
| `officials-manager.tsx` | `GROUP_OPTIONS` + `GROUP_LABELS` gain "Members" |
| `leadership-directory.tsx` | Fourth section, heading **"Barangay Members"** |

Public heading is **"Barangay Members"**; the admin-facing label is **"Members"**. The
section renders like Administration — `variant="compact"` cards in a centred wrapping flex
row, so an odd last card centres. It is omitted entirely when empty, like the other three.

## 4. Officials page chrome

**`AdminPageHeader`.** The page currently opens on a bare right-aligned "Add New Official"
button — the only admin manager with no heading. Add `title="Manage Officials"` with a
description, and move the Add button into the header's `action` slot, matching
`NewsManager`, `EventsManager`, `ServicesManager` and the rest.

**The view toggle moves under the heading.** `ViewToggle` currently sits in the card
header's right-hand cluster beside the filter bar, so switching to Archived — which also
removes the Status select — reflows that whole row. Moving the toggle to its own full-width
row directly beneath "Officials Directory" separates the two: the toggle cannot move itself,
and because search is the first control in `AdminFilterBar`, dropping a trailing select
shifts nothing to its left.

**Scope, deliberately narrow.** Five other managers keep the toggle top-right. This spec
changes Officials only, because Officials is what was reported. That leaves the portal
inconsistent on this one detail; correcting it across all six is a follow-up the owner can
call for, not something to do unasked in a polish pass.

## 5. Quick Services returns to code

Sub-project 9 moved the six home-page shortcut cards into `site_items`. They are a fixed
set of links to this site's own routes; they change when the site's routes change, which is
a deploy, not an edit. The owner asked for them back in code.

- Recreate `src/features/home/data.ts` (deleted by sub-project 9) exporting
  `QUICK_SERVICES: QuickService[]`, icons as Lucide components — the pre-`0021` shape. This
  sidesteps `resolveIcon` and the icon-name-string mapping entirely.
- `QuickServicesSection` becomes a synchronous Server Component reading the constant. The
  empty-state early return goes with the query.
- Delete `listQuickServices` from `src/features/site-content/queries.ts`.
- Remove `"quick_services"` from the `SITE_BLOCKS` union in `src/types/index.ts` and its
  entry from `SITE_BLOCK_SPECS`. **Both, not just the spec** — `specFor` ends in a non-null
  assertion whose invariant is "every `SiteBlock` has a spec". Removing the spec alone
  would leave a union member that crashes it.
- `0022` deletes the rows: `delete from site_items where site_block = 'quick_services';`

**Documented drift.** Postgres cannot drop an enum value, so `quick_services` survives in
the SQL `site_block` enum and in `0021`'s `CHECK` as a branch nothing can reach. The TS
`SITE_BLOCKS` union therefore no longer mirrors the SQL enum exactly. This is recorded at
the top of `0022` and in `site-blocks.ts`, and it is the cheaper half of the trade against
recreating the type and rewriting every dependent object.

## 6. The map

`src/images/map/San Fernando Map.png`, supplied by the owner, replaces the `lh3`-hotlinked
placeholder in the contact page's Barangay Hall Location panel.

- Rename to `san-fernando-map.png` — spaces survive an import specifier but make every
  later reference quotable-only.
- `MAP_IMAGE` in `features/contact/data.ts` becomes a `StaticImageData` static import,
  bundled like `SITE.sealImage`. Not Storage: it is one file that changes when the barangay
  boundary changes, it has no admin surface, and bundling keeps it in the repo where the
  carousel sources already live.
- `map-section.tsx` swaps the CSS `background-image` div for `next/image` with `fill`, so
  the image is optimized and lazy. `role="img"` + `aria-label` collapse into `alt`.
- Drop `opacity-80 grayscale-20`. That treatment existed to make a stock placeholder
  recede; a real barangay map should be legible.

`Get Directions` beside it stays a `#` stub — wiring it needs coordinates nobody has
supplied. It is already on the §6.4 list in `BACKEND_HANDOFF.md`.

## 7. The hotline

`action-center-banner.tsx` dials `tel:911` under the label "Emergency Hotline: 911". The
barangay's real number is `(077) 600 1082`, already in `SITE.phone` and
`EMERGENCY_HOTLINES[0]`. Read it from `SITE.phone` for the label; dial
`tel:+63776001082`.

## 8. Removing the Dashboard Overview

The owner asked to remove the Audit Logs panel and Recent Drafts from the overview, and to
remove Dashboard Overview from the sidebar. With both panels gone and no nav entry, nothing
justifies the route as a destination.

**`/admin` becomes a redirect** to the first `ADMIN_NAV_ITEMS` entry the signed-in user may
reach, using the same predicate `AdminSidebar` filters with. Settings carries no permission
requirement, so a target always exists and the redirect cannot loop. A SuperAdmin lands on
Applications; an editor with only `manage-news` lands on News & Announcements.

Deleted with it: `content-hub.tsx`, `recent-drafts.tsx`, `audit-log-panel.tsx`,
`content-type-card.tsx`, the `ContentHub` barrel export, and `RECENT_DRAFTS` /
`DRAFT_STATUS_LABELS` / `CONTENT_TYPE_ACTIONS` from `features/admin/data.ts`, plus the
`ContentDraft` and `ContentTypeAction` types once nothing imports them. `ADMIN_USER` goes
too — it is already unreferenced, and its avatar is the last `lh3` hotlink in admin data.

`listRecentActivity` stays: `/admin/audit` is its real home and is untouched. Only the
dashboard's duplicate view of it is removed.

**Also removed:** the sidebar's **Emergency Response** button (a dead stub, carried on the
open-items list since the table-standards spec) and the top bar's **Notifications** and
**Help** buttons (dead stubs likewise). A control that never works teaches people to stop
trying controls.

## 9. The sidebar

Collapsible, grouped, same palette.

**Collapse.** A `sf-admin-sidebar` cookie holds `collapsed` / `expanded`. The portal layout
is already an async Server Component, so it reads the cookie and seeds the initial state —
a collapsed sidebar renders collapsed on first paint, with none of the flash a
`localStorage`-in-an-effect approach produces. A small client provider holds the live state
so the rail and the main column's left margin change together; the toggle writes
`document.cookie` so the choice survives a reload.

`AdminSidebar` becomes a client component. It currently splits the icon out of the nav item
before crossing into `NavLink` to keep a component off the RSC boundary; as a client
component it can hold `ADMIN_NAV_ITEMS` whole, and that workaround goes.

Collapsed is **72px**: icon only, centred, with the existing `Tooltip` primitive supplying
the label. Expanded stays **256px**.

**Grouping.** Thirteen flat items do not scan. `ADMIN_NAV_ITEMS` gains a `group` field and
renders under three labels:

| Group | Items |
| --- | --- |
| Requests | Applications, Incident Reports, Appointments, Assistance Requests, Inquiries |
| Content | News & Announcements, Event Calendar, Transparency, Officials, Site Content |
| System | Services Management, Audit Logs, Settings |

Group labels become hairline dividers when collapsed — a 72px rail has no room for a word,
but it does have room for the grouping. Permission filtering runs per group; a group with
no permitted items renders nothing, label included.

The flat order of this table also defines the `/admin` redirect target (§8).

**Styling, within the existing palette.** `ink-950` ground and amber accent are unchanged.
Rows tighten from `py-3` pills to 40px rows; the active state becomes a 3px amber left bar
plus `bg-white/10` rather than a full rounded pill, which reads better in a grouped list and
survives the 72px collapse. The user block moves into the footer space the Emergency button
vacates.

`AdminMobileNav` consumes the same grouped structure. It does not collapse — a drawer that
is already a drawer has nothing to collapse into.

## 10. The top bar

Restyled to match the public site's header, which is the modern one.

- The flat full-bleed white bar with a permanent bottom border becomes a floating rounded
  bar: `bg-white/80` with `backdrop-blur-md`, inset with padding, taking its border and
  shadow only once scrolled — the same scroll-state pattern as `SiteHeader`, and the same
  reason (chrome should assert itself only when content is behind it).
- **The title becomes the current page.** "San Fernando Admin" duplicates branding the
  sidebar already carries. Deriving the label from the pathname against `ADMIN_NAV_ITEMS`
  (longest matching `href`) means the bar answers where you are instead of where you
  obviously are. Falls back to "Admin" for any route with no nav entry.
- Bell and Help are deleted (§8). Global search and the profile / sign-out cluster stay.

`AdminTopBar` becomes a client component for the scroll listener. `SessionUser` is plain
data and crosses the boundary as a prop unchanged.

## 11. Risks

- **`0022` is the eleventh unapplied migration.** `0012`–`0021` are staging-only; this
  joins that queue. The officials enum change must reach an environment before any code
  writing `'members'` runs against it, or the insert fails on an unknown enum label.
- **`ADD VALUE` and same-transaction use.** Covered in §3 — the migration must not seed a
  `'members'` row.
- **The sidebar touches every admin page** through the layout. The collapse state and the
  main column's margin are one bug away from a portal-wide layout break, so both widths
  must be verified at both states.
- **Deleting the hub removes a route people may have bookmarked.** The redirect means the
  bookmark still works, landing somewhere useful rather than 404ing.
- **Quick Services reverting to code** loses the ability to edit those six cards without a
  deploy. That is the owner's explicit call, and it restores the pre-`0021` situation
  rather than inventing a new one.

## 12. Verification

Per `.claude/skills/verify/SKILL.md`, in the running app — no sub-project here is
verified by `npm run build` alone.

1. `npm run typecheck` && `npm run lint` && `npm run test:unit` clean.
2. **Publish an official from the row menu** with a portrait and alt text — row goes to
   Published, toast confirms, the public `/officials` page shows them.
3. **Publish one with no alt text** — an *error* toast states the reason. Repeat from the
   drawer and confirm the message is visible without scrolling.
4. **Create a new official and publish from the drawer** without closing it first.
5. Assign an official to **Members**, publish, confirm the fourth section appears on
   `/officials` below Administration and disappears when emptied.
6. Toggle **Active | Archived** on `/admin/officials` and confirm the table and filter bar
   do not jump.
7. `/admin` redirects: as SuperAdmin, and as an account holding exactly one module
   permission.
8. Collapse and expand the sidebar; reload at each state and confirm no flash and no gap
   or overlap beside the main column. Check `md` and below for the mobile nav.
9. `/contact` shows the real map; `/officials` dials `(077) 600 1082`; the home page's
   Quick Services cards are unchanged from today's rendering.
10. `/admin/site-content` has no Quick Services collection on the Home tab.
