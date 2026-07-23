-- Admin polish pass (design doc
-- docs/superpowers/specs/2026-07-22-admin-polish-design.md).
--
-- Two unrelated changes, one sitting of work. They are together because they
-- ship together, not because they relate.
--
-- 1. A fourth officials directory section, below Administration.
-- 2. Quick Services returns to code (spec §5).

-- ── 1. Barangay Members ─────────────────────────────────────────────────────
-- Postgres has permitted ALTER TYPE ... ADD VALUE inside a transaction since
-- 12, but the new label CANNOT BE USED in the same transaction that adds it.
-- This migration therefore only declares it.
--
-- DO NOT add a seed INSERT using 'members' to this file. It will fail with
-- "unsafe use of new value of enum type". A later migration, or the admin UI,
-- is where the first 'members' row comes from.
alter type public.official_group add value 'members';

-- ── 2. Quick Services leaves the CMS ────────────────────────────────────────
-- The six home-page shortcut cards were moved into site_items by 0021. They
-- are a fixed set of links to this site's own routes: they change when the
-- routes change, which is a deploy, not an edit. They are back in
-- src/features/home/data.ts as of this change.
--
-- DOCUMENTED DRIFT: Postgres cannot drop an enum value, so 'quick_services'
-- survives on the site_block enum and as a branch of the site_items_shape
-- CHECK that nothing can now reach. The TypeScript SITE_BLOCKS union in
-- src/types/index.ts NO LONGER MIRRORS this enum exactly, and that is
-- deliberate — recreating the type would mean rewriting the CHECK, the index,
-- and every dependent object to delete six rows.
delete from public.site_items where block = 'quick_services';
