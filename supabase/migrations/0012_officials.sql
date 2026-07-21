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
