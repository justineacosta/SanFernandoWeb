# Barangay San Fernando — Official Website

The official website of **Barangay San Fernando, San Nicolas, Ilocos Norte** — a modular, production-ready rebuild (from the `stitch/` design exports) using **Next.js App Router**, **TypeScript**, and **Tailwind CSS v4**.

## Getting Started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint 9 flat config (eslint.config.mjs, eslint-config-next)
```

There is no test framework — verification is `typecheck` + `lint` + exercising the
running app (recipe: `.claude/skills/verify/SKILL.md`).

## Architecture

```
src/
├── app/                  # Routes — thin pages that compose feature sections
│   ├── (public)/         # Public site (floating pill header + footer chrome)
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
│   ├── layout/           # SiteHeader (fixed floating pill), SiteFooter, PublicShell
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
  Tailwind v4 `@theme` tokens in `src/app/globals.css`: the **amber + ink** system
  (`brand-*` amber, `ink-*` neutrals, `danger*` red) with Space Grotesk display headings
  and Inter body text (spec: `docs/superpowers/specs/2026-07-11-amber-ink-reskin-design.md`).
- **Server Components by default** — only interactive islands are client components
  (site header scroll state, mobile navs, accordion, inquiry form, newsletter form).
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
