-- Enforce staff email uniqueness at the database layer.
-- (0001 was already applied without it; run this in the SQL editor on any
-- environment that has 0001 applied.)

alter table public.profiles
  add constraint profiles_email_unique unique (email);
