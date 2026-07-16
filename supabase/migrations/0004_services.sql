-- Public services catalog. id doubles as the URL slug and is the FK target
-- for applications (ticketing plan 2B). icon_name is resolved to a component
-- on the frontend (never store components). Writes go through the service-role
-- client after a SuperAdmin check in code; anon may only read.

create table public.services (
  id text primary key,
  title text not null,
  description text not null,
  icon_name text not null,
  tone text not null default 'primary' check (tone in ('primary', 'danger')),
  requirements_label text not null,
  cta_label text not null,
  requirements text[] not null default '{}',
  department text not null,
  is_available boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create index services_sort_order_idx on public.services (sort_order);

alter table public.services enable row level security;

create policy "services readable by anyone"
  on public.services for select using (true);

create trigger services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

insert into public.services
  (id, title, description, icon_name, tone, requirements_label, cta_label, requirements, department, sort_order)
values
  ('barangay-clearance', 'Barangay Clearance',
   'An official document required for various transactions such as employment, business permits, and legal identification.',
   'shield-check', 'primary', 'View Requirements', 'Apply Online',
   array['Latest Community Tax Certificate (Cedula)', 'Recent 2x2 colored ID picture (white background)', 'Application fee: ₱50.00'],
   'Office of the Barangay Secretary', 1),
  ('business-permit', 'Business Permit Recommendation',
   'Necessary for local entrepreneurs to operate legally within the barangay jurisdiction, ensuring compliance with local zoning.',
   'store', 'primary', 'View Requirements', 'Apply Online',
   array['DTI / SEC Registration Papers', 'Contract of Lease or Land Title', 'Locational Clearance'],
   'Office of the Barangay Treasurer', 2),
  ('certificate-of-indigency', 'Certificate of Indigency',
   'Provided to residents needing social welfare assistance, medical aid, or scholarship applications.',
   'heart-handshake', 'primary', 'View Requirements', 'Apply Online',
   array['Voter''s ID or Certification', 'Affidavit of Low Income', 'Referral from DSWD (if applicable)'],
   'Barangay Social Welfare Desk', 3),
  ('blotter-complaints', 'Blotter & Complaints',
   'For reporting neighborhood disputes, peace and order issues, or filing formal grievances for mediation.',
   'gavel', 'danger', 'View Process', 'File Incident Report',
   array['Personal appearance of the complainant', 'Valid Government ID', 'Incident narrative and supporting evidence'],
   'Lupong Tagapamayapa', 4);
