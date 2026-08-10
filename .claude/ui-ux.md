# UI / UX conventions

Visual system and layout rules. Component-level React conventions are `.claude/frontend.md`.

## Design system: amber + ink

**All colors, fonts and radii are Tailwind v4 `@theme` tokens in `src/app/globals.css`** —
`brand-*` (amber), `ink-*` (neutrals), `danger*`. Use only these tokens.

- **Blue tokens are from the pre-2026-07 design and must not reappear.**
- Space Grotesk (`font-display`) for headings, Inter for body.
- UI primitives live in `src/components/ui/` (Button, Card, Section, SectionHeading,
  DataTable, Accordion, Drawer, Toast, InlineAlert, TabPills, ViewToggle, …). Shared
  content cards are in `src/components/shared/`.
- `Container`'s `--container-page` is **80rem/1280px** — it caps available width identically
  for *any* viewport ≥1280px, so a row that overflows there has no wider breakpoint that
  will ever grant more room. **Fix by removing width demand, not by deferring it to a larger
  breakpoint.**

## Motion

**framer-motion (imported from `"motion/react"`) is for what CSS cannot do** — exit
animations (`AnimatePresence`), shared-element indicators (the admin sidebar's `layoutId`
pill), and mount-time staggers over data.

- The CSS three-pattern system (hero-seq, `.reveal-*`, `--duration-quick`
  micro-interactions) **stays CSS; never port it to Motion.**
- **All springs and durations come from `src/lib/motion.ts`** (budget-tested in
  `tests/unit/motion.test.ts`) — never inline them.
- Every Motion surface wraps in `<MotionConfig reducedMotion="user">`.

## The containing-block trap — the single most repeated layout bug here

**`backdrop-filter`, `transform`, and `container-type: inline-size` each make an element a
containing block for its `position: fixed` descendants.** A `fixed inset-0` overlay nested
inside one of them is positioned against that element instead of the viewport.

Consequences that are already load-bearing:

- **Never put a transform on a wrapper containing `fixed` descendants.** The admin `Drawer`
  renders in place, which is why the route templates animate **opacity only**, and why the
  Drawer itself stays CSS (converting it to `AnimatePresence` would also unmount closed
  editors and reset their form state).
- The feedback widget and `<IdleTimeout />` mount as **siblings** of the blurred chrome
  (`PublicShell`'s header, `AdminShell`), never inside it.
- `RowActions` **portals to `document.body`** because every admin table sits in
  `overflow-x-auto`.
- **Container queries are unusable on the Settings cards** for this exact reason: both
  `Toast` and `AvatarPicker`'s `ImageCropperDialog` render `fixed` **in place** rather than
  portaling, so an `@container` on either card would reposition the cropper overlay and the
  toast against the card instead of the viewport. Media-query breakpoints are used instead
  (see `.claude/admin-cms.md`).

## Heroes

**Home, Transparency and Officials share one full-bleed photo-background treatment** — a
photo layer spanning the whole section under a white wash, with the copy in a single
`max-w-2xl` block starting at the Container gutter. All three stay on the **light** theme
(`text-ink-900`/`text-ink-600`, `variant="soft"` badge, amber button) because the wash is
white, not the dark scrim `AuthLayout` uses, and all three drop the `grid-bg` texture and
`bg-radial-fade` glow every other page hero layers — invisible under a photo, noise once
washed.

**The wash is one formula written in three files and meant to stay identical:**

- flat `bg-white/82` below `md`;
- a left-weighted `from-white/88 (20%) → via-white/72 (55%) → to-white/20` gradient at `md`+,
  so the copy sits under the heavy end while the photo reads through on the right;
- two 28px `inset-x-0` top/bottom fades to solid white. Those fades are what a full-bleed
  hero needs and a `PageHero` doesn't — with no page background showing at the boundaries,
  the floating header and the next section would butt against a hard photo edge.

**The opacities were already lowered once on request ("less white'ish"), so this is near the
legibility floor for `text-ink-600` body copy, not a starting point to keep cutting from.**
The mobile veil is deliberately ~10 points heavier than the desktop gradient's midpoint:
below `md` there is no gradient, so the whole copy block sits over whatever the photo is
doing there — the worst case in the layout. Legibility depends on the gradient's stops
matching the copy column's width, so **move them together and re-check at 1440px and 390px**,
the two widths all three were measured at.

- **`HeroCarousel` is not `-z-10`** (the two static layers are) — its dots and hover-pause
  need pointer events, which is why `HomeHero`'s copy wrapper is `pointer-events-none` with
  only its text column `pointer-events-auto`. Its dots sit in their own `Container` with a
  `-ml-1.5` cancelling the buttons' padding so they line up with the copy's left edge rather
  than the viewport's; the copy grid keeps `pb-20 sm:pb-24` purely as their clearance. Its
  `sizes` is a plain `100vw` — the old `(min-width: 1280px) 1200px` described the
  `Container`-width card the hero no longer renders inside.
- **`/officials` is the only page that left the shared `PageHero`** to get this treatment
  (`officials-hero.tsx`); `PageHero` itself is untouched and every other inner page still
  uses it. Its copy is **left-aligned at `max-w-2xl`** rather than centered at `max-w-3xl`,
  forced by the wash — a centered block runs past the gradient's 55% stop into the part of
  the photo that reads through. Its `object-position` is **`center 20%`**, not the other two
  heroes' `object-center`: the section is ~3.8:1 against a 16:9 source, so centering crops
  the group off at the shoulders. Re-derive that number if the photo is ever swapped.

## `/admin/login` — a responsive split-screen at `md:` (768px)+

A brand panel (`w-[55%]`) beside the form, with a **separate** centered-card layout below
that breakpoint. `src/app/admin/login/page.tsx` renders both trees unconditionally and
toggles them with `md:hidden`/`hidden md:flex` (CSS `display:none`, **not** conditional
mounting). Consequences:

- **`LoginForm`'s form-control ids must stay `useId()`-derived, never hardcoded literals** —
  two copies of one static id in the DOM break label association (`<label for>` binds to the
  first match in tree order) and break `getByLabel` locators, whichever tree mounts second.
  `LoginForm` mounting twice is also why two Turnstile widgets exist once challenged.
- **The background photo is a single `absolute inset-0 md:w-[55%]` layer in `<main>`, not
  one `<Image>` per tree.** A per-tree copy leaves a permanently hidden `<Image>` on every
  render: a second download, plus a false `next/image` dev warning about `sizes` that no
  honest value can remove, because the dev check measures the `display:none` copy at 0px
  wide. The layer's `md:w-[55%]`, the brand panel's `w-[55%]` and
  `sizes="(min-width: 768px) 55vw, 100vw"` are **one measurement written three times — move
  them together.**
- Photo is `src/images/loginpageImage/TrickOrTreat.jpg`, `scale-105 object-cover blur-[2px]`
  under a flat `bg-ink-950/70` scrim; the desktop panel's dot-grid / blur-glow /
  watermark-seal decoration layers on top. One dev warning is expected and pre-existing:
  Next preloads a narrower variant (`w=828`) than the browser's srcset pick (`w=1920`).
- The form panel centers via `my-auto` on the inner wrapper, **not `items-center` on the
  scrollable container** — flex centering clips the overflowing side with no way to scroll
  back to it, while margin-auto degrades to top-aligned-and-scrollable. `<main>` and the
  split container use `min-h-screen`, never `h-screen`, so a short viewport grows instead of
  clipping the brand panel's feature list.

`/admin/forgot-password` and `/admin/reset-password` reuse this chrome via `AuthLayout`.

## Cards: compact vs archive, on purpose

Two sizes for the same content, twice over:

- homepage widget → compact `AnnouncementCard` (thumbnail + text row) / `EventCard`;
- full archive → `NoticeArchiveCard` / `EventArchiveCard` (structural clones of `NewsCard` —
  `h-48` image-on-top, `ImageIcon` fallback) in a 3-column grid matching `/news`'s
  breakpoints.

**Don't merge them or resize the compact card to be "bigger everywhere"** — the homepage
widget's narrow column has no room for the taller card.

## Public header

Desktop: a labeled outline `Button` ("Login" + `CircleUserRound`) in `SiteHeader`. It
**replaced** the header's standalone accent "Contact Us" button rather than sitting
alongside it — with both present, the label pushed the row past its width budget and wrapped
the wordmark and the "Track a Request" nav item onto two lines even at 1440px (see the
`Container` cap above). "Contact Us" was redundant with `NAV_ITEMS`' own "Contact" entry.
Residual wrapping right at the 1024px `lg` boundary is unchanged pre-existing behavior,
confirmed by diffing against the untouched header at that width.

Mobile: a labeled "Login" row (icon `LogIn`, deliberately different from desktop's) appended
in `MobileNav` below the `NAV_ITEMS` list, **separated by a divider rather than mixed into
that array** — it's a staff-only utility link, not public nav content, and `NAV_ITEMS` stays
public-page-only.

`lucide-react` is pinned at `^0.577.0` — the last release on the pre-1.0 major, chosen
deliberately over the `1.x` line's larger unvetted diff. Downgrading now would be pure
churn.

## A dead control gets deleted, not wired to a stub

The standing principle behind the removed FOI Guide and More Statistics CTAs and the
Services `HelpSection`'s "Download All Forms" (there is no bulk-forms download to restore it
to; "Message Help Desk" is that strip's only action). The home page's "Get Involved" CTA
went for a different reason — a **working** `/contact` link removed on request — which left
`CtaBanner` (`src/components/sections/cta-banner.tsx`) with no actions at all, so its
`actions` prop is optional now and it drops the action row's wrapper and the description's
`mb-8` when omitted. `GetInvolvedSection` is still its only consumer.

## Images

- **Most images are hotlinked from `lh3.googleusercontent.com`** (allow-listed in
  `next.config.ts`'s `images.remotePatterns` **and** the CSP's `img-src` — both, or they
  break). **Migrating them to owned Storage was dropped 2026-08-10 — treat it as settled,
  not a gap to close.** Every resolver passes a full `http(s)` URL through untouched rather
  than treating it as a storage path, and the `public-media` bucket that item once named as
  the destination no longer exists. New uploads have always gone to owned Storage.
- **Five bundled static imports, deliberately** (one file each, no admin surface, changing
  only when the thing they depict does): the seal (`src/images/logo/`, `SITE.sealImage`),
  the map (`src/images/map/san-fernando-map.png`, `MAP_IMAGE`), the admin login photo, the
  transparency hero photo, and the officials hero photo. Everything else still in
  `src/images/` — `carousel/`, `officials/` — is **upload-script source only, not an app
  dependency**; those files live in Supabase Storage at runtime. The one exception is the
  Punong Barangay's portrait, a bundled import used only as the *fallback* in the About-page
  `CAPTAIN` block, since `CaptainMessageSection` reads the officials table first.
- The favicon `src/app/icon.png` is a 256px circular crop of the seal — regenerate it if the
  seal changes.

## Placeholder reality

**Real:** transparency documents serve real Supabase-hosted PDFs/images (the old `"#"`
download stubs are gone); Contact's "Get Directions" links to the barangay hall's real
Google Earth location; the barangay hotline `(077) 600 1082` (`SITE.phone` /
`EMERGENCY_HOTLINES[0]`, which the officials page's 24/7 Action Center dials rather than
911); officials' names; and the two service rows added for the request-flow work
(`social-services-assistance`, `set-an-appointment`) — live catalog entries routing to
working forms.

**Still placeholder-shaped:** other phones, emails and office hours (correct names, not real
contact data); officials' bios (empty); the About `CAPTAIN.message`. Remaining `"#"` hrefs
are in-page anchors or not-yet-wired links (captain message, hero CTA).

**Verified real content** (against the barangay's official *Ecological Profile / Barangay
Development Plan* PDF, 2026-07-13): mission/vision, the About history timeline (1733
founding), "Community Programs", home glance stats, and the Services waste-collection
schedule. **Land area is 8.95 ha** — the PDF's own "(0.895 sq. km)" parenthetical is a
decimal error; don't reintroduce it.

The `CAPTAIN.message` quotes are invented placeholder text but are **not a launch blocker**
(confirmed 2026-07-29) — swappable post-launch through the admin portal, since
`CaptainMessageSection` reads the officials table. Treat as no longer owed.
