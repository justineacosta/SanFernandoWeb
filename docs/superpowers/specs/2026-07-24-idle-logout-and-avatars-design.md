# Idle Logout and Profile Pictures

**Date:** 2026-07-24
**Status:** Approved, ready for planning
**Migration:** `0025_profile_avatars.sql`

## 1. What this is

Two unrelated gaps in the admin portal, brought in together because both live in
Settings → Profile and both touch `getSessionUser`:

1. **A signed-in staff session never ends.** Supabase's refresh token rotates on
   every `/admin` page load, so a portal left open on a shared barangay office PC
   stays signed in indefinitely. There is no inactivity timeout at any layer.
2. **Nobody has a profile picture.** `profiles` has no avatar column; the top bar
   and the Settings profile card both render initials, and the card literally
   says *"Photo upload coming soon"*.

Both are scoped to the **admin portal**. The public site has no accounts — ticket
tracking is reference-code based — so there is no second surface to consider.

Out of scope: cropping/resizing UI, an avatar for anyone but yourself, a
per-user configurable timeout, and any change to the public site.

## 2. The timeout contract

One rule, and everything else reads from it:

> A `sf-activity` cookie exists **if and only if** the user interacted within the
> last 30 minutes.

```
sf-activity=1; Max-Age=1800; Path=/admin; SameSite=Lax; Secure (production)
```

The cookie is **presence-only** — the value is a constant and carries no
timestamp. That is the point. A timestamp would have to be written by either the
client clock or the server clock and then compared against the other, and the two
disagree; presence collapses the question to "did the browser still have it?".

It also gives the second half of the requirement for free. The user asked for
logout after **30 minutes idle _or_ 30 minutes with the window closed**. A closed
tab runs no timer, so the closed-window case can only be enforced on the next
request — and cookie `Max-Age` is absolute wall-clock time that survives a browser
restart. Close the window at 14:00, reopen at 14:31, the cookie is gone, the gate
fires. No code.

### 2.1 Timing

`IDLE_MS = 30 min` total, with the warning dialog occupying the **final 60
seconds** (29:00 → 30:00) rather than following the 30 minutes.

This is a deliberate deviation from a literal "30 min + 60 s warning", and the
reason is the contract above: the client deadline and the cookie's `Max-Age` have
to be the same number. If the dialog ran from 30:00 to 31:00, the cookie would
already be dead for its whole duration — a "Stay signed in" click at 30:30 would
be reviving a session the server had already given up on, and any background
navigation inside that minute would have redirected to login *underneath the open
dialog*.

### 2.2 Constants

New module `src/lib/session-activity.ts` — pure, no I/O, unit-tested next to
`admin-nav.ts`:

- `ACTIVITY_COOKIE = "sf-activity"`
- `IDLE_MS = 30 * 60 * 1000`
- `WARN_MS = 60 * 1000`
- `HEARTBEAT_THROTTLE_MS = 60 * 1000`
- `ACTIVITY_STORAGE_KEY = "sf-admin-activity-at"`
- `activityCookieOptions()` → the `Max-Age` / `Path` / `SameSite` / `Secure` shape

Nothing may inline these numbers, for the same reason `src/lib/motion.ts` owns
every spring.

## 3. Writers and gates

Three places write the cookie, two places enforce it.

| Role | Where | Note |
|---|---|---|
| write | `signIn` action | on successful sign-in, before the redirect |
| write | `src/middleware.ts` | on each `/admin` page GET |
| write | client heartbeat | throttled, on real interaction |
| gate | `src/middleware.ts` | page GETs |
| gate | `getSessionUser()` | pages **and Server Actions** |

### 3.1 Why two gates

Server Action POSTs are excluded from the middleware matcher on purpose — see the
long comment at the bottom of `src/middleware.ts`, which explains that matching
them makes Next buffer multipart bodies and truncate large PDF uploads. So
middleware cannot be the whole gate: a user could sit in a drawer submitting
saves forever without a single page GET.

`getSessionUser()` is the second gate and the authoritative one. It already reads
the session on every page and every gated action; it gains a cookie check and
returns `null` when the cookie is absent. `requireSessionUser` then redirects to
login, and `checkPermission` returns `NOT_FOUND` — the same behaviour an expired
session already produces today, which `src/lib/auth.ts` documents as accepted.

### 3.2 The prefetch exception

Middleware must **not** refresh the cookie when the request carries the
`Next-Router-Prefetch` header. Next prefetches admin links on hover and on
viewport entry; counting those as activity would let a page holding many links
refresh itself without a human present.

### 3.3 What middleware does on expiry

Session valid but cookie absent, on a non-login `/admin` GET:

1. delete the Supabase auth cookies on the redirect response,
2. redirect to `/admin/login?reason=timeout`.

Middleware clears cookies rather than delegating to a `/admin/logout` route
handler. A GET route that signs you out is CSRF-able — `<img src="/admin/logout">`
on any page would sign an admin out. The cost is that the Supabase refresh token
is not revoked server-side, only deleted from the browser; accepted, because the
only copy was the one deleted.

The login page reads `?reason=timeout` and shows a notice: *"You were signed out
because of inactivity."*

## 4. The warning dialog

`<IdleTimeout />`, a client component mounted in
`src/app/admin/(portal)/layout.tsx` as a **sibling of `AdminShell`**, not a child
of it. Same rule as the public feedback widget: a `position: fixed` overlay
nested inside the `backdrop-filter` chrome gets a new containing block and stops
being viewport-fixed.

At 29:00 idle it opens a `role="alertdialog"` styled like `ConfirmDialog`, with a
live seconds countdown and two buttons:

- **Stay signed in** — primary, holds initial focus. Re-arms the timer and
  re-writes the cookie.
- **Sign out now** — calls the existing `signOut` action.

At 30:00 with no response it calls a new `signOutIdle` action — added to
`src/features/admin/actions/auth.ts` beside `signOut`, sharing its
resolve-the-actor-before-signing-out order — which records an audit entry
(`logout`, detail *"signed out for inactivity"*) and redirects to
`/admin/login?reason=timeout`.

The closed-window path records **no** audit entry. Nothing is running to
attribute one to, and writing it from middleware would mean the service-role
client in the edge runtime for a low-value row.

### 4.1 Heartbeat and cross-tab behaviour

The heartbeat is a hook, `src/hooks/use-idle-timer.ts`, consumed only by
`<IdleTimeout />` — the same split `useFormDraft` uses, with the pure helpers in
`src/lib/session-activity.ts` and the effects in the hook.

It listens for `pointerdown`, `keydown` and `scroll` — not
`mousemove`, which fires continuously from an idle mouse being nudged. It is
throttled to once per `HEARTBEAT_THROTTLE_MS` and writes **two** things:

- the `sf-activity` cookie (for the server), and
- `localStorage["sf-admin-activity-at"] = Date.now()` (for the UI).

The localStorage write exists because a presence-only cookie cannot answer *"how
fresh?"*, and a background tab needs that to know whether the foreground tab is
active. Other tabs receive the `storage` event and reset their own timers, so an
idle background tab never warns while you are working elsewhere. Cookie for the
server, localStorage for the countdown — each mechanism reads exactly one clock.

## 5. Accepted limitation

The cookie is **not `httpOnly`**, because client JS has to write it. A signed-in
user can therefore hand-craft it and never time out.

This is fine. The feature protects an unattended desk in a shared barangay
office; it was never a defense against the session's own owner, who is already
authenticated and could equally leave a script clicking. Making it `httpOnly`
would force every heartbeat through a Server Action round trip — a POST per
minute per user — to buy nothing.

## 6. Profile pictures

### 6.1 Schema

`0025_profile_avatars.sql`:

```sql
alter table public.profiles add column avatar_src text;
```

Nullable. Null means initials, which stays the permanent fallback — there is no
default avatar image.

The same column must be appended to
`supabase/baseline/0000_baseline_2026-07-23.sql`, which is the path a fresh
environment takes instead of replaying numbered migrations.

### 6.2 Storage

`public-media/avatars/<uuid>.<ext>` — JPG/PNG/WebP, ≤ 2 MB, the existing image
rules unchanged. Public bucket, matching the officials' portraits: a random-UUID
path, a plain public URL through `photoUrl`, `next/image` optimisation, no
signing on the hottest path in the portal. The private `feedback-media` precedent
does not apply — a staff headshot is not a screenshot of someone's own account
page.

Two edits in `src/lib/media.ts`:

- `"avatars"` joins the `ImageFolder` union.
- `avatars` joins `removeStoredImage`'s path allow-list regex.

The second is easy to miss and fails silently: without it, every replaced photo
becomes a logged orphan instead of a deletion.

### 6.3 Types and reads

`SessionUser` gains `avatarSrc: string | null`. `TeamUser extends SessionUser`,
so both selects widen:

- the `select` in `getSessionUser` (`src/lib/auth.ts`)
- `PROFILE_COLUMNS` in `src/features/admin/queries/users.ts`

### 6.4 The Avatar primitive

New `src/components/ui/avatar.tsx` — `{ src, fullName, size }`, rendering either
a `next/image` circle or the amber gradient initials.

This is a cleanup with a reason, not decoration: `initialsOf` is currently
copy-pasted into `admin-topbar.tsx` and `account-profile-form.tsx`, and adding a
third copy for `/admin/users` would settle the duplication as the house style.
Both existing call sites become `<Avatar />`.

`/admin/users` renders it **read-only** in the name cell. The column is already in
the query result whether or not it is used, and nobody can edit anyone else's
photo — own-photo-only is the whole scope.

### 6.5 Upload flow

Defers to Save, like every uploader since sub-project 7. `SingleImageUploader`
gains one prop, `previewShape?: "rect" | "circle"`, so a face previews as a
circle; alt text is hidden through the existing `decorative` prop, because an
avatar's alt text is the person's name. No new uploader component, and the picker
stays a pure file picker making no network calls.

`updateMyProfile(values, avatarForm)` takes a second `FormData` argument carrying
`image` and `removeImage`, mirroring `saveOfficial` exactly:

1. upload first, capturing `uploadedPath`,
2. a local `fail()` helper that compensating-deletes `uploadedPath` before
   returning any error, so a failed row write cannot leave an object behind,
3. `discardImage` on the previous path once the update succeeds.

The existing `"updated own profile"` audit entry covers it. No new audit type.

### 6.6 Revalidation

`revalidatePath("/admin/settings")` is not sufficient. The top bar's avatar
renders from the portal layout, so the action also needs
`revalidatePath("/admin", "layout")` — otherwise you save your photo and the
header keeps showing your initials until the next hard reload.

### 6.7 No cropping

A 2 MB ceiling and `object-cover` on a circle. Cropping means a new interactive
component plus a canvas re-encode, and `next/image` already produces the display
sizes.

## 7. Risks

- **The allow-list regex in `removeStoredImage`.** Forgetting `avatars` turns
  every replaced photo into a silent orphan. `scripts/report-orphaned-media.mjs`
  is the check.
- **Playwright's admin project** reuses a stored session from
  `tests/e2e/auth.setup.ts`. That storage state now includes an expiring cookie;
  a stale state (or a suite running long) redirects admin specs to login. Setup
  runs per invocation, so this should not bite, but a failing admin spec that
  lands on `/admin/login?reason=timeout` has this cause and no other.
- **`getSessionUser` is `cache()`d** per request. The cookie check must live
  inside the cached function so every caller sees the same answer within a
  request, and must not attempt a cookie *write* there — `cookies()` is read-only
  in a Server Component.
- **Deviating timing.** 29:00 → 30:00 rather than 30:00 → 31:00 (§2.1). If the
  literal 30 + 60 is ever wanted, `Max-Age` must move to 1860 in the same change,
  never one without the other.

## 8. Verification

- `npm run typecheck`, `npm run lint`, `npm run test:unit`.
- Unit tests for `src/lib/session-activity.ts`.
- Manually, with `IDLE_MS` temporarily shortened: warning appears, "Stay signed
  in" re-arms it, no response signs out to `/admin/login?reason=timeout` with the
  notice shown, and an audit entry is written.
- Two tabs open: activity in one prevents the other from warning.
- Close the browser, reopen past the deadline, confirm the login redirect.
- Upload an avatar; confirm the top bar updates without a hard reload, that
  replacing it deletes the old object, and that a save failure leaves no object
  behind.
