-- Middle name and date of birth on the applications flow, plus an optional
-- purpose. Covers the public apply form and the admin walk-in encode drawer. See
-- docs/superpowers/specs/2026-08-05-ticket-resident-name-parts-design.md.
--
-- Applications only. Appointments, complaints and assistance keep the shared
-- residentFields identity block unchanged.
--
-- Both columns are nullable even though birth_date is a REQUIRED form field:
-- every existing row predates it, so `not null` would fail this alter outright.
-- "Required" is enforced in Zod, in both the public schema
-- (src/features/services/schema.ts) and the walk-in schema
-- (src/features/admin/actions/applications.ts) — the same place every other
-- bound on this table lives. address and purpose have no DB-level constraint
-- either, and a check on birth_date written against current_date would not be
-- immutable.
--
-- tickets_view is deliberately NOT extended. It carries only the fields common
-- to all four ticket kinds so type-specific columns cannot leak to /track, and a
-- date of birth is a stronger identifier than anything currently in it.

alter table public.applications
  add column middle_name text,
  add column birth_date date;

-- purpose becomes optional: a counter clerk encoding a walk-in often does not
-- have one, and the resident's own form no longer demands it. Nothing else about
-- the column changes, and existing rows all still carry a value.
alter table public.applications
  alter column purpose drop not null;

comment on column public.applications.middle_name is
  'Optional middle name. NULL when not given — never an empty string.';
comment on column public.applications.birth_date is
  'Required on new rows (enforced in Zod); NULL only on rows predating 0033.';
comment on column public.applications.purpose is
  'Optional since 0033. NULL when not given — never an empty string.';

-- remarks needs no DDL here: it has always been nullable. What changes is the
-- Zod refine in src/features/admin/actions/applications.ts that made it
-- mandatory on a rejection — see §2b of the design spec for the consequences.

-- ── search_admin_global: applications branch ────────────────────────────────
-- REQUIRED, not cosmetic. That function builds each row's search haystack by
-- concatenating columns with ||, and in Postgres `text || null` is NULL — so the
-- moment purpose became nullable, every application without one produced a NULL
-- haystack, fuzzy_match(NULL, q) returned NULL, and the row fell out of the
-- admin global search entirely. Wrapping purpose in coalesce() restores it.
--
-- middle_name joins the haystack at the same time, matching the applications
-- manager's own client-side haystack. The label stays "First Last": it is a
-- one-line dropdown result, and the initial belongs on the queue table.
--
-- Only the applications branch changed; every other branch is verbatim 0018.

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
    limit greatest(p_limit, 1) );
$$;

revoke execute on function public.search_admin_global(text, text[], int)
  from public, anon, authenticated;
