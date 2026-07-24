-- Profile pictures for staff accounts.
--
-- One nullable column, no table. Null means "render initials", which stays the
-- permanent fallback — there is no default avatar image and no NOT NULL to
-- backfill.
--
-- The value is a `public-media` object path (avatars/<uuid>.<ext>), resolved by
-- photoUrl() like every other image reference in the schema. Same bucket as the
-- officials' portraits: the portal is auth-gated and a staff headshot is not a
-- screenshot of somebody's own account page, so the private-bucket treatment
-- that feedback screenshots get does not apply here.

alter table public.profiles add column avatar_src text;

comment on column public.profiles.avatar_src is
  'public-media object path (avatars/<uuid>.<ext>), or null to render initials.';
