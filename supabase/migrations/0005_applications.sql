-- Ticketing foundation + certificate applications (spec §3).
--
-- Ticket numbers are per-prefix, per-year, sequential: APP-2026-00001. The
-- counter row is locked by the INSERT .. ON CONFLICT DO UPDATE, so concurrent
-- inserts serialize instead of colliding. Plans 2C reuse next_ticket_number()
-- for the APT-/CMP-/AST- prefixes.
--
-- The year comes from Asia/Manila, not UTC: a ticket filed at 8am Manila on
-- Jan 1 must read 2027, not 2026.
--
-- RLS: enabled with NO policies, deliberately. Neither anon nor authenticated
-- may touch these tables. The public /track lookup and the admin queue both go
-- through the service-role client after an explicit check in code, so the
-- privacy gate lives in one reviewable place rather than in a row policy.

create table public.ticket_counters (
  prefix text not null,
  year int not null,
  last_number int not null default 0,
  primary key (prefix, year)
);

create or replace function public.next_ticket_number(p_prefix text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
  v_number int;
begin
  insert into public.ticket_counters (prefix, year, last_number)
  values (p_prefix, v_year, 1)
  on conflict (prefix, year)
    do update set last_number = ticket_counters.last_number + 1
  returning last_number into v_number;

  return p_prefix || '-' || v_year::text || '-' || lpad(v_number::text, 5, '0');
end $$;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default public.next_ticket_number('APP'),
  first_name text not null,
  last_name text not null,
  address text not null,
  contact_number text not null,
  email text,
  service_id text not null references public.services (id),
  purpose text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'released', 'rejected')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  released_by uuid references auth.users (id) on delete set null,
  released_by_name text,
  released_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  -- Data Privacy Act consent, persisted (spec §3). Walk-ins consent in person.
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- /track matches ticket number + last name, case-insensitively.
create index applications_lookup_idx on public.applications (ticket_no, lower(last_name));
create index applications_created_at_idx on public.applications (created_at desc);
create index applications_status_idx on public.applications (status);

alter table public.ticket_counters enable row level security;
alter table public.applications enable row level security;

create trigger applications_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();
