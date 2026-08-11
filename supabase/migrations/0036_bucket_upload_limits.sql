-- 0036 — Bucket-level upload ceilings (hardening backlog A3).
--
-- Until now the 3 x 2 MB cap existed ONLY in app code (MAX_TICKET_FILES /
-- MAX_TICKET_FILE_BYTES in src/lib/storage.ts). Supabase Storage can enforce
-- size and MIME at the bucket, which is a second layer that costs nothing and
-- needs no application change.
--
-- Every value below equals what app code already enforces, so no legitimate
-- upload changes behaviour and there is no deploy-order hazard in either
-- direction: this may be applied before or after the code that ships with it.

-- ── Size ceilings: safe on every bucket ──────────────────────────────────────
-- A promoted copy is the same byte count as its source, so file_size_limit
-- cannot break promoteMedia the way allowed_mime_types can (see below).

-- 10 MB — MAX_PDF_BYTES / MAX_DOC_FILE_BYTES. Scanned ordinances run big.
update storage.buckets set file_size_limit = 10485760
  where id in ('legislative-media', 'legislative-drafts',
               'transparency-media', 'transparency-drafts');

-- 2 MB — MAX_IMAGE_BYTES, MAX_SCREENSHOT_BYTES, MAX_TICKET_FILE_BYTES.
update storage.buckets set file_size_limit = 2097152
  where id in ('news-media', 'news-drafts',
               'officials-media', 'officials-drafts',
               'events-media', 'events-drafts',
               'announcements-media', 'announcements-drafts',
               'site-media', 'avatars-media',
               'feedback-media', 'ticket-media');

-- ── MIME allow-lists: ONLY the two pure-ingest private buckets ───────────────
-- Deliberately NOT applied to the six status-aware pairs. promoteMedia
-- (src/lib/media-lifecycle.ts) re-uploads with `contentType: file.type ||
-- undefined`; when that download yields no type, Supabase sends a default that
-- a restrictive allowed_mime_types would REJECT — and promoteMedia fails
-- closed, so publishing would break in production.
--
-- ticket-media and feedback-media have no lifecycle: nothing is ever promoted
-- or demoted between them, so they are pure ingest and safe to restrict.
--
-- Widening this to the status-aware pairs requires making promoteMedia send an
-- explicit contentType first. That is a separate change, not this one.

-- ALLOWED_DOC_FILE_TYPES
update storage.buckets
  set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  where id = 'ticket-media';

-- ALLOWED_IMAGE_TYPES — no PDF: a screenshot is an image.
update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  where id = 'feedback-media';
