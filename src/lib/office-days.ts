/**
 * Whether the barangay hall is closed on a given YYYY-MM-DD date.
 *
 * Weekends only. Public holidays are deliberately out of scope: there is no
 * holiday table in this project and building one is its own feature.
 *
 * Reads the day via getUTCDay(). "2026-08-16" parses as UTC midnight, so the
 * UTC weekday IS the calendar weekday of that date, wherever the server or the
 * browser happens to be; getDay() would shift by one for half the world. Same
 * class of trap that keeps complaintSchema.incidentDate and
 * applicationSchema.birthDate on lexicographic string comparison rather than
 * parsed Dates.
 */
export function isClosedDay(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * The first weekday on or after `iso` (YYYY-MM-DD).
 *
 * Exists because a form defaulting to "today" pre-fills a date its own
 * validation rejects when today is a weekend. Returns the input unchanged on a
 * weekday, so a caller can apply it unconditionally.
 *
 * Same UTC-only arithmetic as isClosedDay above, for the same reason: parsing
 * at UTC midnight makes the UTC weekday the calendar weekday wherever this
 * runs, and setUTCDate() keeps month and year rollover correct without any
 * calendar branching.
 */
export function nextOpenDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}
