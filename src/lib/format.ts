const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

/** Format an ISO date string as e.g. "May 20, 2025". */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", DATE_FORMAT);
}

/** Split an ISO date into calendar-tile parts, e.g. { month: "MAY", day: "25" }. */
export function toCalendarParts(iso: string): { month: string; day: string } {
  const date = new Date(`${iso}T00:00:00`);
  return {
    month: date
      .toLocaleDateString("en-PH", { month: "short" })
      .toUpperCase(),
    day: date.toLocaleDateString("en-PH", { day: "2-digit" }),
  };
}

/** Format a telephone number into a tel: href. */
export function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

/** Compact count for view totals, e.g. 3400 → "3.4k". */
export function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

/**
 * The Asia/Manila calendar date (YYYY-MM-DD) for a UTC timestamp. Postgres
 * timestamptz values are UTC; slicing them would show the wrong day for
 * anything filed after 4pm Manila. Feed the result to formatDate().
 */
export function toManilaDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/**
 * Today's calendar date in Manila (YYYY-MM-DD). Postgres and the Node runtime
 * are both UTC; a complaint filed at 7am Manila must not be read as yesterday,
 * and an appointment for "today" must not be rejected as past.
 */
export function manilaToday(): string {
  return toManilaDate(new Date().toISOString());
}

/**
 * One year from today in Manila (YYYY-MM-DD) — the far bound for a requested date.
 *
 * Only ever compared with `<=` against another zero-padded YYYY-MM-DD string, so
 * lexicographic ordering is the whole contract; the result is never parsed as a
 * Date. That is why bumping the year alone is safe: on 29 Feb it yields a
 * calendar-invalid "YYYY-02-29", which still sorts correctly and merely narrows
 * the window by a day.
 */
export function manilaTodayNextYear(): string {
  const [year, month, day] = manilaToday().split("-");
  return `${Number(year) + 1}-${month}-${day}`;
}
