-- Cleanup for the media-bucket split (0028): revokes public read on the two
-- old shared buckets, public-media and public-documents. Nothing in the app
-- has read, written, or deleted through them since the split was wired in
-- (verified by grep — src/lib/storage.ts's photoUrl()/documentUrl() and the
-- PUBLIC_MEDIA_BUCKET/PUBLIC_DOCUMENTS_BUCKET constants they used were dead
-- code and removed in the same pass as this migration), so an open
-- public-read policy on them is pure unnecessary exposure — Supabase
-- Storage's list() rides the same RLS SELECT policy as an individual object
-- GET, so this policy also made every object in these two buckets
-- anonymously enumerable, same gap 0028 already closed for every other type.
--
-- This migration does NOT delete the bucket rows or their objects. Deleting
-- a Storage object's underlying blob requires going through the Storage API
-- (supabase.storage.from(bucket).remove()), not a raw SQL delete against
-- storage.objects — a SQL delete would remove the metadata row and orphan
-- the blob in the storage backend. Once every environment has run
-- scripts/migrate-media-buckets.mjs and spot-checked the copies (already
-- done on staging and production, per CLAUDE.md's media-bucket-split
-- bullet), run scripts/delete-old-media-buckets.mjs by hand — staging first,
-- then production — to remove the objects and the buckets themselves.

drop policy if exists "public read public-media" on storage.objects;
drop policy if exists "public read public-documents" on storage.objects;
