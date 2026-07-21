-- Officials achievements (master spec §6; design doc
-- docs/superpowers/specs/2026-07-21-officials-achievements-design.md).
--
-- The follow-up deliberately deferred out of Plan 6 (migration 0012). Shape
-- mirrors news_articles → news_photos, which is the established pattern for
-- "a record with up to three uploaded photos".
--
-- RLS: enabled with NO policies, exactly like every other table. Public reads
-- go through the service-role client with explicit is_visible / title filters;
-- writes go through Server Actions behind requirePermission("manage-officials").
-- The code check is the entire gate.
--
-- Storage: photos live in the EXISTING `public-media` bucket under an
-- `achievements/<achievementId>/` prefix. No new bucket.

create table public.official_achievements (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references public.officials (id) on delete cascade,
  -- Defaults to '' because "Add achievement" creates the row before the staff
  -- member has typed anything. A blank title is filtered out of the public
  -- query, so an unfinished entry can never reach the site.
  title text not null default '',
  description text not null default '',
  -- Free text, not a date: barangay achievements are "March 2024", "2023-2024",
  -- or "Ongoing". Ordering is owned by sort_order, so this never needs to sort.
  date_label text not null default '',
  is_visible boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index official_achievements_official_idx
  on public.official_achievements (official_id, sort_order);

alter table public.official_achievements enable row level security;

create trigger official_achievements_updated_at
  before update on public.official_achievements
  for each row execute function public.set_updated_at();

create table public.official_achievement_photos (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null
    references public.official_achievements (id) on delete cascade,
  src text not null,
  alt text not null default '',
  sort_order int not null default 0
);

create index official_achievement_photos_achievement_idx
  on public.official_achievement_photos (achievement_id, sort_order);

alter table public.official_achievement_photos enable row level security;

-- No seed rows: the barangay has supplied no achievement content yet.
