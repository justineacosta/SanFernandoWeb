/** Period label matching the exact copy `/track` already uses for a confirmed slot. */
export function periodLabel(period: "am" | "pm"): string {
  return period === "am" ? "Morning (8:00 AM – 12:00 NN)" : "Afternoon (1:00 PM – 5:00 PM)";
}

/** Truncates long free text for an email body, appending an ellipsis when cut. */
export function excerpt(text: string, maxLen = 200): string {
  const trimmed = text.trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen).trimEnd()}…` : trimmed;
}
