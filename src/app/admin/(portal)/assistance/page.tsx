import { gatedMetadata, requirePermission } from "@/lib/auth";
import { AssistanceManager } from "@/features/admin";
import { listAssistanceCategories, listAssistanceRequests } from "@/features/admin/queries/assistance";

export const generateMetadata = gatedMetadata("handle-assistance", "Assistance Requests");

export default async function AdminAssistancePage() {
  await requirePermission("handle-assistance");
  const [requests, categories] = await Promise.all([
    listAssistanceRequests(),
    listAssistanceCategories(),
  ]);
  return <AssistanceManager requests={requests} categories={categories} />;
}
