-- Progressive ticket timeline: uniform under-review/awaiting-info statuses, an
-- append-only ticket_updates log, and a private bucket for resident reply
-- attachments (design 2026-08-02-ticket-timeline-updates-design.md).
--
-- DEPLOY ORDER: apply this BEFORE the matching code. The list queries select
-- replied_at and the drawers write ticket_updates; a missing column fails at
-- runtime, not at build time.

-- ── 1. Widen the four status enums ──────────────────────────────────────────
-- Inline column checks are named <table>_<column>_check by Postgres.

alter table public.applications drop constraint applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('pending','under-review','awaiting-info','approved','released','rejected'));

alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('pending','under-review','awaiting-info','confirmed','completed','declined'));

alter table public.complaints drop constraint complaints_status_check;
alter table public.complaints add constraint complaints_status_check
  check (status in ('received','under-review','awaiting-info','resolved','dismissed'));

alter table public.assistance_requests drop constraint assistance_requests_status_check;
alter table public.assistance_requests add constraint assistance_requests_status_check
  check (status in ('pending','under-review','awaiting-info','granted','declined'));

-- ── 2. replied_at ───────────────────────────────────────────────────────────
-- Set when a resident replies, cleared when staff post their next update. A
-- reply flips the ticket to under-review, which is correctly NOT "untouched
-- work" — so without this column the nav badge would never fire for a reply
-- and staff would learn about it only from an email.

alter table public.applications        add column replied_at timestamptz;
alter table public.appointments        add column replied_at timestamptz;
alter table public.complaints          add column replied_at timestamptz;
alter table public.assistance_requests add column replied_at timestamptz;

create index applications_replied_at_idx        on public.applications (replied_at) where replied_at is not null;
create index appointments_replied_at_idx        on public.appointments (replied_at) where replied_at is not null;
create index complaints_replied_at_idx          on public.complaints (replied_at) where replied_at is not null;
create index assistance_requests_replied_at_idx on public.assistance_requests (replied_at) where replied_at is not null;

-- ── 3. ticket_updates ───────────────────────────────────────────────────────
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

-- ── 4. ticket-media bucket ──────────────────────────────────────────────────
-- PRIVATE, and no read policy at all. An attachment here is typically a photo
-- of the resident's own ID; Storage's list() rides the same RLS select policy
-- as an individual get(), so a public bucket would make every resident's ID
-- anonymously enumerable. Second private bucket in the project, after
-- feedback-media, for exactly the same reason.

insert into storage.buckets (id, name, public)
  values ('ticket-media', 'ticket-media', false)
  on conflict (id) do nothing;

-- ── 5. Backfill ─────────────────────────────────────────────────────────────
-- So no live ticket renders an empty timeline. Each ticket gets an intake row,
-- a row at reviewed_at where non-null, and a row at its stage-2 timestamp where
-- non-null.
--
-- The status on a historical reviewed_at row must be INFERRED: the column was
-- overwritten, so an application now 'released' was 'approved' back then.
--
-- `remarks` goes on the LATEST row written by an action that sets remarks —
-- for applications/appointments that is the reviewed row (release/complete
-- never write remarks); for complaints/assistance it is the close/decide row
-- when one exists, else the reviewed row. `remarks` itself is NOT emptied: it
-- stays the live "latest decision reason" column.

-- Applications
insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, created_at)
  select ticket_no, 'application', 'status', 'pending', '', 'public', 'system', created_at
    from public.applications;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'application', 'status',
         case when status in ('approved','released') then 'approved'
              when status = 'rejected' then 'rejected'
              else status end,
         coalesce(remarks, ''), 'public', 'system', reviewed_by_name, reviewed_at
    from public.applications where reviewed_at is not null;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'application', 'status', 'released', '', 'public', 'system', released_by_name, released_at
    from public.applications where released_at is not null;

-- Appointments
insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, created_at)
  select ticket_no, 'appointment', 'status', 'pending', '', 'public', 'system', created_at
    from public.appointments;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'appointment', 'status',
         case when status in ('confirmed','completed') then 'confirmed'
              when status = 'declined' then 'declined'
              else status end,
         coalesce(remarks, ''), 'public', 'system', reviewed_by_name, reviewed_at
    from public.appointments where reviewed_at is not null;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'appointment', 'status', 'completed', '', 'public', 'system', completed_by_name, completed_at
    from public.appointments where completed_at is not null;

-- Complaints
insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, created_at)
  select ticket_no, 'complaint', 'status', 'received', '', 'public', 'system', created_at
    from public.complaints;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'complaint', 'status',
         case when status in ('under-review','resolved') then 'under-review'
              when status = 'dismissed' and closed_at is null then 'dismissed'
              else 'under-review' end,
         case when closed_at is null then coalesce(remarks, '') else '' end,
         'public', 'system', reviewed_by_name, reviewed_at
    from public.complaints where reviewed_at is not null;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'complaint', 'status', status, coalesce(remarks, ''), 'public', 'system', closed_by_name, closed_at
    from public.complaints where closed_at is not null;

-- Assistance
insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, created_at)
  select ticket_no, 'assistance', 'status', 'pending', '', 'public', 'system', created_at
    from public.assistance_requests;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'assistance', 'status',
         case when status in ('under-review','granted') then 'under-review'
              when status = 'declined' and decided_at is null then 'declined'
              else 'under-review' end,
         case when decided_at is null then coalesce(remarks, '') else '' end,
         'public', 'system', reviewed_by_name, reviewed_at
    from public.assistance_requests where reviewed_at is not null;

insert into public.ticket_updates (ticket_no, ticket_kind, entry_type, status, body, visibility, author_kind, author_name, created_at)
  select ticket_no, 'assistance', 'status', status, coalesce(remarks, ''), 'public', 'system', decided_by_name, decided_at
    from public.assistance_requests where decided_at is not null;
