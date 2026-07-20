-- Transparency documents (Plan 4, spec §3).
--
-- RLS: enabled with NO policies on all four tables, deliberately — the same
-- pattern as the ticket and news tables. Neither anon nor authenticated may
-- touch them. Every read (public queries filter status='published') and every
-- write goes through the service-role client after an explicit permission
-- check in code, so the gate lives in one reviewable place.
--
-- Storage: a second public bucket `public-documents`, separate from
-- `public-media`. PDFs cap at 10MB where images cap at 2MB; holding both
-- limits in one bucket's upload actions invites applying the wrong one.

create type public.legislative_type as enum ('ordinance', 'resolution');

-- ── Categories ──────────────────────────────────────────────────────────────
-- SuperAdmin-editable; retired via is_active, never deleted (documents
-- reference them). Mirrors news_categories / assistance_categories.
create table public.transparency_categories (
  id text primary key,
  label text not null,
  icon_name text not null default 'file-text',
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index transparency_categories_sort_order_idx
  on public.transparency_categories (sort_order);
alter table public.transparency_categories enable row level security;
create trigger transparency_categories_updated_at
  before update on public.transparency_categories
  for each row execute function public.set_updated_at();

insert into public.transparency_categories (id, label, icon_name, sort_order) values
  ('financials', 'Financials', 'receipt', 1),
  ('legislative', 'Legislative', 'gavel', 2),
  ('projects', 'Projects', 'landmark', 3),
  ('awards', 'Awards', 'file-check', 4);

-- ── Legislative documents (ordinances & resolutions) ────────────────────────
-- Ordered by date_approved, NOT published_at: a 2023 ordinance may be uploaded
-- after a 2024 one, and spec §7 requires newest-approved-first.
create table public.legislative_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  doc_type public.legislative_type not null,
  number text not null,
  title text not null,
  date_approved date not null,
  summary text not null default '',
  file_path text,
  file_size_bytes int,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index legislative_documents_status_date_idx
  on public.legislative_documents (status, date_approved desc);
create index legislative_documents_type_status_date_idx
  on public.legislative_documents (doc_type, status, date_approved desc);
alter table public.legislative_documents enable row level security;
create trigger legislative_documents_updated_at
  before update on public.legislative_documents
  for each row execute function public.set_updated_at();

-- ── Transparency documents (budgets, financials, awards) ────────────────────
create table public.transparency_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_id text not null
    references public.transparency_categories (id) on delete restrict,
  date_released date not null,
  file_path text,
  file_size_bytes int,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transparency_documents_status_date_idx
  on public.transparency_documents (status, date_released desc);
create index transparency_documents_category_idx
  on public.transparency_documents (category_id, status, date_released desc);
alter table public.transparency_documents enable row level security;
create trigger transparency_documents_updated_at
  before update on public.transparency_documents
  for each row execute function public.set_updated_at();

-- ── Projects ────────────────────────────────────────────────────────────────
create table public.transparency_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  progress int not null default 0 check (progress between 0 and 100),
  sort_order int not null default 0,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transparency_projects_status_sort_idx
  on public.transparency_projects (status, sort_order);
alter table public.transparency_projects enable row level security;
create trigger transparency_projects_updated_at
  before update on public.transparency_projects
  for each row execute function public.set_updated_at();

-- ── Storage: public-documents bucket (PDFs, 10MB) ───────────────────────────
insert into storage.buckets (id, name, public)
  values ('public-documents', 'public-documents', true)
  on conflict (id) do nothing;
create policy "public read public-documents" on storage.objects
  for select to public using (bucket_id = 'public-documents');

-- ── Seed (day-one parity with the mock data being replaced) ─────────────────
-- Published with file_path null: records render with a "available at the
-- barangay hall" note instead of a download link until real PDFs are attached
-- through /admin/transparency.
insert into public.legislative_documents
  (slug, doc_type, number, title, date_approved, summary, status, published_at) values
  ('ordinance-no-05-2024-comprehensive-solid-waste-management-program', 'ordinance',
   'Ordinance No. 05-2024', 'Comprehensive Solid Waste Management Program', '2024-09-28',
   'An ordinance institutionalizing waste segregation at source in all households and establishments within Barangay San Fernando, prescribing collection schedules per purok, designating materials recovery facilities, and providing penalties of ₱500 to ₱2,500 for non-compliance. Enacted pursuant to RA 9003 (Ecological Solid Waste Management Act).',
   'published', now()),
  ('ordinance-no-03-2024-curfew-hours-for-minors', 'ordinance',
   'Ordinance No. 03-2024', 'Curfew Hours for Minors', '2024-06-14',
   'An ordinance setting curfew hours for minors below 18 years of age from 10:00 PM to 4:00 AM daily, defining exemptions for work, school, and emergencies, and directing barangay tanods to escort apprehended minors to their parents or guardians. First offense carries a written warning; succeeding offenses require parental conference with the Lupon.',
   'published', now()),
  ('ordinance-no-11-2023-anti-illegal-parking-on-barangay-roads', 'ordinance',
   'Ordinance No. 11-2023', 'Anti-Illegal Parking on Barangay Roads', '2023-11-08',
   'An ordinance prohibiting the parking of motor vehicles on designated barangay road sections that obstruct traffic flow or emergency access, establishing towing and impounding procedures in coordination with the municipal traffic office, and imposing graduated fines starting at ₱1,000.',
   'published', now()),
  ('resolution-no-12-2024-adopting-the-annual-budget-for-fiscal-year-2025', 'resolution',
   'Resolution No. 12-2024', 'Adopting the Annual Budget for Fiscal Year 2025', '2024-10-05',
   'A resolution adopting the proposed annual budget of Barangay San Fernando for fiscal year 2025 amounting to ₱8,450,000, allocating 20% to the Barangay Development Fund, 10% to the Sangguniang Kabataan fund, and 5% to the Barangay Disaster Risk Reduction and Management Fund, as reviewed by the Barangay Development Council.',
   'published', now()),
  ('resolution-no-09-2024-authorizing-a-memorandum-of-agreement-for-the-feeding-program', 'resolution',
   'Resolution No. 09-2024', 'Authorizing a Memorandum of Agreement for the Feeding Program', '2024-07-19',
   'A resolution authorizing the Punong Barangay to enter into a memorandum of agreement with the Municipal Social Welfare and Development Office for the implementation of a six-month supplemental feeding program benefiting 120 undernourished children in the barangay day care centers.',
   'published', now()),
  ('resolution-no-04-2024-requesting-streetlight-installation-along-san-fernando-extension', 'resolution',
   'Resolution No. 04-2024', 'Requesting Streetlight Installation Along San Fernando Extension', '2024-03-22',
   'A resolution respectfully requesting the Municipal Engineering Office to install fifteen (15) LED streetlights along San Fernando Extension from Purok 3 to Purok 5, citing recorded safety incidents and the results of the barangay assembly consultation held February 2024.',
   'published', now());

insert into public.transparency_documents
  (title, category_id, date_released, status, published_at) values
  ('2024 Approved Budget', 'financials', '2024-01-15', 'published', now()),
  ('2023 Expenditure Report', 'financials', '2024-02-10', 'published', now()),
  ('2024 Q3 Income Statement', 'financials', '2024-10-12', 'published', now()),
  ('Ordinance No. 05-2024: Waste Management', 'legislative', '2024-09-28', 'published', now()),
  ('Road Improvement Project Report', 'projects', '2024-09-15', 'published', now()),
  ('Seal of Good Governance Certificate', 'awards', '2024-08-20', 'published', now());

insert into public.transparency_projects (name, progress, sort_order, status, published_at) values
  ('Barangay Hall Renovation', 100, 1, 'published', now()),
  ('Main Road Lighting Phase II', 65, 2, 'published', now());
