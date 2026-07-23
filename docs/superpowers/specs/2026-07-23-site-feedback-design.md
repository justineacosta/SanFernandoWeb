# Site feedback: a floating public widget and a second admin tab

**Date:** 2026-07-23
**Scope:** new `supabase/migrations/0023_feedback.sql`; new `src/features/feedback/`; new
`src/components/ui/tab-pills.tsx`; `src/components/layout/public-shell.tsx`;
`src/features/admin/components/inquiries-manager.tsx` (split into panels);
`src/features/admin/{data,search-modules}.ts`; `src/constants/permissions.ts`;
`src/app/admin/(portal)/inquiries/page.tsx`; `src/types/index.ts`
**Status:** design approved

## Problem

There is no way for a resident to tell the barangay that this website is broken. The one
inbound channel, `/contact`, is for barangay business: it demands a first and last name, an
email, a Data Privacy Act consent tick, and a subject from a five-item list about documents
and assistance. Reporting a dead download link means filling in a form that reads like a
request for a certificate, and staff then read it in a queue whose whole shape — "answer this
person" — is wrong for "your PDF 404s".

Two additions:

1. A **floating feedback button on every public page**, opening a short anonymous form for
   feedback about the site itself.
2. The admin nav's **Inquiries** entry becomes **Inquiries & Feedback**, with the new queue as
   a second tab on the page that already exists.

## Decisions taken before design

| Question | Answer |
| --- | --- |
| What is it for? | Feedback about **this website** — bugs, broken pages, suggestions, praise. Not barangay services; that is what `/contact` is for. |
| Identity | **Fully anonymous.** No name, no email, no account link. |
| Fields | Subject line, star rating, automatically captured page path, and a screenshot attachment — all four. |
| Admin shape | **Two tabs on one page**, under the existing `handle-inquiries` permission. |
| Trigger | Bottom-right circular button that expands to a labelled pill on hover/focus. |
| Where it appears | Every public page. Not the admin portal. |

## Approach

A **separate `feedback` table**, not a `kind` discriminator on `inquiries`.

An inquiry is named, consented, and owed a reply. Anonymous feedback is none of those three.
Sharing one table would force `first_name`, `last_name` and `email` to become nullable —
weakening the constraint in the one queue where staff must be able to write back — and would
leave `rating`, `page_path` and `screenshot_path` null on every inquiry row ever written. Two
tables, one page, one permission.

## Design

### 1. Data — migration `0023_feedback.sql`

```sql
create type public.feedback_category as enum ('general','bug','feature','complaint','praise');
create type public.feedback_status  as enum ('new','in_progress','resolved','dismissed');

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  category public.feedback_category not null default 'general',
  subject text not null,
  message text not null,
  -- Null means "not given": the rating is optional, and 0 would drag every average down.
  rating smallint check (rating between 1 and 5),
  -- The page the resident was on. Path only, never the query string: a path is
  -- context, a query string can carry a token or a search term someone typed.
  page_path text not null default '',
  -- `feedback/<uuid>.<ext>` in the private feedback-media bucket. Null when none.
  screenshot_path text,
  status public.feedback_status not null default 'new',
  staff_note text not null default '',
  -- Nullable, ON DELETE SET NULL: deleting a staff account must not delete the report.
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_status_created_idx on public.feedback (status, created_at desc);
alter table public.feedback enable row level security;   -- zero policies, like every table
create trigger feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
  values ('feedback-media', 'feedback-media', false)
  on conflict (id) do nothing;
-- Deliberately NO read policy. The service-role client is the only reader.
```

Three choices worth defending:

**No PII, anywhere.** No name, no email, and the caller's IP is used for rate limiting but
never stored. That removes the DPA consent checkbox — there is no personal data to consent to
the processing of — and leaves nothing in the table to leak. The cost is real and accepted:
**staff can never follow up on a report.** A bug report that needs a reproduction step will
never get one. In exchange, the barrier to reporting is a single click.

**Statuses reuse labels `StatusChip` already maps.** `new`, `in_progress`, `resolved` and
`dismissed` are all present in `LABELS`/`TONES` in
`src/features/admin/components/status-chip.tsx`, so the chip and the `AdminStatus` union need
no edit. `answered` — the inquiry queue's success state — would be a lie on a row nobody can
answer; `resolved` is the honest one, and `dismissed` (already the danger tone) is the spam
terminal.

**`feedback-media` is private**, unlike `public-media` and `public-documents`. A screenshot of
the page a resident was looking at can contain their own account page, their ticket, or their
name; a public bucket would make it readable by anyone holding the URL forever. Admin reads it
through a signed URL minted server-side in the query layer (10-minute expiry), so no
long-lived link exists.

A new constant `FEEDBACK_MEDIA_BUCKET` joins `src/lib/storage.ts`, alongside a
`feedbackScreenshotPath()` helper matching `newsPhotoPath`'s shape. Signing lives in the
feedback query module, not in `storage.ts`, because it needs the admin client.

### 2. Types — `src/types/index.ts`

```ts
export type FeedbackCategory = "general" | "bug" | "feature" | "complaint" | "praise";
export type FeedbackStatus = "new" | "in_progress" | "resolved" | "dismissed";

/** The widget's body. Files travel separately, in FormData. */
export interface PublicFeedbackValues {
  category: FeedbackCategory;
  subject: string;
  message: string;
  /** 0 means "not rated" across the client boundary; stored as null. */
  rating: number;
  pagePath: string;
}

export interface FeedbackRow {
  id: string;
  category: FeedbackCategory;
  categoryLabel: string;
  subject: string;
  message: string;
  rating: number | null;
  pagePath: string;
  /** Signed URL, valid ~10 minutes, or null when no screenshot was attached. */
  screenshotUrl: string | null;
  status: FeedbackStatus;
  staffNote: string;
  handledByName: string | null;
  handledAt: string | null;
  submittedAt: string;
}

export interface FeedbackUpdateValues {
  status: FeedbackStatus;
  staffNote: string;
}
```

`FeedbackStatus`'s four members are already in `AdminStatus`, so that union is unchanged.

### 3. The public widget — `src/features/feedback/`

```
src/features/feedback/
  data.ts                          FEEDBACK_CATEGORIES, feedbackCategoryLabel()
  schema.ts                        Zod v4 schema, shared by form and action
  actions.ts                       "use server" — submitFeedback(FormData)
  components/feedback-launcher.tsx "use client" — trigger + panel state
  components/feedback-panel.tsx    "use client" — the modal and the form
  components/star-rating.tsx       "use client" — the 1–5 control
  index.ts                         barrel, in mount order
```

Mounted once in `src/components/layout/public-shell.tsx`, after `<SiteFooter />`:

```tsx
<SiteHeader />
<main className="flex-grow">{children}</main>
<SiteFooter />
<FeedbackLauncher />
```

`PublicShell` is a Server Component rendering a client child — the normal arrangement here.
Mounting in the shell rather than per page means every public route gets it and the admin
portal, which has its own layout, gets none.

#### 3.1 Categories — `data.ts`

Five, matching the reference design and each carrying a Lucide icon for the chip:

| value | label | icon |
| --- | --- | --- |
| `general` | General | `MessageSquare` |
| `bug` | Bug Report | `Bug` |
| `feature` | Suggestion | `Lightbulb` |
| `complaint` | Complaint | `Frown` |
| `praise` | Praise | `Heart` |

"Suggestion" rather than "Feature Request": residents are not filing tickets against a
backlog. `feedbackCategoryLabel(value)` falls back to the raw value, mirroring
`inquirySubjectLabel`, so a renamed category does not blank an old row.

#### 3.2 Validation — `schema.ts`

Zod **v4**. One schema, used by `useFieldValidation` on the client and re-run inside the
action, because a Server Action is a public HTTP endpoint.

| field | rule |
| --- | --- |
| `category` | `z.enum` of the five values |
| `subject` | trimmed, 4–120 chars |
| `message` | trimmed, 10–1000 chars |
| `rating` | int 0–5; `0` normalised to `null` on insert |
| `pagePath` | ≤ 200 chars, must start `/`, query and hash stripped before submit |

The screenshot is **not** in the schema: `File` state lives outside the values object, exactly
as in every other uploader here. The action checks it separately.

#### 3.3 The trigger — `feedback-launcher.tsx`

A `fixed bottom-6 right-6 z-40` button. `z-40` sits under the header's layer and well under
the dialog layer (`z-70`), so it never floats over the panel it opened. It renders as a
`h-14 w-14` amber circle (`bg-brand-500 text-ink-900`, `shadow-floating`) with a
`MessageSquarePlus` icon, and grows to a labelled "Feedback" pill on hover and on
`focus-visible`, so a keyboard user gets the same disclosure a mouse user does.

The growth is **CSS only** — a `max-width` transition on the label span at
`--duration-quick`, under the three-pattern system. It is a micro-interaction, not something
CSS cannot do, so Motion stays out of it. Below `sm` the label never expands: a phone has no
hover and the pill would cover content.

The button is `aria-haspopup="dialog"`, hidden (`pointer-events-none opacity-0`) while the
panel is open, and takes focus back when the panel closes.

No ancestor of the launcher carries `backdrop-filter` — it is a sibling of the header, not a
child — so its `fixed` positioning resolves against the viewport. This is the trap recorded
for the chrome bars; mounting the widget inside `SiteHeader` would reintroduce it.

#### 3.4 The panel — `feedback-panel.tsx`

Follows `src/components/ui/confirm-dialog.tsx` structurally, because that component already
solved this once: `MotionConfig reducedMotion="user"` → `AnimatePresence` → scrim
(`bg-ink-950/50`, `FADE_QUICK`) + panel (`POP`), `role="dialog"` with `aria-modal`, focus trap
on Tab, Escape to close, `document.body.style.overflow` locked while open, focus restored to
the trigger on unmount. Springs come from `src/lib/motion.ts`; none are inlined.

`role="dialog"`, not `alertdialog`: this interrupts nothing and decides nothing.

Layout, in the site's own tokens — `rounded-3xl bg-white shadow-floating`, Space Grotesk
heading, ink body text:

```
┌──────────────────────────────────────────────┐
│ ▢  Send Feedback                          ✕  │   ▢ = brand-100 icon tile
│    Anonymous — we cannot reply                │
├──────────────────────────────────────────────┤
│ Category                                     │
│ (General) (Bug Report) (Suggestion)          │   chips, wrap freely
│ (Complaint) (Praise)                         │
│ Subject            [____________________]    │
│ Message            [____________________]    │
│                    [____________________]    │
│                              124/1000        │
│ Screenshot (optional)  [ Choose image ]      │
│ Overall experience (optional) ☆ ☆ ☆ ☆ ☆     │
│                          Cancel  [ Send ]    │
└──────────────────────────────────────────────┘
```

The subtitle reads **"Anonymous — we cannot reply"**, not the mock's "No account needed". The
mock's line is an invitation; ours is the one fact a resident needs before typing, since they
will otherwise wait for an answer that cannot come. The reference's "Sign in for up to 2,000
characters" line is dropped: signing in changes nothing here.

Selected chip: `bg-brand-500 text-ink-900`. Unselected: `border-ink-200/70 text-ink-600`. The
group is a radio group, not five buttons, so arrow keys work.

On phones the panel is a bottom sheet — full width, `rounded-t-3xl`, `max-h-[85vh]` with the
body scrolling inside it, so the keyboard never buries the Send button.

#### 3.5 The star rating — `star-rating.tsx`

Five `role="radio"` buttons in a `role="radiogroup"`, labelled "1 star" … "5 stars". Hovering
or focusing fills up to that star; the current value stays filled. Clicking the current value
clears it back to "not rated" — the field is optional and a mis-click must be undoable.
Arrow keys move, Escape does not close the dialog while focus is inside the group.

#### 3.6 The screenshot picker

A **pure file picker making no network call**, per the transactional-uploads rule. It holds one
`File` in state, renders a thumbnail from `URL.createObjectURL` (revoked on unmount and on
replace, or the page leaks the blob), shows the file name and size via `formatFileSize`, and
offers Remove. Constraints, enforced here for the message and again in the action for real:
one image, `image/jpeg | image/png | image/webp`, ≤ 2 MB — the same `ALLOWED_IMAGE_TYPES` /
`MAX_IMAGE_BYTES` every other image obeys.

#### 3.7 The action — `actions.ts`

```ts
export async function submitFeedback(form: FormData): Promise<SubmitFeedbackResult>
```

`FormData`, not a values object, because a `File` has to travel. Unauthenticated, using the
service-role client, so the action *is* the gate:

1. **Rate limit first**, before parsing: `checkRateLimit("feedback:" + ip, 3, 60 * 60 * 1000)`.
   Three per hour, tighter than the inquiry form's five — a site bug is rarer than a question,
   and this endpoint accepts a file upload from nobody in particular.
2. Parse the scalar fields out of the FormData and `safeParse` them. Return the first issue's
   message.
3. If a screenshot is present, validate type and size, then upload to `feedback-media` under
   `feedback/<uuid>.<ext>`.
4. Insert the row. **If the insert fails, delete the object** and return the error — the
   `fail()` compensating-delete shape from `saveLegislative`, so "an object exists only if a
   row references it" holds by construction.
5. Never read anything back. Nothing is revalidated: no public page renders feedback.

No ticket number in the result, for the same reason `submitInquiry` returns none — handing back
a reference that nothing can look up is a lie in a new shape. The panel's success state
replaces the form in place: a `CheckCircle2` in `text-brand-500`, "Thank you — this reached
the barangay", and two buttons, "Send another" and "Close".

### 4. Admin — `Inquiries & Feedback`

#### 4.1 Naming and permission

- `ADMIN_NAV_ITEMS` in `src/features/admin/data.ts`: label `Inquiries` → **`Inquiries & Feedback`**
  (`&`, matching "News & Announcements"). Route, icon, permission and group unchanged. The
  sidebar, the mobile drawer, the `/admin` redirect and `adminPageTitle` all read this table,
  so they update for free.
- `generateMetadata` in the page: `gatedMetadata("handle-inquiries", "Inquiries & Feedback")`.
- `PERMISSION_LABELS["handle-inquiries"]`: "Answer contact inquiries" → **"Answer inquiries &
  site feedback"**. `PERMISSION_GROUPS` and `STATUS_PRESETS` are untouched — the staff preset
  already grants `handle-inquiries`, which now also means feedback. That is intended: whoever
  works the inbox works this queue.

One permission for both tabs, deliberately. A second permission would let an account see the
page but only half of it, and the nav has one entry.

#### 4.2 A shared tab primitive — `src/components/ui/tab-pills.tsx`

The pill strip is written out three times inside `transparency-manager.tsx` (lines 307–351),
once per tab. Rather than copy it a fourth time, extract it:

```tsx
interface TabPillsProps<T extends string> {
  tabs: { value: T; label: string; icon: LucideIcon }[];
  value: T;
  onChange: (next: T) => void;
  /** Names the strip for assistive tech, e.g. "Inbox queue". */
  label: string;
}
```

It keeps the existing markup exactly: `role="tablist"` with `role="tab"` children and
`aria-selected`, inside its own `max-w-full overflow-x-auto no-scrollbar` wrapper so a wide
strip scrolls itself instead of panning the document on a phone — the fix made in the
admin-mobile pass. Active pill `bg-brand-500 text-ink-900`; inactive `text-ink-600 hover:bg-ink-50`.

**The transparency manager is not migrated to it in this sub-project.** Those files have
uncommitted edits in the working tree, and rewiring three panels is not this feature's job.
The primitive is written for the new strip; adopting it elsewhere is a separate, mechanical
follow-up.

#### 4.3 Page and component split

`src/app/admin/(portal)/inquiries/page.tsx` gains a second query and the SuperAdmin flag:

```tsx
await requirePermission("handle-inquiries");
const [inquiries, feedback, actor] = await Promise.all([
  listInquiries(), listFeedback(), checkSuperAdmin(),   // returns SessionUser | null
]);
return (
  <InboxManager inquiries={inquiries} feedback={feedback} isSuperAdmin={actor !== null} />
);
```

Component split, mirroring how `TransparencyManager` holds `LegislativeManager` and
`TransparencyProjectsPanel`:

- **`inbox-manager.tsx`** (new, thin) — renders one `AdminPageHeader` ("Inquiries & Feedback",
  "Messages from the contact form and feedback about this website"), the `TabPills` strip, and
  one of two panels. Tab state initialises from `?tab=feedback` **in the `useState`
  initialiser**, so the panel owning a deep-linked record is the one that mounts and therefore
  the only one that consumes the `review` parameter. Switching tabs clears the other panel's
  filters by unmounting it.
- **`inquiries-panel.tsx`** — today's `InquiriesManager` body verbatim, minus its
  `AdminPageHeader`. No behaviour change. Its `useEditDeepLink("review", …)` gains the
  `tab === "inquiries"` enabled flag, the third argument the transparency panels already pass.
- **`feedback-panel.tsx`** (new) — below.
- The barrel export keeps `InquiriesManager` gone and adds `InboxManager`; the page imports
  from `@/features/admin`.

#### 4.4 The feedback panel

**Stat cards** (`AdminStatCard`, three across): Total Feedback (`MessagesSquare`); Unreviewed =
count of `new`, `danger` tone when above zero, matching how Inquiries flags unopened; Average
Rating (`Star`), one decimal over rated rows only, `—` when none are rated.

**Filters** (`AdminFilterBar`): fuzzy search over subject, message and category label; a
Category select; a Status select. Page size 8, as Inquiries uses.

**Columns** — sortable via `SortableTh` + `useTableSort`, default Received descending:

| Category | Subject | Rating | Page | Received | Status | Actions |
| --- | --- | --- | --- | --- | --- | --- |
| icon + label | subject, with a one-line message excerpt under it | `★ 4` or `—` | `page_path`, monospace, truncated | `formatDate` | `StatusChip` | Open + kebab |

**Row kebab** (`RowActions`, destructive actions on the row — never in the drawer):

- Mark in progress (`MailOpen`), disabled when already there
- Mark resolved (`CheckCircle2`)
- Dismiss (`XCircle`, danger) — for spam and duplicates. No confirmation: the row stays and
  the move is reversible, the same reasoning as "Close without reply" on an inquiry.
- Delete (`Trash2`, danger) — **only when the viewer is SuperAdmin and the row is
  `dismissed`.** Confirmed through `ConfirmDialog`.

**Drawer** — read on the left, act on the right, like `InquiryDrawer`: category, rating, the
captured page as a real link (opens in a new tab), the screenshot as a thumbnail linking to its
signed URL, the full message, then a Status select and a staff-note textarea with Save. No
autosave: this is a two-field triage form with no draft to recover, the same reason
`AchievementsEditor` is out of that hook's scope.

#### 4.5 Actions — `src/features/admin/actions/feedback.ts`

`updateFeedback(id, values)` mirrors `updateInquiry` exactly — `checkPermission("handle-inquiries")`,
Zod re-validation, no transition guard (a mis-dismissed row is fixed by picking "New" again),
`handled_by` stamped always and `handled_at` only on the terminal states `resolved` and
`dismissed`, then `recordActivity` and `revalidatePath("/admin/inquiries")`.

Audit classes follow the inquiry table's convention so a SuperAdmin filtering by outcome sees
every queue's decisions together: `in_progress` → `update`, `resolved` → `approve`,
`dismissed` → `reject`, `new` → `update` ("reopened"). `entityType: "feedback"` —
`audit_log.entity_type` is free text, so no migration. `entityLabel` is the subject, captured
at write time as that column requires.

`deleteFeedback(id)`:

```
requireSuperAdmin()  →  row must be status = 'dismissed'  →  delete row  →  discard screenshot
```

Both conditions are enforced **server-side**, checked against the row as re-read inside the
action, never on the UI's word — the two-condition shape of `guardDelete()`. It is a
deliberate variant rather than a call to `guardDelete` itself, which keys on `archived`:
feedback has no archive lifecycle, so `dismissed` plays that part. This is the whole reason
the delete exists — anonymous submissions accept image uploads, and image spam needs a
janitor. Inquiries still have no delete at all: nobody should be able to make a named
resident's message disappear.

The storage object goes after the row is gone, through the `discardImage` pattern: a failed
cleanup logs an orphan rather than failing a delete that already happened.
`removeStoredImage`'s allow-list is `public-media`-specific, so feedback gets its own small
remover in `src/lib/media.ts` for the private bucket, with `feedback/` as the only accepted
prefix and the same `..` rejection.

#### 4.6 Query — `src/features/admin/queries/feedback.ts`

`listFeedback()` mirrors `listInquiries()`: service-role client (callers must have checked
`handle-inquiries`; the page does), newest first, `handler:handled_by (full_name)` with the
same one-object cast, `toManilaDate` for dates.

One addition: rows carrying a `screenshot_path` get a signed URL batched through
`createSignedUrls`, 600-second expiry. One call for the page, not one per row. A signing
failure yields `screenshotUrl: null` and a logged warning — a missing thumbnail must not empty
the queue.

#### 4.7 Global search

`feedback` joins `SEARCH_MODULES`, with `MODULE_PERMISSION.feedback = "handle-inquiries"`,
`MODULE_META.feedback = { label: "Feedback", href: "/admin/inquiries" }`,
`MODULE_TAB.feedback = "feedback"`, and membership in `TICKET_MODULES` so `hrefForHit`
produces `?tab=feedback&review=<id>` — the parameter the panel's `useEditDeepLink` consumes.
The server-side search adds a branch over subject and message, following the existing modules.

Inquiries remain absent from the global search, as today. (`inquiries-manager.tsx` already
handles `?review=`, which is how a feedback-shaped deep link will behave once it is wired;
adding inquiries to the search is out of scope here.)

## Testing

**Vitest** (`tests/unit/feedback.test.ts`) — the pure logic only:

- the schema's boundaries: subject at 3/4/120/121 chars, message at 9/10/1000/1001, rating
  at −1/0/5/6, a category outside the enum, a `pagePath` not starting with `/`
- `feedbackCategoryLabel` for a known value and an unknown one
- `averageRating`: no rows, no rated rows, a mix of rated and unrated, rounding to one decimal

Plus `tests/unit/admin-nav.test.ts` if it asserts the old `Inquiries` label.

**Playwright `public`** (no session needed):

- the trigger is reachable by keyboard from the home page, opens the panel, and Escape closes
  it and returns focus to the trigger
- filling category + subject + message and sending shows the thank-you state, with no
  screenshot involved (file upload stays out of the happy-path e2e)
- submitting a 3-character subject shows the field error and never fires the action

**Playwright `admin`** (skips without `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`): `/admin/inquiries`
renders the two-tab strip, the Feedback tab shows its own stat cards and table, and
`?tab=feedback` lands on it directly.

No component tests, per the repo's standing rule.

## Migration and deployment notes

- `0023_feedback.sql` must be applied manually by the owner against Supabase staging, then
  production. Migrations `0012`–`0022` are still pending on production; this one queues behind
  them.
- The migration creates the `feedback-media` bucket itself, so there is no dashboard step and
  no script to run — unlike `0021`, which needs `scripts/upload-site-images.mjs`.
- Nothing in the widget renders before the table exists, but `submitFeedback` will fail
  against an unmigrated database. The public button ships in the same commit as the migration
  file; it works once the migration is applied.

## Out of scope

- **Email notification to staff on arrival.** Waits for sub-project 2D (Resend). Until then the
  queue is checked, not pushed.
- **Any public display of feedback** — no wall, no counts, no "1,204 residents rated us".
- **Replying.** No address is collected; adding one would undo the anonymity decision.
- **The widget inside the admin portal.** Staff report internally.
- **A resident-facing record of what they sent.** Anonymous means we cannot show it to them
  either.
- **Migrating `transparency-manager.tsx` onto `TabPills`.** Mechanical follow-up.
