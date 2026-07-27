-- Splits the two shared media buckets (public-media, public-documents) into
-- one public/private pair per status-aware content type, plus two simple
-- always-public buckets for content with no draft lifecycle (site, avatars).
--
-- Supabase Storage's list() operation is gated by the same RLS SELECT policy
-- as an individual object GET — there is no way to grant "read one file"
-- without also granting "list every file in the bucket". The existing single
-- `for select to public using (bucket_id = 'public-media')` policy (see
-- 0007_news_content.sql) therefore makes every draft/in-review/archived
-- photo anonymously enumerable, even though the site never links to it.
-- Splitting drafts into a private bucket per type closes that gap.
--
-- This migration only creates buckets and policies. It does not touch any
-- existing table and does not move any existing object — public-media and
-- public-documents keep working exactly as before until a later plan wires
-- the application over to these new buckets and the data-migration script
-- (scripts/migrate-media-buckets.mjs) copies existing objects across. See
-- docs/superpowers/specs/2026-07-27-media-bucket-split-design.md.

-- ── Public buckets: published media only, world-readable ───────────────────
insert into storage.buckets (id, name, public) values
  ('news-media', 'news-media', true),
  ('officials-media', 'officials-media', true),
  ('events-media', 'events-media', true),
  ('announcements-media', 'announcements-media', true),
  ('legislative-media', 'legislative-media', true),
  ('transparency-media', 'transparency-media', true),
  ('site-media', 'site-media', true),
  ('avatars-media', 'avatars-media', true)
  on conflict (id) do nothing;

create policy "public read news-media" on storage.objects
  for select to public using (bucket_id = 'news-media');
create policy "public read officials-media" on storage.objects
  for select to public using (bucket_id = 'officials-media');
create policy "public read events-media" on storage.objects
  for select to public using (bucket_id = 'events-media');
create policy "public read announcements-media" on storage.objects
  for select to public using (bucket_id = 'announcements-media');
create policy "public read legislative-media" on storage.objects
  for select to public using (bucket_id = 'legislative-media');
create policy "public read transparency-media" on storage.objects
  for select to public using (bucket_id = 'transparency-media');
create policy "public read site-media" on storage.objects
  for select to public using (bucket_id = 'site-media');
create policy "public read avatars-media" on storage.objects
  for select to public using (bucket_id = 'avatars-media');

-- ── Private buckets: draft/in-review/archived media, service-role only ─────
-- No read policy, deliberately — same shape as feedback-media (0023). The
-- service-role client (used by every Server Action) bypasses RLS entirely;
-- anonymous and authenticated roles get nothing.
insert into storage.buckets (id, name, public) values
  ('news-drafts', 'news-drafts', false),
  ('officials-drafts', 'officials-drafts', false),
  ('events-drafts', 'events-drafts', false),
  ('announcements-drafts', 'announcements-drafts', false),
  ('legislative-drafts', 'legislative-drafts', false),
  ('transparency-drafts', 'transparency-drafts', false)
  on conflict (id) do nothing;
