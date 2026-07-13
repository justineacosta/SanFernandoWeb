# Design: Real content from the Ecological Profile (quick wins)

**Date:** 2026-07-13
**Source document:** Barangay 11 San Fernando "BDP (Ecological Profile) FINAL" PDF — the official
Barangay Development Plan / ecological profile provided by the user.

## Goal

Replace the remaining fabricated placeholder content on the public site with facts verified by the
barangay's own Ecological Profile, and surface the one piece of new resident-facing information the
document provides (the garbage collection schedule). No new pages; content edits plus one small new
section.

Already done before this work (verified in current `data.ts` files, no action needed): the About
page `VISION`/`MISSION` text and the home `GLANCE_STATS` (1,228 population / 248 households /
0.895 km² / 7 puroks) already match the PDF.

## Changes

### 1. About — History timeline (`src/features/about/data.ts` → `HISTORY_TIMELINE`)

Replace the three invented entries (1952 founding, 1985 highway, 2021 e-portal — all contradicted
or unsupported by the PDF) with two verified entries:

1. **1733 — Founding.** Barangay 11 San Fernando was founded in 1733, one of the San Nicolas
   barangays named after saints. Cite *History of San Nicolas* by Atty. Manuel F. Aurelio in the
   description. Image: the barangay seal (bundled asset in `src/images/logo/`) — no 1733
   photograph exists, and the seal is honest illustrative material.
2. **Today — An urban poblacion barangay.** Modern description absorbing the geography facts:
   7 sitios, 1,228 residents, 8.95 hectares; bounded by Barangay 3 San Ildefonso, Barangay 10
   San Paulo / Barangay 12 San Cayetano, and Barangay 22 San Guillermo; about 250 m from the
   Municipal Hall along the Manila North Road (National Highway). Image: one of the real carousel
   photos from `src/images/carousel/`.

**Type change:** `TimelineEntry.image` in `src/types/index.ts` widens from `string` to
`string | StaticImageData` so bundled static imports work (same pattern as `HERO_SLIDES`).
`HistorySection` must render both forms via `next/image`. This also removes two hotlinked
`lh3.googleusercontent.com` URLs.

### 2. About — Milestones become real programs (`MILESTONES`)

Replace the three fabricated awards ("Cleanest Barangay Award", "98% Vaccination Rate", "Smart
CCTV Network") with the three documented programs from the PDF:

1. **Mandatory Weekly Clean-up Drive** — residents together with barangay officials, SK officials,
   BHWs, BPW, BNS, and tanods conduct weekly clean-ups of roads, canals, and vacant lots.
2. **100% household waste segregation** — all 248 households segregate their garbage and are
   covered by barangay-wide collection.
3. **Flood mitigation through canal rehabilitation** — the barangay is the catch basin of
   neighboring barangays; rehabilitated canals let typhoon water subside quickly.

`meta` lines cite the source (e.g., "Barangay Development Plan / RBI 2024") instead of fake award
dates. Pick fitting lucide icons (e.g., Leaf/Recycle/Droplets); keep the `Milestone` shape.

### 3. Services — waste collection schedule (new section)

New `WasteScheduleSection` component in `src/features/services/components/`, exported from the
feature barrel in page order, slotted between `ServicesGrid` and `HelpSection` on
`src/app/(public)/services/page.tsx`. Data lives in `src/features/services/data.ts` (e.g.,
`WASTE_SCHEDULE`): perishables collected **Wednesday & Sunday mornings**, non-perishables
**Friday**; note that segregation is mandatory. Server component; use existing `Section` /
`SectionHeading` primitives and amber/ink tokens only.

### 4. Small fixes

- `MISSION`: "To promoted people participation" → "To promote people participation".
- `VISION`: "god loving" → "God-loving".
- `docs/BACKEND_HANDOFF.md` known-gaps section: add a note that `CAPTAIN.message` is invented
  placeholder text attributed to the real Punong Barangay and needs his actual message.

## Out of scope (candidates for later, from the same PDF)

- Real income/expenditure tables (CY 2021–2023) for the Transparency page.
- A dedicated "Barangay Profile" demographics page.
- Replacing the Contact page `MAP_IMAGE` with the sitio map from the PDF (page 2).
- Barangay-based institutions (BDC, BADAC, BCPC, etc.) listing.

## Data-quality caution

The PDF has internal inconsistencies (household totals vary 248 vs 306 across tables; some table
totals are arithmetically wrong). Only figures used here are the headline ones consistent across
the document. Every stat shown on the site should carry its source/year (RBI 2024, CBMS 2024).

## Verification

`npm run typecheck`, `npm run lint`, then drive the About and Services pages in the running app
per `.claude/skills/verify/SKILL.md` to confirm rendering (timeline images, new section layout).
