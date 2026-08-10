-- 0035_service_flow_and_category_guidance.sql
--
-- Two independent additions, one apply:
--
-- 1. services.flow — routing for a service card was inferred from `tone`
--    ('danger' meant the complaint form, anything else meant the apply form),
--    which conflated a visual property with a behavioural one and had no room
--    for a third destination. `flow` names the destination; `tone` reverts to
--    meaning only what it looks like.
--
--    It names a flow rather than storing an href on purpose: a free-text URL
--    column would let a staff member point a card at a typo, an external site,
--    or a dead route. A CHECK-constrained name can only ever be one of four
--    values the code already knows how to route.
--
--    `not null default` also keeps it out of the `text || null` = NULL trap
--    that made every purpose-less application vanish from admin global search
--    in 0033. search_admin_global's services branch selects title/department
--    only, so it needs no redefinition here.
--
-- 2. assistance_categories.description / .requirements — per-category "what to
--    prepare" guidance on the public assistance form. Both default empty, so
--    every existing category stays valid with no backfill and the form looks
--    exactly as it does today until staff fill them in.

alter table public.services
  add column flow text not null default 'apply'
    check (flow in ('apply', 'complaint', 'assistance', 'appointment'));

update public.services set flow = 'complaint' where tone = 'danger';

alter table public.assistance_categories
  add column description text not null default '',
  add column requirements text[] not null default '{}';

-- The two request flows join the directory. requirements_label and cta_label
-- match labelsForFlow() in src/features/admin/actions/services.ts exactly, so a
-- SuperAdmin save is a no-op rather than a rewrite.
insert into public.services
  (id, title, description, icon_name, tone, requirements_label, cta_label,
   requirements, department, sort_order, flow)
values
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
