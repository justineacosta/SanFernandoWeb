/**
 * Escaping helpers for user-supplied values inside PostgREST filter
 * expressions. Extracted from `src/features/transparency/queries.ts` (where
 * this was first worked out and verified against the live database on
 * 2026-07-20) so the audit log search reuses the same proven logic rather
 * than growing a second, subtly different copy.
 */

/**
 * Escape a user search term for a PostgREST `ilike` filter.
 *
 * Two separate hazards, escaped in order:
 *  1. LIKE pattern chars — `%` and `_` are wildcards, `\` is the escape
 *     character. An unescaped `%` matches everything, which is how the same
 *     mistake in /track's surname lookup would have leaked every ticket.
 *     PostgREST *also* treats a bare `*` as an alias for `%` in ilike/like
 *     filter values (its own quoting layer, on top of Postgres LIKE), so `*`
 *     must be escaped to prevent wildcard expansion. When escaped as `\*`,
 *     PostgREST substitutes it to `\%` regardless of the backslash, and
 *     Postgres LIKE (default ESCAPE '\') decodes this as a literal percent
 *     sign. Thus a user searching for a literal `*` matches records with
 *     literal `%` instead — an accepted limitation. The essential property is
 *     that user input cannot expand into a match-everything wildcard, and
 *     this has been verified empirically against the live Supabase project
 *     (2026-07-20).
 *  2. PostgREST filter grammar — `,` `.` `(` `)` and `"` are structural inside
 *     an or() expression. Wrapping the value in double quotes makes them
 *     literal; the quote and backslash themselves then need escaping.
 */
export function ilikePattern(raw: string): string {
  const escaped = raw
    .replace(/\\/g, "\\\\")
    .replace(/[%_*]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

/** Quote a value so PostgREST's filter grammar treats it as a literal. */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}
