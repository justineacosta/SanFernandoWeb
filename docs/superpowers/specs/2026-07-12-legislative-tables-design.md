# Ordinances & Resolutions Tables on /transparency — Design

**Date:** 2026-07-12
**Status:** Approved

## Goal

Add two collapsible document tables — **Ordinances** and **Resolutions** — to the
`/transparency` page, directly below the Latest Uploads table and above the FOI
section. Each row expands to show the document's content and links to the
attached file (PDF or other raw file, uploaded via the future backend).

## Decisions made during brainstorming

- **Two separate tables**, not one combined table with a Type column (user choice).
- **Collapsible rows:** each ordinance/resolution row expands in place to show its
  content (user requirement).
- **Files are placeholders for now:** real file upload arrives with the backend;
  `fileUrl` stays `"#"` until then.

## Components

### `LegislativeSection` (new, server component)

`src/features/transparency/components/legislative-section.tsx`

One page `Section` (white tone, top border — matching `LatestUploadsSection`)
containing:

1. Section heading: "Ordinances & Resolutions" with a short description.
2. "Ordinances" sub-heading + `LegislativeTable` fed by `ORDINANCES`.
3. "Resolutions" sub-heading + `LegislativeTable` fed by `RESOLUTIONS`.

Rendered in `src/app/(public)/transparency/page.tsx` after `LatestUploadsSection`,
before `FoiSection`.

### `LegislativeTable` (new, client component)

`src/features/transparency/components/legislative-table.tsx`

Visually identical to the shared `DataTable` (rounded-3xl bordered card, ink-50
header band, uppercase header text, divide rows, hover tint), but rows are
expandable, so it is a separate client component rather than a change to
`DataTable`:

- **Visible row cells:** chevron toggle button · Number · Title · Date Approved ·
  Download link (right-aligned).
- **Expanded content:** a full-width row (`colSpan`) below the visible row showing
  the document `summary`, styled as readable prose. Expansion state lives in a
  per-row subcomponent using the existing `useDisclosure` hook.
- The Download link is its own anchor in its own cell — never nested inside the
  toggle button (invalid HTML).
- Accessibility: toggle button carries `aria-expanded` and `aria-controls`
  pointing at the detail row, matching the existing `Accordion` pattern.

## Data model

New type in `src/types/index.ts`:

```ts
export interface LegislativeDocument {
  /** e.g. "Ordinance No. 05-2024" */
  number: string;
  title: string;
  /** ISO date approved */
  date: string;
  /** Content shown when the row is expanded. Placeholder until CMS/backend. */
  summary: string;
  /** Link to the uploaded PDF/raw file. "#" placeholder until backend upload exists. */
  fileUrl: string;
}
```

Placeholder data in `src/features/transparency/data.ts`: `ORDINANCES` and
`RESOLUTIONS` arrays (~3 rows each) with realistic barangay-style numbers,
titles, and short ordinance-excerpt summaries.

## Backend handoff notes

Update `docs/BACKEND_HANDOFF.md`:

- Add `LegislativeSection` to the `/transparency` page components row.
- Add `LegislativeDocument` to the entity table (needs real `fileUrl` from file
  upload; `summary` from CMS).
- Add `ORDINANCES` / `RESOLUTIONS` to the mock-data inventory.
- Extend the documents API note so `GET /api/documents` (or a dedicated
  `/api/legislative` endpoint) covers ordinances/resolutions with file storage.

## Out of scope

- Real file upload/download (backend work).
- Search/filter/pagination over ordinances (listed in the handoff doc as a
  future API concern).

## Verification

Load `http://localhost:3000/transparency`; confirm both tables render below
Latest Uploads, rows expand/collapse showing the summary, and the Download link
renders in both collapsed and expanded states.
