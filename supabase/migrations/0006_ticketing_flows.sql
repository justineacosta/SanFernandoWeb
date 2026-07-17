-- Ticketing flows 2C: appointments, complaints, assistance (spec §3).
--
-- Mirrors 0005_applications.sql: per-year sequential ticket numbers from the
-- shared public.next_ticket_number() (the counter table is generic — APT-, CMP-
-- and AST- need no new plumbing), RLS with no policies, set_updated_at triggers.
--
-- RLS: enabled with NO policies on the three ticket tables, deliberately.
-- Neither anon nor authenticated may touch them. Every read and write goes
-- through the service-role client after an explicit check in code, so the
-- privacy gate lives in one reviewable place rather than in a row policy.
-- assistance_categories is the exception: it is public reference data.

-- ── Assistance categories ───────────────────────────────────────────────────
-- SuperAdmin-editable list backing the assistance form's picker. Rows are
-- retired via is_active and never deleted: assistance_requests reference them,
-- and a hard delete would orphan a resident's record.

create table public.assistance_categories (
  id text primary key,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index assistance_categories_sort_order_idx on public.assistance_categories (sort_order);

alter table public.assistance_categories enable row level security;

create policy "assistance categories readable by anyone"
  on public.assistance_categories for select using (true);

create trigger assistance_categories_updated_at
  before update on public.assistance_categories
  for each row execute function public.set_updated_at();

insert into public.assistance_categories (id, label, sort_order) values
  ('medical', 'Medical Assistance', 1),
  ('financial', 'Financial Assistance', 2),
  ('burial', 'Burial Assistance', 3),
  ('calamity', 'Calamity Assistance', 4),
  ('other', 'Other Assistance', 5);

-- ── Appointments ────────────────────────────────────────────────────────────
-- Spec §1: the resident asks for a preferred date + AM/PM; staff confirm that
-- slot, confirm a different one, or decline. There is no slot calendar, so
-- confirmed_date/confirmed_period are free staff choices, not a booking system.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default public.next_ticket_number('APT'),
  first_name text not null,
  last_name text not null,
  address text not null,
  contact_number text not null,
  email text,
  purpose text not null,
  preferred_date date not null,
  preferred_period text not null check (preferred_period in ('am', 'pm')),
  confirmed_date date,
  confirmed_period text check (confirmed_period in ('am', 'pm')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'declined')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  completed_by_name text,
  completed_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  -- Data Privacy Act consent, persisted (spec §3). Walk-ins consent in person.
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_created_at_idx on public.appointments (created_at desc);
create index appointments_status_idx on public.appointments (status);

alter table public.appointments enable row level security;

create trigger appointments_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ── Complaints ──────────────────────────────────────────────────────────────
-- The barangay's highest-privacy record: narrative and respondent NEVER leave
-- the admin queue. /track shows a complaint's status only (spec §3).
-- respondent is nullable — a resident may report an incident without naming
-- anyone. Dismissal may happen on receipt or after mediation, so closed_at is
-- set only by the stage-2 action; a dismissal at stage 1 leaves it null.

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default public.next_ticket_number('CMP'),
  first_name text not null,
  last_name text not null,
  address text not null,
  contact_number text not null,
  email text,
  respondent text,
  incident_date date not null,
  location text not null,
  narrative text not null,
  status text not null default 'received'
    check (status in ('received', 'under-review', 'resolved', 'dismissed')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  closed_by_name text,
  closed_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index complaints_created_at_idx on public.complaints (created_at desc);
create index complaints_status_idx on public.complaints (status);

alter table public.complaints enable row level security;

create trigger complaints_updated_at
  before update on public.complaints
  for each row execute function public.set_updated_at();

-- ── Assistance requests ─────────────────────────────────────────────────────

create table public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default public.next_ticket_number('AST'),
  first_name text not null,
  last_name text not null,
  address text not null,
  contact_number text not null,
  email text,
  category_id text not null references public.assistance_categories (id),
  details text not null,
  status text not null default 'pending'
    check (status in ('pending', 'under-review', 'granted', 'declined')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistance_requests_created_at_idx on public.assistance_requests (created_at desc);
create index assistance_requests_status_idx on public.assistance_requests (status);

alter table public.assistance_requests enable row level security;

create trigger assistance_requests_updated_at
  before update on public.assistance_requests
  for each row execute function public.set_updated_at();

-- ── tickets_view ────────────────────────────────────────────────────────────
-- Common fields across all four kinds, for /track's lookup + privacy gate and
-- (later) dashboard stats. Type-specific columns are deliberately absent:
-- /track reads `kind` from here, then fetches the extras it needs from the one
-- owning table. A complaint's narrative therefore cannot leak through the view
-- even if a future caller selects *.
--
-- security_invoker = true is LOAD-BEARING. A Postgres view runs with its
-- OWNER's privileges by default, and the owner bypasses RLS — a default view
-- over these tables would serve every ticket in the barangay to anonymous
-- PostgREST reads, inverting the whole posture above. With security_invoker the
-- view runs as the querying role, so the underlying no-policy RLS denies anon
-- and authenticated, and only the service-role client can read it. The revoke
-- below is belt-and-braces on top of that.

create view public.tickets_view with (security_invoker = true) as
  select ticket_no,
         'application'::text as kind,
         first_name,
         last_name,
         status,
         remarks,
         created_at,
         reviewed_at,
         released_at as closed_at
    from public.applications
  union all
  select ticket_no, 'appointment'::text, first_name, last_name, status,
         remarks, created_at, reviewed_at, completed_at
    from public.appointments
  union all
  select ticket_no, 'complaint'::text, first_name, last_name, status,
         remarks, created_at, reviewed_at, closed_at
    from public.complaints
  union all
  select ticket_no, 'assistance'::text, first_name, last_name, status,
         remarks, created_at, reviewed_at, decided_at
    from public.assistance_requests;

revoke all on public.tickets_view from anon, authenticated;
