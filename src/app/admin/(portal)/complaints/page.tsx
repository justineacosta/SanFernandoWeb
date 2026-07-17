import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { ComplaintsManager } from "@/features/admin";
import { listComplaints } from "@/features/admin/queries/complaints";

export const metadata: Metadata = {
  title: "Incident Reports",
};

export default async function AdminComplaintsPage() {
  await requirePermission("handle-complaints");
  const complaints = await listComplaints();
  return <ComplaintsManager complaints={complaints} />;
}
