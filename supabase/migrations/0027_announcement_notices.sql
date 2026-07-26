-- 0027 — notices: announcements gain a slug (public detail page) and body
-- (full notice text), mirroring news_articles. The teaser excerpt is no
-- longer the whole story — /notices/[slug] needs real content to show.
--
-- Slug backfill has no fallback beyond disambiguation. Every existing
-- announcement gets a slug derived from its title; duplicates (identical or
-- near-identical titles) are disambiguated with a suffix derived from each
-- row's own id (unique by construction, so it cannot collide with another
-- row's disambiguated slug the way a sequential -2, -3… suffix could) before
-- the NOT NULL UNIQUE constraint lands.

begin;

-- 1. New columns, slug nullable until the backfill has run.
alter table public.announcements
  add column slug text,
  add column body text not null default '';

-- 2. Backfill slugs from titles: lowercase, non-alphanumeric runs collapsed
--    to a single hyphen, leading/trailing hyphens trimmed.
update public.announcements
set slug = trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'))
where slug is null;

-- 3. Disambiguate duplicates the backfill above would otherwise collide on
--    (e.g. two announcements both titled "Notice") — oldest keeps the bare
--    slug, later rows get a suffix from their own id. A sequential -2, -3…
--    suffix (keyed off row_number()) can itself collide with an untouched
--    row that already carries that numeral as part of its own bare slug
--    (e.g. "Barangay Assembly" x2 + "Barangay Assembly 2" backfill to
--    barangay-assembly / barangay-assembly / barangay-assembly-2, and
--    renaming the second row to barangay-assembly-2 collides with the
--    third) — the row's own id has no such relationship to any other row's
--    slug, so it cannot collide.
update public.announcements a
set slug = a.slug || '-' || left(replace(a.id::text, '-', ''), 8)
from (
  select id, row_number() over (partition by slug order by created_at) as rn
  from public.announcements
) sub
where a.id = sub.id and sub.rn > 1;

-- 4. Constrain now that every row has a slug.
alter table public.announcements
  alter column slug set not null,
  add constraint announcements_slug_unique unique (slug);

commit;
