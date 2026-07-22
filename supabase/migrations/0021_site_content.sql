-- Home & About CMS (sub-project 9 — umbrella §3.8; design doc
-- docs/superpowers/specs/2026-07-22-home-about-cms-design.md).
--
-- The two pages a visitor sees first were the two the barangay could not edit:
-- `/` and `/about` rendered from typed data.ts files, so changing the mission
-- statement or swapping a carousel photo meant a commit and a deploy.
--
-- RLS: enabled with NO policies, exactly like every other table. Public reads
-- go through the service-role client; writes go through Server Actions behind
-- requirePermission("manage-site-content"). The code check is the entire gate.
--
-- NO status column anywhere in this migration, and that is deliberate. Every
-- other manager has draft → in-review → published → archived because its
-- records are published individually. A page section is not a record with a
-- lifecycle; a live/draft pair would double every read path and allow the
-- absurdity of an About page with no published mission because someone left
-- one in review. Saving here writes live, exactly as saving an
-- already-published announcement does. See design §2.3.
--
-- Storage: images live in the EXISTING `public-media` bucket under a `site/`
-- prefix, seeded at deterministic paths that scripts/upload-site-images.mjs
-- populates. RUN THAT SCRIPT ONCE PER ENVIRONMENT, in the same sitting as this
-- migration — applying this alone seeds rows pointing at objects that do not
-- exist, and the home page renders broken images.

-- ── 1. The new permission ───────────────────────────────────────────────────
-- Granted to nobody. SuperAdmins bypass the permission array entirely, so they
-- can reach the manager on deploy; every other account needs the owner to tick
-- the box in Settings. Existing staff gain nothing, which is the point.
--
-- Nothing to alter: profiles.permissions is a text[], not an enum. This comment
-- exists so the permission's arrival is recorded in the migration history
-- alongside the tables it guards.

-- ── 2. Singleton text blocks ────────────────────────────────────────────────
-- Four rows, keyed by a dotted path. `value` is NULLABLE because §3.8 requires
-- mission and vision to be blankable — a barangay mid-rewrite must be able to
-- clear the field, and the public page hides the card rather than rendering an
-- empty one.
--
-- The captain's message is multi-paragraph and stored as ONE text value split
-- on blank lines at render time. A textarea is the right editor for it; a
-- second collection table for "paragraphs" would be ceremony.

create table public.site_blocks (
  key text primary key,
  value text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.site_blocks enable row level security;

create trigger site_blocks_updated_at
  before update on public.site_blocks
  for each row execute function public.set_updated_at();

comment on column public.site_blocks.value is
  'Nullable by design — mission and vision may be blanked (design §2.6). A null '
  'or empty value hides its card on the public page rather than rendering empty.';

-- ── 3. Ordered collections ──────────────────────────────────────────────────
-- Seven collections in one table rather than seven tables. Seven tables would
-- each need a query, an action module, a manager and a drawer, and the managers
-- in this repo run to several hundred lines apiece.
--
-- Three generic text slots. What each means is FIXED per block:
--
--   block              | label      | value      | body
--   -------------------+------------+------------+-------------
--   hero_slides        | —          | —          | —            (image + alt only)
--   quick_services     | title      | CTA label  | —
--   glance_stats       | stat label | stat figure| note
--   involvement_items  | title      | —          | description
--   core_values        | title      | —          | description
--   history_entries    | title      | year       | description
--   milestones         | title      | source     | description

create type public.site_block as enum (
  'hero_slides',
  'quick_services',
  'glance_stats',
  'involvement_items',
  'core_values',
  'history_entries',
  'milestones'
);

create table public.site_items (
  id uuid primary key default gen_random_uuid(),
  block public.site_block not null,
  sort_order int not null default 0,
  icon_name text,
  label text,
  value text,
  body text,
  href text,
  image_path text,
  image_alt text,
  image_fit text check (image_fit in ('cover', 'contain')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,

  -- Generic columns invite an EAV mess, so the shape is enforced HERE rather
  -- than only in the form. A glance stat with no figure, or a hero slide with
  -- no image, is rejected by Postgres.
  --
  -- MAINTENANCE NOTE: adding a value to the site_block enum without extending
  -- this CASE makes the constraint silently accept anything for that block —
  -- an unmatched CASE returns NULL, and a NULL CHECK passes. Extend both.
  constraint site_items_shape check (
    case block
      when 'hero_slides' then
        image_path is not null and image_alt is not null
      when 'quick_services' then
        label is not null and value is not null and href is not null and icon_name is not null
      when 'glance_stats' then
        label is not null and value is not null and icon_name is not null
      when 'involvement_items' then
        label is not null and body is not null and icon_name is not null
      when 'core_values' then
        label is not null and body is not null and icon_name is not null
      when 'history_entries' then
        label is not null and value is not null and body is not null
        and image_path is not null and image_alt is not null
      when 'milestones' then
        label is not null and value is not null and body is not null and icon_name is not null
    end
  )
);

create index site_items_block_sort_idx on public.site_items (block, sort_order);

alter table public.site_items enable row level security;

create trigger site_items_updated_at
  before update on public.site_items
  for each row execute function public.set_updated_at();

-- ── 4. Seed: every current value, verbatim ──────────────────────────────────
-- Applying this migration must leave both pages identical to the day before.
-- An unseeded migration blanks the front page of a live barangay site.
--
-- The glance figures (1,228 / 248 / 8.95 ha / 7) and the 1733 founding entry
-- were verified against the barangay's Ecological Profile / Barangay
-- Development Plan PDF. §3.8 accepted that they carry no provenance field here
-- and may drift from that source once editors can change them. Recorded so a
-- later reader does not mistake the drift for a regression.

insert into public.site_blocks (key, value) values
  ('about.mission',
   'To promote people participation; To provide a business-friendly environment for business investors; To ensure public safety, peace and order in the community; To sustain a clean and green environment thru intensified clean and green program implementation; and To enhance capability of barangay leaders.'),
  ('about.vision',
   'A progressive, industrialized and business friendly barangay with developed economy, God-loving, united and cooperative citizenry who lives in a peaceful, orderly and ecologically balanced environment under a firm, innovative, transparent, accountable and proactive leadership by 2026.'),
  -- Paragraphs separated by a blank line. These quotes are INVENTED placeholder
  -- content — flagged in BACKEND_HANDOFF §6 as needing the Punong Barangay's
  -- real message before launch. Moving them into the CMS is what finally makes
  -- replacing them a five-minute job instead of a deploy.
  ('about.captain_message',
   '“Ang aming pamunuan ay nakatuon sa pagbibigay ng tapat at mabilis na serbisyo para sa lahat. Naniniwala ako na sa pamamagitan ng pagkakaisa at transparency, makakamit natin ang isang mas maunlad at ligtas na barangay.”' || chr(10) || chr(10) ||
   '“It is our honor to serve this historic community. We are modernizing our systems to ensure that no one is left behind in our journey toward a digital and efficient local government. Maraming salamat sa inyong patuloy na pagtitiwala.”'),
  -- Seeded as the existing lh3 hotlink verbatim, so nothing changes on deploy.
  -- The field accepts an uploaded image, so the first edit removes one hotlink
  -- from the codebase. Migrating the rest stays outside this programme.
  ('home.cta_image',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuDdUZq8tdAhUP0f1C3psoNXrr7LYQFX_4T6TL0OjRcM0zwxNFRi3Syn7EBYV9Vh3XhVTmfY_wz2-9d2Gowg6-C4aBHMmP5G3FIkuoLomUFq5cRZ041Bp8nRb9KX4ylWdytodNwOBZeFzuKDGNJ_uoLas3SuyV1tme8Unz0JoXnWTC-6v-BnV5IWyVX70-H0oqLiWjLZFG48zxBKvRdJrr8FEsSWNlhRDeGlLorF3NvaUGRej6MN-GkAhgojKlOmgtHIqPT5eMSs2QY');

-- Hero carousel — real barangay photos, previously bundled static imports.
insert into public.site_items (block, sort_order, image_path, image_alt) values
  ('hero_slides', 0, 'site/hero-certificate.jpg',
   'Certificate recognizing Barangay San Fernando as an Active Clean-up Partner of San Nicolas'),
  ('hero_slides', 1, 'site/hero-organization.jpg',
   'Barangay San Fernando officials and volunteers gathered at the barangay hall'),
  ('hero_slides', 2, 'site/hero-cleaning-operation.jpg',
   'Residents clearing branches during a community clean-up drive'),
  ('hero_slides', 3, 'site/hero-trick-or-treat.jpg',
   'Children in costumes receiving treats during a barangay trick-or-treat event');

insert into public.site_items (block, sort_order, icon_name, label, value, href) values
  ('quick_services', 0, 'file-text', 'Barangay Clearance', 'Apply Online', '/services'),
  ('quick_services', 1, 'file-badge', 'Certificate Requests', 'Request Now', '/services'),
  ('quick_services', 2, 'calendar-days', 'Set an Appointment', 'Book Now', '/appointments/new'),
  ('quick_services', 3, 'file-edit', 'File a Complaint', 'Submit Online', '/complaints/new'),
  ('quick_services', 4, 'store', 'Business Permit', 'Apply Now', '/services'),
  ('quick_services', 5, 'heart-handshake', 'Social Services Assistance', 'Request Now', '/assistance/new');

insert into public.site_items (block, sort_order, icon_name, label, value, body) values
  ('glance_stats', 0, 'users', 'Total Population', '1,228', 'as of 2024'),
  ('glance_stats', 1, 'home', 'Households', '248', 'as of 2024'),
  -- 8.95 ha is correct. The source PDF's own "(0.895 sq. km)" parenthetical is
  -- a decimal error and must not be reintroduced.
  ('glance_stats', 2, 'map', 'Total Land Area', '8.95 ha', null),
  ('glance_stats', 3, 'layout-grid', 'Puroks', '7', 'Active Puroks');

insert into public.site_items (block, sort_order, icon_name, label, body) values
  ('involvement_items', 0, 'users', 'Participate', 'Join barangay activities and programs.'),
  ('involvement_items', 1, 'heart', 'Volunteer', 'Be a volunteer and help your community.'),
  ('involvement_items', 2, 'message-square', 'Give Feedback', 'We value your opinion. Help us improve.'),
  ('involvement_items', 3, 'bell', 'Stay Updated', 'Get the latest news and announcements.');

insert into public.site_items (block, sort_order, icon_name, label, body) values
  ('core_values', 0, 'shield-check', 'Integrity', 'Honesty in every action.'),
  ('core_values', 1, 'heart-handshake', 'Service', 'Putting the people first.'),
  ('core_values', 2, 'accessibility', 'Accountability', 'Answerable to the public.'),
  ('core_values', 3, 'leaf', 'Sustainability', 'Preserving for the future.');

insert into public.site_items
  (block, sort_order, label, value, body, image_path, image_alt, image_fit) values
  ('history_entries', 0, 'Founding', '1733',
   'Barangay 11 San Fernando was founded in 1733 — one of the barangays of San Nicolas named after saints, according to the History of San Nicolas by Atty. Manuel F. Aurelio.',
   'site/history-seal.png',
   'Official seal of Barangay San Fernando, San Nicolas, Ilocos Norte',
   'contain'),
  ('history_entries', 1, 'An Urban Poblacion Barangay', 'Today',
   'San Fernando is one of the 15 urban barangays surrounding the center of San Nicolas — 8.95 hectares and seven sitios that are home to about 1,228 residents (RBI 2024). It is bounded by San Ildefonso, San Paulo, San Cayetano, and San Guillermo, just 250 meters from the Municipal Hall along the Manila North Road.',
   'site/history-community.jpg',
   'Barangay officials and residents gathered for a community group photo',
   'cover');

insert into public.site_items (block, sort_order, icon_name, label, value, body) values
  ('milestones', 0, 'leaf', 'Weekly Community Clean-Up Drive', 'Barangay Development Plan',
   'Residents join barangay officials, SK officials, health workers, and tanods in the mandatory weekly clean-up of roads, canals, and vacant lots.'),
  ('milestones', 1, 'recycle', '100% Household Waste Segregation', 'RBI 2024',
   'All 248 households segregate their garbage and are covered by scheduled barangay-wide collection.'),
  ('milestones', 2, 'droplets', 'Flood Mitigation Through Canal Rehabilitation', 'Barangay Development Plan',
   'As the catch basin of neighboring barangays, San Fernando rehabilitated its canals so typhoon floodwater now subsides quickly.');
