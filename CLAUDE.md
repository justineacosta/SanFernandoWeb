# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

This file carries only what applies to almost every task. **Detailed rules live in
`.claude/*.md` — read the relevant one before working in that area** (map below).

## Project

The official website of **Barangay San Fernando, San Nicolas, Ilocos Norte** (Philippines).
Next.js 16 App Router + React 19 + TypeScript (strict) + Tailwind CSS v4, backed by
**Supabase** (Postgres + Auth + Storage). Built frontend-first as a static mock; backend
integration is essentially complete and **deployed to production**.

Two surfaces: a **public resident site** (`src/app/(public)/`) and an auth- and
permission-gated **staff admin portal** (`src/app/admin/`). Almost all content is DB-backed
and edited through the portal; the few remaining static pieces are listed in
`.claude/architecture.md`.

## Commands

```bash
npm run dev        # http://localhost:3000 — often already running; check before starting another
npm run build      # production build (mix of static + dynamic/DB-backed routes)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint 9 flat config (eslint.config.mjs) — `next lint` is gone in Next 16
npm run test:unit  # Vitest, pure functions only (tests/unit)
npm run test:e2e   # Playwright against the dev server; `--project=public` needs no login
```

## Documentation map — read before you work

| Task touches | Read |
|---|---|
| Where code goes, route/feature structure, shared modules | `.claude/architecture.md` |
| Schema, tables, RLS, columns, nullability, SQL functions | `.claude/database.md` |
| Sign-in, sessions, idle timeout, password reset, account creation | `.claude/authentication.md` |
| Permissions, roles, gates, who-may-do-what, disclosure | `.claude/authorization.md` |
| Server Actions, query layer, Route Handlers, proxy, dates | `.claude/backend.md` |
| Client components, forms, error handling, transitions | `.claude/frontend.md` |
| Design tokens, motion, layout traps, heroes, copy/placeholders | `.claude/ui-ux.md` |
| Admin managers, tables, drawers, autosave, notifications, Settings | `.claude/admin-cms.md` |
| Public site: services routing, ticket flows, `/track`, feedback, archives | `.claude/resident-portal.md` |
| Buckets, uploads, media lifecycle, avatars, orphans | `.claude/storage.md` |
| Fuzzy search — **required before touching either half** | `.claude/search.md` |
| Audit log writes | `.claude/audit-logs.md` |
| Transactional email (Resend), templates, what sends | `.claude/email.md` |
| Rate limiting, Turnstile, CSP, privacy boundaries, enumeration | `.claude/security.md` |
| Writing or debugging tests, e2e rate-limit collisions | `.claude/testing.md` |
| Migrations, baseline vs numbered, deploy order, env vars, scripts | `.claude/deployment.md` |

Historical *why*: `docs/superpowers/specs/`, `/plans/`, `/sdd/` — dated files, **historical
records, never retro-edited**, even when a decision they document has since been reversed.
`docs/BACKEND_HANDOFF.md` is the living integration brief.
**`docs/HARDENING_BACKLOG.md` is the one live list of deferred engineering work** — it is
tracked in git specifically because the SDD ledgers under `.superpowers/sdd/` are git-ignored
and never reach GitHub. Delete entries as they ship rather than letting it accumulate.

## Analyze before modifying

- **Read the relevant `.claude/*.md` first.** Most of what looks like an obvious improvement
  here has already been tried, reversed, or is load-bearing for a reason recorded there.
- **Read the surrounding code before changing it.** Match its patterns, naming and comment
  density.
- **A comment saying "deliberately", "on purpose", "don't", or naming a rejected alternative
  is a decision, not an accident.** If you believe it is wrong, say so and ask — don't
  silently "fix" it.
- **Verify against reality, not the docs.** Confirm a column exists in the migration,
  confirm a helper still exists before recommending it, confirm behaviour in the browser
  (`.claude/skills/verify/SKILL.md`) for anything visual.

## Critical security requirements

1. **Never expose the service-role key to the client.** All write-bearing tables have RLS
   enabled with **zero policies**, so the service-role client behind an explicit
   `requirePermission(...)`/`checkPermission(...)` code check is the *entire* auth gate.
2. **Server Actions are public HTTP endpoints.** Every write re-validates its input with Zod
   at runtime, and every action gates permission itself — whatever any page links to, a
   browser can POST directly. Gate the **write** paths, not only the render path.
3. **Turnstile verification runs first** on public anonymous actions — before rate limiting,
   before Zod. It fails **closed**; the rate limiter fails **open**. Both are deliberate.
4. **Public pages 404 rather than reveal a module exists.** Disclosure follows permission
   everywhere: nav, page titles, notifications, search.
5. **Anything passed to a client component serializes whole into the RSC payload**, rendered
   or not. Coarsen or drop sensitive values server-side, before the boundary.
6. **Privacy gates live in the query layer** (`.eq("visibility","public")`, unselected
   columns), never in a component. Don't relocate one "for clarity".

## Architecture principles

- **Pages are thin.** `src/app/` files only compose named feature sections — no inline
  layout logic, data or queries.
- **Feature modules own everything for a route:** `src/features/<name>/` with `data.ts`,
  `components/`, `queries.ts`/`actions.ts`/`schema.ts`, and an `index.ts` barrel. **Pages
  import only from the barrel.**
- **Shared shapes live in `src/types/index.ts`** — the de-facto API contract. Site identity,
  nav and hotlines in `src/constants/site.ts`; permissions in `src/constants/permissions.ts`.
- **Server Components by default.** `"use client"` only for real interactivity.
- **One declaration, one place.** A rule enforced on both client and server is the same
  function wired into both, never two copies that can drift. A constant derived from another
  (`IDLE_MS` and a cookie `Max-Age`) is derived, never written twice. When one fact must
  appear in several files, say so in the doc and move them together.
- **A dead control gets deleted, not wired to a stub.**
- Path alias `@/*` → `src/*`. zod is **v4** (not v3).

## Coding principles

- **Use only the amber/ink design tokens** in `src/app/globals.css` (`brand-*`, `ink-*`,
  `danger*`). Blue tokens are from the pre-2026-07 design and must not reappear.
- **Never inline animation springs/durations** — they come from `src/lib/motion.ts`.
- **Every `startTransition(async …)` wraps its Server Action call in `try`/`catch`**, and
  cleanup goes in a `finally`. Three auth files are documented exemptions
  (`.claude/frontend.md`).
- **Every error banner is dismissible**, except field-level validation.
- **Never put `transform`, `backdrop-filter` or `container-type` on a wrapper containing
  `position: fixed` descendants** — it becomes their containing block. This is the most
  repeated layout bug in this codebase (`.claude/ui-ux.md`).
- **Delete the DB row before the Storage object, never the reverse**
  (`.claude/storage.md`).

## Testing requirements

- **Vitest is for pure functions only** — no jsdom, no React renderer. A module under test
  must not transitively import a Supabase client.
- **Behaviour is verified in the browser**, via Playwright or the `verify` skill. Component
  tests are deliberately not a thing here.
- **An e2e failure shortly after a recent run is a rate-limit collision first, a regression
  second.** The per-suite budget table is in `.claude/testing.md`.
- **Two bug classes this suite structurally cannot catch:** the JS/SQL fuzzy-search halves
  drifting apart, and a nullable DB column feeding a non-nullable TS field (Supabase rows
  are untyped, so `typecheck` misses it too).

## Production safety

- **Migrations are applied manually by the owner** against live Supabase, staging first.
  **Never assume a migration is applied — ask.** Announce a new one early.
- **Apply the migration before the code that reads it reaches an environment.** A missing
  column fails at runtime, not at build, and several failures are silent
  (`.claude/deployment.md`).
- **Applied migrations are historical records — never retro-edit them.**
- **New environments use `supabase/baseline/0000_baseline_2026-07-23.sql`; existing ones keep
  applying numbered migrations.** The two paths don't mix.
- The Turnstile **site key is inlined at build time** — rotating it needs a rebuild.

## Project-wide constraints

- **The barangay is San Fernando everywhere.** Any "Sampaguita" in `src/` is a regression
  from the original design placeholder.
- **Its sub-divisions are Sitios, not Puroks.** Any "Purok"/"Puroks" in `src/` or `tests/` is
  a regression. It was never a data model, only user-facing copy — no column, enum or key
  ever carried the word. Existing databases keep the old label until someone edits it through
  the admin portal.
- **San Nicolas is a municipality** — write "Municipal …", never "City …". The Ilocos Norte
  area code is **(077)**.
- **Land area is 8.95 ha.** The source PDF's own "(0.895 sq. km)" is a decimal error; don't
  reintroduce it.
- Content for **still-static** features goes in that feature's `data.ts`, never hardcoded in
  a component. Content for **DB-backed** features is edited in the admin portal and lives in
  Supabase — not in the repo.

## Keeping these docs true

**Every session that changes code updates the docs in the same session** — not a follow-up,
not "if there's time". Add or correct whatever bullet the change touches, **in the
`.claude/*.md` file that owns that area**, before calling the work done. Update this root
file only when the change affects a project-wide rule or the documentation map itself.

Skip it only for changes with no architectural, conventions, or "what's real vs. placeholder"
consequence (a typo fix, a comment). Prefer correcting an existing bullet over appending a
new one, and delete what a change made untrue.
