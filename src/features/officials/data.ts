/**
 * Officials are DB-backed (table `public.officials`, migration 0012) and are
 * edited through /admin/officials — there is no static array here any more.
 * Only the site-level current term survives, for the officials page hero.
 * The 12 bundled portraits in `src/images/officials/` are now the source for
 * `scripts/upload-official-portraits.mjs`, not for the app.
 */
export const TERM_LABEL = "2023-2026";
