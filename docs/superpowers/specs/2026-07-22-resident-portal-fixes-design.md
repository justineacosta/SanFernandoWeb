# Resident Portal Fixes — Design

**Date:** 2026-07-22
**Status:** Approved
**Umbrella:** `docs/superpowers/specs/2026-07-22-portal-overhaul-design.md` (sub-project 1 of 9)

## 1. Goal

Three defects on the public site: an unclickable back link, one page that scrolls
sideways on mobile, and a dead link that should not exist. No database, no permissions,
no new dependencies, no schema.

This ships first because it is user-visible, carries zero structural risk, and
establishes the browser-verification loop the later sub-projects depend on.

## 2. Findings

All three were measured against the running app on 2026-07-22, not inferred from source.
Method: `playwright-core` driving system Chrome at 375px and 1440px across **16 public
routes** (13 static + 3 dynamic slugs discovered by scraping the listing pages).

### 2.1 "Back to News" is entirely underneath the header — worse than reported

`SiteHeader` is `fixed inset-x-0 top-0 z-50` (`site-header.tsx:26`).
`announcements/[slug]/page.tsx` opens with `<Container className="py-12 md:py-16">` and
**no top offset**, so the back link renders in the space the header occupies.

| Viewport | Link spans | Header bottom | Hit-test at link centre | Clickable |
| --- | --- | --- | --- | --- |
| 375px | y = 48–68 | y = 90 | header's logo `<a>` | **no** |
| 1440px | y = 64–84 | y = 94 | `<header>` itself | **no** |

The link is not merely *partly* blocked — it is fully occluded at both breakpoints, and
`document.elementFromPoint()` at its centre never returns the link. On mobile a tap lands
on the site logo, navigating the user to the home page instead. This has presumably been
broken since the page was written.

**The other two detail pages are correct** and establish the convention:
`transparency/legislative/[slug]/page.tsx` and `officials/[slug]/page.tsx` both open with
`<Section className="pt-32 md:pt-44">`. The announcements detail page is the sole
deviation.

### 2.2 Horizontal overflow: exactly one page, one element

Of 16 routes at 375px, **15 are clean**. All 16 are clean at 1440px.

`/about` overflows by **+8px**, caused by `captain-message-section.tsx:34`:

```
<div className="absolute -bottom-6 -right-6 rounded-2xl bg-ink-900 p-6 ...">
```

The arithmetic is exact: `-right-6` pulls the name card 24px past its parent's right
edge; `Container` supplies only `px-4` (16px) of gutter; 24 − 16 = **8px** past the
viewport. On mobile the portrait column is full width, so nothing absorbs the overhang.
At `md` the column is `w-1/3` and the overhang lands harmlessly inside the row.

Interaction states were probed too — mobile nav opened on 4 routes, and every accordion
on `/services` and `/transparency` expanded. **No additional overflow appears in any
interactive state.** `/about` measures +8px open or closed; everything else stays at 0.

### 2.3 Dead link

`captain-message-section.tsx:50-56` — an `<a href="#">` reading
"View Executive Agenda 2024-2027". It is one of the remaining `"#"` stubs noted in
`CLAUDE.md`; the owner asked for its removal rather than a target.

### 2.4 Not verified

`/transparency/legislative/[slug]` could not be exercised: there are no published
legislative documents in the database, so the archive renders "No documents found." and
no detail URL exists to visit. Structurally it already uses `pt-32 md:pt-44` and contains
no negatively-offset elements, so no fix is indicated. Recorded as unverified rather than
claimed clean.

## 3. Decisions

### 3.1 Match the existing convention, don't invent an offset

The announcements detail page adopts `pt-32 md:pt-44` — byte-identical to what the
officials and legislative detail pages already use. Bottom padding is preserved
separately so the article does not end flush against the footer.

Rejected: adding top padding to `PublicShell`'s `<main>`. Every landing page
deliberately runs its hero *under* the transparent header; a global offset would put a
white band above all of them.

### 3.2 Fix overflow at the source, not with `overflow-x: hidden`

The tempting one-line fix is `overflow-x: hidden` on `html`/`body`. It is rejected:

- It silently breaks `position: sticky` on every descendant, and the admin portal's
  topbar plus the site header depend on sticky/fixed positioning.
- It hides the symptom while the element still overhangs — the next such bug becomes
  invisible instead of merely unnoticed.
- With one culprit on one page, a global rule is wildly disproportionate.

The card's overhang is a deliberate design gesture that reads correctly at `md` and
above. The fix keeps it there and neutralises it only where the layout stacks:
`-bottom-6 right-0 md:-right-6`. At mobile the card aligns to the portrait's right edge —
no overhang, no overflow; at `md` and up, nothing changes visually.

Rejected alternatives: `-right-4` (flush to the viewport edge, reads as a rendering
mistake) and wrapping the portrait in `overflow-hidden` (would clip the card's shadow and
its intended `-bottom-6` overhang as well).

### 3.3 Removing the button leaves the divider

The `<div className="mt-8 border-t border-ink-200 pt-8">` wrapper exists solely to carry
that link. It goes with it, along with the now-unused `ArrowRight` import. The `Quote`
import stays. The message section then ends on its final paragraph, which is the correct
shape for a pull-quote.

## 4. Scope

| In scope | Out of scope |
| --- | --- |
| Top offset on `announcements/[slug]` | Any other resident-portal styling |
| `/about` overflow fix at source | A global `overflow-x` backstop |
| Removing the Executive Agenda link | Wiring the remaining `"#"` stubs (contact map, hero CTA) |
| Re-verification of all 16 routes | `/transparency/legislative/[slug]` (no data to render) |

## 5. Files

- `src/app/(public)/announcements/[slug]/page.tsx` — top offset
- `src/features/about/components/captain-message-section.tsx` — overflow fix + link removal

## 6. Verification

1. `npm run typecheck` and `npm run lint` clean.
2. Re-run the overflow audit across all 16 routes at 375px and 1440px — expect **zero**
   overflow on every route including `/about`.
3. Re-run the back-link probe on `/announcements/[slug]` — expect
   `clickReachesLink: true` at both breakpoints, and `linkTop` below `headerBottom`.
4. Re-run the interactive probe (mobile nav, accordions) — expect zero overflow.
5. Screenshot `/about`'s captain section at 375px and 1440px to confirm the card reads
   correctly at both, and that the section ends cleanly without the removed button.

No claim of completion before steps 1–5 produce output.
