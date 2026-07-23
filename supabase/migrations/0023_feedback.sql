-- Site feedback (sub-project 10).
--
-- /contact is for barangay business: it demands a name, an email and a Data
-- Privacy Act consent tick, and its subject list is about documents and
-- assistance. A resident with a note about a dead download link had no channel
-- that fit. This is that channel.
--
-- Anonymous by design: no name, no email, no account link, and the caller's IP
-- is used to rate-limit but never stored. That removes the DPA consent question
-- entirely — there is no personal data here to consent to the processing of.
-- The accepted cost is that staff can never follow up on a report.
--
-- RLS: enabled with NO policies, like every other table. Writes arrive from an
-- unauthenticated Server Action using the service-role client with Zod
-- validation and a rate limit; reads go through
-- requirePermission("handle-inquiries") — the same gate as the inquiry inbox,
-- because the same people work both queues.

create type public.feedback_category as enum ('general', 'bug', 'feature', 'complaint', 'praise');

-- Deliberately NOT the inquiry_status enum. 'answered' would be a lie on a row
-- nobody can answer. These four values are already carried by StatusChip's
-- label and tone maps, so the admin chip needs no edit.
create type public.feedback_status as enum ('new', 'in_progress', 'resolved', 'dismissed');

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

-- ── Storage: PRIVATE feedback-media bucket ──────────────────────────────────
-- Unlike public-media and public-documents, this bucket is private. A
-- screenshot of the page a resident was looking at can contain their own
-- account page, their ticket, or their name; a public bucket would leave that
-- readable by anyone holding the URL, forever. There is deliberately NO read
-- policy: the service-role client is the only reader and it mints a short-lived
-- signed URL per page load.
insert into storage.buckets (id, name, public)
  values ('feedback-media', 'feedback-media', false)
  on conflict (id) do nothing;

-- ── Global admin search: add the feedback branch ────────────────────────────
-- Unchanged from 0018 except for the final union, so a hit on a feedback
-- subject lands on the right tab. p_modules remains the entire authorization
-- surface; the caller builds it from checkPermission() results only.
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
      and public.fuzzy_match(
            ap.ticket_no || ' ' || ap.first_name || ' ' || ap.last_name || ' ' ||
            ap.contact_number || ' ' || coalesce(ap.email, '') || ' ' || ap.purpose,
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

-- Reached only through the service-role client, behind the per-module
-- permission checks in the calling Server Action.
revoke execute on function public.search_admin_global(text, text[], int)
  from public, anon, authenticated;
