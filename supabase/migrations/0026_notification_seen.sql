-- Request notifications: a bell's "have I looked?" signal.
--
-- Unhandled counts on the request nav rows need no schema change — every
-- status column notifications reads is already indexed
-- (applications_status_idx, complaints_status_idx, appointments_status_idx,
-- assistance_requests_status_idx, inquiries_status_created_idx,
-- feedback_status_created_idx). Only the bell's dot needs persistence:
-- whether this user has looked since something last arrived.
--
-- Null means "never looked", so a new account's bell is lit on first login —
-- correct, since they genuinely have not seen any of it yet.

alter table public.profiles add column notifications_seen_at timestamptz;

comment on column public.profiles.notifications_seen_at is
  'Stamped by markNotificationsSeen() when the bell dropdown opens. Null means never opened; drives only the bell''s unseen dot, never the nav badge counts.';
