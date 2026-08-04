/**
 * A resident's name as the admin queue tables render it: `First M. Last`.
 *
 * One function rather than a template inlined at each call site, because the
 * middle name is optional in three different ways — null on a row predating
 * migration 0033, "" when the resident skipped the field, and whitespace when
 * they typed a space into it — and every caller would otherwise have to get all
 * three right to avoid rendering `Juan  Cruz` or `Juan . Cruz`.
 *
 * Only an initial, on purpose. The review drawer shows the middle name in full,
 * because that is where staff read the record before issuing a document with
 * the full legal name on it; a queue table is a scanning surface.
 *
 * A multi-word middle name — "Dela Cruz", the common Philippine maternal
 * surname — yields a single initial from its first character, which is the
 * conventional rendering: `Juan D. Cruz`.
 */
export function residentDisplayName(
  firstName: string,
  middleName: string | null | undefined,
  lastName: string,
): string {
  const initial = middleName?.trim().charAt(0);
  return initial
    ? `${firstName} ${initial.toUpperCase()}. ${lastName}`
    : `${firstName} ${lastName}`;
}
