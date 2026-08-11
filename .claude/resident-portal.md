# Resident-facing site

The public routes in `src/app/(public)/`. Data model: `.claude/database.md`. Anti-abuse:
`.claude/security.md`. Visual conventions: `.claude/ui-ux.md`.

## Service cards route by an explicit `flow` column, never by inferring it from `tone`

`services.flow` (migration `0035`) replaced the old inference where `tone === 'danger'` meant
the complaint form and anything else meant the document-application form — that scheme had
no room for a third destination.

- `ServiceFlow` (`@/types`) is the union. `serviceHref` (`src/features/services/flow.ts`) is
  pure, takes a structural `{id, flow}`, and switches **exhaustively with no `default`**, so
  a fifth flow added to the union without a route added here is a compile error rather than
  a silent fallthrough to the apply page.
- `Service` and `AdminServiceRow` both carry `flow`, populated by all three query mappers
  (`listServices`, `getApplyService`, `listServiceCatalog`).
- **Three guards read `flow`, not one, and the two that get missed are the write paths.**
  `getApplyService` is the obvious one; `submitApplication` (a **public** Server Action a
  browser can hit directly, whatever any page links to) and `createWalkInApplication` (where
  `process-applications` gates *who* may call it but nothing gated *which* service row the
  drawer submitted) carried the identical tone-based gap. Before the fix, a `serviceId:
  "social-services-assistance"` request to either returned a real ticket number for a
  document application that does not exist. Tone could not stay the gate: both new catalog
  rows are tone `primary`.
- **All three read `flow` off a `.select()` that must name the column explicitly.** Drop it
  from any one and `service.flow` reads `undefined`, `undefined !== "apply"` is `true`, and
  every application on the site starts getting rejected silently, with no line anywhere that
  looks wrong in review.
- `tone` now decides only the card's visual variant (`isDanger ? "outline-danger" :
  "primary"`); `serviceHref(service)` alone decides the href.

## The four ticket flows

All four open with the identity block from `residentFields` (`src/lib/public-forms.ts`).
Applications additionally collect a middle name and date of birth — see
`.claude/database.md`, and note those two schemas deliberately live in
`src/features/services/schema.ts` instead.

Every public submission is Turnstile-gated **first**, then rate-limited, then Zod-validated.

**Three of the four accept attachments at filing — `apply`, `complaint`, `assistance` —
appointments deliberately do not.** All three share one picker, `TicketFileField`
(`src/components/shared/ticket-file-field.tsx`), and one upload sequence,
`src/lib/ticket-attachments.ts` (`.claude/storage.md`).

### `/track`

`lookupTicket` matches a ticket number **plus the surname** — ticket numbers are sequential
and guessable, which is the entire reason the gate exists. The timeline it renders comes
from `ticket_updates` filtered `.eq("visibility","public")` in the query layer.

**The intake entry's `authorKind` is `"resident"` for all four public filing flows
(`apply`, `complaint`, `assistance` via `src/lib/ticket-attachments.ts`; `appointment` via
`src/features/appointments/actions.ts`, direct since appointments accept no attachments) and
`"staff"` (plus the encoder's name) for all four walk-in equivalents** — `applications.ts`,
`complaints.ts` and `assistance.ts` in `src/features/admin/actions/` via the same shared
module, and `createWalkInAppointment` in `src/features/admin/actions/appointments.ts` writing
directly, same as its public counterpart (2026-08-11). `"system"` is reserved for genuinely
machine-written status transitions with no human author — the review/status-change entries in
`src/features/admin/actions/{applications,complaints,assistance,appointments}.ts` and
`ticket-updates.ts`'s own writes. This applies even within `appointments.ts` itself: its other
two `recordTicketUpdate` calls (review take-up, completion) are genuine status transitions and
correctly stay `"system"` — only its walk-in *intake* entry is human-authored and carries
`"staff"`. `src/features/track/components/ticket-timeline.tsx` branches only on `entryType`,
never on `authorKind`, so this never reaches a resident-facing label — the admin drawer
(`.claude/admin-cms.md`) is the only surface that renders it.

Resident replies flip a ticket from `awaiting-info` back to `under-review`. `canReply()`
(`src/lib/ticket-updates.ts`) **only opens a reply on `awaiting-info`** — copy anywhere else
must not tell a resident to "reply on the Track page" unless the ticket is in that status.
`TICKET_ATTACHMENT_WARNING` (`src/lib/ticket-attachments.ts`) is the live example: a
freshly-filed request is `pending`, so that instruction would be false the instant the
warning can show.

`submitTicketReply` returns the refreshed `TicketLookupResult` directly (via a
`buildTicketResult` helper shared with `lookupTicket`) rather than having the client re-run
the lookup: `track-lookup.tsx` nulls its Turnstile token the instant a lookup succeeds, so a
second round trip would show a CAPTCHA error right after the reply worked.

Attachments: private `ticket-media`, 3 files × 2 MB — see `.claude/storage.md`. The picker is
the shared `TicketFileField` (`src/components/shared/ticket-file-field.tsx`, added
2026-08-11) — every ticket-filing surface that accepts attachments renders it rather than
duplicating the input (`TicketReplyForm` here on `/track`; the `apply`, `complaint` and
`assistance` filing forms below and their walk-in equivalents, `.claude/admin-cms.md`); an
oversized image is downscaled in the browser (`downscaleImageFile`,
`src/lib/downscale-image.ts`) instead of rejected. Send/Submit is disabled while the field's
`error` is set, and additionally while it reports `preparing` (downscaling in flight) — the
parent form owns both booleans, the component only reports them. `.claude/frontend.md`'s
error-banner section, not this file, owns the gating convention.

### `/appointments/new`

**Coarse demand hint, computed server-side once at render.** `AppointmentDemand` (`@/types`)
is `Record<YYYY-MM-DD, {am, pm}>` of `DemandLabel`, tallied in JS over the next 60 days
(`HORIZON_DAYS`) rather than via an RPC — small result set, no new SQL function to maintain.
Declined and completed requests are excluded; neither still occupies staff time.

- **Split across two modules on purpose.** `src/features/appointments/demand.ts` exports the
  pure `demandLabel(count)` (`Light` < 3, `Moderate` < 6, `Busy` ≥ 6, named constants) with
  no imports beyond types, because Vitest runs with no jsdom and no React renderer and a
  transitive Supabase-client import would break that environment.
  `src/features/appointments/queries.ts` holds the DB half, `loadAppointmentDemand()`.
- **Only `Light`/`Moderate`/`Busy` ever crosses into `AppointmentDemand`, never a number.**
  The map is a prop threaded into the client component `AppointmentForm`, so it serializes
  whole into the RSC payload — a raw count would publish the barangay's exact 60-day volume
  in page source even though nothing displays it. The coarsening has to happen server-side
  **before the map crosses the boundary**, not merely before the UI renders it.
- **A date absent from the map renders no hint at all, never "Light"**
  (`AppointmentForm`'s `slotLabel === undefined` check) — absence of data and genuine quiet
  look identical in the map, and only one of them is a claim worth making to a resident.
- **`export const dynamic = "force-dynamic"` in `page.tsx` is load-bearing, not
  decoration.** `loadAppointmentDemand` uses the service-role client, which calls no Next.js
  Dynamic API — unlike the cookie-bound client every other public query uses, which forces
  dynamic rendering as a side effect of reading the session cookie. Without the export,
  `next build` prerenders the route static (confirmed: it printed `○` before the fix),
  freezing the demand map and `manilaToday()` at build time forever. It would still work in
  `npm run dev` and be silently dead a day after a production deploy.
- It uses the service-role client for a second reason: `appointments` is RLS-policy-less, so
  the anon client silently returns zero rows with no error to catch.

**The weekend rule is one declaration, client and server both.** `isClosedDay`
(`src/lib/office-days.ts`) is wired in as a `.refine()` on `appointmentSchema`, so
`AppointmentForm`'s inline validation and `submitAppointment`'s check run the identical
function rather than two copies that can drift.

- **It reads the weekday via `getUTCDay()`, never `getDay()`** — a `YYYY-MM-DD` string
  parses as UTC midnight, so the UTC weekday IS the calendar weekday everywhere, while
  `getDay()` shifts by one for negative-offset viewers. Its unit test asserts the
  *mechanism* (it spies that `Date.prototype.getDay` is never called), not a date outcome,
  because a date-based assertion behaves identically under the correct and the buggy
  function on any runner at UTC+0 or east of it — which is both this project's CI and its
  entire Manila audience.
- **The appointment date defaults to `nextOpenDay(manilaToday())`, not today.** The field's
  `min` is still today — only the pre-filled value skips the weekend, since
  `appointmentSchema`'s `isClosedDay` refine would otherwise reject the form's own default
  every Saturday and Sunday.
- **Deliberately NOT applied to the walk-in path or the review drawer's `confirmedDate`** —
  staff may legitimately schedule a weekend special session.
- **Public holidays are out of scope**: there is no holiday table and building one is its
  own feature.
- The "Before you book" card mirrors `apply-form.tsx`'s requirements card, reading its
  office-hours line from `SITE.officeHours` rather than a second hardcoded copy. The
  `PURPOSE_PRESETS` chips are each a bare `<button type="button">` — load-bearing, since a
  `<button>` inside a `<form>` with no explicit `type` submits it — and `applyPreset` fills
  the purpose field when empty and **appends on a new line otherwise**, so a chip tap never
  destroys text a resident already typed. Per design §5.3, it also returns focus to the
  textarea with the caret at the end (via a ref and `requestAnimationFrame`, deferred a tick
  so the selection isn't clamped to the controlled value's pre-update length).

### `/assistance/new`

Per-category guidance comes from `assistance_categories.description`/`.requirements`
(migration `0035`), editable in the admin portal. **An empty category renders nothing** —
the "What to prepare" card is gated on `selected.description ||
selected.requirements.length > 0`, which is what let this ship before any category had real
guidance text written.

Attachments at filing needed **no new schema** — true of `assistance`, and now true of
`apply` and `complaint` too: `recordTicketUpdate` already accepted an `attachments` array,
and the path allow-list already covered all four ticket prefixes. `submitAssistance`,
`submitApplication` and `submitComplaint` each call the shared `recordIntakeWithAttachments`
(`src/lib/ticket-attachments.ts`), not the reply machinery directly — it is that module, not
any one form, that owns the upload-then-timeline-write sequence. Ordering and failure
handling: `.claude/storage.md`.

`SubmitAssistanceResult extends SubmitTicketResult` rather than widening the shared type —
the base has two other callers (`submitAppointment`, `submitComplaint`; applications use
their own `SubmitApplicationResult`) and neither should carry a field that is inert for
them.

## Feedback is anonymous, and that shapes everything about it

The floating widget stores no name, email or IP, so there is **no consent field, no reply
path and no `/track` entry** — `/contact` stays the channel for anything needing an answer.
Screenshots go to the private `feedback-media` bucket behind ten-minute signed URLs, because
a screenshot can contain the sender's own account page.

The widget is mounted **once in `PublicShell` as a sibling of the header** — nesting it
inside the `backdrop-filter` chrome would break its `position: fixed`.

## Content pages

| Route | What it is |
|---|---|
| `/announcements` | 3-item News teaser (newest featured + 2 grid cards) with `NewsSidebar` (Announcements + Emergency Hotlines) |
| `/news` | full chronological news archive — no sidebar, no featured card, every article a plain `NewsCard` in a 3-column grid, `ARCHIVE_BATCH = 6` |
| `/notices` | full announcements archive, `NOTICES_ARCHIVE_BATCH = 6`, detail pages at `/notices/[slug]` |
| `/events` | "Community Calendar": unpaginated Upcoming (`event_date >= today`, soonest first) + paginated Past archive (`EVENTS_ARCHIVE_BATCH = 6`). No detail page, no calendar-grid UI |

- All three archives use the same offset/limit **client-side "Load More"** (not
  URL-addressable pages) and a **secondary sort key as tiebreaker** —
  `published_at desc, id desc`, `date desc, id desc`, `event_date desc, id desc` — which
  prevents duplicate React keys across batches.
- Each batch constant is defined once in its feature's `queries.ts` and is **independent** of
  the others.
- `/notices/[slug]` mirrors `/announcements/[slug]`'s template (Urgent badge instead of
  category, single image instead of `PhotoGallery`, no author line). `saveAnnouncement`'s
  slug handling mirrors `saveNewsArticle` exactly — locked once published, `slugify()` + a
  `-2`/`-3`… uniqueness suffix otherwise.
- **Revalidate detail pages as a path *pattern*, not one slug.** Both `announcements.ts`'s
  and `news.ts`'s shared `revalidate()` helpers call `revalidatePath("/notices/[slug]",
  "page")` / `revalidatePath("/announcements/[slug]", "page")`, so every action routing
  through them — save, publish, archive, restore, delete — invalidates every detail page in
  one call. Both had the same gap originally; a per-slug revalidation misses the others.
  `actions/events.ts`'s helper calls `revalidatePath("/events")` alongside `/admin/events`
  and `/`.

## `NewsletterForm` is no longer rendered anywhere

Both mount points were removed 2026-08-05 on request (`SiteFooter`'s "Stay Notified" panel
and `NewsSidebar`'s card variant). **The component, both its variants, and
`subscribeToAlerts` are all still in the repo, simply unreferenced** — deliberately kept in
case signup returns somewhere else.

Practical effect: **the public site has no alert-signup entry point at all**, so
`alert_subscribers` stops gaining rows. Nothing dispatches to that table anyway, so this
costs a collection path, not a working notification feature. `subscribeToAlerts` remains a
live public Server Action with no UI in front of it — still Turnstile-gated and
rate-limited like the other seven, so it is an orphan, not a hole.

**The consequence worth knowing is in the tests, not the UI** — see `.claude/testing.md`.

## The site has no social links at all

`SOCIAL_LINKS` (`src/constants/site.ts`) and the `SocialLink` interface are **deleted, not
emptied** — an empty array would have left two render blocks silently drawing nothing. Both
consumers lost their markup too: `SiteFooter`'s icon row under the seal/description column
and `ContactDetails`' entire "Follow Us" section including its `border-t` divider. The
barangay's real Facebook page is `https://www.facebook.com/brgy.onse.san.fernando` if a link
is ever wanted back; the other three entries were always `href="#"` placeholders.
