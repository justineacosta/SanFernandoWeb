# Public-side UI/UX — Design

**Sub-project 10 of the portal overhaul.** Umbrella: `2026-07-22-portal-overhaul-design.md`
§4.1. Date: 2026-07-22. Status: **phases A, B and D shipped**. Phase D (§8) closed the two
theatre forms once the owner picked "build the backend"; migration `0019` is applied to
staging.

## 1. Why this exists

Sub-projects 2–9 are all admin work. The owner corrected the scope after 5 shipped:

> "improve also the UI/UX in the client side, I didn't mean to be at the Admin side only."

The portal is the tool; the public site is the product. Sub-project 5 built a set of
primitives — skeletons, a toast with tones, a focus ring, blur-then-live validation — and
stopped at the `/admin` boundary. This sub-project takes them across it.

## 2. What the survey found

Routes were read from `npm run build`'s route table; forms from the components themselves.

| Standard | Admin (after 5) | Public today |
| --- | --- | --- |
| Loading feedback | 12 × `loading.tsx` | **none** — 11 dynamic routes show the previous page until the server answers |
| Error boundary | — | **no `error.tsx` anywhere in the app** — a thrown query is an unstyled crash |
| Validation | blur-then-live, Zod-backed | server round-trip, one message for the whole form |
| Toasts | `useToast`, tones, ids | none |
| Focus ring | global `:focus-visible` | already inherits it ✅ |

**The eleven dynamic public routes** (`ƒ` in the route table): `/announcements`,
`/announcements/[slug]`, `/assistance/new`, `/complaints/new`, `/officials/[slug]`,
`/services`, `/services/apply/[slug]`, `/track`, `/transparency/legislative`,
`/transparency/legislative/[slug]`, `/transparency/uploads`. The rest (`/`, `/about`,
`/contact`, `/officials`, `/transparency`, `/appointments/new`) are static and need nothing.

### 2.1 The headline finding: two public forms are theatre

Not polish — correctness.

- **`inquiry-form.tsx`** (`/contact`) has no backend of any kind. It runs a 1200 ms
  `setTimeout`, calls `form.reset()`, and shows a green **"Message Sent!"**. Nothing is sent
  anywhere. There is no `contact` action file and no inquiries table in any migration.
- **`newsletter-form.tsx`** (news sidebar + footer) does the same: `setSubscribed(true)` and
  "You're subscribed. Salamat po!" against no store at all.

A resident types a real problem into the contact form, is told it was received, and waits
for a reply that cannot come. `BACKEND_HANDOFF.md` §3A/§3B has always listed these as
pending backend work, but the UI never said so — it claimed success instead.

**This needed an owner decision and was therefore not scoped in phases A–C.** The choice was
between building the inquiries/subscribers tables with an admin inbox (a migration, two
actions, two new admin surfaces), or making the forms honest by pointing residents at the
real hotline `(077) 600 1082`. **The owner chose to build the backend.** That is phase D,
specified in §8.

## 3. Decisions

### 3.1 `Suspense` on the list pages, `loading.tsx` on the detail pages

The portal answer — a `loading.tsx` per route — is the wrong one here, and reading the
pages shows why. Every public list route has the same shape:

```tsx
<PageHero title="…" description="…" />   {/* static, renderable instantly */}
<ServicesGrid />                          {/* async: awaits listServices() */}
```

A `loading.tsx` replaces the **whole page**, so the hero — which needs no data at all —
would flash as a grey block on every navigation. Wrapping only the async section in
`<Suspense>` paints the hero immediately and shimmers just the part that is actually
waiting. That is the App Router's own answer, and the async work is already isolated in
leaf components (`ServicesGrid`, `NewsFeed`, `NewsSidebar`, `LegislativeArchive`,
`UploadsBrowse`), so no restructuring is needed to get it.

`loading.tsx` is still right for the **detail** routes — `/officials/[slug]`,
`/announcements/[slug]`, `/services/apply/[slug]`,
`/transparency/legislative/[slug]` — where the page awaits the record before it can render
anything, including its own title. There is no instant part to protect.

`/track` gets neither: it is dynamic only because it reads `searchParams`, and `TrackLookup`
is a Client Component that fetches on submit. Nothing streams.

Skeletons are composed from `@/components/ui/skeleton` — the same primitives the portal
uses, so there is one set to maintain. They mirror the real layout and pulse only under
`motion-safe:`.

### 3.2 Two error boundaries, plus a global fallback

- `app/(public)/error.tsx` — branded, in the site's own type, with a **Try again** button
  wired to `reset()` and the real hotline as the fallback route to a human.
- `app/admin/(portal)/error.tsx` — the same shape inside the portal chrome.
- `app/global-error.tsx` — minimal and self-contained, because a crash in the root layout
  bypasses both of the above and renders its own `<html>`.

Error boundaries are Client Components by requirement. None of them show `error.message`:
that string can carry Postgres detail, and the boundary is public. The `digest` is shown so
a report can be matched to a server log.

### 3.3 Validation schemas move out of the `"use server"` files

The four ticket schemas are good — resident-facing messages, sensible caps on
unauthenticated free-text columns — but they live inside `"use server"` modules, which may
only export async functions. A client component cannot import them, which is exactly why
the forms have no inline validation.

Each moves to a plain `schema.ts` beside its action (`features/complaints/schema.ts`, …),
imported by both. **The server keeps validating; nothing about the trust boundary changes.**
Server Actions are public HTTP endpoints and remain the authority. What changes is that the
client can now show the same message *before* the round trip, and the two cannot drift
because there is one definition.

Validation is **blur-then-live**, matching §3.8 of the table-standards spec: a field
validates when it loses focus, and once it holds an error it re-validates on every change so
the message clears the moment it is fixed. Nobody is shouted at halfway through typing an
email address.

### 3.4 Field errors are announced, not just coloured

Each invalid field gets `aria-invalid`, an `aria-describedby` pointing at its message, and
the message in `role="alert"`. On a failed submit, focus moves to the first invalid field —
on a long form like `/complaints/new` the current single error at the top is easy to miss on
a phone.

### 3.5 The ticket receipt keeps its current design

The four ticket forms already swap to a receipt with the ticket number and a copy button,
and they already guard double-submit with a ref because `isPending` commits too late. Both
are good and stay. This sub-project only adds inline validation ahead of them.

## 4. Sequence

| Phase | Content | Verifiable by |
| --- | --- | --- |
| A | Seven `loading.tsx`, three error boundaries | throttled navigation; a forced throw |
| B | Schemas extracted; blur-then-live + ARIA on the four ticket forms and `/track` | browser drive of each form |
| C | Mobile pass at 375 px on the four ticket forms and the receipt | screenshots at 375/768/1440 |
| D | The two theatre forms get a real backend (§8) | a row in the DB, and staff answering it |

## 5. Risks

- **Moving a schema out of a `"use server"` file changes what that module exports.** The
  action must keep importing it, and the extraction must be verified by the existing server
  path still rejecting bad input — not just by the client path accepting good input.
- **Error boundaries swallow crashes in development too**, which can hide a real bug behind
  a friendly page. Each is written to log to the console before rendering.
- **`/appointments/new` is static** but its sibling forms are dynamic. Adding a `loading.tsx`
  where nothing streams would render a skeleton that never shows; the route list in §2 is
  the authority on which routes get one.

## 6. What the browser confirmed

- **The Suspense decision holds.** `/services` renders 30 pulsing blocks while its `h1`
  already reads "Official Services Directory"; likewise for news, the legislative archive,
  and uploads. A route-level `loading.tsx` would have greyed those headings out.
- **The error boundary is real.** Forcing `listServices()` to throw renders the branded page
  inside the site chrome, with the working hotline and a reference code, and the raw message
  does not appear anywhere in the DOM.
- **Validation speaks before the network does.** Submitting an empty form on all four routes
  at 390 px: 8 / 6 / 6 / 6 messages, the same count of `aria-invalid` fields, focus on the
  first invalid one, **zero POSTs fired**, no horizontal overflow, and typing into the
  focused field clears its state without another submit.
- A field that has never been blurred stays silent even while invalid — checked on the
  complaint narrative.

Phase C folded into B: the forms were already responsive, and the 390 px runs above are the
mobile pass. Nothing needed changing.

## 7. Open items

- The sidebar's **Emergency Response** button is still a dead stub (carried from the
  table-standards spec §9).
- **Inquiries are not in the global admin search.** `search_admin_global` is a Postgres
  function (migration `0018`); adding a branch means another migration. Deferred rather than
  spent on its own — the inbox has its own fuzzy search over name, email and message body.
- **No email goes out.** Neither the resident nor the barangay is notified when an inquiry
  arrives; staff have to open the inbox. That is 2D (Resend), and it is what makes the
  "within 24-48 business hours" promise on /contact real.

## 8. Phase D — the inquiries backend

### 8.1 What was built

Migration `0019` adds two tables, both with RLS enabled and zero policies like every other
table: `inquiries` (the identity block minus the address, plus `subject`, `message`, a
`staff_note`, and `handled_by` as `ON DELETE SET NULL`) and `alert_subscribers`.

- `src/features/contact/{schema.ts,actions.ts}` — `inquirySchema` shared by the form and
  `submitInquiry`, which rate-limits (5/hour/IP, the complaint budget), validates, and
  inserts through the service-role client.
- `src/features/announcements/actions.ts` — `subscribeToAlerts`.
- Admin: a new `handle-inquiries` permission, `/admin/inquiries`, `listInquiries`,
  `updateInquiry`, and an inbox built from the sub-project 5 primitives — `RowActions` on
  the row, `SortableTh`, `AdminFilterBar`, a `loading.tsx`, and `?review=` deep-linking.

### 8.2 Decisions

**The email is required here, unlike the ticket forms.** On `/apply` an email is a courtesy:
the resident already holds a ticket number and can track the request without one. An inquiry
has no ticket and nothing to track — the reply address is the entire mechanism, so a message
with no way back is the defect this phase exists to fix.

**No ticket number, and `/track` is untouched.** Handing back a number that `/track` cannot
find would be the same false reassurance in a new shape.

**Mobile numbers are normalised before storage.** `0917…`, `+63 917…` and `9175550101` name
the same phone. The unique index only prevents duplicate SMS if they are stored identically,
so `normaliseMobile` collapses all three to one form and returns null for anything else.

**No delete on an inquiry, only close.** Spam gets `closed`; nothing lets a staff member
make a resident's message disappear with no record it arrived. This is the one place the
table-standards rule ("destructive actions belong on the row") is answered with "there is no
destructive action".

**Status moves are not guarded in the WHERE clause**, unlike the ticket queues. There is no
resident-visible state machine and no irreversible side effect at either end, so an inquiry
closed by mistake is reopened by picking "New" again. A transition guard here would cost
staff the ability to correct themselves and buy nothing.

**`in_progress` keeps the enum's underscore** rather than being translated to the hyphenated
form the ticket statuses use. Spelling it two ways would mean mapping on every read and every
write to win nothing but symmetry.

**Consent is enforced but not stored.** `consentField` rejects a submission without it, so a
row can only exist if the box was ticked — a column that can only ever hold `true` records
nothing that the row's own existence does not. `created_at` carries the when. If the
barangay's DPA reading wants the flag written down anyway, that is a one-column migration.

### 8.3 What the browser confirmed

- `/contact` at 390 px, empty submit: **5 messages, 5 `aria-invalid` fields, focus on the
  first, zero POSTs**. Typing a valid email cleared its state without another submit.
- A real send persisted a row and swapped to a "Message received" card naming the address
  the reply goes to. `+63 917 555 0101` on the alert form stored as `09175550101`.
- The inbox rendered the row, the kebab moved it to In Progress in one click with a toast,
  and the drawer saved a note plus "Answered" — writing `handled_by`, `handled_at`, and two
  `audit_log` entries (`update` "took up inquiry", then `approve` "answered inquiry").
- Both probe rows were deleted afterwards; staging is clean.
