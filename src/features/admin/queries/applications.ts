import type { ApplicationRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";

/**
 * The full applications queue, newest first. Uses the service-role client
 * because `applications` has no RLS policies — callers MUST have checked
 * `requirePermission("process-applications")` first (the page does).
 */
export async function listApplications(): Promise<ApplicationRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("applications")
    .select(
      "id, ticket_no, first_name, last_name, address, contact_number, email, service_id, purpose, status, remarks, reviewed_by_name, reviewed_at, released_by_name, released_at, source, replied_at, created_at, services (title)",
    )
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listApplications failed:", error.message);
    return [];
  }

  return data.map((row) => {
    const service = row.services as unknown as { title: string } | null;
    return {
      id: row.id,
      ticketNo: row.ticket_no,
      firstName: row.first_name,
      lastName: row.last_name,
      address: row.address,
      contactNumber: row.contact_number,
      email: row.email,
      serviceId: row.service_id,
      serviceTitle: service?.title ?? row.service_id,
      purpose: row.purpose,
      status: row.status as ApplicationRow["status"],
      remarks: row.remarks,
      reviewedByName: row.reviewed_by_name,
      releasedByName: row.released_by_name,
      submittedAt: toManilaDate(row.created_at),
      reviewedAt: row.reviewed_at ? toManilaDate(row.reviewed_at) : null,
      releasedAt: row.released_at ? toManilaDate(row.released_at) : null,
      source: row.source as ApplicationRow["source"],
      repliedAt: row.replied_at ? toManilaDate(row.replied_at) : null,
    };
  });
}

/** Application-flow services (primary tone) for the filter and walk-in pickers. */
export async function listApplicationServices(): Promise<{ id: string; title: string }[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, title")
    .eq("tone", "primary")
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listApplicationServices failed:", error.message);
    return [];
  }
  return data;
}
