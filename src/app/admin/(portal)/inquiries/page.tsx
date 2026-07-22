import { gatedMetadata, requirePermission } from "@/lib/auth";
import { InquiriesManager } from "@/features/admin";
import { listInquiries } from "@/features/admin/queries/inquiries";

export const generateMetadata = gatedMetadata("handle-inquiries", "Inquiries");

export default async function AdminInquiriesPage() {
  await requirePermission("handle-inquiries");
  const inquiries = await listInquiries();
  return <InquiriesManager inquiries={inquiries} />;
}
