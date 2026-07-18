import type { ComplaintRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";

/**
 * The full complaints queue, newest first. Uses the service-role client because
 * `complaints` has no RLS policies — callers MUST have checked
 * `requirePermission("handle-complaints")` first (the page does).
 *
 * This is the only place the narrative and respondent are read. They must never
 * reach /track (spec §3: complaints show status only).
 */
export async function listComplaints(): Promise<ComplaintRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("complaints")
    .select(
      "id, ticket_no, first_name, last_name, address, contact_number, email, respondent, incident_date, location, narrative, status, remarks, reviewed_by_name, reviewed_at, closed_by_name, closed_at, source, created_at",
    )
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listComplaints failed:", error.message);
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
    respondent: row.respondent,
    incidentDate: row.incident_date,
    location: row.location,
    narrative: row.narrative,
    status: row.status as ComplaintRow["status"],
    remarks: row.remarks,
    reviewedByName: row.reviewed_by_name,
    closedByName: row.closed_by_name,
    submittedAt: toManilaDate(row.created_at),
    reviewedAt: row.reviewed_at ? toManilaDate(row.reviewed_at) : null,
    closedAt: row.closed_at ? toManilaDate(row.closed_at) : null,
    source: row.source as ComplaintRow["source"],
  }));
}
