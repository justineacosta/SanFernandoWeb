import type { AppointmentRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";

/**
 * The full appointments queue, newest first. Uses the service-role client
 * because `appointments` has no RLS policies — callers MUST have checked
 * `requirePermission("process-appointments")` first (the page does).
 */
export async function listAppointments(): Promise<AppointmentRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("appointments")
    .select(
      "id, ticket_no, first_name, last_name, address, contact_number, email, purpose, preferred_date, preferred_period, confirmed_date, confirmed_period, status, remarks, reviewed_by_name, reviewed_at, completed_by_name, completed_at, source, created_at",
    )
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listAppointments failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    ticketNo: row.ticket_no,
    firstName: row.first_name,
    lastName: row.last_name,
    address: row.address,
    contactNumber: row.contact_number,
    email: row.email,
    purpose: row.purpose,
    // `date` columns arrive as YYYY-MM-DD already — pass straight through.
    preferredDate: row.preferred_date,
    preferredPeriod: row.preferred_period as AppointmentRow["preferredPeriod"],
    confirmedDate: row.confirmed_date,
    confirmedPeriod: row.confirmed_period as AppointmentRow["confirmedPeriod"],
    status: row.status as AppointmentRow["status"],
    remarks: row.remarks,
    reviewedByName: row.reviewed_by_name,
    completedByName: row.completed_by_name,
    submittedAt: toManilaDate(row.created_at),
    reviewedAt: row.reviewed_at ? toManilaDate(row.reviewed_at) : null,
    completedAt: row.completed_at ? toManilaDate(row.completed_at) : null,
    source: row.source as AppointmentRow["source"],
  }));
}
