# Frontend conventions

Component-level React/Next rules. Visual system: `.claude/ui-ux.md`. Structure:
`.claude/architecture.md`.

## Server Components by default

`"use client"` only for real interactivity: `SiteHeader` scroll state, mobile navs,
`Accordion`, `LegislativeTable` (collapsible rows), the public forms, and the admin portal's
managers / drawer editors (Drawer, Toast, MiniCalendar, ToggleSwitch, uploaders).

Small state helpers live in `src/hooks/` (`useDisclosure`, `useFormDraft`, `useToast`,
`useTableSort`, `useEditDeepLink`).

## Every `startTransition(async …)` wraps its Server Action call in `try`/`catch`

(~90 call sites, swept 2026-07-28/29.) A Server Action that **throws** rather than returning
`{ error }` otherwise crashes the whole manager to `admin/(portal)/error.tsx`, or a public
form to its route `error.tsx`, losing whatever the resident typed.

- Reuse the handler's own error mechanism (`showError` toast or a local banner, per file —
  deliberately not standardized). The generic fallback copy is **"Something went wrong.
  Please try again."** where nothing more specific is in hand.
- **Cleanup that clears a `pending`/`confirming` flag goes in a `finally`**, or a throw
  leaves a `ConfirmDialog` stuck open and locked.
- **`grep -rn 'useTransition()' src/` is the reliable way to enumerate call sites** —
  grepping the literal `startTransition(async` misses the three files that alias the setter
  as `start`.
- **`login-form.tsx`, `sign-out-button.tsx` and `idle-timeout.tsx` are deliberately
  exempt:** `signIn`/`signOut`/`signOutIdle` end in `redirect()`, which works by *throwing* a
  `NEXT_REDIRECT`-digest error, so an ordinary `catch` at the call site would swallow it and
  break the redirect on every **successful** sign-in, not only on a real failure. If this gap
  is ever closed for auth, the fix belongs **inside those actions**, guarding only the
  pre-`redirect()` logic behind an `isRedirectError()` check.

## Every error banner is dismissible

Banners are `src/components/ui/inline-alert.tsx` (X button; `twMerge` resolves base-class
overrides, so no variant prop is needed). `<Toast>` closes on click as well as on its timer.

- **One category stays non-dismissible on purpose: field-level validation**, which clears
  itself once the field is valid — a close button on "this field is required" has nothing to
  dismiss *to*.
- **A file-picker's field-level error must also disable Submit, not only stay
  non-dismissible.** This gap first showed up in `AssistanceForm` and `TicketReplyForm`
  (2026-08-11): a resident could pick a file the client rejects (declared type mismatches —
  Storage's byte-signature check catches everything else), see the message, and still click
  Submit, because nothing gated the button on the error. The rejected file was already
  cleared from state, so the result wasn't corrupted data — it was a ticket/reply filed with
  the attachment silently absent and no indication it never made it.
  - **`TicketFileField` (`src/components/shared/ticket-file-field.tsx`) is now the one place
    this convention lives**, not a pattern repeated per form. It owns the reject-and-clear
    logic and the rejection copy, and reports two booleans up: `error` and `preparing`
    (downscaling in flight — new relative to the original fix, because downscaling is async
    and a submit landing mid-resize would file with no attachment). The parent form owns
    both booleans and does the actual gating —
    `disabled={isPending || filePreparing || fileError !== null}` — the component never
    disables anything itself, since it has no opinion on what "Submit" is called or what else
    might also gate it. Every ticket-filing surface that takes attachments renders it: the
    public `apply`/`complaint`/`assistance` forms and `TicketReplyForm` on `/track`, plus
    their three walk-in encode equivalents in the admin portal (`.claude/admin-cms.md`).
    Render `TicketFileField` for any new resident/walk-in attachment surface rather than
    re-implementing this.
  - **`FeedbackPanel` keeps its own picker and its own copy of the gate**, deliberately not
    `TicketFileField` — different bucket (`feedback-media`, not `ticket-media`), images only,
    single file, and its screenshot was always optional. It got the same
    `fileError`-disables-Submit treatment for parity, even though `clearScreenshot()` already
    emptied its visible state on rejection and nothing was silently lost the way it was on
    the other two — consistency, not a distinct bug fix.
- The four review drawers render `localError ?? error`, so dismissing has to clear both
  halves — hence their `onDismissError` prop.
- **`login-form.tsx` is the true special case:** `useActionState` gives no setter to null out
  `state.error`, so dismissal compares `state` by **object identity, never by message
  text** — a second failed login yields a brand-new state object with identical copy, and a
  string comparison would suppress it permanently.

## Public form pattern

The eight public anonymous forms share one shape: client component, `react-hook-form` +
Zod resolver against the same schema the Server Action re-validates with,
`<TurnstileWidget>` supplying a token, `reset()` after submit.

- **The schema is the single declaration.** A rule enforced client-side must be the same
  function the server calls — `isClosedDay` wired in as a `.refine()` is the worked example
  (`.claude/resident-portal.md`), not two copies that can drift.
- `/admin/login` cannot follow this pattern (`useActionState` + native `<form action>`); see
  `.claude/authentication.md`.

## Small things that have bitten

- **A `<button>` inside a `<form>` with no explicit `type` submits it.** Every non-submit
  chip/toggle inside a form needs `type="button"`.
- **Pass a `useId()` as `SortableList`'s `DndContext` id** or several lists on one page
  hydrate mismatched.
- Ids in a component that can mount twice (both responsive trees) must be `useId()`-derived,
  never literals.
- `<Avatar>` (`src/components/ui/avatar.tsx`) is the only renderer of staff initials, and
  `initialsOf` lives once in `src/lib/initials.ts` — **don't start a third copy.** The
  Settings card is the one place the photo isn't `<Avatar>`: `AvatarPicker` displays the
  current photo itself and owns the change/remove affordances.
- An empty block hides its section rather than rendering an empty shell — the Home/About CMS
  rule, and the same rule the assistance "What to prepare" card follows.
