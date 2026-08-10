import "server-only";
import type { AppointmentDemand } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { manilaToday } from "@/lib/format";
import { demandLabel } from "@/features/appointments/demand";

/** How far ahead the form offers a demand hint. */
const HORIZON_DAYS = 60;

/**
 * Aggregate request counts for the next HORIZON_DAYS, for the appointment
 * form's busyness hint — reduced to a coarse `DemandLabel` per slot before
 * returning. Only Light/Moderate/Busy ever leaves this function: the return
 * value is a prop threaded straight into a client component and serializes
 * into the RSC payload, so a raw count here would publish the barangay's
 * exact operational volume in page source, not just risk it being rendered.
 *
 * No names, no ticket numbers, no row identity ever leaves the server either.
 * Declined and completed requests are excluded from the tally: neither
 * occupies staff time on the day any more.
 *
 * Tallied in JS rather than via an RPC because 60 days of barangay appointments
 * is a small result set and this needs no new database function to maintain.
 *
 * Uses the service-role client, not the cookie-bound one: `appointments` has
 * RLS enabled with zero policies (like every other write-bearing table — see
 * CLAUDE.md's Architecture section), so an anon-key client here would silently
 * return zero rows for every date instead of erroring, and the hint would never
 * appear. This is the same "deliberately-public action, gates in code instead"
 * carve-out `src/lib/supabase/admin.ts` documents for `lookupTicket`: no
 * permission check guards this read because the only thing it returns is a
 * coarse label, never a row.
 */
export async function loadAppointmentDemand(): Promise<AppointmentDemand> {
  const from = manilaToday();
  const until = new Date(`${from}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + HORIZON_DAYS);
  const to = until.toISOString().slice(0, 10);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("preferred_date, preferred_period")
    .gte("preferred_date", from)
    .lte("preferred_date", to)
    .not("status", "in", "(declined,completed)");
  if (error || !data) {
    // A hint is not worth failing the page over — the form renders without it.
    if (error) console.error("loadAppointmentDemand failed:", error.message);
    return {};
  }

  const counts: Record<string, { am: number; pm: number }> = {};
  for (const row of data) {
    const slot = (counts[row.preferred_date] ??= { am: 0, pm: 0 });
    if (row.preferred_period === "am") slot.am += 1;
    else slot.pm += 1;
  }

  const demand: AppointmentDemand = {};
  for (const [date, count] of Object.entries(counts)) {
    demand[date] = { am: demandLabel(count.am), pm: demandLabel(count.pm) };
  }
  return demand;
}
