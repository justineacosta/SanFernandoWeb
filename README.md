# Barangay Sampaguita — Official Website

A modular, production-ready rebuild of the Barangay Sampaguita website (from the `stitch/` design exports) using **Next.js App Router**, **TypeScript**, and **Tailwind CSS v4**.

## Getting Started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run typecheck
```

## Architecture

```
src/
├── app/                  # Routes — thin pages that compose feature sections
│   ├── (public)/         # Public site (TopBar + Header + Footer chrome)
│   │   ├── page.tsx      # Home
│   │   ├── about/
│   │   ├── officials/
│   │   ├── services/
│   │   ├── announcements/ # News & Announcements
│   │   ├── transparency/
│   │   └── contact/
│   └── admin/            # Admin portal (sidebar + app-bar chrome, noindex)
│       ├── page.tsx      # Create Content hub
│       ├── services/  events/  news/  settings/   # section stubs
├── components/
│   ├── ui/               # Primitives: Button, Badge, Card, Container, Section,
│   │                     # SectionHeading, IconCircle, DataTable, form fields, Accordion
│   ├── layout/           # TopBar, SiteHeader, SiteFooter
│   ├── navigation/       # DesktopNav, MobileNav, NavLink (active-route aware)
│   ├── sections/         # PageHero, CtaBanner — cross-page section shells
│   └── shared/           # Domain cards: AnnouncementCard, EventCard, OfficialCard,
│                         # StatCard, EmergencyHotlinesCard, DocumentLink, DividerHeading
├── features/             # Feature-based modules: data.ts + section components + index.ts
│   ├── home/
│   ├── about/
│   ├── officials/
│   ├── services/
│   ├── announcements/
│   ├── transparency/
│   ├── contact/
│   └── admin/            # Admin shell (sidebar, topbar) + content hub widgets
├── hooks/                # useDisclosure
├── lib/                  # cn(), date/tel formatters
├── types/                # Shared interfaces (Official, Service, Announcement, …)
└── constants/            # Site identity, navigation, hotlines, footer links
```

### Principles

- **Design system first** — all colors, fonts, radii, and shadows are defined once as
  Tailwind v4 `@theme` tokens in `src/app/globals.css`, derived from
  `stitch/civic_horizon/DESIGN.md` ("Civic Horizon").
- **Server Components by default** — only interactive islands are client components
  (mobile nav, accordion, inquiry form, newsletter form).
- **Pages compose sections** — each route renders named feature sections
  (`<MissionVisionSection />`, `<HistorySection />`, …) with zero inline layout logic.
- **Content as data** — page copy, officials, services, documents, and events live in
  typed `data.ts` files per feature, ready to be swapped for a CMS or API later.

### Conventions

- Path alias: `@/*` → `src/*`.
- Shared types in `src/types`, shared constants in `src/constants` — no hardcoded
  repeated values inside components.
- Remote images are served from `lh3.googleusercontent.com` (allow-listed in
  `next.config.ts`); replace with local assets in `public/` when final photography is
  available.
