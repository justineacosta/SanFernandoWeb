import type { Metadata } from "next";
import { requireSessionUser } from "@/lib/auth";
import { ContentHub } from "@/features/admin";
import { listRecentActivity } from "@/features/admin/queries/audit";

export const metadata: Metadata = {
  title: "Content Hub",
};

export default async function AdminDashboardPage() {
  const user = await requireSessionUser();
  // Don't even fetch the log for non-SuperAdmins — ContentHub won't render the
  // panel for them, and the rows name modules they may not be permitted to see.
  const entries = user.isSuperAdmin ? await listRecentActivity() : [];
  return <ContentHub activityEntries={entries} />;
}
