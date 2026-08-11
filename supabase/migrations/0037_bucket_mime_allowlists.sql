-- 0037 — MIME allow-lists on the twelve status-aware buckets (hardening backlog B7).
--
-- 0036 deliberately stopped short of these, and said why: copyObjects
-- (src/lib/media-lifecycle.ts) re-uploaded with `contentType: file.type ||
-- undefined`, so a Storage download yielding an untyped blob made Supabase
-- substitute a default that an allow-list would reject — and promoteMedia
-- fails closed, so publishing would have broken in production.
--
-- copyObjects now resolves the type explicitly (sniffed bytes → path extension
-- → blob type), verified against real promote and demote round trips on both
-- an image kind and a document kind before this migration was written. That is
-- the precondition; do not apply this without that code deployed.
--
-- Constrains new uploads only. Existing objects are untouched, and every value
-- below equals what app code already enforces, so no legitimate upload changes
-- behaviour.

-- ALLOWED_IMAGE_TYPES — no PDF: these four kinds store photos only.
update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  where id in ('news-media', 'news-drafts',
               'officials-media', 'officials-drafts',
               'events-media', 'events-drafts',
               'announcements-media', 'announcements-drafts');

-- ALLOWED_DOC_FILE_TYPES — legislative and transparency take PDFs *and*
-- images (a scanned ordinance arrives as either).
update storage.buckets
  set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  where id in ('legislative-media', 'legislative-drafts',
               'transparency-media', 'transparency-drafts');
