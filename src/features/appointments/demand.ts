import type { DemandLabel } from "@/types";

/**
 * Where "Light" becomes "Moderate" and "Moderate" becomes "Busy". Named
 * constants rather than inline numbers so a later tuning pass has something
 * deliberate to change.
 */
const MODERATE_AT = 3;
const BUSY_AT = 6;

/**
 * A coarse label for how many requests already exist for a date and half-day.
 *
 * Coarse on purpose. Showing "4 requests" invites a resident to read 4 as a
 * limit when there is no capacity model behind it, and publishes the barangay's
 * raw operational volume to anyone who loads the page. The label carries the
 * same actionable information — pick a different slot — without either problem.
 *
 * Runs server-side only (`loadAppointmentDemand` applies it before returning),
 * but stays here rather than in `queries.ts`: it is pure, and `@/types` is a
 * type-only import that Vitest's no-jsdom, no-Supabase test environment can
 * still resolve.
 */
export function demandLabel(count: number): DemandLabel {
  if (count >= BUSY_AT) return "Busy";
  if (count >= MODERATE_AT) return "Moderate";
  return "Light";
}
