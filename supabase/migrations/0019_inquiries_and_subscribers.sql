-- Contact inquiries and alert subscribers.
--
-- Closes the two "theatre" forms found during the public-side UI/UX survey
-- (docs/superpowers/specs/2026-07-22-public-side-uiux-design.md §2.1): the
-- /contact inquiry form and the newsletter widget both showed a green success
-- message against a setTimeout, with no action, no table, and nowhere for the
-- message to go. A resident writing in was told it was received.
--
-- RLS: enabled with NO policies, exactly like every other table. Writes come
-- from unauthenticated Server Actions using the service-role client with Zod
-- validation and a rate limit; reads go through
-- requirePermission("handle-inquiries"). The code check is the entire gate.

-- ── Inquiries ───────────────────────────────────────────────────────────────

-- Mirrors the ticket lifecycle the four existing queues use, trimmed to what an
-- inquiry actually goes through: it arrives, someone picks it up, it is
-- answered — or it is spam and gets closed without a reply.
create type public.inquiry_status as enum ('new', 'in_progress', 'answered', 'closed');

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  -- The same identity block as the four ticket tables, minus the address: a
  -- question does not need to know where someone lives.
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null default '',
  -- One of INQUIRY_SUBJECTS in src/features/contact/data.ts. Stored as text
  -- rather than an enum so the barangay can add a subject without a migration;
  -- the Server Action validates it against the same list the form renders.
  subject text not null,
  message text not null,
  status public.inquiry_status not null default 'new',
  -- Free-text note staff add when they answer, so the next person can see what
  -- was said without leaving the portal. Not sent to the resident — replying
  -- happens by email or phone until 2D (Resend) lands.
  staff_note text not null default '',
  -- Who last changed the status. Nullable and ON DELETE SET NULL: deleting a
  -- staff account must not delete a resident's inquiry.
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The inbox is worked newest-first and filtered by status, which is exactly
-- this index.
create index inquiries_status_created_idx
  on public.inquiries (status, created_at desc);

alter table public.inquiries enable row level security;

create trigger inquiries_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

-- ── Alert subscribers ───────────────────────────────────────────────────────

create table public.alert_subscribers (
  id uuid primary key default gen_random_uuid(),
  -- Digits only, normalised by the Server Action before insert, so the unique
  -- index below actually catches "0917 555 0101" and "09175550101" as one
  -- person rather than two.
  mobile text not null,
  -- Unsubscribing keeps the row: someone who opts out and is later re-added by
  -- a bulk import should stay opted out.
  is_active boolean not null default true,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index alert_subscribers_mobile_key on public.alert_subscribers (mobile);

alter table public.alert_subscribers enable row level security;
