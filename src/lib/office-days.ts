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
