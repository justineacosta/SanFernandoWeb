-- Refresh the seed events onto upcoming dates (Plan 3 follow-up).
--
-- 0007 seeded the four demo events with the dates carried over from the old
-- mock data (May–June 2025). Those are in the past, and listUpcomingEvents()
-- correctly filters to event_date >= today, so the home page's "Upcoming
-- Events" column rendered empty — a visible regression against the goal that
-- the site look unchanged on day one.
--
-- The fix is data, not schema: repoint the demo rows to dates relative to when
-- this migration is applied, so the board has content whatever the apply date.
-- These are placeholder events; the barangay replaces them with real ones from
-- /admin/events, after which this migration is inert (it only ever touches the
-- four seeded titles).

update public.events set event_date = current_date + 7
  where title = 'Medical & Dental Mission';

update public.events set event_date = current_date + 12
  where title = 'Youth Leadership Seminar';

update public.events set event_date = current_date + 18
  where title = 'Environment Clean-up Drive';

update public.events set event_date = current_date + 25
  where title = 'Senior Citizens Gathering';
