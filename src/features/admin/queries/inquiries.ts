import type { InquiryRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";
import { inquirySubjectLabel } from "@/features/contact/data";

/**
 * The row shape as selected below.
 *
 * `handler` needs the cast: supabase-js types every embedded table as an array,
 * but `handled_by` is a many-to-one foreign key, so PostgREST returns one
 * object — or null once the account is gone.
 */
interface InquiryQueryRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: InquiryRow["status"];
  staff_note: string;
  handled_at: string | null;
  created_at: string;
  handler: { full_name: string } | null;
}

/**
 * The full inquiry inbox, newest first. Uses the service-role client because
 * `inquiries` has no RLS policies — callers MUST have checked
 * `requirePermission("handle-inquiries")` first (the page does).
 *
 * The handler's name comes through the `handled_by` foreign key rather than a
 * denormalised column like the ticket tables' `reviewed_by_name`. Deleting the
 * account nulls it; the audit log keeps the durable record of who did what.
 */
export async function listInquiries(): Promise<InquiryRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("inquiries")
    .select(
      "id, first_name, last_name, email, phone, subject, message, status, staff_note, handled_at, created_at, handler:handled_by (full_name)",
    )
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listInquiries failed:", error.message);
    return [];
  }

  return (data as unknown as InquiryQueryRow[]).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    subjectLabel: inquirySubjectLabel(row.subject),
    message: row.message,
    status: row.status,
    staffNote: row.staff_note,
    handledByName: row.handler?.full_name ?? null,
    handledAt: row.handled_at ? toManilaDate(row.handled_at) : null,
    submittedAt: toManilaDate(row.created_at),
  }));
}
