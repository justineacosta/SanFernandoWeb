-- Global admin search (sub-project 4, phase C).
--
-- The AdminTopBar search input has been a dead stub since the design export.
-- This backs it with one round trip across every module the viewer may see.
--
-- Why one RPC and not a query per table in the Server Action: a JS-side search
-- would have to load whole tables on every keystroke. That is fine for the
-- twelve officials and four services, but the four ticket flows grow without
-- bound — the same reason the audit log is server-driven (spec §3.4).
--
-- SECURITY: p_modules is the entire authorization surface of this function.
-- Every branch is gated on `'<module>' = any(p_modules)`, and the caller
-- (globalSearch in src/features/admin/actions/search.ts) builds that array from
-- checkPermission() results — never from anything the client sends. A staff
-- member without manage-officials must not learn that an official exists, since
-- sub-project 2 makes /admin/officials a 404 for them. Passing the allow-list
-- in rather than filtering results afterwards means the database never even
-- scans a module the viewer cannot open.
--
-- Unlike the public search functions, this one deliberately does NOT filter on
-- status = 'published' — the admin portal is where drafts and archived records
-- are managed, so they must be findable.

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
    limit greatest(p_limit, 1) );
$$;

-- Reached only through the service-role client, behind the per-module
-- permission checks in the calling Server Action.
revoke execute on function public.search_admin_global(text, text[], int)
  from public, anon, authenticated;
