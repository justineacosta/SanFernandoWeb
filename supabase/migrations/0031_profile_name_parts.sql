-- Split full_name into first/middle/last for the admin account-creation form.
-- full_name stays a plain (non-generated) column — src/features/admin/lib/
-- build-full-name.ts keeps it in sync on every SuperAdmin-driven write. See
-- docs/superpowers/specs/2026-08-01-admin-account-invite-design.md.

alter table public.profiles
  add column first_name text,
  add column middle_name text,
  add column last_name text;

-- Best-effort backfill for existing rows: first token, last token, middle
-- tokens. With only a handful of real team-user rows today, a manual
-- touch-up through the edit drawer afterward is expected and fine.
update public.profiles set
  first_name = split_part(full_name, ' ', 1),
  last_name = case
    when array_length(regexp_split_to_array(full_name, '\s+'), 1) > 1
      then (regexp_split_to_array(full_name, '\s+'))[array_length(regexp_split_to_array(full_name, '\s+'), 1)]
    else ''
  end,
  middle_name = nullif(trim(
    regexp_replace(full_name, '^\S+\s*|\s*\S+$', '', 'g')
  ), '');

alter table public.profiles
  alter column first_name set not null,
  alter column last_name set not null;

comment on column public.profiles.first_name is 'Given name, captured on account creation.';
comment on column public.profiles.middle_name is 'Optional middle name.';
comment on column public.profiles.last_name is 'Surname, captured on account creation.';
