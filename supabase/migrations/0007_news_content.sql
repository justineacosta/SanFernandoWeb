-- News, announcements & events (Plan 3, spec §5).
--
-- RLS: enabled with NO policies on all five tables, deliberately. Neither anon
-- nor authenticated may touch them. Every read (public pages filter
-- status='published') and every write goes through the service-role client
-- after an explicit check in code, so the gate lives in one reviewable place.
--
-- Storage: one public bucket `public-media`. Public read; no anon/authenticated
-- write policy (the service-role client bypasses RLS for uploads).

create type public.content_status as enum ('draft', 'in-review', 'published', 'archived');
create type public.event_category as enum
  ('town-hall', 'health-drive', 'festival', 'youth', 'environment', 'community');

-- ── News categories ─────────────────────────────────────────────────────────
-- SuperAdmin-editable; retired via is_active, never deleted (news_articles
-- reference them). Mirrors assistance_categories.
create table public.news_categories (
  id text primary key,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index news_categories_sort_order_idx on public.news_categories (sort_order);
alter table public.news_categories enable row level security;
create trigger news_categories_updated_at
  before update on public.news_categories
  for each row execute function public.set_updated_at();

insert into public.news_categories (id, label, sort_order) values
  ('governance', 'Governance', 1),
  ('health-wellness', 'Health & Wellness', 2),
  ('environment', 'Environment', 3),
  ('community', 'Community', 4),
  ('public-safety', 'Public Safety', 5),
  ('advisory', 'Advisory', 6),
  ('infrastructure', 'Infrastructure', 7);

-- ── News articles ───────────────────────────────────────────────────────────
create table public.news_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category_id text not null references public.news_categories (id) on delete restrict,
  excerpt text not null,
  body text not null default '',
  author_id uuid references public.profiles (id) on delete set null,
  author_name text,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index news_articles_status_published_idx
  on public.news_articles (status, published_at desc);
alter table public.news_articles enable row level security;
create trigger news_articles_updated_at
  before update on public.news_articles
  for each row execute function public.set_updated_at();

-- ── News photos (0–3 per article; cap enforced in code) ─────────────────────
create table public.news_photos (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles (id) on delete cascade,
  src text not null,
  alt text not null default '',
  sort_order int not null default 0
);
create index news_photos_article_idx on public.news_photos (article_id, sort_order);
alter table public.news_photos enable row level security;

-- ── Announcements (short dated notices) ─────────────────────────────────────
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  excerpt text not null,
  image_src text,
  image_alt text not null default '',
  urgent boolean not null default false,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_status_date_idx
  on public.announcements (status, date desc);
alter table public.announcements enable row level security;
create trigger announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

-- ── Events ──────────────────────────────────────────────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category public.event_category not null default 'community',
  event_date date not null,
  start_time text not null,
  end_time text,
  venue text not null,
  capacity int,
  description text not null default '',
  cover_src text,
  cover_alt text not null default '',
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_status_date_idx
  on public.events (status, event_date asc);
alter table public.events enable row level security;
create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ── Storage: public-media bucket ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('public-media', 'public-media', true)
  on conflict (id) do nothing;
create policy "public read public-media" on storage.objects
  for select to public using (bucket_id = 'public-media');

-- ── Seed (day-one parity; images keep their current lh3 URLs) ───────────────
insert into public.news_articles (slug, title, category_id, excerpt, body, author_name, status, published_at) values
  ('annual-barangay-health-mission', 'Annual Barangay Health Mission: Serving Over 500 Residents',
   'health-wellness',
   'The Barangay San Fernando council, in collaboration with the Municipal Health Office, successfully concluded its 3-day health mission providing free consultations, medicines, and dental services to the community.',
   'The Barangay San Fernando council, in collaboration with the Municipal Health Office, successfully concluded its 3-day health mission.

Over 500 residents received free consultations, medicines, and dental services across the three days.',
   'Admin Office', 'published', now() - interval '2 days'),
  ('q4-town-hall-budget-presentation', 'Q4 Town Hall Meeting: Budget Presentation',
   'governance',
   'Join us this coming Saturday for the final quarterly report of the year. Transparency in every peso spent.',
   'Join us this coming Saturday for the final quarterly report of the year.', 'Admin Office', 'published', now() - interval '1 day'),
  ('green-san-fernando-tree-planting', 'Green San Fernando: Tree Planting Drive',
   'environment',
   'Over 100 seedlings were planted along the riverside as part of our climate resilience initiative.',
   'Over 100 seedlings were planted along the riverside as part of our climate resilience initiative.', 'Admin Office', 'published', now() - interval '9 days');

-- Photos: article 1 gets 3 (mosaic), article 2 gets 2 (side-by-side), article 3 gets 0 (text card).
insert into public.news_photos (article_id, src, alt, sort_order)
select id, 'https://lh3.googleusercontent.com/aida-public/AB6AXuDQ1ENg0K93q5ytb5OOTgJEY55sIn8nMDOlzJU0htQWmrd7zczGG0qK3G2pZit_pe52gsn8nXZuxFE3GpmYY2BKwIjjlkUW2TZs7B4OAQifFp9FnEGJqEqFQC4DT0kz3KsKbgnHClpLUwgNYUZEVeq4a8EGE_M-7wIlojSNb2nkeAe5yarhLzxsXDrgW7wa--fNBMYQXPZm3dDe3mK68fUwJzVXjyXjfv7HNFtKclIKYXXGmAuF2k49XRRuQ3mDJxIAv7d1Ay4N0ps',
  'Medical professionals providing checkups during a community health mission', 0
from public.news_articles where slug = 'annual-barangay-health-mission';
insert into public.news_photos (article_id, src, alt, sort_order)
select id, 'https://lh3.googleusercontent.com/aida-public/AB6AXuAKfX6kI2fekmRPUd1kE_O3EyuEA3gJBN7KbNJDLjXz1PYGsNn8myyZZFhbbGnpIeJy711seRjFGNjzfgJJdN1_4JCKTETETxt_Qey4QEJ8cyiyPU2l9b_qB-HLlkwi9reMFdSd0b8LbCrY5AkFxFJvPLTHF-UpjNkyazbr4gVeTVo71J3OEJEqVDi46slsj_oc8JcjUShpuGlDyHCccCPsQAkf0lEW4spWv-w4YL9D0fJp_v3CXRVXoSwVDPQWzMXvMg6jDS_CObk',
  'Residents at a community health event', 1
from public.news_articles where slug = 'annual-barangay-health-mission';
insert into public.news_photos (article_id, src, alt, sort_order)
select id, 'https://lh3.googleusercontent.com/aida-public/AB6AXuBQMEWS1CFwllE8d9raqgMitrZe3lxxzWXQ3Bcl2I1HXP7eHqHEK-hqYJgyWkH3UD0brZRExGSa6WZnAViKeIXMh8s0B4saCQjR7DrQUVlkYtWz7hleSkf5wufO4vDDEmqkDlv8z6bMCyl0t04YwZws14Lx0jGXLoOWgFmGq-2O9kHlhu5ab9-ojY4N96RIQVx5QlNdldjOaujdC7lDoqUfEQxtEysVrhbjng7EVEHi9Z_d91NIpXXDZFAILNbLfieTKvuefXZDugY',
  'Health workers during a medical mission', 2
from public.news_articles where slug = 'annual-barangay-health-mission';
insert into public.news_photos (article_id, src, alt, sort_order)
select id, 'https://lh3.googleusercontent.com/aida-public/AB6AXuD6ma96iTbXpL5D8iY00jdQna9_E9Zc9Sz1zRrMTSnNzYAJ8lNmcAZsfdiG3Wyla4IeN5jMONdFhBJlFLpuFfF_TfK_XNjhhgv0CPkqQFbPj6gcrjAaA2_BI1MxwU8erS0Nev1byXqKmBW3krm_NWuIq4WiwGzViYZx3m4q2Hf1FudxjQVYKWDp7thYZJATFUhyPY9ADPr20voWQ8YrCleK1uzP0mlrHUCLZh3bFarIDDLdXiq6fyBtcKmqyhE8mgNMjeWwhiG4n0Q',
  'Residents attending a town hall meeting', 0
from public.news_articles where slug = 'q4-town-hall-budget-presentation';
insert into public.news_photos (article_id, src, alt, sort_order)
select id, 'https://lh3.googleusercontent.com/aida-public/AB6AXuA-DyS7lqlQDwEm2qpytdfuo-xlsf0GzLuTmdrJcxLAhT6yyg4EOtyQ4M6hnBO4G0IS-Kcs3MNwEK3pUCk9j3re7tJgHB45Mh5l4vAMU_Qq83BgZ31mSftlpO5cpPG3NCuzWWwHsEo-S1Kt9lB4SzMjfCMTVXJksgFz_Q1IGK1aDhxAtAAQvLaVCMF7lslaG3XIkdRBHkML-6ZF2Ooh80Yq6fPP0-_GIjq0dThSjfEeIhPzXyZrqPkbFn7izXoWPe8tnlQCzK6g0IM',
  'Volunteers planting trees in a local park', 1
from public.news_articles where slug = 'q4-town-hall-budget-presentation';

insert into public.announcements (title, date, excerpt, image_src, image_alt, urgent, status, published_at) values
  ('Schedule of Barangay Assembly Meeting', '2025-05-20',
   'Please be informed that the monthly barangay assembly meeting will be...',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuAKfX6kI2fekmRPUd1kE_O3EyuEA3gJBN7KbNJDLjXz1PYGsNn8myyZZFhbbGnpIeJy711seRjFGNjzfgJJdN1_4JCKTETETxt_Qey4QEJ8cyiyPU2l9b_qB-HLlkwi9reMFdSd0b8LbCrY5AkFxFJvPLTHF-UpjNkyazbr4gVeTVo71J3OEJEqVDi46slsj_oc8JcjUShpuGlDyHCccCPsQAkf0lEW4spWv-w4YL9D0fJp_v3CXRVXoSwVDPQWzMXvMg6jDS_CObk',
   'Residents gathered for a barangay assembly', false, 'published', now() - interval '1 day'),
  ('Scheduled Power Interruption', '2024-10-26',
   'Maintenance works by the electric cooperative on Puroks 4 and 5 from 8:00 AM to 5:00 PM.', null, '', true, 'published', now() - interval '3 days'),
  ('Free Medical Mission this May 25', '2025-05-18',
   'The barangay will conduct a free medical and dental mission for all...', null, '', false, 'published', now() - interval '5 days');

insert into public.events (title, category, event_date, start_time, end_time, venue, capacity, status, published_at) values
  ('Medical & Dental Mission', 'health-drive', '2025-05-25', '8:00 AM', '3:00 PM', 'Barangay Covered Court', 200, 'published', now()),
  ('Youth Leadership Seminar', 'youth', '2025-05-30', '9:00 AM', '12:00 PM', 'Barangay Hall', 60, 'published', now()),
  ('Environment Clean-up Drive', 'environment', '2025-06-05', '6:00 AM', '10:00 AM', 'Barangay San Fernando', null, 'published', now()),
  ('Senior Citizens Gathering', 'community', '2025-06-12', '1:00 PM', '5:00 PM', 'Barangay Hall', 100, 'published', now());
