import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { AssistanceManager } from "@/features/admin";
import { listAssistanceCategories, listAssistanceRequests } from "@/features/admin/queries/assistance";

export const metadata: Metadata = {
  title: "Assistance Requests",
};

export default async function AdminAssistancePage() {
  await requirePermission("handle-assistance");
  const [requests, categories] = await Promise.all([
    listAssistanceRequests(),
    listAssistanceCategories(),
  ]);
  return <AssistanceManager requests={requests} categories={categories} />;
}
