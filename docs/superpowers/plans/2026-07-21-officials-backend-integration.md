# Officials Backend Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static officials array with a Supabase-backed directory, add `/officials/[slug]` profile pages, move the 12 portraits to Storage, and ship a `manage-officials`-gated admin manager — with zero visual change to the public directory.

**Architecture:** One new table (`public.officials`) following the exact shape of the existing transparency/news tables: RLS enabled with zero policies, all reads through the service-role client filtered by `.eq("status","published")`, all writes through Zod-validated Server Actions behind `requirePermission("manage-officials")`. Portraits live in the existing `public-media` bucket under `officials/`. The public feature module gains a `queries.ts`; the admin feature module gains `queries/officials.ts`, `actions/officials.ts`, and two client components.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Supabase (Postgres + Storage), zod **v4**.

**Design doc:** `docs/superpowers/specs/2026-07-21-officials-backend-integration-design.md`

## Global Constraints

- **No test framework exists and none may be added.** Verification for every task = `npm run typecheck` + `npm run lint` + driving the running app (recipe in `.claude/skills/verify/SKILL.md`).
- **`group` is a SQL reserved word.** Quote it as `"group"` in DDL and in every PostgREST `.select()` / `.order()` string. An unquoted `group` produces a confusing PostgREST parse error.
- **zod is v4**, not v3.
- **RLS is enabled with zero policies on every table.** Never add a policy. The service-role client behind an explicit `requirePermission(...)` check is the entire auth gate.
- **Server Actions are public HTTP endpoints.** Re-validate every argument at runtime with Zod — including enum-typed ones like `status` and `folder`, which TypeScript cannot enforce across the wire.
- **Design tokens only:** `brand-100`…`brand-800` (there is no `brand-50`/`brand-900`), `ink-*`, `danger*`. No blue tokens. Space Grotesk (`font-display`) headings, Inter body.
- **Identity:** "Barangay San Fernando, San Nicolas, Ilocos Norte." San Nicolas is a **municipality** ("Municipal", never "City"). Area code **(077)**. Any "Sampaguita" in `src/` is a regression.
- **Never `git add -A`.** Stage explicit paths only. `proposal/`, `stitch_tabbed_content_manager/`, `stitch_tabbed_content_manager.zip`, and `stitch/barangay_sampaguita_barangay_officials/code.html` must never be staged.
- **Migrations are applied manually by the repo owner** against live Supabase staging. Never assume a migration is applied without explicit confirmation.
- **Do not delete or modify DB rows or storage objects the agent did not create.** Never bulk-delete.
- Every commit message ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

**Create:**
| File | Responsibility |
| --- | --- |
| `supabase/migrations/0012_officials.sql` | `official_group` enum, `officials` table, index, RLS, trigger, 12-row seed |
| `scripts/upload-official-portraits.mjs` | One-time: push the 12 bundled portraits to `public-media/officials/` |
| `src/features/officials/queries.ts` | Public reads: `listPublishedOfficials`, `getPublishedOfficialBySlug` |
| `src/app/(public)/officials/[slug]/page.tsx` | Public profile page + `generateMetadata` |
| `src/features/admin/queries/officials.ts` | Admin reads: `listAdminOfficials`, `getOfficialForEdit` |
| `src/features/admin/actions/officials.ts` | Writes: save / status / delete / reorder |
| `src/features/admin/components/officials-manager.tsx` | Client manager: stat cards, filters, table, reorder |
| `src/features/admin/components/official-form.tsx` | Client drawer editor |
| `src/app/admin/(portal)/officials/page.tsx` | Admin route (server), permission gate |

**Modify:**
| File | Change |
| --- | --- |
| `src/types/index.ts` | Add `OfficialListItem`, `OfficialDetail`, `OfficialValues`, `AdminOfficialRow`; retire `Official` |
| `src/features/officials/data.ts` | Delete `OFFICIALS` + portrait imports; keep `TERM_LABEL` |
| `src/features/officials/components/leadership-directory.tsx` | Becomes async, reads from `queries.ts` |
| `src/components/shared/official-card.tsx` | Consumes `OfficialListItem`; portrait + name link to profile |
| `src/features/admin/actions/media.ts` | Generalize to the `officials` folder with per-folder permission |
| `src/features/admin/components/single-image-uploader.tsx` | Widen `folder` prop |
| `src/features/admin/data.ts` | Add the Officials nav item |
| `src/features/admin/index.ts` | Barrel-export the two new components |
| `docs/BACKEND_HANDOFF.md`, `CLAUDE.md` | Record that officials are now DB-backed |

### Documented deviations from the design doc

Both are deliberate; implement them as written here.

1. **Type names follow codebase convention.** The design doc says `OfficialRecord` / `OfficialFormValues`; the codebase's actual convention is `AdminLegislativeRow` / `LegislativeValues`. This plan uses **`AdminOfficialRow`** and **`OfficialValues`** to match.
2. **Reorder uses up/down buttons, not drag-and-drop.** The repo already reorders news photos with buttons (recorded as a known simplification in `BACKEND_HANDOFF` §6.7). Buttons are accessible by default, need no DnD library, and 12 rows never need dragging. Same persisted result: a `sort_order` rewrite.

---

### Task 1: Database table, seed, and portraits in Storage

**Files:**
- Create: `supabase/migrations/0012_officials.sql`
- Create: `scripts/upload-official-portraits.mjs`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: table `public.officials` with 12 published rows whose `photo_path` values are `officials/<slug>.<ext>`; 12 objects in the `public-media` bucket at those exact paths.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_officials.sql`:

```sql
-- Officials (Plan 6 — master spec §6; design doc
-- docs/superpowers/specs/2026-07-21-officials-backend-integration-design.md).
--
-- RLS: enabled with NO policies, exactly like every other table. Public reads
-- go through the service-role client with an explicit .eq("status","published")
-- filter; writes go through Server Actions behind
-- requirePermission("manage-officials"). The code check is the entire gate.
--
-- Storage: portraits live in the EXISTING `public-media` bucket under an
-- `officials/` prefix. No new bucket — a portrait is a 2MB image, the same
-- class of object as a news photo, and `public-documents` exists only because
-- PDFs carry a different (10MB) limit.
--
-- NOTE: `group` is a SQL reserved word. It is quoted as "group" here and must
-- be quoted in every PostgREST select/order string too.

create type public.official_group as enum ('executive', 'council', 'administration');

create table public.officials (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  role text not null,
  "group" public.official_group not null,
  badge text,
  -- Nullable so a draft can be saved before the portrait is ready. Publishing
  -- requires one (enforced in setOfficialStatus), so every row the public
  -- queries can return has a portrait.
  photo_path text,
  photo_alt text not null default '',
  term text not null default '',
  email text,
  phone text,
  bio text not null default '',
  sort_order int not null default 0,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index officials_status_group_sort_idx
  on public.officials (status, "group", sort_order);

alter table public.officials enable row level security;

create trigger officials_updated_at
  before update on public.officials
  for each row execute function public.set_updated_at();

-- ── Seed: the 12 real officials ─────────────────────────────────────────────
-- Names, roles, groups, badge, emails and phones are carried over verbatim
-- from src/features/officials/data.ts so the public page is unchanged on day
-- one. Emails/phones remain placeholder-shaped (real contact data is still
-- owed by the barangay); bio is empty until the barangay supplies one.
--
-- photo_path points at deterministic Storage paths that
-- scripts/upload-official-portraits.mjs populates. Run that script BEFORE
-- applying this migration.
insert into public.officials
  (slug, name, role, "group", badge, photo_path, photo_alt, term, email, phone, sort_order, status, published_at)
values
  ('dominic-b-dela-cruz', 'Hon. Dominic B. Dela Cruz', 'Punong Barangay', 'executive', null,
   'officials/dominic-b-dela-cruz.jpg', 'Portrait of Punong Barangay Dominic B. Dela Cruz',
   '2023-2026', 'captain@sanfernando.gov.ph', '+63 912 345 6789', 1, 'published', now()),
  ('geroly-b-aggasid', 'Hon. Geroly B. Aggasid', 'Barangay Kagawad', 'council', null,
   'officials/geroly-b-aggasid.png', 'Portrait of Kagawad Geroly B. Aggasid',
   '2023-2026', 'g.aggasid@sanfernando.gov.ph', '(077) 123 4571', 2, 'published', now()),
  ('ronnel-t-paguirigan', 'Hon. Ronnel T. Paguirigan', 'Barangay Kagawad', 'council', null,
   'officials/ronnel-t-paguirigan.png', 'Portrait of Kagawad Ronnel T. Paguirigan',
   '2023-2026', 'r.paguirigan@sanfernando.gov.ph', '(077) 123 4572', 3, 'published', now()),
  ('segundo-t-butay', 'Hon. Segundo T. Butay', 'Barangay Kagawad', 'council', null,
   'officials/segundo-t-butay.png', 'Portrait of Kagawad Segundo T. Butay',
   '2023-2026', 's.butay@sanfernando.gov.ph', '(077) 123 4573', 4, 'published', now()),
  ('noel-a-ribao', 'Hon. Noel A. Ribao', 'Barangay Kagawad', 'council', null,
   'officials/noel-a-ribao.png', 'Portrait of Kagawad Noel A. Ribao',
   '2023-2026', 'n.ribao@sanfernando.gov.ph', '(077) 123 4574', 5, 'published', now()),
  ('ruthsen-faye-m-gonzales', 'Hon. Ruthsen Faye M. Gonzales', 'Barangay Kagawad', 'council', null,
   'officials/ruthsen-faye-m-gonzales.png', 'Portrait of Kagawad Ruthsen Faye M. Gonzales',
   '2023-2026', 'r.gonzales@sanfernando.gov.ph', '(077) 123 4575', 6, 'published', now()),
  ('lydia-b-butay', 'Hon. Lydia B. Butay', 'Barangay Kagawad', 'council', null,
   'officials/lydia-b-butay.png', 'Portrait of Kagawad Lydia B. Butay',
   '2023-2026', 'l.butay@sanfernando.gov.ph', '(077) 123 4576', 7, 'published', now()),
  ('mariene-a-butay', 'Hon. Mariene A. Butay', 'Barangay Kagawad', 'council', null,
   'officials/mariene-a-butay.png', 'Portrait of Kagawad Mariene A. Butay',
   '2023-2026', 'm.butay@sanfernando.gov.ph', '(077) 123 4577', 8, 'published', now()),
  ('jake-b-de-la-cruz', 'Hon. Jake B. De La Cruz', 'SK Chairman', 'council', 'Youth Leader',
   'officials/jake-b-de-la-cruz.png', 'Portrait of SK Chairman Jake B. De La Cruz',
   '2023-2026', 'sk@sanfernando.gov.ph', '(077) 123 4578', 9, 'published', now()),
  ('sharah-mae-r-lagundi', 'Ms. Sharah Mae R. Lagundi', 'Barangay Secretary', 'administration', null,
   'officials/sharah-mae-r-lagundi.png', 'Portrait of Barangay Secretary Sharah Mae R. Lagundi',
   '2023-2026', 'secretary@sanfernando.gov.ph', '(077) 123 4568', 10, 'published', now()),
  ('mariela-a-tolentino', 'Ms. Mariela A. Tolentino', 'Barangay Treasurer', 'administration', null,
   'officials/mariela-a-tolentino.png', 'Portrait of Barangay Treasurer Mariela A. Tolentino',
   '2023-2026', 'treasurer@sanfernando.gov.ph', '(077) 123 4569', 11, 'published', now()),
  ('mary-kaye-a-maltezo', 'Ms. Mary Kaye A. Maltezo', 'Barangay Administrative Assistant', 'administration', null,
   'officials/mary-kaye-a-maltezo.png', 'Portrait of Barangay Administrative Assistant Mary Kaye A. Maltezo',
   '2023-2026', 'admin@sanfernando.gov.ph', '(077) 123 4570', 12, 'published', now());
```

- [ ] **Step 2: Write the one-time portrait upload script**

Create `scripts/upload-official-portraits.mjs`. It reads credentials from `.env.local` (never hardcode them), uploads with `upsert: true` so re-running is safe, and only ever **creates** objects:

```js
// One-time migration helper (Plan 6): push the 12 bundled official portraits
// to the `public-media` bucket at the deterministic paths seeded by
// supabase/migrations/0012_officials.sql.
//
// Run BEFORE applying 0012 so the objects exist when the rows land:
//   node scripts/upload-official-portraits.mjs
//
// Idempotent (upsert: true). Creates objects only — never deletes.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Minimal .env.local reader — the app uses Next's loader, but a bare node
// script has to parse it itself.
const env = {};
for (const line of (await readFile(".env.local", "utf8")).split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// source filename → storage path (must match 0012_officials.sql exactly)
const PORTRAITS = [
  ["Punong Barangay - Domini B. Dela Cruz.jpg", "officials/dominic-b-dela-cruz.jpg", "image/jpeg"],
  ["Kagawad No. 1 - Hon. Geroly B. Aggasid.png", "officials/geroly-b-aggasid.png", "image/png"],
  ["Kagawad No. 2 - Hon. Ronnel T. Paguirigan.png", "officials/ronnel-t-paguirigan.png", "image/png"],
  ["Kagawad No. 3 - Hon. Segundo T. Butay.png", "officials/segundo-t-butay.png", "image/png"],
  ["Kagawad No. 4 - Hon. Noel A. Ribao.png", "officials/noel-a-ribao.png", "image/png"],
  ["Kagawad No. 5 - Hon. Ruthsen Faye M. Gonzales.png", "officials/ruthsen-faye-m-gonzales.png", "image/png"],
  ["Kagawad No. 6 - Hon. Lydia B. Butay.png", "officials/lydia-b-butay.png", "image/png"],
  ["Kagawad No. 7 - Hon. Mariene A. Butay.png", "officials/mariene-a-butay.png", "image/png"],
  ["Barangay SK Chairman - Hon. Jake B. De La Cruz.png", "officials/jake-b-de-la-cruz.png", "image/png"],
  ["Barangay Secretary - Sharah Mae R. Lagundi.png", "officials/sharah-mae-r-lagundi.png", "image/png"],
  ["Barangay Treasurer - Mariela A. Tolentino.png", "officials/mariela-a-tolentino.png", "image/png"],
  ["Barangay Administrative Assistant - Mary Kaye A. Maltezo.png", "officials/mary-kaye-a-maltezo.png", "image/png"],
];

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;
for (const [filename, path, contentType] of PORTRAITS) {
  const body = await readFile(join("src", "images", "officials", filename));
  const { error } = await supabase.storage
    .from("public-media")
    .upload(path, body, { contentType, upsert: true });
  if (error) {
    console.error(`FAIL ${path}: ${error.message}`);
    failed += 1;
  } else {
    console.log(`ok   ${path} (${(body.length / 1024).toFixed(0)} KB)`);
  }
}
console.log(failed === 0 ? `\nAll ${PORTRAITS.length} portraits uploaded.` : `\n${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 3: Verify the bundled filenames match the script**

The script fails loudly on a typo, but check first — one filename is misspelled upstream ("Domini", not "Dominic"), which is pre-existing and intentional.

Run: `ls "src/images/officials/"`
Expected: 12 files whose names exactly match column 1 of `PORTRAITS`.

- [ ] **Step 4: Run the upload script**

Run: `node scripts/upload-official-portraits.mjs`
Expected: 12 `ok officials/…` lines, then `All 12 portraits uploaded.` and exit code 0.

- [ ] **Step 5: Hand the migration to the repo owner and wait for confirmation**

Migrations are applied **manually** by the owner against Supabase staging. Ask them to apply `0012_officials.sql`, and do not proceed until they confirm. Do not attempt to apply it from code.

- [ ] **Step 6: Verify the table and seed after the owner confirms**

Ask the owner to run this in the Supabase SQL editor (or run it via a throwaway script in the scratchpad using the service-role key):

```sql
select count(*) as total,
       count(*) filter (where status = 'published') as published,
       count(*) filter (where photo_path is null) as missing_photo
from public.officials;
```
Expected: `total = 12`, `published = 12`, `missing_photo = 0`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0012_officials.sql scripts/upload-official-portraits.mjs
git commit -F - <<'EOF'
feat(officials): add officials table, seed, and portrait upload script

0012 creates public.officials (RLS enabled, zero policies) and seeds the
12 real officials with deterministic public-media portrait paths. The
one-time script pushes the bundled portraits to those paths; it is
idempotent and only ever creates objects.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 2: Types, public queries, and the DB-backed directory

**Files:**
- Modify: `src/types/index.ts:89-101`
- Create: `src/features/officials/queries.ts`
- Modify: `src/features/officials/data.ts`
- Modify: `src/features/officials/components/leadership-directory.tsx`
- Modify: `src/components/shared/official-card.tsx`

**Interfaces:**
- Consumes: the `officials` table from Task 1.
- Produces: `OfficialListItem`, `OfficialDetail`, `OfficialValues`, `AdminOfficialRow` in `@/types`; `listPublishedOfficials(): Promise<OfficialListItem[]>` and `getPublishedOfficialBySlug(slug: string): Promise<OfficialDetail | null>` in `@/features/officials/queries`.

- [ ] **Step 1: Replace the `Official` interface with the DB-backed types**

In `src/types/index.ts`, keep `OfficialGroup` (line 89) and replace the `Official` interface (lines 91-101) with:

```ts
/**
 * Public directory card. `photoUrl` is always resolved — publishing requires a
 * portrait. `email`/`phone` belong here, not only on the detail type: the
 * portrait card already renders mailto/tel icons today.
 */
export interface OfficialListItem {
  id: string;
  slug: string;
  name: string;
  role: string;
  group: OfficialGroup;
  badge: string | null;
  photoUrl: string;
  photoAlt: string;
  email: string | null;
  phone: string | null;
}

/** Public profile page (`/officials/[slug]`). */
export interface OfficialDetail extends OfficialListItem {
  term: string;
  bio: string;
}

/** Drawer editor POST/PUT body. */
export interface OfficialValues {
  name: string;
  role: string;
  group: OfficialGroup;
  badge: string | null;
  photoPath: string | null;
  photoAlt: string;
  term: string;
  email: string | null;
  phone: string | null;
  bio: string;
}

/** Admin table row. */
export interface AdminOfficialRow {
  id: string;
  slug: string;
  name: string;
  role: string;
  group: OfficialGroup;
  photoUrl: string | null;
  sortOrder: number;
  status: ContentStatus;
}
```

`StaticImageData` may now be unused in this file — if `npm run lint` reports its import as unused, remove it; if other types still use it, leave it.

- [ ] **Step 2: Write the public query layer**

Create `src/features/officials/queries.ts`:

```ts
import "server-only";
import type { OfficialDetail, OfficialGroup, OfficialListItem } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";

// `group` is a SQL reserved word — it must stay quoted in PostgREST selects.
const LIST_COLUMNS =
  'id, slug, name, role, "group", badge, photo_path, photo_alt, email, phone';

interface OfficialRow {
  id: string;
  slug: string;
  name: string;
  role: string;
  group: OfficialGroup;
  badge: string | null;
  photo_path: string | null;
  photo_alt: string;
  email: string | null;
  phone: string | null;
  term?: string;
  bio?: string;
}

function toListItem(row: OfficialRow): OfficialListItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    group: row.group,
    badge: row.badge,
    // Non-null by construction: the queries below exclude rows without a
    // portrait, and publishing requires one.
    photoUrl: photoUrl(row.photo_path as string),
    photoAlt: row.photo_alt,
    email: row.email,
    phone: row.phone,
  };
}

/** Published officials in directory order. Grouping is the caller's job. */
export async function listPublishedOfficials(): Promise<OfficialListItem[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select(LIST_COLUMNS)
    .eq("status", "published")
    // Belt-and-braces against a portrait-less row reaching a card and
    // rendering a broken image; setOfficialStatus already blocks it.
    .not("photo_path", "is", null)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as OfficialRow[]).map(toListItem);
}

export async function getPublishedOfficialBySlug(slug: string): Promise<OfficialDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select(`${LIST_COLUMNS}, term, bio`)
    .eq("status", "published")
    .not("photo_path", "is", null)
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as OfficialRow;
  return {
    ...toListItem(row),
    term: row.term ?? "",
    bio: row.bio ?? "",
  };
}
```

- [ ] **Step 3: Strip the static array from `data.ts`**

Replace the entire contents of `src/features/officials/data.ts` with:

```ts
/**
 * Officials are DB-backed (table `public.officials`, migration 0012) and are
 * edited through /admin/officials — there is no static array here any more.
 * Only the site-level current term survives, for the officials page hero.
 * The 12 bundled portraits in `src/images/officials/` are now the source for
 * `scripts/upload-official-portraits.mjs`, not for the app.
 */
export const TERM_LABEL = "2023-2026";
```

- [ ] **Step 4: Make the directory read from the database**

Replace `src/features/officials/components/leadership-directory.tsx` with:

```tsx
import { Section } from "@/components/ui/section";
import { DividerHeading } from "@/components/shared/divider-heading";
import { OfficialCard } from "@/components/shared/official-card";
import { listPublishedOfficials } from "@/features/officials/queries";

/** Complete officials directory: chief executive, council, and administrative staff. */
export async function LeadershipDirectory() {
  const officials = await listPublishedOfficials();
  const executive = officials.filter((official) => official.group === "executive");
  const council = officials.filter((official) => official.group === "council");
  const administration = officials.filter((official) => official.group === "administration");

  return (
    <Section>
      <div className="mb-20">
        <DividerHeading>Chief Executive</DividerHeading>
        <div className="flex justify-center">
          <div className="w-full max-w-md">
            {executive.map((official) => (
              <OfficialCard key={official.id} official={official} />
            ))}
          </div>
        </div>
      </div>

      <div className="mb-20">
        <DividerHeading>Barangay Council</DividerHeading>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {council.map((official) => (
            <OfficialCard
              key={official.id}
              official={official}
              highlighted={Boolean(official.badge)}
            />
          ))}
        </div>
      </div>

      <div>
        <DividerHeading>Administration</DividerHeading>
        <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-8">
          {administration.map((official) => (
            <div key={official.id} className="w-full md:w-[calc(50%-1rem)]">
              <OfficialCard official={official} variant="compact" />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 5: Point the card at the new type and link it to the profile**

Replace `src/components/shared/official-card.tsx` with the version below. The portrait and name become a `Link`; the `mailto:`/`tel:` icons stay **outside** it because anchors cannot nest. Padding is split (`px-4 pt-4` + `px-4 pb-4`) so spacing is unchanged.

```tsx
import Image from "next/image";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toTelHref } from "@/lib/format";
import { Card } from "@/components/ui/card";
import type { OfficialListItem } from "@/types";

interface OfficialCardProps {
  official: OfficialListItem;
  /** "portrait" — photo-first grid card; "compact" — horizontal row with avatar. */
  variant?: "portrait" | "compact";
  highlighted?: boolean;
}

function ContactIcons({ official }: { official: OfficialListItem }) {
  return (
    <div className="mt-3 flex justify-center gap-2">
      {official.email ? (
        <a
          href={`mailto:${official.email}`}
          aria-label={`Email ${official.name}`}
          className="p-2 text-ink-400 transition-colors hover:text-brand-600"
        >
          <Mail className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : null}
      {official.phone ? (
        <a
          href={toTelHref(official.phone)}
          aria-label={`Call ${official.name}`}
          className="p-2 text-ink-400 transition-colors hover:text-brand-600"
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

/** Directory card for barangay officials, in portrait and compact layouts. */
export function OfficialCard({ official, variant = "portrait", highlighted = false }: OfficialCardProps) {
  if (variant === "compact") {
    return (
      <Card className="p-0">
        {/* Compact contacts are plain text, not links, so the whole card can be one link. */}
        <Link href={`/officials/${official.slug}`} className="flex items-center gap-6 p-6">
          <Image
            src={official.photoUrl}
            alt={official.photoAlt}
            width={96}
            height={96}
            className="h-24 w-24 shrink-0 rounded-full border-2 border-ink-900/10 object-cover"
          />
          <div>
            <h4 className="font-display font-semibold tracking-tight text-ink-900">{official.name}</h4>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">{official.role}</p>
            <div className="mt-2 flex flex-col gap-1 text-[13px] text-ink-600">
              {official.email ? (
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4" aria-hidden="true" /> {official.email}
                </span>
              ) : null}
              {official.phone ? (
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4" aria-hidden="true" /> {official.phone}
                </span>
              ) : null}
            </div>
          </div>
        </Link>
      </Card>
    );
  }

  return (
    <Card className={cn("group overflow-hidden", highlighted && "ring-2 ring-brand-400/20")}>
      <Link href={`/officials/${official.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden rounded-2xl">
          <Image
            src={official.photoUrl}
            alt={official.photoAlt}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {official.badge ? (
            <span className="absolute right-2 top-2 rounded-full bg-ink-900 px-2 py-1 text-[10px] font-bold uppercase text-white">
              {official.badge}
            </span>
          ) : null}
        </div>
        <div className="px-4 pt-4 text-center">
          <h4 className="font-display font-semibold tracking-tight text-ink-900">{official.name}</h4>
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-wider text-brand-700",
              highlighted && "font-bold text-ink-900",
            )}
          >
            {official.role}
          </p>
        </div>
      </Link>
      <div className="px-4 pb-4 text-center">
        <ContactIcons official={official} />
      </div>
    </Card>
  );
}
```

**Note:** `ContactIcons` reads `official.email` / `official.phone` — both are on `OfficialListItem` (Step 1) and selected in `LIST_COLUMNS` (Step 2), so the portrait card keeps the mail/phone icons it shows today.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass with no errors. The most likely failures are a stale `Official` import (in `official-card.tsx` or `leadership-directory.tsx`) and the unused `StaticImageData` import in `types/index.ts`.

- [ ] **Step 7: Verify the directory in the running app**

Start the dev server if it isn't already running (`npm run dev`) and open `http://localhost:3000/officials`.
Expected: all 12 officials render in the same three sections, same layout, same portraits as before. The SK Chairman still shows the "Youth Leader" badge and the highlight ring. Hovering a card shows a pointer; the cards are not yet clickable to a real page (Task 3 adds it — a 404 here is expected).

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/features/officials/queries.ts src/features/officials/data.ts src/features/officials/components/leadership-directory.tsx src/components/shared/official-card.tsx
git commit -F - <<'EOF'
feat(officials): render the public directory from Supabase

Adds the officials query layer and the DB-backed view types, makes
LeadershipDirectory async, and retires the static OFFICIALS array. Cards
now link to /officials/<slug>; the mailto/tel icons stay outside that link
because anchors cannot nest. No visual change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 3: Public profile page

**Files:**
- Create: `src/app/(public)/officials/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getPublishedOfficialBySlug` from `@/features/officials/queries`; `OfficialDetail` from `@/types`.
- Produces: the route `/officials/[slug]`.

- [ ] **Step 1: Write the profile page**

Create `src/app/(public)/officials/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { toTelHref } from "@/lib/format";
import { getPublishedOfficialBySlug } from "@/features/officials/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const official = await getPublishedOfficialBySlug(slug);
  if (!official) return { title: "Official not found" };
  const description = official.bio.trim()
    ? official.bio.slice(0, 160)
    : `${official.name}, ${official.role} of Barangay San Fernando, San Nicolas, Ilocos Norte.`;
  return {
    title: `${official.name} — ${official.role}`,
    description,
    openGraph: { images: [{ url: official.photoUrl }] },
  };
}

export default async function OfficialProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const official = await getPublishedOfficialBySlug(slug);
  if (!official) notFound();

  return (
    <Section className="pt-32 md:pt-44">
      <Link
        href="/officials"
        className="text-sm font-semibold text-ink-500 hover:text-ink-900 hover:underline"
      >
        ← Back to Barangay Officials
      </Link>

      <div className="mt-8 grid gap-10 md:grid-cols-[280px_1fr]">
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-ink-200/70">
          <Image
            src={official.photoUrl}
            alt={official.photoAlt}
            fill
            sizes="(min-width: 768px) 280px, 100vw"
            className="object-cover"
            priority
          />
        </div>

        <div>
          {official.badge ? (
            <Badge variant="soft" className="mb-4">
              {official.badge}
            </Badge>
          ) : null}
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 md:text-4xl">
            {official.name}
          </h1>
          <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-brand-700">
            {official.role}
          </p>
          {official.term ? (
            <p className="mt-1 text-ink-500">Term {official.term}</p>
          ) : null}

          {official.email || official.phone ? (
            <div className="mt-6 flex flex-col gap-2">
              {official.email ? (
                <a
                  href={`mailto:${official.email}`}
                  className="flex items-center gap-2 text-ink-600 transition-colors hover:text-brand-700"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {official.email}
                </a>
              ) : null}
              {official.phone ? (
                <a
                  href={toTelHref(official.phone)}
                  className="flex items-center gap-2 text-ink-600 transition-colors hover:text-brand-700"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {official.phone}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {official.bio ? (
        <div className="mt-12 max-w-3xl">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink-900">About</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-600">{official.bio}</p>
        </div>
      ) : null}
    </Section>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 3: Verify in the running app**

1. Open `http://localhost:3000/officials` and click the Punong Barangay's portrait.
   Expected: navigates to `/officials/dominic-b-dela-cruz`; portrait, name, "Punong Barangay", "Term 2023-2026", and both contacts render. **No "About" heading appears** (all seeded bios are empty).
2. Click a compact administration card.
   Expected: navigates to that official's profile.
3. Open `http://localhost:3000/officials/not-a-real-person`.
   Expected: the 404 page.
4. On `/officials`, click a card's mail icon.
   Expected: opens a mail composer — it does **not** navigate to the profile.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(public)/officials/[slug]/page.tsx"
git commit -F - <<'EOF'
feat(officials): add public profile pages at /officials/[slug]

Portrait, identity, term, contacts, and bio, with OG metadata. The About
block is omitted entirely while the bio is empty, which is the day-one
state for all 12 seeded officials.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 4: Admin write layer

**Files:**
- Modify: `src/features/admin/actions/media.ts`
- Modify: `src/features/admin/components/single-image-uploader.tsx:14`
- Create: `src/features/admin/queries/officials.ts`
- Create: `src/features/admin/actions/officials.ts`

**Interfaces:**
- Consumes: `OfficialValues`, `AdminOfficialRow`, `ContentStatus` from `@/types`; `requirePermission` from `@/lib/auth`; `recordActivity` from `@/lib/audit`.
- Produces:
  - `listAdminOfficials(): Promise<AdminOfficialRow[]>`
  - `getOfficialForEdit(id): Promise<{ values: OfficialValues; status: ContentStatus; photoUrl: string | null } | null>`
  - `getOfficialForEditAction(id)` (client-callable)
  - `saveOfficial(id: string | null, values: OfficialValues): Promise<SaveResult>`
  - `setOfficialStatus(id: string, status: ContentStatus): Promise<ActionResult>`
  - `deleteOfficial(id: string): Promise<ActionResult>`
  - `reorderOfficials(orderedIds: string[]): Promise<ActionResult>`
  - `ImageFolder` type exported from `media.ts`

- [ ] **Step 1: Generalize the image upload action to the officials folder**

The `folder` argument crosses the wire from a client component, so it is attacker-controlled and must be validated **before** it selects a permission. Replace `src/features/admin/actions/media.ts` with:

```ts
"use server";

import type { Permission } from "@/types";
import { requirePermission } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PUBLIC_MEDIA_BUCKET,
  extForType,
  photoUrl,
} from "@/lib/storage";

export interface ActionResult {
  error: string | null;
}
export interface UploadResult {
  error: string | null;
  /** Raw storage path to persist in image_src / cover_src / photo_path. */
  src: string | null;
  /** Resolved public URL, for immediate preview. */
  url: string | null;
}

export type ImageFolder = "announcements" | "events" | "officials";

/**
 * Which permission owns each folder. `folder` arrives from a client component
 * over a Server Action — a public HTTP endpoint — so an unknown value must be
 * rejected rather than fed to requirePermission(). Returning null here is what
 * stops a caller from inventing a folder to dodge the permission check.
 */
function permissionForFolder(folder: string): Permission | null {
  if (folder === "announcements" || folder === "events") return "manage-news";
  if (folder === "officials") return "manage-officials";
  return null;
}

/**
 * Upload one image for a single-slot field (announcement image, event cover,
 * official portrait). Persisting the returned `src` is the caller's job — this
 * keeps the action reusable across tables without a discriminator.
 */
export async function uploadSingleImage(
  folder: ImageFolder,
  formData: FormData,
): Promise<UploadResult> {
  const permission = permissionForFolder(folder);
  if (!permission) return { error: "Unknown upload folder.", src: null, url: null };
  await requirePermission(permission);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image.", src: null, url: null };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { error: "Images must be JPG, PNG, or WebP.", src: null, url: null };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "The image must be 2 MB or smaller.", src: null, url: null };
  }

  const path = `${folder}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(PUBLIC_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", src: null, url: null };

  return { error: null, src: path, url: photoUrl(path) };
}

/** Delete an owned storage object. A remote seed URL is left alone. */
export async function removeStoredImage(src: string): Promise<ActionResult> {
  if (/^https?:\/\//i.test(src)) return { error: null };

  const folder = src.split("/")[0] ?? "";
  const permission = permissionForFolder(folder);
  if (!permission) return { error: "That image cannot be removed." };
  await requirePermission(permission);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(PUBLIC_MEDIA_BUCKET).remove([src]);
  if (error) return { error: "Could not remove the image." };
  return { error: null };
}
```

**Careful:** the original `removeStoredImage` called `requirePermission("manage-news")` *before* the remote-URL early return. The version above returns first — a remote seed URL is a no-op that touches nothing, so gating it adds nothing. Keep this ordering.

- [ ] **Step 2: Widen the uploader's folder prop**

In `src/features/admin/components/single-image-uploader.tsx`, change the import on line 8 and the prop type on line 14:

```tsx
import { uploadSingleImage, type ImageFolder } from "@/features/admin/actions/media";
```

```tsx
  folder: ImageFolder;
```

- [ ] **Step 3: Write the admin query layer**

Create `src/features/admin/queries/officials.ts`:

```ts
import "server-only";
import type { AdminOfficialRow, ContentStatus, OfficialGroup, OfficialValues } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { photoUrl } from "@/lib/storage";

/** Every official, all statuses, in directory order. */
export async function listAdminOfficials(): Promise<AdminOfficialRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    // `group` is a SQL reserved word — keep it quoted.
    .select('id, slug, name, role, "group", photo_path, sort_order, status')
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    role: row.role as string,
    group: row.group as OfficialGroup,
    photoUrl: row.photo_path ? photoUrl(row.photo_path as string) : null,
    sortOrder: row.sort_order as number,
    status: row.status as ContentStatus,
  }));
}

export async function getOfficialForEdit(
  id: string,
): Promise<{ values: OfficialValues; status: ContentStatus; photoUrl: string | null } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("officials")
    .select('name, role, "group", badge, photo_path, photo_alt, term, email, phone, bio, status')
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return {
    values: {
      name: data.name as string,
      role: data.role as string,
      group: data.group as OfficialGroup,
      badge: (data.badge as string) ?? null,
      photoPath: (data.photo_path as string) ?? null,
      photoAlt: (data.photo_alt as string) ?? "",
      term: (data.term as string) ?? "",
      email: (data.email as string) ?? null,
      phone: (data.phone as string) ?? null,
      bio: (data.bio as string) ?? "",
    },
    status: data.status as ContentStatus,
    photoUrl: data.photo_path ? photoUrl(data.photo_path as string) : null,
  };
}
```

- [ ] **Step 4: Write the write actions**

Create `src/features/admin/actions/officials.ts`. The portrait is uploaded eagerly by `SingleImageUploader` (which returns a path), so — unlike `saveLegislative` — this action only persists `photoPath`; there is no deferred-upload compensation to manage.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ContentStatus, OfficialValues } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOfficialForEdit } from "@/features/admin/queries/officials";
import { removeStoredImage } from "./media";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

/** Optional text field: "" from an input means "not set" → SQL NULL. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

const schema = z.object({
  name: z.string().trim().min(3, "Enter the official's full name."),
  role: z.string().trim().min(3, "Enter their position."),
  group: z.enum(["executive", "council", "administration"]),
  badge: optionalText,
  photoPath: z.string().nullable(),
  photoAlt: z.string(),
  term: z.string().trim(),
  email: optionalText,
  phone: optionalText,
  bio: z.string(),
});

// Server Actions are public HTTP endpoints — `ContentStatus` only constrains
// callers that go through TypeScript. A direct POST can send any string.
const statusSchema = z.enum(["draft", "in-review", "published", "archived"]);

// `z.uuid()` is the zod v4 top-level form; the v3 `z.string().uuid()` spelling
// is deprecated in v4.
const reorderSchema = z.array(z.uuid()).min(1).max(200);

/** Honorifics are titles, not names — they make for noisy, colliding URLs. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^(hon\.?|ms\.?|mrs\.?|mr\.?|dr\.?|engr\.?)\s+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function revalidate(slug?: string) {
  revalidatePath("/admin/officials");
  revalidatePath("/officials");
  if (slug) revalidatePath(`/officials/${slug}`);
}

// `ok` is a literal-typed discriminant so `if (!result.ok)` narrows `slug`.
type SlugResult = { ok: true; slug: string } | { ok: false; error: string };

/** Ensure a slug is unique, suffixing -2, -3… (ignoring the row being edited). */
async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
  ignoreId: string | null,
): Promise<SlugResult> {
  const { data, error } = await admin.from("officials").select("id, slug");
  if (error) return { ok: false, error: "Could not save the official. Try again." };
  const taken = new Set((data ?? []).filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return { ok: true, slug: base };
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return { ok: true, slug: candidate };
  }
}

/**
 * Client-callable counterpart to `getOfficialForEdit` (which is `server-only`
 * and cannot be imported into the "use client" manager).
 */
export async function getOfficialForEditAction(id: string) {
  await requirePermission("manage-officials");
  return getOfficialForEdit(id);
}

export async function saveOfficial(
  id: string | null,
  values: OfficialValues,
): Promise<SaveResult> {
  const actor = await requirePermission("manage-officials");
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };
  }

  const admin = createSupabaseAdminClient();
  const base = slugify(parsed.data.name);
  if (!base) return { error: "Enter a name with letters or numbers.", id: null };

  const patch = {
    name: parsed.data.name,
    role: parsed.data.role,
    group: parsed.data.group,
    badge: parsed.data.badge,
    photo_path: parsed.data.photoPath,
    photo_alt: parsed.data.photoAlt,
    term: parsed.data.term,
    email: parsed.data.email,
    phone: parsed.data.phone,
    bio: parsed.data.bio,
  };

  if (id) {
    const { data: existing, error: readErr } = await admin
      .from("officials")
      .select("status, slug, photo_path")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { error: "Could not save the official.", id: null };
    if (!existing) return { error: "Official not found.", id: null };

    // Lock the slug once published — a shared or bookmarked profile URL must
    // not move under whoever holds it.
    const wasPublished = existing.status === "published";
    let slug = existing.slug as string;
    if (!wasPublished) {
      const slugResult = await uniqueSlug(admin, base, id);
      if (!slugResult.ok) return { error: slugResult.error, id: null };
      slug = slugResult.slug;
    }

    let query = admin.from("officials").update({ ...patch, slug }).eq("id", id);
    // The slug was computed against the status just read. If that read saw a
    // non-published status, re-assert it: should the official be published
    // concurrently, this update must not apply a slug computed against a now
    // stale status.
    if (!wasPublished) {
      query = query.in("status", ["draft", "in-review", "archived"]);
    }
    const { data: updated, error } = await query.select("id").maybeSingle();
    if (error) return { error: "Could not save the official.", id: null };
    if (!updated) {
      return {
        error: wasPublished
          ? "Official not found."
          : "This official was published while you were editing. Reopen and try again.",
        id: null,
      };
    }

    // Deferred delete: only once the row no longer references the old
    // portrait. A remote URL is left alone by removeStoredImage.
    const oldPath = existing.photo_path as string | null;
    if (oldPath && oldPath !== parsed.data.photoPath) {
      const removed = await removeStoredImage(oldPath);
      if (removed.error) {
        // A failed cleanup must not fail the save the user just made, but the
        // orphan it leaves is invisible otherwise — log the path for a human.
        console.error(`Orphaned storage object (portrait cleanup failed): ${oldPath}`);
      }
    }

    await recordActivity(actor, "updated official", "official", id, parsed.data.name);
    revalidate(slug);
    return { error: null, id };
  }

  const slugResult = await uniqueSlug(admin, base, null);
  if (!slugResult.ok) return { error: slugResult.error, id: null };

  // New officials land at the end of the directory.
  const { data: last } = await admin
    .from("officials")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number) ?? 0) + 1;

  const { data, error } = await admin
    .from("officials")
    .insert({ ...patch, slug: slugResult.slug, sort_order: nextOrder })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the official.", id: null };

  await recordActivity(actor, "created official", "official", data.id, parsed.data.name);
  revalidate(slugResult.slug);
  return { error: null, id: data.id };
}

/**
 * Move an official through draft → published → archived. `published_at` is set
 * once, on the first transition into published. Archiving is the normal path
 * for a departure: the record stays as term history.
 */
export async function setOfficialStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  const actor = await requirePermission("manage-officials");

  const statusResult = statusSchema.safeParse(status);
  if (!statusResult.success) {
    return { error: statusResult.error.issues[0]?.message ?? "Invalid status." };
  }
  const nextStatus = statusResult.data;

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("officials")
    .select("name, slug, photo_path, published_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) return { error: "Official not found." };

  // The public card and profile both lead with the portrait; publishing
  // without one would render a broken image on the directory.
  if (nextStatus === "published" && !existing.photo_path) {
    return { error: "Add a portrait before publishing this official." };
  }

  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "published" && !existing.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { error } = await admin.from("officials").update(patch).eq("id", id);
  if (error) return { error: "Could not update the official." };

  await recordActivity(actor, `${nextStatus} official`, "official", id, existing.name as string);
  revalidate(existing.slug as string);
  return { error: null };
}

/**
 * Hard delete — for mistakes only. Archiving is the normal path for a
 * departure (spec §6): the record is term history worth keeping.
 */
export async function deleteOfficial(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-officials");
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("officials")
    .select("name, slug, photo_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("officials").delete().eq("id", id);
  if (error) return { error: "Could not delete the official." };

  if (existing?.photo_path) await removeStoredImage(existing.photo_path as string);
  await recordActivity(actor, "deleted official", "official", id, (existing?.name as string) ?? "");
  revalidate((existing?.slug as string) ?? undefined);
  return { error: null };
}

/**
 * Rewrite directory positions from an ordered id list. Twelve sequential
 * updates is the whole barangay council — not worth a stored procedure, and
 * upsert is not usable here (its INSERT arm would violate the NOT NULL
 * columns this partial payload omits).
 */
export async function reorderOfficials(orderedIds: string[]): Promise<ActionResult> {
  const actor = await requirePermission("manage-officials");
  const parsed = reorderSchema.safeParse(orderedIds);
  if (!parsed.success) return { error: "Invalid ordering." };

  const admin = createSupabaseAdminClient();
  for (const [index, id] of parsed.data.entries()) {
    const { error } = await admin
      .from("officials")
      .update({ sort_order: index + 1 })
      .eq("id", id);
    if (error) return { error: "Could not save the new order." };
  }

  await recordActivity(actor, "reordered officials", "official");
  revalidate();
  return { error: null };
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass. If `zod` complains about `optionalText`, confirm the v4 `.transform().nullable()` ordering — v4 requires `.nullable()` last here.

- [ ] **Step 6: Confirm the news uploader still works (regression check)**

`media.ts` is shared with the news and events editors, so its change must not break them. In the running app, go to `/admin/news`, open any article's drawer, and upload an image.
Expected: the upload succeeds and previews exactly as before.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/actions/media.ts src/features/admin/components/single-image-uploader.tsx src/features/admin/queries/officials.ts src/features/admin/actions/officials.ts
git commit -F - <<'EOF'
feat(officials): add the admin query and write layer

Generalizes the single-image upload action to an `officials` folder with
per-folder permission resolution — the folder argument crosses a Server
Action boundary, so an unknown value is rejected rather than trusted. Adds
officials queries plus save/status/delete/reorder actions; publishing
requires a portrait, and the slug freezes once published.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 5: Admin manager UI

**Files:**
- Create: `src/features/admin/components/official-form.tsx`
- Create: `src/features/admin/components/officials-manager.tsx`
- Create: `src/app/admin/(portal)/officials/page.tsx`
- Modify: `src/features/admin/data.ts:26-37` (nav)
- Modify: `src/features/admin/index.ts` (barrel)

**Interfaces:**
- Consumes: everything produced by Task 4; `SingleImageUploader`; `AdminStatCard`, `AdminFilterBar`, `AdminEmptyState`, `AdminPagination`, `StatusChip`, `Drawer`, `Toast`, `Card`/`CardHeader`, `Button`, `Field`/`Input`/`Select`/`Textarea`.
- Produces: the route `/admin/officials`.

- [ ] **Step 1: Write the drawer editor**

Create `src/features/admin/components/official-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import type { ContentStatus, OfficialValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  deleteOfficial,
  saveOfficial,
  setOfficialStatus,
} from "@/features/admin/actions/officials";
import { SingleImageUploader } from "./single-image-uploader";

export interface OfficialEditRecord {
  id: string;
  values: OfficialValues;
  status: ContentStatus;
  photoUrl: string | null;
}

interface OfficialFormProps {
  record: OfficialEditRecord | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

const EMPTY_VALUES: OfficialValues = {
  name: "",
  role: "",
  group: "council",
  badge: null,
  photoPath: null,
  photoAlt: "",
  term: "2023-2026",
  email: null,
  phone: null,
  bio: "",
};

/** Create/edit form for one barangay official. */
export function OfficialForm({ record, onSaved, onCancel }: OfficialFormProps) {
  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [status, setStatus] = useState<ContentStatus>(record?.status ?? "draft");
  const [values, setValues] = useState<OfficialValues>(record?.values ?? EMPTY_VALUES);
  const [previewUrl, setPreviewUrl] = useState<string | null>(record?.photoUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof OfficialValues>(key: K, value: OfficialValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveOfficial(id, values);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) setId(result.id);
      onSaved("Official saved.");
    });
  }

  function runTransition(nextStatus: ContentStatus, message: string) {
    const currentId = id;
    if (!currentId) return;
    setError(null);
    startTransition(async () => {
      const result = await setOfficialStatus(currentId, nextStatus);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus(nextStatus);
      onSaved(message);
    });
  }

  function handleDelete() {
    const currentId = id;
    if (!currentId) return;
    if (!window.confirm("Delete this official? Archiving keeps the record — this does not.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteOfficial(currentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved("Official deleted.");
    });
  }

  return (
    <form onSubmit={handleSave} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Full Name" htmlFor="official-name">
          <Input
            id="official-name"
            placeholder="e.g. Hon. Juan D. Santos"
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Position" htmlFor="official-role">
          <Input
            id="official-role"
            placeholder="e.g. Barangay Kagawad"
            value={values.role}
            onChange={(event) => set("role", event.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Directory Section" htmlFor="official-group">
          <Select
            id="official-group"
            value={values.group}
            onChange={(event) => set("group", event.target.value as OfficialValues["group"])}
          >
            <option value="executive">Chief Executive</option>
            <option value="council">Barangay Council</option>
            <option value="administration">Administration</option>
          </Select>
        </Field>
        <Field label="Badge (optional)" htmlFor="official-badge">
          <Input
            id="official-badge"
            placeholder="e.g. Youth Leader"
            value={values.badge ?? ""}
            onChange={(event) => set("badge", event.target.value)}
          />
          <p className="text-xs text-ink-500">
            Shown as a pill on the directory card and highlights the card.
          </p>
        </Field>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-700">Portrait</h3>
          <SingleImageUploader
            folder="officials"
            src={values.photoPath}
            alt={values.photoAlt}
            previewUrl={previewUrl}
            onChange={(next) => {
              set("photoPath", next.src);
              set("photoAlt", next.alt);
              setPreviewUrl(next.previewUrl);
            }}
          />
          <p className="mt-2 text-xs text-ink-500">
            Square photos look best — the card crops to a square. Required before publishing.
          </p>
        </div>
        <Field label="Term" htmlFor="official-term">
          <Input
            id="official-term"
            placeholder="e.g. 2023-2026"
            value={values.term}
            onChange={(event) => set("term", event.target.value)}
          />
        </Field>
        <Field label="Email (optional)" htmlFor="official-email">
          <Input
            id="official-email"
            type="email"
            value={values.email ?? ""}
            onChange={(event) => set("email", event.target.value)}
          />
        </Field>
        <Field label="Phone (optional)" htmlFor="official-phone">
          <Input
            id="official-phone"
            value={values.phone ?? ""}
            onChange={(event) => set("phone", event.target.value)}
          />
        </Field>
        <Field label="Short Bio" htmlFor="official-bio">
          <Textarea
            id="official-bio"
            rows={5}
            value={values.bio}
            onChange={(event) => set("bio", event.target.value)}
          />
          <p className="text-xs text-ink-500">
            Appears on the official&rsquo;s profile page. Leave blank to hide that section.
          </p>
        </Field>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 p-6">
        <div className="flex flex-wrap gap-2">
          {id && status !== "published" ? (
            <Button
              type="button"
              variant="accent"
              disabled={pending}
              onClick={() => runTransition("published", "Published.")}
            >
              Publish
            </Button>
          ) : null}
          {id && status === "published" ? (
            <Button
              type="button"
              variant="outline-danger"
              disabled={pending}
              onClick={() => runTransition("archived", "Archived.")}
            >
              Archive
            </Button>
          ) : null}
          {id ? (
            <Button type="button" variant="outline-danger" disabled={pending} onClick={handleDelete}>
              Delete
            </Button>
          ) : null}
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : id ? "Save Changes" : "Add Official"}
          </Button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the manager**

Create `src/features/admin/components/officials-manager.tsx`. Ordering uses up/down buttons (see "Documented deviations"), and they are hidden while any filter is active — reordering a filtered subset would write positions that don't match what the user sees.

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, UserCheck, Users, UserX } from "lucide-react";
import type { AdminOfficialRow } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Toast } from "@/components/ui/toast";
import {
  getOfficialForEditAction,
  reorderOfficials,
} from "@/features/admin/actions/officials";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminStatCard } from "./admin-stat-card";
import { OfficialForm, type OfficialEditRecord } from "./official-form";
import { StatusChip } from "./status-chip";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const GROUP_OPTIONS = [
  { value: "all", label: "All Sections" },
  { value: "executive", label: "Chief Executive" },
  { value: "council", label: "Barangay Council" },
  { value: "administration", label: "Administration" },
];

const GROUP_LABELS: Record<AdminOfficialRow["group"], string> = {
  executive: "Chief Executive",
  council: "Barangay Council",
  administration: "Administration",
};

interface OfficialsManagerProps {
  officials: AdminOfficialRow[];
}

/** Officials directory: stat cards, filters, ordered table, drawer editor. */
export function OfficialsManager({ officials }: OfficialsManagerProps) {
  const router = useRouter();
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<OfficialEditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const published = officials.filter((r) => r.status === "published").length;
  const drafts = officials.filter((r) => r.status === "draft" || r.status === "in-review").length;
  const archived = officials.filter((r) => r.status === "archived").length;

  const filtersActive = group !== "all" || status !== "all";

  const filtered = useMemo(
    () =>
      officials.filter(
        (record) =>
          (group === "all" || record.group === group) &&
          (status === "all" || record.status === status),
      ),
    [officials, group, status],
  );

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: AdminOfficialRow) => {
    setLoadingEditId(row.id);
    startTransition(async () => {
      try {
        const detail = await getOfficialForEditAction(row.id);
        if (!detail) {
          setToast("Could not load that official.");
          return;
        }
        setEditing({
          id: row.id,
          values: detail.values,
          status: detail.status,
          photoUrl: detail.photoUrl,
        });
        setDrawerOpen(true);
      } finally {
        setLoadingEditId(null);
      }
    });
  };

  /** Swap a row with its neighbour and persist the whole order. */
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= officials.length) return;
    const ids = officials.map((r) => r.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    startTransition(async () => {
      const result = await reorderOfficials(ids);
      if (result.error) {
        setToast(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleSaved = (message: string) => {
    setDrawerOpen(false);
    setToast(message);
    router.refresh();
  };

  const clearFilters = () => {
    setGroup("all");
    setStatus("all");
  };

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add New Official
        </Button>
      </div>
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={UserCheck} label="Published" value={published} />
        <AdminStatCard icon={Users} label="Drafts" value={drafts} tone="secondary" />
        <AdminStatCard icon={UserX} label="Archived" value={archived} tone="danger" />
      </div>
      <Card>
        <CardHeader
          title="Officials Directory"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              selects={[
                {
                  id: "official-group-filter",
                  label: "Section",
                  value: group,
                  options: GROUP_OPTIONS,
                  onChange: setGroup,
                },
                {
                  id: "official-status-filter",
                  label: "Status",
                  value: status,
                  options: STATUS_OPTIONS,
                  onChange: setStatus,
                },
              ]}
            />
          }
        />
        {filtered.length === 0 ? (
          <AdminEmptyState message="No officials match your filters." onClear={clearFilters} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                  <th scope="col" className="px-6 py-4">Order</th>
                  <th scope="col" className="px-6 py-4">Official</th>
                  <th scope="col" className="px-6 py-4">Section</th>
                  <th scope="col" className="px-6 py-4">Status</th>
                  <th scope="col" className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => {
                  // Index in the FULL list — moving must reorder the real
                  // directory, not a filtered view of it.
                  const index = officials.findIndex((r) => r.id === record.id);
                  return (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <span className="w-6 font-semibold text-ink-500">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {filtersActive ? null : (
                            <>
                              <button
                                type="button"
                                onClick={() => move(index, -1)}
                                disabled={index === 0}
                                aria-label={`Move ${record.name} up`}
                                className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30"
                              >
                                <ArrowUp className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => move(index, 1)}
                                disabled={index === officials.length - 1}
                                aria-label={`Move ${record.name} down`}
                                className="rounded p-1 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-30"
                              >
                                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {record.photoUrl ? (
                            <Image
                              src={record.photoUrl}
                              alt=""
                              width={40}
                              height={40}
                              className="h-10 w-10 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-400">
                              <Users className="h-4 w-4" aria-hidden="true" />
                            </span>
                          )}
                          <div>
                            <p className="font-semibold text-ink-900">{record.name}</p>
                            <p className="text-ink-500">{record.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-ink-600">{GROUP_LABELS[record.group]}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          disabled={loadingEditId === record.id}
                          aria-label={`${record.status === "archived" ? "View" : "Edit"} ${record.name}`}
                          className="rounded-full p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                        >
                          {record.status === "archived" ? (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Official" : "Add New Official"}
      >
        {drawerOpen ? (
          <OfficialForm
            key={editing?.id ?? "new"}
            record={editing}
            onSaved={handleSaved}
            onCancel={() => setDrawerOpen(false)}
          />
        ) : null}
      </Drawer>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
```

- [ ] **Step 3: Add the admin route**

Create `src/app/admin/(portal)/officials/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { OfficialsManager } from "@/features/admin";
import { listAdminOfficials } from "@/features/admin/queries/officials";

export const metadata: Metadata = { title: "Officials" };

export default async function AdminOfficialsPage() {
  await requirePermission("manage-officials");
  const officials = await listAdminOfficials();
  return <OfficialsManager officials={officials} />;
}
```

- [ ] **Step 4: Add the nav item**

In `src/features/admin/data.ts`, add `Users` to the `lucide-react` import list (keep it alphabetical with the others) and insert this entry into `ADMIN_NAV_ITEMS` **between** the "News & Announcements" and "Settings" entries:

```ts
  { label: "Officials", href: "/admin/officials", icon: Users, permission: "manage-officials" },
```

- [ ] **Step 5: Export the new components from the barrel**

In `src/features/admin/index.ts`, add (keeping the file's existing ordering style):

```ts
export { OfficialsManager } from "./components/officials-manager";
export { OfficialForm } from "./components/official-form";
```

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 7: Verify the manager end to end**

Sign in to `/admin` as a SuperAdmin and open `/admin/officials`.

1. Stat cards read Published 12, Drafts 0, Archived 0; the table lists 12 in directory order with round portrait thumbnails.
2. Open the Punong Barangay, change the bio to "Test bio.", Save. Reload `/officials/dominic-b-dela-cruz` — the **About** section now appears with that text. Clear it again and save.
3. Click **Add New Official**, fill name/position only, Save, then click **Publish**.
   Expected: the error "Add a portrait before publishing this official."
4. Upload a portrait for that official, Save, then Publish. Check `/officials` — they appear in the chosen section.
5. Use the down arrow to move them up/down. Reload `/officials` — the order matches.
6. **Archive** them. Reload `/officials` — they are gone; their `/officials/<slug>` returns 404.
7. **Delete** them (confirm the dialog). The row disappears.
8. Set a filter, and confirm the up/down arrows are hidden while filtering.

- [ ] **Step 8: Commit**

```bash
git add src/features/admin/components/official-form.tsx src/features/admin/components/officials-manager.tsx "src/app/admin/(portal)/officials/page.tsx" src/features/admin/data.ts src/features/admin/index.ts
git commit -F - <<'EOF'
feat(officials): add the /admin/officials manager

Stat cards, section and status filters, an ordered table with up/down
reordering, and a drawer editor covering every field including the
portrait. Reorder controls hide while a filter is active, since reordering
a filtered subset would write positions that don't match the view.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 6: Permission check, full sweep, and docs

**Files:**
- Modify: `docs/BACKEND_HANDOFF.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Verify the permission gate with a non-SuperAdmin**

In `/admin/settings`, create (or reuse) a staff user **without** `manage-officials`. Sign in as them.
Expected: "Officials" does not appear in the sidebar, and visiting `/admin/officials` directly redirects to `/admin`. Sign back in as SuperAdmin afterwards.

- [ ] **Step 2: Full build sweep**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all three pass. `/officials/[slug]` should appear in the build output as a dynamic route.

- [ ] **Step 3: Confirm no "Sampaguita" or stale reference crept in**

Run: `grep -ri "sampaguita" src/ || echo "clean"`
Expected: `clean`.

Run: `grep -rn "OFFICIALS" src/ || echo "clean"`
Expected: `clean` — every consumer of the retired array is gone.

- [ ] **Step 4: Update `docs/BACKEND_HANDOFF.md`**

In **§1 Current State**, add officials to the list of DB-backed features. In **§6 Known Gaps**, update the image-migration item to note that the 12 official portraits now live in `public-media/officials/` (leaving the home CTA and seed news photos as the remaining `lh3` hotlinks), and add a new gap: officials' bios are empty and their emails/phones are still placeholder-shaped, both pending real content from the barangay. Add a dated changelog blockquote at the top recording Plan 6.

Do **not** retro-edit anything in `docs/superpowers/specs/` or `docs/superpowers/plans/` — those are historical records.

- [ ] **Step 5: Update `CLAUDE.md`**

Two edits:

1. In **§Project**, move officials out of the "what remains static" list — the remaining static `data.ts` content is the About, Contact, and home content plus the admin Dashboard Overview seed. Remove "officials slug pages" from the remaining-work sentence.
2. In **§Conventions**, update the bundled-assets note: the officials' portraits are now served from Supabase Storage (`public-media/officials/`), and `src/images/officials/` remains only as the source for `scripts/upload-official-portraits.mjs`. The Punong Barangay portrait is *still* a bundled static import for the About page's `CAPTAIN` block — that has not changed.

- [ ] **Step 6: Commit**

```bash
git add docs/BACKEND_HANDOFF.md CLAUDE.md
git commit -F - <<'EOF'
docs: record officials as DB-backed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: Report completion**

Summarize for the repo owner: what shipped, that `0012` is applied to **staging only** (production will need it at deploy), that officials' bios/contacts still need real content, and that the achievements timeline remains a deferred follow-up plan.

---

## Notes for the implementer

- **The dev server is often already running** on port 3000 — check before starting another.
- **`npm run build` is not required per-task**; typecheck + lint + driving the app is the per-task gate. The full build runs once, in Task 6.
- If a step's code conflicts with what's actually in the file (the repo moves), follow the file, not the plan — but flag the divergence in your task report rather than silently adapting.
