import type { Metadata } from "next";
import { ContentHub } from "@/features/admin";
import { listRecentActivity } from "@/features/admin/queries/audit";

export const metadata: Metadata = {
  title: "Content Hub",
};

export default async function AdminDashboardPage() {
  const entries = await listRecentActivity();
  return <ContentHub activityEntries={entries} />;
}
