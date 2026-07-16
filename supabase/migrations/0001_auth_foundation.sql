-- Auth foundation: staff profiles + audit log.
-- Permission model (spec §4): SuperAdmin has full power; everyone else's real power
-- is exactly the permissions[] array. status_label ('staff' | 'editor') is a title only.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  status_label text not null default 'staff'
    check (status_label in ('staff', 'editor')),
  is_superadmin boolean not null default false,
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  detail text,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- Signed-in staff can read profiles (own session + team list). All writes go
-- through the service-role client in Server Actions, which bypasses RLS after
-- an explicit SuperAdmin check in code.
create policy "profiles readable by signed-in staff"
  on public.profiles for select to authenticated using (true);

create policy "audit log readable by signed-in staff"
  on public.audit_log for select to authenticated using (true);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
