-- ============================================================================
-- Barangay San Fernando — CONSOLIDATED BASELINE SCHEMA
-- Squash of migrations 0001–0035, as of 2026-07-23 (0031, 0032, 0033, 0034 and
-- 0035 folded in after the fact — see supabase/migrations/README.md).
-- ============================================================================
--
-- WHAT THIS IS
-- ------------
-- One file that builds the *final state* of migrations 0001 through 0035 on an
-- empty database, in a single transaction. It is not a replay: columns that a
-- later migration dropped are never created, columns that a later migration
-- relaxed are declared relaxed, and functions appear once in their final form.
--
-- WHEN TO USE IT
-- --------------
--   • Standing up a NEW environment (production, a fresh staging, a local dev
--     database) from nothing.
--   • NOT for an environment that already has any of 0001–0035 applied. This
--     file assumes an empty `public` schema and will fail loudly on a database
--     that already has these objects — which is the intended behaviour. To
--     bring an existing environment forward, apply the individual numbered
--     migrations it is missing, in order.
--
-- AFTER APPLYING — TWO SCRIPTS ARE REQUIRED, in the same sitting
-- --------------------------------------------------------------
--   1. node scripts/upload-official-portraits.mjs   (officials seed → officials-media/officials/)
--   2. node scripts/upload-site-images.mjs          (site content seed → site-media/site/)
-- Both seed sets below point at deterministic Storage paths. Without the
-- scripts the officials directory and the home/About pages render broken
-- images. Original migrations 0012 and 0021 carry the same warning.
--
-- HOW IT DIFFERS FROM RUNNING 0001–0035 IN SEQUENCE
-- --------------------------------------------------
-- The end state is identical. Four mechanical differences, all deliberate:
--
--   a. `public.official_group` is created with all four labels including
--      'members'. Migration 0022 had to add that label with ALTER TYPE, which
--      cannot be *used* in the transaction that adds it — hence 0022's warning
--      never to seed a 'members' row in that file. Creating the enum whole
--      removes the hazard entirely; there is no such restriction here.
--   b. `public.site_block` keeps its dead 'quick_services' label and the
--      matching branch of the `site_items_shape` CHECK, even though 0022
--      deleted every row using it and Quick Services now lives in
--      src/features/home/data.ts. Postgres cannot drop an enum label, so a
--      0001–0022 database HAS this label; keeping it means a baselined
--      database and a migrated one are schema-identical. Nothing in `src/`
--      writes it — see the drift note in src/types/index.ts.
--   c. The audit-log backfills from 0014 (§3 and §4 of that file) are omitted.
--      They rewrote pre-existing rows; a new database has none. Consequently a
--      baselined database does not carry 0014's cosmetic wart where historical
--      rows repeat their label in `detail`, nor the permanent "Migration
--      Verification" row from the immutability test.
--   d. 0032's ticket_updates backfill (§5 of that file) is omitted, for the
--      same reason as (c): it synthesised timeline rows for tickets that
--      already existed, and a new database has none. The four status CHECKs
--      are declared with the widened value lists directly rather than being
--      dropped and re-added, and replied_at is a column on each table rather
--      than a later ALTER.
--
-- ARCHITECTURAL POSTURE (unchanged from the source migrations)
-- ------------------------------------------------------------
-- Every table has RLS ENABLED WITH ZERO POLICIES, with four deliberate
-- exceptions: public.profiles (§4), public.services and
-- public.assistance_categories (§5), and storage.objects (§11, one
-- public-read policy per public bucket).
-- The service-role client, called behind an explicit
-- requirePermission(...) / requireSuperAdmin() check in src/lib/auth.ts, is the
-- entire authorization gate; the public/published boundary is the
-- .eq("status","published") filter in the query layer. Never expose the
-- service-role key to the client.
--
-- SECTION MAP
--   1. Extensions
--   2. Shared trigger function
--   3. Enums
--   4. Auth: profiles + audit log
--   5. Ticketing: counters, services, and the four request flows
--   6. News, announcements & events
--   7. Transparency
--   8. Officials
--   9. Inquiries, feedback & alert subscribers
--  10. Site content (Home & About CMS)
--  11. Storage buckets
--  12. Search functions
--  13. Seed — reference data & real content (required)
--  14. Rate limiting
--  15. Audit-log immutability (applied last, on purpose)
-- ============================================================================

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. EXTENSIONS                                              [0015, 0016, 0034]
-- ════════════════════════════════════════════════════════════════════════════
-- fuzzystrmatch powers levenshtein(), the edit-distance route inside
-- public.fuzzy_match (§12). pg_trgm no longer backs a match route — 0034
-- removed the word_similarity() one — but it is still required: the gin_trgm_ops
-- indexes below are declared with it, so dropping the extension would fail.

create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. SHARED TRIGGER FUNCTION                                             [0001]
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. ENUMS                              [0007, 0009, 0012, 0014, 0019, 0021, 0022, 0023]
-- ════════════════════════════════════════════════════════════════════════════

-- The content lifecycle shared by news, announcements, events, officials and
-- the three transparency tables. There is no 'scheduled' state — scheduling is
-- not a feature — and 'archived' is a soft delete, never a status-dropdown
-- value in the UI (it is reached through the Active | Archived view toggle).
create type public.content_status as enum ('draft', 'in-review', 'published', 'archived');

create type public.event_category as enum
  ('town-hall', 'health-drive', 'festival', 'youth', 'environment', 'community');

create type public.legislative_type as enum ('ordinance', 'resolution');

-- 'members' ("Barangay Members") is the fourth directory section, added by
-- 0022. Created inline here — see note (a) in the header.
create type public.official_group as enum
  ('executive', 'council', 'administration', 'members');

-- Controlled action classes for the audit log's required Action Type dropdown.
-- The free-text `action` column lives alongside as human-readable detail.
create type public.audit_action as enum (
  'create',
  'update',
  'delete',
  'archive',
  'restore',
  'publish',
  'unpublish',
  'save_draft',
  'approve',
  'reject',
  'login',
  'logout',
  'file_upload',
  'file_delete',
  'role_change',
  'password_reset',
  'reorder'
);

-- The ticket lifecycle trimmed to what an inquiry actually goes through.
create type public.inquiry_status as enum ('new', 'in_progress', 'answered', 'closed');

-- Ordered collections on the Home and About pages, discriminated in one table.
-- 'quick_services' is a dead label — see note (b) in the header.
create type public.site_block as enum (
  'hero_slides',
  'quick_services',
  'glance_stats',
  'involvement_items',
  'core_values',
  'history_entries',
  'milestones'
);

create type public.feedback_category as enum ('general', 'bug', 'feature', 'complaint', 'praise');

-- Deliberately NOT the inquiry_status enum. 'answered' would be a lie on a row
-- nobody can answer, because site feedback is anonymous and carries no reply
-- address. These four values are already carried by StatusChip's label and tone
-- maps, so the admin chip needs no edit.
create type public.feedback_status as enum ('new', 'in_progress', 'resolved', 'dismissed');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. AUTH: PROFILES + AUDIT LOG                        [0001, 0002, 0003, 0014]
-- ════════════════════════════════════════════════════════════════════════════
-- Permission model: SuperAdmin has full power; everyone else's real power is
-- exactly the permissions[] array. status_label ('staff' | 'editor') is a title
-- only and grants nothing.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  -- Split name parts, captured on account creation and kept in sync with
  -- full_name by buildFullName() on every SuperAdmin-driven write.      [0031]
  first_name text not null,
  middle_name text,
  last_name text not null,
  status_label text not null default 'staff'
    check (status_label in ('staff', 'editor')),
  is_superadmin boolean not null default false,
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cellphone, editable by the account owner in Settings.              [0003]
  phone text,
  -- Profile picture: avatars-media path, or null for initials.         [0025]
  avatar_src text,
  -- Bell "have I looked?" stamp. Null means never opened.              [0026]
  notifications_seen_at timestamptz,
  -- Staff email uniqueness enforced at the database layer.             [0002]
  constraint profiles_email_unique unique (email)
);

alter table public.profiles enable row level security;

-- Signed-in staff may read profiles (own session + team list). All writes go
-- through the service-role client after an explicit SuperAdmin check in code.
create policy "profiles readable by signed-in staff"
  on public.profiles for select to authenticated using (true);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── Audit log ───────────────────────────────────────────────────────────────
-- Append-only and genuinely immutable (§14). recordActivity() in
-- src/lib/audit.ts is the only writer.
--
-- actor_id is deliberately NOT a foreign key. 0001 declared it
-- `references auth.users (id) on delete set null`; that ON DELETE is an UPDATE
-- against audit_log, which §14's trigger rejects — so deleting any staff member
-- who had ever acted would raise instead of succeeding. actor_name is
-- denormalised onto every row so the trail still reads correctly after an
-- account is removed, which is what "the audit log never points at a ghost"
-- requires.

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  detail text,
  created_at timestamptz not null default now(),
  -- Declared last so the physical column order matches a database built by
  -- replaying 0001–0022, where 0014 appended these two with ALTER TABLE.
  --
  -- Controlled class. NOT NULL with NO DEFAULT on purpose: the single writer
  -- must always classify, and a default would let an unclassified write pass.
  action_type public.audit_action not null,
  -- The target's human name captured at WRITE time. Resolving it at read time
  -- would break exactly when the record is deleted — the case the trail exists
  -- for.
  entity_label text
);

comment on column public.audit_log.actor_id is
  'auth.users id at the time of the action. Deliberately NOT a foreign key — '
  'the log outlives the account, and actor_name preserves the readable name.';
comment on column public.audit_log.action_type is
  'Controlled action class, drives the Audit Logs dropdown filter. Never null.';
comment on column public.audit_log.entity_label is
  'Human name of the target captured at write time (e.g. "Maria Santos"), so the '
  'trail still reads correctly after the target row is deleted.';
comment on column public.audit_log.detail is
  'Free-text extra context — staff remarks on ticket decisions. NOT the entity '
  'name; that is entity_label.';

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_action_type_idx on public.audit_log (action_type, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

-- Trigram index over the same concatenation search_audit_log() searches.
create index audit_log_search_trgm_idx
  on public.audit_log using gin (
    (
      lower(
        actor_name || ' ' ||
        coalesce(entity_label, '') || ' ' ||
        entity_type || ' ' ||
        action || ' ' ||
        coalesce(entity_id, '')
      )
    ) gin_trgm_ops
  );

-- No read policy. 0001 had one that let any signed-in staff member read the
-- whole log via the anon key; 0014 dropped it. The log is SuperAdmin-only and
-- reached through the service-role client, like every other table here.
alter table public.audit_log enable row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. TICKETING                              [0004, 0005, 0006, 0032, 0033]
-- ════════════════════════════════════════════════════════════════════════════
-- Ticket numbers are per-prefix, per-year, sequential: APP-2026-00001. The
-- counter row is locked by INSERT .. ON CONFLICT DO UPDATE, so concurrent
-- inserts serialize instead of colliding. All four flows share the function.
--
-- The year comes from Asia/Manila, not UTC: a ticket filed at 8am Manila on
-- Jan 1 must read 2027, not 2026.
--
-- RLS on the four ticket tables: enabled with NO policies, deliberately.
-- Neither anon nor authenticated may touch them. The public /track lookup and
-- the admin queues both go through the service-role client after an explicit
-- check in code, so the privacy gate lives in one reviewable place.

create table public.ticket_counters (
  prefix text not null,
  year int not null,
  last_number int not null default 0,
  primary key (prefix, year)
);

alter table public.ticket_counters enable row level security;

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

-- ── Services catalog ────────────────────────────────────────────────────────
-- id doubles as the URL slug and is the FK target for applications. icon_name
-- is resolved to a component on the frontend — never store components.
-- flow drives routing (src/features/services/flow.ts's serviceHref): 'apply'
-- routes to /services/apply/[slug], 'complaint' to /complaints/new,
-- 'assistance' to /assistance/new, 'appointment' to /appointments/new.
-- tone is purely visual (card styling) and plays no part in routing.

create table public.services (
  id text primary key,
  title text not null,
  description text not null,
  icon_name text not null,
  tone text not null default 'primary' check (tone in ('primary', 'danger')),
  flow text not null default 'apply' check (flow in ('apply', 'complaint', 'assistance', 'appointment')),
  requirements_label text not null,
  cta_label text not null,
  requirements text[] not null default '{}',
  department text not null,
  is_available boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create index services_sort_order_idx on public.services (sort_order);

alter table public.services enable row level security;

create policy "services readable by anyone"
  on public.services for select using (true);

create trigger services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ── Certificate applications ────────────────────────────────────────────────

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default public.next_ticket_number('APP'),
  first_name text not null,
  last_name text not null,
  address text not null,
  contact_number text not null,
  email text,
  -- middle_name/birth_date added by 0033. birth_date is REQUIRED on new rows but
  -- nullable here: the requirement is enforced in Zod (public + walk-in schemas),
  -- and rows predating 0033 have no value. purpose became nullable in the same
  -- migration.
  middle_name text,
  birth_date date,
  service_id text not null references public.services (id),
  purpose text,
  status text not null default 'pending'
    check (status in ('pending', 'under-review', 'awaiting-info', 'approved', 'released', 'rejected')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  released_by uuid references auth.users (id) on delete set null,
  released_by_name text,
  released_at timestamptz,
  replied_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  -- Data Privacy Act consent, persisted. Walk-ins consent in person.
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ticket_no already has a unique index from its constraint, which is what the
-- /track lookup filters on; the last name is matched in application code (a
-- PostgREST ilike would read a stray '%' as a wildcard and turn a guessed
-- ticket number into a privacy leak), so no index covers it.
create index applications_created_at_idx on public.applications (created_at desc);
create index applications_status_idx on public.applications (status);
create index applications_replied_at_idx on public.applications (replied_at) where replied_at is not null;

comment on column public.applications.middle_name is
  'Optional middle name. NULL when not given — never an empty string.';
comment on column public.applications.birth_date is
  'Required on new rows (enforced in Zod); NULL only on rows predating 0033.';
comment on column public.applications.purpose is
  'Optional since 0033. NULL when not given — never an empty string.';

alter table public.applications enable row level security;

create trigger applications_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ── Assistance categories ───────────────────────────────────────────────────
-- SuperAdmin-editable picker. Rows are retired via is_active and never
-- deleted: assistance_requests reference them, and a hard delete would orphan
-- a resident's record.

create table public.assistance_categories (
  id text primary key,
  label text not null,
  description text not null default '',
  requirements text[] not null default '{}',
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index assistance_categories_sort_order_idx
  on public.assistance_categories (sort_order);

alter table public.assistance_categories enable row level security;

create policy "assistance categories readable by anyone"
  on public.assistance_categories for select using (true);

create trigger assistance_categories_updated_at
  before update on public.assistance_categories
  for each row execute function public.set_updated_at();

-- ── Appointments ────────────────────────────────────────────────────────────
-- The resident asks for a preferred date + AM/PM; staff confirm that slot,
-- confirm a different one, or decline. There is no slot calendar, so
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
    check (status in ('pending', 'under-review', 'awaiting-info', 'confirmed', 'completed', 'declined')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  completed_by_name text,
  completed_at timestamptz,
  replied_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_created_at_idx on public.appointments (created_at desc);
create index appointments_status_idx on public.appointments (status);
create index appointments_replied_at_idx on public.appointments (replied_at) where replied_at is not null;

alter table public.appointments enable row level security;

create trigger appointments_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ── Complaints ──────────────────────────────────────────────────────────────
-- The barangay's highest-privacy record: narrative, respondent and location
-- NEVER leave the admin queue. /track shows a complaint's status only.
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
    check (status in ('received', 'under-review', 'awaiting-info', 'resolved', 'dismissed')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  closed_by_name text,
  closed_at timestamptz,
  replied_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index complaints_created_at_idx on public.complaints (created_at desc);
create index complaints_status_idx on public.complaints (status);
create index complaints_replied_at_idx on public.complaints (replied_at) where replied_at is not null;

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
    check (status in ('pending', 'under-review', 'awaiting-info', 'granted', 'declined')),
  remarks text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  replied_at timestamptz,
  source text not null default 'online' check (source in ('online', 'walk-in')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistance_requests_created_at_idx
  on public.assistance_requests (created_at desc);
create index assistance_requests_status_idx on public.assistance_requests (status);
create index assistance_requests_replied_at_idx
  on public.assistance_requests (replied_at) where replied_at is not null;

alter table public.assistance_requests enable row level security;

create trigger assistance_requests_updated_at
  before update on public.assistance_requests
  for each row execute function public.set_updated_at();

-- ── ticket_updates ──────────────────────────────────────────────────────────
-- The append-only resident-facing timeline for all four flows [0032].
--
-- Linked by ticket_no, not a uuid FK: there is no Postgres FK to a four-table
-- union, and ticket_no is already globally unique by construction
-- (next_ticket_number counts per (prefix, year); APP/APT/CMP/AST never collide).
-- lookupTicket already depends on this via tickets_view.
--
-- RLS enabled with NO policies, like every ticket table. Neither anon nor
-- authenticated may touch it; the service-role client after an explicit code
-- check is the entire gate.

create table public.ticket_updates (
  id            uuid primary key default gen_random_uuid(),
  ticket_no     text not null,
  ticket_kind   text not null check (ticket_kind in
                  ('application','appointment','complaint','assistance')),
  entry_type    text not null check (entry_type in
                  ('status','staff-note','info-request','resident-reply')),
  -- Set only on entry_type = 'status'; the status the ticket moved TO.
  status        text,
  body          text not null default '',
  -- The ENTIRE privacy gate for internal notes. Filtered in the query layer.
  visibility    text not null check (visibility in ('public','internal')),
  author_kind   text not null check (author_kind in ('staff','resident','system')),
  author_id     uuid references auth.users (id) on delete set null,
  author_name   text,
  -- [{path,name,mime,sizeBytes}] — resident replies only.
  attachments   jsonb not null default '[]',
  -- When a resident email was attempted for this entry.
  notified_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index ticket_updates_ticket_idx
  on public.ticket_updates (ticket_no, created_at);
create index ticket_updates_public_idx
  on public.ticket_updates (ticket_no, created_at) where visibility = 'public';

alter table public.ticket_updates enable row level security;

-- ── tickets_view ────────────────────────────────────────────────────────────
-- Common fields across all four kinds, backing /track. Type-specific columns
-- are deliberately absent: /track reads `kind` from here, then fetches what it
-- needs from the owning table. A complaint's narrative therefore cannot leak
-- through the view even if a future caller selects *.
--
-- security_invoker = true is LOAD-BEARING. A Postgres view runs with its
-- OWNER's privileges by default, and the owner bypasses RLS — a default view
-- over these tables would serve every ticket in the barangay to anonymous
-- PostgREST reads, inverting the whole posture above. With security_invoker
-- the view runs as the querying role, so the underlying no-policy RLS denies
-- anon and authenticated. The revoke below is belt-and-braces on top.

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

-- ════════════════════════════════════════════════════════════════════════════
-- 6. NEWS, ANNOUNCEMENTS & EVENTS                        [0007, 0020, 0027]
-- ════════════════════════════════════════════════════════════════════════════
-- Content moves through draft → in-review → published → archived. published_at
-- is set once, on the first transition into 'published', and drives
-- newest-first ordering and the auto "NEW" badge (within 7 days).
--
-- archived_at / archived_by (0020) put archive provenance on the row itself:
-- the audit log already records every archive, but it is SuperAdmin-only, so
-- the staff member looking at the Archived view could not otherwise see why a
-- record is sitting there. Both are cleared by the restore actions.

-- ── News categories ─────────────────────────────────────────────────────────
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
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null
);
create index news_articles_status_published_idx
  on public.news_articles (status, published_at desc);
alter table public.news_articles enable row level security;
create trigger news_articles_updated_at
  before update on public.news_articles
  for each row execute function public.set_updated_at();

-- ── News photos (0–3 per article; cap enforced in the Server Action) ────────
create table public.news_photos (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles (id) on delete cascade,
  src text not null,
  alt text not null default '',
  sort_order int not null default 0
);
create index news_photos_article_idx on public.news_photos (article_id, sort_order);
alter table public.news_photos enable row level security;

-- ── Announcements ───────────────────────────────────────────────────────────
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  date date not null,
  excerpt text not null,
  body text not null default '',
  image_src text,
  image_alt text not null default '',
  urgent boolean not null default false,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null
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
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null
);
create index events_status_date_idx
  on public.events (status, event_date asc);
alter table public.events enable row level security;
create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 7. TRANSPARENCY                            [0009, 0010, 0011, 0016, 0020, 0024]
-- ════════════════════════════════════════════════════════════════════════════

-- ── Categories ──────────────────────────────────────────────────────────────
create table public.transparency_categories (
  id text primary key,
  label text not null,
  icon_name text not null default 'file-text',
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index transparency_categories_sort_order_idx
  on public.transparency_categories (sort_order);
alter table public.transparency_categories enable row level security;
create trigger transparency_categories_updated_at
  before update on public.transparency_categories
  for each row execute function public.set_updated_at();

-- ── Legislative documents (ordinances & resolutions) ────────────────────────
-- The public tables order by (year desc, seq_no asc) since 0024: newest year
-- first, counting up by sequence within it. The date_approved indexes below
-- still back the admin listing's default order.
--
-- date_approved is NULLABLE (0010): a document can be uploaded before it is
-- approved — the draft PDF, number and title all exist ahead of the date. Such
-- rows render "Pending Approval". On the date_approved-ordered admin listing
-- they SORT FIRST, above approved ones — a product decision, not merely the
-- NULLS-FIRST-on-DESC default, so those indexes state `nulls first` explicitly.
create table public.legislative_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  doc_type public.legislative_type not null,
  number text not null,
  seq_no int not null,
  year int not null,
  title text not null,
  date_approved date,
  summary text not null default '',
  file_path text,
  file_size_bytes int,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,
  constraint legislative_documents_seq_no_range check (seq_no > 0 and seq_no < 10000),
  constraint legislative_documents_year_range check (year between 1900 and 2200),
  constraint legislative_documents_number_unique unique (doc_type, year, seq_no)
);
create index legislative_documents_status_date_idx
  on public.legislative_documents (status, date_approved desc nulls first);
create index legislative_documents_type_status_date_idx
  on public.legislative_documents (doc_type, status, date_approved desc nulls first);
create index legislative_documents_type_status_year_seq_idx
  on public.legislative_documents (doc_type, status, year desc, seq_no asc);
create index legislative_documents_search_trgm_idx
  on public.legislative_documents using gin (
    (lower(number || ' ' || title || ' ' || coalesce(summary, ''))) gin_trgm_ops
  );
alter table public.legislative_documents enable row level security;
create trigger legislative_documents_updated_at
  before update on public.legislative_documents
  for each row execute function public.set_updated_at();

-- ── Transparency documents (budgets, financials, awards) ────────────────────
-- No file_path / file_size_bytes column: 0011 moved attachments to the shared
-- transparency_files child table, up to 3 per record. date_released is
-- nullable and renders "Undated", mirroring "Pending Approval" above; a DESC
-- index already orders NULLS FIRST, which is the ordering the app wants.
create table public.transparency_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_id text not null
    references public.transparency_categories (id) on delete restrict,
  date_released date,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null
);
create index transparency_documents_status_date_idx
  on public.transparency_documents (status, date_released desc);
create index transparency_documents_category_idx
  on public.transparency_documents (category_id, status, date_released desc);
alter table public.transparency_documents enable row level security;
create trigger transparency_documents_updated_at
  before update on public.transparency_documents
  for each row execute function public.set_updated_at();

-- ── Projects ────────────────────────────────────────────────────────────────
-- Projects keep manual up/down sort_order rather than column sorting: progress
-- tracking reads better in a curated order.
create table public.transparency_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  progress int not null default 0 check (progress between 0 and 100),
  sort_order int not null default 0,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Optional project date, added by 0011. Declared here so the physical column
  -- order matches a database built by replaying 0001–0022.
  date date,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null
);
create index transparency_projects_status_sort_idx
  on public.transparency_projects (status, sort_order);
alter table public.transparency_projects enable row level security;
create trigger transparency_projects_updated_at
  before update on public.transparency_projects
  for each row execute function public.set_updated_at();

-- ── Shared file child table ─────────────────────────────────────────────────
-- Polymorphic: one row per attached file for either a document or a project.
-- There is deliberately NO foreign key on owner_id — it points at two
-- different parent tables — so referential integrity is enforced entirely in
-- application code: the save actions cap at 3 files (MAX_FILES_PER_RECORD in
-- src/lib/storage.ts) and the delete actions remove a record's file rows AND
-- its storage objects before/with the parent row.
create table public.transparency_files (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('document', 'project')),
  owner_id uuid not null,
  path text not null,
  mime text not null,
  size_bytes int not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index transparency_files_owner_idx
  on public.transparency_files (owner_type, owner_id, sort_order);
alter table public.transparency_files enable row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. OFFICIALS                                            [0012, 0013, 0020]
-- ════════════════════════════════════════════════════════════════════════════
-- NOTE: `group` is a SQL reserved word. It is quoted as "group" here and must
-- be quoted in every PostgREST select/order string too.

create table public.officials (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  role text not null,
  "group" public.official_group not null,
  badge text,
  -- Nullable so a draft can be saved before the portrait is ready. Publishing
  -- requires both a portrait and its alt text (enforced in setOfficialStatus),
  -- so every row the public queries can return has one.
  photo_path text,
  photo_alt text not null default '',
  term text not null default '',
  email text,
  phone text,
  bio text not null default '',
  sort_order int not null default 0,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null
);

create index officials_status_group_sort_idx
  on public.officials (status, "group", sort_order);

alter table public.officials enable row level security;

create trigger officials_updated_at
  before update on public.officials
  for each row execute function public.set_updated_at();

-- ── Achievements ────────────────────────────────────────────────────────────
-- Mirrors news_articles → news_photos. Cascades two hops:
-- officials → official_achievements → official_achievement_photos.
--
-- The public boundary stacks on the official's own status = 'published': an
-- achievement reaches /officials/[slug] only when is_visible = true AND title
-- is non-empty. "Add achievement" creates a blank row (the photo uploader
-- needs a stable id before staff type anything), so an unfinished entry must
-- never leak public. The filter is applied twice on purpose — in the embedded
-- query and again in plain TypeScript.

create table public.official_achievements (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references public.officials (id) on delete cascade,
  title text not null default '',
  description text not null default '',
  -- Free text, not a date: "March 2024", "2023-2024", "Ongoing". Ordering is
  -- owned by sort_order, so this never needs to sort.
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

-- ════════════════════════════════════════════════════════════════════════════
-- 9. INQUIRIES, FEEDBACK & ALERT SUBSCRIBERS                       [0019, 0023]
-- ════════════════════════════════════════════════════════════════════════════
-- Writes come from unauthenticated Server Actions using the service-role
-- client with Zod validation and a rate limit; reads go through
-- requirePermission("handle-inquiries").

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  -- The same identity block as the four ticket tables, minus the address: a
  -- question does not need to know where someone lives.
  first_name text not null,
  last_name text not null,
  -- Required here, unlike the ticket forms: an inquiry has no ticket number
  -- and nothing to track, so the reply address is the whole mechanism.
  email text not null,
  phone text not null default '',
  -- One of INQUIRY_SUBJECTS in src/features/contact/data.ts. Stored as text
  -- rather than an enum so the barangay can add a subject without a migration;
  -- the Server Action validates it against the same list the form renders.
  subject text not null,
  message text not null,
  status public.inquiry_status not null default 'new',
  -- Free-text note staff add when they answer. Not sent to the resident —
  -- replying happens by email or phone until Resend (plan 2D) lands.
  staff_note text not null default '',
  -- Nullable and ON DELETE SET NULL: deleting a staff account must not delete
  -- a resident's inquiry.
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inquiries_status_created_idx
  on public.inquiries (status, created_at desc);

alter table public.inquiries enable row level security;

create trigger inquiries_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

-- ── Site feedback ───────────────────────────────────────────────────────────
-- /contact is for barangay business: it demands a name, an email and a Data
-- Privacy Act consent tick. A resident with a note about a dead download link
-- had no channel that fit. This is that channel.
--
-- Anonymous by design: no name, no email, no account link, and the caller's IP
-- is used to rate-limit but never stored. That removes the DPA consent question
-- entirely — there is no personal data here to consent to the processing of.
-- The accepted cost is that staff can never follow up on a report.
--
-- Reads go through requirePermission("handle-inquiries") — the same gate as the
-- inquiry inbox, because the same people work both queues.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  category public.feedback_category not null default 'general',
  subject text not null,
  message text not null,
  -- Null means "not given". The rating is optional, and storing 0 for
  -- "unrated" would drag every average down.
  rating smallint check (rating between 1 and 5),
  -- The page the resident was on when they opened the widget. Path only, never
  -- the query string: a path is context, a query string can carry a token or
  -- something the resident typed into a search box.
  page_path text not null default '',
  -- `feedback/<uuid>.<ext>` in the private feedback-media bucket, or null.
  screenshot_path text,
  status public.feedback_status not null default 'new',
  -- Internal triage note. Never sent anywhere — there is no address to send to.
  staff_note text not null default '',
  -- Nullable, ON DELETE SET NULL: deleting a staff account must not delete the
  -- report. The audit log holds the durable record of who did what.
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The queue is worked newest-first and filtered by status, which is this index.
create index feedback_status_created_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

create trigger feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

create table public.alert_subscribers (
  id uuid primary key default gen_random_uuid(),
  -- Digits only, normalised by the Server Action before insert, so the unique
  -- index actually catches "0917 555 0101" and "09175550101" as one person.
  mobile text not null,
  -- Unsubscribing keeps the row: someone who opts out and is later re-added by
  -- a bulk import should stay opted out.
  is_active boolean not null default true,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index alert_subscribers_mobile_key on public.alert_subscribers (mobile);

alter table public.alert_subscribers enable row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. SITE CONTENT — HOME & ABOUT CMS                              [0021, 0022]
-- ════════════════════════════════════════════════════════════════════════════
-- Writes go through Server Actions behind requirePermission("manage-site-content"),
-- a permission deliberately granted to nobody by default and deliberately NOT
-- in STATUS_PRESETS.editor — presets pre-tick boxes for every account created
-- afterwards, so including it would hand the front page to the next editor
-- without anyone deciding to. SuperAdmins bypass the array.
--
-- NO status column anywhere in this section, deliberately. A page section is
-- not a record with a lifecycle; a live/draft pair would double every read
-- path and permit an About page with no published mission because someone left
-- one in review. Saving here writes live. Consequently there is no
-- Active | Archived toggle and no guardDelete — deletion is direct and takes
-- the item's storage object with it.
--
-- Every action MUST call revalidatePath("/") AND revalidatePath("/about"),
-- or an edit sits invisible for up to an hour and reads as a broken CMS.

-- ── Singleton text blocks ───────────────────────────────────────────────────
-- `value` is NULLABLE because mission and vision must be blankable — a
-- barangay mid-rewrite must be able to clear the field, and the public page
-- hides the card rather than rendering an empty one.
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

-- ── Ordered collections ─────────────────────────────────────────────────────
-- Several collections in one table rather than one table each: seven tables
-- would each need a query, an action module, a manager and a drawer. Three
-- generic text slots, whose meaning is FIXED per block and mirrored in
-- src/features/admin/site-blocks.ts:
--
--   block              | label      | value       | body
--   -------------------+------------+-------------+-------------
--   hero_slides        | —          | —           | —            (image + alt only)
--   quick_services     | title      | CTA label   | —            (DEAD — see below)
--   glance_stats       | stat label | stat figure | note
--   involvement_items  | title      | —           | description
--   core_values        | title      | —           | description
--   history_entries    | title      | year        | description
--   milestones         | title      | source      | description
--
-- 'quick_services' is retained as an unreachable label and an unreachable
-- CHECK branch. 0022 removed its rows and returned the six home-page shortcut
-- cards to src/features/home/data.ts: they are links to this site's own
-- routes, so they change when the routes change, which is a deploy, not an
-- edit. Postgres cannot drop an enum value, so a 0001–0022 database still
-- carries the label; it is kept here so a baselined database matches. The
-- TypeScript SITE_BLOCKS union no longer mirrors this enum exactly, and the
-- drift runs one way only — every value in the union must still exist here.

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
  -- MAINTENANCE TRAP: this is a CASE over the enum with NO ELSE. Adding a
  -- value to site_block without extending this CASE makes the constraint
  -- silently accept anything for that block — an unmatched CASE returns NULL,
  -- and a NULL CHECK passes. Extend both, always.
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

-- ════════════════════════════════════════════════════════════════════════════
-- 11. STORAGE BUCKETS                    [0007, 0009, 0023, 0028, 0030, 0032]
-- ════════════════════════════════════════════════════════════════════════════
-- One public/private bucket pair per status-aware content type, plus two
-- always-public buckets for content with no draft state and one private
-- bucket for anonymous feedback screenshots — see CLAUDE.md's "Media buckets
-- are split per content type" bullet. The old shared public-media/
-- public-documents pair (every upload/read/delete action targeted these
-- before the split) was dropped from this baseline by migration 0030 — a
-- fresh environment never creates them, since nothing in the app has read or
-- written them since the split was wired in. An existing environment that
-- still has them keeps the bucket rows and their objects until someone runs
-- scripts/delete-old-media-buckets.mjs by hand; migration 0030 only revokes
-- their public-read policy there.
--
--   news-media / news-drafts                  news photos
--   officials-media / officials-drafts        portraits, achievement photos
--   events-media / events-drafts               event covers
--   announcements-media / announcements-drafts announcement images
--   legislative-media / legislative-drafts     ordinance/resolution PDFs
--   transparency-media / transparency-drafts   transparency documents/projects' files
--   site-media                                 Home/About imagery
--   avatars-media                              staff avatars
--   feedback-media                             PRIVATE. Screenshots attached to anonymous site feedback.
--   ticket-media                               PRIVATE. Files a resident attaches to a ticket reply.
--
-- storage.objects is the ONLY storage table in this schema that gets an RLS
-- policy (see "ARCHITECTURAL POSTURE" above for the other three
-- policy-carrying tables) — public read, so a browser can fetch an uploaded
-- file. There is no anon/authenticated write policy: uploads go through the
-- service-role client, which bypasses RLS, after the Server Action
-- re-checks type and size server-side (never trusting the client).
--
-- The `-drafts` buckets carry no read policy at all, unlike their `-media`
-- counterparts — Supabase Storage's list() rides the same RLS SELECT policy
-- as an individual object GET, so a public-read policy on a bucket also
-- makes it anonymously enumerable. That was the whole reason the per-type
-- split replaced the old shared public-media/public-documents pair (a single
-- "public read" policy each, making every draft/in-review/archived object in
-- them anonymously enumerable too): draft/in-review/archived media now moves
-- to a `-drafts` bucket where only the service-role client can reach it, and
-- gets promoted to its `-media` counterpart on publish.
--
-- Uploads defer to Save: every uploader is a pure file picker making no
-- network calls, and the save action compensating-deletes the object if the
-- row write fails — so "a storage object exists only if a row references it"
-- holds by construction.

insert into storage.buckets (id, name, public, file_size_limit) values
  ('news-media', 'news-media', true, 2097152),
  ('officials-media', 'officials-media', true, 2097152),
  ('events-media', 'events-media', true, 2097152),
  ('announcements-media', 'announcements-media', true, 2097152),
  ('legislative-media', 'legislative-media', true, 10485760),
  ('transparency-media', 'transparency-media', true, 10485760),
  ('site-media', 'site-media', true, 2097152),
  ('avatars-media', 'avatars-media', true, 2097152)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit) values
  ('news-drafts', 'news-drafts', false, 2097152),
  ('officials-drafts', 'officials-drafts', false, 2097152),
  ('events-drafts', 'events-drafts', false, 2097152),
  ('announcements-drafts', 'announcements-drafts', false, 2097152),
  ('legislative-drafts', 'legislative-drafts', false, 10485760),
  ('transparency-drafts', 'transparency-drafts', false, 10485760)
  on conflict (id) do nothing;

-- PRIVATE. A screenshot of the page a resident was looking at can contain
-- their own account page, their ticket, or their name; a public bucket would
-- leave that readable by anyone holding the URL, forever. There is
-- deliberately NO read policy below: the service-role client is the only
-- reader and it mints a short-lived signed URL per page load.
-- allowed_mime_types is set HERE and on ticket-media only, never on the six
-- status-aware pairs above: promoteMedia re-uploads with a possibly-undefined
-- contentType, which a restrictive allow-list would reject, and it fails closed
-- — publishing would break. These two buckets have no lifecycle. [0036]
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('feedback-media', 'feedback-media', false, 2097152,
          array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;

-- PRIVATE, and no read policy at all [0032]. An attachment here is typically a
-- photo of the resident's own ID; Storage's list() rides the same RLS select
-- policy as an individual get(), so a public bucket would make every resident's
-- ID anonymously enumerable. Second private bucket, after feedback-media, for
-- exactly the same reason.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ticket-media', 'ticket-media', false, 2097152,
          array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;

drop policy if exists "public read news-media" on storage.objects;
create policy "public read news-media" on storage.objects
  for select to public using (bucket_id = 'news-media');
drop policy if exists "public read officials-media" on storage.objects;
create policy "public read officials-media" on storage.objects
  for select to public using (bucket_id = 'officials-media');
drop policy if exists "public read events-media" on storage.objects;
create policy "public read events-media" on storage.objects
  for select to public using (bucket_id = 'events-media');
drop policy if exists "public read announcements-media" on storage.objects;
create policy "public read announcements-media" on storage.objects
  for select to public using (bucket_id = 'announcements-media');
drop policy if exists "public read legislative-media" on storage.objects;
create policy "public read legislative-media" on storage.objects
  for select to public using (bucket_id = 'legislative-media');
drop policy if exists "public read transparency-media" on storage.objects;
create policy "public read transparency-media" on storage.objects
  for select to public using (bucket_id = 'transparency-media');
drop policy if exists "public read site-media" on storage.objects;
create policy "public read site-media" on storage.objects
  for select to public using (bucket_id = 'site-media');
drop policy if exists "public read avatars-media" on storage.objects;
create policy "public read avatars-media" on storage.objects
  for select to public using (bucket_id = 'avatars-media');

-- ════════════════════════════════════════════════════════════════════════════
-- 12. SEARCH FUNCTIONS      [0015, 0016, 0017, 0018, 0023, 0024, 0033, 0034]
-- ════════════════════════════════════════════════════════════════════════════

/**
 * True when EVERY whitespace-separated term in p_q matches p_haystack.
 * An empty or null query matches everything.
 *
 * One matching contract, stated once — the JavaScript half is fuzzyFilter() in
 * src/lib/fuzzy.ts and must stay in step. Each term matches by either of two
 * routes, because neither one covers all the required cases:
 *
 *   1. substring        "cert"   -> "certificate"        (prefixes/partials)
 *   2. levenshtein      "offcal" -> "official"           (typos, transpositions)
 *
 * A third route, `word_similarity(term, haystack) >= 0.45`, existed until 0034
 * and is deliberately gone. It was the one place the two halves disagreed, and
 * it answered "Curfew Hours for Minors" to a search for "tax". See 0034 for the
 * measurement and for why the route was removed rather than re-tuned.
 *
 * Levenshtein carries the misspelling case: "offcal" and "official" share only
 * one trigram ("off"), so trigram similarity alone scores them too low. Edit
 * distance sees them as 2 apart. Distance is measured against individual WORDS
 * rather than the whole haystack — against a long concatenated string, the
 * budget needed to accept a transposed surname also accepts unrelated words.
 * (This is why Fuse.js was measured and removed: scoring against the whole
 * haystack, no threshold accepted "sanots" → Santos without also accepting
 * "juan banana" → Juan Dela Cruz.)
 *
 * The substring route uses strpos(), NOT LIKE (fix from 0017). With LIKE, `%`
 * and `_` IN THE USER'S QUERY acted as wildcards: fuzzy_match('anything', '_')
 * returned true, so a one-character search returned the whole table. Not an
 * injection — the term is a bound parameter — but wrong results. strpos has no
 * pattern language, nothing to escape, and is identical to String.includes in
 * src/lib/fuzzy.ts, so both halves agree character for character.
 * Trade-off, stated honestly: a GIN trigram index can serve LIKE '%term%' but
 * not strpos. Those indexes were already unlikely to be chosen (the indexed
 * expression differs from the inlined predicate's) and the tables are small.
 * Whether to drop them belongs to the hardening pass.
 *
 * Deliberately `language sql` and a single SELECT: Postgres inlines such
 * functions into the calling query. A plpgsql body would be a per-row black
 * box and force a sequential scan.
 */
create or replace function public.fuzzy_match(p_haystack text, p_q text)
returns boolean
language sql
stable
as $$
  select
    coalesce(btrim(p_q), '') = ''
    or not exists (
      -- Excluded the moment ONE term fails to match.
      select 1
      from unnest(regexp_split_to_array(lower(btrim(p_q)), '\s+')) as t
      where t <> ''
        and not (
             strpos(lower(coalesce(p_haystack, '')), t) > 0
          or exists (
               select 1
               from regexp_split_to_table(lower(coalesce(p_haystack, '')), '\s+') as w
               where w <> ''
                 and levenshtein(t, w) <= (case when length(t) <= 4 then 1 else 2 end)
             )
        )
    );
$$;

/**
 * Paginated fuzzy search over the audit log.
 *
 * Returns the page's rows plus total_count (a window function over the full
 * match set) so the caller gets rows and pagination in one round trip. This is
 * the one table in the portal that grows without bound, which is why it is
 * server-driven rather than a client manager holding the whole dataset.
 *
 * SECURITY INVOKER (the default) is deliberate: audit_log has RLS enabled with
 * no policies, so this returns nothing for anon/authenticated even if they
 * reach it. Only the service-role client — used behind requireSuperAdmin() —
 * sees rows.
 */
create or replace function public.search_audit_log(
  p_q      text default '',
  p_type   text default null,
  p_sort   text default 'created_at',
  p_dir    text default 'desc',
  p_limit  int  default 10,
  p_offset int  default 0
)
returns table (
  id           bigint,
  actor_name   text,
  action_type  public.audit_action,
  action       text,
  entity_type  text,
  entity_id    text,
  entity_label text,
  detail       text,
  created_at   timestamptz,
  total_count  bigint
)
language plpgsql
stable
as $$
declare
  -- Whitelisted, so format(%I) below cannot be an injection vector even
  -- though p_sort arrives from a URL query string.
  v_sort text := case p_sort
                   when 'actor_name'  then 'actor_name'
                   when 'action_type' then 'action_type'
                   when 'entity_type' then 'entity_type'
                   else 'created_at'
                 end;
  v_dir  text := case when lower(coalesce(p_dir, '')) = 'asc' then 'asc' else 'desc' end;
begin
  return query execute format($sql$
    with candidates as (
      select
        l.*,
        lower(
          l.actor_name || ' ' ||
          coalesce(l.entity_label, '') || ' ' ||
          l.entity_type || ' ' ||
          l.action || ' ' ||
          coalesce(l.entity_id, '')
        ) as haystack
      from public.audit_log l
      where $2 is null or l.action_type = $2::public.audit_action
    )
    select
      c.id, c.actor_name, c.action_type, c.action, c.entity_type,
      c.entity_id, c.entity_label, c.detail, c.created_at,
      count(*) over () as total_count
    from candidates c
    where public.fuzzy_match(c.haystack, $1)
    -- id desc is a stable tiebreak: rows written in one transaction share a
    -- created_at, and without it pagination can repeat or drop rows.
    order by %I %s, c.id desc
    limit $3 offset $4
  $sql$, v_sort, v_dir)
  using p_q, p_type, greatest(p_limit, 1), greatest(p_offset, 0);
end $$;

/**
 * Paginated fuzzy search over PUBLISHED legislative documents, backing
 * /transparency/legislative.
 *
 * The status filter lives here rather than in the caller so the public
 * boundary stays in one place — this function can only ever return rows the
 * public may already read. Rows come newest year first, counting up by
 * sequence within the year (year desc, seq_no asc), since migration 0024.
 */
create or replace function public.search_legislative_documents(
  p_q        text default '',
  p_doc_type text default null,
  p_limit    int  default 10,
  p_offset   int  default 0
)
returns table (
  id              uuid,
  slug            text,
  doc_type        public.legislative_type,
  number          text,
  title           text,
  summary         text,
  date_approved   date,
  file_path       text,
  file_size_bytes int,
  total_count     bigint
)
language sql
stable
as $$
  select
    d.id, d.slug, d.doc_type, d.number, d.title, coalesce(d.summary, '') as summary,
    d.date_approved, d.file_path, d.file_size_bytes,
    count(*) over () as total_count
  from public.legislative_documents d
  where d.status = 'published'
    and (p_doc_type is null or d.doc_type = p_doc_type::public.legislative_type)
    and public.fuzzy_match(
          d.number || ' ' || d.title || ' ' || coalesce(d.summary, ''),
          p_q
        )
  order by d.year desc, d.seq_no asc, d.id desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

/**
 * Global admin search — one round trip across every module the viewer may see,
 * backing AdminGlobalSearch in the top bar.
 *
 * SECURITY: p_modules is the ENTIRE authorization surface of this function.
 * Every branch is gated on `'<module>' = any(p_modules)`, and the caller
 * (globalSearch in src/features/admin/actions/search.ts) builds that array
 * from checkPermission()/checkSuperAdmin() results — never from anything the
 * client sends. A staff member without manage-officials must not learn that an
 * official exists, since /admin/officials is a 404 for them. Passing the
 * allow-list IN rather than filtering results afterwards means the database
 * never even scans a module the viewer cannot open.
 *
 * Unlike the public search functions this one deliberately does NOT filter on
 * status = 'published' — the portal is where drafts and archived records are
 * managed, so they must be findable.
 *
 * KNOWN GAP: inquiries are not covered here. Adding them means editing this
 * function, which is a new migration.
 */
create or replace function public.search_admin_global(
  p_q       text,
  p_modules text[],
  p_limit   int default 5
)
returns table (
  module    text,
  record_id text,
  label     text,
  sublabel  text,
  status    text
)
language sql
stable
as $$
  -- news articles
  ( select 'news'::text, a.id::text, a.title,
           coalesce(c.label, '')::text, a.status::text
    from public.news_articles a
    left join public.news_categories c on c.id = a.category_id
    where 'news' = any (p_modules)
      and public.fuzzy_match(a.title || ' ' || coalesce(c.label, ''), p_q)
    order by a.updated_at desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'announcements'::text, n.id::text, n.title, ''::text, n.status::text
    from public.announcements n
    where 'announcements' = any (p_modules)
      and public.fuzzy_match(n.title, p_q)
    order by n.updated_at desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'events'::text, e.id::text, e.title, e.venue, e.status::text
    from public.events e
    where 'events' = any (p_modules)
      and public.fuzzy_match(e.title || ' ' || e.venue, p_q)
    order by e.event_date desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'officials'::text, o.id::text, o.name, o.role, o.status::text
    from public.officials o
    where 'officials' = any (p_modules)
      and public.fuzzy_match(o.name || ' ' || o.role, p_q)
    order by o.sort_order
    limit greatest(p_limit, 1) )
  union all
  -- Services have no content_status; is_available is the equivalent state.
  ( select 'services'::text, s.id::text, s.title, s.department,
           (case when s.is_available then 'active' else 'inactive' end)::text
    from public.services s
    where 'services' = any (p_modules)
      and public.fuzzy_match(s.title || ' ' || s.department, p_q)
    order by s.sort_order
    limit greatest(p_limit, 1) )
  union all
  ( select 'legislative'::text, l.id::text, l.number || ' — ' || l.title,
           l.doc_type::text, l.status::text
    from public.legislative_documents l
    where 'legislative' = any (p_modules)
      and public.fuzzy_match(l.number || ' ' || l.title || ' ' || coalesce(l.summary, ''), p_q)
    order by l.date_approved desc nulls first
    limit greatest(p_limit, 1) )
  union all
  ( select 'documents'::text, d.id::text, d.title,
           coalesce(tc.label, '')::text, d.status::text
    from public.transparency_documents d
    left join public.transparency_categories tc on tc.id = d.category_id
    where 'documents' = any (p_modules)
      and public.fuzzy_match(d.title || ' ' || coalesce(tc.label, ''), p_q)
    order by d.date_released desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'projects'::text, p.id::text, p.name,
           (p.progress::text || '% complete'), p.status::text
    from public.transparency_projects p
    where 'projects' = any (p_modules)
      and public.fuzzy_match(p.name, p_q)
    order by p.sort_order
    limit greatest(p_limit, 1) )
  union all
  ( select 'applications'::text, ap.id::text, ap.ticket_no,
           (ap.first_name || ' ' || ap.last_name), ap.status
    from public.applications ap
    where 'applications' = any (p_modules)
      -- purpose is coalesced because it is nullable since 0033, and `text ||
      -- null` is NULL in Postgres — an uncoalesced purpose would drop every
      -- application without one out of this search entirely.
      and public.fuzzy_match(
            ap.ticket_no || ' ' || ap.first_name || ' ' ||
            coalesce(ap.middle_name, '') || ' ' || ap.last_name || ' ' ||
            ap.contact_number || ' ' || coalesce(ap.email, '') || ' ' ||
            coalesce(ap.purpose, ''),
            p_q)
    order by ap.created_at desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'appointments'::text, apt.id::text, apt.ticket_no,
           (apt.first_name || ' ' || apt.last_name), apt.status
    from public.appointments apt
    where 'appointments' = any (p_modules)
      and public.fuzzy_match(
            apt.ticket_no || ' ' || apt.first_name || ' ' || apt.last_name || ' ' ||
            apt.contact_number || ' ' || coalesce(apt.email, '') || ' ' || apt.purpose,
            p_q)
    order by apt.created_at desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'complaints'::text, cm.id::text, cm.ticket_no,
           (cm.first_name || ' ' || cm.last_name), cm.status
    from public.complaints cm
    where 'complaints' = any (p_modules)
      and public.fuzzy_match(
            cm.ticket_no || ' ' || cm.first_name || ' ' || cm.last_name || ' ' ||
            cm.contact_number || ' ' || coalesce(cm.email, '') || ' ' ||
            coalesce(cm.respondent, '') || ' ' || cm.location,
            p_q)
    order by cm.created_at desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'assistance'::text, ar.id::text, ar.ticket_no,
           (ar.first_name || ' ' || ar.last_name), ar.status
    from public.assistance_requests ar
    left join public.assistance_categories ac on ac.id = ar.category_id
    where 'assistance' = any (p_modules)
      and public.fuzzy_match(
            ar.ticket_no || ' ' || ar.first_name || ' ' || ar.last_name || ' ' ||
            ar.contact_number || ' ' || coalesce(ar.email, '') || ' ' ||
            coalesce(ac.label, ''),
            p_q)
    order by ar.created_at desc
    limit greatest(p_limit, 1) )
  union all
  -- Feedback has no ticket number and no name: the subject is the label and the
  -- category is the sublabel.
  ( select 'feedback'::text, f.id::text, f.subject, f.category::text, f.status::text
    from public.feedback f
    where 'feedback' = any (p_modules)
      and public.fuzzy_match(f.subject || ' ' || f.message, p_q)
    order by f.created_at desc
    limit greatest(p_limit, 1) );
$$;

-- Every RPC in this codebase is reached through the service-role client behind
-- an explicit code check. search_legislative_documents returns only published
-- rows so exposing it would not leak, but one function opting out of the
-- convention invites the next one to.
revoke execute on function public.fuzzy_match(text, text)
  from public, anon, authenticated;
revoke execute on function public.search_audit_log(text, text, text, text, int, int)
  from public, anon, authenticated;
revoke execute on function public.search_legislative_documents(text, text, int, int)
  from public, anon, authenticated;
revoke execute on function public.search_admin_global(text, text[], int)
  from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 13. SEED — REFERENCE DATA & REAL CONTENT (required)
-- ════════════════════════════════════════════════════════════════════════════
-- Everything in this section is either a picker the app reads at runtime or
-- verified real barangay content. Do not skip it.
--
-- There is deliberately NO demo content. A freshly baselined site comes up with
-- no news articles, no announcements, no events, no legislative documents, no
-- transparency documents and no monitored projects; those sections render their
-- empty states until staff publish through the admin portal. That is intended —
-- launching with placeholder posts is worse than launching with empty feeds.

-- ── Services catalog ────────────────────────────────────────────────────────
insert into public.services
  (id, title, description, icon_name, tone, requirements_label, cta_label, requirements, department, sort_order, flow)
values
  ('barangay-clearance', 'Barangay Clearance',
   'An official document required for various transactions such as employment, business permits, and legal identification.',
   'shield-check', 'primary', 'View Requirements', 'Apply Online',
   array['Latest Community Tax Certificate (Cedula)', 'Recent 2x2 colored ID picture (white background)', 'Application fee: ₱50.00'],
   'Office of the Barangay Secretary', 1, 'apply'),
  ('business-permit', 'Business Permit Recommendation',
   'Necessary for local entrepreneurs to operate legally within the barangay jurisdiction, ensuring compliance with local zoning.',
   'store', 'primary', 'View Requirements', 'Apply Online',
   array['DTI / SEC Registration Papers', 'Contract of Lease or Land Title', 'Locational Clearance'],
   'Office of the Barangay Treasurer', 2, 'apply'),
  ('certificate-of-indigency', 'Certificate of Indigency',
   'Provided to residents needing social welfare assistance, medical aid, or scholarship applications.',
   'heart-handshake', 'primary', 'View Requirements', 'Apply Online',
   array['Voter''s ID or Certification', 'Affidavit of Low Income', 'Referral from DSWD (if applicable)'],
   'Barangay Social Welfare Desk', 3, 'apply'),
  ('blotter-complaints', 'Blotter & Complaints',
   'For reporting neighborhood disputes, peace and order issues, or filing formal grievances for mediation.',
   'gavel', 'danger', 'View Process', 'File Incident Report',
   array['Personal appearance of the complainant', 'Valid Government ID', 'Incident narrative and supporting evidence'],
   'Lupong Tagapamayapa', 4, 'complaint'),
  ('social-services-assistance', 'Social Services Assistance',
   'Medical, burial, financial and calamity aid for residents in need. The Barangay Social Welfare Desk reviews every request.',
   'hand-heart', 'primary', 'What to prepare', 'Request Now',
   array['Valid ID of the person needing help',
         'Barangay Certificate of Indigency, if you already have one',
         'Documents supporting your case (medical abstract, death certificate, damage photos)'],
   'Barangay Social Welfare Desk', 5, 'assistance'),
  ('set-an-appointment', 'Set an Appointment',
   'Reserve a time to meet an official or follow up on a transaction, so you are not waiting at the hall.',
   'calendar-days', 'primary', 'How it works', 'Book Now',
   array['Pick a weekday — the hall is closed on weekends',
         'Tell us what the visit is about',
         'Staff confirm your slot before you come',
         'Bring a valid ID on the day'],
   'Office of the Barangay Secretary', 6, 'appointment');

-- ── Category pickers ────────────────────────────────────────────────────────
insert into public.assistance_categories (id, label, sort_order) values
  ('medical', 'Medical Assistance', 1),
  ('financial', 'Financial Assistance', 2),
  ('burial', 'Burial Assistance', 3),
  ('calamity', 'Calamity Assistance', 4),
  ('other', 'Other Assistance', 5);

insert into public.news_categories (id, label, sort_order) values
  ('governance', 'Governance', 1),
  ('health-wellness', 'Health & Wellness', 2),
  ('environment', 'Environment', 3),
  ('community', 'Community', 4),
  ('public-safety', 'Public Safety', 5),
  ('advisory', 'Advisory', 6),
  ('infrastructure', 'Infrastructure', 7);

insert into public.transparency_categories (id, label, icon_name, sort_order) values
  ('financials', 'Financials', 'receipt', 1),
  ('legislative', 'Legislative', 'gavel', 2),
  ('projects', 'Projects', 'landmark', 3),
  ('awards', 'Awards', 'file-check', 4);

-- ── The 12 officials (real names; bios empty, contacts placeholder-shaped) ──
-- photo_path points at deterministic Storage paths that
-- scripts/upload-official-portraits.mjs populates. RUN THAT SCRIPT.
insert into public.officials
  (slug, name, role, "group", badge, photo_path, photo_alt, term, email, phone, sort_order, status, published_at)
values
  ('dominic-b-dela-cruz', 'Hon. Dominic B. Dela Cruz', 'Punong Barangay', 'executive', null,
   'officials/dominic-b-dela-cruz.jpg', 'Portrait of Punong Barangay Dominic B. Dela Cruz',
   '2023-2026', 'captain@sanfernando.gov.ph', '+63 912 345 6789', 1, 'published', now()),
  ('geroly-b-aggasid', 'Hon. Geroly B. Aggasid', 'Barangay Kagawad', 'council', null,
   'officials/geroly-b-aggasid.png', 'Portrait of Kagawad Geroly B. Aggasid',
   '2023-2026', 'g.aggasid@sanfernando.gov.ph', '(077) 123 4571', 2, 'published', now()),
  ('ronnel-t-paguirigan', 'Hon. Ronnel T. Paguirigan', 'Barangay Kagawad', 'council', null,
   'officials/ronnel-t-paguirigan.png', 'Portrait of Kagawad Ronnel T. Paguirigan',
   '2023-2026', 'r.paguirigan@sanfernando.gov.ph', '(077) 123 4572', 3, 'published', now()),
  ('segundo-t-butay', 'Hon. Segundo T. Butay', 'Barangay Kagawad', 'council', null,
   'officials/segundo-t-butay.png', 'Portrait of Kagawad Segundo T. Butay',
   '2023-2026', 's.butay@sanfernando.gov.ph', '(077) 123 4573', 4, 'published', now()),
  ('noel-a-ribao', 'Hon. Noel A. Ribao', 'Barangay Kagawad', 'council', null,
   'officials/noel-a-ribao.png', 'Portrait of Kagawad Noel A. Ribao',
   '2023-2026', 'n.ribao@sanfernando.gov.ph', '(077) 123 4574', 5, 'published', now()),
  ('ruthsen-faye-m-gonzales', 'Hon. Ruthsen Faye M. Gonzales', 'Barangay Kagawad', 'council', null,
   'officials/ruthsen-faye-m-gonzales.png', 'Portrait of Kagawad Ruthsen Faye M. Gonzales',
   '2023-2026', 'r.gonzales@sanfernando.gov.ph', '(077) 123 4575', 6, 'published', now()),
  ('lydia-b-butay', 'Hon. Lydia B. Butay', 'Barangay Kagawad', 'council', null,
   'officials/lydia-b-butay.png', 'Portrait of Kagawad Lydia B. Butay',
   '2023-2026', 'l.butay@sanfernando.gov.ph', '(077) 123 4576', 7, 'published', now()),
  ('mariene-a-butay', 'Hon. Mariene A. Butay', 'Barangay Kagawad', 'council', null,
   'officials/mariene-a-butay.png', 'Portrait of Kagawad Mariene A. Butay',
   '2023-2026', 'm.butay@sanfernando.gov.ph', '(077) 123 4577', 8, 'published', now()),
  ('jake-b-de-la-cruz', 'Hon. Jake B. De La Cruz', 'SK Chairman', 'council', 'Youth Leader',
   'officials/jake-b-de-la-cruz.png', 'Portrait of SK Chairman Jake B. De La Cruz',
   '2023-2026', 'sk@sanfernando.gov.ph', '(077) 123 4578', 9, 'published', now()),
  ('sharah-mae-r-lagundi', 'Ms. Sharah Mae R. Lagundi', 'Barangay Secretary', 'administration', null,
   'officials/sharah-mae-r-lagundi.png', 'Portrait of Barangay Secretary Sharah Mae R. Lagundi',
   '2023-2026', 'secretary@sanfernando.gov.ph', '(077) 123 4568', 10, 'published', now()),
  ('mariela-a-tolentino', 'Ms. Mariela A. Tolentino', 'Barangay Treasurer', 'administration', null,
   'officials/mariela-a-tolentino.png', 'Portrait of Barangay Treasurer Mariela A. Tolentino',
   '2023-2026', 'treasurer@sanfernando.gov.ph', '(077) 123 4569', 11, 'published', now()),
  ('mary-kaye-a-maltezo', 'Ms. Mary Kaye A. Maltezo', 'Barangay Administrative Assistant', 'administration', null,
   'officials/mary-kaye-a-maltezo.png', 'Portrait of Barangay Administrative Assistant Mary Kaye A. Maltezo',
   '2023-2026', 'admin@sanfernando.gov.ph', '(077) 123 4570', 12, 'published', now());

-- No achievement rows: the barangay has supplied no achievement content yet.
-- Every official's timeline is empty until staff add real entries.

-- ── Site content: Home & About ──────────────────────────────────────────────
-- Applying this must leave both pages identical to the day before. An unseeded
-- schema blanks the front page of a live barangay site.
--
-- The glance figures (1,228 / 248 / 8.95 ha / 7) and the 1733 founding entry
-- were verified against the barangay's Ecological Profile / Barangay
-- Development Plan PDF. They carry no provenance field here and may drift from
-- that source once editors can change them — recorded so a later reader does
-- not mistake the drift for a regression.
--
-- image_path values are populated by scripts/upload-site-images.mjs. RUN IT.

insert into public.site_blocks (key, value) values
  ('about.mission',
   'To promote people participation; To provide a business-friendly environment for business investors; To ensure public safety, peace and order in the community; To sustain a clean and green environment thru intensified clean and green program implementation; and To enhance capability of barangay leaders.'),
  ('about.vision',
   'A progressive, industrialized and business friendly barangay with developed economy, God-loving, united and cooperative citizenry who lives in a peaceful, orderly and ecologically balanced environment under a firm, innovative, transparent, accountable and proactive leadership by 2026.'),
  -- Paragraphs separated by a blank line. These quotes are INVENTED placeholder
  -- content, presented as direct quotes from the real Punong Barangay — flagged
  -- in BACKEND_HANDOFF §6 as needing his real message before launch. They are
  -- in the CMS so replacing them is a five-minute edit, not a deploy.
  ('about.captain_message',
   '“Ang aming pamunuan ay nakatuon sa pagbibigay ng tapat at mabilis na serbisyo para sa lahat. Naniniwala ako na sa pamamagitan ng pagkakaisa at transparency, makakamit natin ang isang mas maunlad at ligtas na barangay.”' || chr(10) || chr(10) ||
   '“It is our honor to serve this historic community. We are modernizing our systems to ensure that no one is left behind in our journey toward a digital and efficient local government. Maraming salamat sa inyong patuloy na pagtitiwala.”'),
  -- Seeded as the existing lh3 hotlink verbatim. The field accepts an uploaded
  -- image, so the first edit removes one hotlink from the codebase.
  ('home.cta_image',
   'https://lh3.googleusercontent.com/aida-public/AB6AXuDdUZq8tdAhUP0f1C3psoNXrr7LYQFX_4T6TL0OjRcM0zwxNFRi3Syn7EBYV9Vh3XhVTmfY_wz2-9d2Gowg6-C4aBHMmP5G3FIkuoLomUFq5cRZ041Bp8nRb9KX4ylWdytodNwOBZeFzuKDGNJ_uoLas3SuyV1tme8Unz0JoXnWTC-6v-BnV5IWyVX70-H0oqLiWjLZFG48zxBKvRdJrr8FEsSWNlhRDeGlLorF3NvaUGRej6MN-GkAhgojKlOmgtHIqPT5eMSs2QY');

-- Hero carousel — real barangay photos.
insert into public.site_items (block, sort_order, image_path, image_alt) values
  ('hero_slides', 0, 'site/hero-certificate.jpg',
   'Certificate recognizing Barangay San Fernando as an Active Clean-up Partner of San Nicolas'),
  ('hero_slides', 1, 'site/hero-organization.jpg',
   'Barangay San Fernando officials and volunteers gathered at the barangay hall'),
  ('hero_slides', 2, 'site/hero-cleaning-operation.jpg',
   'Residents clearing branches during a community clean-up drive'),
  ('hero_slides', 3, 'site/hero-trick-or-treat.jpg',
   'Children in costumes receiving treats during a barangay trick-or-treat event');

-- NOTE: no 'quick_services' rows. 0022 deleted them; the six home-page
-- shortcut cards live in src/features/home/data.ts. Do not add them back.

insert into public.site_items (block, sort_order, icon_name, label, value, body) values
  ('glance_stats', 0, 'users', 'Total Population', '1,228', 'as of 2024'),
  ('glance_stats', 1, 'home', 'Households', '248', 'as of 2024'),
  -- 8.95 ha is correct. The source PDF's own "(0.895 sq. km)" parenthetical is
  -- a decimal error and must not be reintroduced.
  ('glance_stats', 2, 'map', 'Total Land Area', '8.95 ha', null),
  ('glance_stats', 3, 'layout-grid', 'Sitios', '7', 'Active Sitios');

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

-- ════════════════════════════════════════════════════════════════════════════
-- 14. RATE LIMITING                                                      [0029]
-- ════════════════════════════════════════════════════════════════════════════
-- Durable sliding-window limiter backing src/lib/rate-limit.ts. Replaces an
-- earlier in-memory Map, which reset on every redeploy and did not share state
-- across serverless instances — checkRateLimit() now counts rows here instead
-- of a Map, so the limit holds regardless of which instance serves a request
-- or how recently the process restarted. RLS enabled with NO policies, same
-- pattern as every other table — only the service-role client (inside
-- checkRateLimit itself) ever touches this.
--
-- No cleanup job: checkRateLimit() opportunistically deletes rows older than
-- 24 hours on a small random fraction of calls, mirroring the "opportunistic
-- sweep" the old in-memory Map already did once it grew past 5000 keys. This
-- avoids adding a pg_cron dependency for a table that self-limits in size.

create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  key text not null,
  hit_at timestamptz not null default now()
);

-- Every checkRateLimit() call filters by key and a recent hit_at window —
-- this composite index serves both the count and the cleanup delete.
create index rate_limit_hits_key_hit_at_idx
  on public.rate_limit_hits (key, hit_at desc);

alter table public.rate_limit_hits enable row level security;

-- ════════════════════════════════════════════════════════════════════════════
-- 15. AUDIT-LOG IMMUTABILITY                                             [0014]
-- ════════════════════════════════════════════════════════════════════════════
-- LAST ON PURPOSE. Once these exist, no statement — including a future
-- migration, and including one run as the table owner — can update or delete an
-- audit row without deliberately disabling the trigger first:
--
--   alter table public.audit_log disable trigger audit_log_no_update;
--
-- REVOKE stops the roles the application actually uses; the triggers fire even
-- for the table owner, which is what makes this real rather than advisory.
-- Verified against the live database: service_role itself gets
-- "permission denied for table audit_log" on update and delete, while INSERT
-- still works.

revoke update, delete on public.audit_log from anon, authenticated, service_role;

create or replace function public.reject_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only: % is not permitted', tg_op
    using hint = 'Audit records are immutable by design.';
end $$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.reject_audit_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.reject_audit_mutation();

commit;

-- ============================================================================
-- POST-APPLY CHECKLIST
-- ============================================================================
--   1. node scripts/upload-official-portraits.mjs
--   2. node scripts/upload-site-images.mjs
--   3. Create the first SuperAdmin: sign the account up through Supabase Auth,
--      then insert its public.profiles row with is_superadmin = true. Every
--      other account is created from /admin/settings afterwards.
--   4. Confirm all 15 Storage buckets exist: the eight `-media` buckets
--      PUBLIC (what every upload/read/delete action in the app actually
--      targets), the six `-drafts` buckets and feedback-media PRIVATE.
--      A public drafts bucket would expose unpublished content to anyone
--      holding the URL; a public feedback-media would expose residents'
--      screenshots to anyone holding a URL.
--   5. Smoke-test: /, /about, /officials, /services, /transparency,
--      /announcements, the feedback widget, and an /admin login. The content
--      sections will be empty — that is expected, see §13.
--
-- KNOWN GAPS THIS SCHEMA CARRIES FORWARD (see docs/BACKEND_HANDOFF.md §6)
--   • No email anywhere — inquiries, ticket receipts and status updates all
--     end on-screen. Resend (plan 2D) is unbuilt.
--   • alert_subscribers collects numbers; nothing dispatches to them, and the
--     only unsubscribe path is a direct DB edit of is_active/unsubscribed_at.
--   • search_admin_global covers feedback but still does not cover inquiries.
--   • Officials' bios are empty; emails, phones and office hours across the
--     site are placeholder-shaped. The barangay hotline (077) 600 1082 is real.
--   • about.captain_message is invented text presented as the Punong Barangay's
--     own words. Replace before launch.
-- ============================================================================
