# Deployment and migrations

The site is deployed to production. **Treat every schema change as a live-system change.**

## Migrations are applied manually, by the owner

Migrations live in `supabase/migrations/`. The owner applies them **by hand** against live
Supabase (staging first, then production). Every migration since `0012` has been manual.

- **Never assume a migration is applied without confirmation.** Ask.
- **Announce a new migration early**, before the code that depends on it is finished.
- **Applied migrations are historical records — never retro-edit them.** Rewriting one
  changes nothing in a database that already ran it. (This is why `0007`/`0009`/`0021` still
  read "Purok" after the Sitio rename; only the baseline was updated.)

## Two paths to a schema, and they don't mix

**New environment** (production, a fresh staging, a local dev database) standing up from
nothing → apply `supabase/baseline/0000_baseline_2026-07-23.sql`, a single-transaction squash
of `0001`–`0035` (`0031`–`0035` folded in after the fact). **The file's own header is
authoritative** on the range it covers, and earlier prose has been wrong about it more than
once — keep folding new migrations in as they land, so it stays contiguous and never needs a
"run X after" companion step.

**Existing environment** that already has some migrations applied → keep applying the
individual numbered migrations it is missing, in order. **The baseline assumes an empty
`public` schema and will fail loudly against one that already has any of them.**

Notes on the baseline:

- It deliberately ships **without** the demo seed content the early migrations insert
  (`0007_news_content.sql`, `0009_transparency.sql` — placeholder news, announcements,
  events, legislative/transparency documents), so a fresh production apply doesn't land mock
  content on the live public site.
- Backfills are omitted for the same reason `0014`'s and `0032`'s are: they rewrote rows a
  new database does not have.
- **It is a prepared artifact, not a proven one** — it has not been executed against any
  real database yet.
- It seeds `Sitios`/`Active Sitios`, unlike the numbered migrations.

## Deploy order is a real hazard class

**Apply the migration to staging, verify, then production, *before* the code that reads the
new columns reaches either environment.** A missing column fails **at runtime, not at
build**, and several of these fail quietly:

| Migration | What a skipped apply looks like |
|---|---|
| `0031` (profile name parts) | `listTeamUsers`/`listArchivedTeamUsers` catch and log rather than throw → `/admin/users` silently renders an **empty roster**, and `createTeamUser` fails with a generic "Could not save the profile." |
| `0032` (ticket timeline) | no `ticket_updates`, no `replied_at`, unwidened status CHECKs, no `ticket-media` bucket |
| `0033` (application name parts) | `listApplications` selects columns that don't exist; both inserts write them |
| `0035` (service flow) | `services.flow` reads `undefined`, every application is rejected silently |
| `0036` (bucket ceilings) | **no deploy-order hazard in either direction** — ceilings equal what code already enforces, so it may be applied before or after the code |

## Per-environment setup scripts

A new environment needs these **once**, or seeded rows point at objects that do not exist:

```bash
node scripts/upload-official-portraits.mjs   # officials directory images → officials-media
node scripts/upload-site-images.mjs          # Home/About blocks (migration 0021) → site-media
```

Source files for both live in `src/images/officials/` and `src/images/carousel/` — **script
source only, not app dependencies** (`.claude/ui-ux.md`). Both scripts seed the per-type
buckets directly; neither has touched the retired `public-media` since the `0028` split.

Read-only diagnostic, safe to run anywhere: `node scripts/report-orphaned-media.mjs`
(`.claude/storage.md`). `migrate-media-buckets.mjs` and `delete-old-media-buckets.mjs` are
spent one-time tools from the `0028`/`0030` bucket split.

## Environment variables

`.env.example` is the reference. Behaviour that differs by environment:

| Variable | Missing in development | Missing in production |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | one `console.warn`, verification skipped | **throws** — a keyless deploy 500s rather than shipping with no CAPTCHA |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | warns once, sending skipped | `console.error` per call, sending skipped (fail-open by design) |
| `NEXT_PUBLIC_SITE_URL` | falls back to `localhost:3000` | `console.error`, same fallback — emails then carry broken links |
| `TRUSTED_IP_HEADER` | unset — `requestIp()` never reads `cf-connecting-ip` | unset is correct here too: production is bare Vercel with no proxy in front, so leaving it unset is the safe default, not a gap |

- **`TRUSTED_IP_HEADER` is resolved once at module load, not per-request.** Changing it in
  production needs a new server instance (a redeploy) — an env-var edit plus a soft restart
  is not enough. Same shape as the Turnstile site key below: the value is effectively baked
  in until the next deploy.

- **The Turnstile *site* key is inlined at build time.** A key rotation needs a **rebuild**,
  not just an env change and a redeploy. Error 110200 in the browser is the symptom.
- **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.**
- No Supabase dashboard Redirect-URL entry is needed on any environment — the password-reset
  URL is built by the app and `redirectTo` is never sent.

## Build

`npm run build` produces a mix of static and dynamic/DB-backed routes. Check the route table
it prints: **a route that must not be prerendered will show `○`**, and the fix is
`export const dynamic = "force-dynamic"` (`.claude/backend.md`). This has already shipped
broken once — `/appointments/new` froze its demand map at build time.

## Content the barangay still owes (not code)

Officials' bios, the empty achievements timelines, and real PDFs for the seeded transparency
rows (`docs/BACKEND_HANDOFF.md` §6 items 8-10). The `Purok → Sitio` label lives in a
`site_items` row on each environment's database, so it is fixed through Site Content in the
admin portal **on staging and production separately** — not in the repo.
