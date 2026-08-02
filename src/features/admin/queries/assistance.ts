import type { AssistanceCategoryRow, AssistanceRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";

/**
 * The full assistance queue, newest first. Uses the service-role client
 * because `assistance_requests` has no RLS policies — callers MUST have
 * checked `requirePermission("handle-assistance")` first (the page does).
 */
export async function listAssistanceRequests(): Promise<AssistanceRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("assistance_requests")
    .select(
      "id, ticket_no, first_name, last_name, address, contact_number, email, category_id, details, status, remarks, reviewed_by_name, reviewed_at, decided_by_name, decided_at, source, replied_at, created_at, assistance_categories (label)",
    )
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listAssistanceRequests failed:", error.message);
    return [];
  }

  return data.map((row) => {
    const category = row.assistance_categories as unknown as { label: string } | null;
    return {
      id: row.id,
      ticketNo: row.ticket_no,
      firstName: row.first_name,
      lastName: row.last_name,
      address: row.address,
      contactNumber: row.contact_number,
      email: row.email,
      categoryId: row.category_id,
      categoryLabel: category?.label ?? row.category_id,
      details: row.details,
      status: row.status as AssistanceRow["status"],
      remarks: row.remarks,
      reviewedByName: row.reviewed_by_name,
      decidedByName: row.decided_by_name,
      submittedAt: toManilaDate(row.created_at),
      reviewedAt: row.reviewed_at ? toManilaDate(row.reviewed_at) : null,
      decidedAt: row.decided_at ? toManilaDate(row.decided_at) : null,
      source: row.source as AssistanceRow["source"],
      repliedAt: row.replied_at ? toManilaDate(row.replied_at) : null,
    };
  });
}

/**
 * All assistance categories, active and retired, ordered by `sort_order` —
 * the queue's filter needs retired categories too, since retired categories
 * still have historical rows. Distinct from the public
 * `listActiveAssistanceCategories()` in `src/features/assistance/queries.ts`,
 * which filters to active and uses the non-admin client.
 */
export async function listAssistanceCategories(): Promise<AssistanceCategoryRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("assistance_categories")
    .select("id, label, sort_order, is_active")
    .order("sort_order", { ascending: true });
  if (error || !data) {
    if (error) console.error("listAssistanceCategories failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}
