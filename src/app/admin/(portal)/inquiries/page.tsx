import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { InquiriesManager } from "@/features/admin";
import { listInquiries } from "@/features/admin/queries/inquiries";

export const metadata: Metadata = {
  title: "Inquiries",
};

export default async function AdminInquiriesPage() {
  await requirePermission("handle-inquiries");
  const inquiries = await listInquiries();
  return <InquiriesManager inquiries={inquiries} />;
}
