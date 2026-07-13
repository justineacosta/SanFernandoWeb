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
